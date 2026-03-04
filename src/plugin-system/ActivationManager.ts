// ==================== ActivationManager ====================
//
// 对标 VS Code 的 ExtensionActivationService / ActivationEventsReader：
// - 监听激活事件（onStartup / onCommand / onEvent）
// - 匹配已安装插件的 activationEvents，触发懒加载
// - 通过 dynamic import() 加载插件代码
// - 管理激活队列，防止重复激活
//
// VS Code 的激活事件参考：
// https://code.visualstudio.com/api/references/activation-events
//
// 我们的 Demo 支持以下激活事件：
// - "onStartup"              — 宿主启动时立即激活
// - "*"                      — 等同于 onStartup（VS Code 不推荐，但支持）
// - "onCommand:xxx"          — 当命令 xxx 被调用时激活
// - "onEvent:xxx"            — 当事件 xxx 触发时激活
//
// 设计原则：
// - ActivationManager 只管「触发时机」和「代码加载」
// - 不管权限、沙箱、API 注入（由 PluginHost 协调其他模块完成）
// - 插件代码加载后，通知 PluginHost 完成后续的 activate 流程
//
// 与 PluginRegistry 的关系：
// | PluginRegistry                      | ActivationManager                   |
// |-------------------------------------|--------------------------------------|
// | 管理 Manifest + 状态 + PluginEntry   | 管理激活事件监听 + 触发加载            |
// | 提供 getByActivationEvent 查询       | 调用 registry 查询匹配的插件           |
// | 存储已加载的 PluginEntry             | 负责 dynamic import 并把结果存到 registry |

import type { PluginManifest, PluginEntry, Disposable } from "./manifest-types";
import type { PluginRegistry } from "./PluginRegistry";

// ==================== 类型定义 ====================

/**
 * 激活请求回调
 *
 * ActivationManager 在需要激活某个插件时调用此回调，
 * 由 PluginHost 提供实现（负责沙箱创建、API 注入、调用 entry.activate 等）
 *
 * @param pluginId 需要激活的插件 ID
 * @param reason   触发激活的原因（如 "onStartup", "onCommand:translate.translateSelection"）
 * @returns Promise<void> 激活完成
 */
export type ActivatePluginCallback = (
  pluginId: string,
  reason: string
) => Promise<void>;

/**
 * 插件代码加载器
 *
 * 默认实现使用 dynamic import()，但可替换为其他方式（如从 Worker 加载）
 *
 * @param manifest 插件 Manifest
 * @returns 加载的插件入口对象
 */
export type PluginLoader = (manifest: PluginManifest) => Promise<PluginEntry>;

/**
 * 激活事件类型
 */
export type ActivationEventType = "onStartup" | "onCommand" | "onEvent" | "wildcard";

/**
 * 解析后的激活事件
 */
export interface ParsedActivationEvent {
  /** 原始字符串 */
  raw: string;
  /** 事件类型 */
  type: ActivationEventType;
  /** 事件参数（如 onCommand:xxx 中的 xxx） */
  argument?: string;
}

/**
 * 激活结果
 */
export interface ActivationResult {
  pluginId: string;
  success: boolean;
  reason: string;
  error?: string;
  duration: number;
}

// ==================== ActivationManager 主类 ====================

/**
 * ActivationManager — 激活事件管理器
 *
 * 职责：
 * 1. 解析插件的 activationEvents
 * 2. 监听宿主事件，匹配需要激活的插件
 * 3. 通过 dynamic import() 加载插件代码
 * 4. 通知 PluginHost 完成激活流程
 * 5. 管理待处理的命令调用（命令触发激活后需要重放命令）
 *
 * 不负责：
 * - 创建 Worker 沙箱（WorkerSandbox 的职责）
 * - 注入 API（APIProxy 的职责）
 * - 权限检查（PermissionGuard 的职责）
 * - 调用 pluginEntry.activate()（PluginHost 协调完成）
 */
export class ActivationManager {
  /**
   * PluginRegistry 引用（查询待激活的插件）
   */
  private registry: PluginRegistry;

  /**
   * 激活回调（由 PluginHost 提供）
   */
  private activateCallback: ActivatePluginCallback | null = null;

