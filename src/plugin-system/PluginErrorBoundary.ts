// ==================== PluginErrorBoundary ====================
//
// 插件错误边界 — 记录插件运行时错误，超过阈值自动停用，支持手动重试。
//
// 解决的问题：
// - 之前插件崩溃时，错误分散在各处 try-catch 中（NewPluginHost / ActivationManager / page.tsx），
//   没有统一的错误记录和自动恢复策略。
// - 一个插件反复崩溃时，没有自动停用机制，会持续产生错误日志。
// - Worker 崩溃后没有重启策略。
//
// 设计原则：
// - 每个插件独立计数，互不影响
// - 连续错误超过阈值自动停用（可配置阈值）
// - 支持手动 reset 后重试激活
// - 提供完整的错误历史供诊断面板展示
// - 不直接操作 PluginHost，通过回调解耦
//
// 与其他模块的关系：
// | 模块              | 关系                                              |
// |-------------------|---------------------------------------------------|
// | NewPluginHost     | 集成 PluginErrorBoundary，在 catch 块中调用 recordError |
// | WorkerSandbox     | Worker onerror 时通过 PluginHost 报告给 ErrorBoundary |
// | page.tsx          | 读取 ErrorBoundary 诊断信息渲染错误面板             |
// | DisposableStore   | ErrorBoundary 本身可作为 Disposable 清理             |
//
// 使用方式：
// ```ts
// const errorBoundary = new PluginErrorBoundary({
//   maxConsecutiveErrors: 3,
//   onAutoDisable: (pluginId, errors) => {
//     host.deactivatePlugin(pluginId);
//     addLog("error", `插件 "${pluginId}" 因连续 ${errors.length} 次错误被自动停用`);
//   },
// });
//
// // 在 catch 块中记录错误
// try {
//   await host.executeCommand(commandId);
// } catch (error) {
//   errorBoundary.recordError(pluginId, error, "command", commandId);
// }
//
// // 用户手动重试
// errorBoundary.reset(pluginId);
// await host.activatePlugin(pluginId);
// ```

import type { Disposable } from "./manifest-types";

// ==================== 错误记录类型 ====================

/**
 * 单条插件错误记录
 */
export interface PluginErrorRecord {
  /** 发生错误的插件 ID */
  pluginId: string;

  /** 错误对象 */
  error: Error;

  /** 错误消息（error.message 的快照，方便序列化） */
  message: string;

  /** 错误发生的上下文 */
  context: PluginErrorContext;

  /** 可选：触发错误的命令 ID */
  commandId?: string;

  /** 可选：触发错误的事件名 */
  eventName?: string;

  /** 时间戳 */
  timestamp: number;

  /** 错误堆栈（error.stack 的快照） */
  stack?: string;
}

/**
 * 错误发生的上下文类型
 */
export type PluginErrorContext =
  | "activation"       // 插件激活阶段
  | "deactivation"     // 插件停用阶段
  | "command"          // 命令执行阶段
  | "event"            // 事件处理阶段
  | "worker-crash"     // Worker 进程崩溃
  | "worker-timeout"   // Worker 响应超时
  | "api-call"         // API 调用阶段
  | "unknown";         // 未分类

// ==================== 插件错误状态 ====================

/**
 * 每个插件的错误统计状态
 */
interface PluginErrorState {
  /** 连续错误次数（成功操作后重置为 0） */
  consecutiveErrors: number;

  /** 总错误次数 */
  totalErrors: number;

  /** 是否已被自动停用 */
  autoDisabled: boolean;

  /** 自动停用的时间戳 */
  autoDisabledAt: number | null;

  /** 错误历史（最近 N 条） */
  history: PluginErrorRecord[];

  /** 最后一次错误的时间戳 */
  lastErrorAt: number | null;

  /** 最后一次成功操作的时间戳 */
  lastSuccessAt: number | null;

  /** Worker 重启次数（仅 Worker 模式） */
  workerRestartCount: number;
}

// ==================== 配置 ====================

/**
 * PluginErrorBoundary 配置
 */
export interface PluginErrorBoundaryConfig {
  /**
   * 连续错误阈值，超过此数则自动停用插件
   * 默认 3
   */
  maxConsecutiveErrors: number;

