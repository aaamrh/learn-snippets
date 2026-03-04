"use client";

import React from "react";
import type { ToolType, AppState } from "../types";
import { TOOLBAR_ITEMS } from "../types";

// ==================== Props ====================

interface MainToolbarProps {
  appState: Readonly<AppState>;
  onToolChange: (toolType: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
}

// ==================== 主工具栏 ====================

/**
 * MainToolbar —— 主工具栏
 *
 * 包含：
 * - 绘图工具切换按钮（画笔、矩形、圆形、箭头、文字、橡皮擦、选择）
 * - 分隔符
 * - 撤销 / 重做按钮
 * - 清空画布按钮
 *
 * 设计要点：
 * - 当前激活的工具按钮高亮（通过 appState.activeTool 匹配）
 * - 撤销/重做按钮在不可用时 disabled
 * - 所有操作通过 props 回调触发，组件本身不持有状态
 */
export function MainToolbar({
  appState,
  onToolChange,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  canClear,
}: MainToolbarProps) {
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

      {/* ==================== 分隔符 ==================== */}
      <Separator />

      {/* ==================== 撤销 / 重做 ==================== */}
      <div className="flex items-center gap-0.5">
        <ActionButton
          label="撤销"
          icon="↶"
          onClick={onUndo}
          disabled={!canUndo}
          shortcut="Ctrl+Z"
        />
        <ActionButton
          label="重做"
          icon="↷"
          onClick={onRedo}
          disabled={!canRedo}
          shortcut="Ctrl+Y"
        />
      </div>

      {/* ==================== 分隔符 ==================== */}
      <Separator />

      {/* ==================== 清空画布 ==================== */}
      <ActionButton
        label="清空"
        icon="🗑"
        onClick={onClear}
        disabled={!canClear}
        variant="danger"
      />
    </div>
  );
}

// ==================== 工具按钮 ====================

interface ToolButtonProps {
  type: ToolType;
  label: string;
  icon: string;
  isActive: boolean;
  onClick: () => void;
}

function ToolButton({ type, label, icon, isActive, onClick }: ToolButtonProps) {
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

      {/* 激活指示器（底部小点） */}
      {isActive && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
      )}
    </button>
  );
}

// ==================== 操作按钮 ====================

interface ActionButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
  variant?: "default" | "danger";
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled = false,
  shortcut,
  variant = "default",
}: ActionButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label;

  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center justify-center w-9 h-9 rounded-lg
        text-base transition-all duration-150 select-none
        border border-transparent
        ${
          disabled
            ? "text-gray-600 cursor-not-allowed opacity-50"
            : variant === "danger"
              ? "text-gray-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
              : "text-gray-400 hover:text-white hover:bg-gray-700/60"
        }
      `}
    >
      <span className="text-[15px] leading-none">{icon}</span>
    </button>
  );
}

// ==================== 分隔符 ====================

function Separator() {
  return <div className="w-px h-6 bg-gray-700 mx-1.5" />;
}

export default MainToolbar;
