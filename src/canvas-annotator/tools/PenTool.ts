import type {
  ToolType,
  ToolResult,
  Point,
  AppState,
  CanvasElement,
  PenElement,
  PropertyPanelConfig,
} from "../types";
import { CaptureUpdateAction } from "../types";
import { createPenElement } from "../elements/factory";
import { BaseTool } from "./BaseTool";

/**
 * PenTool —— 画笔工具（自由绘制）
 *
 * 行为：
 * - pointerDown：创建新的 PenElement，记录第一个点
 * - pointerMove：持续添加新的点（含 pressure 信息），实时预览
 * - pointerUp：完成绘制，将最终的 PenElement 加入 elements，记入历史
 *
 * 属性面板：
 * - 颜色选择器（strokeColor）
 * - 粗细选择器（strokeWidth）
 * - 透明度滑块（opacity）
 */
export class PenTool extends BaseTool {
  readonly type: ToolType = "pen";

  /** 正在绘制中的临时元素 */
  private wipElement: PenElement | null = null;

  /** 采样距离阈值（像素），避免过于密集的点 */
  private readonly minSampleDistance = 2;

  // ==================== 事件处理 ====================

  onPointerDown(
    point: Point,
    state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    super.onPointerDown(point, state, _elements);

    // 创建新的画笔元素
    this.wipElement = createPenElement(point, state);

    return {
      // 返回包含 wip 元素的状态，用于实时预览
      appState: { isDrawing: true, cursorType: "crosshair" },
    };
  }

  onPointerMove(
    point: Point,
    state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    if (!this.isActive || !this.wipElement) return {};

    // 采样距离检查：如果距离上一个点太近则跳过，避免过密
    const lastPt = this.wipElement.points[this.wipElement.points.length - 1];
    if (lastPt && this.distance(lastPt, point) < this.minSampleDistance) {
      return {};
    }

    // 添加新的点
    this.wipElement = {
      ...this.wipElement,
      points: [
        ...this.wipElement.points,
        { x: point.x, y: point.y, pressure: point.pressure },
      ],
    };

    this.lastPoint = { ...point };

    // 返回 wip 元素用于实时预览（不记入历史）
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

    // 添加最后一个点
    const lastPt = this.wipElement.points[this.wipElement.points.length - 1];
    if (!lastPt || this.distance(lastPt, point) >= this.minSampleDistance) {
      this.wipElement = {
        ...this.wipElement,
        points: [
          ...this.wipElement.points,
          { x: point.x, y: point.y, pressure: point.pressure },
        ],
      };
    }

    // 如果只有一个点（点击而非拖拽），也保留（会渲染为一个小圆点）
    const finalElement = { ...this.wipElement };

    // 将完成的元素追加到 elements 数组
    const newElements = [...elements, finalElement];

    // 清理临时状态
    const wipRef = this.wipElement;
    this.wipElement = null;
    super.onPointerUp(point, state, elements);

    return {
      elements: newElements,
      appState: { isDrawing: false },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY, // 完成绘制，记入 undo 历史
    };
  }

  // ==================== 工具生命周期 ====================

  onActivate(state: Readonly<AppState>): Partial<AppState> {
    this.wipElement = null;
    return {
      ...super.onActivate(state),
      selectedElementIds: new Set<string>(),
      cursorType: "crosshair",
    };
  }

  onDeactivate(state: Readonly<AppState>): Partial<AppState> {
    this.wipElement = null;
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

  // ==================== 公共访问器 ====================

  /**
   * 获取正在绘制中的临时元素（用于 Canvas 组件实时预览渲染）
   */
  getWipElement(): PenElement | null {
    return this.wipElement;
  }
}
