// ==================== SelectionToolbar ====================
//
// 对标 VS Code 的 editor/context menu + 浮动工具条：
// - 当用户选中文字时，在选区附近弹出浮动工具条
// - 工具条按钮由插件通过 Manifest contributes.selectionToolbar 贡献
// - 按钮的可见性由 ContextKeyService 根据 when 条件动态过滤
// - 点击按钮时执行对应的命令（通过 NewPluginHost.executeCommand）
//
// 架构关系：
//   SelectionToolbar 组件
//     → 调用 host.getVisibleSelectionToolbarItems() 获取按钮列表
//       → ContributionManager.getVisibleSelectionToolbarItems()
//         → ContextKeyService.evaluate(when) 过滤
//     → 点击按钮 → host.executeCommand(commandId)
//       → ActivationManager 按需激活插件
//       → ContributionManager.executeCommand(commandId)
//
// 定位策略：
// - 根据 selection 的 bounding rect 计算工具条位置
// - 默认显示在选区上方（如果空间不足则显示在下方）
// - 水平居中对齐选区
//
// 使用方式：
// ```tsx
// <SelectionToolbar
//   items={host.getVisibleSelectionToolbarItems()}
//   selectionRect={selectionRect}
//   onExecuteCommand={(commandId) => host.executeCommand(commandId)}
//   visible={hasSelection}
// />
// ```

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SourcedSelectionToolbarContribution } from "./ContributionManager";

// ==================== Props ====================

export interface SelectionToolbarProps {
  /**
   * 当前可见的工具条按钮列表
   * 由 NewPluginHost.getVisibleSelectionToolbarItems() 提供
   * 已经过 ContextKeyService 的 when 条件过滤和 priority 排序
   */
  items: SourcedSelectionToolbarContribution[];

  /**
   * 选区的位置矩形（相对于视口）
   * 由宿主在 selection 变化时通过 EditorBridge.getSelectionInfo() 获取
   * null 表示无选区
   */
  selectionRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;

  /**
   * 是否可见
   * 通常由 editorHasSelection && items.length > 0 决定
   */
  visible: boolean;

  /**
   * 执行命令的回调
   * 点击工具条按钮时调用，传入 commandId
   */
  onExecuteCommand: (commandId: string) => void;

  /**
   * 工具条与选区的间距（像素，默认 8）
   */
  gap?: number;

  /**
   * 容器元素（用于边界检测，默认 document.body）
   * 工具条不会超出此元素的可视区域
   */
  containerRef?: React.RefObject<HTMLElement>;

  /**
   * 命令正在执行中的标记（用于显示 loading 状态）
   */
  executingCommandId?: string | null;

  /**
   * 自定义样式类名
   */
  className?: string;

  /**
   * 按钮被悬停时的回调（可选，用于显示 tooltip）
   */
  onButtonHover?: (commandId: string | null) => void;
}

// ==================== 组件实现 ====================

/**
 * SelectionToolbar — 选中文字浮动工具条
 *
 * 核心逻辑：
 * 1. 根据 selectionRect 计算工具条的绝对定位坐标
 * 2. 渲染每个 item 为一个按钮（icon + title）
 * 3. 点击按钮时调用 onExecuteCommand(commandId)
 * 4. 动画进出（fade + slide）
 *
 * 定位算法：
 * - 默认在选区正上方，水平居中
 * - 如果上方空间不足（< toolbarHeight + gap），则显示在选区下方
 * - 水平方向：如果超出视口右边界则左移，超出左边界则右移
 */
