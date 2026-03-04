// ==================== Demo 1: VS Code 级插件系统 — Manifest 类型定义 ====================
//
// 对标 VS Code 的 package.json contributes 模型：
// - 宿主读取 Manifest 就能知道插件贡献了什么，不需要加载插件代码
// - 插件代码只在满足 activationEvents 时才加载（按需激活）
// - when 条件控制 UI 元素的可见性（上下文感知）
// - 权限声明控制插件可调用的 API 范围
//
// 参考资料：
// - https://code.visualstudio.com/api/references/contribution-points
// - https://code.visualstudio.com/api/references/activation-events
// - https://code.visualstudio.com/api/references/vscode-api

// ==================== Manifest ====================

/**
 * PluginManifest —— 插件的声明式描述文件
 *
 * 对标 VS Code 的 package.json：
 * - 纯 JSON 数据，不含代码
 * - 宿主在安装时解析 Manifest，注册贡献点
 * - 插件代码在满足 activationEvents 时才通过 dynamic import() 加载
 *
 * 与现有 Plugin 接口的区别：
 * | 现有 Plugin           | PluginManifest          |
 * |-----------------------|-------------------------|
 * | 代码中硬编码注册       | JSON 声明式              |
 * | 全部一次性 activate    | 按 activationEvents 按需 |
 * | 无隔离                | Web Worker 沙箱          |
 * | 无权限限制            | permissions 白名单       |
 * | extensions 对象       | contributes 贡献点       |
 */
export interface PluginManifest {
  /** 插件全局唯一标识符（如 "translate"、"word-count"） */
  id: string;

  /** 显示名称 */
  name: string;

  /** 版本号（semver 格式，如 "1.0.0"） */
  version: string;

  /** 插件描述 */
  description?: string;

  /** 插件图标（emoji 或 URL） */
  icon?: string;

  /** 插件作者 */
  author?: string;

  /**
   * 入口文件路径（相对于插件根目录）
   * 对标 VS Code 的 "main" 字段
   * 宿主在激活插件时通过 dynamic import() 加载此文件
   */
  main: string;

  /**
   * 激活条件列表
   *
   * 对标 VS Code 的 activationEvents：
   * - "onStartup"              — 启动时立即激活
   * - "onCommand:xxx"          — 当命令 xxx 被调用时激活
   * - "onEvent:xxx"            — 当事件 xxx 触发时激活（如 "onEvent:editor:selection-change"）
   *
   * 多个条件之间是 OR 关系：满足任一条件即激活
   */
  activationEvents: string[];

  /**
   * 权限声明
   *
   * 插件只能调用 Manifest 中声明的 API 能力
   * 调用未声明的 API 会被 PermissionGuard 拦截并抛出 PermissionDeniedError
   *
   * 可用权限：
   * - "editor:insertText"      — 向编辑器插入文字
   * - "editor:replaceSelection" — 替换选中文字
   * - "editor:getSelectedText" — 读取选中文字
   * - "editor:getContent"      — 读取编辑器全部内容
   * - "editor:onSelectionChange" — 监听选区变化
   * - "commands:register"      — 注册命令
   * - "commands:execute"       — 执行命令
   * - "statusBar:update"       — 更新状态栏
   * - "statusBar:remove"       — 移除状态栏项
   * - "events:on"              — 监听事件
   * - "events:emit"            — 触发事件
   * - "storage:get"            — 读取插件存储
   * - "storage:set"            — 写入插件存储
   * - "ui:selectionToolbar"    — 参与选中浮动工具条
   */
  permissions: Permission[];

  /**
   * 依赖的其他插件 ID 列表
   * 安装时检查依赖是否已安装，否则报错
   */
  dependencies?: string[];

  /**
   * 贡献点声明（纯 JSON 数据，不含代码）
   *
   * 对标 VS Code 的 contributes 字段：
   * 宿主读取 contributes 就能注册命令、菜单、快捷键、状态栏等，
   * 不需要加载插件代码。
   */
  contributes?: PluginContributes;
}

// ==================== Contributes（贡献点） ====================

/**
 * PluginContributes —— 插件的贡献点集合
 *
 * 对标 VS Code 的 contributes 字段
 * 每种贡献点都是纯 JSON 描述，不含运行时代码
 */
export interface PluginContributes {
  /** 命令贡献 */
  commands?: CommandContribution[];

  /** 菜单贡献（命令出现在哪些菜单中） */
  menus?: MenuContribution[];

  /** 快捷键贡献 */
  keybindings?: KeybindingContribution[];

  /** 状态栏贡献 */
  statusBar?: StatusBarContribution[];

  /** 选中文字浮动工具条贡献 */
  selectionToolbar?: SelectionToolbarContribution[];

  /** 配置贡献（插件声明可配置项，宿主自动渲染设置 UI） */
  configuration?: ConfigurationContribution;

  /** 视图容器贡献（Activity Bar 上的图标入口） */
  viewsContainers?: {
    activitybar?: ViewContainerContribution[];
  };

  /** 视图贡献（侧边栏面板内容，按 container id 分组） */
  views?: Record<string, ViewContribution[]>;
}

/**
 * 命令贡献
 *
 * 对标 VS Code 的 contributes.commands：
 * ```jsonc
 * { "command": "myPlugin.sayHello", "title": "Hello World", "icon": "👋" }
 * ```
 */
