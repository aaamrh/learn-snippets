// ==================== APIProxy ====================
//
// 对标 VS Code 的 Extension Host API 实现层：
// - 为每个插件创建独立的 PluginAPI 实例
// - 实现 PluginAPI 接口的所有方法（editor / commands / statusBar / events / storage）
// - 宿主侧的「真实实现」，不涉及 Worker 通信（Worker 模式由 WorkerSandbox 在此之上封装）
//
// 架构关系：
//   插件代码 → PermissionGuard(guardedAPI) → APIProxy(realAPI) → 宿主状态/DOM
//
// 与其他模块的关系：
// | 模块                | 职责                               |
// |--------------------|------------------------------------|
// | APIProxy           | PluginAPI 的真实实现（直接操作宿主）   |
// | PermissionGuard    | 包装 APIProxy，拦截未授权调用         |
// | WorkerSandbox      | 在 Worker 中序列化 API 调用（可选层）  |
// | ContributionManager| 命令注册/执行的底层存储               |
// | PluginHost         | 创建 APIProxy 并组装完整链路          |
//
// 设计原则：
// - 每个插件一个 APIProxy 实例（通过 pluginId 隔离 storage、statusBar 等）
// - 所有编辑器操作都是异步的（统一接口，方便未来切换到 Worker 模式）
// - 所有订阅操作都返回 Disposable（方便 deactivate 时批量清理）
// - APIProxy 不做权限检查（由 PermissionGuard 负责）

import type {
  PluginAPI,
  EditorAPI,
  CommandsAPI,
  StatusBarAPI,
  EventsAPI,
  StorageAPI,
  ConfigurationAPI,
  ViewsAPI,
  TreeDataProvider,
  Disposable,
  SelectionInfo,
} from "./manifest-types";
import type { ContributionManager } from "./ContributionManager";
import type { ConfigurationService } from "./ConfigurationService";

// ==================== 宿主能力接口 ====================

/**
 * EditorBridge — 编辑器桥接接口
 *
 * APIProxy 通过此接口与宿主编辑器通信，
 * 而不是直接操作 DOM 或 React state。
 *
 * 宿主（page.tsx）在初始化时提供此接口的实现。
 *
 * 对标 VS Code 的 MainThreadTextEditor：
 * Extension Host 中的 API 调用通过 IPC 转发到 Main Thread，
 * 由 MainThreadTextEditor 操作真正的编辑器。
 *
 * 我们的简化版本：APIProxy 直接调用 EditorBridge，
 * EditorBridge 由宿主实现，封装对 contenteditable / textarea 的操作。
 */
export interface EditorBridge {
  /** 在光标位置插入文字 */
  insertText(text: string): void;

  /** 替换当前选中的文字 */
  replaceSelection(text: string): void;

  /** 获取当前选中的文字 */
  getSelectedText(): string;

  /** 获取编辑器全部内容 */
  getContent(): string;

  /** 获取当前选区信息（包含位置矩形，用于浮动工具条定位） */
  getSelectionInfo(): SelectionInfo | null;
}

/**
 * EventBusBridge — 事件总线桥接接口
 *
 * APIProxy 通过此接口与宿主事件总线通信。
 * 隔离插件对事件总线的直接访问。
 */
export interface EventBusBridge {
  /** 监听事件 */
  on(event: string, handler: (...args: unknown[]) => void): void;

  /** 取消监听 */
  off(event: string, handler: (...args: unknown[]) => void): void;

  /** 触发事件 */
  emit(event: string, ...args: unknown[]): void;
}

// ==================== APIProxy 配置 ====================

/**
 * 创建 APIProxy 所需的配置
 */
export interface APIProxyConfig {
  /** 插件 ID（用于隔离 storage、事件命名等） */
  pluginId: string;

  /** 编辑器桥接 */
  editor: EditorBridge;

  /** 事件总线桥接 */
  eventBus: EventBusBridge;

  /** 贡献点管理器（用于命令注册/执行） */
  contributionManager: ContributionManager;

  /** Storage 前缀（默认 "plugin-storage:"） */
  storagePrefix?: string;

  /** 选区变化事件名（默认 "editor:selection-change"） */
  selectionChangeEvent?: string;

  /** 配置服务（可选，用于 ConfigurationAPI） */
  configurationService?: ConfigurationService;
}

// ==================== APIProxy 工厂函数 ====================

/**
 * 创建 PluginAPI 实例
 *
 * 为指定插件创建完整的 PluginAPI 实现。
 * 每个插件有独立的实例，通过 pluginId 隔离 storage 等数据。
 *
 * @param config 配置
 * @returns { api, disposables } — PluginAPI 实例和所有内部创建的 Disposable
 */
