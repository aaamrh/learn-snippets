// ==================== WorkerSandbox ====================
//
// 对标 VS Code 的 Extension Host Process：
// - 在 Web Worker 中运行插件代码，实现进程级隔离
// - 通过 postMessage / onmessage 实现宿主与插件的 IPC 通信
// - 管理 Worker 的生命周期（创建、初始化、激活、停用、销毁）
// - 将宿主侧的 PluginAPI 调用序列化为消息，在 Worker 中反序列化并执行
//
// VS Code 的 Extension Host 架构参考：
// - 插件运行在独立的 Node.js 进程（Extension Host Process）
// - 主进程与 Extension Host 通过 IPC（JSON-RPC）通信
// - 插件不能直接操作 UI DOM，只能通过 API 对象间接操作
//
// 我们的简化版本：
// - 用 Web Worker 替代独立进程
// - 用 postMessage 替代 IPC
// - 用 Blob URL 动态创建 Worker（因为插件代码不是独立的 JS 文件）
//
// 架构关系：
//   宿主 Main Thread                         Worker Thread
//   ┌──────────────────┐                    ┌──────────────────┐
//   │  WorkerSandbox   │ ── postMessage ──> │  Worker 运行环境   │
//   │  (管理者)        │ <── onmessage ──── │  (插件代码)        │
//   │                  │                    │                  │
//   │  - 接收 API 调用  │                    │  - PluginAPI 代理  │
//   │  - 执行真实操作   │                    │  - 插件 activate   │
//   │  - 返回结果      │                    │  - 命令 handler    │
//   └──────────────────┘                    └──────────────────┘
//
// 教学说明：
// 本 Demo 中 Worker 沙箱为**可选层**。
// 为了简化教学和调试，默认使用「主线程模式」（MainThreadSandbox），
// 插件代码直接在主线程中运行，不经过 Worker。
// WorkerSandbox 作为进阶示例，展示如何将插件隔离到 Worker 中。
//
// 两种模式的切换：
// - MainThreadSandbox: 插件直接在主线程运行（开发/调试方便）
// - WorkerSandbox:     插件在 Worker 中运行（生产级隔离）

import type {
  PluginManifest,
  PluginAPI,
  PluginEntry,
  Disposable,
  HostToWorkerMessage,
  WorkerToHostMessage,
} from "./manifest-types";

// ==================== Sandbox 接口 ====================

/**
 * ISandbox — 沙箱抽象接口
 *
 * MainThreadSandbox 和 WorkerSandbox 都实现此接口，
 * PluginHost 通过接口操作，不关心底层是主线程还是 Worker。
 *
 * 策略模式：运行时切换沙箱实现，不影响上层逻辑。
 */
export interface ISandbox {
  /** 沙箱类型标识 */
  readonly type: "main-thread" | "worker";

  /** 关联的插件 ID */
  readonly pluginId: string;

  /** 当前状态 */
  readonly state: SandboxState;

  /**
   * 初始化沙箱
   * - MainThread: 保存 PluginEntry 引用
   * - Worker: 创建 Worker，注入运行时代码
   */
  init(manifest: PluginManifest, entry: PluginEntry | null): Promise<void>;

  /**
   * 激活插件
   * 调用 pluginEntry.activate(api)
   */
  activate(api: PluginAPI): Promise<void>;

  /**
   * 停用插件
   * 调用 pluginEntry.deactivate()
   */
  deactivate(): Promise<void>;

  /**
   * 执行已注册的命令
   * （仅 Worker 模式需要，主线程模式下命令已直接注册到 ContributionManager）
   */
  executeCommand(commandId: string, ...args: unknown[]): Promise<unknown>;

  /**
   * 向沙箱内发送事件
   */
  sendEvent(event: string, ...args: unknown[]): void;

  /**
   * 销毁沙箱（终止 Worker / 清理资源）
   */
  destroy(): void;

  /**
   * 设置消息处理器（用于接收 Worker 发来的消息）
   */
  onMessage(handler: SandboxMessageHandler): Disposable;
}

