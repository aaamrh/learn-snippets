import type {
  ToolType,
  ToolResult,
  Point,
  AppState,
  CanvasElement,
  RectElement,
  PropertyPanelConfig,
} from "../types";
import { createRectElement } from "../elements/factory";
import { BaseTool } from "./BaseTool";

/**
 * RectTool —— 矩形工具
 *
 * 行为：
 * - pointerDown：记录起点坐标
 * - pointerMove：根据起点和当前点计算宽高，实时预览矩形
 * - pointerUp：完成绘制，将最终的 RectElement 加入 elements，记入历史
 *
 * 特殊交互：
 * - 按住 Shift 键时，绘制正方形（宽高取较大值）
 *
 * 属性面板：
 * - 线条颜色（strokeColor）
 * - 填充颜色（fillColor）
 * - 线宽（strokeWidth）
 * - 透明度（opacity）
 */
export class RectTool extends BaseTool {
  readonly type: ToolType = "rect";

  /** 正在绘制中的临时元素（用于实时预览） */
  private wipElement: RectElement | null = null;

  /** 是否按住了 Shift 键（用于正方形约束） */
  private shiftPressed = false;

  // ==================== 事件处理 ====================

  onPointerDown(
    point: Point,
    state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    super.onPointerDown(point, state, _elements);

    // 创建一个宽高为 0 的矩形作为 wip 元素
    this.wipElement = createRectElement(
      point.x,
      point.y,
      0,
      0,
      state,
    );

    return {
      appState: { isDrawing: true, cursorType: "crosshair" },
    };
  }

  onPointerMove(
    point: Point,
    state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    if (!this.isActive || !this.wipElement) return {};

    let width = point.x - this.startPoint.x;
    let height = point.y - this.startPoint.y;

    // Shift 约束：正方形
    if (this.shiftPressed) {
      const maxDim = Math.max(Math.abs(width), Math.abs(height));
      width = maxDim * Math.sign(width || 1);
      height = maxDim * Math.sign(height || 1);
    }

    // 更新 wip 元素的宽高
    this.wipElement = {
      ...this.wipElement,
      width,
      height,
    };

    this.lastPoint = { ...point };

    return {
      appState: { isDrawing: true },
    };
  }

  onPointerUp(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    if (!this.isActive || !this.wipElement) {
      this.reset();
      return { appState: { isDrawing: false } };
    }

    let width = point.x - this.startPoint.x;
    let height = point.y - this.startPoint.y;

    // Shift 约束
    if (this.shiftPressed) {
      const maxDim = Math.max(Math.abs(width), Math.abs(height));
      width = maxDim * Math.sign(width || 1);
      height = maxDim * Math.sign(height || 1);
    }

    // 忽略太小的矩形（可能是误触）
    if (Math.abs(width) < 2 && Math.abs(height) < 2) {
      this.wipElement = null;
      super.onPointerUp(point, state, elements);
      return { appState: { isDrawing: false } };
    }

    // 规范化负宽高：确保 x/y 是左上角
    const finalX = width < 0 ? this.startPoint.x + width : this.startPoint.x;
    const finalY = height < 0 ? this.startPoint.y + height : this.startPoint.y;
    const finalWidth = Math.abs(width);
    const finalHeight = Math.abs(height);

    const finalElement: RectElement = {
      ...this.wipElement,
      x: finalX,
      y: finalY,
      width: finalWidth,
      height: finalHeight,
    };

    const newElements = [...elements, finalElement];

    // 清理
    this.wipElement = null;
    super.onPointerUp(point, state, elements);

    return {
      elements: newElements,
      appState: { isDrawing: false },
      captureHistory: true,
    };
  }

  // ==================== 工具生命周期 ====================

  onActivate(state: Readonly<AppState>): Partial<AppState> {
    this.wipElement = null;
    this.shiftPressed = false;
    return {
      ...super.onActivate(state),
      selectedElementIds: new Set<string>(),
      cursorType: "crosshair",
    };
  }

  onDeactivate(state: Readonly<AppState>): Partial<AppState> {
    this.wipElement = null;
    this.shiftPressed = false;
    return super.onDeactivate(state);
  }

  // ==================== 属性面板 ====================

  getPropertyPanel(): PropertyPanelConfig {
    return {
      items: [
        {
          type: "color-picker",
          label: "线条颜色",
          stateKey: "currentStrokeColor",
        },
        {
          type: "color-picker",
          label: "填充颜色",
          stateKey: "currentFillColor",
        },
        {
          type: "button-group",
          label: "线宽",
          stateKey: "currentStrokeWidth",
          options: [
            { value: 1, label: "细" },
            { value: 2, label: "中" },
            { value: 4, label: "粗" },
            { value: 8, label: "特粗" },
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

  protected getDefaultCursor(): string {
    return "crosshair";
  }

  // ==================== 公共方法 ====================

  /**
   * 获取正在绘制中的临时元素（用于 Canvas 组件实时预览渲染）
   */
  getWipElement(): RectElement | null {
    return this.wipElement;
  }

  /**
   * 设置 Shift 键状态（由 Canvas 组件在 keyDown/keyUp 时调用）
   */
  setShiftPressed(pressed: boolean): void {
    this.shiftPressed = pressed;
  }
}
