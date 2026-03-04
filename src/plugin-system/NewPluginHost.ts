// ==================== NewPluginHost ====================
//
// 新一代插件宿主 — 整合所有子模块的协调者
//
// 对标 VS Code 的 ExtensionService（主线程侧）：
// - 协调 PluginRegistry、ContributionManager、ActivationManager、
//   WorkerSandbox、PermissionGuard、ContextKeyService 的交互
// - 提供面向上层 UI 的统一 API（install / activate / executeCommand / uninstall）
// - 管理编辑器桥接（EditorBridge）和事件总线（EventBusBridge）
//
// 与旧 PluginHost 的区别：
// | 旧 PluginHost                      | NewPluginHost                              |
// |------------------------------------|--------------------------------------------|
// | 单体设计，所有逻辑在一个类中         | 分层设计，职责拆分到独立模块                  |
// | 硬编码 register + activate          | Manifest 驱动，安装与激活分离                 |
// | 无隔离                             | 支持 MainThread / Worker 两种沙箱模式         |
// | 无权限控制                          | PermissionGuard 拦截未授权 API 调用           |
// | 无 when 条件                        | ContextKeyService 求值 when 表达式            |
// | 无贡献点模型                        | ContributionManager 管理 commands/menus 等    |
// | 无按需激活                          | ActivationManager 按 activationEvents 懒加载  |
//
// 使用方式（在 page.tsx 中）：
// ```ts
// const host = new NewPluginHost({
//   editor: createContentEditableBridge(() => editorRef.current),
// });
//
// // 安装插件（只解析 Manifest，不加载代码）
// host.installPlugin(translateManifest);
// host.installPlugin(wordCountManifest);
//
// // 启动（触发 onStartup 激活事件，按需加载插件代码）
// await host.start();
//
// // 执行命令（如果插件未激活，自动触发 onCommand 激活）
// await host.executeCommand("translate.translateSelection");
//
// // 更新上下文（触发 UI 更新，如 selectionToolbar 的 when 过滤）
// host.updateContext({ editorHasSelection: true, "selection.length": 42 });
//
// // 卸载
// await host.uninstallPlugin("translate");
//
// // 销毁
// host.dispose();
// ```

import type {
  PluginManifest,
  PluginAPI,
  Disposable,
  SelectionInfo,
  ContextKeys,
} from "./manifest-types";

import { PluginRegistry } from "./PluginRegistry";
import type { PluginRegistryEvent } from "./PluginRegistry";

import { ContributionManager } from "./ContributionManager";
import type {
  SourcedStatusBarContribution,
  SourcedSelectionToolbarContribution,
  RegisteredCommand,
} from "./ContributionManager";

import { ActivationManager } from "./ActivationManager";
import type { ActivationResult, PluginLoader } from "./ActivationManager";

import { ContextKeyService } from "./ContextKeyService";
import type { ContextKeyChangeListener } from "./ContextKeyService";

import { createGuardedAPI } from "./PermissionGuard";
import type { PermissionGuard, PermissionAuditEntry } from "./PermissionGuard";

import { createPluginAPI, createSimpleEventBus } from "./APIProxy";
import type { EditorBridge, EventBusBridge } from "./APIProxy";

import { SandboxFactory, MainThreadSandbox } from "./WorkerSandbox";
import type { ISandbox } from "./WorkerSandbox";

import { DisposableStore } from "./DisposableStore";

import { PluginErrorBoundary } from "./PluginErrorBoundary";
import type { PluginErrorBoundaryConfig } from "./PluginErrorBoundary";

import { KeybindingService } from "./KeybindingService";
import type { KeybindingServiceConfig } from "./KeybindingService";

import { ConfigurationService } from "./ConfigurationService";
import type { ConfigurationServiceDiagnostics } from "./ConfigurationService";

// ==================== 配置类型 ====================

/**
 * NewPluginHost 的创建配置
 */
export interface NewPluginHostConfig {
  /**
   * 编辑器桥接（必须）
   *
   * 将编辑器操作（insertText / replaceSelection 等）暴露给插件。
   * 宿主在创建 PluginHost 时通过 createContentEditableBridge 或
   * createTextareaBridge 创建此实例。
   */
  editor: EditorBridge;

  /**
   * 事件总线（可选，默认创建内置的简单事件总线）
   *
   * 插件之间以及插件与宿主之间的通信通道。
   */
  eventBus?: EventBusBridge;

  /**
   * 沙箱模式（可选，默认 "main-thread"）
   *
   * - "main-thread": 插件代码在主线程运行（调试方便，无隔离）
   * - "worker":      插件代码在 Web Worker 中运行（生产级隔离）
   * - "auto":        自动选择（Worker 可用时用 Worker，否则主线程）
   */
  sandboxMode?: "main-thread" | "worker" | "auto";