  /**
   * 插件代码加载器
   */
  private loader: PluginLoader;

  /**
   * 正在激活中的插件（防止重复触发）
   * key = pluginId
   */
  private activating: Map<string, Promise<void>> = new Map();

  /**
   * 待处理的命令调用队列
   *
   * 场景：用户调用了一个命令，但对应的插件尚未激活。
   * ActivationManager 先触发插件激活，激活完成后重放命令。
   *
   * key = commandId, value = { resolve, reject, args }
   */
  private pendingCommands: Map<
    string,
    Array<{
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      args: unknown[];
    }>
  > = new Map();

  /**
   * 已触发过的事件记录（用于判断 onEvent 是否已经触发过）
   */
  private firedEvents: Set<string> = new Set();

  /**
   * 激活历史记录
   */
  private activationHistory: ActivationResult[] = [];

  /**
   * 事件监听的清理函数
   */
  private disposables: Disposable[] = [];

  /**
   * 是否已启动
   */
  private started: boolean = false;

  constructor(
    registry: PluginRegistry,
    options?: {
      loader?: PluginLoader;
    }
  ) {
    this.registry = registry;
    this.loader = options?.loader ?? defaultPluginLoader;
  }

  // ==================== 初始化 ====================

  /**
   * 设置激活回调
   *
   * 由 PluginHost 在初始化时调用，提供激活流程的完整实现
   */
  setActivateCallback(callback: ActivatePluginCallback): void {
    this.activateCallback = callback;
  }

  /**
   * 设置自定义加载器
   *
   * 可替换默认的 dynamic import() 加载器，
   * 例如用于 Worker 模式下从 Blob URL 加载
   */
  setLoader(loader: PluginLoader): void {
    this.loader = loader;
  }

  // ==================== 启动/停止 ====================

  /**
   * 启动激活管理器
   *
   * 触发 onStartup 和 * 类型的激活事件
   *
   * @returns 启动时激活的插件结果列表
   */
  async start(): Promise<ActivationResult[]> {
    if (this.started) {
      console.warn("[ActivationManager] Already started.");
      return [];
    }

    this.started = true;
    const results: ActivationResult[] = [];

    // 查找所有 onStartup 和 * 的插件
    const startupPlugins = [
      ...this.registry.getByActivationEvent("onStartup"),
      ...this.registry.getByActivationEvent("*"),
    ];

    // 去重（同一个插件可能同时声明了 onStartup 和 *）
    const seen = new Set<string>();
    const uniquePlugins = startupPlugins.filter((entry) => {
      if (seen.has(entry.manifest.id)) return false;
      seen.add(entry.manifest.id);
      return true;
    });

    // 并发激活所有 onStartup 插件
    const activationPromises = uniquePlugins.map(async (entry) => {
      const result = await this.triggerActivation(entry.manifest.id, "onStartup");
      results.push(result);
    });

    await Promise.allSettled(activationPromises);

    return results;
  }

  /**
   * 停止激活管理器
   *
   * 清理所有事件监听，取消待处理的命令
   */
  stop(): void {
    this.started = false;

    // 清理所有事件监听
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    // 拒绝所有待处理的命令
    for (const [commandId, waiters] of this.pendingCommands) {
      for (const waiter of waiters) {
        waiter.reject(
          new Error(
            `[ActivationManager] Activation manager stopped. ` +
            `Pending command "${commandId}" was cancelled.`
          )
        );
      }
    }
    this.pendingCommands.clear();
    this.activating.clear();
  }

  // ==================== 激活事件触发 ====================

  /**
   * 触发 onCommand 激活事件
   *
   * 当用户调用一个命令，但对应的插件尚未激活时调用。
   * ActivationManager 会：
   * 1. 查找 activationEvents 中包含 "onCommand:<commandId>" 的插件
   * 2. 触发插件激活
   * 3. 激活完成后，将命令调用加入待处理队列等待重放
   *
   * @param commandId 命令 ID
   * @param args      命令参数
   * @returns 命令执行结果（可能需要等待插件激活完成）
   */
  async triggerOnCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    const activationEvent = `onCommand:${commandId}`;