export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  items,
  selectionRect,
  visible,
  onExecuteCommand,
  gap = 8,
  containerRef,
  executingCommandId,
  className,
  onButtonHover,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    placement: "above" | "below";
  } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // ── 计算定位 ──────────────────────────────────────────────────

  useEffect(() => {
    if (!visible || !selectionRect || items.length === 0) {
      // 延迟隐藏（让退出动画播放完）
      if (position) {
        setIsAnimating(false);
        const timer = setTimeout(() => {
          setPosition(null);
        }, 150); // 与 CSS transition 时间一致
        return () => clearTimeout(timer);
      }
      return;
    }

    // 等待一帧让 DOM 渲染后再计算位置
    const raf = requestAnimationFrame(() => {
      const toolbar = toolbarRef.current;
      if (!toolbar) return;

      const toolbarRect = toolbar.getBoundingClientRect();
      const toolbarWidth = toolbarRect.width || 200; // fallback
      const toolbarHeight = toolbarRect.height || 40; // fallback

      // 容器边界（默认为视口）
      const container = containerRef?.current;
      const containerBounds: {
        top: number;
        left: number;
        width: number;
        height: number;
        right: number;
        bottom: number;
      } = container
        ? container.getBoundingClientRect()
        : {
            top: 0,
            left: 0,
            width: window.innerWidth,
            height: window.innerHeight,
            right: window.innerWidth,
            bottom: window.innerHeight,
          };

      // 计算水平位置（居中于选区）
      let left = selectionRect.left + selectionRect.width / 2 - toolbarWidth / 2;

      // 边界检测：不超出容器
      if (left < containerBounds.left + 4) {
        left = containerBounds.left + 4;
      }
      if (left + toolbarWidth > containerBounds.right - 4) {
        left = containerBounds.right - toolbarWidth - 4;
      }

      // 计算垂直位置
      let top: number;
      let placement: "above" | "below";

      // 上方空间是否足够
      const spaceAbove = selectionRect.top - containerBounds.top;
      if (spaceAbove >= toolbarHeight + gap) {
        // 显示在选区上方
        top = selectionRect.top - toolbarHeight - gap;
        placement = "above";
      } else {
        // 显示在选区下方
        top = selectionRect.top + selectionRect.height + gap;
        placement = "below";
      }

      setPosition({ top, left, placement });

      // 触发进入动画
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [visible, selectionRect, items.length, gap, containerRef, position]);

  // ── 点击处理 ──────────────────────────────────────────────────

  const handleButtonClick = useCallback(
    (commandId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // 防止点击按钮后 selection 被清除
      // （mousedown 会改变 selection，但 click 不会）
      onExecuteCommand(commandId);
    },
    [onExecuteCommand],
  );

  // ── 防止工具条上的鼠标操作影响 selection ──────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 阻止 mousedown 默认行为，防止点击工具条时清除 selection
    e.preventDefault();
  }, []);

  // ── 渲染 ──────────────────────────────────────────────────

  // 不渲染的条件
  if (!position || items.length === 0) {
    // 即使不可见也渲染一个隐藏的容器（用于测量尺寸）
    if (visible && selectionRect && items.length > 0) {
      return (
        <div
          ref={toolbarRef}
          style={{
            position: "fixed",
            visibility: "hidden",
            pointerEvents: "none",
            top: -9999,
            left: -9999,
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            {items.map((item) => (
              <button key={item.command} style={{ padding: "6px 12px" }}>
                {item.icon && <span>{item.icon}</span>}
                <span>{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }
    return null;
  }

  const showToolbar = visible && isAnimating;

  return (
    <div
      ref={toolbarRef}
      className={className}
      role="toolbar"
      aria-label="选中文字工具条"
      onMouseDown={handleMouseDown}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 10000,
        // 动画
        opacity: showToolbar ? 1 : 0,
        transform: showToolbar
          ? "translateY(0) scale(1)"
          : position.placement === "above"
            ? "translateY(4px) scale(0.95)"
            : "translateY(-4px) scale(0.95)",
        transition: "opacity 150ms ease, transform 150ms ease",
        pointerEvents: showToolbar ? "auto" : "none",
        // 基础样式
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "4px 6px",
        backgroundColor: "#1f1f1f",
        border: "1px solid #3c3c3c",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3), 0 1px 4px rgba(0, 0, 0, 0.2)",
        userSelect: "none",
        // 三角箭头由伪元素实现（此处省略，可通过 className 自定义）
      }}
    >
      {items.map((item) => {
        const isExecuting = executingCommandId === item.command;

        return (
          <ToolbarButton
            key={item.command}
            item={item}
            isExecuting={isExecuting}
            onClick={handleButtonClick}
            onHover={onButtonHover}
          />
        );
      })}
    </div>
  );
};

// ==================== ToolbarButton 子组件 ====================

interface ToolbarButtonProps {
  item: SourcedSelectionToolbarContribution;
  isExecuting: boolean;
  onClick: (commandId: string, e: React.MouseEvent) => void;
  onHover?: (commandId: string | null) => void;
}

/**
 * ToolbarButton — 工具条按钮
 *
 * 每个按钮对应一个插件贡献的 selectionToolbar 项。
 * 显示图标和标题，点击时执行对应命令。
 */
const ToolbarButton: React.FC<ToolbarButtonProps> = ({ item, isExecuting, onClick, onHover }) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    onHover?.(item.command);
  }, [item.command, onHover]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isExecuting) {
        onClick(item.command, e);
      }
    },
    [item.command, isExecuting, onClick],
  );

  return (
    <button
      type="button"
      title={item.title}
      aria-label={item.title}
      disabled={isExecuting}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "5px 10px",
        border: "none",
        borderRadius: 6,
        backgroundColor: isHovered ? "rgba(255, 255, 255, 0.12)" : "transparent",
        color: isExecuting ? "#666" : "#e0e0e0",
        cursor: isExecuting ? "wait" : "pointer",
        fontSize: 13,
        lineHeight: 1,
        whiteSpace: "nowrap",
        transition: "background-color 100ms ease, color 100ms ease",
        outline: "none",
        // focus-visible 样式
        ...(isHovered ? {} : {}),
      }}
    >
      {/* 图标 */}
      {item.icon && (
        <span
          style={{
            fontSize: 15,
            lineHeight: 1,
            opacity: isExecuting ? 0.5 : 1,
          }}
          aria-hidden="true"
        >
          {isExecuting ? "⏳" : item.icon}
        </span>
      )}

      {/* 标题 */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.02em",
        }}
      >
        {item.title}
      </span>
    </button>
  );
};