export function createPluginAPI(config: APIProxyConfig): {
  api: PluginAPI;
  disposables: Disposable[];
} {
  const disposables: Disposable[] = [];

  const editorAPI = createEditorAPI(config, disposables);
  const commandsAPI = createCommandsAPI(config, disposables);
  const statusBarAPI = createStatusBarAPI(config);
  const eventsAPI = createEventsAPI(config, disposables);
  const storageAPI = createStorageAPI(config);
  const configurationAPI = createConfigurationAPI(config, disposables);
  const viewsAPI = createViewsAPI(config, disposables);

  const api: PluginAPI = {
    editor: editorAPI,
    commands: commandsAPI,
    statusBar: statusBarAPI,
    events: eventsAPI,
    storage: storageAPI,
    configuration: configurationAPI,
    views: viewsAPI,
  };

  return { api, disposables };
}

// ==================== EditorAPI 实现 ====================

function createEditorAPI(config: APIProxyConfig, disposables: Disposable[]): EditorAPI {
  const { editor, eventBus } = config;
  const selectionChangeEvent = config.selectionChangeEvent ?? "editor:selection-change";

  return {
    async insertText(text: string): Promise<void> {
      editor.insertText(text);
    },

    async replaceSelection(text: string): Promise<void> {
      editor.replaceSelection(text);
    },

    async getSelectedText(): Promise<string> {
      return editor.getSelectedText();
    },

    async getContent(): Promise<string> {
      return editor.getContent();
    },

    onSelectionChange(handler: (selection: SelectionInfo) => void): Disposable {
      // 包装 handler，过滤出 SelectionInfo 类型的事件数据
      const wrappedHandler = (...args: unknown[]) => {
        const selectionInfo = args[0] as SelectionInfo | undefined;
        if (selectionInfo) {
          handler(selectionInfo);
        }
      };

      eventBus.on(selectionChangeEvent, wrappedHandler);

      const disposable: Disposable = {
        dispose: () => {
          eventBus.off(selectionChangeEvent, wrappedHandler);
        },
      };

      disposables.push(disposable);
      return disposable;
    },
  };
}

// ==================== CommandsAPI 实现 ====================

function createCommandsAPI(config: APIProxyConfig, disposables: Disposable[]): CommandsAPI {
  const { contributionManager } = config;

  return {
    registerCommand(id: string, handler: (...args: unknown[]) => unknown): Disposable {
      const disposable = contributionManager.registerCommandHandler(id, handler);
      disposables.push(disposable);
      return disposable;
    },

    async executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
      return contributionManager.executeCommand(id, ...args);
    },
  };
}

// ==================== StatusBarAPI 实现 ====================

function createStatusBarAPI(config: APIProxyConfig): StatusBarAPI {
  const { contributionManager } = config;

  return {
    update(id: string, content: { label: string; value?: string; icon?: string }): void {
      contributionManager.updateStatusBarContent(id, content);
    },

    remove(id: string): void {
      contributionManager.removeStatusBarContent(id);
    },

    setTooltip(id: string, text: string): void {
      contributionManager.setStatusBarTooltip(id, text);
    },

    setColor(id: string, color: string): void {
      contributionManager.setStatusBarColor(id, color);
    },

    setBackgroundColor(id: string, color: string): void {
      contributionManager.setStatusBarBackgroundColor(id, color);
    },

    setCommand(id: string, commandId: string): void {
      contributionManager.setStatusBarCommand(id, commandId);
    },
  };
}

// ==================== EventsAPI 实现 ====================

function createEventsAPI(config: APIProxyConfig, disposables: Disposable[]): EventsAPI {
  const { eventBus, pluginId } = config;

  // 记录此插件注册的所有事件监听，方便 deactivate 时清理
  const registeredListeners: Array<{
    event: string;
    handler: (...args: unknown[]) => void;
  }> = [];

  return {
    on(event: string, handler: (...args: unknown[]) => void): Disposable {
      eventBus.on(event, handler);
      registeredListeners.push({ event, handler });

      const disposable: Disposable = {
        dispose: () => {
          eventBus.off(event, handler);
          const index = registeredListeners.findIndex(
            (l) => l.event === event && l.handler === handler,
          );
          if (index >= 0) {
            registeredListeners.splice(index, 1);
          }
        },
      };

      disposables.push(disposable);
      return disposable;
    },

    emit(event: string, ...args: unknown[]): void {
      // 为了安全，给事件名加上插件 ID 前缀（可选策略）
      // 这里不加前缀，让插件可以与其他插件通信
      // 但记录来源方便调试
      eventBus.emit(event, ...args);
    },
  };
}

