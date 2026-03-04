// ==================== PluginRegistry ====================
//
// 对标 VS Code 的 ExtensionRegistry / ExtensionManagementService：
// - 解析和校验 PluginManifest
// - 维护已安装插件的注册表（PluginRegistryEntry）
// - 检查依赖关系（安装时校验、卸载时检查反向依赖）
// - 管理插件生命周期状态（installed → activating → active → deactivating → inactive）
// - 提供查询接口（按 ID、按状态、按贡献点等）
//
// 与现有 PluginHost 中 plugins Map 的区别：
// | 现有 PluginHost.plugins         | PluginRegistry                     |
// |--------------------------------|-------------------------------------|
// | 存储 Plugin 接口实例（含代码）    | 存储 PluginRegistryEntry（含 Manifest + 状态） |
// | 注册时就需要完整的插件对象        | 安装时只需 Manifest JSON，代码懒加载   |
// | 无生命周期状态跟踪              | 完整的状态机跟踪                      |
// | 无 Manifest 校验               | 安装时自动校验 Manifest                |
// | 依赖检查仅在 register 时        | 安装/卸载都做依赖检查（含反向依赖）     |
//
// 设计原则：
// - PluginRegistry 只管「数据」（Manifest + 状态），不管「行为」（激活、沙箱、API）
// - 行为由 ActivationManager / WorkerSandbox / PluginHost 协调
// - 这样做的好处：PluginRegistry 可以独立测试，不依赖 Worker 或 DOM

import type {
  PluginManifest,
  PluginRegistryEntry,
  PluginState,
  PluginEntry,
  Disposable,
} from "./manifest-types";
import { validateManifest } from "./manifest-types";

// ==================== 错误类型 ====================

/**
 * 插件安装错误
 */
export class PluginInstallError extends Error {
  public pluginId: string;
  public reason: PluginInstallErrorReason;

  constructor(pluginId: string, reason: PluginInstallErrorReason, message: string) {
    super(`[PluginRegistry] Failed to install plugin "${pluginId}": ${message}`);
    this.name = "PluginInstallError";
    this.pluginId = pluginId;
    this.reason = reason;
  }
}

export type PluginInstallErrorReason =
  | "invalid_manifest"      // Manifest 校验失败
  | "already_installed"     // 插件已安装
  | "missing_dependency"    // 依赖的插件未安装
  | "circular_dependency"   // 循环依赖
  | "version_conflict";     // 版本冲突（预留）

/**
 * 插件卸载错误
 */
export class PluginUninstallError extends Error {
  public pluginId: string;
  public reason: PluginUninstallErrorReason;

  constructor(pluginId: string, reason: PluginUninstallErrorReason, message: string) {
    super(`[PluginRegistry] Failed to uninstall plugin "${pluginId}": ${message}`);
    this.name = "PluginUninstallError";
    this.pluginId = pluginId;
    this.reason = reason;
  }
}

export type PluginUninstallErrorReason =
  | "not_installed"         // 插件未安装
  | "still_active"          // 插件仍在激活状态（需要先 deactivate）
  | "has_dependents";       // 有其他插件依赖它

// ==================== 事件类型 ====================

/**
 * 插件注册表事件
 */
export type PluginRegistryEvent =
  | { type: "installed"; pluginId: string; manifest: PluginManifest }
  | { type: "uninstalled"; pluginId: string }
  | { type: "state-changed"; pluginId: string; oldState: PluginState; newState: PluginState }
  | { type: "entry-loaded"; pluginId: string };

export type PluginRegistryEventListener = (event: PluginRegistryEvent) => void;

// ==================== PluginRegistry 主类 ====================

/**
 * PluginRegistry — 插件注册表
 *
 * 职责：
 * 1. 管理已安装插件的 Manifest 和状态
 * 2. 校验 Manifest 格式和依赖关系
 * 3. 提供安装/卸载/查询接口
 * 4. 管理插件生命周期状态转换
 * 5. 存储懒加载后的 PluginEntry 和 Disposable 资源
 *
 * 不负责：
 * - 激活插件（ActivationManager 的职责）
 * - 创建 Worker 沙箱（WorkerSandbox 的职责）
 * - 注入 API（APIProxy 的职责）
 * - 权限检查（PermissionGuard 的职责）
 */
