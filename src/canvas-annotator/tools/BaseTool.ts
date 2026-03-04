import type {
  Tool,
  ToolType,
  ToolResult,
  Point,
  AppState,
  CanvasElement,
  PropertyPanelConfig,
} from "../types";

/**
 * BaseTool —— 工具抽象基类
 *
 * 设计要点（对标 Excalidraw 的 Strategy 模式）：
 * - 所有工具共享同一套事件入口（onPointerDown/Move/Up）
 * - 宿主不关心当前是什么工具，只把事件转发给 activeTool
 * - 工具自己决定行为，返回 ToolResult 描述状态变更
 * - 子类只需覆写需要的方法即可
 *
 * 内部状态管理：
 * - isActive: 是否正在绘制中（pointerDown 后到 pointerUp 之间）
 * - startPoint: 记录 pointerDown 的起始坐标
 */
export abstract class BaseTool implements Tool {
  abstract readonly type: ToolType;

  /** 是否正在绘制中（pointerDown → pointerUp 之间） */
  protected isActive = false;

  /** 记录 pointerDown 的起始坐标 */
  protected startPoint: Point = { x: 0, y: 0 };

  /** 上一次 pointerMove 的坐标（用于计算增量） */
  protected lastPoint: Point = { x: 0, y: 0 };

  // ==================== 事件处理（子类覆写） ====================

  /**
   * 指针按下
   * 默认实现：记录起始坐标，标记为 isActive
   */
  onPointerDown(
    point: Point,
    _state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    this.isActive = true;
    this.startPoint = { ...point };
    this.lastPoint = { ...point };
    return {};
  }

  /**
   * 指针移动
   * 默认实现：更新 lastPoint，不产生任何变更
   */
  onPointerMove(
    point: Point,
    _state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    if (!this.isActive) return {};
    this.lastPoint = { ...point };
    return {};
  }

  /**
   * 指针抬起
   * 默认实现：重置 isActive
   */
  onPointerUp(
    point: Point,
    _state: Readonly<AppState>,
    _elements: readonly CanvasElement[],
  ): ToolResult {
    this.lastPoint = { ...point };
    this.isActive = false;
    return {};
  }

  // ==================== 工具生命周期 ====================

  /**
   * 工具被激活时调用
   * 子类可以覆写以设置初始光标、清理临时状态等
   */
  onActivate(_state: Readonly<AppState>): Partial<AppState> {
    this.reset();
    return {
      cursorType: this.getDefaultCursor(),
    };
  }

  /**
   * 工具被停用时调用
   * 子类可以覆写以清理未完成的绘制等
   */
  onDeactivate(_state: Readonly<AppState>): Partial<AppState> {
    this.reset();
    return {};
  }

  // ==================== 属性面板 ====================

  /**
   * 返回工具的属性面板配置（二级工具条内容）
   * 子类覆写以声明自己的属性面板
   */
  getPropertyPanel?(): PropertyPanelConfig;

  /**
   * 返回工具应使用的光标样式
   * 子类可覆写以根据 appState 动态返回光标
   */
  getCursor(_state: Readonly<AppState>): string {
    return this.getDefaultCursor();
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取工具的默认光标
   * 子类可覆写
   */
  protected getDefaultCursor(): string {
    return "crosshair";
  }

  /**
   * 重置工具的内部状态
   */
  protected reset(): void {
    this.isActive = false;
    this.startPoint = { x: 0, y: 0 };
    this.lastPoint = { x: 0, y: 0 };
  }

  /**
   * 计算两点之间的距离
   */
  protected distance(a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 计算从 startPoint 到指定点的增量
   */
  protected deltaFromStart(point: Point): { dx: number; dy: number } {
    return {
      dx: point.x - this.startPoint.x,
      dy: point.y - this.startPoint.y,
    };
  }

  /**
   * 计算从 lastPoint 到指定点的增量（用于拖拽移动）
   */
  protected deltaFromLast(point: Point): { dx: number; dy: number } {
    return {
      dx: point.x - this.lastPoint.x,
      dy: point.y - this.lastPoint.y,
    };
  }
}
