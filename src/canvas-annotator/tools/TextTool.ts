import type {
  ToolType,
  ToolResult,
  Point,
  AppState,
  CanvasElement,
  TextElement,
  PropertyPanelConfig,
} from "../types";
import { createTextElement } from "../elements/factory";
import { BaseTool } from "./BaseTool";

/**
 * TextTool —— 文字工具
 *
 * 行为：
 * - pointerDown：记录点击位置
 * - pointerUp：在点击位置创建一个待编辑的文字元素，
 *   通过回调通知 Canvas 组件弹出文字输入框
 * - 用户在输入框中输入文字并按 Enter 或失焦后，
 *   Canvas 组件调用 commitText() 生成最终的 TextElement
 *
 * 属性面板：
 * - 字号（fontSize）
 * - 颜色（strokeColor）
 * - 透明度（opacity）
 */
export class TextTool extends BaseTool {
  readonly type: ToolType = "text";

  /** 待提交的文字位置（等待用户输入） */
  private pendingPosition: Point | null = null;

  /** 文字输入回调（由 Canvas 组件注入） */
  private onRequestTextInput:
    | ((x: number, y: number, fontSize: number, color: string, onCommit: (text: string) => void) => void)
    | null = null;

  // ==================== 事件处理 ====================

  onPointerDown(
    point: Point,
    state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    super.onPointerDown(point, state, _elements);

    // 记录点击位置
    this.pendingPosition = { ...point };

    return {
      appState: { cursorType: "text" },
    };
  }

  onPointerMove(
    point: Point,
    _state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    // 文字工具在移动时不做任何事
    this.lastPoint = { ...point };
    return {};
  }

  onPointerUp(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    if (!this.pendingPosition) {
      super.onPointerUp(point, state, elements);
      return {};
    }

    const pos = this.pendingPosition;

    // 如果有注册文字输入回调，则弹出输入框让用户输入
    if (this.onRequestTextInput) {
      this.onRequestTextInput(
        pos.x,
        pos.y,
        state.currentFontSize,
        state.currentStrokeColor,
        (text: string) => {
          // 用户提交文字后，这个回调不会直接修改 state
          // 而是由 Canvas 组件通过 commitText 来完成
        },
      );
    }

    this.isActive = false;

    // 返回一个标记，通知 Canvas 组件弹出文字输入框
    // Canvas 组件通过读取 pendingPosition 来确定输入框位置
    return {
      appState: {
        isDrawing: false,
        cursorType: "text",
      },
    };
  }

  // ==================== 文字提交 ====================

  /**
   * 提交文字内容，生成最终的 TextElement
   *
   * 由 Canvas 组件在用户完成文字输入后调用
   *
   * @param text 用户输入的文字
   * @param state 当前应用状态
   * @param elements 当前元素数组
   * @returns ToolResult 包含新的 elements 和历史记录标记
   */
  commitText(
    text: string,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    if (!this.pendingPosition || !text.trim()) {
      this.pendingPosition = null;
      return {};
    }

    const textElement = createTextElement(
      this.pendingPosition.x,
      this.pendingPosition.y,
      text,
      state,
    );

    const newElements = [...elements, textElement];

    // 清理待提交位置
    this.pendingPosition = null;

    return {
      elements: newElements,
      appState: { isDrawing: false },
      captureHistory: true,
    };
  }

  // ==================== 工具生命周期 ====================

  onActivate(state: Readonly<AppState>): Partial<AppState> {
    this.pendingPosition = null;
    return {
      ...super.onActivate(state),
      selectedElementIds: new Set<string>(),
      cursorType: "text",
    };
  }

  onDeactivate(state: Readonly<AppState>): Partial<AppState> {
    this.pendingPosition = null;
    return super.onDeactivate(state);
  }

  // ==================== 属性面板 ====================

  getPropertyPanel(): PropertyPanelConfig {
    return {
      items: [
        {
          type: "color-picker",
          label: "颜色",
          stateKey: "currentStrokeColor",
        },
        {
          type: "button-group",
          label: "字号",
          stateKey: "currentFontSize",
          options: [
            { value: 12, label: "12" },
            { value: 16, label: "16" },
            { value: 20, label: "20" },
            { value: 28, label: "28" },
            { value: 36, label: "36" },
          ],
        },
        {
          type: "slider",
          label: "透明度",
          stateKey: "currentOpacity",
          min: 0.1,
          max: 1,
          step: 0.1,
        },
      ],
    };
  }

  // ==================== 光标 ====================

  getCursor(_state: Readonly<AppState>): string {
    return "text";
  }

  protected getDefaultCursor(): string {
    return "text";
  }

  // ==================== 公共方法 ====================

  /**
   * 获取待提交的文字位置
   * Canvas 组件用此信息来定位文字输入框
   */
  getPendingPosition(): Point | null {
    return this.pendingPosition;
  }

  /**
   * 清除待提交位置（用户取消输入时调用）
   */
  clearPendingPosition(): void {
    this.pendingPosition = null;
  }

  /**
   * 注册文字输入请求回调
   * Canvas 组件在挂载时调用，用于接收弹出输入框的通知
   */
  setTextInputHandler(
    handler: (
      x: number,
      y: number,
      fontSize: number,
      color: string,
      onCommit: (text: string) => void,
    ) => void,
  ): void {
    this.onRequestTextInput = handler;
  }

  /**
   * 获取正在绘制中的临时元素
   * 文字工具没有 wip 元素（文字通过输入框输入），始终返回 null
   */
  getWipElement(): TextElement | null {
    return null;
  }
}