export interface CommandContribution {
  /** 命令 ID（全局唯一，通常以插件 ID 为前缀，如 "translate.translateSelection"） */
  command: string;
  /** 命令标题（显示在命令面板中） */
  title: string;
  /** 命令图标（emoji 或图标名） */
  icon?: string;
  /** 命令分类（用于命令面板分组） */
  category?: string;
}

/**
 * 菜单贡献
 *
 * 对标 VS Code 的 contributes.menus：
 * 控制命令出现在哪些菜单中，以及在什么上下文条件下可见
 */
export interface MenuContribution {
  /** 引用的命令 ID */
  command: string;
  /** 上下文条件表达式（如 "editorHasSelection && selection.length > 0"） */
  when?: string;
  /** 菜单分组（用于菜单内分隔符，如 "editor/context"、"editor/title"） */
  group?: string;
  /** 排序优先级（数字越小越靠前） */
  order?: number;
}

/**
 * 快捷键贡献
 *
 * 对标 VS Code 的 contributes.keybindings：
 * ```jsonc
 * { "command": "translate.translateSelection", "key": "Ctrl+Shift+T", "when": "editorHasSelection" }
 * ```
 */
export interface KeybindingContribution {
  /** 引用的命令 ID */
  command: string;
  /** 快捷键字符串（如 "Ctrl+Shift+T"、"Cmd+K"） */
  key: string;
  /** 上下文条件表达式（只在满足条件时响应快捷键） */
  when?: string;
}

/**
 * 状态栏贡献
 *
 * 对标 VS Code 的 StatusBar API：
 * 插件通过贡献点声明状态栏项的初始配置，
 * 运行时通过 api.statusBar.update() 更新内容
 */
export interface StatusBarContribution {
  /** 状态栏项 ID（插件内唯一） */
  id: string;
  /** 初始文本 */
  text?: string;
  /** 点击时执行的命令 ID */
  command?: string;
  /** 排序优先级（数字越大越靠左） */
  priority?: number;
  /** 显示位置 */
  alignment?: "left" | "right";
  /** 鼠标悬停提示文字 */
  tooltip?: string;
  /** 文字颜色（CSS 颜色值，如 "#fff"、"rgb(0,255,0)"） */
  color?: string;
  /** 背景颜色（CSS 颜色值） */
  backgroundColor?: string;
  /** 上下文条件表达式（控制该状态栏项是否可见） */
  when?: string;
}

/**
 * 选中文字浮动工具条贡献
 *
 * 对标 VS Code 的 editor/context menu，但简化为浮动工具条按钮：
 * 当用户选中文字时，宿主从 ContributionManager 获取所有 selectionToolbar 贡献，
 * 渲染浮动工具条按钮。点击按钮时执行对应的命令。
 */
export interface SelectionToolbarContribution {
  /** 引用的命令 ID */
  command: string;
  /** 按钮标题 */
  title: string;
  /** 按钮图标 */
  icon?: string;
  /** 上下文条件表达式（如 "selection.length > 0"） */
  when?: string;
  /** 排序优先级（数字越大越靠左） */
  priority?: number;
}

// ==================== Configuration Contribution ====================

/**
 * 配置属性的 Schema 定义
 *
 * 对标 VS Code 的 contributes.configuration.properties 中每个属性的定义
 */
export interface ConfigurationPropertySchema {
  /** 值类型 */
  type: "string" | "number" | "boolean" | "enum";
  /** 默认值 */
  default: unknown;
  /** 属性描述（显示在设置 UI 中） */
  description: string;
  /** 可选值列表（仅当 type 为 "enum" 时使用） */
  enum?: string[];
  /** 最小值（仅当 type 为 "number" 时使用） */
  minimum?: number;
  /** 最大值（仅当 type 为 "number" 时使用） */
  maximum?: number;
}

/**
 * 配置贡献
 *
 * 对标 VS Code 的 contributes.configuration：
 * ```jsonc
 * { "title": "My Plugin Settings", "properties": { "myPlugin.greeting": { "type": "string", "default": "Hello", "description": "..." } } }
 * ```
 */
export interface ConfigurationContribution {
  /** 设置分组标题 */
  title: string;
  /** 配置属性映射（key 通常以 pluginId 为前缀，如 "autoSave.interval"） */
  properties: Record<string, ConfigurationPropertySchema>;
}

// ==================== View Contributions ====================

/**
 * 视图容器贡献
 *
 * 对标 VS Code 的 contributes.viewsContainers.activitybar：
 * 在 Activity Bar 上显示一个图标入口，点击后展示对应的侧边栏面板
 */
export interface ViewContainerContribution {
  /** 容器 ID（全局唯一） */
  id: string;
  /** 容器标题 */
  title: string;
  /** 容器图标（emoji 或图标名） */
  icon: string;
}

/**
 * 视图贡献
 *
 * 对标 VS Code 的 contributes.views：
 * 声明在某个 ViewContainer 中显示一个面板视图
 */
export interface ViewContribution {
  /** 视图 ID（全局唯一） */
  id: string;
  /** 视图显示名称 */
  name: string;
  /** 可见性条件表达式 */
  when?: string;
}

// ==================== TreeView API ====================

/**
 * 树节点
 *
 * 对标 VS Code 的 TreeItem：
 * 插件通过 TreeDataProvider 提供这些节点，宿主负责渲染
 */
