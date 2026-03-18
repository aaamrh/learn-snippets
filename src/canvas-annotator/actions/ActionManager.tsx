import React from "react";
import type { Action, ActionResult, AppState, CanvasElement } from "../types";

// ==================== HistoryState ====================

/**
 * HistoryState —— ActionManager 感知历史栈状态的接口
 *
 * ActionManager 不直接依赖 HistoryManager，而是通过注入的
 * getHistoryState getter 来查询 canUndo / canRedo，
 * 保持 ActionManager 与 HistoryManager 的解耦。
 */
export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * ActionManager —— 命令管理器（对标 Excalidraw 的 ActionManager）
 *
 * 核心设计：
 * - registerAction — 注册制，所有操作统一注册
 * - executeAction — 统一执行入口，所有操作经过同一管道
 * - handleKeyDown — 快捷键自动分发，按 keyPriority 排序
 * - renderAction — 每个 Action 可自带 PanelComponent（二级工具条）
 * - updater — 单一状态更新通道，所有 Action 的结果汇入同一出口
 * - getHistoryState — 注入的 getter，用于查询 canUndo / canRedo
 *   ActionManager 不直接依赖 HistoryManager，保持解耦
 */
export class ActionManager {
  private actions: Map<string, Action> = new Map();
  private updater: (result: ActionResult) => void;
  private getAppState: () => Readonly<AppState>;
  private getElements: () => readonly CanvasElement[];
  /** 注入的历史状态 getter，默认返回全 false（不可撤销/重做） */
  private getHistoryState: () => HistoryState = () => ({ canUndo: false, canRedo: false });

  constructor(
    updater: (result: ActionResult) => void,
    getAppState: () => Readonly<AppState>,
    getElements: () => readonly CanvasElement[],
  ) {
    this.updater = updater;
    this.getAppState = getAppState;
    this.getElements = getElements;
  }

  // ==================== 注册 ====================

  /**
   * 注册单个 Action
   */
  registerAction(action: Action): void {
    if (this.actions.has(action.name)) {
      console.warn(`[ActionManager] Action "${action.name}" is already registered, overwriting.`);
    }
    this.actions.set(action.name, action);
  }

  /**
   * 批量注册 Actions
   */
  registerAll(actions: readonly Action[]): void {
    for (const action of actions) {
      this.registerAction(action);
    }
  }

  /**
   * 注销 Action
   */
  unregisterAction(name: string): boolean {
    return this.actions.delete(name);
  }

  /**
   * 获取已注册的 Action
   */
  getAction(name: string): Action | undefined {
    return this.actions.get(name);
  }

  /**
   * 获取所有已注册的 Action 名称
   */
  getActionNames(): string[] {
    return Array.from(this.actions.keys());
  }

  // ==================== 执行 ====================

  /**
   * 执行指定 Action
   *
   * @param action Action 对象或 Action 名称
   * @param formData 来自 PanelComponent 或外部调用的附加数据
   * @returns 执行结果，如果 Action 不存在或 predicate 不通过则返回 null
   */
  executeAction(action: Action | string, formData?: unknown): ActionResult | null {
    const resolved = typeof action === "string" ? this.actions.get(action) : action;

    if (!resolved) {
      console.warn(`[ActionManager] Action "${action}" not found.`);
      return null;
    }

    const elements = this.getElements();
    const appState = this.getAppState();

    // 检查 predicate（当前上下文是否允许执行此 Action）
    if (resolved.predicate && !resolved.predicate(elements, appState)) {
      return null;
    }

    const result = resolved.perform(elements, appState, formData);

    // 只有 perform 返回的非 false 结果才推送给 updater
    if (result) {
      this.updater(result);
    }

    return result;
  }

  // ==================== 快捷键分发 ====================

