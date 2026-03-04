// ==================== ContributionManager ====================
//
// 对标 VS Code 的 ContributionService / MenuRegistry / CommandsRegistry：
// - 从已安装插件的 Manifest 中读取 contributes 字段
// - 按贡献点类型（commands / menus / keybindings / statusBar / selectionToolbar）分类存储
// - 提供查询接口（获取所有命令、获取可见的 selectionToolbar 按钮等）
// - 结合 ContextKeyService 过滤 when 条件
//
// 与 PluginRegistry 的关系：
// | PluginRegistry             | ContributionManager               |
// |---------------------------|-------------------------------------|
// | 管理 Manifest + 生命周期状态 | 管理 contributes 贡献点数据          |
// | 按「插件」维度组织           | 按「贡献点类型」维度组织               |
// | 提供 install/uninstall      | 提供 register/unregister/query      |
//
// 设计原则：
// - ContributionManager 只管「数据索引」，不管激活/执行
// - 命令的实际 handler 由 PluginHost 的命令注册表管理
// - ContributionManager 持有的是 Manifest 中声明的 JSON 数据，不含运行时代码
// - when 条件的求值委托给 ContextKeyService

import type {
  PluginManifest,
  PluginContributes,
  CommandContribution,
  MenuContribution,
  KeybindingContribution,
  StatusBarContribution,
  SelectionToolbarContribution,
  ViewContainerContribution,
  ViewContribution,
  ConfigurationContribution,
  TreeDataProvider,
  Disposable,
} from "./manifest-types";
import type { ContextKeyService } from "./ContextKeyService";

// ==================== 带来源的贡献类型 ====================
//
// 每个贡献项都附带 pluginId，方便反向查询「这个命令是哪个插件注册的」
// 这与 VS Code 的做法一致：MenuRegistry 中的每个 item 都记录了 extension id

export interface SourcedCommandContribution extends CommandContribution {
  /** 贡献此命令的插件 ID */
  pluginId: string;
}

export interface SourcedMenuContribution extends MenuContribution {
  /** 贡献此菜单项的插件 ID */
  pluginId: string;
}

export interface SourcedKeybindingContribution extends KeybindingContribution {
  /** 贡献此快捷键的插件 ID */
  pluginId: string;
}

export interface SourcedStatusBarContribution extends StatusBarContribution {
  /** 贡献此状态栏项的插件 ID */
  pluginId: string;
  /** 运行时动态内容（通过 api.statusBar.update 更新） */
  runtimeContent?: { label: string; value?: string; icon?: string };
  /** 运行时 tooltip（通过 api.statusBar.setTooltip 更新） */
  runtimeTooltip?: string;
  /** 运行时文字颜色（通过 api.statusBar.setColor 更新） */
  runtimeColor?: string;
  /** 运行时背景颜色（通过 api.statusBar.setBackgroundColor 更新） */
  runtimeBackgroundColor?: string;
  /** 运行时点击命令（通过 api.statusBar.setCommand 更新） */
  runtimeCommand?: string;
}

export interface SourcedViewContainerContribution extends ViewContainerContribution {
  /** 贡献此视图容器的插件 ID */
  pluginId: string;
}

export interface SourcedViewContribution extends ViewContribution {
  /** 贡献此视图的插件 ID */
  pluginId: string;
  /** 所属容器 ID */
  containerId: string;
}

export interface SourcedConfigurationContribution {
  /** 贡献此配置的插件 ID */
  pluginId: string;
  /** 配置贡献内容 */
  configuration: ConfigurationContribution;
}

export interface SourcedSelectionToolbarContribution extends SelectionToolbarContribution {
  /** 贡献此选中工具条按钮的插件 ID */
  pluginId: string;
}

// ==================== 运行时命令处理器 ====================

/**
 * 已注册的命令处理器
 *
 * Manifest 中的 contributes.commands 只是声明（JSON 数据），
 * 插件代码在 activate 时通过 api.commands.registerCommand 注册实际处理器。
 *
 * CommandRegistry 把两者关联起来：
 * - contribution: Manifest 中声明的命令元数据（title, icon 等）
 * - handler: 插件代码注册的实际处理函数
 */
export interface RegisteredCommand {
  /** Manifest 中声明的命令元数据 */
  contribution: SourcedCommandContribution;
  /** 插件代码注册的处理函数（未注册时为 null） */
  handler: ((...args: unknown[]) => unknown) | null;
}

// ==================== 事件类型 ====================

