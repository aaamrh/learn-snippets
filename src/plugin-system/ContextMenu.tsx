// ==================== ContextMenu 组件 ====================
//
// 对标 VS Code 的编辑器右键上下文菜单：
// - 按 group 分组，组间显示分隔线
// - 每个菜单项显示图标、标题、快捷键提示
// - 点击执行对应命令
// - 点击空白处或按 Escape 关闭
// - 菜单位置跟随鼠标右键位置
// - 自动边界检测（防止菜单溢出屏幕）
//
// 设计原则：
// - ContextMenu 是纯展示组件，不直接依赖 NewPluginHost
// - 通过 props 接收数据和回调，保持组件的可测试性
// - 菜单项数据来自 ContributionManager.getVisibleMenusByGroup()

"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { SourcedMenuContribution } from "./ContributionManager";

// ==================== 类型定义 ====================

/**
 * ContextMenu 组件的 Props
 */
export interface ContextMenuProps {
  /** 分组后的菜单项（key = group 名称，value = 该组的菜单项列表） */
  groups: Map<string, SourcedMenuContribution[]>;
  /** 菜单显示位置（鼠标右键位置） */
  position: { x: number; y: number };
  /** 关闭回调 */
  onClose: () => void;
  /** 执行命令回调 */
  onExecute: (commandId: string) => void;
  /** 快捷键查询（用于显示快捷键提示，返回格式化后的快捷键字符串） */
  getKeybinding?: (commandId: string) => string | null;
  /** 获取命令标题（用于显示菜单项文字） */
  getCommandTitle?: (commandId: string) => string | null;
  /** 获取命令图标 */
  getCommandIcon?: (commandId: string) => string | null;
}

// ==================== ContextMenu 组件 ====================

/**
 * ContextMenu — 右键上下文菜单
 *
 * 用法（在 page.tsx 中）：
 * ```tsx
 * {contextMenu && (
 *   <ContextMenu
 *     groups={contextMenu.groups}
 *     position={contextMenu.position}
 *     onClose={() => setContextMenu(null)}
 *     onExecute={(commandId) => {
 *       host.executeCommand(commandId);
 *       setContextMenu(null);
 *     }}
 *     getKeybinding={(cmdId) => host.keybindings.getKeybindingForCommand(cmdId)}
 *     getCommandTitle={(cmdId) => host.contributions.getCommand(cmdId)?.contribution.title ?? null}
 *     getCommandIcon={(cmdId) => host.contributions.getCommand(cmdId)?.contribution.icon ?? null}
 *   />
 * )}
 * ```
 */