// ==================== StorageAPI 实现 ====================

/**
 * StorageAPI 实现
 *
 * 使用 localStorage 作为底层存储（简化方案）。
 * 每个插件的 key 都带有 pluginId 前缀，实现存储隔离。
 *
 * 对标 VS Code 的 ExtensionContext.globalState：
 * ```ts
 * context.globalState.get('myKey');
 * context.globalState.update('myKey', 'value');
 * ```
 *
 * key 格式: `${storagePrefix}${pluginId}:${key}`
 * 例如: `plugin-storage:translate:lastTranslation`
 */
function createStorageAPI(config: APIProxyConfig): StorageAPI {
  const { pluginId } = config;
  const prefix = config.storagePrefix ?? "plugin-storage:";

  const makeKey = (key: string): string => `${prefix}${pluginId}:${key}`;

  return {
    async get(key: string): Promise<unknown> {
      try {
        const fullKey = makeKey(key);

        // 优先使用 localStorage
        if (typeof localStorage !== "undefined") {
          const raw = localStorage.getItem(fullKey);
          if (raw === null) return undefined;
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        }

        // Fallback: 内存存储（SSR 环境或 Worker 中 localStorage 不可用时）
        return memoryStorage.get(fullKey);
      } catch {
        return undefined;
      }
    },

    async set(key: string, value: unknown): Promise<void> {
      try {
        const fullKey = makeKey(key);
        const serialized = JSON.stringify(value);

        if (typeof localStorage !== "undefined") {
          localStorage.setItem(fullKey, serialized);
        } else {
          memoryStorage.set(fullKey, value);
        }
      } catch (error) {
        console.error(
          `[APIProxy] Storage.set failed for plugin "${pluginId}", key "${key}":`,
          error,
        );
      }
    },
  };
}

/**
 * 内存存储（localStorage 不可用时的 fallback）
 */
const memoryStorage = new Map<string, unknown>();

// ==================== ConfigurationAPI 实现 ====================

function createConfigurationAPI(
  config: APIProxyConfig,
  disposables: Disposable[],
): ConfigurationAPI {
  const { pluginId, configurationService } = config;

  return {
    get<T>(key: string): T {
      if (!configurationService) {
        console.warn(
          `[APIProxy] ConfigurationService not available for plugin "${pluginId}". Returning undefined.`,
        );
        return undefined as T;
      }
      return configurationService.get<T>(pluginId, key);
    },

    update(key: string, value: unknown): void {
      if (!configurationService) {
        console.warn(
          `[APIProxy] ConfigurationService not available for plugin "${pluginId}". Ignoring update.`,
        );
        return;
      }
      configurationService.update(pluginId, key, value);
    },

    onDidChange(key: string, handler: (newValue: unknown) => void): Disposable {
      if (!configurationService) {
        // 返回空 Disposable
        return { dispose: () => {} };
      }
      const disposable = configurationService.onDidChange(pluginId, key, handler);
      disposables.push(disposable);
      return disposable;
    },
  };
}

// ==================== ViewsAPI 实现 ====================

function createViewsAPI(config: APIProxyConfig, disposables: Disposable[]): ViewsAPI {
  const { contributionManager } = config;

  return {
    registerTreeDataProvider(viewId: string, provider: TreeDataProvider): Disposable {
      const disposable = contributionManager.registerTreeDataProvider(viewId, provider);
      disposables.push(disposable);
      return disposable;
    },

    refreshView(viewId: string): void {
      contributionManager.refreshView(viewId);
    },
  };
}

// ==================== 工具函数 ====================

/**
 * 创建一个空的 EditorBridge（用于测试或无编辑器场景）
 *
 * 所有方法都是 no-op，不会抛出错误
 */
export function createNoopEditorBridge(): EditorBridge {
  return {
    insertText(): void {
      // no-op
    },
    replaceSelection(): void {
      // no-op
    },
    getSelectedText(): string {
      return "";
    },
    getContent(): string {
      return "";
    },
    getSelectionInfo(): SelectionInfo | null {
      return null;
    },
  };
}

/**
 * 创建一个简单的事件总线（用于测试或不需要复杂事件系统的场景）
 */