export interface TreeItem {
  /** 节点 ID */
  id: string;
  /** 节点标签 */
  label: string;
  /** 节点图标（emoji 或图标名） */
  icon?: string;
  /** 节点描述（显示在标签右侧） */
  description?: string;
  /** 折叠状态 */
  collapsibleState?: "collapsed" | "expanded" | "none";
  /** 点击时执行的命令 */
  command?: { commandId: string; args?: unknown[] };
  /** 子节点（如果有，优先使用；否则通过 TreeDataProvider.getChildren 获取） */
  children?: TreeItem[];
}

/**
 * 树数据提供者
 *
 * 对标 VS Code 的 TreeDataProvider：
 * 插件实现此接口，宿主通过 getChildren 获取树形数据
 */
export interface TreeDataProvider {
  /** 获取子节点（parentId 为空时获取根节点） */
  getChildren(parentId?: string): TreeItem[] | Promise<TreeItem[]>;
  /** 数据变更通知（插件调用此回调的 handler 通知宿主刷新 view） */
  onDidChangeTreeData?: (handler: () => void) => Disposable;
}

/**
 * Views API — 注入给插件的视图操作接口
 *
 * 对标 VS Code 的 window.createTreeView / registerTreeDataProvider
 */
export interface ViewsAPI {
  /** 注册 TreeDataProvider 到指定 view */
  registerTreeDataProvider(viewId: string, provider: TreeDataProvider): Disposable;
  /** 刷新指定 view（触发重新获取数据） */
  refreshView(viewId: string): void;
}

// ==================== Configuration API ====================

/**
 * Configuration API — 注入给插件的配置操作接口
 *
 * 对标 VS Code 的 workspace.getConfiguration
 */
export interface ConfigurationAPI {
  /** 获取配置值（先查用户设置，再查默认值） */
  get<T>(key: string): T;
  /** 更新配置值 */
  update(key: string, value: unknown): void;
  /** 监听配置变更 */
  onDidChange(key: string, handler: (newValue: unknown) => void): Disposable;
}

// ==================== Permission ====================

/**
 * 权限类型
 *
 * 对标 VS Code 的权限模型（VS Code 是隐式的，我们显式化）：
 * 插件在 Manifest 中声明需要哪些能力，
 * PermissionGuard 在运行时拦截未声明的 API 调用
 */
export type Permission =
  | "editor:insertText"
  | "editor:replaceSelection"
  | "editor:getSelectedText"
  | "editor:getContent"
  | "editor:onSelectionChange"
  | "editor:openTab"
  | "editor:closeTab"
  | "commands:register"
  | "commands:execute"
  | "statusBar:update"
  | "statusBar:remove"
  | "statusBar:setTooltip"
  | "statusBar:setColor"
  | "statusBar:setBackgroundColor"
  | "statusBar:setCommand"
  | "events:on"
  | "events:emit"
  | "storage:get"
  | "storage:set"
  | "configuration:read"
  | "configuration:write"
  | "views:register"
  | "ui:selectionToolbar";

/**
 * 权限分组（用于 UI 展示和权限审查）
 */
export const PERMISSION_GROUPS: Record<string, { label: string; permissions: Permission[] }> = {
  editor: {
    label: "编辑器",
    permissions: [
      "editor:insertText",
      "editor:replaceSelection",
      "editor:getSelectedText",
      "editor:getContent",
      "editor:onSelectionChange",
      "editor:openTab",
      "editor:closeTab",
    ],
  },
  commands: {
    label: "命令",
    permissions: ["commands:register", "commands:execute"],
  },
  statusBar: {
    label: "状态栏",
    permissions: [
      "statusBar:update",
      "statusBar:remove",
      "statusBar:setTooltip",
      "statusBar:setColor",
      "statusBar:setBackgroundColor",
      "statusBar:setCommand",
    ],
  },
  events: {
    label: "事件",
    permissions: ["events:on", "events:emit"],
  },
  storage: {
    label: "存储",
    permissions: ["storage:get", "storage:set"],
  },
  configuration: {
    label: "配置",
    permissions: ["configuration:read", "configuration:write"],
  },
  views: {
    label: "视图",
    permissions: ["views:register"],
  },
  ui: {
    label: "界面",
    permissions: ["ui:selectionToolbar"],
  },
};

/**
 * 权限描述（用于 UI 展示）
 */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  "editor:insertText": "向编辑器插入文字",
  "editor:replaceSelection": "替换选中文字",
  "editor:getSelectedText": "读取选中文字",
  "editor:getContent": "读取编辑器全部内容",
  "editor:onSelectionChange": "监听选区变化",
  "editor:openTab": "打开编辑器标签页",
  "editor:closeTab": "关闭编辑器标签页",
  "commands:register": "注册命令",
  "commands:execute": "执行命令",
  "statusBar:update": "更新状态栏",
  "statusBar:remove": "移除状态栏项",
  "statusBar:setTooltip": "设置状态栏提示文字",
  "statusBar:setColor": "设置状态栏文字颜色",
  "statusBar:setBackgroundColor": "设置状态栏背景颜色",
  "statusBar:setCommand": "设置状态栏点击命令",
  "events:on": "监听事件",
  "events:emit": "触发事件",
  "storage:get": "读取插件存储",
  "storage:set": "写入插件存储",
  "configuration:read": "读取插件配置",
  "configuration:write": "修改插件配置",
  "views:register": "注册视图面板",
  "ui:selectionToolbar": "参与选中浮动工具条",
};

// ==================== Plugin API（注入给插件的能力） ====================

