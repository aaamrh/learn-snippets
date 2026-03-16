import type { FC } from "react";

// ==================== 画布元素 ====================

export type ElementType = "pen" | "rect" | "circle" | "arrow" | "text";

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  opacity: number;
  isDeleted: boolean;
}

export interface PenElement extends BaseElement {
  type: "pen";
  points: Point[];
}

export interface RectElement extends BaseElement {
  type: "rect";
  width: number;
  height: number;
  borderRadius: number;
}

export interface CircleElement extends BaseElement {
  type: "circle";
  radiusX: number;
  radiusY: number;
}

export interface ArrowElement extends BaseElement {
  type: "arrow";
  endX: number;
  endY: number;
  arrowheadSize: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
}

export type CanvasElement = PenElement | RectElement | CircleElement | ArrowElement | TextElement;

// ==================== App State ====================

export type ToolType = "pen" | "rect" | "circle" | "arrow" | "text" | "eraser" | "select";

export interface AppState {
  activeTool: ToolType;
  selectedElementIds: Set<string>;
  // 当前工具的属性
  currentStrokeColor: string;
  currentFillColor: string;
  currentStrokeWidth: number;
  currentFontSize: number;
  currentOpacity: number;
  // 视口
  scrollX: number;
  scrollY: number;
  zoom: number;
  // UI 状态
  isDrawing: boolean;
  cursorType: string;
  /**
   * 当前打开的对话框名称（对标 Excalidraw 的 openDialog）
   * null 表示没有打开任何对话框
   */
  openDialog: "translate" | null;
  /** 翻译目标语言（与 openDialog 解耦，切换语言不关闭弹窗） */
  translateTargetLang: string;
}

export function createDefaultAppState(): AppState {
  return {
    activeTool: "pen",
    selectedElementIds: new Set(),
    currentStrokeColor: "#e74c3c",
    currentFillColor: "transparent",
    currentStrokeWidth: 2,
    currentFontSize: 16,
    currentOpacity: 1,
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    isDrawing: false,
    cursorType: "crosshair",
    openDialog: null,
    translateTargetLang: "en",
  };
}

// ==================== Action（Command 模式） ====================

export interface ActionPanelProps {
  elements: readonly CanvasElement[];
  appState: Readonly<AppState>;
  updateData: (formData: unknown) => void;
}

export interface Action {
  name: string;
  label: string;
  icon?: string;
  /**
   * 执行动作，返回新的 elements + appState（纯函数，不可变更新）
   * @param elements 当前所有元素
   * @param appState 当前应用状态
   * @param formData 来自 PanelComponent 或 executeAction 的附加数据
   */
  perform: (
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    formData: unknown,
  ) => ActionResult;
  /** 快捷键匹配测试 */
  keyTest?: (event: KeyboardEvent, appState: Readonly<AppState>) => boolean;
  /** 当前上下文是否可用 */
  predicate?: (elements: readonly CanvasElement[], appState: Readonly<AppState>) => boolean;
  /** 快捷键优先级（数字越大越先匹配） */
  keyPriority?: number;
  /** Action 自带的面板组件（用于二级工具条） */
  PanelComponent?: FC<ActionPanelProps>;
  /**
   * 异步副作用完成后的回调（如剪贴板读取完成后应用粘贴）
   * 替代原先挂在 Action 实例上的 ad-hoc 方法
   */
  onAsyncComplete?: (
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    data: string,
  ) => { elements: readonly CanvasElement[]; appState: Partial<AppState> } | null;
}

// ==================== ActionSideEffect ====================

/**
 * Action 副作用 —— 类型安全的 discriminated union
 *
 * 替代原先的魔法标记模式（_undoRequested / _clipboardWrite 等）：
 * - 旧方案：用 `as unknown as Partial<AppState>` 强制注入非 AppState 字段
 * - 新方案：通过 sideEffect 字段声明意图，updater 通过 switch/case 分发
 *
 * 对标 Excalidraw 的副作用处理模式
 */
export type ActionSideEffect =
  | { type: "requestUndo" }
  | { type: "requestRedo" }
  | { type: "clipboardWrite"; text: string }
  | { type: "clipboardReadAndPaste" };

// ==================== CaptureUpdateAction ====================

/**
 * 三级历史捕获语义（对标 Excalidraw 的 CaptureUpdateAction）
 *
 * - IMMEDIATELY — 立即入 undo 栈（完成绘制、删除、属性修改等）
 * - EVENTUALLY — 延迟合并入栈（拖拽中间状态、连续滑块调整）
 * - NEVER — 不入栈（光标移动、hover 高亮等瞬态 UI 变化）
 */
export enum CaptureUpdateAction {
  IMMEDIATELY = "immediately",
  EVENTUALLY = "eventually",
  NEVER = "never",
}