  /**
   * 自定义插件代码加载器（可选）
   *
   * 默认使用 dynamic import() 加载 manifest.main 指定的文件。
   * 可替换为从远程 URL 加载、从 IndexedDB 缓存加载等。
   */
  pluginLoader?: PluginLoader;

  /**
   * 权限拒绝时是否抛出错误（可选，默认 true）
   *
   * false 时只记录日志，不阻断 API 调用（宽松模式，适合开发阶段）
   */
  throwOnPermissionDeny?: boolean;

  /**
   * 权限审计回调（可选）
   *
   * 每次 API 调用时回调，可用于显示权限审计面板
   */
  onPermissionAudit?: (entry: PermissionAuditEntry) => void;

  /**
   * 插件代码加载超时（毫秒，默认 10000）
   */
  loadTimeout?: number;

  /**
   * Storage key 前缀（默认 "plugin-storage:"）
   */
  storagePrefix?: string;

  /**
   * 跳过 Manifest 依赖检查（调试模式，默认 false）
   */
  skipDependencyCheck?: boolean;

  // ── 错误边界配置 ──

  /**
   * 错误边界配置（可选）
   *
   * 控制插件连续错误自动停用的阈值、Worker 重启策略等。
   * 不传则使用默认值（maxConsecutiveErrors: 3, maxWorkerRestarts: 3）。
   */
  errorBoundary?: Partial<PluginErrorBoundaryConfig>;

  // ── 快捷键配置 ──

  /**
   * 快捷键监听的目标元素（可选，默认 document）
   *
   * 传入 null 表示不自动启动快捷键监听（手动调用 keybindings.start()）。
   */
  keybindingTarget?: EventTarget | null;

  /**
   * 快捷键触发时的通知回调（可选）
   */
  onKeybindingTriggered?: KeybindingServiceConfig["onKeybindingTriggered"];
}

// ==================== 事件类型 ====================

/**
 * NewPluginHost 触发的事件
 */
export type PluginHostEvent =
  | { type: "plugin-installed"; pluginId: string; manifest: PluginManifest }
  | { type: "plugin-activated"; pluginId: string; reason: string }
  | { type: "plugin-deactivated"; pluginId: string }
  | { type: "plugin-uninstalled"; pluginId: string }
  | { type: "plugin-error"; pluginId: string; error: string }
  | { type: "plugin-auto-disabled"; pluginId: string; consecutiveErrors: number }
  | { type: "plugin-restart-attempted"; pluginId: string; attempt: number }
  | { type: "command-executed"; commandId: string }
  | { type: "command-error"; commandId: string; pluginId?: string; error: string }
  | { type: "context-changed"; key: string; value: unknown }
  | { type: "selection-changed"; info: SelectionInfo | null }
  | { type: "statusbar-updated" }
  | { type: "selection-toolbar-updated" };

export type PluginHostEventListener = (event: PluginHostEvent) => void;

// ==================== NewPluginHost 主类 ====================

/**
 * NewPluginHost — 新一代插件宿主
 *
 * 职责（协调者角色，自身不实现具体逻辑）：
 * 1. 初始化并持有所有子模块实例
 * 2. 编排安装/激活/执行/卸载的完整流程
 * 3. 连接编辑器桥接和事件总线
 * 4. 管理上下文变量和 selection 状态
 * 5. 提供面向 UI 层的查询接口
 */
export class NewPluginHost {
  // ── 子模块 ──────────────────────────────────────────────────

  /** 插件注册表 */
  readonly registry: PluginRegistry;

  /** 贡献点管理器 */
  readonly contributions: ContributionManager;

  /** 激活事件管理器 */
  readonly activation: ActivationManager;

  /** 上下文变量服务 */
  readonly contextKeys: ContextKeyService;

  /** 错误边界 */
  readonly errorBoundary: PluginErrorBoundary;

  /** 快捷键服务 */
  readonly keybindings: KeybindingService;

  /** 配置服务 */
  readonly configurationService: ConfigurationService;

  // ── 桥接层 ──────────────────────────────────────────────────

  /** 编辑器桥接 */
  private editor: EditorBridge;

  /** 事件总线 */
  private eventBus: EventBusBridge;

  // ── 插件运行时 ──────────────────────────────────────────────

  /** 每个插件的沙箱实例 */
  private sandboxes: Map<string, ISandbox> = new Map();

  /** 每个插件的权限守卫实例 */
  private guards: Map<string, PermissionGuard> = new Map();

  /** 每个插件的 PluginAPI 实例（经过权限保护的） */
  private pluginAPIs: Map<string, PluginAPI> = new Map();