export function createSimpleEventBus(): EventBusBridge {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    on(event: string, handler: (...args: unknown[]) => void): void {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
    },

    off(event: string, handler: (...args: unknown[]) => void): void {
      listeners.get(event)?.delete(handler);
    },

    emit(event: string, ...args: unknown[]): void {
      const handlers = listeners.get(event);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(...args);
          } catch (error) {
            console.error(`[EventBus] Error in handler for event "${event}":`, error);
          }
        }
      }
    },
  };
}

/**
 * 创建一个基于 contenteditable 元素的 EditorBridge
 *
 * 将 contenteditable div 或 textarea 包装为 EditorBridge 接口。
 * 宿主在 page.tsx 中使用此函数创建 EditorBridge 实例。
 *
 * @param getElement 获取编辑器 DOM 元素的函数（延迟求值，支持 ref）
 * @returns EditorBridge 实例
 */
export function createContentEditableBridge(getElement: () => HTMLElement | null): EditorBridge {
  return {
    insertText(text: string): void {
      const el = getElement();
      if (!el) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        // 没有选区，追加到末尾
        el.textContent = (el.textContent ?? "") + text;
        return;
      }

      // 在光标位置插入文字
      const range = selection.getRangeAt(0);

      // 确保 range 在编辑器内
      if (!el.contains(range.commonAncestorContainer)) {
        el.textContent = (el.textContent ?? "") + text;
        return;
      }

      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);

      // 移动光标到插入文字之后
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);

      // 触发 input 事件（让 React 感知变化）
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },

    replaceSelection(text: string): void {
      const el = getElement();
      if (!el) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);

      // 确保 range 在编辑器内
      if (!el.contains(range.commonAncestorContainer)) return;

      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);

      // 选中替换后的文字
      range.setStartBefore(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);

      el.dispatchEvent(new Event("input", { bubbles: true }));
    },

    getSelectedText(): string {
      const el = getElement();
      if (!el) return "";

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return "";

      const range = selection.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return "";

      return selection.toString();
    },

    getContent(): string {
      const el = getElement();
      if (!el) return "";
      return el.textContent ?? "";
    },

    getSelectionInfo(): SelectionInfo | null {
      const el = getElement();
      if (!el) return null;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return null;

      const range = selection.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return null;

      const text = selection.toString();
      if (!text) return null;

      const rect = range.getBoundingClientRect();

      // 计算 start/end 偏移量（相对于编辑器元素的文本内容）
      const preSelectionRange = document.createRange();
      preSelectionRange.selectNodeContents(el);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const start = preSelectionRange.toString().length;

      return {
        text,
        start,
        end: start + text.length,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      };
    },
  };
}

/**
 * 创建一个基于 textarea 的 EditorBridge
 *
 * @param getElement 获取 textarea 元素的函数
 * @returns EditorBridge 实例
 */
export function createTextareaBridge(getElement: () => HTMLTextAreaElement | null): EditorBridge {
  return {
    insertText(text: string): void {
      const el = getElement();
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const value = el.value;

      el.value = value.slice(0, start) + text + value.slice(end);
      el.selectionStart = el.selectionEnd = start + text.length;

      el.dispatchEvent(new Event("input", { bubbles: true }));
    },

    replaceSelection(text: string): void {
      const el = getElement();
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const value = el.value;

      el.value = value.slice(0, start) + text + value.slice(end);
      el.selectionStart = start;
      el.selectionEnd = start + text.length;

      el.dispatchEvent(new Event("input", { bubbles: true }));
    },

    getSelectedText(): string {
      const el = getElement();
      if (!el) return "";

      return el.value.slice(el.selectionStart, el.selectionEnd);
    },

    getContent(): string {
      const el = getElement();
      if (!el) return "";
      return el.value;
    },

    getSelectionInfo(): SelectionInfo | null {
      const el = getElement();
      if (!el) return null;

      const start = el.selectionStart;
      const end = el.selectionEnd;

      if (start === end) return null;

      const text = el.value.slice(start, end);

      // textarea 的选区位置矩形比较难精确获取，
      // 使用 textarea 自身的 bounding rect 作为近似值
      const elRect = el.getBoundingClientRect();

      // 粗略估算选区位置（基于字符位置和行高）
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const charWidth = 8; // 粗略估算
      const textBefore = el.value.slice(0, start);
      const lines = textBefore.split("\n");
      const currentLine = lines.length - 1;
      const currentCol = lines[lines.length - 1].length;

      return {
        text,
        start,
        end,
        rect: {
          top: elRect.top + currentLine * lineHeight - el.scrollTop,
          left: elRect.left + currentCol * charWidth - el.scrollLeft,
          width: Math.min(text.length * charWidth, elRect.width),
          height: lineHeight,
        },
      };
    },
  };
}