/**
 * Disposable —— 可释放资源的接口
 *
 * 对标 VS Code 的 Disposable：
 * 所有订阅/注册操作都返回 Disposable，
 * 插件在 deactivate 时调用 dispose() 清理资源
 */
export interface Disposable {
  dispose(): void;
}

/**
 * SelectionInfo —— 选区信息（通过 API 暴露给插件）
 */
export interface SelectionInfo {
  /** 选中的文字 */
  text: string;
  /** 选区起始偏移 */
  start: number;
  /** 选区结束偏移 */
  end: number;
  /** 选区的位置矩形（用于插件定位 UI 等） */
  rect: { top: number; left: number; width: number; height: number };
}

/**
 * PluginAPI —— 注入给插件的能力接口
 *
 * 对标 VS Code 注入给插件的 `vscode` 命名空间：
 * - 插件通过此接口与宿主通信
 * - 每个方法的调用都要经过 PermissionGuard 检查
 * - 在 Worker 沙箱模式下，此接口通过 postMessage 代理实现
 *
 * 设计原则：
 * - 所有编辑器操作都是异步的（因为可能跨线程 postMessage）
 * - 所有订阅操作都返回 Disposable
 * - 插件不能直接操作 DOM
 */
export interface PluginAPI {
  /** 编辑器操作 */
  editor: EditorAPI;

  /** 命令系统 */
  commands: CommandsAPI;

  /** 状态栏 */
  statusBar: StatusBarAPI;

  /** 事件系统 */
  events: EventsAPI;

  /** 插件存储 */
  storage: StorageAPI;

  /** 插件配置（读取/修改 contributes.configuration 声明的配置项） */
  configuration: ConfigurationAPI;

  /** 视图面板（注册 TreeDataProvider 等） */
  views: ViewsAPI;
}

/**
 * EditorAPI —— 编辑器操作 API
 *
 * 对标 VS Code 的 TextEditor API
 */
export interface EditorAPI {
  /** 在光标位置插入文字 */
  insertText(text: string): Promise<void>;

  /** 替换当前选中的文字 */
  replaceSelection(text: string): Promise<void>;

  /** 获取当前选中的文字 */
  getSelectedText(): Promise<string>;

  /** 获取编辑器全部内容 */
  getContent(): Promise<string>;

  /** 监听选区变化 */
  onSelectionChange(handler: (selection: SelectionInfo) => void): Disposable;
}

/**
 * CommandsAPI —— 命令系统 API
 *
 * 对标 VS Code 的 commands API：
 * - registerCommand: 注册命令处理器（在 Manifest 中声明的 command ID 对应的实现）
 * - executeCommand: 调用已注册的命令（包括其他插件注册的命令）
 */
export interface CommandsAPI {
  /**
   * 注册命令处理器
   *
   * 对标 VS Code 的 vscode.commands.registerCommand：
   * ```ts
   * api.commands.registerCommand("translate.translateSelection", async () => {
   *   const text = await api.editor.getSelectedText();
   *   const translated = await translate(text);
   *   await api.editor.replaceSelection(translated);
   * });
   * ```
   *
   * @param id 命令 ID（必须在 Manifest contributes.commands 中声明过）
   * @param handler 命令处理器
   * @returns Disposable，调用 dispose() 注销命令
   */
  registerCommand(id: string, handler: (...args: unknown[]) => unknown): Disposable;