/**
 * 沙箱状态
 */
export type SandboxState =
  | "created" // 已创建，尚未初始化
  | "initializing" // 正在初始化
  | "ready" // 初始化完成，等待激活
  | "active" // 插件已激活
  | "deactivating" // 正在停用
  | "destroyed"; // 已销毁

/**
 * 沙箱消息处理器
 */
export type SandboxMessageHandler = (message: WorkerToHostMessage) => void;

// ==================== MainThreadSandbox ====================

/**
 * MainThreadSandbox — 主线程沙箱（无隔离）
 *
 * 插件代码直接在主线程中运行。
 *
 * 优点：
 * - 调试方便（断点、console.log 直接可用）
 * - 无序列化开销（API 调用是同步的函数调用）
 * - 实现简单
 *
 * 缺点：
 * - 无隔离（插件可以访问全局变量、DOM）
 * - 插件的阻塞操作会卡住 UI
 *
 * 适用场景：
 * - 开发和调试阶段
 * - 信任的第一方插件
 * - 教学演示（降低复杂度）
 */
export class MainThreadSandbox implements ISandbox {
  readonly type = "main-thread" as const;
  readonly pluginId: string;

  private _state: SandboxState = "created";
  private entry: PluginEntry | null = null;
  private manifest: PluginManifest | null = null;
  private messageHandlers: Set<SandboxMessageHandler> = new Set();

  constructor(pluginId: string) {
    this.pluginId = pluginId;
  }

  get state(): SandboxState {
    return this._state;
  }

  async init(manifest: PluginManifest, entry: PluginEntry | null): Promise<void> {
    this._state = "initializing";
    this.manifest = manifest;
    this.entry = entry;
    this._state = "ready";
  }

  async activate(api: PluginAPI): Promise<void> {
    if (!this.entry) {
      throw new Error(
        `[MainThreadSandbox] Plugin "${this.pluginId}" has no entry. ` +
          `Load the plugin code first.`,
      );
    }

    if (this._state !== "ready") {
      throw new Error(
        `[MainThreadSandbox] Cannot activate plugin "${this.pluginId}" ` +
          `in state "${this._state}". Expected "ready".`,
      );
    }

    try {
      await this.entry.activate(api);
      this._state = "active";
    } catch (error) {
      // 通知宿主激活失败
      this.notifyMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  async deactivate(): Promise<void> {
    if (this._state !== "active") {
      return; // 非激活状态，跳过
    }

    this._state = "deactivating";

    try {
      await this.entry?.deactivate?.();
    } catch (error) {
      console.error(`[MainThreadSandbox] Error deactivating plugin "${this.pluginId}":`, error);
    }

    this._state = "ready";
  }

  async executeCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    // 主线程模式下，命令已直接注册到 ContributionManager，
    // 不需要通过沙箱转发。此方法仅为接口兼容。
    throw new Error(
      `[MainThreadSandbox] executeCommand should not be called directly. ` +
        `Use ContributionManager.executeCommand instead.`,
    );
  }

  sendEvent(event: string, ...args: unknown[]): void {
    // 主线程模式下，事件已通过 EventBusBridge 直接传递，
    // 不需要通过沙箱转发。此方法为接口兼容保留。
  }

  destroy(): void {
    this._state = "destroyed";
    this.entry = null;
    this.manifest = null;
    this.messageHandlers.clear();
  }

  onMessage(handler: SandboxMessageHandler): Disposable {
    this.messageHandlers.add(handler);
    return {
      dispose: () => {
        this.messageHandlers.delete(handler);
      },
    };
  }

  /**
   * 设置插件入口（用于后续加载）
   */
  setEntry(entry: PluginEntry): void {
    this.entry = entry;
  }

  /**
   * 内部：通知消息处理器
   */
  private notifyMessage(message: WorkerToHostMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error(
          `[MainThreadSandbox] Error in message handler for plugin "${this.pluginId}":`,
          error,
        );
      }
    }
  }
}