export type ContributionEvent =
  | { type: "commands-changed" }
  | { type: "menus-changed" }
  | { type: "keybindings-changed" }
  | { type: "statusbar-changed" }
  | { type: "selection-toolbar-changed" }
  | { type: "command-handler-registered"; commandId: string }
  | { type: "command-handler-unregistered"; commandId: string }
  | { type: "statusbar-content-updated"; id: string }
  | { type: "views-changed" }
  | { type: "configuration-changed" }
  | { type: "tree-data-provider-registered"; viewId: string }
  | { type: "tree-data-provider-unregistered"; viewId: string }
  | { type: "view-refresh-requested"; viewId: string };

export type ContributionEventListener = (event: ContributionEvent) => void;

// ==================== ContributionManager 主类 ====================

/**
 * ContributionManager — 贡献点管理器
 *
 * 职责：
 * 1. 从 Manifest 的 contributes 中提取贡献项，按类型分类存储
 * 2. 提供按类型查询的接口（getAllCommands, getVisibleSelectionToolbar 等）
 * 3. 结合 ContextKeyService 过滤 when 条件
 * 4. 管理命令的运行时处理器（handler 注册/注销/执行）
 * 5. 管理状态栏的运行时内容更新
 *
 * 不负责：
 * - Manifest 校验（PluginRegistry 的职责）
 * - 插件代码加载（ActivationManager 的职责）
 * - 权限检查（PermissionGuard 的职责）
 */
export class ContributionManager {
  // ── 贡献点存储（按类型分类） ──────────────────────────────────

  /** 命令贡献：key = commandId */
  private commands: Map<string, RegisteredCommand> = new Map();

  /** 菜单贡献：key = pluginId，value = 该插件的所有菜单贡献 */
  private menus: Map<string, SourcedMenuContribution[]> = new Map();

  /** 快捷键贡献：key = pluginId，value = 该插件的所有快捷键贡献 */
  private keybindings: Map<string, SourcedKeybindingContribution[]> = new Map();

  /** 状态栏贡献：key = statusBarItemId（如 "word-count.counter"） */
  private statusBarItems: Map<string, SourcedStatusBarContribution> = new Map();

  /** 选中浮动工具条贡献：key = commandId */
  private selectionToolbarItems: Map<string, SourcedSelectionToolbarContribution> = new Map();

  /** 视图容器贡献：key = containerId */
  private viewContainers: Map<string, SourcedViewContainerContribution> = new Map();

  /** 视图贡献：key = viewId */
  private viewItems: Map<string, SourcedViewContribution> = new Map();

  /** 配置贡献：key = pluginId */
  private configurations: Map<string, SourcedConfigurationContribution> = new Map();

  /** TreeDataProvider 注册表：key = viewId */
  private treeDataProviders: Map<string, TreeDataProvider> = new Map();

  /** 事件监听器 */
  private listeners: Set<ContributionEventListener> = new Set();

  /** ContextKeyService 引用（用于 when 条件求值） */
  private contextKeyService: ContextKeyService | null = null;

  // ==================== 初始化 ====================

  /**
   * 设置 ContextKeyService 引用
   *
   * 为什么不在构造函数中传入？
   * - ContributionManager 和 ContextKeyService 可能独立创建
   * - 允许延迟绑定，方便测试
   */
  setContextKeyService(service: ContextKeyService): void {
    this.contextKeyService = service;
  }

  // ==================== 注册/注销贡献点 ====================

  /**
   * 从 Manifest 中注册所有贡献点
   *
   * 由 PluginHost 在 install 插件后调用，
   * 不需要等插件代码加载（贡献点是纯 JSON 数据）
   *
   * @param pluginId 插件 ID
   * @param manifest 插件 Manifest
   */
  registerContributions(pluginId: string, manifest: PluginManifest): void {
    const contributes = manifest.contributes;
    if (!contributes) return;

    this.registerCommands(pluginId, contributes);
    this.registerMenus(pluginId, contributes);
    this.registerKeybindings(pluginId, contributes);
    this.registerStatusBar(pluginId, contributes);
    this.registerSelectionToolbar(pluginId, contributes);
    this.registerViewsContainers(pluginId, contributes);
    this.registerViews(pluginId, contributes);
    this.registerConfiguration(pluginId, contributes);
  }

