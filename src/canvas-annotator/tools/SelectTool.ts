import type {
  ToolType,
  ToolResult,
  Point,
  AppState,
  CanvasElement,
  HandlePosition,
  PropertyPanelConfig,
} from "../types";
import { CaptureUpdateAction } from "../types";
import { hitTest } from "../elements/hitTest";
import { moveElements } from "../elements/transform";
import { resizeElement } from "../elements/transform";
import { getHandleCursor } from "../elements/transform";
import { BaseTool } from "./BaseTool";

/**
 * SelectTool —— 选择工具（移动、缩放、多选）
 *
 * 行为：
 * - pointerDown：
 *   - hitTest 检测点击位置 → 命中元素则选中（高亮 + 显示缩放手柄）
 *   - 命中已选中元素的缩放手柄 → 进入缩放模式
 *   - 命中已选中元素本体 → 进入移动模式
 *   - 未命中任何元素 → 清除选中
 *   - 按住 Shift 点击 → 多选切换（toggle）
 *
 * - pointerMove：
 *   - 移动模式：拖拽移动选中的元素
 *   - 缩放模式：根据拖拽的手柄缩放元素
 *   - 空闲模式：根据悬停元素更新光标
 *
 * - pointerUp：
 *   - 完成移动/缩放操作，记入 undo 历史
 *
 * 属性面板：无（选择工具不需要颜色/粗细等属性）
 */

type DragMode = "idle" | "moving" | "resizing";

export class SelectTool extends BaseTool {
  readonly type: ToolType = "select";

  /** 当前拖拽模式 */
  private dragMode: DragMode = "idle";

  /** 正在缩放的手柄位置 */
  private activeHandle: HandlePosition | null = null;

  /** 正在缩放的目标元素 ID */
  private resizingElementId: string | null = null;

  /** 拖拽起始时的元素快照（用于计算增量） */
  private dragStartElements: readonly CanvasElement[] | null = null;

  /** 拖拽起始时的场景坐标 */
  private dragStartPoint: Point = { x: 0, y: 0 };

  /** 是否按住了 Shift 键（用于多选 toggle） */
  private shiftPressed = false;

  /** 在本次 pointerDown → pointerUp 之间是否发生了实际拖拽 */
  private hasDragged = false;

  /** 最小拖拽距离阈值（像素），低于此值视为点击而非拖拽 */
  private readonly dragThreshold = 3;

  // ==================== 事件处理 ====================

  onPointerDown(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    super.onPointerDown(point, state, elements);

    this.hasDragged = false;
    this.dragStartPoint = { ...point };
    this.dragStartElements = elements;

    // hitTest：检测点击位置
    const hit = hitTest(point.x, point.y, elements, state);

    // Case 1: 命中了选中元素的缩放手柄
    if (hit.elementId && hit.handle && state.selectedElementIds.has(hit.elementId)) {
      this.dragMode = "resizing";
      this.activeHandle = hit.handle;
      this.resizingElementId = hit.elementId;

      return {
        appState: {
          isDrawing: true,
          cursorType: getHandleCursor(hit.handle),
        },
      };
    }

    // Case 2: 命中了某个元素（可能是已选中的，也可能是新元素）
    if (hit.elementId) {
      const isAlreadySelected = state.selectedElementIds.has(hit.elementId);

      let newSelectedIds: Set<string>;

      if (this.shiftPressed) {
        // Shift + 点击：多选 toggle
        newSelectedIds = new Set(state.selectedElementIds);
        if (isAlreadySelected) {
          newSelectedIds.delete(hit.elementId);
        } else {
          newSelectedIds.add(hit.elementId);
        }
      } else if (isAlreadySelected) {
        // 点击已选中的元素：保持当前选中集合（准备拖拽移动）
        newSelectedIds = new Set(state.selectedElementIds);
      } else {
        // 点击新元素：只选中这一个
        newSelectedIds = new Set([hit.elementId]);
      }

      // 进入移动模式
      this.dragMode = "moving";

      return {
        appState: {
          isDrawing: true,
          selectedElementIds: newSelectedIds,
          cursorType: "move",
        },
      };
    }

    // Case 3: 未命中任何元素 → 清除选中
    this.dragMode = "idle";

    return {
      appState: {
        isDrawing: false,
        selectedElementIds: new Set<string>(),
        cursorType: "default",
      },
    };
  }

