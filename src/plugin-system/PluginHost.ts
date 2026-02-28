import { Plugin, PluginContext, ExtensionHandler } from "./types";

// ==================== 简易事件总线 ====================
class EventEmitter {
  private listeners = new Map<string, Set<Function>>();

  on(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: Function) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, data?: any) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const fn of listeners) {
        fn(data);
      }
    }
  }
}

// ==================== 插件宿主 ====================
export class PluginHost {
  /**
   * 存储所有已注册的插件实例
   * key = plugin.id，value = 插件完整对象
   * 用途：生命周期管理、依赖检查
   */
  private plugins = new Map<string, Plugin>();

  /**
   * 存储每个插件对应的上下文（私有，插件不能互相访问原始 Map）
   * 对外只通过 ctx.getContext(id) 暴露只读视图
   */
  private contexts = new Map<string, PluginContext>();

  /**
   * 扩展点花名册
   * key = 扩展点名称（如 'editor:status-bar'）
   * value = 所有插件注册到该扩展点的 handler 列表（已按 priority 排好序）
   */
  private extensionPoints = new Map<string, ExtensionHandler[]>();

  /**
   * 全局事件总线，所有插件共享
   * 插件通过 context.on / context.emit 通信，不直接访问这个对象
   */
  private eventBus = new EventEmitter();

  /**
   * 钩子系统，供宿主内部流程使用
   * 与 eventBus 的区别：
   *   eventBus → 插件之间通信
   *   hooks    → 宿主在特定流程节点触发的回调（如内容变化通知 autoSave）
   */
  private hooks = new Map<string, Set<Function>>();

  // ==================== 扩展点管理 ====================

  /**
   * 定义一个扩展点（只有宿主能调用）
   * 必须在 activate 插件之前调用，否则插件的 extensions 注册会被忽略
   */
  defineExtensionPoint(name: string) {
    this.extensionPoints.set(name, []);
  }

  /**
   * 触发扩展点，并行收集所有插件的贡献结果
   * 宿主在需要渲染某个"槽位"时调用
   */
  async invokeExtension<T>(point: string, ...args: any[]): Promise<T[]> {
    const handlers = this.extensionPoints.get(point) || [];
    const results = await Promise.all(handlers.map((h) => h.handler(...args)));
    return results as T[];
  }

  // ==================== 插件生命周期 ====================