export class PluginRegistry {
  /**
   * 已安装插件的注册表
   * key = pluginId, value = PluginRegistryEntry
   */
  private entries: Map<string, PluginRegistryEntry> = new Map();

  /**
   * 事件监听器
   */
  private listeners: Set<PluginRegistryEventListener> = new Set();

  /**
   * 是否允许安装时跳过依赖检查（调试模式）
   */
  private skipDependencyCheck: boolean;

  constructor(options?: { skipDependencyCheck?: boolean }) {
    this.skipDependencyCheck = options?.skipDependencyCheck ?? false;
  }

  // ==================== 安装 ====================

  /**
   * 安装插件（注册 Manifest，不加载代码）
   *
   * 流程：
   * 1. 校验 Manifest 格式
   * 2. 检查是否已安装
   * 3. 检查依赖关系
   * 4. 创建 PluginRegistryEntry（状态为 "installed"）
   * 5. 触发 "installed" 事件
   *
   * @param manifest 插件的 Manifest 数据
   * @throws PluginInstallError
   */
  install(manifest: PluginManifest): void {
    // 1. 校验 Manifest
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      const errorMessages = validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
      throw new PluginInstallError(
        manifest.id ?? "(unknown)",
        "invalid_manifest",
        `Manifest validation failed: ${errorMessages}`
      );
    }

    // 2. 检查是否已安装
    if (this.entries.has(manifest.id)) {
      throw new PluginInstallError(
        manifest.id,
        "already_installed",
        `Plugin "${manifest.id}" is already installed. Uninstall it first to reinstall.`
      );
    }

    // 3. 检查依赖关系
    if (!this.skipDependencyCheck && manifest.dependencies && manifest.dependencies.length > 0) {
      for (const depId of manifest.dependencies) {
        if (!this.entries.has(depId)) {
          throw new PluginInstallError(
            manifest.id,
            "missing_dependency",
            `Required dependency "${depId}" is not installed. Install it first.`
          );
        }
      }

      // 检查循环依赖
      if (this.wouldCreateCircularDependency(manifest.id, manifest.dependencies)) {
        throw new PluginInstallError(
          manifest.id,
          "circular_dependency",
          `Installing "${manifest.id}" would create a circular dependency.`
        );
      }
    }

    // 4. 创建注册表条目
    const entry: PluginRegistryEntry = {
      manifest,
      state: "installed",
      entry: null,
      disposables: [],
      installedAt: Date.now(),
      activatedAt: null,
      activationReason: null,
    };

    this.entries.set(manifest.id, entry);