  onPointerMove(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    // 未处于任何拖拽模式 → 更新悬停光标
    if (!this.isActive || this.dragMode === "idle") {
      return this.updateHoverCursor(point, state, elements);
    }

    // 检查是否超过拖拽阈值
    if (!this.hasDragged) {
      const dist = this.distance(this.dragStartPoint, point);
      if (dist < this.dragThreshold) {
        return {};
      }
      this.hasDragged = true;
    }

    // 计算从拖拽起点到当前位置的总增量
    const totalDeltaX = point.x - this.dragStartPoint.x;
    const totalDeltaY = point.y - this.dragStartPoint.y;

    this.lastPoint = { ...point };

    // 移动模式
    if (this.dragMode === "moving" && this.dragStartElements) {
      const newElements = moveElements(
        this.dragStartElements,
        state.selectedElementIds,
        totalDeltaX,
        totalDeltaY,
      );

      return {
        elements: newElements,
        appState: { cursorType: "move" },
      };
    }

    // 缩放模式
    if (
      this.dragMode === "resizing" &&
      this.activeHandle &&
      this.resizingElementId &&
      this.dragStartElements
    ) {
      const newElements = this.dragStartElements.map((el) => {
        if (el.id !== this.resizingElementId) return el;
        return resizeElement(el, this.activeHandle!, totalDeltaX, totalDeltaY);
      });

      return {
        elements: newElements,
        appState: {
          cursorType: getHandleCursor(this.activeHandle),
        },
      };
    }

    return {};
  }

  onPointerUp(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    const wasMovingOrResizing =
      this.hasDragged && (this.dragMode === "moving" || this.dragMode === "resizing");

    // 重置拖拽状态
    this.dragMode = "idle";
    this.activeHandle = null;
    this.resizingElementId = null;
    this.dragStartElements = null;
    this.hasDragged = false;

    super.onPointerUp(point, state, elements);

    // 更新悬停光标
    const cursorResult = this.updateHoverCursor(point, state, elements);

    return {
      ...cursorResult,
      appState: {
        ...cursorResult.appState,
        isDrawing: false,
      },
      // 只有真正发生了移动或缩放才记入历史
      captureUpdate: wasMovingOrResizing ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER,
    };
  }

  // ==================== 悬停光标更新 ====================

  /**
   * 根据鼠标悬停位置更新光标样式
   * - 悬停在选中元素手柄上 → 对应的 resize 光标
   * - 悬停在元素上 → move 光标
   * - 悬停在空白处 → default 光标
   */
  private updateHoverCursor(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    const hit = hitTest(point.x, point.y, elements, state);

    if (hit.elementId && hit.handle) {
      return {
        appState: { cursorType: getHandleCursor(hit.handle) },
      };
    }

    if (hit.elementId) {
      return {
        appState: { cursorType: "move" },
      };
    }

    return {
      appState: { cursorType: "default" },
    };
  }

  // ==================== 工具生命周期 ====================

  onActivate(state: Readonly<AppState>): Partial<AppState> {
    this.dragMode = "idle";
    this.activeHandle = null;
    this.resizingElementId = null;
    this.dragStartElements = null;
    this.hasDragged = false;
    this.shiftPressed = false;

    return {
      ...super.onActivate(state),
      cursorType: "default",
    };
  }

  onDeactivate(state: Readonly<AppState>): Partial<AppState> {
    this.dragMode = "idle";
    this.activeHandle = null;
    this.resizingElementId = null;
    this.dragStartElements = null;
    this.hasDragged = false;
    this.shiftPressed = false;

    return {
      ...super.onDeactivate(state),
      selectedElementIds: new Set<string>(),
    };
  }

  // ==================== 属性面板 ====================

  /**
   * 选择工具没有专属属性面板
   * 选中元素后可以通过 Action（changeColor 等）修改属性
   */
  getPropertyPanel(): PropertyPanelConfig {
    return {
      items: [],
    };
  }

  // ==================== 光标 ====================

  getCursor(state: Readonly<AppState>): string {
    if (this.dragMode === "moving") return "move";
    if (this.dragMode === "resizing" && this.activeHandle) {
      return getHandleCursor(this.activeHandle);
    }
    return "default";
  }

  protected getDefaultCursor(): string {
    return "default";
  }

  // ==================== 公共方法 ====================

  /**
   * 设置 Shift 键状态（由 Canvas 组件在 keyDown/keyUp 时调用）
   * 用于多选 toggle
   */
  setShiftPressed(pressed: boolean): void {
    this.shiftPressed = pressed;
  }

  /**
   * 获取当前拖拽模式（用于调试或 UI 状态显示）
   */
  getDragMode(): DragMode {
    return this.dragMode;
  }

  /**
   * 选择工具没有 wip 元素
   */
  getWipElement(): null {
    return null;
  }
}