  /**
   * 每个插件的错误历史最大条数
   * 默认 50
   */
  maxHistoryPerPlugin: number;

  /**
   * 全局错误历史最大条数
   * 默认 200
   */
  maxGlobalHistory: number;

  /**
   * Worker 最大重启次数（超过后不再自动重启）
   * 默认 3
   */
  maxWorkerRestarts: number;

  /**
   * Worker 重启间隔递增基数（毫秒）
   * 第 N 次重启等待 baseRestartDelay * N 毫秒
   * 默认 1000
   */
  baseRestartDelay: number;

  /**
   * 自动停用回调
   *
   * 当插件因连续错误被自动停用时调用。
   * PluginErrorBoundary 不直接操作 PluginHost，
   * 而是通过此回调通知外部执行停用操作。
   */
  onAutoDisable?: (pluginId: string, errors: PluginErrorRecord[]) => void;

  /**
   * 错误记录回调
   *
   * 每次记录错误时调用，可用于实时更新 UI。
   */
  onError?: (record: PluginErrorRecord) => void;

  /**
   * Worker 重启请求回调
   *
   * 当 ErrorBoundary 判断应该重启 Worker 时调用。
   * 外部负责实际的 Worker 销毁和重建。
   *
   * @param pluginId 需要重启 Worker 的插件 ID
   * @param attempt  第几次重启（从 1 开始）
   * @returns 重启是否成功
   */
  onWorkerRestartRequest?: (pluginId: string, attempt: number) => Promise<boolean>;
}

// ==================== 事件类型 ====================

/**
 * PluginErrorBoundary 发出的事件
 */
export type PluginErrorBoundaryEvent =
  | { type: "error-recorded"; pluginId: string; record: PluginErrorRecord }
  | { type: "plugin-auto-disabled"; pluginId: string; consecutiveErrors: number }
  | { type: "plugin-reset"; pluginId: string }
  | { type: "worker-restart-requested"; pluginId: string; attempt: number }
  | { type: "worker-restart-succeeded"; pluginId: string; attempt: number }
  | { type: "worker-restart-failed"; pluginId: string; attempt: number }
  | { type: "worker-restart-exhausted"; pluginId: string; maxRestarts: number };

export type PluginErrorBoundaryEventListener = (event: PluginErrorBoundaryEvent) => void;

// ==================== PluginErrorBoundary 主类 ====================

/**
 * PluginErrorBoundary — 插件错误边界
 *
 * 职责：
 * 1. 统一记录所有插件运行时错误
 * 2. 跟踪连续错误次数，超过阈值自动停用
 * 3. 支持手动重置后重试
 * 4. 管理 Worker 崩溃重启策略
 * 5. 提供诊断信息供 UI 展示
 */
export class PluginErrorBoundary implements Disposable {
  // ── 配置 ──
  private readonly config: Required<
    Pick<
      PluginErrorBoundaryConfig,
      | "maxConsecutiveErrors"
      | "maxHistoryPerPlugin"
      | "maxGlobalHistory"
      | "maxWorkerRestarts"
      | "baseRestartDelay"
    >
  > & {
    onAutoDisable: PluginErrorBoundaryConfig["onAutoDisable"] | null;
    onError: PluginErrorBoundaryConfig["onError"] | null;
    onWorkerRestartRequest: PluginErrorBoundaryConfig["onWorkerRestartRequest"] | null;
  };

  // ── 状态 ──

  /** 每个插件的错误状态 */
  private pluginStates: Map<string, PluginErrorState> = new Map();

  /** 全局错误历史（所有插件汇总，最近 N 条） */
  private globalHistory: PluginErrorRecord[] = [];

  /** 事件监听器 */
  private listeners: Set<PluginErrorBoundaryEventListener> = new Set();

  /** 是否已被 dispose */
  private _isDisposed = false;

  /** Worker 重启中的插件集合（防重复重启） */
  private workerRestarting: Set<string> = new Set();

