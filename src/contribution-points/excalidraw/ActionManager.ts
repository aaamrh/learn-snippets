import type { FC } from "react";

// ==================== Excalidraw 模式 ====================
// 核心差异：Action = 统一对象（数据 + 行为 + UI 组件），没有 manifest
// 一切都是运行时注册，没有懒加载，没有 JSON 声明
// keyTest 是函数而不是字符串 → 更灵活但更不可序列化

export interface AppState {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  [key: string]: unknown;
}

export interface ActionResult {
  appState?: Partial<AppState>;
  commitToHistory?: boolean;
}

export interface PanelComponentProps {
  appState: AppState;
  updateData: (data: Partial<AppState>) => void;
}

// ---- Action: 数据 + 行为 + UI 全在一个对象里 ----
export interface Action {
  name: string;
  label: string;
  icon?: string;
  keywords?: string[];
  perform: (appState: AppState) => ActionResult;
  keyTest?: (event: KeyboardEvent) => boolean;
  PanelComponent?: FC<PanelComponentProps>;
  checked?: (appState: AppState) => boolean;
  predicate?: (appState: AppState) => boolean; // 是否可用
}

// ==================== ActionManager ====================

export class ActionManager {
  private actions = new Map<string, Action>();

  registerAction(action: Action): void {
    this.actions.set(action.name, action);
  }

  registerAll(actions: Action[]): void {
    for (const action of actions) {
      this.registerAction(action);
    }
  }

  executeAction(
    name: string,
    appState: AppState
  ): ActionResult {
    const action = this.actions.get(name);
    if (!action) return {};
    if (action.predicate && !action.predicate(appState)) return {};
    return action.perform(appState);
  }

  handleKeyDown(
    event: KeyboardEvent,
    appState: AppState
  ): { handled: boolean; result: ActionResult; actionName?: string } {
    for (const action of this.actions.values()) {
      if (action.keyTest?.(event)) {
        const result = this.executeAction(action.name, appState);
        return { handled: true, result, actionName: action.name };
      }
    }
    return { handled: false, result: {} };
  }

  getAction(name: string): Action | undefined {
    return this.actions.get(name);
  }

  getActions(): Action[] {
    return [...this.actions.values()];
  }

  getActionsWithPanels(): Action[] {
    return this.getActions().filter((a) => a.PanelComponent != null);
  }
}