export function ContextMenu({
  groups,
  position,
  onClose,
  onExecute,
  getKeybinding,
  getCommandTitle,
  getCommandIcon,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [isVisible, setIsVisible] = useState(false);

  // ── 边界检测：调整菜单位置防止溢出屏幕 ──
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    // 等待一帧让菜单渲染出来获取尺寸
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      // 右边溢出
      if (x + rect.width > viewportWidth - 8) {
        x = viewportWidth - rect.width - 8;
      }

      // 下方溢出
      if (y + rect.height > viewportHeight - 8) {
        y = viewportHeight - rect.height - 8;
      }

      // 确保不超出左边/上边
      x = Math.max(8, x);
      y = Math.max(8, y);

      setAdjustedPosition({ x, y });
      setIsVisible(true);
    });
  }, [position]);

  // ── 点击外部关闭 ──
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // 延迟添加，避免立即触发（右键事件本身）
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // ── Escape 关闭 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  // ── 点击菜单项 ──
  const handleItemClick = useCallback(
    (commandId: string) => {
      onExecute(commandId);
      onClose();
    },
    [onExecute, onClose],
  );

  // ── 将 groups Map 转换为有序数组 ──
  const groupEntries = Array.from(groups.entries());

  // 按 group 名排序（editor/context 优先，然后其他）
  groupEntries.sort((a, b) => {
    const order: Record<string, number> = {
      "editor/context": 0,
      "editor/title": 1,
      navigation: 2,
    };
    const orderA = order[a[0]] ?? 99;
    const orderB = order[b[0]] ?? 99;
    return orderA - orderB;
  });

  // 过滤空组
  const nonEmptyGroups = groupEntries.filter(([, items]) => items.length > 0);

  if (nonEmptyGroups.length === 0) {
    return null;
  }

  return (
    <>
      {/* 透明遮罩层（捕获右键防止递归触发） */}
      <div
        className="fixed inset-0 z-[10000]"
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* 菜单面板 */}
      <div
        ref={menuRef}
        className={`
          fixed z-[10001]
          min-w-[180px] max-w-[280px]
          bg-gray-800 border border-gray-600/50
          rounded-lg shadow-2xl shadow-black/50
          py-1
          transition-opacity duration-100
          ${isVisible ? "opacity-100" : "opacity-0"}
        `}
        style={{
          left: adjustedPosition.x,
          top: adjustedPosition.y,
        }}
        role="menu"
        aria-label="上下文菜单"
      >
        {nonEmptyGroups.map(([groupName, items], groupIndex) => (
          <div key={groupName}>
            {/* 组间分隔线（非第一组才显示） */}
            {groupIndex > 0 && (
              <div className="mx-2 my-1 border-t border-gray-700/60" />
            )}

            {/* 组内菜单项 */}
            {sortMenuItems(items).map((item) => (
              <ContextMenuItem
                key={`${item.pluginId}:${item.command}`}
                item={item}
                onClick={() => handleItemClick(item.command)}
                keybinding={getKeybinding?.(item.command) ?? null}
                title={getCommandTitle?.(item.command) ?? null}
                icon={getCommandIcon?.(item.command) ?? null}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ==================== ContextMenuItem 组件 ====================

/**
 * 单个菜单项
 */
function ContextMenuItem({
  item,
  onClick,
  keybinding,
  title,
  icon,
}: {
  item: SourcedMenuContribution;
  onClick: () => void;
  keybinding: string | null;
  title: string | null;
  icon: string | null;
}) {
  const [isHovered, setIsHovered] = useState(false);

  // 显示文本：优先使用 getCommandTitle 的结果，否则用 command ID
  const displayTitle = title ?? formatCommandId(item.command);

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px]
        transition-colors duration-75
        ${isHovered ? "bg-blue-600/80 text-white" : "text-gray-300"}
      `}
    >
      {/* 图标 */}
      <span className="w-5 text-center text-[13px] shrink-0">
        {icon ?? ""}
      </span>

      {/* 标题 */}
      <span className="flex-1 truncate">{displayTitle}</span>

      {/* 快捷键提示 */}
      {keybinding && (
        <span
          className={`
            text-[10px] font-mono shrink-0 ml-4
            ${isHovered ? "text-blue-200" : "text-gray-600"}
          `}
        >
          {formatKeybindingDisplay(keybinding)}
        </span>
      )}
    </button>
  );
}

// ==================== 工具函数 ====================

/**
 * 将 command ID 格式化为可读标题
 *
 * "translate.translateSelection" → "Translate Selection"
 * "copy-as-markdown.copy" → "Copy"
 */
function formatCommandId(commandId: string): string {
  // 取最后一段（. 分隔的最后部分）
  const parts = commandId.split(".");
  const lastPart = parts[parts.length - 1];

  // camelCase / kebab-case → 空格分隔 + 首字母大写
  return lastPart
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * 格式化快捷键用于显示
 *
 * 将标准化的快捷键字符串转换为平台友好的显示格式：
 * - "ctrl+shift+t" → "Ctrl+Shift+T"
 * - "meta+k" → "⌘K"（macOS）或 "Ctrl+K"（其他）
 */
function formatKeybindingDisplay(keybinding: string): string {
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

  const parts = keybinding.split("+");

  return parts
    .map((part) => {
      const lower = part.toLowerCase();
      switch (lower) {
        case "ctrl":
          return isMac ? "⌃" : "Ctrl";
        case "shift":
          return isMac ? "⇧" : "Shift";
        case "alt":
        case "option":
          return isMac ? "⌥" : "Alt";
        case "meta":
        case "cmd":
          return isMac ? "⌘" : "Ctrl";
        default:
          return part.toUpperCase();
      }
    })
    .join(isMac ? "" : "+");
}

/**
 * 按 order 字段排序菜单项
 */
function sortMenuItems(items: SourcedMenuContribution[]): SourcedMenuContribution[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ==================== 导出 ====================

export default ContextMenu;