  constructor(userConfig?: Partial<PluginErrorBoundaryConfig>) {
    this.config = {
      maxConsecutiveErrors: userConfig?.maxConsecutiveErrors ?? 3,
      maxHistoryPerPlugin: userConfig?.maxHistoryPerPlugin ?? 50,
      maxGlobalHistory: userConfig?.maxGlobalHistory ?? 200,
      maxWorkerRestarts: userConfig?.maxWorkerRestarts ?? 3,
      baseRestartDelay: userConfig?.baseRestartDelay ?? 1000,
      onAutoDisable: userConfig?.onAutoDisable ?? null,
      onError: userConfig?.onError ?? null,
      onWorkerRestartRequest: userConfig?.onWorkerRestartRequest ?? null,
    };
  }

  // ==================== 核心方法 ====================

  /**
   * 记录一次插件错误
   *
   * 流程：
   * 1. 创建错误记录
   * 2. 更新插件错误状态（连续计数 +1）
   * 3. 添加到插件历史和全局历史
   * 4. 检查是否应该自动停用
   * 5. 如果是 Worker 崩溃，尝试自动重启
   * 6. 触发事件和回调
   *
   * @param pluginId  发生错误的插件 ID
   * @param error     错误对象（非 Error 类型会被包装）
   * @param context   错误发生的上下文
   * @param extra     额外信息（commandId / eventName）
   */
  recordError(
    pluginId: string,
    error: unknown,
    context: PluginErrorContext,
    extra?: { commandId?: string; eventName?: string },
  ): void {
    if (this._isDisposed) return;

    // 1. 规范化错误对象
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));

    // 2. 创建错误记录
    const record: PluginErrorRecord = {
      pluginId,
      error: normalizedError,
      message: normalizedError.message,
      context,
      commandId: extra?.commandId,
      eventName: extra?.eventName,
      timestamp: Date.now(),
      stack: normalizedError.stack,
    };

    // 3. 获取或创建插件状态
    const state = this.getOrCreateState(pluginId);

    // 4. 更新计数
    state.consecutiveErrors++;
    state.totalErrors++;
    state.lastErrorAt = record.timestamp;

    // 5. 添加到历史
    state.history.push(record);
    if (state.history.length > this.config.maxHistoryPerPlugin) {
      // 移除最旧的一半
      state.history = state.history.slice(
        Math.floor(this.config.maxHistoryPerPlugin / 2),
      );
    }

    this.globalHistory.push(record);
    if (this.globalHistory.length > this.config.maxGlobalHistory) {
      this.globalHistory = this.globalHistory.slice(
        Math.floor(this.config.maxGlobalHistory / 2),
      );
    }

    // 6. 触发错误回调
    if (this.config.onError) {
      try {
        this.config.onError(record);
      } catch (callbackError) {
        console.error(
          "[PluginErrorBoundary] Error in onError callback:",
          callbackError,
        );
      }
    }

    // 7. 触发事件
    this.emit({ type: "error-recorded", pluginId, record });

    // 8. 检查是否应该自动停用
    if (this.shouldAutoDisable(pluginId)) {
      this.doAutoDisable(pluginId);
    }

    // 9. 如果是 Worker 崩溃，尝试自动重启
    if (
      (context === "worker-crash" || context === "worker-timeout") &&
      !state.autoDisabled
    ) {
      this.attemptWorkerRestart(pluginId);
    }
  }

  /**
   * 记录一次成功操作（重置连续错误计数）
   *
   * 应在插件成功激活、成功执行命令等时调用，
   * 防止偶发性错误触发自动停用。
   *
   * @param pluginId 插件 ID
   */
  recordSuccess(pluginId: string): void {
    if (this._isDisposed) return;

    const state = this.pluginStates.get(pluginId);
    if (state) {
      state.consecutiveErrors = 0;
      state.lastSuccessAt = Date.now();
    }
  }

  /**
   * 判断插件是否应该被自动停用
   *
   * @param pluginId 插件 ID
   * @returns 是否应该自动停用
   */
  shouldAutoDisable(pluginId: string): boolean {
    const state = this.pluginStates.get(pluginId);
    if (!state) return false;
    if (state.autoDisabled) return false; // 已经停用了

    return state.consecutiveErrors >= this.config.maxConsecutiveErrors;
  }

  /**
   * 重置插件的错误状态（清零连续计数、取消自动停用标记）
   *
   * 用户手动点击"重试"按钮前调用。
   *
   * @param pluginId 插件 ID
   */
  reset(pluginId: string): void {
    if (this._isDisposed) return;

    const state = this.pluginStates.get(pluginId);
    if (state) {
      state.consecutiveErrors = 0;
      state.autoDisabled = false;
      state.autoDisabledAt = null;
      state.workerRestartCount = 0;
      // 注意：不清空 history 和 totalErrors，保留历史记录供诊断
    }

    this.workerRestarting.delete(pluginId);

    this.emit({ type: "plugin-reset", pluginId });
  }

  /**
   * 完全清除插件的所有错误记录
   *
   * 比 reset 更彻底：同时清空历史记录和总计数。
   *
   * @param pluginId 插件 ID
   */
  clearPlugin(pluginId: string): void {
    this.pluginStates.delete(pluginId);
    this.workerRestarting.delete(pluginId);
    // 从全局历史中移除该插件的记录
    this.globalHistory = this.globalHistory.filter(
      (r) => r.pluginId !== pluginId,
    );
  }

  /**
   * 清除所有插件的错误记录
   */
  clearAll(): void {
    this.pluginStates.clear();
    this.globalHistory = [];
    this.workerRestarting.clear();
  }

  // ==================== 查询方法 ====================

  /**
   * 获取指定插件的错误历史
   *
   * @param pluginId 插件 ID
   * @param limit    最大条数（默认全部）
   * @returns 错误记录（最新的在前）
   */
  getErrors(pluginId: string, limit?: number): PluginErrorRecord[] {
    const state = this.pluginStates.get(pluginId);
    if (!state) return [];

    const records = state.history.slice().reverse();
    return limit !== undefined ? records.slice(0, limit) : records;
  }

  /**
   * 获取全局错误历史
   *
   * @param limit 最大条数（默认 100）
   * @returns 错误记录（最新的在前）
   */
  getAllErrors(limit: number = 100): PluginErrorRecord[] {
    return this.globalHistory.slice(-limit).reverse();
  }

  /**
   * 获取指定插件的错误状态
   */
  getPluginState(pluginId: string): Readonly<PluginErrorState> | null {
    return this.pluginStates.get(pluginId) ?? null;
  }

  /**
   * 获取所有有错误记录的插件 ID 列表
   */
  getPluginsWithErrors(): string[] {
    const result: string[] = [];
    for (const [pluginId, state] of this.pluginStates) {
      if (state.totalErrors > 0) {
        result.push(pluginId);
      }
    }
    return result;
  }

  /**
   * 获取所有被自动停用的插件 ID 列表
   */
  getAutoDisabledPlugins(): string[] {
    const result: string[] = [];
    for (const [pluginId, state] of this.pluginStates) {
      if (state.autoDisabled) {
        result.push(pluginId);
      }
    }
    return result;
  }

  /**
   * 检查插件是否被自动停用
   */
  isAutoDisabled(pluginId: string): boolean {
    return this.pluginStates.get(pluginId)?.autoDisabled ?? false;
  }

  /**
   * 获取插件的连续错误次数
   */
  getConsecutiveErrors(pluginId: string): number {
    return this.pluginStates.get(pluginId)?.consecutiveErrors ?? 0;
  }

  /**
   * 获取插件的总错误次数
   */
  getTotalErrors(pluginId: string): number {
    return this.pluginStates.get(pluginId)?.totalErrors ?? 0;
  }

  /**
   * 检查是否还可以尝试重启 Worker
   */
  canRestartWorker(pluginId: string): boolean {
    const state = this.pluginStates.get(pluginId);
    if (!state) return true;
    return (
      state.workerRestartCount < this.config.maxWorkerRestarts &&
      !this.workerRestarting.has(pluginId)
    );
  }

  // ==================== 事件 ====================

  /**
   * 监听 PluginErrorBoundary 事件
   *
   * @param listener 事件回调
   * @returns Disposable（取消监听）
   */
  onEvent(listener: PluginErrorBoundaryEventListener): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  // ==================== 诊断 ====================

  /**
   * 获取诊断信息（供诊断面板展示）
   */
  getDiagnostics(): PluginErrorBoundaryDiagnostics {
    const pluginDiagnostics: PluginErrorDiagnosticInfo[] = [];

    for (const [pluginId, state] of this.pluginStates) {
      pluginDiagnostics.push({
        pluginId,
        consecutiveErrors: state.consecutiveErrors,
        totalErrors: state.totalErrors,
        autoDisabled: state.autoDisabled,
        autoDisabledAt: state.autoDisabledAt,
        lastErrorAt: state.lastErrorAt,
        lastSuccessAt: state.lastSuccessAt,
        historySize: state.history.length,
        workerRestartCount: state.workerRestartCount,
        recentErrors: state.history
          .slice(-5)
          .reverse()
          .map((r) => ({
            message: r.message,
            context: r.context,
            commandId: r.commandId,
            timestamp: r.timestamp,
          })),
      });
    }

    return {
      totalPluginsWithErrors: this.getPluginsWithErrors().length,
      totalAutoDisabled: this.getAutoDisabledPlugins().length,
      globalHistorySize: this.globalHistory.length,
      config: {
        maxConsecutiveErrors: this.config.maxConsecutiveErrors,
        maxWorkerRestarts: this.config.maxWorkerRestarts,
      },
      plugins: pluginDiagnostics,
    };
  }

  // ==================== Disposable ====================

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    this.pluginStates.clear();
    this.globalHistory = [];
    this.listeners.clear();
    this.workerRestarting.clear();
  }

  // ==================== 内部方法 ====================

  /**
   * 获取或创建插件的错误状态
   */
  private getOrCreateState(pluginId: string): PluginErrorState {
    let state = this.pluginStates.get(pluginId);
    if (!state) {
      state = {
        consecutiveErrors: 0,
        totalErrors: 0,
        autoDisabled: false,
        autoDisabledAt: null,
        history: [],
        lastErrorAt: null,
        lastSuccessAt: null,
        workerRestartCount: 0,
      };
      this.pluginStates.set(pluginId, state);
    }
    return state;
  }

  /**
   * 执行自动停用
   */
  private doAutoDisable(pluginId: string): void {
    const state = this.pluginStates.get(pluginId);
    if (!state || state.autoDisabled) return;

    state.autoDisabled = true;
    state.autoDisabledAt = Date.now();

    console.warn(
      `[PluginErrorBoundary] Plugin "${pluginId}" auto-disabled after ` +
        `${state.consecutiveErrors} consecutive errors.`,
    );

    // 触发事件
    this.emit({
      type: "plugin-auto-disabled",
      pluginId,
      consecutiveErrors: state.consecutiveErrors,
    });

    // 回调通知外部执行实际的停用操作
    if (this.config.onAutoDisable) {
      try {
        this.config.onAutoDisable(pluginId, state.history.slice(-state.consecutiveErrors));
      } catch (error) {
        console.error(
          "[PluginErrorBoundary] Error in onAutoDisable callback:",
          error,
        );
      }
    }
  }

  /**
   * 尝试重启 Worker
   *
   * 重启策略：
   * - 最多重启 maxWorkerRestarts 次
   * - 每次重启间隔递增（baseRestartDelay * attempt）
   * - 重启期间不允许重复触发
   * - 超过最大重启次数后触发自动停用
   */
  private async attemptWorkerRestart(pluginId: string): Promise<void> {
    if (!this.config.onWorkerRestartRequest) return;
    if (this.workerRestarting.has(pluginId)) return;

    const state = this.getOrCreateState(pluginId);

    // 检查是否超过最大重启次数
    if (state.workerRestartCount >= this.config.maxWorkerRestarts) {
      console.warn(
        `[PluginErrorBoundary] Plugin "${pluginId}" exhausted all ${this.config.maxWorkerRestarts} ` +
          `worker restart attempts.`,
      );
      this.emit({
        type: "worker-restart-exhausted",
        pluginId,
        maxRestarts: this.config.maxWorkerRestarts,
      });
      return;
    }

    // 标记正在重启
    this.workerRestarting.add(pluginId);
    state.workerRestartCount++;
    const attempt = state.workerRestartCount;

    // 计算延迟（递增）
    const delay = this.config.baseRestartDelay * attempt;

    console.log(
      `[PluginErrorBoundary] Scheduling worker restart for plugin "${pluginId}" ` +
        `(attempt ${attempt}/${this.config.maxWorkerRestarts}) in ${delay}ms...`,
    );

    this.emit({
      type: "worker-restart-requested",
      pluginId,
      attempt,
    });

    // 延迟后重启
    await new Promise<void>((resolve) => setTimeout(resolve, delay));

    // 检查是否在等待期间被 dispose 或 reset
    if (this._isDisposed || !this.workerRestarting.has(pluginId)) {
      return;
    }

    try {
      const success = await this.config.onWorkerRestartRequest(pluginId, attempt);

      if (success) {
        console.log(
          `[PluginErrorBoundary] Worker restart succeeded for plugin "${pluginId}" ` +
            `(attempt ${attempt}).`,
        );
        // 重启成功，重置连续错误计数（但保留 workerRestartCount）
        state.consecutiveErrors = 0;
        this.emit({
          type: "worker-restart-succeeded",
          pluginId,
          attempt,
        });
      } else {
        console.warn(
          `[PluginErrorBoundary] Worker restart failed for plugin "${pluginId}" ` +
            `(attempt ${attempt}).`,
        );
        this.emit({
          type: "worker-restart-failed",
          pluginId,
          attempt,
        });
      }
    } catch (error) {
      console.error(
        `[PluginErrorBoundary] Worker restart error for plugin "${pluginId}":`,
        error,
      );
      this.emit({
        type: "worker-restart-failed",
        pluginId,
        attempt,
      });
    } finally {
      this.workerRestarting.delete(pluginId);
    }
  }

  /**
   * 触发事件
   */
  private emit(event: PluginErrorBoundaryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error(
          "[PluginErrorBoundary] Error in event listener:",
          error,
        );
      }
    }
  }
}