  /**
   * 注销指定插件的所有贡献点
   *
   * 由 PluginHost 在 uninstall 插件时调用
   *
   * @param pluginId 插件 ID
   */
  unregisterContributions(pluginId: string): void {
    this.unregisterCommands(pluginId);
    this.unregisterMenus(pluginId);
    this.unregisterKeybindings(pluginId);
    this.unregisterStatusBar(pluginId);
    this.unregisterSelectionToolbar(pluginId);
    this.unregisterViewsContainers(pluginId);
    this.unregisterViews(pluginId);
    this.unregisterConfiguration(pluginId);
  }

  // ── 命令注册 ──────────────────────────────────────────────────

  private registerCommands(pluginId: string, contributes: PluginContributes): void {
    if (!contributes.commands) return;

    let changed = false;
    for (const cmd of contributes.commands) {
      const commandId = cmd.command;
      if (this.commands.has(commandId)) {
        console.warn(
          `[ContributionManager] Command "${commandId}" is already registered by another plugin. ` +
            `Plugin "${pluginId}" registration will overwrite it.`,
        );
      }
      this.commands.set(commandId, {
        contribution: { ...cmd, pluginId },
        handler: null, // handler 由插件 activate 后通过 registerCommandHandler 注册
      });
      changed = true;
    }

    if (changed) {
      this.emit({ type: "commands-changed" });
    }
  }

  private unregisterCommands(pluginId: string): void {
    let changed = false;
    for (const [commandId, registered] of this.commands) {
      if (registered.contribution.pluginId === pluginId) {
        this.commands.delete(commandId);
        changed = true;
      }
    }
    if (changed) {
      this.emit({ type: "commands-changed" });
    }
  }

  // ── 菜单注册 ──────────────────────────────────────────────────

  private registerMenus(pluginId: string, contributes: PluginContributes): void {
    if (!contributes.menus || contributes.menus.length === 0) return;

    const sourced: SourcedMenuContribution[] = contributes.menus.map((m) => ({
      ...m,
      pluginId,
    }));
    this.menus.set(pluginId, sourced);
    this.emit({ type: "menus-changed" });
  }

  private unregisterMenus(pluginId: string): void {
    if (this.menus.delete(pluginId)) {
      this.emit({ type: "menus-changed" });
    }
  }

  // ── 快捷键注册 ──────────────────────────────────────────────────

  private registerKeybindings(pluginId: string, contributes: PluginContributes): void {
    if (!contributes.keybindings || contributes.keybindings.length === 0) return;

    const sourced: SourcedKeybindingContribution[] = contributes.keybindings.map((k) => ({
      ...k,
      pluginId,
    }));
    this.keybindings.set(pluginId, sourced);
    this.emit({ type: "keybindings-changed" });
  }

  private unregisterKeybindings(pluginId: string): void {
    if (this.keybindings.delete(pluginId)) {
      this.emit({ type: "keybindings-changed" });
    }
  }

  // ── 状态栏注册 ──────────────────────────────────────────────────

  private registerStatusBar(pluginId: string, contributes: PluginContributes): void {
    if (!contributes.statusBar || contributes.statusBar.length === 0) return;

    let changed = false;
    for (const item of contributes.statusBar) {
      // 状态栏项 ID 用 pluginId 前缀避免冲突
      // 但 Manifest 中可能已经带了前缀（如 "word-count.counter"），不再重复加
      const itemId = item.id;
      this.statusBarItems.set(itemId, { ...item, pluginId });
      changed = true;
    }
    if (changed) {
      this.emit({ type: "statusbar-changed" });
    }
  }

  private unregisterStatusBar(pluginId: string): void {
    let changed = false;
    for (const [itemId, item] of this.statusBarItems) {
      if (item.pluginId === pluginId) {
        this.statusBarItems.delete(itemId);
        changed = true;
      }
    }
    if (changed) {
      this.emit({ type: "statusbar-changed" });
    }
  }

  // ── 选中工具条注册 ──────────────────────────────────────────────

  private registerSelectionToolbar(pluginId: string, contributes: PluginContributes): void {
    if (!contributes.selectionToolbar || contributes.selectionToolbar.length === 0) return;

    let changed = false;
    for (const item of contributes.selectionToolbar) {
      this.selectionToolbarItems.set(item.command, { ...item, pluginId });
      changed = true;
    }
    if (changed) {
      this.emit({ type: "selection-toolbar-changed" });
    }
  }

