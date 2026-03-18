"use client";

import React from "react";
import type { AppState } from "../types";
import type { ActionManager } from "../actions/ActionManager";

// ==================== Props ====================

interface MainToolbarProps {
  appState: Readonly<AppState>;
  actionManager: ActionManager;
}

// ==================== 主工具栏 ====================

/**
 * MainToolbar —— 主工具栏
 *
 * 设计要点（对标 Excalidraw LayerUI + Actions.tsx）：
 *
 * 所有按钮（工具切换/撤销/重做/清空/翻译）都通过 actionManager.renderAction() 渲染
 * Toolbar 本身不感知任何业务逻辑，只负责布局
 *
 * renderAction("changeActiveTool") → changeActiveToolAction.PanelComponent
 * renderAction("undo")            → undoAction.PanelComponent
 * renderAction("redo")            → redoAction.PanelComponent
 * renderAction("clearCanvas")     → clearCanvasAction.PanelComponent
 * renderAction("toggleTranslate") → toggleTranslateAction.PanelComponent（SplitButton）
 */
export function MainToolbar({ actionManager }: MainToolbarProps) {
  const canUndo = actionManager.isActionEnabled("undo");
  const canRedo = actionManager.isActionEnabled("redo");

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl shadow-lg">
      {/* ==================== 工具按钮组（走 renderAction） ==================== */}
      {actionManager.renderAction("changeActiveTool")}

      <Separator />

      {/* ==================== 撤销 / 重做（走 renderAction） ==================== */}
      <div className="flex items-center gap-0.5">
        {actionManager.renderAction("undo", { isEnabled: canUndo })}
        {actionManager.renderAction("redo", { isEnabled: canRedo })}
      </div>

      <Separator />

      {/* ==================== 清空画布（走 renderAction） ==================== */}
      {actionManager.renderAction("clearCanvas")}

      <Separator />

      {/* ==================== 翻译 SplitButton（走 renderAction） ==================== */}
      {actionManager.renderAction("toggleTranslate")}
    </div>
  );
}

// ==================== Separator ====================

function Separator() {
  return <div className="w-px h-6 bg-gray-700 mx-1.5" />;
}

export default MainToolbar;
