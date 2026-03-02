import { Plugin, PluginContext, ExtensionHandler } from "./types";

// ==================== 简易事件总线 ====================
type EventHandler<T = unknown> = (data: T) => void;

class EventEmitter {
  private listeners = new Map<string, Set<EventHandler<any>>>();

  on<T = unknown>(event: string, handler: EventHandler<T>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(handler as EventHandler<any>);
  }

  off<T = unknown>(event: string, handler: EventHandler<T>) {
    this.listeners.get(event)?.delete(handler as EventHandler<any>);
  }

  emit<T = unknown>(event: string, data?: T) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const fn of listeners) {
        fn(data);
      }
    }
  }
}

// ==================== SharedContext ====================
// 所有插件共享的方法放在这里，通过原型链继承，内存里只有一份。
// 参考 Tiptap 的 BaseExtension 设计：
//   共享能力（事件、查询插件、注册扩展）→ 原型链
//   私有数据（state、config）           → 实例自身
//
// 与之前"对象字面量"方案的区别：
//   之前：每个插件 register 时都会创建一个新的完整对象，
//         on/off/emit/getPlugin/getContext/registerExtension 这些函数引用
//         在每个 ctx 对象里各自占一份内存。
//   现在：这些方法只在 SharedContext.prototype 上存一份，
//         所有 PluginContextImpl 实例通过原型链共享，零重复。
class SharedContext {
  // host 是 PluginHost 实例，SharedContext 通过它访问内部数据。
  // 注意：这里持有 host 引用，但插件拿到的是 PluginContext 接口，
  // 接口上没有暴露 host，所以插件无法通过 ctx 访问 host。
  // 这与之前 context.host = this 的区别：
  //   之前：host 作为 ctx 的一个公开属性，插件可以随意访问
  //   现在：host 只是 SharedContext 内部的实现细节，对插件不可见
  constructor(protected _host: PluginHost) {}

  // ── 事件总线 ──────────────────────────────────────────────────
  on<T = unknown>(event: string, handler: EventHandler<T>) {
    this._host["eventBus"].on<T>(event, handler);
  }

  off<T = unknown>(event: string, handler: EventHandler<T>) {
    this._host["eventBus"].off<T>(event, handler);
  }

  emit<T = unknown>(event: string, data?: T) {
    this._host["eventBus"].emit<T>(event, data);
  }

  // ── 插件查询 ──────────────────────────────────────────────────
  getPlugin(id: string): Plugin | null {
    return this._host["plugins"].get(id) || null;
  }

  // 获取其他插件的 ctx（只读访问）
  // 这是插件间访问对方暴露的 state API 的正式通道，
  // 替代了之前 context.host.getContext(id) 的越权访问
  getContext(id: string): PluginContext | null {
    return this._host["contexts"].get(id) ?? null;
  }

  // ── 扩展点注册 ────────────────────────────────────────────────
  registerExtension(point: string, handler: ExtensionHandler) {
    const handlers = this._host["extensionPoints"].get(point);
    if (handlers) {
      handlers.push(handler);
      // 按 priority 降序排列，priority 越大越先执行
      handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
  }
}

// ==================== PluginContextImpl ====================
// 每个插件独有的数据（state、config）放在这里。
// 继承 SharedContext，通过原型链拥有所有共享方法，
// 自身只新增 state 和 config 两个属性。
//
// 内存结构：
//   pluginACtx { state: MapA, config: {} }
//               └──__proto__──> SharedContext.prototype { on, off, emit, getPlugin, ... }
//   pluginBCtx { state: MapB, config: {} }
//               └──__proto__──> SharedContext.prototype（同一个，共享）
//
// 相比之前的对象字面量方案，每个插件节省了 6 个函数引用的内存。
// 插件数量越多，收益越大。
class PluginContextImpl extends SharedContext implements PluginContext {
  state = new Map<string, any>();
  config: Record<string, any> = {};

  constructor(host: PluginHost) {
    super(host);
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
   * 存储每个插件对应的 PluginContextImpl
   * key = plugin.id，value = 该插件专属的 ctx 实例
   * 插件的 state / config 存在各自的实例上，
   * 共享方法通过原型链访问 SharedContext.prototype
   */
  private contexts = new Map<string, PluginContextImpl>();

  /**
   * 扩展点花名册
   * key = 扩展点名称（如 'editor:status-bar'）
   * value = 所有插件注册到该扩展点的 handler 列表（已按 priority 排好序）
   *
   * 与 plugins 的区别：
   *   plugins         → 按"插件维度"组织，管插件的身份和生命周期
   *   extensionPoints → 按"功能位置维度"组织，管某个槽位下有哪些实现
   */
  private extensionPoints = new Map<string, ExtensionHandler[]>();

  /**
   * 全局事件总线，所有插件共享
   * 插件通过 context.on / context.emit 访问，不能直接操作这个对象
   * SharedContext 内部通过 this._host["eventBus"] 访问
   */
  private eventBus = new EventEmitter();

  /**
   * 钩子系统，供宿主内部流程使用
   * 与 eventBus 的区别：
   *   eventBus → 插件之间通信
   *   hooks    → 宿主在特定流程节点触发的回调（顺序执行，等待每个完成）
   */
  private hooks = new Map<string, Set<EventHandler>>();

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
   * 3. 创建 PluginContextImpl 实例（共享方法走原型链，私有数据在实例上）
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

    // 每个插件只创建一个极小的 PluginContextImpl 实例：
    //   - state / config → 实例自身（插件独有）
    //   - on/off/emit 等 → 原型链上的 SharedContext.prototype（所有插件共享一份）
    const context = new PluginContextImpl(this);
    this.contexts.set(plugin.id, context);
  }

  /**
   * 激活插件
   * 1. 将插件的 extensions 挂回 extensionPoints 花名册
   * 2. 收集插件声明的 addKeyboardShortcuts，统一注册到 shortcut 插件
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
    // PluginHost 作为协调者，统一处理快捷键注册（参考 Tiptap addKeyboardShortcuts 设计）
    if (plugin.addKeyboardShortcuts) {
      const shortcuts = plugin.addKeyboardShortcuts();
      const shortcutCtx = this.contexts.get("shortcut");
      const register = shortcutCtx?.state.get("register") as
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

  onHook(name: string, handler: EventHandler) {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, new Set());
    }
    this.hooks.get(name)?.add(handler);
  }

  async emitHook<T = unknown>(name: string, data?: T) {
    const handlers = this.hooks.get(name);
    if (handlers) {
      for (const handler of handlers) {
        await handler(data);
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
   * 获取指定插件的 ctx（供宿主在初始化阶段使用）
   * 例如宿主注册 Ctrl+S 这种"宿主级快捷键"时需要访问 shortcut 插件的 state
   * 插件之间应通过 context.getContext(id) 访问，而不是调用此方法
   */
  getContext(pluginId: string): PluginContext | null {
    return this.contexts.get(pluginId) ?? null;
  }

  // ==================== 事件总线公开方法（供宿主调用）====================

  emit<T = unknown>(event: string, data?: T) {
    this.eventBus.emit<T>(event, data);
  }

  on<T = unknown>(event: string, handler: EventHandler<T>) {
    this.eventBus.on<T>(event, handler);
  }

  off<T = unknown>(event: string, handler: EventHandler<T>) {
    this.eventBus.off<T>(event, handler);
  }
}
