// ==================== 插件系统类型定义 ====================

// ==================== 扩展处理器 ====================
export interface ExtensionHandler {
  /** 优先级，数字越大越先执行，默认为 0 */
  priority?: number;
  handler: (...args: any[]) => any;
}

// ==================== 插件上下文（注入给插件使用的能力集合） ====================
export interface PluginContext {
  /**
   * 插件私有状态存储
   * 生命周期内跨方法共享数据（如 activate 存 timer，deactivate 取 timer）
   * 每个插件的 state 完全隔离，不同插件之间不会命名冲突
   */
  state: Map<string, any>;

  /** 插件配置，由宿主或用户传入 */
  config: Record<string, any>;

  /** 监听事件总线上的事件 */
  on<T = unknown>(event: string, handler: (data: T) => void): void;

  /** 取消监听事件总线上的事件 */
  off<T = unknown>(event: string, handler: (data: T) => void): void;

  /** 向事件总线发送事件，通知其他插件或宿主 */
  emit<T = unknown>(event: string, data?: T): void;

  /** 通过 id 获取其他已注册插件实例（只读） */
  getPlugin(id: string): Plugin | null;

  /**
   * 获取其他插件的上下文（只读访问）
   * 这是插件间访问对方暴露的 state API 的正式通道
   * 注意：只应读取对方明确对外暴露的 state，不要依赖对方内部实现细节
   */
  getContext(id: string): PluginContext | null;

  /**
   * 向指定扩展点注册一个 handler
   * 扩展点必须已由宿主通过 defineExtensionPoint 定义
   */
  registerExtension(point: string, handler: ExtensionHandler): void;
}

// ==================== 插件接口 ====================
export interface Plugin {
  // ---------- 元信息 ----------
  /** 全局唯一标识符 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 版本号 */
  version: string;
  /**
   * 依赖的其他插件 id 列表
   * 注册时会检查依赖是否已存在，否则抛出错误
   */
  dependencies?: string[];

  // ---------- 生命周期钩子 ----------
  /**
   * 激活阶段：宿主调用 activate(id) 时触发
   * 适合启动监听、注册事件、开启定时器等
   */
  activate?(context: PluginContext): void | Promise<void>;

  /**
   * 停用阶段：宿主调用 deactivate(id) 时触发
   * 必须清理 activate 阶段创建的副作用（定时器、事件监听等）
   */
  deactivate?(context?: PluginContext): void | Promise<void>;

  /**
   * 卸载阶段：宿主调用 uninstall(id) 时触发（deactivate 之后）
   * 适合释放持久化资源
   */
  uninstall?(): void | Promise<void>;

  // ---------- 快捷键声明 ----------
  /**
   * 声明此插件需要注册的快捷键
   * key   = 快捷键字符串，格式：'Ctrl+B' / 'Ctrl+Shift+Z'
   * value = 快捷键触发时执行的函数
   *
   * 设计理念（参考 Tiptap）：
   *   插件不依赖 shortcut 插件的内部 state，也不需要知道 shortcut 插件存不存在。
   *   插件只声明"我需要这些快捷键"，宿主在 activate 时统一收集并注册。
   *   这样 bold / italic 等插件与 shortcut 插件完全解耦。
   */
  addKeyboardShortcuts?(): Record<string, () => void>;

  // ---------- 扩展点贡献 ----------
  /**
   * 声明此插件要贡献到哪些扩展点
   * key   = 扩展点名称（必须由宿主提前 defineExtensionPoint）
   * value = 对应的处理器（含可选 priority）
   *
   * 使用场景：插件需要向宿主的某个"槽位"输出内容时使用
   *
   * 与 activate 的区别：
   *   - extensions  → 插件主动把数据"贡献"给宿主某个位置（宿主来拉取）
   *   - activate    → 插件自己监听事件、默默干活（不需要宿主展示结果）
   */
  extensions?: {
    [extensionPoint: string]: ExtensionHandler;
  };
}
