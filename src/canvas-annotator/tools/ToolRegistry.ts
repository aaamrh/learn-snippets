import type { Tool, ToolType, AppState } from "../types";
import { PenTool } from "./PenTool";
import { RectTool } from "./RectTool";
import { CircleTool } from "./CircleTool";
import { ArrowTool } from "./ArrowTool";
import { TextTool } from "./TextTool";
import { EraserTool } from "./EraserTool";
import { SelectTool } from "./SelectTool";

/**
 * ToolRegistry —— 工具注册表
 *
 * 设计要点（对标 Excalidraw 的 Strategy 模式）：
 * - 所有工具统一注册到注册表中
 * - 根据 ToolType 返回对应的工具实例
 * - 管理工具切换时的 activate/deactivate 生命周期
 * - 宿主只与 ToolRegistry 交互，不直接管理工具实例
 *
 * 使用方式：
 * ```ts
 * const registry = new ToolRegistry();
 * const penTool = registry.getTool("pen");
 * const activeTool = registry.getActiveTool(appState);
 * ```
 */
export class ToolRegistry {
  private tools: Map<ToolType, Tool> = new Map();

  /** 当前活跃的工具类型（用于检测工具切换） */
  private currentToolType: ToolType | null = null;

  constructor() {
    // 注册所有内置工具
    this.registerDefaults();
  }

  // ==================== 注册 ====================

  /**
   * 注册单个工具
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.type)) {
      console.warn(
        `[ToolRegistry] Tool "${tool.type}" is already registered, overwriting.`,
      );
    }
    this.tools.set(tool.type, tool);
  }

  /**
   * 注销工具
   */
  unregisterTool(type: ToolType): boolean {
    return this.tools.delete(type);
  }

  /**
   * 注册所有内置工具
   */
  private registerDefaults(): void {
    this.registerTool(new PenTool());
    this.registerTool(new RectTool());
    this.registerTool(new CircleTool());
    this.registerTool(new ArrowTool());
    this.registerTool(new TextTool());
    this.registerTool(new EraserTool());
    this.registerTool(new SelectTool());
  }

  // ==================== 查询 ====================

  /**
   * 获取指定类型的工具实例
   */
  getTool<T extends Tool = Tool>(type: ToolType): T | undefined {
    return this.tools.get(type) as T | undefined;
  }

  /**
   * 获取当前活跃的工具实例（根据 appState.activeTool）
   */
  getActiveTool(state: Readonly<AppState>): Tool | undefined {
    return this.tools.get(state.activeTool);
  }

  /**
   * 获取所有已注册的工具类型
   */
  getRegisteredTypes(): ToolType[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 检查指定类型的工具是否已注册
   */
  hasTool(type: ToolType): boolean {
    return this.tools.has(type);
  }

  // ==================== 工具切换 ====================

  /**
   * 切换活跃工具
   *
   * 管理工具的 activate/deactivate 生命周期：
   * 1. 调用旧工具的 onDeactivate()
   * 2. 调用新工具的 onActivate()
   * 3. 合并两者返回的 appState 变更
   *
   * @param newToolType 要切换到的工具类型
   * @param state 当前应用状态
   * @returns 合并后的 appState 变更（包含新工具的初始光标等）
   */
  switchTool(
    newToolType: ToolType,
    state: Readonly<AppState>,
  ): Partial<AppState> {
    let stateUpdates: Partial<AppState> = {
      activeTool: newToolType,
    };

    // 1. 停用旧工具
    if (this.currentToolType && this.currentToolType !== newToolType) {
      const oldTool = this.tools.get(this.currentToolType);
      if (oldTool?.onDeactivate) {
        const deactivateUpdates = oldTool.onDeactivate(state);
        stateUpdates = { ...stateUpdates, ...deactivateUpdates };
      }
    }

    // 2. 激活新工具
    const newTool = this.tools.get(newToolType);
    if (newTool?.onActivate) {
      const activateUpdates = newTool.onActivate({
        ...state,
        ...stateUpdates,
      });
      stateUpdates = { ...stateUpdates, ...activateUpdates };
    }

    // 3. 更新当前工具类型
    this.currentToolType = newToolType;

    // 确保 activeTool 反映最新值
    stateUpdates.activeTool = newToolType;

    return stateUpdates;
  }

  // ==================== WIP 元素访问 ====================

  /**
   * 获取当前活跃工具正在绘制中的临时元素（Work In Progress）
   *
   * 用于 Canvas 组件的实时预览渲染：
   * - PenTool：正在绘制中的路径
   * - RectTool：正在拖拽中的矩形预览
   * - CircleTool：正在拖拽中的椭圆预览
   * - ArrowTool：正在拖拽中的箭头预览
   * - 其他工具：返回 null
   */
  getActiveWipElement(
    state: Readonly<AppState>,
  ): ReturnType<Tool["onPointerDown"]>["elements"] extends infer E
    ? import("../types").CanvasElement | null
    : never {
    const tool = this.getActiveTool(state);
    if (!tool) return null;

    // 每个工具都实现了 getWipElement() 方法
    if ("getWipElement" in tool && typeof tool.getWipElement === "function") {
      return tool.getWipElement();
    }

    return null;
  }

  // ==================== Shift 键状态传播 ====================

  /**
   * 将 Shift 键状态传播给支持该功能的工具
   *
   * 用于：
   * - RectTool：Shift → 正方形约束
   * - CircleTool：Shift → 正圆约束
   * - ArrowTool：Shift → 45° 角度约束
   * - SelectTool：Shift → 多选 toggle
   */
  setShiftPressed(pressed: boolean): void {
    for (const tool of this.tools.values()) {
      if ("setShiftPressed" in tool && typeof tool.setShiftPressed === "function") {
        tool.setShiftPressed(pressed);
      }
    }
  }

  // ==================== 工具特定访问器 ====================

  /**
   * 获取 TextTool 实例（用于注册文字输入回调等）
   */
  getTextTool(): TextTool | undefined {
    return this.getTool<TextTool>("text");
  }

  /**
   * 获取 SelectTool 实例（用于读取拖拽模式等）
   */
  getSelectTool(): SelectTool | undefined {
    return this.getTool<SelectTool>("select");
  }

  /**
   * 获取 PenTool 实例
   */
  getPenTool(): PenTool | undefined {
    return this.getTool<PenTool>("pen");
  }

  // ==================== 销毁 ====================

  /**
   * 销毁所有工具（用于组件卸载时清理）
   */
  destroy(): void {
    this.currentToolType = null;
    this.tools.clear();
  }

  /**
   * 重新初始化所有工具（用于重置状态）
   */
  reset(): void {
    this.currentToolType = null;
    this.tools.clear();
    this.registerDefaults();
  }
}
