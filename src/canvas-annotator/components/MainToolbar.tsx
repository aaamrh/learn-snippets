"use client";

import React from "react";
import type { ToolType, AppState } from "../types";
import { TOOLBAR_ITEMS } from "../types";
import type { ActionManager } from "../actions/ActionManager";

// ==================== Props ====================

interface MainToolbarProps {
  appState: Readonly<AppState>;
  actionManager: ActionManager;
  onToolChange: (toolType: ToolType) => void;
}

// ==================== 主工具栏 ====================

/**
 * MainToolbar —— 主工具栏
 *
 * 设计要点（对标 Excalidraw LayerUI + Actions.tsx）：
 *
 * ❌ 旧方式（平铺直叙）：
 *   <MainToolbar onUndo={...} onRedo={...} onClear={...} canUndo={...} ... />
 *   Toolbar 硬编码每个按钮的 onClick / disabled 逻辑，与业务强耦合
 *
 * ✅ 新方式（对标 Excalidraw）：
 *   <MainToolbar actionManager={actionManager} ... />
 *   Toolbar 只负责布局，按钮的 UI、disabled、onClick 全由 Action.PanelComponent 自己提供
 *   增删按钮 = 增删一个 Action，Toolbar 代码不用动
 *
 * renderAction("undo")     → undoAction.PanelComponent
 * renderAction("redo")     → redoAction.PanelComponent
 * renderAction("clearCanvas") → clearCanvasAction.PanelComponent
 * renderAction("toggleTranslate") → toggleTranslateAction.PanelComponent（SplitButton）
 *
 * isEnabled 通过 extraProps 注入给需要 disabled 状态的按钮：
 *   actionManager.renderAction("undo", { isEnabled: canUndo })
 */
export function MainToolbar({ appState, actionManager, onToolChange }: MainToolbarProps) {
  // canUndo / canRedo 需要从外部传进来，因为 HistoryManager 不在 ActionManager 里
  // 通过 isActionEnabled 检查 predicate 来决定是否可用
  const canUndo = actionManager.isActionEnabled("undo");
  const canRedo = actionManager.isActionEnabled("redo");

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl shadow-lg">
      {/* ==================== 工具按钮组 ==================== */}
      <div className="flex items-center gap-0.5">
        {TOOLBAR_ITEMS.map((item) => (
          <ToolButton
            key={item.type}
            type={item.type}
            label={item.label}
            icon={item.icon}
            isActive={appState.activeTool === item.type}
            onClick={() => onToolChange(item.type)}
          />
        ))}
      </div>

      <Separator />

      {/* ==================== 撤销 / 重做（走 renderAction） ==================== */}
      {/*
       * 对标 Excalidraw 的 UndoRedoActions：
       *   {renderAction("undo")}
       *   {renderAction("redo")}
       * isEnabled 作为 extraProps 注入，Action.PanelComponent 用它控制 disabled
       */}
      <div className="flex items-center gap-0.5">
        {actionManager.renderAction("undo", { isEnabled: canUndo })}
        {actionManager.renderAction("redo", { isEnabled: canRedo })}
      </div>

      <Separator />

      {/* ==================== 清空画布（走 renderAction） ==================== */}
      {/*
       * clearCanvasAction.predicate 会检查是否有可见元素
       * PanelComponent 内部通过 elements 自行判断 disabled
       */}
      {actionManager.renderAction("clearCanvas")}

      <Separator />

      {/* ==================== 翻译 SplitButton（走 renderAction） ==================== */}
      {/*
       * toggleTranslateAction.PanelComponent = TranslateSplitButton
       * 左侧点击 → perform() → 切换 appState.openDialog
       * 右侧箭头 → 弹出语言菜单 → updateData({ __changeLang: lang })
       *   → ActionManager.renderAction 内部拦截 __changeLang
       *   → dispatch changeTranslateTargetLang Action
       */}
      {actionManager.renderAction("toggleTranslate")}
    </div>
  );
}

// ==================== ToolButton ====================

interface ToolButtonProps {
  type: ToolType;
  label: string;
  icon: string;
  isActive: boolean;
  onClick: () => void;
}

function ToolButton({ label, icon, isActive, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      onClick={onClick}
      className={`
        relative flex items-center justify-center w-9 h-9 rounded-lg
        text-base transition-all duration-150 select-none
        ${
          isActive
            ? "bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-sm shadow-blue-500/10"
            : "text-gray-400 hover:text-white hover:bg-gray-700/60 border border-transparent"
        }
      `}
    >
      <span className="text-[15px] leading-none">{icon}</span>
      {isActive && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
      )}
    </button>
  );
}

// ==================== Separator ====================

function Separator() {
  return <div className="w-px h-6 bg-gray-700 mx-1.5" />;
}

export default MainToolbar;
