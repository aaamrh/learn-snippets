import type {
  ToolType,
  ToolResult,
  Point,
  AppState,
  CanvasElement,
  ArrowElement,
  PropertyPanelConfig,
} from "../types";
import { CaptureUpdateAction } from "../types";
import { createArrowElement } from "../elements/factory";
import { BaseTool } from "./BaseTool";

/**
 * ArrowTool —— 箭头工具
 *
 * 行为：
 * - pointerDown：记录起点坐标
 * - pointerMove：根据起点和当前点实时预览箭头线段
 * - pointerUp：完成绘制，将最终的 ArrowElement 加入 elements，记入历史
 *
 * 特殊交互：
 * - 按住 Shift 键时，约束角度为 45° 的整数倍（水平/垂直/对角线）
 *
 * 属性面板：
 * - 颜色（strokeColor）
 * - 粗细（strokeWidth）
 * - 透明度（opacity）
 */
export class ArrowTool extends BaseTool {
  readonly type: ToolType = "arrow";

  /** 正在绘制中的临时元素（用于实时预览） */
  private wipElement: ArrowElement | null = null;

  /** 是否按住了 Shift 键（用于角度约束） */
  private shiftPressed = false;

  // ==================== 事件处理 ====================

  onPointerDown(
    point: Point,
    state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    super.onPointerDown(point, state, _elements);

    // 创建一个终点与起点重合的箭头作为 wip 元素
    this.wipElement = createArrowElement(
      point.x,
      point.y,
      point.x,
      point.y,
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

    const endPoint = this.constrainPoint(point);

    // 更新 wip 元素的终点
    this.wipElement = {
      ...this.wipElement,
      endX: endPoint.x,
      endY: endPoint.y,
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

    const endPoint = this.constrainPoint(point);

    // 忽略太短的箭头（可能是误触）
    const length = this.distance(this.startPoint, endPoint);
    if (length < 3) {
      this.wipElement = null;
      super.onPointerUp(point, state, elements);
      return { appState: { isDrawing: false } };
    }

    const finalElement: ArrowElement = {
      ...this.wipElement,
      endX: endPoint.x,
      endY: endPoint.y,
    };

    const newElements = [...elements, finalElement];

    // 清理
    this.wipElement = null;
    super.onPointerUp(point, state, elements);

    return {
      elements: newElements,
      appState: { isDrawing: false },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  }

  // ==================== 角度约束 ====================

  /**
   * 当按住 Shift 键时，将终点约束到 45° 的整数倍方向
   * 即只能画水平、垂直、或 45° 对角线的箭头
   */
  private constrainPoint(point: Point): Point {
    if (!this.shiftPressed) {
      return point;
    }

    const dx = point.x - this.startPoint.x;
    const dy = point.y - this.startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return point;

    // 计算当前角度，然后 snap 到最近的 45° 倍数
    const angle = Math.atan2(dy, dx);
    const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);

    return {
      x: this.startPoint.x + length * Math.cos(snapAngle),
      y: this.startPoint.y + length * Math.sin(snapAngle),
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
          label: "颜色",
          stateKey: "currentStrokeColor",
        },
        {
          type: "button-group",
          label: "粗细",
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
  getWipElement(): ArrowElement | null {
    return this.wipElement;
  }

  /**
   * 设置 Shift 键状态（由 Canvas 组件在 keyDown/keyUp 时调用）
   */
  setShiftPressed(pressed: boolean): void {
    this.shiftPressed = pressed;
  }
}
