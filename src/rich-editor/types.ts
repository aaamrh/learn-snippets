// ==================== Rich Editor 类型定义 ====================
// 对标: medium-editor (Extension/Button/Form 三层模型) + Tiptap/ProseMirror (State + Transaction)

// ==================== 文档模型（简化版） ====================

export type MarkType = "bold" | "italic" | "underline" | "strikethrough" | "link";

export type BlockType = "p" | "h1" | "h2" | "h3" | "blockquote";

export interface Mark {
  type: MarkType;
  attrs?: Record<string, string>;
}

// ==================== Selection ====================

export interface EditorSelection {
  /** 选区起始偏移 */
  from: number;
  /** 选区结束偏移 */
  to: number;
  /** 选区是否折叠（光标无选中内容） */
  empty: boolean;
  /** 选中的文本内容 */
  text: string;
  /** 选区的 DOM 矩形（用于 BubbleMenu 定位） */
  rect: DOMRect | null;
}

export const EMPTY_SELECTION: EditorSelection = {
  from: 0,
  to: 0,
  empty: true,
  text: "",
  rect: null,
};

// ==================== Editor State ====================

/**
 * EditorState —— 不可变编辑器状态
 *
 * 对标 ProseMirror 的 EditorState：
 * - content: 文档内容（HTML string，从 contenteditable 获取）
 * - selection: 当前选区信息
 * - activeMarks: 当前选区内激活的 marks（用于工具栏按钮高亮）
 * - wordCount / lineCount: 派生数据
 * - lastSaved: 最后保存时间
 */
export interface EditorState {
  /** 文档内容（HTML string） */
  content: string;
  /** 当前选区 */
  selection: EditorSelection;
  /** 当前选区内激活的 marks（检测到的格式） */
  activeMarks: Set<MarkType>;
  /** 当前激活的块级格式 */
  activeBlock: BlockType;
  /** 字数 */
  wordCount: number;
  /** 行数 */
  lineCount: number;
  /** 最后保存时间（timestamp），null 表示从未保存 */
  lastSaved: number | null;
  /** 是否有未保存的变更 */
  isDirty: boolean;
}

export function createDefaultEditorState(): EditorState {
  return {
    content: "",
    selection: { ...EMPTY_SELECTION },
    activeMarks: new Set(),
    activeBlock: "p",
    wordCount: 0,
    lineCount: 0,
    lastSaved: null,
    isDirty: false,
  };
}

// ==================== Transaction ====================

/**
 * TransactionStep —— 事务中的单个操作步骤
 *
 * 对标 ProseMirror 的 Step：
 * - 每个步骤描述一种原子操作
 * - Transaction 可包含多个步骤（链式 API）
 * - dispatch 时按顺序执行所有步骤
 */
export type TransactionStep =
  | { type: "toggleMark"; mark: MarkType; attrs?: Record<string, string> }
  | { type: "setBlock"; block: BlockType }
  | { type: "insertText"; text: string }
  | { type: "insertHTML"; html: string }
  | { type: "setSelection"; from: number; to: number }
  | { type: "setMeta"; key: string; value: unknown };

/**
 * Transaction 接口
 *
 * 链式 API：
 * ```ts
 * editor.createTransaction()
 *   .toggleMark("bold")
 *   .insertText("hello")
 *   .dispatch();
 * ```
 */
export interface Transaction {
  readonly oldState: EditorState;
  readonly steps: readonly TransactionStep[];
  readonly meta: Record<string, unknown>;

  toggleMark(mark: MarkType, attrs?: Record<string, string>): Transaction;
  setBlock(block: BlockType): Transaction;
  insertText(text: string): Transaction;
  insertHTML(html: string): Transaction;
  setSelection(from: number, to: number): Transaction;
  setMeta(key: string, value: unknown): Transaction;

  /** 执行事务，返回新的 EditorState */
  dispatch(): void;
}

// ==================== Extension 三层模型 ====================

/**
 * Extension —— 扩展基类接口
 *
 * 对标 medium-editor 的 Extension：
 * - 所有功能都是扩展，包括 Toolbar 自身
 * - 扩展通过 init() 获得对 EditorInstance 的引用
 * - 扩展可以订阅编辑器事件
 */
