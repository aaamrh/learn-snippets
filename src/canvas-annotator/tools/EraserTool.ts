import type {
  ToolType,
  ToolResult,
  Point,
  AppState,
  CanvasElement,
  PropertyPanelConfig,
} from "../types";
import { CaptureUpdateAction } from "../types";
import { hitTest } from "../elements/hitTest";
import { markElementDeleted } from "../elements/factory";
import { BaseTool } from "./BaseTool";

/**
 * EraserTool —— 橡皮擦工具
 *
 * 行为：
 * - pointerDown：hitTest 检测点击位置的元素，标记 isDeleted = true
 * - pointerMove：如果按住鼠标拖拽，持续擦除经过的元素（连续擦除模式）
 * - pointerUp：完成擦除操作，记入 undo 历史
 *
 * 设计要点：
 * - 不真正删除元素，而是标记 isDeleted = true（软删除）
 * - 这样 undo/redo 可以直接恢复元素的 isDeleted 标记
 * - 支持拖拽连续擦除（按住不放拖过多个元素一次性删除）
 */
export class EraserTool extends BaseTool {
  readonly type: ToolType = "eraser";

  /** 本次擦除操作中已擦除的元素 ID 集合（用于避免重复 hitTest） */
  private erasedIds: Set<string> = new Set();

  /** 是否在本次操作中真正擦除了任何元素 */
  private hasErased = false;

  // ==================== 事件处理 ====================

  onPointerDown(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    super.onPointerDown(point, state, elements);

    this.erasedIds = new Set();
    this.hasErased = false;

    // 执行 hitTest 检测点击位置的元素
    const result = this.eraseAtPoint(point, state, elements);

    return {
      ...result,
      appState: {
        ...result.appState,
        isDrawing: true,
        cursorType: "not-allowed",
        // 清除选中状态
        selectedElementIds: new Set<string>(),
      },
    };
  }

  onPointerMove(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    if (!this.isActive) return {};

    this.lastPoint = { ...point };

    // 连续擦除模式：拖拽过程中持续擦除
    const result = this.eraseAtPoint(point, state, elements);

    return {
      ...result,
      appState: {
        ...result.appState,
        isDrawing: true,
      },
    };
  }

  onPointerUp(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    if (!this.isActive) {
      this.reset();
      return { appState: { isDrawing: false } };
    }

    // 最后再擦一次（鼠标抬起位置）
    const result = this.eraseAtPoint(point, state, elements);
    const finalElements = result.elements ?? elements;

    const hadErasure = this.hasErased;

    // 清理
    this.erasedIds = new Set();
    this.hasErased = false;
    super.onPointerUp(point, state, elements);

    return {
      elements: finalElements,
      appState: { isDrawing: false },
      // 只有真正擦除了元素才记入历史
      captureUpdate: hadErasure ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER,
    };
  }

  // ==================== 擦除逻辑 ====================

  /**
   * 在指定坐标处执行 hitTest 并标记命中元素为已删除
   */
  private eraseAtPoint(
    point: Point,
    state: Readonly<AppState>,
    elements: readonly CanvasElement[],
  ): ToolResult {
    // 构建一个临时的 appState 用于 hitTest
    // 需要清除 selectedElementIds 避免命中选中手柄
    const hitState: AppState = {
      ...state,
      selectedElementIds: new Set<string>(),
    };

    const hitResult = hitTest(point.x, point.y, elements, hitState);

    if (!hitResult.elementId) {
      return {};
    }

    // 已经在本次操作中擦除过的元素不再处理
    if (this.erasedIds.has(hitResult.elementId)) {
      return {};
    }

    // 标记为已删除
    this.erasedIds.add(hitResult.elementId);
    this.hasErased = true;

    const newElements = markElementDeleted(elements, hitResult.elementId);

    return {
      elements: newElements,
    };
  }

  // ==================== 工具生命周期 ====================

  onActivate(state: Readonly<AppState>): Partial<AppState> {
    this.erasedIds = new Set();
    this.hasErased = false;
    return {
      ...super.onActivate(state),
      selectedElementIds: new Set<string>(),
      cursorType: "not-allowed",
    };
  }

  onDeactivate(state: Readonly<AppState>): Partial<AppState> {
    this.erasedIds = new Set();
    this.hasErased = false;
    return super.onDeactivate(state);
  }

  // ==================== 属性面板 ====================

  /**
   * 橡皮擦工具没有属性面板
   * 不需要选择颜色/粗细等参数
   */
  getPropertyPanel(): PropertyPanelConfig {
    return {
      items: [],
    };
  }

  // ==================== 光标 ====================

  getCursor(_state: Readonly<AppState>): string {
    return "not-allowed";
  }

  protected getDefaultCursor(): string {
    return "not-allowed";
  }

  // ==================== 公共方法 ====================

  /**
   * 获取本次操作中已擦除的元素 ID 集合
   */
  getErasedIds(): ReadonlySet<string> {
    return this.erasedIds;
  }

  /**
   * 橡皮擦工具没有 wip 元素
   */
  getWipElement(): null {
    return null;
  }
}