  /**
   * 注册插件
   * 1. 检查依赖是否已注册
   * 2. 存入 plugins Map
   * 3. 为该插件创建独立的 PluginContext（不含 host 引用，避免越权）
   *
   * 注意：extensions 和 addKeyboardShortcuts 不在 register 时处理，
   * 统一由 activate 负责，这样 deactivate/activate 开关才能正确工作
   */
  async register(plugin: Plugin) {
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Plugin "${plugin.id}" requires "${dep}" but it is not registered yet.`);
        }
      }
    }

    this.plugins.set(plugin.id, plugin);

    // 构造 ctx：
    //   - 不暴露 host 实例（避免插件越权操作宿主内部数据）
    //   - getContext 提供只读的插件间访问通道（参考 Tiptap storage 设计）
    const context: PluginContext = {
      state: new Map(),
      on: this.eventBus.on.bind(this.eventBus),
      off: this.eventBus.off.bind(this.eventBus),
      emit: this.eventBus.emit.bind(this.eventBus),
      getPlugin: (id) => this.plugins.get(id) || null,
      getContext: (id) => this.contexts.get(id) ?? null,
      registerExtension: (point, handler) => {
        const handlers = this.extensionPoints.get(point);
        if (handlers) {
          handlers.push(handler);
          // 按 priority 降序排列，priority 越大越先执行
          handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        }
      },
      config: {},
    };

    this.contexts.set(plugin.id, context);
  }

  /**
   * 激活插件
   * 1. 将插件的 extensions 挂回 extensionPoints 花名册
   * 2. 收集插件声明的 addKeyboardShortcuts，注册到 shortcut 插件
   *    （插件只需声明快捷键，不需要知道 shortcut 插件的存在）
   * 3. 调用插件的 activate 钩子
   */
  async activate(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    const context = this.contexts.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" is not registered.`);
    }

    if (!context) return;

    // 将 extensions 挂回扩展点花名册
    if (plugin.extensions) {
      for (const [point, handler] of Object.entries(plugin.extensions)) {
        context.registerExtension(point, handler);
      }
    }

    // 收集插件声明的快捷键，统一注册到 shortcut 插件
    // 插件不需要依赖 shortcut 插件，也不需要访问它的内部 state
    // 宿主作为协调者，统一处理快捷键注册
    if (plugin.addKeyboardShortcuts) {
      const shortcuts = plugin.addKeyboardShortcuts();
      const shortcutContext = this.contexts.get("shortcut");
      const register = shortcutContext?.state.get("register") as
        | ((key: string, fn: () => void) => void)
        | undefined;

      if (register) {
        for (const [key, fn] of Object.entries(shortcuts)) {
          register(key, fn);
        }
      }
    }

    await plugin.activate?.(context);
  }

  /**
   * 停用插件
   * 1. 调用插件的 deactivate 钩子（清理定时器、事件监听等副作用）
   * 2. 从 extensionPoints 花名册中摘掉该插件的 handler
   *    这样 invokeExtension 就不会再调用它，拉取模式的插件也能正确停用
   */
  async deactivate(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    const context = this.contexts.get(pluginId);

    if (plugin && context) {
      await plugin.deactivate?.(context);

      if (plugin.extensions) {
        for (const [point, extensionHandler] of Object.entries(plugin.extensions)) {
          const handlers = this.extensionPoints.get(point);
          if (handlers) {
            const index = handlers.indexOf(extensionHandler);
            if (index >= 0) handlers.splice(index, 1);
          }
        }
      }
    }
  }

  /**
   * 卸载插件（完整移除）
   * 顺序：deactivate → uninstall → 从 plugins / contexts / extensionPoints 中删除
   */
  async uninstall(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    const context = this.contexts.get(pluginId);

    if (plugin) {
      await plugin.deactivate?.(context);
      await plugin.uninstall?.();

      this.plugins.delete(pluginId);
      this.contexts.delete(pluginId);

      if (plugin.extensions) {
        for (const [point, extensionHandler] of Object.entries(plugin.extensions)) {
          const handlers = this.extensionPoints.get(point);
          if (handlers) {
            const index = handlers.indexOf(extensionHandler);
            if (index >= 0) handlers.splice(index, 1);
          }
        }
      }
    }
  }

  // ==================== 钩子系统 ====================

  onHook(name: string, handler: Function) {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, new Set());
    }
    this.hooks.get(name)!.add(handler);
  }

  async emitHook(name: string, ...args: any[]) {
    const handlers = this.hooks.get(name);
    if (handlers) {
      for (const handler of handlers) {
        await handler(...args);
      }
    }
  }

  // ==================== 工具方法 ====================

  getRegisteredPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  getExtensionPoints(): string[] {
    return Array.from(this.extensionPoints.keys());
  }

  /**
   * 获取指定插件的上下文
   * 供宿主（React 组件）在初始化阶段注册 Ctrl+S 等宿主级快捷键使用
   * 插件之间应通过 context.getContext(id) 访问，而不是调用此方法
   */
  getContext(pluginId: string): PluginContext | null {
    return this.contexts.get(pluginId) ?? null;
  }

  // ==================== 事件总线公开方法（供宿主调用）====================

  emit(event: string, data?: any) {
    this.eventBus.emit(event, data);
  }

  on(event: string, handler: Function) {
    this.eventBus.on(event, handler);
  }

  off(event: string, handler: Function) {
    this.eventBus.off(event, handler);
  }
}