export interface Extension {
  /** 扩展唯一标识 */
  name: string;
  /** 生命周期：初始化（editor 实例已就绪） */
  init?(editor: EditorInstance): void;
  /** 生命周期：销毁 */
  destroy?(): void;
  /**
   * Selection 变化时调用（用于更新 active 状态）
   * 对标 medium-editor 的 checkState：
   * Toolbar 会在 selection 变化时遍历所有按钮扩展，调用此方法
   */
  checkState?(state: EditorState): void;
  /**
   * State 变化时调用（用于派生数据，如字数统计）
   */
  onStateChange?(state: EditorState): void;
  /**
   * 返回扩展管理的 DOM 元素（用于判断点击是否在编辑器内）
   */
  getInteractionElements?(): HTMLElement[];
}

/**
 * ButtonExtension —— 按钮扩展接口
 *
 * 对标 medium-editor 的 Button：
 * - 继承 Extension
 * - 与 Toolbar 有约定：提供按钮的配置信息和状态检查方法
 * - active 状态不是按钮自己管的，是 Toolbar 通过爬 DOM 树统一判断的
 */
export interface ButtonExtension extends Extension {
  /** 按钮执行的命令名（"bold", "italic" 等） */
  command: string;
  /** 显示名称 */
  label: string;
  /** 图标（React 节点或字符串） */
  icon: string;
  /** 快捷键描述（显示用，如 "Ctrl+B"） */
  shortcut?: string;
  /** 哪些标签表示此按钮已激活（如 ["b", "strong"] for bold） */
  tagNames?: string[];
  /** 哪些 CSS 属性表示此按钮已激活 */
  style?: { prop: string; value: string };
  /** 按钮当前是否激活 */
  isActive(): boolean;
  /**
   * 检查给定 DOM 节点是否表示此按钮的格式已应用
   * Toolbar 爬 DOM 祖先链时会调用此方法
   */
  isAlreadyApplied(node: Node): boolean;
  /** 设置为激活状态 */
  setActive(): void;
  /** 设置为非激活状态 */
  setInactive(): void;
  /** 点击处理 */
  handleClick(event?: MouseEvent): void;
}

/**
 * FormExtension —— 表单扩展接口
 *
 * 对标 medium-editor 的 FormExtension：
 * - 继承 ButtonExtension
 * - 点击按钮后弹出表单（如链接的 URL 输入框）
 */
export interface FormExtension extends ButtonExtension {
  /** 标记这是一个 FormExtension */
  hasForm: true;
  /** 表单是否正在显示 */
  isDisplayed(): boolean;
  /** 显示表单 */
  showForm(opts?: unknown): void;
  /** 隐藏表单 */
  hideForm(): void;
}

// ==================== Toolbar ====================

/**
 * ToolbarConfig —— 工具栏配置
 *
 * 对标 medium-editor 的 Toolbar：
 * - buttons: 按钮名称列表（引用 ButtonExtension.name）
 * - static: true = 固定在编辑器顶部，false = 浮动跟随选区（BubbleMenu）
 */
export interface ToolbarConfig {
  /** 按钮名称列表 */
  buttons: string[];
  /** true = 固定位置（顶部），false = 浮动跟随选区 */
  static: boolean;
  /** 位置偏移 */
  diffTop?: number;
  diffLeft?: number;
  /** 是否允许跨段落选区时显示 */
  allowMultiParagraphSelection?: boolean;
}

// ==================== Editor Instance ====================

/**
 * EditorInstance —— 编辑器实例接口
 *
 * 对标 medium-editor 的 MediumEditor 实例：
 * - 整合 EditorState + Transaction + SelectionObserver + Extension 管理
 * - 是所有扩展交互的中心枢纽
 */
export interface EditorInstance {
  /** 当前状态 */
  readonly state: EditorState;
  /** 创建新的事务 */
  createTransaction(): Transaction;
  /** 注册扩展 */
  registerExtension(extension: Extension): void;
  /** 获取扩展 */
  getExtension<T extends Extension = Extension>(name: string): T | null;
  /** 获取所有扩展 */
  getAllExtensions(): Extension[];
  /** 获取所有 ButtonExtension */
  getButtonExtensions(): ButtonExtension[];
  /** 事件系统 */
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  /** 执行编辑命令（代理 document.execCommand） */
  execCommand(command: string, value?: string): void;
  /** 获取 contenteditable DOM 元素 */
  getEditorElement(): HTMLElement | null;
  /** 更新状态 */
  updateState(partial: Partial<EditorState>): void;
  /** 销毁编辑器实例 */
  destroy(): void;
}

// ==================== 事件名称常量 ====================

