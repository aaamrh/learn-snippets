import type {
  ToolType,
  ToolResult,
  Point,
  AppState,
  CanvasElement,
  CircleElement,
  PropertyPanelConfig,
} from "../types";
import { createCircleElement } from "../elements/factory";
import { BaseTool } from "./BaseTool";

/**
 * CircleTool —— 圆形/椭圆工具
 *
 * 行为：
 * - pointerDown：记录中心点坐标
 * - pointerMove：根据中心点和当前点计算半径，实时预览椭圆
 * - pointerUp：完成绘制，将最终的 CircleElement 加入 elements，记入历史
 *
 * 特殊交互：
 * - 按住 Shift 键时，绘制正圆（radiusX === radiusY，取较大值）
 *
 * 属性面板：
 * - 线条颜色（strokeColor）
 * - 填充颜色（fillColor）
 * - 线宽（strokeWidth）
 * - 透明度（opacity）
 */
export class CircleTool extends BaseTool {
  readonly type: ToolType = "circle";

  /** 正在绘制中的临时元素（用于实时预览） */
  private wipElement: CircleElement | null = null;

  /** 是否按住了 Shift 键（用于正圆约束） */
  private shiftPressed = false;

  // ==================== 事件处理 ====================

  onPointerDown(
    point: Point,
    state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    super.onPointerDown(point, state, _elements);

    // 创建一个半径为 0 的椭圆作为 wip 元素
    this.wipElement = createCircleElement(
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

    let radiusX = Math.abs(point.x - this.startPoint.x);
    let radiusY = Math.abs(point.y - this.startPoint.y);

    // Shift 约束：正圆
    if (this.shiftPressed) {
      const maxRadius = Math.max(radiusX, radiusY);
      radiusX = maxRadius;
      radiusY = maxRadius;
    }

    // 更新 wip 元素
    this.wipElement = {
      ...this.wipElement,
      radiusX,
      radiusY,
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

    let radiusX = Math.abs(point.x - this.startPoint.x);
    let radiusY = Math.abs(point.y - this.startPoint.y);

    // Shift 约束
    if (this.shiftPressed) {
      const maxRadius = Math.max(radiusX, radiusY);
      radiusX = maxRadius;
      radiusY = maxRadius;
    }

    // 忽略太小的圆形（可能是误触）
    if (radiusX < 2 && radiusY < 2) {
      this.wipElement = null;
      super.onPointerUp(point, state, elements);
      return { appState: { isDrawing: false } };
    }

    const finalElement: CircleElement = {
      ...this.wipElement,
      radiusX,
      radiusY,
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
  getWipElement(): CircleElement | null {
    return this.wipElement;
  }

  /**
   * 设置 Shift 键状态（由 Canvas 组件在 keyDown/keyUp 时调用）
   */
  setShiftPressed(pressed: boolean): void {
    this.shiftPressed = pressed;
  }
}