// ==================== WorkerSandbox ====================

/**
 * WorkerSandbox — Web Worker 沙箱（进程级隔离）
 *
 * 插件代码在独立的 Web Worker 中运行。
 *
 * 通信协议：
 * - 宿主 → Worker: HostToWorkerMessage（init / activate / deactivate / api-response / event / execute-command）
 * - Worker → 宿主: WorkerToHostMessage（api-call / command-registered / event-emit / ready / error / log）
 *
 * API 调用流程（以 editor.getSelectedText 为例）：
 * 1. 插件代码调用 api.editor.getSelectedText()
 * 2. Worker 中的 API 代理将调用序列化为消息:
 *    { type: "api-call", callId: "uuid-1", namespace: "editor", method: "getSelectedText", args: [] }
 * 3. Worker 通过 postMessage 发送给宿主
 * 4. 宿主的 WorkerSandbox 收到消息，调用真实的 EditorBridge.getSelectedText()
 * 5. 宿主将结果序列化为响应消息:
 *    { type: "api-response", callId: "uuid-1", result: "selected text" }
 * 6. 宿主通过 postMessage 发送给 Worker
 * 7. Worker 中的 API 代理 resolve 对应的 Promise
 * 8. 插件代码拿到结果 "selected text"
 *
 * 优点：
 * - 真正的隔离（插件不能访问 DOM、全局变量）
 * - 插件崩溃不影响宿主
 * - 阻塞操作不卡 UI
 *
 * 缺点：
 * - 序列化开销（所有数据都要经过 structured clone）
 * - 调试困难（Worker 的断点和日志需要额外配置）
 * - 不能传递函数引用（只能传数据）
 *
 * 教学说明：
 * 这个实现是简化的教学版本，展示核心概念。
 * 真正的生产级实现（如 VS Code）还需要处理：
 * - 更完善的错误恢复（Worker 崩溃后重启）
 * - 消息队列和背压控制
 * - Worker 池（多个插件共享一组 Worker）
 * - SharedArrayBuffer 等高性能通信方案
 */
export class WorkerSandbox implements ISandbox {
  readonly type = "worker" as const;
  readonly pluginId: string;

  private _state: SandboxState = "created";
  private worker: Worker | null = null;
  private manifest: PluginManifest | null = null;
  private messageHandlers: Set<SandboxMessageHandler> = new Set();

  /**
   * API 调用的待处理 Promise
   * key = callId, value = { resolve, reject, timeout }
   */
  private pendingAPICalls: Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  /**
   * 命令执行的待处理 Promise
   * key = 生成的请求 ID, value = { resolve, reject }
   */
  private pendingCommandExecutions: Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  /**
   * API 调用超时时间（毫秒）
   */
  private apiCallTimeout: number;

  /**
   * 宿主侧的真实 API 实现（用于响应 Worker 的 api-call 消息）
   */
  private hostAPI: PluginAPI | null = null;

  /**
   * 自增的 callId 计数器
   */
  private callIdCounter: number = 0;

  /**
   * ready Promise（等待 Worker 初始化完成）
   */
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;

  constructor(
    pluginId: string,
    options?: {
      apiCallTimeout?: number;
    },
  ) {
    this.pluginId = pluginId;
    this.apiCallTimeout = options?.apiCallTimeout ?? 10000; // 默认 10 秒
  }

  get state(): SandboxState {
    return this._state;
  }