    // 5. 触发事件
    this.emit({ type: "installed", pluginId: manifest.id, manifest });
  }

  /**
   * 批量安装插件（自动按依赖顺序排序）
   *
   * @param manifests 要安装的 Manifest 列表
   * @returns 安装结果（成功和失败的列表）
   */
  installBatch(
    manifests: PluginManifest[]
  ): { installed: string[]; failed: Array<{ id: string; error: string }> } {
    // 拓扑排序：按依赖关系决定安装顺序
    const sorted = this.topologicalSort(manifests);

    const installed: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const manifest of sorted) {
      try {
        this.install(manifest);
        installed.push(manifest.id);
      } catch (error) {
        failed.push({
          id: manifest.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { installed, failed };
  }

  // ==================== 卸载 ====================

  /**
   * 卸载插件
   *
   * 流程：
   * 1. 检查插件是否存在
   * 2. 检查插件是否仍在激活状态
   * 3. 检查是否有其他插件依赖它（反向依赖检查）
   * 4. 释放所有 Disposable 资源
   * 5. 从注册表中删除
   * 6. 触发 "uninstalled" 事件
   *
   * @param pluginId 插件 ID
   * @param force    强制卸载（跳过激活状态检查和反向依赖检查）
   * @throws PluginUninstallError
   */
  uninstall(pluginId: string, force: boolean = false): void {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      throw new PluginUninstallError(
        pluginId,
        "not_installed",
        `Plugin "${pluginId}" is not installed.`
      );
    }

    // 2. 检查激活状态
    if (!force && (entry.state === "active" || entry.state === "activating")) {
      throw new PluginUninstallError(
        pluginId,
        "still_active",
        `Plugin "${pluginId}" is still active. Deactivate it first.`
      );
    }

    // 3. 反向依赖检查
    if (!force) {
      const dependents = this.getDependents(pluginId);
      if (dependents.length > 0) {
        throw new PluginUninstallError(
          pluginId,
          "has_dependents",
          `Cannot uninstall "${pluginId}": plugins [${dependents.join(", ")}] depend on it.`
        );
      }
    }

    // 4. 释放所有 Disposable
    for (const disposable of entry.disposables) {
      try {
        disposable.dispose();
      } catch (error) {
        console.error(
          `[PluginRegistry] Error disposing resource for plugin "${pluginId}":`,
          error
        );
      }
    }

    // 5. 从注册表中删除
    this.entries.delete(pluginId);

    // 6. 触发事件
    this.emit({ type: "uninstalled", pluginId });
  }

  // ==================== 状态管理 ====================

  /**
   * 更新插件的生命周期状态
   *
   * 状态机：
   *   installed → activating → active
   *   active → deactivating → inactive
   *   active → error
   *   activating → error
   *   inactive → activating → active（可以重新激活）
   *   error → activating → active（可以重试）
   *
   * @param pluginId 插件 ID
   * @param newState 新状态
   * @throws Error 如果状态转换不合法
   */
  setState(pluginId: string, newState: PluginState): void {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      throw new Error(`[PluginRegistry] Plugin "${pluginId}" is not installed.`);
    }

    const oldState = entry.state;

    // 校验状态转换合法性
    if (!this.isValidTransition(oldState, newState)) {
      throw new Error(
        `[PluginRegistry] Invalid state transition for plugin "${pluginId}": ${oldState} → ${newState}`
      );
    }

    entry.state = newState;

    // 更新激活时间
    if (newState === "active") {
      entry.activatedAt = Date.now();
    }

    this.emit({ type: "state-changed", pluginId, oldState, newState });
  }

  /**
   * 设置激活原因（记录是哪个 activationEvent 触发了激活）
   */
  setActivationReason(pluginId: string, reason: string): void {
    const entry = this.entries.get(pluginId);
    if (entry) {
      entry.activationReason = reason;
    }
  }

  /**
   * 校验状态转换是否合法
   */
  private isValidTransition(from: PluginState, to: PluginState): boolean {
    const validTransitions: Record<PluginState, PluginState[]> = {
      installed: ["activating"],
      activating: ["active", "error"],
      active: ["deactivating", "error"],
      deactivating: ["inactive", "error"],
      inactive: ["activating"],
      error: ["activating", "installed"], // 可以重试激活，或重置为 installed
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  // ==================== 插件代码加载 ====================

  /**
   * 设置已加载的插件入口对象
   *
   * 由 ActivationManager 在 dynamic import() 成功后调用
   *
   * @param pluginId 插件 ID
   * @param pluginEntry 插件代码的入口对象（实现了 PluginEntry 接口）
   */
  setEntry(pluginId: string, pluginEntry: PluginEntry): void {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      throw new Error(`[PluginRegistry] Plugin "${pluginId}" is not installed.`);
    }
    entry.entry = pluginEntry;
    this.emit({ type: "entry-loaded", pluginId });
  }

  /**
   * 添加 Disposable 资源
   *
   * 插件在 activate 过程中注册的命令、事件监听等返回的 Disposable
   * 统一收集到这里，在 deactivate 或 uninstall 时批量释放
   */
  addDisposable(pluginId: string, disposable: Disposable): void {
    const entry = this.entries.get(pluginId);
    if (entry) {
      entry.disposables.push(disposable);
    }
  }

  /**
   * 释放插件的所有 Disposable 资源并清空列表
   *
   * 由 PluginHost 在 deactivate 流程中调用
   */
  disposeAll(pluginId: string): void {
    const entry = this.entries.get(pluginId);
    if (!entry) return;

    for (const disposable of entry.disposables) {
      try {
        disposable.dispose();
      } catch (error) {
        console.error(
          `[PluginRegistry] Error disposing resource for plugin "${pluginId}":`,
          error
        );
      }
    }
    entry.disposables = [];
    entry.entry = null;
    entry.activatedAt = null;
    entry.activationReason = null;
  }

  // ==================== 查询接口 ====================

  /**
   * 获取插件的注册表条目
   */
  get(pluginId: string): PluginRegistryEntry | undefined {
    return this.entries.get(pluginId);
  }

  /**
   * 获取插件的 Manifest
   */
  getManifest(pluginId: string): PluginManifest | undefined {
    return this.entries.get(pluginId)?.manifest;
  }

  /**
   * 获取插件的当前状态
   */
  getState(pluginId: string): PluginState | undefined {
    return this.entries.get(pluginId)?.state;
  }

  /**
   * 检查插件是否已安装
   */
  isInstalled(pluginId: string): boolean {
    return this.entries.has(pluginId);
  }

  /**
   * 检查插件是否已激活
   */
  isActive(pluginId: string): boolean {
    return this.entries.get(pluginId)?.state === "active";
  }

  /**
   * 获取所有已安装插件的 ID 列表
   */
  getAllIds(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * 获取所有已安装插件的注册表条目
   */
  getAll(): PluginRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * 获取所有已安装插件的 Manifest 列表
   */
  getAllManifests(): PluginManifest[] {
    return Array.from(this.entries.values()).map((e) => e.manifest);
  }

  /**
   * 按状态筛选插件
   */
  getByState(state: PluginState): PluginRegistryEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.state === state);
  }

  /**
   * 获取所有已激活的插件
   */
  getActive(): PluginRegistryEntry[] {
    return this.getByState("active");
  }

  /**
   * 获取包含指定 activationEvent 的所有插件
   *
   * @param event activationEvent 字符串（如 "onStartup"、"onCommand:translate.translateSelection"）
   * @returns 匹配的插件注册表条目
   */
  getByActivationEvent(event: string): PluginRegistryEntry[] {
    return Array.from(this.entries.values()).filter((entry) => {
      // 只返回尚未激活的插件（已激活的不需要再触发）
      if (entry.state === "active" || entry.state === "activating") {
        return false;
      }
      return entry.manifest.activationEvents.some((ae) => {
        // 精确匹配
        if (ae === event) return true;
        // 通配符 "*" 匹配所有事件
        if (ae === "*") return true;
        return false;
      });
    });
  }

  /**
   * 获取贡献了指定贡献点的所有插件
   *
   * @param contributionPoint 贡献点名称（如 "commands"、"selectionToolbar"、"statusBar"）
   * @returns 匹配的插件注册表条目
   */
  getByContributionPoint(
    contributionPoint: keyof NonNullable<PluginManifest["contributes"]>
  ): PluginRegistryEntry[] {
    return Array.from(this.entries.values()).filter((entry) => {
      const contributes = entry.manifest.contributes;
      if (!contributes) return false;
      const items = contributes[contributionPoint];
      return Array.isArray(items) && items.length > 0;
    });
  }

  /**
   * 获取已安装插件的总数
   */
  get size(): number {
    return this.entries.size;
  }

  // ==================== 依赖关系 ====================

  /**
   * 获取指定插件的依赖列表（它依赖谁）
   */
  getDependencies(pluginId: string): string[] {
    const entry = this.entries.get(pluginId);
    return entry?.manifest.dependencies ?? [];
  }

  /**
   * 获取依赖指定插件的其他插件列表（谁依赖它 —— 反向依赖）
   */
  getDependents(pluginId: string): string[] {
    const dependents: string[] = [];
    for (const [id, entry] of this.entries) {
      if (id === pluginId) continue;
      if (entry.manifest.dependencies?.includes(pluginId)) {
        dependents.push(id);
      }
    }
    return dependents;
  }

  /**
   * 检查安装某个插件是否会产生循环依赖
   *
   * 使用 DFS 检测：从目标插件的每个依赖出发，沿依赖链向上追溯，
   * 如果最终回到了目标插件本身，则存在循环依赖
   */
  private wouldCreateCircularDependency(
    pluginId: string,
    dependencies: string[]
  ): boolean {
    const visited = new Set<string>();

    const hasCycle = (currentId: string): boolean => {
      if (currentId === pluginId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);

      const entry = this.entries.get(currentId);
      if (!entry?.manifest.dependencies) return false;

      for (const depId of entry.manifest.dependencies) {
        if (hasCycle(depId)) return true;
      }
      return false;
    };

    for (const depId of dependencies) {
      if (hasCycle(depId)) return true;
    }
    return false;
  }

  /**
   * 拓扑排序：按依赖关系对 Manifest 列表排序
   *
   * 被依赖的插件排在前面（先安装），依赖者排在后面（后安装）。
   * 无依赖关系的插件保持原始顺序。
   *
   * 用于 installBatch，确保安装顺序正确。
   */
  private topologicalSort(manifests: PluginManifest[]): PluginManifest[] {
    const idToManifest = new Map<string, PluginManifest>();
    for (const m of manifests) {
      idToManifest.set(m.id, m);
    }

    const result: PluginManifest[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>(); // 用于检测循环

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        // 循环依赖，跳过（install 时会报错）
        return;
      }
      visiting.add(id);

      const manifest = idToManifest.get(id);
      if (manifest?.dependencies) {
        for (const depId of manifest.dependencies) {
          // 只排序本批次内的依赖
          if (idToManifest.has(depId)) {
            visit(depId);
          }
        }
      }

      visiting.delete(id);
      visited.add(id);
      if (manifest) {
        result.push(manifest);
      }
    };

    for (const m of manifests) {
      visit(m.id);
    }

    return result;
  }

  // ==================== 权限查询 ====================

  /**
   * 获取插件声明的权限列表
   */
  getPermissions(pluginId: string): string[] {
    const entry = this.entries.get(pluginId);
    return entry?.manifest.permissions ?? [];
  }

  /**
   * 检查插件是否声明了指定权限
   */
  hasPermission(pluginId: string, permission: string): boolean {
    return this.getPermissions(pluginId).includes(permission);
  }

  // ==================== 事件系统 ====================

  /**
   * 监听注册表事件
   *
   * @param listener 事件监听器
   * @returns 取消监听的 Disposable
   */
  onEvent(listener: PluginRegistryEventListener): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  /**
   * 触发事件
   */
  private emit(event: PluginRegistryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[PluginRegistry] Error in event listener:", error);
      }
    }
  }

  // ==================== 生命周期 ====================

  /**
   * 清空注册表（释放所有资源）
   *
   * 通常在宿主销毁时调用
   */
  clear(): void {
    // 先释放所有 Disposable
    for (const [pluginId, entry] of this.entries) {
      for (const disposable of entry.disposables) {
        try {
          disposable.dispose();
        } catch (error) {
          console.error(
            `[PluginRegistry] Error disposing resource for plugin "${pluginId}" during clear:`,
            error
          );
        }
      }
    }

    this.entries.clear();
    this.listeners.clear();
  }

  // ==================== 调试/诊断 ====================

  /**
   * 获取注册表的诊断信息（用于调试面板）
   */
  getDiagnostics(): PluginRegistryDiagnostics {
    const stateCount: Record<PluginState, number> = {
      installed: 0,
      activating: 0,
      active: 0,
      deactivating: 0,
      inactive: 0,
      error: 0,
    };

    const plugins: PluginDiagnosticInfo[] = [];

    for (const entry of this.entries.values()) {
      stateCount[entry.state]++;
      plugins.push({
        id: entry.manifest.id,
        name: entry.manifest.name,
        version: entry.manifest.version,
        state: entry.state,
        permissions: entry.manifest.permissions,
        activationEvents: entry.manifest.activationEvents,
        dependencies: entry.manifest.dependencies ?? [],
        dependents: this.getDependents(entry.manifest.id),
        disposableCount: entry.disposables.length,
        installedAt: entry.installedAt,
        activatedAt: entry.activatedAt,
        activationReason: entry.activationReason,
      });
    }

    return {
      totalPlugins: this.entries.size,
      stateCount,
      plugins,
    };
  }
}

// ==================== 诊断类型 ====================

export interface PluginRegistryDiagnostics {
  totalPlugins: number;
  stateCount: Record<PluginState, number>;
  plugins: PluginDiagnosticInfo[];
}

export interface PluginDiagnosticInfo {
  id: string;
  name: string;
  version: string;
  state: PluginState;
  permissions: string[];
  activationEvents: string[];
  dependencies: string[];
  dependents: string[];
  disposableCount: number;
  installedAt: number;
  activatedAt: number | null;
  activationReason: string | null;
}