  private unregisterSelectionToolbar(pluginId: string): void {
    let changed = false;
    for (const [key, item] of this.selectionToolbarItems) {
      if (item.pluginId === pluginId) {
        this.selectionToolbarItems.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.emit({ type: "selection-toolbar-changed" });
    }
  }

  // ── 视图容器注册 ──────────────────────────────────────────────

  private registerViewsContainers(pluginId: string, contributes: PluginContributes): void {
    if (!contributes.viewsContainers?.activitybar) return;

    for (const container of contributes.viewsContainers.activitybar) {
      this.viewContainers.set(container.id, {
        ...container,
        pluginId,
      });
    }
    this.emit({ type: "views-changed" });
  }

  private unregisterViewsContainers(pluginId: string): void {
    let changed = false;
    for (const [key, item] of this.viewContainers) {
      if (item.pluginId === pluginId) {
        this.viewContainers.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.emit({ type: "views-changed" });
    }
  }

  // ── 视图注册 ──────────────────────────────────────────────────

  private registerViews(pluginId: string, contributes: PluginContributes): void {
    if (!contributes.views) return;

    for (const [containerId, views] of Object.entries(contributes.views)) {
      for (const view of views) {
        this.viewItems.set(view.id, {
          ...view,
          pluginId,
          containerId,
        });
      }
    }
    this.emit({ type: "views-changed" });
  }

  private unregisterViews(pluginId: string): void {
    let changed = false;
    for (const [key, item] of this.viewItems) {
      if (item.pluginId === pluginId) {
        // 同时清理对应的 TreeDataProvider
        this.treeDataProviders.delete(key);
        this.viewItems.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.emit({ type: "views-changed" });
    }
  }

  // ── 配置注册 ──────────────────────────────────────────────────

  private registerConfiguration(pluginId: string, contributes: PluginContributes): void {
    if (!contributes.configuration) return;

    this.configurations.set(pluginId, {
      pluginId,
      configuration: contributes.configuration,
    });
    this.emit({ type: "configuration-changed" });
  }

  private unregisterConfiguration(pluginId: string): void {
    if (this.configurations.has(pluginId)) {
      this.configurations.delete(pluginId);
      this.emit({ type: "configuration-changed" });
    }
  }

  // ==================== 命令处理器管理 ====================

  /**
   * 注册命令处理器（由插件 activate 后调用）
   *
   * 流程：
   * 1. 插件在 Manifest contributes.commands 中声明了命令（JSON 元数据）
   * 2. 插件代码在 activate 时调用 api.commands.registerCommand 注册 handler
   * 3. ContributionManager 将 handler 关联到对应的命令条目
   *
   * @param commandId 命令 ID（必须在 Manifest 中声明过）
   * @param handler   命令处理函数
   * @returns Disposable，调用 dispose() 注销处理器
   */
  registerCommandHandler(commandId: string, handler: (...args: unknown[]) => unknown): Disposable {
    const registered = this.commands.get(commandId);

    if (!registered) {
      // 命令未在 Manifest 中声明，但仍允许注册（灵活性）
      // 创建一个运行时命令条目
      this.commands.set(commandId, {
        contribution: {
          command: commandId,
          title: commandId, // 没有 Manifest 声明时，使用 commandId 作为标题
          pluginId: "__runtime__",
        },
        handler,
      });
    } else {
      registered.handler = handler;
    }

    this.emit({ type: "command-handler-registered", commandId });

    return {
      dispose: () => {
        const cmd = this.commands.get(commandId);
        if (cmd) {
          cmd.handler = null;
          this.emit({ type: "command-handler-unregistered", commandId });
        }
      },
    };
  }

  /**
   * 执行命令
   *
   * @param commandId 命令 ID
   * @param args      命令参数
   * @returns 命令处理器的返回值
   * @throws Error 如果命令未注册或没有 handler
   */
  async executeCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    const registered = this.commands.get(commandId);

    if (!registered) {
      throw new Error(`[ContributionManager] Command "${commandId}" is not registered.`);
    }

    if (!registered.handler) {
      throw new Error(
        `[ContributionManager] Command "${commandId}" has no handler. ` +
          `The plugin may not have been activated yet.`,
      );
    }

    return registered.handler(...args);
  }

  /**
   * 检查命令是否有已注册的处理器
   */
  hasCommandHandler(commandId: string): boolean {
    return this.commands.get(commandId)?.handler != null;
  }

  // ==================== 状态栏内容更新 ====================

  /**
   * 更新状态栏项的运行时内容
   *
   * 由插件通过 api.statusBar.update() 触发
   *
   * @param id      状态栏项 ID
   * @param content 新的显示内容
   */
  updateStatusBarContent(
    id: string,
    content: { label: string; value?: string; icon?: string },
  ): void {
    const item = this.statusBarItems.get(id);
    if (!item) {
      console.warn(
        `[ContributionManager] Status bar item "${id}" not found. ` +
          `Make sure it is declared in the plugin's Manifest contributes.statusBar.`,
      );
      return;
    }
    item.runtimeContent = content;
    this.emit({ type: "statusbar-content-updated", id });
  }

  /**
   * 移除状态栏项的运行时内容（恢复为 Manifest 中声明的默认值）
   */
  removeStatusBarContent(id: string): void {
    const item = this.statusBarItems.get(id);
    if (item) {
      item.runtimeContent = undefined;
      this.emit({ type: "statusbar-content-updated", id });
    }
  }

  /**
   * 设置状态栏项的运行时 tooltip
   */
  setStatusBarTooltip(id: string, text: string): void {
    const item = this.statusBarItems.get(id);
    if (!item) return;
    item.runtimeTooltip = text;
    this.emit({ type: "statusbar-content-updated", id });
  }

  /**
   * 设置状态栏项的运行时文字颜色
   */
  setStatusBarColor(id: string, color: string): void {
    const item = this.statusBarItems.get(id);
    if (!item) return;
    item.runtimeColor = color;
    this.emit({ type: "statusbar-content-updated", id });
  }

  /**
   * 设置状态栏项的运行时背景颜色
   */
  setStatusBarBackgroundColor(id: string, color: string): void {
    const item = this.statusBarItems.get(id);
    if (!item) return;
    item.runtimeBackgroundColor = color;
    this.emit({ type: "statusbar-content-updated", id });
  }

  /**
   * 设置状态栏项的运行时点击命令
   */
  setStatusBarCommand(id: string, commandId: string): void {
    const item = this.statusBarItems.get(id);
    if (!item) return;
    item.runtimeCommand = commandId;
    this.emit({ type: "statusbar-content-updated", id });
  }

  /**
   * 获取状态栏项的有效 tooltip（运行时值 > Manifest 声明值）
   */
  getStatusBarTooltip(id: string): string | undefined {
    const item = this.statusBarItems.get(id);
    if (!item) return undefined;
    return item.runtimeTooltip ?? item.tooltip;
  }

  /**
   * 获取状态栏项的有效文字颜色（运行时值 > Manifest 声明值）
   */
  getStatusBarColor(id: string): string | undefined {
    const item = this.statusBarItems.get(id);
    if (!item) return undefined;
    return item.runtimeColor ?? item.color;
  }

  /**
   * 获取状态栏项的有效背景颜色（运行时值 > Manifest 声明值）
   */
  getStatusBarBackgroundColor(id: string): string | undefined {
    const item = this.statusBarItems.get(id);
    if (!item) return undefined;
    return item.runtimeBackgroundColor ?? item.backgroundColor;
  }

  /**
   * 获取状态栏项的有效点击命令（运行时值 > Manifest 声明值）
   */
  getStatusBarCommand(id: string): string | undefined {
    const item = this.statusBarItems.get(id);
    if (!item) return undefined;
    return item.runtimeCommand ?? item.command;
  }

  // ==================== TreeDataProvider 管理 ====================

  /**
   * 注册 TreeDataProvider 到指定 view
   *
   * 由插件通过 api.views.registerTreeDataProvider 调用
   *
   * @param viewId   视图 ID（必须在 Manifest contributes.views 中声明过）
   * @param provider 树数据提供者
   * @returns Disposable
   */
  registerTreeDataProvider(viewId: string, provider: TreeDataProvider): Disposable {
    if (!this.viewItems.has(viewId)) {
      console.warn(
        `[ContributionManager] View "${viewId}" not found. ` +
          `Make sure it is declared in the plugin's Manifest contributes.views.`,
      );
    }

    this.treeDataProviders.set(viewId, provider);
    this.emit({ type: "tree-data-provider-registered", viewId });

    return {
      dispose: () => {
        this.treeDataProviders.delete(viewId);
        this.emit({ type: "tree-data-provider-unregistered", viewId });
      },
    };
  }

  /**
   * 获取指定 view 的 TreeDataProvider
   */
  getTreeDataProvider(viewId: string): TreeDataProvider | null {
    return this.treeDataProviders.get(viewId) ?? null;
  }

  /**
   * 请求刷新指定 view
   */
  refreshView(viewId: string): void {
    this.emit({ type: "view-refresh-requested", viewId });
  }

  // ==================== 查询接口 ====================

  // ── 命令查询 ──────────────────────────────────────────────────

  /**
   * 获取所有已注册的命令
   */
  getAllCommands(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * 获取指定命令的元数据
   */
  getCommand(commandId: string): RegisteredCommand | undefined {
    return this.commands.get(commandId);
  }

  /**
   * 获取指定插件注册的所有命令
   */
  getCommandsByPlugin(pluginId: string): RegisteredCommand[] {
    return Array.from(this.commands.values()).filter((c) => c.contribution.pluginId === pluginId);
  }

  /**
   * 获取所有有 handler 的命令（可执行的命令）
   */
  getExecutableCommands(): RegisteredCommand[] {
    return Array.from(this.commands.values()).filter((c) => c.handler != null);
  }

  // ── 菜单查询 ──────────────────────────────────────────────────

  /**
   * 获取所有菜单贡献
   */
  getAllMenus(): SourcedMenuContribution[] {
    const result: SourcedMenuContribution[] = [];
    for (const items of this.menus.values()) {
      result.push(...items);
    }
    return result;
  }

  /**
   * 获取当前上下文下可见的菜单项
   * 结合 ContextKeyService 过滤 when 条件
   */
  getVisibleMenus(): SourcedMenuContribution[] {
    const all = this.getAllMenus();
    if (!this.contextKeyService) return all;

    return all.filter((menu) => this.contextKeyService!.evaluate(menu.when));
  }

  /**
   * 按 group 分组获取可见菜单项
   */
  getVisibleMenusByGroup(): Map<string, SourcedMenuContribution[]> {
    const visibleMenus = this.getVisibleMenus();
    const groups = new Map<string, SourcedMenuContribution[]>();

    for (const menu of visibleMenus) {
      const group = menu.group ?? "default";
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(menu);
    }

    return groups;
  }

  // ── 快捷键查询 ──────────────────────────────────────────────────

  /**
   * 获取所有快捷键贡献
   */
  getAllKeybindings(): SourcedKeybindingContribution[] {
    const result: SourcedKeybindingContribution[] = [];
    for (const items of this.keybindings.values()) {
      result.push(...items);
    }
    return result;
  }

  /**
   * 获取当前上下文下有效的快捷键
   * 结合 ContextKeyService 过滤 when 条件
   */
  getActiveKeybindings(): SourcedKeybindingContribution[] {
    const all = this.getAllKeybindings();
    if (!this.contextKeyService) return all;

    return all.filter((kb) => this.contextKeyService!.evaluate(kb.when));
  }

  /**
   * 根据快捷键字符串查找对应的命令
   *
   * @param key 标准化的快捷键字符串（如 "Ctrl+Shift+T"）
   * @returns 匹配的命令 ID，如果没有匹配则返回 null
   */
  findCommandByKeybinding(key: string): string | null {
    const normalizedKey = normalizeKeybinding(key);
    const active = this.getActiveKeybindings();

    for (const kb of active) {
      if (normalizeKeybinding(kb.key) === normalizedKey) {
        return kb.command;
      }
    }
    return null;
  }

  // ── 状态栏查询 ──────────────────────────────────────────────────

  /**
   * 获取所有状态栏项（按 alignment 和 priority 排序）
   */
  getAllStatusBarItems(): SourcedStatusBarContribution[] {
    const items = Array.from(this.statusBarItems.values());

    // 按 priority 降序排列（priority 越大越靠前）
    items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    return items;
  }

  /**
   * 获取当前上下文下可见的状态栏项（过滤 when 条件）
   */
  getVisibleStatusBarItems(): SourcedStatusBarContribution[] {
    const all = this.getAllStatusBarItems();

    if (!this.contextKeyService) return all;

    return all.filter((item) => this.contextKeyService!.evaluate(item.when));
  }

  /**
   * 获取左侧状态栏项
   */
  getLeftStatusBarItems(): SourcedStatusBarContribution[] {
    return this.getAllStatusBarItems().filter((item) => (item.alignment ?? "left") === "left");
  }

  /**
   * 获取右侧状态栏项
   */
  getRightStatusBarItems(): SourcedStatusBarContribution[] {
    return this.getAllStatusBarItems().filter((item) => item.alignment === "right");
  }

  /**
   * 获取指定状态栏项的当前显示内容
   *
   * 优先返回运行时内容（runtimeContent），
   * 如果没有则返回 Manifest 中声明的初始 text
   */
  getStatusBarContent(id: string): { label: string; value?: string; icon?: string } | null {
    const item = this.statusBarItems.get(id);
    if (!item) return null;

    if (item.runtimeContent) {
      return item.runtimeContent;
    }

    // 从 Manifest 声明的初始值构造
    return {
      label: item.text ?? item.id,
    };
  }

  // ── 选中浮动工具条查询 ──────────────────────────────────────────

  /**
   * 获取所有选中工具条贡献
   */
  getAllSelectionToolbarItems(): SourcedSelectionToolbarContribution[] {
    return Array.from(this.selectionToolbarItems.values());
  }

  /**
   * 获取当前上下文下可见的选中工具条按钮
   *
   * 核心方法：SelectionToolbar 组件用此方法决定渲染哪些按钮
   *
   * 流程：
   * 1. 获取所有 selectionToolbar 贡献
   * 2. 用 ContextKeyService 过滤 when 条件
   * 3. 按 priority 降序排列
   *
   * @returns 可见的选中工具条按钮列表（已排序）
   */
  getVisibleSelectionToolbarItems(): SourcedSelectionToolbarContribution[] {
    const items = Array.from(this.selectionToolbarItems.values());

    // 过滤 when 条件
    const visible = this.contextKeyService
      ? items.filter((item) => this.contextKeyService!.evaluate(item.when))
      : items;

    // 按 priority 降序排列（priority 越大越靠左/前）
    visible.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    return visible;
  }

  // ── 通用查询 ──────────────────────────────────────────────────

  /**
   * 获取指定插件的所有贡献点摘要
   */
  getPluginContributions(pluginId: string): {
    commands: SourcedCommandContribution[];
    menus: SourcedMenuContribution[];
    keybindings: SourcedKeybindingContribution[];
    statusBar: SourcedStatusBarContribution[];
    selectionToolbar: SourcedSelectionToolbarContribution[];
    viewContainers: SourcedViewContainerContribution[];
    views: SourcedViewContribution[];
    configuration: ConfigurationContribution | null;
  } {
    return {
      commands: Array.from(this.commands.values())
        .filter((c) => c.contribution.pluginId === pluginId)
        .map((c) => c.contribution),
      menus: this.menus.get(pluginId) ?? [],
      keybindings: this.keybindings.get(pluginId) ?? [],
      statusBar: Array.from(this.statusBarItems.values()).filter((s) => s.pluginId === pluginId),
      selectionToolbar: Array.from(this.selectionToolbarItems.values()).filter(
        (s) => s.pluginId === pluginId,
      ),
      viewContainers: Array.from(this.viewContainers.values()).filter(
        (v) => v.pluginId === pluginId,
      ),
      views: Array.from(this.viewItems.values()).filter((v) => v.pluginId === pluginId),
      configuration: this.configurations.get(pluginId)?.configuration ?? null,
    };
  }

  // ── 视图查询 ──────────────────────────────────────────────────

  /**
   * 获取所有视图容器
   */
  getAllViewContainers(): SourcedViewContainerContribution[] {
    return Array.from(this.viewContainers.values());
  }

  /**
   * 获取指定容器下的所有视图
   */
  getViewsByContainer(containerId: string): SourcedViewContribution[] {
    return Array.from(this.viewItems.values()).filter((v) => v.containerId === containerId);
  }

  /**
   * 获取当前上下文下可见的视图（过滤 when 条件）
   */
  getVisibleViewsByContainer(containerId: string): SourcedViewContribution[] {
    const views = this.getViewsByContainer(containerId);

    if (!this.contextKeyService) return views;

    return views.filter((view) => this.contextKeyService!.evaluate(view.when));
  }

  /**
   * 获取所有视图
   */
  getAllViews(): SourcedViewContribution[] {
    return Array.from(this.viewItems.values());
  }

  // ── 配置查询 ──────────────────────────────────────────────────

  /**
   * 获取指定插件的配置贡献
   */
  getConfiguration(pluginId: string): ConfigurationContribution | null {
    return this.configurations.get(pluginId)?.configuration ?? null;
  }

  /**
   * 获取所有已注册的配置贡献
   */
  getAllConfigurations(): SourcedConfigurationContribution[] {
    return Array.from(this.configurations.values());
  }

  /**
   * 根据命令 ID 查找贡献该命令的插件 ID
   */
  getPluginIdByCommand(commandId: string): string | undefined {
    return this.commands.get(commandId)?.contribution.pluginId;
  }

  // ==================== 事件系统 ====================

  /**
   * 监听贡献点变化事件
   *
   * @param listener 事件监听器
   * @returns Disposable，调用 dispose() 取消监听
   */
  onEvent(listener: ContributionEventListener): Disposable {
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
  private emit(event: ContributionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[ContributionManager] Error in event listener:", error);
      }
    }
  }

  // ==================== 生命周期 ====================

  /**
   * 清空所有贡献点数据
   */
  clear(): void {
    this.commands.clear();
    this.menus.clear();
    this.keybindings.clear();
    this.statusBarItems.clear();
    this.selectionToolbarItems.clear();
    this.viewContainers.clear();
    this.viewItems.clear();
    this.configurations.clear();
    this.treeDataProviders.clear();
    this.listeners.clear();
  }

  // ==================== 调试/诊断 ====================

  /**
   * 获取贡献点管理器的诊断信息
   */
  getDiagnostics(): ContributionDiagnostics {
    return {
      totalCommands: this.commands.size,
      totalMenus: this.getAllMenus().length,
      totalKeybindings: this.getAllKeybindings().length,
      totalStatusBarItems: this.statusBarItems.size,
      totalSelectionToolbarItems: this.selectionToolbarItems.size,
      totalViewContainers: this.viewContainers.size,
      totalViews: this.viewItems.size,
      totalConfigurations: this.configurations.size,
      totalTreeDataProviders: this.treeDataProviders.size,
      commandsWithHandler: Array.from(this.commands.values()).filter((c) => c.handler != null)
        .length,
      commandsWithoutHandler: Array.from(this.commands.values()).filter((c) => c.handler == null)
        .length,
      commands: Array.from(this.commands.entries()).map(([id, reg]) => ({
        commandId: id,
        pluginId: reg.contribution.pluginId,
        title: reg.contribution.title,
        hasHandler: reg.handler != null,
      })),
      viewContainers: Array.from(this.viewContainers.values()).map((vc) => ({
        id: vc.id,
        title: vc.title,
        pluginId: vc.pluginId,
      })),
      views: Array.from(this.viewItems.values()).map((v) => ({
        id: v.id,
        name: v.name,
        containerId: v.containerId,
        pluginId: v.pluginId,
        hasProvider: this.treeDataProviders.has(v.id),
      })),
    };
  }
}

// ==================== 诊断类型 ====================

export interface ContributionDiagnostics {
  totalCommands: number;
  totalMenus: number;
  totalKeybindings: number;
  totalStatusBarItems: number;
  totalSelectionToolbarItems: number;
  totalViewContainers: number;
  totalViews: number;
  totalConfigurations: number;
  totalTreeDataProviders: number;
  commandsWithHandler: number;
  commandsWithoutHandler: number;
  commands: Array<{
    commandId: string;
    pluginId: string;
    title: string;
    hasHandler: boolean;
  }>;
  viewContainers: Array<{
    id: string;
    title: string;
    pluginId: string;
  }>;
  views: Array<{
    id: string;
    name: string;
    containerId: string;
    pluginId: string;
    hasProvider: boolean;
  }>;
}

// ==================== 工具函数 ====================

/**
 * 标准化快捷键字符串
 *
 * 统一大小写、修饰键顺序（Ctrl → Shift → Alt → Meta → Key）
 * 使不同写法的快捷键可以正确匹配：
 *   "ctrl+shift+t" === "Ctrl+Shift+T" === "Shift+Ctrl+T"
 *
 * @param key 原始快捷键字符串
 * @returns 标准化后的快捷键字符串
 */
function normalizeKeybinding(key: string): string {
  const parts = key.split("+").map((p) => p.trim().toLowerCase());

  // 定义修饰键顺序
  const modifierOrder = ["ctrl", "cmd", "meta", "shift", "alt", "option"];
  const modifiers: string[] = [];
  const keys: string[] = [];

  for (const part of parts) {
    if (modifierOrder.includes(part)) {
      // 统一 cmd → meta, option → alt
      if (part === "cmd") {
        modifiers.push("meta");
      } else if (part === "option") {
        modifiers.push("alt");
      } else {
        modifiers.push(part);
      }
    } else {
      keys.push(part);
    }
  }

  // 修饰键按固定顺序排列
  modifiers.sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b));

  return [...modifiers, ...keys].join("+");
}

/**
 * 导出标准化函数供外部使用（如快捷键事件处理）
 */
export { normalizeKeybinding };