  /**
   * 初始化 Worker 沙箱
   *
   * 流程：
   * 1. 生成 Worker 运行时代码（包含 API 代理和消息路由）
   * 2. 用 Blob URL 创建 Worker
   * 3. 设置消息监听
   * 4. 向 Worker 发送 init 消息
   * 5. 等待 Worker 返回 ready 消息
   */
  async init(manifest: PluginManifest, _entry: PluginEntry | null): Promise<void> {
    if (typeof Worker === "undefined") {
      throw new Error(
        `[WorkerSandbox] Web Workers are not available in this environment. ` +
          `Use MainThreadSandbox instead.`,
      );
    }

    this._state = "initializing";
    this.manifest = manifest;

    // 创建 ready Promise
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    try {
      // 生成 Worker 运行时代码
      const workerCode = generateWorkerRuntime(this.pluginId, manifest);
      const blob = new Blob([workerCode], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);

      // 创建 Worker
      this.worker = new Worker(url, {
        name: `plugin-worker-${this.pluginId}`,
      });

      // 释放 Blob URL（Worker 已加载，不再需要）
      URL.revokeObjectURL(url);

      // 设置消息监听
      this.worker.onmessage = (event: MessageEvent<WorkerToHostMessage>) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (event: ErrorEvent) => {
        console.error(`[WorkerSandbox] Worker error for plugin "${this.pluginId}":`, event.message);

        this.notifyMessage({
          type: "error",
          message: event.message ?? "Unknown worker error",
        });

        // 如果还在初始化中，拒绝 ready Promise
        if (this._state === "initializing" && this.readyReject) {
          this.readyReject(new Error(`Worker error: ${event.message}`));
        }
      };

      // 向 Worker 发送 init 消息
      this.postToWorker({
        type: "init",
        pluginId: this.pluginId,
        manifest,
      });

      // 等待 Worker ready（带超时）
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `[WorkerSandbox] Worker for plugin "${this.pluginId}" ` +
                `did not become ready within ${this.apiCallTimeout}ms.`,
            ),
          );
        }, this.apiCallTimeout);
      });

      await Promise.race([this.readyPromise, timeoutPromise]);

      this._state = "ready";
    } catch (error) {
      this._state = "destroyed";
      this.cleanup();
      throw error;
    }
  }

  /**
   * 激活插件
   *
   * 向 Worker 发送 activate 消息，Worker 内部调用 pluginEntry.activate(api)
   * 注意：此处的 api 参数是宿主侧的真实 API，用于响应 Worker 的 api-call
   */
  async activate(api: PluginAPI): Promise<void> {
    if (!this.worker) {
      throw new Error(`[WorkerSandbox] Worker for plugin "${this.pluginId}" is not initialized.`);
    }

    if (this._state !== "ready") {
      throw new Error(
        `[WorkerSandbox] Cannot activate plugin "${this.pluginId}" ` +
          `in state "${this._state}". Expected "ready".`,
      );
    }

    // 保存宿主侧 API（用于响应 Worker 的 api-call）
    this.hostAPI = api;

    // 向 Worker 发送 activate 消息
    this.postToWorker({
      type: "activate",
      pluginId: this.pluginId,
    });

    // 等待 Worker 确认激活完成
    // 注意：这里通过约定，Worker 在 activate 完成后会发送 ready 消息
    // 或者我们可以等待一个 "activated" 消息
    // 简化处理：直接标记为 active
    this._state = "active";
  }

  async deactivate(): Promise<void> {
    if (!this.worker || this._state !== "active") {
      return;
    }

    this._state = "deactivating";

    this.postToWorker({
      type: "deactivate",
      pluginId: this.pluginId,
    });

    // 给 Worker 一点时间处理 deactivate
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    this._state = "ready";
  }

  async executeCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    if (!this.worker || this._state !== "active") {
      throw new Error(
        `[WorkerSandbox] Cannot execute command. Plugin "${this.pluginId}" is not active.`,
      );
    }

    return new Promise((resolve, reject) => {
      const requestId = `cmd-${this.callIdCounter++}`;

      const timer = setTimeout(() => {
        this.pendingCommandExecutions.delete(requestId);
        reject(
          new Error(
            `[WorkerSandbox] Command "${commandId}" execution timed out ` +
              `after ${this.apiCallTimeout}ms.`,
          ),
        );
      }, this.apiCallTimeout);

      this.pendingCommandExecutions.set(requestId, { resolve, reject, timer });

      this.postToWorker({
        type: "execute-command",
        commandId,
        args,
      });
    });
  }

  sendEvent(event: string, ...args: unknown[]): void {
    if (!this.worker || this._state !== "active") return;

    this.postToWorker({
      type: "event",
      event,
      args,
    });
  }

  destroy(): void {
    this._state = "destroyed";
    this.cleanup();
  }

  onMessage(handler: SandboxMessageHandler): Disposable {
    this.messageHandlers.add(handler);
    return {
      dispose: () => {
        this.messageHandlers.delete(handler);
      },
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 处理 Worker 发来的消息
   */
  private handleWorkerMessage(message: WorkerToHostMessage): void {
    switch (message.type) {
      case "ready":
        // Worker 初始化完成
        if (this.readyResolve) {
          this.readyResolve();
          this.readyResolve = null;
          this.readyReject = null;
        }
        break;

      case "api-call":
        // Worker 中的插件调用了 API
        this.handleAPICall(message);
        break;

      case "command-registered":
        // Worker 中的插件注册了命令处理器
        this.notifyMessage(message);
        break;

      case "command-result": {
        // Worker 中的命令执行完成
        // 查找匹配的 pending execution
        // 注意：简化处理，用 commandId 匹配
        for (const [requestId, pending] of this.pendingCommandExecutions) {
          clearTimeout(pending.timer);
          this.pendingCommandExecutions.delete(requestId);
          if (message.error) {
            pending.reject(new Error(message.error));
          } else {
            pending.resolve(message.result);
          }
          break; // 只处理第一个匹配的
        }
        break;
      }

      case "event-emit":
        // Worker 中的插件触发了事件
        this.notifyMessage(message);
        break;

      case "status-bar-update":
        // Worker 中的插件更新了状态栏
        this.notifyMessage(message);
        break;

      case "status-bar-remove":
        // Worker 中的插件移除了状态栏项
        this.notifyMessage(message);
        break;

      case "error":
        // Worker 中发生错误
        console.error(
          `[WorkerSandbox] Error from plugin "${this.pluginId}":`,
          message.message,
          message.stack,
        );
        this.notifyMessage(message);
        break;

      case "log":
        // Worker 中的日志输出
        this.handleWorkerLog(message);
        break;

      default:
        console.warn(
          `[WorkerSandbox] Unknown message type from plugin "${this.pluginId}":`,
          message,
        );
    }
  }

  /**
   * 处理 Worker 中的 API 调用
   *
   * 收到 Worker 的 api-call 消息后：
   * 1. 在宿主侧执行真实的 API 方法
   * 2. 将结果序列化为 api-response 消息
   * 3. 通过 postMessage 发送回 Worker
   */
  private async handleAPICall(
    message: Extract<WorkerToHostMessage, { type: "api-call" }>,
  ): Promise<void> {
    const { callId, namespace, method, args } = message;

    if (!this.hostAPI) {
      this.postToWorker({
        type: "api-response",
        callId,
        result: undefined,
        error: `Host API not available for plugin "${this.pluginId}"`,
      });
      return;
    }

    try {
      // 获取 API namespace 对象
      const nsObj = (this.hostAPI as unknown as Record<string, unknown>)[namespace];
      if (!nsObj || typeof nsObj !== "object") {
        throw new Error(`Unknown API namespace "${namespace}"`);
      }

      // 获取方法
      const fn = (nsObj as Record<string, unknown>)[method];
      if (typeof fn !== "function") {
        throw new Error(`Unknown API method "${namespace}.${method}"`);
      }

      // 执行方法
      const result = await fn.apply(nsObj, args);

      // 返回结果
      this.postToWorker({
        type: "api-response",
        callId,
        result,
      });
    } catch (error) {
      this.postToWorker({
        type: "api-response",
        callId,
        result: undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 处理 Worker 中的日志输出
   */
  private handleWorkerLog(message: Extract<WorkerToHostMessage, { type: "log" }>): void {
    const prefix = `[Plugin: ${this.pluginId}]`;
    switch (message.level) {
      case "info":
        console.log(prefix, ...message.args);
        break;
      case "warn":
        console.warn(prefix, ...message.args);
        break;
      case "error":
        console.error(prefix, ...message.args);
        break;
    }
  }

  /**
   * 向 Worker 发送消息
   */
  private postToWorker(message: HostToWorkerMessage): void {
    if (!this.worker) {
      console.warn(
        `[WorkerSandbox] Cannot post message to destroyed worker for plugin "${this.pluginId}".`,
      );
      return;
    }

    try {
      this.worker.postMessage(message);
    } catch (error) {
      console.error(
        `[WorkerSandbox] Failed to post message to worker for plugin "${this.pluginId}":`,
        error,
      );
    }
  }

  /**
   * 通知消息处理器
   */
  private notifyMessage(message: WorkerToHostMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error(
          `[WorkerSandbox] Error in message handler for plugin "${this.pluginId}":`,
          error,
        );
      }
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    // 终止 Worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // 拒绝所有待处理的 API 调用
    for (const [callId, pending] of this.pendingAPICalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Worker sandbox destroyed for plugin "${this.pluginId}".`));
    }
    this.pendingAPICalls.clear();

    // 拒绝所有待处理的命令执行
    for (const [, pending] of this.pendingCommandExecutions) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Worker sandbox destroyed for plugin "${this.pluginId}".`));
    }
    this.pendingCommandExecutions.clear();

    // 清理消息处理器
    this.messageHandlers.clear();

    // 清理 ready promise
    if (this.readyReject) {
      this.readyReject(new Error("Sandbox destroyed."));
      this.readyResolve = null;
      this.readyReject = null;
    }

    this.hostAPI = null;
    this.manifest = null;
  }
}

// ==================== Worker 运行时代码生成 ====================

/**
 * 生成 Worker 内部的运行时代码
 *
 * 这段代码在 Worker 中运行，负责：
 * 1. 创建 PluginAPI 代理对象（将 API 调用序列化为 postMessage）
 * 2. 监听宿主的消息（init / activate / deactivate 等）
 * 3. 管理插件的 activate / deactivate 生命周期
 *
 * 教学说明：
 * 在生产环境中，Worker 运行时通常是一个独立的 JS 文件（如 extensionHostWorker.js）。
 * 这里用字符串生成 + Blob URL 的方式创建，是因为 Demo 不想增加额外的构建步骤。
 * 实际项目建议用独立的 Worker 入口文件 + 打包工具处理。
 *
 * @param pluginId 插件 ID
 * @param manifest 插件 Manifest
 * @returns Worker 运行时 JavaScript 代码字符串
 */
function generateWorkerRuntime(pluginId: string, manifest: PluginManifest): string {
  return `
// ==================== Plugin Worker Runtime ====================
// 自动生成的 Worker 运行时代码，用于插件 "${pluginId}"
// 不要手动编辑此代码

(function() {
  'use strict';

  // ── 状态 ──────────────────────────────────────────────────
  let pluginEntry = null;
  let callIdCounter = 0;
  const pendingCalls = new Map(); // callId → { resolve, reject }
  const registeredCommands = new Map(); // commandId → handler
  const eventListeners = new Map(); // event → Set<handler>

  // ── API 代理 ──────────────────────────────────────────────
  // 将 API 方法调用序列化为 postMessage 消息

  function createAPIProxy() {
    function callAPI(namespace, method, args) {
      return new Promise(function(resolve, reject) {
        const callId = 'call-' + (callIdCounter++);
        pendingCalls.set(callId, { resolve: resolve, reject: reject });

        // 设置超时
        setTimeout(function() {
          if (pendingCalls.has(callId)) {
            pendingCalls.delete(callId);
            reject(new Error('API call ' + namespace + '.' + method + ' timed out'));
          }
        }, 10000);

        self.postMessage({
          type: 'api-call',
          callId: callId,
          namespace: namespace,
          method: method,
          args: args
        });
      });
    }

    return {
      editor: {
        insertText: function(text) { return callAPI('editor', 'insertText', [text]); },
        replaceSelection: function(text) { return callAPI('editor', 'replaceSelection', [text]); },
        getSelectedText: function() { return callAPI('editor', 'getSelectedText', []); },
        getContent: function() { return callAPI('editor', 'getContent', []); },
        onSelectionChange: function(handler) {
          var event = 'editor:selection-change';
          if (!eventListeners.has(event)) {
            eventListeners.set(event, new Set());
          }
          eventListeners.get(event).add(handler);
          return {
            dispose: function() {
              var listeners = eventListeners.get(event);
              if (listeners) listeners.delete(handler);
            }
          };
        }
      },
      commands: {
        registerCommand: function(id, handler) {
          registeredCommands.set(id, handler);
          self.postMessage({ type: 'command-registered', commandId: id });
          return {
            dispose: function() {
              registeredCommands.delete(id);
            }
          };
        },
        executeCommand: function(id) {
          var args = Array.prototype.slice.call(arguments, 1);
          return callAPI('commands', 'executeCommand', [id].concat(args));
        }
      },
      statusBar: {
        update: function(id, content) {
          self.postMessage({ type: 'status-bar-update', id: id, content: content });
        },
        remove: function(id) {
          self.postMessage({ type: 'status-bar-remove', id: id });
        }
      },
      events: {
        on: function(event, handler) {
          if (!eventListeners.has(event)) {
            eventListeners.set(event, new Set());
          }
          eventListeners.get(event).add(handler);
          return {
            dispose: function() {
              var listeners = eventListeners.get(event);
              if (listeners) listeners.delete(handler);
            }
          };
        },
        emit: function(event) {
          var args = Array.prototype.slice.call(arguments, 1);
          self.postMessage({ type: 'event-emit', event: event, args: args });
        }
      },
      storage: {
        get: function(key) { return callAPI('storage', 'get', [key]); },
        set: function(key, value) { return callAPI('storage', 'set', [key, value]); }
      }
    };
  }

  // ── 重定向 console ──────────────────────────────────────────
  var originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };

  console.log = function() {
    var args = Array.prototype.slice.call(arguments);
    originalConsole.log.apply(null, args);
    try {
      self.postMessage({ type: 'log', level: 'info', args: args });
    } catch(e) { /* ignore serialization errors */ }
  };
  console.warn = function() {
    var args = Array.prototype.slice.call(arguments);
    originalConsole.warn.apply(null, args);
    try {
      self.postMessage({ type: 'log', level: 'warn', args: args });
    } catch(e) {}
  };
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    originalConsole.error.apply(null, args);
    try {
      self.postMessage({ type: 'log', level: 'error', args: args });
    } catch(e) {}
  };

  // ── 消息处理 ──────────────────────────────────────────────
  self.onmessage = function(event) {
    var msg = event.data;

    switch (msg.type) {
      case 'init':
        // 初始化完成，通知宿主
        self.postMessage({ type: 'ready' });
        break;

      case 'activate':
        // 激活插件
        if (pluginEntry && typeof pluginEntry.activate === 'function') {
          var api = createAPIProxy();
          try {
            var result = pluginEntry.activate(api);
            if (result && typeof result.then === 'function') {
              result.catch(function(err) {
                self.postMessage({
                  type: 'error',
                  message: 'Activation failed: ' + (err.message || err),
                  stack: err.stack
                });
              });
            }
          } catch (err) {
            self.postMessage({
              type: 'error',
              message: 'Activation failed: ' + (err.message || err),
              stack: err.stack
            });
          }
        }
        break;

      case 'deactivate':
        // 停用插件
        if (pluginEntry && typeof pluginEntry.deactivate === 'function') {
          try {
            pluginEntry.deactivate();
          } catch (err) {
            self.postMessage({
              type: 'error',
              message: 'Deactivation failed: ' + (err.message || err),
              stack: err.stack
            });
          }
        }
        break;

      case 'api-response':
        // 宿主返回 API 调用结果
        var pending = pendingCalls.get(msg.callId);
        if (pending) {
          pendingCalls.delete(msg.callId);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
        break;

      case 'event':
        // 宿主发来的事件
        var listeners = eventListeners.get(msg.event);
        if (listeners) {
          listeners.forEach(function(handler) {
            try {
              handler.apply(null, msg.args || []);
            } catch (err) {
              console.error('Event handler error:', err);
            }
          });
        }
        break;

      case 'execute-command':
        // 宿主请求执行命令
        var cmdHandler = registeredCommands.get(msg.commandId);
        if (cmdHandler) {
          try {
            var cmdResult = cmdHandler.apply(null, msg.args || []);
            if (cmdResult && typeof cmdResult.then === 'function') {
              cmdResult.then(function(r) {
                self.postMessage({
                  type: 'command-result',
                  commandId: msg.commandId,
                  result: r
                });
              }).catch(function(err) {
                self.postMessage({
                  type: 'command-result',
                  commandId: msg.commandId,
                  result: undefined,
                  error: err.message || String(err)
                });
              });
            } else {
              self.postMessage({
                type: 'command-result',
                commandId: msg.commandId,
                result: cmdResult
              });
            }
          } catch (err) {
            self.postMessage({
              type: 'command-result',
              commandId: msg.commandId,
              result: undefined,
              error: err.message || String(err)
            });
          }
        } else {
          self.postMessage({
            type: 'command-result',
            commandId: msg.commandId,
            result: undefined,
            error: 'Command "' + msg.commandId + '" not found in worker'
          });
        }
        break;
    }
  };

  // ── 全局错误处理 ──────────────────────────────────────────
  self.onerror = function(message, source, lineno, colno, error) {
    self.postMessage({
      type: 'error',
      message: message || 'Unknown error',
      stack: error && error.stack ? error.stack : undefined
    });
  };

  self.onunhandledrejection = function(event) {
    var reason = event.reason;
    self.postMessage({
      type: 'error',
      message: 'Unhandled promise rejection: ' + (reason && reason.message ? reason.message : String(reason)),
      stack: reason && reason.stack ? reason.stack : undefined
    });
  };

  // ── 通知宿主 Worker 已就绪 ────────────────────────────────
  self.postMessage({ type: 'ready' });

})();
`;
}

// ==================== SandboxFactory ====================

/**
 * SandboxFactory — 沙箱工厂
 *
 * 根据配置创建合适的沙箱实例。
 *
 * 使用示例：
 * ```ts
 * const sandbox = SandboxFactory.create("translate", { mode: "main-thread" });
 * await sandbox.init(manifest, pluginEntry);
 * await sandbox.activate(api);
 * ```
 */
export class SandboxFactory {
  /**
   * 创建沙箱实例
   *
   * @param pluginId 插件 ID
   * @param options  配置选项
   * @returns ISandbox 实例
   */
  static create(
    pluginId: string,
    options?: {
      /** 沙箱模式 */
      mode?: "main-thread" | "worker" | "auto";
      /** API 调用超时（毫秒） */
      apiCallTimeout?: number;
    },
  ): ISandbox {
    const mode = options?.mode ?? "main-thread";

    switch (mode) {
      case "worker":
        if (typeof Worker === "undefined") {
          console.warn(
            `[SandboxFactory] Web Workers not available, falling back to main-thread mode ` +
              `for plugin "${pluginId}".`,
          );
          return new MainThreadSandbox(pluginId);
        }
        return new WorkerSandbox(pluginId, {
          apiCallTimeout: options?.apiCallTimeout,
        });

      case "auto":
        // 自动选择：如果 Worker 可用则用 Worker，否则用主线程
        if (typeof Worker !== "undefined") {
          return new WorkerSandbox(pluginId, {
            apiCallTimeout: options?.apiCallTimeout,
          });
        }
        return new MainThreadSandbox(pluginId);

      case "main-thread":
      default:
        return new MainThreadSandbox(pluginId);
    }
  }
}

// ==================== 导出 ====================

export { generateWorkerRuntime };