  /**
   * 执行已注册的命令
   *
   * @param id 命令 ID
   * @param args 传递给命令处理器的参数
   * @returns 命令处理器的返回值
   */
  executeCommand(id: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * StatusBarAPI —— 状态栏 API
 *
 * 对标 VS Code 的 StatusBarItem API
 */
export interface StatusBarAPI {
  /**
   * 更新状态栏项的显示内容
   *
   * @param id 状态栏项 ID（必须在 Manifest contributes.statusBar 中声明过）
   * @param content 新的显示内容
   */
  update(id: string, content: { label: string; value?: string; icon?: string }): void;

  /**
   * 移除状态栏项
   *
   * @param id 状态栏项 ID
   */
  remove(id: string): void;

  /**
   * 设置状态栏项的 tooltip（鼠标悬停提示）
   *
   * @param id 状态栏项 ID
   * @param text tooltip 文字
   */
  setTooltip(id: string, text: string): void;

  /**
   * 设置状态栏项的文字颜色
   *
   * @param id 状态栏项 ID
   * @param color CSS 颜色值
   */
  setColor(id: string, color: string): void;

  /**
   * 设置状态栏项的背景颜色
   *
   * @param id 状态栏项 ID
   * @param color CSS 颜色值
   */
  setBackgroundColor(id: string, color: string): void;

  /**
   * 设置状态栏项的点击命令
   *
   * @param id 状态栏项 ID
   * @param commandId 命令 ID
   */
  setCommand(id: string, commandId: string): void;
}

/**
 * EventsAPI —— 事件系统 API
 *
 * 对标 VS Code 的事件订阅机制
 */
export interface EventsAPI {
  /**
   * 监听事件
   *
   * @param event 事件名（如 "content:change"、"editor:focus"）
   * @param handler 事件处理器
   * @returns Disposable，调用 dispose() 取消监听
   */
  on(event: string, handler: (...args: unknown[]) => void): Disposable;

  /**
   * 触发事件
   *
   * @param event 事件名
   * @param args 事件参数
   */
  emit(event: string, ...args: unknown[]): void;
}

/**
 * StorageAPI —— 插件存储 API
 *
 * 对标 VS Code 的 ExtensionContext.globalState / workspaceState：
 * 每个插件有独立的存储空间（通过 pluginId 作为 key 前缀隔离）
 */
export interface StorageAPI {
  /** 读取存储的值 */
  get(key: string): Promise<unknown>;

  /** 写入存储的值 */
  set(key: string, value: unknown): Promise<void>;
}

// ==================== Plugin Entry（插件代码的入口接口） ====================

/**
 * PluginEntry —— 插件代码文件的导出接口
 *
 * 对标 VS Code 的 extension.ts 导出：
 * ```ts
 * export function activate(api: PluginAPI) { ... }
 * export function deactivate() { ... }
 * ```
 *
 * 插件的 main 入口文件必须 default export 一个实现此接口的对象
 */
export interface PluginEntry {
  /**
   * 激活阶段
   * 宿主在满足 activationEvents 后加载插件代码并调用此方法
   * 插件在此注册命令处理器、订阅事件等
   *
   * @param api 宿主注入的 API 对象（经过 PermissionGuard 过滤）
   */
  activate(api: PluginAPI): void | Promise<void>;

  /**
   * 停用阶段
   * 宿主在卸载或禁用插件时调用
   * 插件应在此清理所有副作用（定时器、事件监听等）
   *
   * 注意：如果插件在 activate 时正确使用了 Disposable 模式，
   * 理论上不需要手动清理（宿主会自动 dispose 所有返回的 Disposable）
   */
  deactivate?(): void | Promise<void>;
}

// ==================== Registry（插件注册表条目） ====================

/**
 * PluginRegistryEntry —— 插件注册表中的条目
 *
 * 宿主在安装插件时创建此条目，包含：
 * - manifest: 解析后的 Manifest 数据
 * - state: 插件的当前生命周期状态
 * - entry: 插件代码的入口对象（懒加载后才有）
 * - disposables: 插件注册的所有可释放资源（deactivate 时批量释放）
 */
export interface PluginRegistryEntry {
  /** 解析后的 Manifest */
  manifest: PluginManifest;

  /** 插件的当前状态 */
  state: PluginState;

  /** 插件代码入口（通过 dynamic import 加载，未加载时为 null） */
  entry: PluginEntry | null;

  /** 插件注册的所有 Disposable（deactivate 时批量 dispose） */
  disposables: Disposable[];

  /** 安装时间 */
  installedAt: number;

  /** 最后激活时间 */
  activatedAt: number | null;

  /** 激活原因（哪个 activationEvent 触发了激活） */
  activationReason: string | null;
}

/**
 * 插件生命周期状态
 */
export type PluginState =
  | "installed" // 已安装（Manifest 已解析，代码未加载）
  | "activating" // 正在激活中（代码正在加载或 activate 正在执行）
  | "active" // 已激活（activate 执行完成）
  | "deactivating" // 正在停用中
  | "inactive" // 已停用（deactivate 执行完成，但未卸载）
  | "error"; // 激活失败

// ==================== IPC（Worker 通信协议） ====================

/**
 * Worker 消息类型（宿主 → Worker）
 */
export type HostToWorkerMessage =
  | { type: "init"; pluginId: string; manifest: PluginManifest }
  | { type: "activate"; pluginId: string }
  | { type: "deactivate"; pluginId: string }
  | { type: "api-response"; callId: string; result: unknown; error?: string }
  | { type: "event"; event: string; args: unknown[] }
  | { type: "execute-command"; commandId: string; args: unknown[] };

/**
 * Worker 消息类型（Worker → 宿主）
 */
export type WorkerToHostMessage =
  | { type: "api-call"; callId: string; namespace: string; method: string; args: unknown[] }
  | { type: "command-registered"; commandId: string }
  | { type: "command-result"; commandId: string; result: unknown; error?: string }
  | { type: "event-emit"; event: string; args: unknown[] }
  | {
      type: "status-bar-update";
      id: string;
      content: { label: string; value?: string; icon?: string };
    }
  | { type: "status-bar-remove"; id: string }
  | { type: "ready" }
  | { type: "error"; message: string; stack?: string }
  | { type: "log"; level: "info" | "warn" | "error"; args: unknown[] };

// ==================== Context Key（when 条件求值） ====================

/**
 * ContextKeys —— 上下文变量（用于 when 条件求值）
 *
 * 对标 VS Code 的 Context Keys：
 * - editorHasSelection: 编辑器是否有选中文字
 * - editorFocused: 编辑器是否获得焦点
 * - selection.length: 选中文字的长度
 * - selection.text: 选中文字的内容
 * - pluginActive.xxx: 指定插件是否已激活
 *
 * ContextKeyService 在求值 when 表达式时读取这些变量
 */
export interface ContextKeys {
  editorHasSelection: boolean;
  editorFocused: boolean;
  "selection.length": number;
  "selection.text": string;
  [key: `pluginActive.${string}`]: boolean;
  [key: string]: unknown;
}

// ==================== Manifest 校验 ====================

/**
 * Manifest 校验结果
 */
export interface ManifestValidationResult {
  valid: boolean;
  errors: ManifestValidationError[];
  warnings: ManifestValidationWarning[];
}

export interface ManifestValidationError {
  field: string;
  message: string;
}

export interface ManifestValidationWarning {
  field: string;
  message: string;
}

/**
 * 校验 PluginManifest 的合法性
 *
 * 检查项：
 * - 必填字段是否存在（id, name, version, main, activationEvents, permissions）
 * - id 格式是否合法（字母、数字、连字符）
 * - version 是否符合 semver 格式
 * - activationEvents 是否是有效的事件格式
 * - permissions 是否是已知的权限值
 * - contributes 中的 command ID 是否与 commands 声明一致
 * - keybindings / menus / selectionToolbar 引用的 command 是否已声明
 */
export function validateManifest(manifest: unknown): ManifestValidationResult {
  const errors: ManifestValidationError[] = [];
  const warnings: ManifestValidationWarning[] = [];

  if (!manifest || typeof manifest !== "object") {
    return {
      valid: false,
      errors: [{ field: "root", message: "Manifest must be an object" }],
      warnings: [],
    };
  }

  const m = manifest as Record<string, unknown>;

  // ── 必填字段 ──
  if (!m.id || typeof m.id !== "string") {
    errors.push({ field: "id", message: "id is required and must be a string" });
  } else if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(m.id as string)) {
    errors.push({
      field: "id",
      message: "id must start with a letter/digit and contain only letters, digits, and hyphens",
    });
  }

  if (!m.name || typeof m.name !== "string") {
    errors.push({ field: "name", message: "name is required and must be a string" });
  }

  if (!m.version || typeof m.version !== "string") {
    errors.push({ field: "version", message: "version is required and must be a string" });
  } else if (!/^\d+\.\d+\.\d+/.test(m.version as string)) {
    warnings.push({
      field: "version",
      message: "version should follow semver format (e.g. 1.0.0)",
    });
  }

  if (!m.main || typeof m.main !== "string") {
    errors.push({ field: "main", message: "main is required and must be a string" });
  }

  // ── 激活事件 ──
  if (!Array.isArray(m.activationEvents)) {
    errors.push({
      field: "activationEvents",
      message: "activationEvents is required and must be an array",
    });
  } else {
    const validPrefixes = ["onStartup", "onCommand:", "onEvent:"];
    for (const event of m.activationEvents as string[]) {
      if (typeof event !== "string") {
        errors.push({
          field: "activationEvents",
          message: `Each activation event must be a string, got ${typeof event}`,
        });
        continue;
      }
      const isValid =
        event === "*" ||
        validPrefixes.some((p) => event === p.replace(":", "") || event.startsWith(p));
      if (!isValid) {
        warnings.push({
          field: "activationEvents",
          message: `Unknown activation event format: "${event}". Expected onStartup, onCommand:xxx, or onEvent:xxx`,
        });
      }
    }
  }

  // ── 权限 ──
  if (!Array.isArray(m.permissions)) {
    errors.push({ field: "permissions", message: "permissions is required and must be an array" });
  } else {
    const validPermissions = Object.keys(PERMISSION_DESCRIPTIONS);
    for (const perm of m.permissions as string[]) {
      if (!validPermissions.includes(perm)) {
        warnings.push({
          field: "permissions",
          message: `Unknown permission: "${perm}". Valid permissions: ${validPermissions.join(", ")}`,
        });
      }
    }
  }

  // ── 贡献点交叉引用检查 ──
  if (m.contributes && typeof m.contributes === "object") {
    const contributes = m.contributes as Record<string, unknown>;
    const declaredCommands = new Set<string>();

    // 收集所有声明的 command ID
    if (Array.isArray(contributes.commands)) {
      for (const cmd of contributes.commands as CommandContribution[]) {
        if (cmd.command) {
          declaredCommands.add(cmd.command);
        }
      }
    }

    // 检查 keybindings 引用的 command 是否已声明
    if (Array.isArray(contributes.keybindings)) {
      for (const kb of contributes.keybindings as KeybindingContribution[]) {
        if (kb.command && !declaredCommands.has(kb.command)) {
          warnings.push({
            field: "contributes.keybindings",
            message: `Keybinding references undeclared command: "${kb.command}"`,
          });
        }
      }
    }

    // 检查 menus 引用的 command 是否已声明
    if (Array.isArray(contributes.menus)) {
      for (const menu of contributes.menus as MenuContribution[]) {
        if (menu.command && !declaredCommands.has(menu.command)) {
          warnings.push({
            field: "contributes.menus",
            message: `Menu references undeclared command: "${menu.command}"`,
          });
        }
      }
    }

    // 检查 selectionToolbar 引用的 command 是否已声明
    if (Array.isArray(contributes.selectionToolbar)) {
      for (const btn of contributes.selectionToolbar as SelectionToolbarContribution[]) {
        if (btn.command && !declaredCommands.has(btn.command)) {
          warnings.push({
            field: "contributes.selectionToolbar",
            message: `Selection toolbar button references undeclared command: "${btn.command}"`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ==================== 示例 Manifest（供文档和测试使用） ====================

/**
 * 翻译插件的示例 Manifest
 */
export const EXAMPLE_TRANSLATE_MANIFEST: PluginManifest = {
  id: "translate",
  name: "翻译插件",
  version: "1.0.0",
  description: "选中文字后翻译为英文",
  icon: "🌐",
  author: "Demo",
  main: "./plugins/translate/index.ts",
  activationEvents: ["onCommand:translate.translateSelection"],
  permissions: [
    "editor:getSelectedText",
    "editor:replaceSelection",
    "commands:register",
    "ui:selectionToolbar",
  ],
  contributes: {
    commands: [
      {
        command: "translate.translateSelection",
        title: "翻译选中文字",
        icon: "🌐",
      },
    ],
    selectionToolbar: [
      {
        command: "translate.translateSelection",
        title: "翻译",
        icon: "🌐",
        when: "editorHasSelection",
        priority: 10,
      },
    ],
    keybindings: [
      {
        command: "translate.translateSelection",
        key: "Ctrl+Shift+T",
        when: "editorHasSelection",
      },
    ],
    menus: [
      {
        command: "translate.translateSelection",
        when: "editorHasSelection",
        group: "editor/context",
        order: 10,
      },
    ],
  },
};

/**
 * 复制为 Markdown 插件的示例 Manifest
 */
export const EXAMPLE_COPY_MARKDOWN_MANIFEST: PluginManifest = {
  id: "copy-as-markdown",
  name: "复制为 Markdown",
  version: "1.0.0",
  description: "选中文字后复制为 Markdown 格式",
  icon: "📋",
  author: "Demo",
  main: "./plugins/copy-as-markdown/index.ts",
  activationEvents: ["onCommand:copy-as-markdown.copy"],
  permissions: ["editor:getSelectedText", "commands:register", "ui:selectionToolbar"],
  contributes: {
    commands: [
      {
        command: "copy-as-markdown.copy",
        title: "复制为 Markdown",
        icon: "📋",
      },
    ],
    selectionToolbar: [
      {
        command: "copy-as-markdown.copy",
        title: "复制 MD",
        icon: "📋",
        when: "editorHasSelection",
        priority: 20,
      },
    ],
    menus: [
      {
        command: "copy-as-markdown.copy",
        when: "editorHasSelection",
        group: "editor/context",
        order: 20,
      },
    ],
  },
};

/**
 * 字数统计插件的示例 Manifest
 */
export const EXAMPLE_WORD_COUNT_MANIFEST: PluginManifest = {
  id: "word-count",
  name: "字数统计",
  version: "1.0.0",
  description: "实时显示编辑器内容的字数统计",
  icon: "📊",
  author: "Demo",
  main: "./plugins/word-count/index.ts",
  activationEvents: ["onStartup"],
  permissions: ["editor:getContent", "events:on", "statusBar:update"],
  contributes: {
    statusBar: [
      {
        id: "word-count.counter",
        text: "字数: 0",
        alignment: "left",
        priority: 100,
        tooltip: "点击查看详细统计",
        color: "#9ca3af",
      },
    ],
  },
};

/**
 * 自动保存插件的示例 Manifest
 */
export const EXAMPLE_AUTO_SAVE_MANIFEST: PluginManifest = {
  id: "auto-save",
  name: "自动保存",
  version: "1.0.0",
  description: "定时自动保存编辑器内容到本地存储",
  icon: "💾",
  author: "Demo",
  main: "./plugins/auto-save/index.ts",
  activationEvents: ["onStartup"],
  permissions: [
    "editor:getContent",
    "events:on",
    "storage:get",
    "storage:set",
    "statusBar:update",
    "configuration:read",
  ],
  contributes: {
    statusBar: [
      {
        id: "auto-save.status",
        text: "自动保存: 就绪",
        alignment: "right",
        priority: 50,
        tooltip: "自动保存状态",
      },
    ],
    configuration: {
      title: "自动保存设置",
      properties: {
        "autoSave.interval": {
          type: "number",
          default: 5000,
          description: "自动保存间隔（毫秒）",
          minimum: 1000,
          maximum: 60000,
        },
        "autoSave.enabled": {
          type: "boolean",
          default: true,
          description: "是否启用自动保存",
        },
      },
    },
  },
};

/**
 * 表情选择器插件的示例 Manifest
 *
 * 功能：在编辑器工具栏提供表情选择按钮，点击后弹出表情面板，选择后插入到光标位置
 *
 * 设计要点：
 * - activationEvents: onCommand — 点击按钮时才激活，不在 onStartup 时加载
 * - 通过 events:emit 发送 ui:show-popup 事件通知宿主渲染弹窗
 * - 插件自治：宿主不感知弹窗内容，只负责挂载 renderContent 返回的 React 元素
 */
export const EXAMPLE_EMOJI_MANIFEST: PluginManifest = {
  id: "emoji-picker",
  name: "表情选择器",
  version: "1.0.0",
  description: "点击工具栏按钮弹出表情面板，选择表情后插入到编辑器光标位置",
  icon: "😊",
  author: "Demo",
  main: "./plugins/emoji-picker/index.ts",
  activationEvents: ["onCommand:emoji-picker.insert"],
  permissions: ["editor:insertText", "commands:register", "events:emit"],
  contributes: {
    commands: [
      {
        command: "emoji-picker.insert",
        title: "插入表情",
        icon: "😊",
      },
    ],
  },
};

/**
 * 图片上传插件的示例 Manifest
 *
 * 功能：在编辑器工具栏提供图片插入按钮，点击后弹出 URL 输入框，确认后插入 Markdown 图片语法
 *
 * 设计要点：
 * - 与表情插件同理，通过 events:emit 发送 ui:show-popup 通知宿主
 * - 插件内部定义 ImageForm 组件，宿主不感知表单结构
 * - 对标 Tiptap 的 addNodeView()：插件提供渲染函数，宿主只负责挂载
 */
export const EXAMPLE_IMAGE_UPLOAD_MANIFEST: PluginManifest = {
  id: "image-upload",
  name: "图片上传",
  version: "1.0.0",
  description: "点击工具栏按钮输入图片 URL，以 Markdown 格式插入到编辑器",
  icon: "🖼",
  author: "Demo",
  main: "./plugins/image-upload/index.ts",
  activationEvents: ["onCommand:image-upload.insert"],
  permissions: ["editor:insertText", "commands:register", "events:emit"],
  contributes: {
    commands: [
      {
        command: "image-upload.insert",
        title: "插入图片",
        icon: "🖼",
      },
    ],
  },
};

/**
 * 所有示例 Manifest 的集合
 */
/**
 * Git 状态栏插件的示例 Manifest
 *
 * 功能：模拟 Git 状态显示（分支名 + commit 数），带颜色和 tooltip
 */
export const EXAMPLE_GIT_STATUS_MANIFEST: PluginManifest = {
  id: "git-status",
  name: "Git 状态",
  version: "1.0.0",
  description: "在状态栏显示模拟的 Git 分支信息",
  icon: "🔀",
  author: "Demo",
  main: "./plugins/git-status/index.ts",
  activationEvents: ["onStartup"],
  permissions: [
    "commands:register",
    "statusBar:update",
    "statusBar:setTooltip",
    "statusBar:setColor",
    "statusBar:setBackgroundColor",
    "statusBar:setCommand",
    "events:on",
    "events:emit",
  ],
  contributes: {
    commands: [
      {
        command: "git-status.showDetails",
        title: "显示 Git 详情",
        icon: "🔀",
      },
    ],
    statusBar: [
      {
        id: "git-status.branch",
        text: "main",
        alignment: "left",
        priority: 200,
        tooltip: "当前 Git 分支",
        color: "#a78bfa",
        command: "git-status.showDetails",
      },
    ],
  },
};

/**
 * 基础格式化插件的示例 Manifest（用于演示插件间依赖）
 */
export const EXAMPLE_BASE_FORMATTER_MANIFEST: PluginManifest = {
  id: "base-formatter",
  name: "基础格式化",
  version: "1.0.0",
  description: "提供基础文本格式化能力（trim、标准化空格等），作为其他格式化插件的依赖",
  icon: "📐",
  author: "Demo",
  main: "./plugins/base-formatter/index.ts",
  activationEvents: ["onCommand:base-formatter.formatText"],
  permissions: ["commands:register", "editor:getSelectedText", "editor:replaceSelection"],
  contributes: {
    commands: [
      {
        command: "base-formatter.formatText",
        title: "基础格式化",
        icon: "📐",
      },
    ],
  },
};

/**
 * Markdown 格式化插件的示例 Manifest（依赖 base-formatter）
 */
export const EXAMPLE_MARKDOWN_FORMATTER_MANIFEST: PluginManifest = {
  id: "markdown-formatter",
  name: "Markdown 格式化",
  version: "1.0.0",
  description: "在基础格式化基础上添加 Markdown 语法格式化（依赖 base-formatter）",
  icon: "📝",
  author: "Demo",
  main: "./plugins/markdown-formatter/index.ts",
  activationEvents: ["onCommand:markdown-formatter.format"],
  permissions: [
    "commands:register",
    "commands:execute",
    "editor:getSelectedText",
    "editor:replaceSelection",
    "ui:selectionToolbar",
  ],
  dependencies: ["base-formatter"],
  contributes: {
    commands: [
      {
        command: "markdown-formatter.format",
        title: "Markdown 格式化",
        icon: "📝",
      },
    ],
    selectionToolbar: [
      {
        command: "markdown-formatter.format",
        title: "MD 格式化",
        icon: "📝",
        when: "editorHasSelection",
        priority: 30,
      },
    ],
    menus: [
      {
        command: "markdown-formatter.format",
        when: "editorHasSelection",
        group: "editor/context",
        order: 30,
      },
    ],
  },
};

/**
 * 大纲视图插件的示例 Manifest（用于演示 Views / TreeDataProvider）
 */
export const EXAMPLE_OUTLINE_VIEW_MANIFEST: PluginManifest = {
  id: "outline-view",
  name: "大纲视图",
  version: "1.0.0",
  description: "解析编辑器内容，以树形视图展示文本大纲结构",
  icon: "📑",
  author: "Demo",
  main: "./plugins/outline-view/index.ts",
  activationEvents: ["onStartup"],
  permissions: ["editor:getContent", "events:on", "commands:register", "views:register"],
  contributes: {
    commands: [
      {
        command: "outline-view.refresh",
        title: "刷新大纲",
        icon: "🔄",
      },
    ],
    viewsContainers: {
      activitybar: [{ id: "outline-container", title: "大纲", icon: "📑" }],
    },
    views: {
      "outline-container": [{ id: "outline-view.tree", name: "文本大纲" }],
    },
  },
};

export const ALL_EXAMPLE_MANIFESTS: PluginManifest[] = [
  EXAMPLE_TRANSLATE_MANIFEST,
  EXAMPLE_COPY_MARKDOWN_MANIFEST,
  EXAMPLE_WORD_COUNT_MANIFEST,
  EXAMPLE_AUTO_SAVE_MANIFEST,
  EXAMPLE_EMOJI_MANIFEST,
  EXAMPLE_IMAGE_UPLOAD_MANIFEST,
  EXAMPLE_GIT_STATUS_MANIFEST,
  EXAMPLE_BASE_FORMATTER_MANIFEST,
  EXAMPLE_MARKDOWN_FORMATTER_MANIFEST,
  EXAMPLE_OUTLINE_VIEW_MANIFEST,
];