    // 查找需要激活的插件
    const plugins = this.registry.getByActivationEvent(activationEvent);

    if (plugins.length === 0) {
      // 没有插件响应此命令的激活事件
      // 可能插件已经激活了，或者根本没有插件处理此命令
      return undefined;
    }

    // 激活所有匹配的插件
    const activationPromises = plugins.map((entry) =>
      this.triggerActivation(entry.manifest.id, activationEvent)
    );

    await Promise.allSettled(activationPromises);

    // 激活完成后，返回一个标记让调用方知道可以重新执行命令了
    // 实际的命令执行由 PluginHost.executeCommand 处理
    return { __activated: true, commandId };
  }

  /**
   * 触发 onEvent 激活事件
   *
   * 当宿主事件总线上触发了某个事件时调用。
   * ActivationManager 会查找 activationEvents 中包含 "onEvent:<eventName>" 的插件。
   *
   * @param eventName 事件名（如 "editor:selection-change"）
   */
  async triggerOnEvent(eventName: string): Promise<ActivationResult[]> {
    const activationEvent = `onEvent:${eventName}`;

    // 防止同一个事件重复触发激活
    if (this.firedEvents.has(activationEvent)) {
      return [];
    }
    this.firedEvents.add(activationEvent);

    const plugins = this.registry.getByActivationEvent(activationEvent);
    if (plugins.length === 0) {
      return [];
    }

    const results: ActivationResult[] = [];
    const activationPromises = plugins.map(async (entry) => {
      const result = await this.triggerActivation(entry.manifest.id, activationEvent);
      results.push(result);
    });

    await Promise.allSettled(activationPromises);

    return results;
  }

  /**
   * 手动触发指定插件的激活
   *
   * 用于：
   * - 调试时手动激活某个插件
   * - 插件管理 UI 中的"启用"按钮
   *
   * @param pluginId 插件 ID
   * @param reason   激活原因
   * @returns 激活结果
   */
  async activatePlugin(pluginId: string, reason: string = "manual"): Promise<ActivationResult> {
    return this.triggerActivation(pluginId, reason);
  }

  // ==================== 插件代码加载 ====================

  /**
   * 加载插件代码
   *
   * 通过 loader 函数（默认是 dynamic import()）加载插件的入口文件
   *
   * @param manifest 插件 Manifest
   * @returns 加载的 PluginEntry
   */
  async loadPluginCode(manifest: PluginManifest): Promise<PluginEntry> {
    return this.loader(manifest);
  }

  // ==================== 核心激活流程 ====================

  /**
   * 触发单个插件的激活流程
   *
   * 流程：
   * 1. 检查插件是否已激活或正在激活（防重复）
   * 2. 加载插件代码（dynamic import）
   * 3. 将 PluginEntry 存入 PluginRegistry
   * 4. 调用 activateCallback（由 PluginHost 实现后续流程）
   * 5. 记录激活结果
   *
   * @param pluginId 插件 ID
   * @param reason   激活原因
   * @returns 激活结果
   */
  private async triggerActivation(
    pluginId: string,
    reason: string
  ): Promise<ActivationResult> {
    const startTime = Date.now();

    // 1. 检查插件是否存在
    const entry = this.registry.get(pluginId);
    if (!entry) {
      const result: ActivationResult = {
        pluginId,
        success: false,
        reason,
        error: `Plugin "${pluginId}" is not installed.`,
        duration: Date.now() - startTime,
      };
      this.activationHistory.push(result);
      return result;
    }

    // 2. 检查是否已激活
    if (entry.state === "active") {
      return {
        pluginId,
        success: true,
        reason,
        duration: 0,
      };
    }

    // 3. 检查是否正在激活（防重复）
    const existing = this.activating.get(pluginId);
    if (existing) {
      try {
        await existing;
        return {
          pluginId,
          success: true,
          reason,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        return {
          pluginId,
          success: false,
          reason,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        };
      }
    }

    // 4. 开始激活流程
    const activationPromise = this.doActivation(pluginId, reason);
    this.activating.set(pluginId, activationPromise);

    try {
      await activationPromise;
      const result: ActivationResult = {
        pluginId,
        success: true,
        reason,
        duration: Date.now() - startTime,
      };
      this.activationHistory.push(result);
      return result;
    } catch (error) {
      const result: ActivationResult = {
        pluginId,
        success: false,
        reason,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
      this.activationHistory.push(result);
      return result;
    } finally {
      this.activating.delete(pluginId);
    }
  }

  /**
   * 执行实际的激活流程
   */
  private async doActivation(pluginId: string, reason: string): Promise<void> {
    const entry = this.registry.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin "${pluginId}" is not installed.`);
    }

    // 先激活依赖（如果依赖尚未激活）
    if (entry.manifest.dependencies && entry.manifest.dependencies.length > 0) {
      for (const depId of entry.manifest.dependencies) {
        const depEntry = this.registry.get(depId);
        if (depEntry && depEntry.state !== "active") {
          await this.triggerActivation(depId, `dependency:${pluginId}`);
        }
      }
    }

    // 更新状态为 activating
    this.registry.setState(pluginId, "activating");
    this.registry.setActivationReason(pluginId, reason);

    try {
      // 加载插件代码（如果尚未加载）
      if (!entry.entry) {
        const pluginEntry = await this.loadPluginCode(entry.manifest);
        this.registry.setEntry(pluginId, pluginEntry);
      }

      // 调用激活回调（由 PluginHost 实现）
      if (this.activateCallback) {
        await this.activateCallback(pluginId, reason);
      }

      // 更新状态为 active
      this.registry.setState(pluginId, "active");
    } catch (error) {
      // 激活失败，更新状态为 error
      this.registry.setState(pluginId, "error");
      throw error;
    }
  }

  // ==================== 查询接口 ====================

  /**
   * 获取插件的激活事件列表（解析后）
   */
  getActivationEvents(pluginId: string): ParsedActivationEvent[] {
    const entry = this.registry.get(pluginId);
    if (!entry) return [];

    return entry.manifest.activationEvents.map(parseActivationEvent);
  }

  /**
   * 查找响应指定激活事件的插件 ID 列表
   *
   * @param event 激活事件字符串（如 "onCommand:translate.translateSelection"）
   * @returns 匹配的插件 ID 列表
   */
  findPluginsForEvent(event: string): string[] {
    return this.registry.getByActivationEvent(event).map((e) => e.manifest.id);
  }

  /**
   * 查找响应指定命令的插件 ID
   *
   * @param commandId 命令 ID
   * @returns 匹配的插件 ID，如果没有匹配则返回 null
   */
  findPluginForCommand(commandId: string): string | null {
    const event = `onCommand:${commandId}`;
    const plugins = this.registry.getByActivationEvent(event);
    return plugins.length > 0 ? plugins[0].manifest.id : null;
  }

  /**
   * 检查插件是否正在激活中
   */
  isActivating(pluginId: string): boolean {
    return this.activating.has(pluginId);
  }

  /**
   * 获取激活历史记录
   */
  getActivationHistory(): ActivationResult[] {
    return [...this.activationHistory];
  }

  /**
   * 清空激活历史
   */
  clearHistory(): void {
    this.activationHistory = [];
  }

  // ==================== 待处理命令管理 ====================

  /**
   * 添加待处理命令
   *
   * 当命令触发激活时，调用方可以等待命令被执行。
   *
   * @param commandId 命令 ID
   * @param args      命令参数
   * @returns Promise，在插件激活且命令执行后 resolve
   */
  addPendingCommand(
    commandId: string,
    args: unknown[]
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.pendingCommands.has(commandId)) {
        this.pendingCommands.set(commandId, []);
      }
      this.pendingCommands.get(commandId)!.push({ resolve, reject, args });
    });
  }

  /**
   * 获取并清空指定命令的待处理调用
   *
   * 由 PluginHost 在插件激活完成后调用，
   * 重放（replay）这些被延迟的命令调用
   */
  takePendingCommands(
    commandId: string
  ): Array<{ resolve: (result: unknown) => void; reject: (error: Error) => void; args: unknown[] }> {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return [];
    this.pendingCommands.delete(commandId);
    return pending;
  }

  /**
   * 获取所有有待处理命令的命令 ID 列表
   */
  getPendingCommandIds(): string[] {
    return Array.from(this.pendingCommands.keys());
  }

  // ==================== 生命周期 ====================

  /**
   * 销毁激活管理器
   */
  dispose(): void {
    this.stop();
    this.activationHistory = [];
    this.firedEvents.clear();
  }

  // ==================== 调试/诊断 ====================

  /**
   * 获取激活管理器的诊断信息
   */
  getDiagnostics(): ActivationManagerDiagnostics {
    return {
      started: this.started,
      activatingCount: this.activating.size,
      activatingPlugins: Array.from(this.activating.keys()),
      pendingCommandCount: this.pendingCommands.size,
      pendingCommands: Array.from(this.pendingCommands.entries()).map(
        ([commandId, waiters]) => ({
          commandId,
          waiterCount: waiters.length,
        })
      ),
      firedEvents: Array.from(this.firedEvents),
      activationHistory: this.activationHistory.map((r) => ({
        pluginId: r.pluginId,
        success: r.success,
        reason: r.reason,
        duration: r.duration,
        error: r.error,
      })),
    };
  }
}

// ==================== 工具函数 ====================

/**
 * 解析激活事件字符串
 *
 * 支持的格式：
 * - "onStartup"                             → { type: "onStartup" }
 * - "*"                                     → { type: "wildcard" }
 * - "onCommand:translate.translateSelection" → { type: "onCommand", argument: "translate.translateSelection" }
 * - "onEvent:editor:selection-change"        → { type: "onEvent", argument: "editor:selection-change" }
 */
export function parseActivationEvent(event: string): ParsedActivationEvent {
  if (event === "*") {
    return { raw: event, type: "wildcard" };
  }

  if (event === "onStartup") {
    return { raw: event, type: "onStartup" };
  }

  const colonIndex = event.indexOf(":");
  if (colonIndex === -1) {
    // 未知格式，当作 onStartup 处理
    return { raw: event, type: "onStartup" };
  }

  const prefix = event.slice(0, colonIndex);
  const argument = event.slice(colonIndex + 1);

  switch (prefix) {
    case "onCommand":
      return { raw: event, type: "onCommand", argument };
    case "onEvent":
      return { raw: event, type: "onEvent", argument };
    default:
      // 未知前缀，当作 onEvent 处理
      return { raw: event, type: "onEvent", argument: event };
  }
}

/**
 * 默认的插件代码加载器
 *
 * 使用 dynamic import() 加载插件的入口文件
 *
 * 注意事项：
 * - 路径解析依赖于打包工具（Webpack / Vite 等）
 * - 在开发环境下，main 路径是相对于 src/plugin-system/ 的
 * - 在 Worker 模式下，需要替换为 Blob URL 或其他方式
 *
 * @param manifest 插件 Manifest
 * @returns 加载的 PluginEntry
 */
async function defaultPluginLoader(manifest: PluginManifest): Promise<PluginEntry> {
  try {
    // dynamic import 路径
    // manifest.main 示例: "./plugins/translate/index.ts"
    // 实际路径需要根据项目结构调整
    const module = await import(/* webpackIgnore: true */ manifest.main);

    // 插件入口可以是 default export 或 named export
    const entry: PluginEntry = module.default ?? module;

    // 校验入口对象
    if (typeof entry.activate !== "function") {
      throw new Error(
        `Plugin "${manifest.id}" entry does not export an activate function. ` +
        `The main file "${manifest.main}" must export { activate(api) {} }.`
      );
    }

    return entry;
  } catch (error) {
    throw new Error(
      `[ActivationManager] Failed to load plugin "${manifest.id}" from "${manifest.main}": ` +
      `${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ==================== 诊断类型 ====================

export interface ActivationManagerDiagnostics {
  started: boolean;
  activatingCount: number;
  activatingPlugins: string[];
  pendingCommandCount: number;
  pendingCommands: Array<{ commandId: string; waiterCount: number }>;
  firedEvents: string[];
  activationHistory: Array<{
    pluginId: string;
    success: boolean;
    reason: string;
    duration: number;
    error?: string;
  }>;
}