// ==================== Hook: useSelectionToolbar ====================

/**
 * useSelectionToolbar — 管理选中工具条状态的 Hook
 *
 * 封装了以下逻辑：
 * 1. 监听 selection 变化
 * 2. 获取选区位置
 * 3. 过滤可见按钮
 * 4. 执行命令
 *
 * 使用示例：
 * ```tsx
 * function EditorPage() {
 *   const host = useRef(new NewPluginHost({ editor: ... }));
 *   const toolbar = useSelectionToolbar(host.current, editorRef);
 *
 *   return (
 *     <>
 *       <div ref={editorRef} contentEditable ... />
 *       <SelectionToolbar {...toolbar} />
 *     </>
 *   );
 * }
 * ```
 */
export interface UseSelectionToolbarOptions {
  /**
   * 获取可见的工具条按钮
   * 通常为 () => host.getVisibleSelectionToolbarItems()
   */
  getItems: () => SourcedSelectionToolbarContribution[];

  /**
   * 执行命令
   * 通常为 (commandId) => host.executeCommand(commandId)
   */
  executeCommand: (commandId: string) => Promise<unknown>;

  /**
   * 获取选区信息
   * 通常为 () => editorBridge.getSelectionInfo()
   */
  getSelectionRect: () => {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;

  /**
   * 监听上下文变化的 dispose 函数工厂
   * 通常为 (listener) => host.onEvent(listener)
   */
  onContextChange?: (callback: () => void) => { dispose: () => void };

  /**
   * 是否启用（默认 true）
   */
  enabled?: boolean;
}

export interface UseSelectionToolbarReturn {
  items: SourcedSelectionToolbarContribution[];
  selectionRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;
  visible: boolean;
  onExecuteCommand: (commandId: string) => void;
  executingCommandId: string | null;
}

export function useSelectionToolbar(
  options: UseSelectionToolbarOptions,
): UseSelectionToolbarReturn {
  const { getItems, executeCommand, getSelectionRect, onContextChange, enabled = true } = options;

  const [items, setItems] = useState<SourcedSelectionToolbarContribution[]>([]);
  const [selectionRect, setSelectionRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [executingCommandId, setExecutingCommandId] = useState<string | null>(null);

  // ── 监听 selection 变化 ──────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    const handleSelectionChange = () => {
      const rect = getSelectionRect();
      setSelectionRect(rect);

      // 每次 selection 变化时重新获取可见按钮（when 条件可能变化）
      const visibleItems = getItems();
      setItems(visibleItems);
    };

    // 监听原生 selectionchange 事件
    document.addEventListener("selectionchange", handleSelectionChange);

    // 监听宿主上下文变化（如果提供了）
    let contextDisposable: { dispose: () => void } | undefined;
    if (onContextChange) {
      contextDisposable = onContextChange(() => {
        // 上下文变化时重新获取可见按钮
        const visibleItems = getItems();
        setItems(visibleItems);
      });
    }

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      contextDisposable?.dispose();
    };
  }, [enabled, getItems, getSelectionRect, onContextChange]);

  // ── 执行命令 ──────────────────────────────────────────────────

  const handleExecuteCommand = useCallback(
    (commandId: string) => {
      setExecutingCommandId(commandId);

      executeCommand(commandId)
        .catch((error) => {
          console.error(`[SelectionToolbar] Error executing command "${commandId}":`, error);
        })
        .finally(() => {
          setExecutingCommandId(null);
        });
    },
    [executeCommand],
  );

  // ── 计算可见性 ──────────────────────────────────────────────────

  const visible = enabled && selectionRect != null && items.length > 0;

  return {
    items,
    selectionRect,
    visible,
    onExecuteCommand: handleExecuteCommand,
    executingCommandId,
  };
}

// ==================== 导出 ====================

export default SelectionToolbar;