  /**
   * 处理键盘事件：遍历所有 action，找到匹配的 keyTest 并执行
   *
   * 设计要点（对标 Excalidraw）：
   * - 按 keyPriority 降序排序，优先级高的先匹配
   * - 只有恰好一个 Action 匹配时才执行（避免歧义）
   * - 返回 true 表示事件已被处理
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    const appState = this.getAppState();
    const elements = this.getElements();

    // 收集所有匹配的 Actions，按 keyPriority 降序
    const matching = Array.from(this.actions.values())
      .filter((action) => {
        // 必须有 keyTest
        if (!action.keyTest) return false;
        // keyTest 必须通过
        if (!action.keyTest(event, appState)) return false;
        // predicate 也必须通过
        if (action.predicate && !action.predicate(elements, appState)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (b.keyPriority ?? 0) - (a.keyPriority ?? 0));

    if (matching.length === 0) {
      return false;
    }

    // 取最高优先级的 Action 执行
    event.preventDefault();
    event.stopPropagation();

    const topAction = matching[0];
    const result = topAction.perform(elements, appState, { key: event.key });
    if (result) {
      this.updater(result);
    }

    return true;
  }

  // ==================== UI 渲染 ====================

  /**
   * 渲染 Action 的 PanelComponent
   *
   * 对标 Excalidraw 的 ActionManager.renderAction：
   * - 每个 Action 通过 PanelComponent 自带 UI（按钮、颜色选择器等）
   * - Toolbar 只负责布局摆放，不硬编码任何业务逻辑
   * - extraProps 用于注入上下文（如 isEnabled），由调用方按需传入
   *
   * @param name Action 名称
   * @param extraProps 额外注入到 PanelComponent 的 props（如 { isEnabled: false }）
   * @returns React 元素，或 null
   */
  renderAction(name: string, extraProps?: Record<string, unknown>): React.ReactElement | null {
    const action = this.actions.get(name);
    if (!action?.PanelComponent) {
      return null;
    }

    const elements = this.getElements();
    const appState = this.getAppState();
    const PanelComponent = action.PanelComponent;

    const updateData = (formData: unknown) => {
      // 特殊处理：toggleTranslate 的语言切换附带 __changeLang 指令
      if (
        formData !== null &&
        typeof formData === "object" &&
        "__changeLang" in (formData as object)
      ) {
        const changeLangAction = this.actions.get("changeTranslateTargetLang");
        if (changeLangAction) {
          const langResult = changeLangAction.perform(elements, appState, {
            lang: (formData as { __changeLang: string }).__changeLang,
          });
          if (langResult) this.updater(langResult);
        }
        return;
      }

      const result = action.perform(elements, appState, formData);
      if (result) {
        this.updater(result);
      }
    };

    return (
      <PanelComponent
        elements={elements}
        appState={appState}
        updateData={updateData}
        key={name}
        {...extraProps}
      />
    );
  }

  /**
   * 检查指定 Action 在当前上下文中是否可用
   *
   * 对 undo / redo 特殊处理：
   * 这两个 Action 没有 predicate（因为 predicate 拿不到 HistoryManager），
   * 而是通过 getHistoryState getter 来判断是否可用。
   * 其他 Action 走标准的 predicate 逻辑。
   */
  isActionEnabled(name: string): boolean {
    const action = this.actions.get(name);
    if (!action) return false;

    // undo / redo 特殊处理：从注入的 getter 读取历史栈状态
    if (name === "undo") return this.getHistoryState().canUndo;
    if (name === "redo") return this.getHistoryState().canRedo;

    if (!action.predicate) return true;
    return action.predicate(this.getElements(), this.getAppState());
  }

  /**
   * 更新 updater 回调（用于在组件重新渲染时保持引用最新）
   */
  setUpdater(updater: (result: ActionResult) => void): void {
    this.updater = updater;
  }

  /**
   * 更新 state/elements 的 getter（用于在组件重新渲染时保持引用最新）
   */
  setGetters(
    getAppState: () => Readonly<AppState>,
    getElements: () => readonly CanvasElement[],
  ): void {
    this.getAppState = getAppState;
    this.getElements = getElements;
  }

  /**
   * 注入历史状态 getter
   *
   * 由 page.tsx 在 ActionManager 初始化后调用：
   *   actionManager.setHistoryStateGetter(() => ({
   *     canUndo: historyManager.canUndo(),
   *     canRedo: historyManager.canRedo(),
   *   }));
   *
   * 这样 isActionEnabled("undo") / isActionEnabled("redo") 就能
   * 返回真实的可用状态，MainToolbar 不再需要从外部传 canUndo / canRedo。
   */
  setHistoryStateGetter(getter: () => HistoryState): void {
    this.getHistoryState = getter;
  }
}