// ==================== 工具函数 ====================

/**
 * 从 unknown 类型的错误创建规范化的 Error 对象
 *
 * 用于 catch 块中：
 * ```ts
 * } catch (error) {
 *   const normalized = normalizeError(error);
 *   errorBoundary.recordError(pluginId, normalized, "command");
 * }
 * ```
 */
export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  if (typeof error === "object" && error !== null) {
    const msg =
      "message" in error && typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : JSON.stringify(error);
    return new Error(msg);
  }
  return new Error(String(error));
}

/**
 * 格式化错误上下文为中文描述（供 UI 展示）
 */
export function formatErrorContext(context: PluginErrorContext): string {
  const labels: Record<PluginErrorContext, string> = {
    activation: "激活阶段",
    deactivation: "停用阶段",
    command: "命令执行",
    event: "事件处理",
    "worker-crash": "Worker 崩溃",
    "worker-timeout": "Worker 超时",
    "api-call": "API 调用",
    unknown: "未知",
  };
  return labels[context] ?? context;
}

/**
 * 格式化时间戳为可读字符串
 */
export function formatErrorTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ==================== 诊断类型 ====================

/**
 * PluginErrorBoundary 的诊断信息
 */
export interface PluginErrorBoundaryDiagnostics {
  /** 有错误记录的插件数量 */
  totalPluginsWithErrors: number;

  /** 被自动停用的插件数量 */
  totalAutoDisabled: number;

  /** 全局错误历史大小 */
  globalHistorySize: number;

  /** 配置信息 */
  config: {
    maxConsecutiveErrors: number;
    maxWorkerRestarts: number;
  };

  /** 各插件的错误诊断信息 */
  plugins: PluginErrorDiagnosticInfo[];
}

/**
 * 单个插件的错误诊断信息
 */
export interface PluginErrorDiagnosticInfo {
  pluginId: string;
  consecutiveErrors: number;
  totalErrors: number;
  autoDisabled: boolean;
  autoDisabledAt: number | null;
  lastErrorAt: number | null;
  lastSuccessAt: number | null;
  historySize: number;
  workerRestartCount: number;
  recentErrors: Array<{
    message: string;
    context: PluginErrorContext;
    commandId?: string;
    timestamp: number;
  }>;
}