  /** 每个插件内部创建的 Disposable（使用 DisposableStore 统一管理） */
  private pluginDisposables: Map<string, DisposableStore> = new Map();

  // ── 配置 ──────────────────────────────────────────────────

  private config: Required<
    Pick<
      NewPluginHostConfig,
      "sandboxMode" | "throwOnPermissionDeny" | "loadTimeout" | "storagePrefix"
    >
  > & {
    onPermissionAudit: ((entry: PermissionAuditEntry) => void) | null;
  };

  // ── 事件 ──────────────────────────────────────────────────

  /** 宿主事件监听器 */
  private listeners: Set<PluginHostEventListener> = new Set();

  /** 内部 Disposable（使用 DisposableStore 统一管理） */
  private internalDisposables: DisposableStore = new DisposableStore("NewPluginHost:internal");

  /** 是否已启动 */
  private started: boolean = false;

  /** 是否已销毁 */
  private disposed: boolean = false;

  // ==================== 构造函数 ====================

  constructor(userConfig: NewPluginHostConfig) {
    // 合并配置
    this.config = {
      sandboxMode: userConfig.sandboxMode ?? "main-thread",
      throwOnPermissionDeny: userConfig.throwOnPermissionDeny ?? true,
      loadTimeout: userConfig.loadTimeout ?? 10000,
      storagePrefix: userConfig.storagePrefix ?? "plugin-storage:",
      onPermissionAudit: userConfig.onPermissionAudit ?? null,
    };

    // 保存桥接
    this.editor = userConfig.editor;
    this.eventBus = userConfig.eventBus ?? createSimpleEventBus();

    // 初始化子模块
    this.registry = new PluginRegistry({
      skipDependencyCheck: userConfig.skipDependencyCheck,
    });

    this.contributions = new ContributionManager();

    this.contextKeys = new ContextKeyService();

    // 将 ContextKeyService 注入 ContributionManager（用于 when 过滤）
    this.contributions.setContextKeyService(this.contextKeys);

    this.activation = new ActivationManager(this.registry, {
      loader: userConfig.pluginLoader,
    });

    // 初始化配置服务
    this.configurationService = new ConfigurationService(`${this.config.storagePrefix}config:`);
    this.internalDisposables.add(this.configurationService);

    // 设置激活回调（ActivationManager 触发激活时，PluginHost 执行完整流程）
    this.activation.setActivateCallback(this.handleActivationCallback.bind(this));

    // ── 初始化错误边界 ──
    this.errorBoundary = new PluginErrorBoundary({
      ...userConfig.errorBoundary,
      onAutoDisable: (pluginId, errors) => {
        // 自动停用插件
        this.deactivatePlugin(pluginId).catch((err) => {
          console.error(`[NewPluginHost] Failed to auto-disable plugin "${pluginId}":`, err);
        });
        this.emit({
          type: "plugin-auto-disabled",
          pluginId,
          consecutiveErrors: errors.length,
        });
        // 也调用用户传入的回调
        userConfig.errorBoundary?.onAutoDisable?.(pluginId, errors);
      },
      onWorkerRestartRequest: async (pluginId, attempt) => {
        this.emit({ type: "plugin-restart-attempted", pluginId, attempt });
        try {
          // 销毁旧沙箱
          const oldSandbox = this.sandboxes.get(pluginId);
          if (oldSandbox) {
            oldSandbox.destroy();
            this.sandboxes.delete(pluginId);
          }
          // 重新激活
          const result = await this.activation.activatePlugin(
            pluginId,
            `worker-restart:${attempt}`,
          );
          return result.success;
        } catch {
          return false;
        }
      },
    });
    this.internalDisposables.add(this.errorBoundary);

    // ── 初始化快捷键服务 ──
    this.keybindings = new KeybindingService(this.contributions, this.contextKeys, {
      executeCommand: (commandId, ...args) => this.executeCommand(commandId, ...args),
      onKeybindingTriggered: userConfig.onKeybindingTriggered,
    });
    this.internalDisposables.add(this.keybindings);

    // 如果指定了 keybindingTarget（或默认 document），自动启动监听
    // 传 null 表示不自动启动
    if (userConfig.keybindingTarget !== null) {
      // 延迟到下一个微任务启动，确保构造完成
      // （start 需要访问 contributions，构造时可能尚未安装插件）
      Promise.resolve().then(() => {
        if (!this.disposed) {
          const target =
            userConfig.keybindingTarget ?? (typeof document !== "undefined" ? document : undefined);
          if (target) {
            this.keybindings.start(target);
          }
        }
      });
    }

    // 监听 Registry 事件
    const registryDisposable = this.registry.onEvent(this.handleRegistryEvent.bind(this));
    this.internalDisposables.add(registryDisposable);

    // 监听 ContextKeys 变化（更新 UI）
    const contextUnsubscribe = this.contextKeys.onChange(this.handleContextChange.bind(this));
    this.internalDisposables.add({ dispose: contextUnsubscribe });

    // 初始化默认上下文变量
    this.contextKeys.setMany({
      editorHasSelection: false,
      editorFocused: false,
      "selection.length": 0,
      "selection.text": "",
    });
  }