export const EDITOR_EVENTS = {
  /** 内容变化 */
  CONTENT_CHANGE: "content:change",
  /** 选区变化 */
  SELECTION_CHANGE: "selection:change",
  /** 状态变化（任何 state 字段变化） */
  STATE_CHANGE: "state:change",
  /** 焦点获得 */
  FOCUS: "editor:focus",
  /** 焦点丢失 */
  BLUR: "editor:blur",
  /** 扩展已注册 */
  EXTENSION_REGISTERED: "extension:registered",
  /** 保存事件 */
  SAVE: "editor:save",
} as const;

// ==================== 快捷键 ====================

export interface ShortcutConfig {
  /** 快捷键描述（如 "Ctrl+B"、"Cmd+B"） */
  key: string;
  /** 控制键 */
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  /** 匹配的 event.key 值 */
  eventKey: string;
  /** 执行的命令 */
  command: string;
  /** 命令参数 */
  value?: string;
}

/**
 * 内置快捷键配置
 */
export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { key: "Ctrl+B", ctrlKey: true, eventKey: "b", command: "bold" },
  { key: "Ctrl+I", ctrlKey: true, eventKey: "i", command: "italic" },
  { key: "Ctrl+U", ctrlKey: true, eventKey: "u", command: "underline" },
  { key: "Ctrl+S", ctrlKey: true, eventKey: "s", command: "__save__" },
];

// ==================== 工具栏预设 ====================

/**
 * 固定工具栏的按钮配置
 */
export const FIXED_TOOLBAR_BUTTONS = [
  "bold",
  "italic",
  "underline",
  "heading1",
  "heading2",
  "link",
  "image",
  "emoji",
];

/**
 * 浮动工具栏（BubbleMenu）的按钮配置
 */
export const BUBBLE_MENU_BUTTONS = [
  "bold",
  "italic",
  "underline",
  "translate",
  "copy",
];

// ==================== 辅助类型 ====================

/** Disposable 接口（用于事件订阅等需要清理的资源） */
export interface Disposable {
  dispose(): void;
}

/** 扩展注册信息 */
export interface ExtensionEntry {
  extension: Extension;
  isButton: boolean;
  isForm: boolean;
}

// ==================== 类型守卫 ====================

/**
 * 检查一个 Extension 是否是 ButtonExtension
 */
export function isButtonExtension(ext: Extension): ext is ButtonExtension {
  return (
    "command" in ext &&
    "label" in ext &&
    "icon" in ext &&
    "isActive" in ext &&
    "isAlreadyApplied" in ext &&
    "handleClick" in ext
  );
}

/**
 * 检查一个 Extension 是否是 FormExtension
 */
export function isFormExtension(ext: Extension): ext is FormExtension {
  return isButtonExtension(ext) && "hasForm" in ext && (ext as FormExtension).hasForm === true;
}

// ==================== 预设表情 ====================

export const PRESET_EMOJIS = [
  "😀", "😂", "🤣", "😊", "😍", "🤩", "😎", "🤗",
  "🤔", "😅", "😇", "🥰", "😋", "😜", "🤪", "😏",
  "😢", "😭", "😤", "🤯", "😱", "🥶", "😴", "🤮",
  "👍", "👎", "👏", "🙌", "🤝", "💪", "🎉", "🔥",
  "❤️", "💔", "⭐", "✨", "💡", "📌", "✅", "❌",
];

// ==================== 工具函数 ====================

/**
 * 计算文本的字数（中文按字计算，英文按空格分词）
 */
export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;

  // 移除 HTML 标签
  const plainText = text.replace(/<[^>]*>/g, "").trim();
  if (!plainText) return 0;

  // 中文字符数
  const chineseChars = plainText.match(/[\u4e00-\u9fa5]/g);
  const chineseCount = chineseChars ? chineseChars.length : 0;

  // 英文单词数（连续的非中文、非空白字符算一个词）
  const withoutChinese = plainText.replace(/[\u4e00-\u9fa5]/g, " ");
  const englishWords = withoutChinese
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const englishCount = englishWords.length;

  return chineseCount + englishCount;
}

/**
 * 计算文本的行数
 */
export function countLines(html: string): number {
  if (!html || !html.trim()) return 0;

  // 按块级标签和换行符计算
  const plainText = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|blockquote|li|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .trim();

  if (!plainText) return 0;

  return plainText.split("\n").filter((line) => line.trim().length > 0).length;
}