export interface ActionResult {
  elements?: readonly CanvasElement[];
  appState?: Partial<AppState>;
  /** 历史捕获语义：IMMEDIATELY / EVENTUALLY / NEVER */
  captureUpdate: CaptureUpdateAction;
  /** 声明式副作用，由 updater 执行 */
  sideEffect?: ActionSideEffect;
}

// ==================== Tool（Strategy 模式） ====================

/**
 * 工具接口 —— 不同的绘图工具对鼠标事件的响应不同，但共享同一套事件入口。
 * 宿主不关心当前是什么工具，只把事件转发给 activeTool，工具自己决定行为。
 */
export interface Tool {
  type: ToolType;
  /** 指针按下 */
  onPointerDown(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult;
  /** 指针移动 */
  onPointerMove(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult;
  /** 指针抬起 */
  onPointerUp(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult;
  /** 工具被激活时调用 */
  onActivate?(state: Readonly<AppState>): Partial<AppState>;
  /** 工具被停用时调用 */
  onDeactivate?(state: Readonly<AppState>): Partial<AppState>;
  /** 返回工具的属性面板配置（二级工具条内容） */
  getPropertyPanel?(): PropertyPanelConfig;
  /** 返回工具应使用的光标样式 */
  getCursor?(state: Readonly<AppState>): string;
}

export interface ToolResult {
  elements?: readonly CanvasElement[];
  appState?: Partial<AppState>;
  /** 历史捕获语义（默认 NEVER，仅 pointerUp 完成绘制时设为 IMMEDIATELY） */
  captureUpdate?: CaptureUpdateAction;
}

// ==================== 属性面板配置 ====================

export interface PropertyPanelConfig {
  items: PropertyPanelItem[];
}

export type PropertyPanelItem = ColorPickerPanelItem | SliderPanelItem | ButtonGroupPanelItem;

export interface ColorPickerPanelItem {
  type: "color-picker";
  label: string;
  stateKey: keyof AppState;
}

export interface SliderPanelItem {
  type: "slider";
  label: string;
  stateKey: keyof AppState;
  min: number;
  max: number;
  step: number;
}

export interface ButtonGroupPanelItem {
  type: "button-group";
  label: string;
  stateKey: keyof AppState;
  options: Array<{ value: number | string; label: string }>;
}

// ==================== History（Undo/Redo） ====================

export interface HistoryEntry {
  elements: readonly CanvasElement[];
  appState: Pick<
    AppState,
    | "activeTool"
    | "currentStrokeColor"
    | "currentFillColor"
    | "currentStrokeWidth"
    | "currentFontSize"
    | "currentOpacity"
  >;
}

export interface IHistoryManager {
  /** 将当前状态压入 undo 栈 */
  push(entry: HistoryEntry): void;
  /** 撤销：弹出 undo 栈顶，推入 redo 栈，返回要恢复的状态 */
  undo(current: HistoryEntry): HistoryEntry | null;
  /** 重做：弹出 redo 栈顶，推入 undo 栈，返回要恢复的状态 */
  redo(current: HistoryEntry): HistoryEntry | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
  /** undo 栈深度 */
  undoSize(): number;
  /** redo 栈深度 */
  redoSize(): number;
}

// ==================== 渲染相关 ====================

/** 元素的包围盒（用于 hitTest 和选中框绘制） */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 缩放手柄的位置 */
export type HandlePosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "bottom"
  | "left"
  | "right";

/** hitTest 的结果 */
export interface HitTestResult {
  /** 命中的元素 id，null 表示未命中 */
  elementId: string | null;
  /** 是否命中了选中元素的缩放手柄 */
  handle?: HandlePosition;
}

// ==================== 工具栏相关 ====================

export interface ToolbarItem {
  type: ToolType;
  label: string;
  icon: string;
}

export const TOOLBAR_ITEMS: ToolbarItem[] = [
  { type: "pen", label: "画笔", icon: "✏️" },
  { type: "rect", label: "矩形", icon: "▢" },
  { type: "circle", label: "圆形", icon: "○" },
  { type: "arrow", label: "箭头", icon: "→" },
  { type: "text", label: "文字", icon: "T" },
  { type: "eraser", label: "橡皮擦", icon: "⌫" },
  { type: "select", label: "选择", icon: "↖" },
];

export const PRESET_COLORS = [
  "#e74c3c", // 红
  "#e67e22", // 橙
  "#f1c40f", // 黄
  "#2ecc71", // 绿
  "#3498db", // 蓝
  "#9b59b6", // 紫
  "#1abc9c", // 青
  "#ecf0f1", // 白
  "#34495e", // 深灰
  "#000000", // 黑
];

export const STROKE_WIDTH_OPTIONS = [
  { value: 1, label: "细" },
  { value: 2, label: "中" },
  { value: 4, label: "粗" },
  { value: 8, label: "特粗" },
];

export const FONT_SIZE_OPTIONS = [
  { value: 12, label: "12" },
  { value: 16, label: "16" },
  { value: 20, label: "20" },
  { value: 28, label: "28" },
  { value: 36, label: "36" },
];