  // ==================== 安装/卸载 ====================

  /**
   * 安装插件
   *
   * 流程：
   * 1. 通过 PluginRegistry 校验并注册 Manifest
   * 2. 通过 ContributionManager 注册贡献点（commands / menus / keybindings 等）
   * 3. 注册快捷键到宿主的事件系统
   *
   * 注意：安装不加载代码，代码在满足 activationEvents 时才懒加载
   *
   * @param manifest 插件 Manifest
   */
  installPlugin(manifest: PluginManifest): void {
    this.assertNotDisposed();

    // 1. 注册到 Registry
    this.registry.install(manifest);

    // 2. 注册贡献点
    this.contributions.registerContributions(manifest.id, manifest);

    // 3. 注册配置 schema（如果有 contributes.configuration）
    if (manifest.contributes?.configuration) {
      this.configurationService.registerSchema(manifest.id, manifest.contributes.configuration);
    }

    // 4. 注册快捷键到事件系统
    this.setupKeybindings(manifest.id);

    // 4. 触发事件
    this.emit({
      type: "plugin-installed",
      pluginId: manifest.id,
      manifest,
    });
  }

  /**
   * 批量安装插件（自动按依赖顺序排序）
   *
   * @param manifests 插件 Manifest 列表
   * @returns 安装结果
   */
  installPlugins(manifests: PluginManifest[]): {
    installed: string[];
    failed: Array<{ id: string; error: string }>;
  } {
    this.assertNotDisposed();

    const installed: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    // 使用 Registry 的批量安装（会自动拓扑排序）
    const result = this.registry.installBatch(manifests);

    // 为成功安装的插件注册贡献点
    for (const pluginId of result.installed) {
      const manifest = this.registry.getManifest(pluginId);
      if (manifest) {
        try {
          this.contributions.registerContributions(pluginId, manifest);
          this.setupKeybindings(pluginId);
          installed.push(pluginId);

          this.emit({
            type: "plugin-installed",
            pluginId,
            manifest,
          });
        } catch (error) {
          failed.push({
            id: pluginId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // 合并 Registry 的安装失败信息
    failed.push(...result.failed);

    return { installed, failed };
  }

  /**
   * 卸载插件
   *
   * 流程：
   * 1. 如果插件处于激活状态，先停用
   * 2. 销毁沙箱
   * 3. 清理权限守卫和 API
   * 4. 注销贡献点
   * 5. 从 Registry 中移除
   *
   * @param pluginId 插件 ID
   * @param force    强制卸载（跳过反向依赖检查）
   */
  async uninstallPlugin(pluginId: string, force: boolean = false): Promise<void> {
    this.assertNotDisposed();

    // 1. 如果已激活，先停用
    if (this.registry.isActive(pluginId)) {
      await this.deactivatePlugin(pluginId);
    }

    // 2. 销毁沙箱
    const sandbox = this.sandboxes.get(pluginId);
    if (sandbox) {
      sandbox.destroy();
      this.sandboxes.delete(pluginId);
    }

    // 3. 清理权限守卫和 API
    this.guards.delete(pluginId);
    this.pluginAPIs.delete(pluginId);

    // 清理 Disposable（使用 DisposableStore）
    const store = this.pluginDisposables.get(pluginId);
    if (store) {
      const cleanedCount = store.dispose();
      console.debug(
        `[NewPluginHost] Cleaned ${cleanedCount} disposable(s) for plugin "${pluginId}" (uninstall).`,
      );
      this.pluginDisposables.delete(pluginId);
    }

    // 清理错误边界中该插件的记录
    this.errorBoundary.clearPlugin(pluginId);

    // 清理配置服务中该插件的记录
    this.configurationService.unregisterSchema(pluginId);

    // 4. 注销贡献点
    this.contributions.unregisterContributions(pluginId);

    // 5. 从 Registry 移除
    this.registry.uninstall(pluginId, force);

    // 6. 更新上下文
    this.contextKeys.set(`pluginActive.${pluginId}`, false);

    // 7. 触发事件
    this.emit({ type: "plugin-uninstalled", pluginId });
  }

  // ==================== 启动/停止 ====================

  /**
   * 启动插件宿主
   *
   * 触发 onStartup 激活事件，按需加载并激活相应插件。
   *
   * @returns 启动时激活的插件结果列表
   */
  async start(): Promise<ActivationResult[]> {
    this.assertNotDisposed();

    if (this.started) {
      console.warn("[NewPluginHost] Already started.");
      return [];
    }

    this.started = true;

    // 触发 onStartup 激活事件
    const results = await this.activation.start();

    return results;
  }

  /**
   * 停止插件宿主
   *
   * 停用所有已激活的插件，停止激活管理器。
   */
  async stop(): Promise<void> {
    if (!this.started) return;

    // 停用所有已激活的插件
    const activePlugins = this.registry.getActive();
    for (const entry of activePlugins) {
      try {
        await this.deactivatePlugin(entry.manifest.id);
      } catch (error) {
        console.error(
          `[NewPluginHost] Error deactivating plugin "${entry.manifest.id}" during stop:`,
          error,
        );
      }
    }

    // 停止激活管理器
    this.activation.stop();

    this.started = false;
  }

  // ==================== 激活/停用 ====================

  /**
   * 手动激活插件
   *
   * @param pluginId 插件 ID
   * @param reason   激活原因（默认 "manual"）
   * @returns 激活结果
   */
  async activatePlugin(pluginId: string, reason: string = "manual"): Promise<ActivationResult> {
    this.assertNotDisposed();
    return this.activation.activatePlugin(pluginId, reason);
  }

  /**
   * 停用插件
   *
   * 流程：
   * 1. 通过沙箱调用 pluginEntry.deactivate()
   * 2. 释放所有 Disposable 资源
   * 3. 更新 Registry 状态
   * 4. 更新上下文变量
   *
   * @param pluginId 插件 ID
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    this.assertNotDisposed();

    const entry = this.registry.get(pluginId);
    if (!entry || entry.state !== "active") {
      return; // 非激活状态，跳过
    }

    try {
      // 更新状态
      this.registry.setState(pluginId, "deactivating");

      // 通过沙箱停用
      const sandbox = this.sandboxes.get(pluginId);
      if (sandbox) {
        await sandbox.deactivate();
      }

      // 释放 Disposable
      this.registry.disposeAll(pluginId);

      const store = this.pluginDisposables.get(pluginId);
      if (store) {
        const cleanedCount = store.clear(); // clear 而非 dispose — 插件可能被重新激活
        console.debug(
          `[NewPluginHost] Cleaned ${cleanedCount} disposable(s) for plugin "${pluginId}" (deactivate).`,
        );
      }

      // 更新状态
      this.registry.setState(pluginId, "inactive");

      // 更新上下文
      this.contextKeys.set(`pluginActive.${pluginId}`, false);

      // 触发事件
      this.emit({ type: "plugin-deactivated", pluginId });
    } catch (error) {
      console.error(`[NewPluginHost] Error deactivating plugin "${pluginId}":`, error);
      this.registry.setState(pluginId, "error");
      throw error;
    }
  }

  // ==================== 命令执行 ====================

  /**
   * 执行命令
   *
   * 流程：
   * 1. 检查命令是否有已注册的 handler
   * 2. 如果没有 handler，检查是否有插件响应 onCommand 激活事件
   * 3. 如果有，触发插件激活，等待激活完成后重新执行命令
   * 4. 执行命令 handler
   *
   * @param commandId 命令 ID（如 "translate.translateSelection"）
   * @param args      命令参数
   * @returns 命令执行结果
   */
  async executeCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    this.assertNotDisposed();

    // 查找命令所属插件（用于错误记录）
    const ownerPluginId = this.contributions.getPluginIdByCommand(commandId) ?? undefined;

    try {
      // 1. 检查是否已有 handler
      if (this.contributions.hasCommandHandler(commandId)) {
        const result = await this.contributions.executeCommand(commandId, ...args);
        this.emit({ type: "command-executed", commandId });
        // 命令执行成功，重置该插件的连续错误计数
        if (ownerPluginId) {
          this.errorBoundary.recordSuccess(ownerPluginId);
        }
        return result;
      }

      // 2. 尝试触发 onCommand 激活
      const activationResult = await this.activation.triggerOnCommand(commandId, ...args);

      // 3. 激活后重试执行命令
      if (
        activationResult &&
        typeof activationResult === "object" &&
        "__activated" in (activationResult as Record<string, unknown>)
      ) {
        // 插件已激活，重新检查 handler
        if (this.contributions.hasCommandHandler(commandId)) {
          const result = await this.contributions.executeCommand(commandId, ...args);
          this.emit({ type: "command-executed", commandId });
          if (ownerPluginId) {
            this.errorBoundary.recordSuccess(ownerPluginId);
          }
          return result;
        }
      }

      // 4. 仍然没有 handler，报错
      throw new Error(
        `[NewPluginHost] Command "${commandId}" has no handler. ` +
          `No plugin registered a handler for this command.`,
      );
    } catch (error) {
      // 记录到错误边界
      if (ownerPluginId) {
        this.errorBoundary.recordError(ownerPluginId, error, "command", {
          commandId,
        });
      }

      // 发出 command-error 事件（UI 可以据此展示 toast 等）
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit({
        type: "command-error",
        commandId,
        pluginId: ownerPluginId,
        error: errorMessage,
      });

      // 仍然抛出，让调用方也能 catch
      throw error;
    }
  }

  // ==================== 上下文管理 ====================

  /**
   * 更新上下文变量
   *
   * 触发 when 条件重新求值，影响 selectionToolbar / menu 的可见性。
   *
   * @param entries 上下文变量键值对
   */
  updateContext(entries: Partial<ContextKeys> | Record<string, unknown>): void {
    this.contextKeys.setMany(entries);
  }

  /**
   * 更新选区信息
   *
   * 由宿主在 selection 变化时调用，会：
   * 1. 更新上下文变量（editorHasSelection, selection.length, selection.text）
   * 2. 通过事件总线广播 selection-change 事件
   * 3. 触发 onEvent:editor:selection-change 激活事件
   *
   * @param info 选区信息（null 表示无选区）
   */
  updateSelection(info: SelectionInfo | null): void {
    // 1. 更新上下文变量
    this.contextKeys.setMany({
      editorHasSelection: info != null && info.text.length > 0,
      "selection.length": info?.text.length ?? 0,
      "selection.text": info?.text ?? "",
    });

    // 2. 广播事件
    if (info) {
      this.eventBus.emit("editor:selection-change", info);
    }

    // 3. 触发 onEvent 激活
    if (info && info.text.length > 0) {
      this.activation.triggerOnEvent("editor:selection-change").catch((error) => {
        console.error("[NewPluginHost] Error triggering onEvent:editor:selection-change:", error);
      });
    }

    // 4. 触发宿主事件
    this.emit({ type: "selection-changed", info });
  }

  /**
   * 更新编辑器内容变化通知
   *
   * 由宿主在编辑器内容变化时调用
   */
  notifyContentChange(): void {
    this.eventBus.emit("content:change");

    // 触发 onEvent 激活
    this.activation.triggerOnEvent("content:change").catch((error) => {
      console.error("[NewPluginHost] Error triggering onEvent:content:change:", error);
    });
  }

  // ==================== UI 查询接口 ====================

  /**
   * 获取当前可见的选中浮动工具条按钮
   *
   * 结合 ContextKeyService 过滤 when 条件，
   * 返回应该渲染在 SelectionToolbar 中的按钮列表。
   *
   * @returns 可见的工具条按钮（已按 priority 排序）
   */
  getVisibleSelectionToolbarItems(): SourcedSelectionToolbarContribution[] {
    return this.contributions.getVisibleSelectionToolbarItems();
  }

  /**
   * 获取所有状态栏项
   *
   * @returns 状态栏项列表（已按 priority 排序）
   */
  getStatusBarItems(): SourcedStatusBarContribution[] {
    return this.contributions.getAllStatusBarItems();
  }

  /**
   * 获取左侧状态栏项
   */
  getLeftStatusBarItems(): SourcedStatusBarContribution[] {
    return this.contributions.getLeftStatusBarItems();
  }

  /**
   * 获取右侧状态栏项
   */
  getRightStatusBarItems(): SourcedStatusBarContribution[] {
    return this.contributions.getRightStatusBarItems();
  }

  /**
   * 获取状态栏项的当前显示内容
   *
   * @param id 状态栏项 ID
   * @returns 显示内容
   */
  getStatusBarContent(id: string): { label: string; value?: string; icon?: string } | null {
    return this.contributions.getStatusBarContent(id);
  }

  /**
   * 获取所有已注册的命令
   */
  getAllCommands(): RegisteredCommand[] {
    return this.contributions.getAllCommands();
  }

  /**
   * 获取所有可执行的命令（有 handler 的）
   */
  getExecutableCommands(): RegisteredCommand[] {
    return this.contributions.getExecutableCommands();
  }

  /**
   * 获取已安装的所有插件 Manifest
   */
  getInstalledPlugins(): PluginManifest[] {
    return this.registry.getAllManifests();
  }

  /**
   * 获取指定插件的权限守卫（用于权限审计面板）
   */
  getPermissionGuard(pluginId: string): PermissionGuard | undefined {
    return this.guards.get(pluginId);
  }

  // ==================== 事件系统 ====================

  /**
   * 监听宿主事件
   *
   * @param listener 事件监听器
   * @returns Disposable，调用 dispose() 取消监听
   */
  onEvent(listener: PluginHostEventListener): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  // ==================== 插件事件总线监听 ====================

  /**
   * 监听插件通过 eventBus 发出的事件
   *
   * 用于让宿主 UI 层监听插件发出的自定义事件，如：
   * - "ui:show-popup"：插件请求显示弹窗（表情面板、图片上传表单等）
   * - "auto-save:saved"：自动保存完成通知
   * - "image-upload:inserted"：图片插入完成通知
   *
   * 与 onEvent 的区别：
   * - onEvent：监听宿主级别的生命周期事件（plugin-installed / plugin-activated 等）
   * - onPluginEvent：监听插件通过 api.events.emit() 发出的业务事件
   *
   * @param event 事件名
   * @param handler 事件处理器
   * @returns Disposable，调用 dispose() 取消监听
   */
  onPluginEvent(event: string, handler: (...args: unknown[]) => void): Disposable {
    this.assertNotDisposed();
    this.eventBus.on(event, handler);
    return {
      dispose: () => {
        this.eventBus.off(event, handler);
      },
    };
  }

  // ==================== 生命周期 ====================

  /**
   * 销毁插件宿主
   *
   * 释放所有资源：
   * 1. 停止激活管理器
   * 2. 停用所有插件
   * 3. 销毁所有沙箱
   * 4. 清空 Registry 和 ContributionManager
   * 5. 重置 ContextKeyService
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // 停止激活管理器
    this.activation.dispose();

    // 销毁所有沙箱
    for (const [, sandbox] of this.sandboxes) {
      try {
        sandbox.destroy();
      } catch (error) {
        console.error("[NewPluginHost] Error destroying sandbox:", error);
      }
    }
    this.sandboxes.clear();

    // 清理所有插件 Disposable（使用 DisposableStore）
    for (const [pluginId, store] of this.pluginDisposables) {
      const cleanedCount = store.dispose();
      console.debug(
        `[NewPluginHost] Cleaned ${cleanedCount} disposable(s) for plugin "${pluginId}" (host dispose).`,
      );
    }
    this.pluginDisposables.clear();

    // 清空子模块
    this.registry.clear();
    this.contributions.clear();
    this.contextKeys.reset();

    // 清理内部 Disposable（DisposableStore 统一管理）
    const internalCleaned = this.internalDisposables.dispose();
    console.debug(`[NewPluginHost] Cleaned ${internalCleaned} internal disposable(s).`);

    // 清空运行时数据
    this.guards.clear();
    this.pluginAPIs.clear();
    this.listeners.clear();
  }

  // ==================== 诊断/调试 ====================

  /**
   * 获取宿主的完整诊断信息
   */
  getDiagnostics(): NewPluginHostDiagnostics {
    return {
      started: this.started,
      disposed: this.disposed,
      sandboxMode: this.config.sandboxMode,
      registry: this.registry.getDiagnostics(),
      contributions: this.contributions.getDiagnostics(),
      activation: this.activation.getDiagnostics(),
      contextKeys: this.contextKeys.getAll(),
      sandboxes: Array.from(this.sandboxes.entries()).map(([pluginId, sandbox]) => ({
        pluginId,
        type: sandbox.type,
        state: sandbox.state,
      })),
      guards: Array.from(this.guards.entries()).map(([pluginId, guard]) => {
        const diagnostics = guard.getDiagnostics();
        return {
          ...diagnostics,
          pluginId,
        };
      }),
      errorBoundary: this.errorBoundary.getDiagnostics(),
      keybindings: this.keybindings.getDiagnostics(),
      configurationService: this.configurationService.getDiagnostics(),
      pluginDisposables: Array.from(this.pluginDisposables.entries()).map(([pluginId, store]) => ({
        pluginId,
        ...store.getDiagnostics(),
      })),
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 激活回调 — ActivationManager 在需要激活插件时调用此方法
   *
   * 这是整个激活流程的核心编排：
   * 1. 获取已加载的 PluginEntry
   * 2. 创建沙箱
   * 3. 初始化沙箱
   * 4. 创建 PluginAPI（真实实现）
   * 5. 创建 PermissionGuard（权限包装）
   * 6. 通过沙箱激活插件（调用 entry.activate(guardedAPI)）
   * 7. 更新上下文变量
   */
  private async handleActivationCallback(pluginId: string, reason: string): Promise<void> {
    const registryEntry = this.registry.get(pluginId);
    if (!registryEntry) {
      throw new Error(`[NewPluginHost] Plugin "${pluginId}" not found in registry.`);
    }

    const manifest = registryEntry.manifest;
    const pluginEntry = registryEntry.entry;

    // 1. 创建沙箱
    const sandbox = SandboxFactory.create(pluginId, {
      mode: this.config.sandboxMode,
    });
    this.sandboxes.set(pluginId, sandbox);

    // 2. 初始化沙箱
    await sandbox.init(manifest, pluginEntry);

    // 3. 如果是 MainThreadSandbox 且有 entry，设置 entry
    if (sandbox instanceof MainThreadSandbox && pluginEntry) {
      sandbox.setEntry(pluginEntry);
    }

    // 4. 创建 PluginAPI（真实实现，不经过权限检查）
    const { api: realAPI, disposables: apiDisposables } = createPluginAPI({
      pluginId,
      editor: this.editor,
      eventBus: this.eventBus,
      contributionManager: this.contributions,
      storagePrefix: this.config.storagePrefix,
      configurationService: this.configurationService,
    });

    // 保存 API 创建的 Disposable（使用 DisposableStore）
    let store = this.pluginDisposables.get(pluginId);
    if (!store) {
      store = new DisposableStore(`plugin:${pluginId}`);
      this.pluginDisposables.set(pluginId, store);
    }
    store.addMany(apiDisposables);

    // 5. 创建 PermissionGuard（权限包装）
    const { guardedAPI, guard } = createGuardedAPI(pluginId, manifest.permissions, realAPI, {
      throwOnDeny: this.config.throwOnPermissionDeny,
      auditCallback: this.config.onPermissionAudit ?? undefined,
    });

    this.guards.set(pluginId, guard);
    this.pluginAPIs.set(pluginId, guardedAPI);

    // 6. 通过沙箱激活插件
    try {
      await sandbox.activate(guardedAPI);
    } catch (error) {
      // 激活失败，清理资源
      sandbox.destroy();
      this.sandboxes.delete(pluginId);
      this.guards.delete(pluginId);
      this.pluginAPIs.delete(pluginId);
      throw error;
    }

    // 7. 更新上下文变量
    this.contextKeys.set(`pluginActive.${pluginId}`, true);

    // 8. 记录激活成功（重置连续错误计数）
    this.errorBoundary.recordSuccess(pluginId);

    // 9. 触发事件
    this.emit({ type: "plugin-activated", pluginId, reason });
  }

  /**
   * 处理 Registry 事件
   */
  private handleRegistryEvent(event: PluginRegistryEvent): void {
    switch (event.type) {
      case "state-changed":
        if (event.newState === "error") {
          this.emit({
            type: "plugin-error",
            pluginId: event.pluginId,
            error: `Plugin state changed to error from ${event.oldState}`,
          });
        }
        break;
    }
  }

  /**
   * 处理上下文变量变化
   */
  private handleContextChange: ContextKeyChangeListener = (
    key: string,
    newValue: unknown,
    _oldValue: unknown,
  ): void => {
    this.emit({ type: "context-changed", key, value: newValue });

    // 如果是与 selection 相关的变化，触发工具条更新
    if (key === "editorHasSelection" || key === "selection.length" || key === "selection.text") {
      this.emit({ type: "selection-toolbar-updated" });
    }
  };

  /**
   * 为插件设置快捷键监听
   *
   * 从 ContributionManager 获取插件的 keybindings，
   * 注册到宿主的全局键盘事件监听中。
   */
  private setupKeybindings(_pluginId: string): void {
    // 快捷键监听已由 KeybindingService 统一管理。
    // ContributionManager 负责注册 keybinding 贡献点，
    // KeybindingService 在全局 keydown 中通过
    // contributions.findCommandByKeybinding(key) 查找并执行命令。
    //
    // 此方法预留为未来添加插件级快捷键处理逻辑的扩展点。
  }

  /**
   * 触发宿主事件
   */
  private emit(event: PluginHostEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[NewPluginHost] Error in event listener:", error);
      }
    }
  }

  /**
   * 断言宿主未被销毁
   */
  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("[NewPluginHost] Plugin host has been disposed.");
    }
  }
}

// ==================== 诊断类型 ====================

export interface NewPluginHostDiagnostics {
  started: boolean;
  disposed: boolean;
  sandboxMode: string;
  registry: import("./PluginRegistry").PluginRegistryDiagnostics;
  contributions: import("./ContributionManager").ContributionDiagnostics;
  activation: import("./ActivationManager").ActivationManagerDiagnostics;
  contextKeys: Record<string, unknown>;
  sandboxes: Array<{ pluginId: string; type: string; state: string }>;
  guards: Array<import("./PermissionGuard").PermissionGuardDiagnostics & { pluginId: string }>;
  errorBoundary: import("./PluginErrorBoundary").PluginErrorBoundaryDiagnostics;
  keybindings: import("./KeybindingService").KeybindingDiagnostics;
  configurationService: ConfigurationServiceDiagnostics;
  pluginDisposables: Array<
    import("./DisposableStore").DisposableStoreDiagnostics & { pluginId: string }
  >;
}
