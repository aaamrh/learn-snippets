"use client";

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { AppState, CanvasElement, ToolType, Point } from "../types";
import { renderScene } from "../elements/renderer";
import { screenToScene } from "../elements/hitTest";
import type { ToolRegistry } from "../tools/ToolRegistry";
import type { TextTool } from "../tools/TextTool";

// ==================== Props ====================

interface AnnotatorCanvasProps {
  /** 所有画布元素 */
  elements: readonly CanvasElement[];
  /** 应用状态 */
  appState: Readonly<AppState>;
  /** 工具注册表实例 */
  toolRegistry: ToolRegistry;
  /** 状态更新回调：接收新的 elements 和/或 appState 变更 */
  onUpdate: (update: {
    elements?: readonly CanvasElement[];
    appState?: Partial<AppState>;
    captureHistory?: boolean;
  }) => void;
  /** 画布宽度（默认 100%） */
  width?: number;
  /** 画布高度（默认 100%） */
  height?: number;
}

// ==================== 文字输入框状态 ====================

interface TextInputState {
  visible: boolean;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  value: string;
}

const INITIAL_TEXT_INPUT: TextInputState = {
  visible: false,
  x: 0,
  y: 0,
  fontSize: 16,
  color: "#000000",
  value: "",
};

// ==================== Canvas 组件 ====================

/**
 * AnnotatorCanvas —— 画布组件
 *
 * 职责：
 * 1. 管理 <canvas> DOM 元素和 2D context
 * 2. 绑定 pointer 事件（down/move/up）并转发给 activeTool
 * 3. 处理键盘事件（Shift 键状态传播）
 * 4. 调用 renderScene() 执行渲染
 * 5. 管理文字输入框（TextTool 的 overlay input）
 * 6. 处理高 DPI（devicePixelRatio）适配
 *
 * 设计要点（对标 Excalidraw）：
 * - Canvas 组件不持有 elements/appState，完全由父组件控制（受控组件模式）
 * - 指针事件被转换为场景坐标后转发给 activeTool
 * - activeTool 返回 ToolResult，Canvas 组件通过 onUpdate 回调通知父组件
 * - 渲染由 useEffect 驱动，每当 elements/appState 变化时重绘
 */
export function AnnotatorCanvas({
  elements,
  appState,
  toolRegistry,
  onUpdate,
  width,
  height,
}: AnnotatorCanvasProps) {
  // ==================== Refs ====================

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [textInput, setTextInput] = useState<TextInputState>(INITIAL_TEXT_INPUT);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // 用 ref 保存最新的 elements 和 appState，避免闭包陷阱
  const elementsRef = useRef(elements);
  const appStateRef = useRef(appState);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  // ==================== Canvas 尺寸管理 ====================

  useEffect(() => {
    if (width && height) {
      setCanvasSize({ width, height });
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width: cw, height: ch } = entry.contentRect;
        setCanvasSize({
          width: Math.floor(cw),
          height: Math.floor(ch),
        });
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [width, height]);

  // ==================== 高 DPI 适配 ====================

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, [canvasSize]);

  // ==================== 渲染 ====================

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 保存当前变换，因为高 DPI 缩放已经应用
    ctx.save();

    // 获取当前工具的 wip 元素用于实时预览
    const wipElement = toolRegistry.getActiveWipElement(appState);

    renderScene(ctx, elements, appState, wipElement);

    ctx.restore();
  }, [elements, appState, toolRegistry]);

  // ==================== 坐标转换 ====================

  /**
   * 将 pointer event 的屏幕坐标转换为场景坐标
   */
  const getScenePoint = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const sceneCoord = screenToScene(screenX, screenY, appStateRef.current);

      return {
        x: sceneCoord.x,
        y: sceneCoord.y,
        pressure: e.pressure,
      };
    },
    [],
  );

  // ==================== 文字输入框管理 ====================

  /**
   * 注册 TextTool 的文字输入请求处理器
   * 当 TextTool 需要弹出输入框时，通过此回调通知 Canvas 组件
   */
  useEffect(() => {
    const textTool = toolRegistry.getTextTool();
    if (!textTool) return;

    textTool.setTextInputHandler(
      (x: number, y: number, fontSize: number, color: string) => {
        // 将场景坐标转换回屏幕坐标用于定位输入框
        const state = appStateRef.current;
        const screenX = x * state.zoom + state.scrollX;
        const screenY = y * state.zoom + state.scrollY;

        setTextInput({
          visible: true,
          x: screenX,
          y: screenY,
          fontSize: fontSize * state.zoom,
          color,
          value: "",
        });

        // 聚焦输入框
        requestAnimationFrame(() => {
          textInputRef.current?.focus();
        });
      },
    );
  }, [toolRegistry]);

  /**
   * 提交文字输入
   */
  const commitTextInput = useCallback(() => {
    const text = textInput.value.trim();
    if (!text) {
      setTextInput(INITIAL_TEXT_INPUT);
      return;
    }

    const textTool = toolRegistry.getTextTool();
    if (!textTool) {
      setTextInput(INITIAL_TEXT_INPUT);
      return;
    }

    const result = textTool.commitText(
      text,
      appStateRef.current,
      elementsRef.current,
    );

    if (result.elements || result.appState) {
      onUpdate({
        elements: result.elements,
        appState: result.appState,
        captureHistory: result.captureHistory,
      });
    }

    setTextInput(INITIAL_TEXT_INPUT);
  }, [textInput.value, toolRegistry, onUpdate]);

  /**
   * 取消文字输入
   */
  const cancelTextInput = useCallback(() => {
    const textTool = toolRegistry.getTextTool();
    if (textTool) {
      textTool.clearPendingPosition();
    }
    setTextInput(INITIAL_TEXT_INPUT);
  }, [toolRegistry]);

  // ==================== Pointer 事件处理 ====================

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      // 如果文字输入框可见，先提交文字
      if (textInput.visible) {
        commitTextInput();
        return;
      }

      const point = getScenePoint(e);
      const tool = toolRegistry.getActiveTool(appStateRef.current);
      if (!tool) return;

      // 捕获指针（确保拖拽时不会丢失 move/up 事件）
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.setPointerCapture(e.pointerId);
      }

      const result = tool.onPointerDown(
        point,
        appStateRef.current,
        elementsRef.current,
      );

      if (result.elements || result.appState) {
        onUpdate({
          elements: result.elements,
          appState: result.appState,
          captureHistory: result.captureHistory,
        });
      }
    },
    [getScenePoint, toolRegistry, onUpdate, textInput.visible, commitTextInput],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = getScenePoint(e);
      const tool = toolRegistry.getActiveTool(appStateRef.current);
      if (!tool) return;

      const result = tool.onPointerMove(
        point,
        appStateRef.current,
        elementsRef.current,
      );

      if (result.elements || result.appState) {
        onUpdate({
          elements: result.elements,
          appState: result.appState,
          captureHistory: result.captureHistory,
        });
      }
    },
    [getScenePoint, toolRegistry, onUpdate],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = getScenePoint(e);
      const tool = toolRegistry.getActiveTool(appStateRef.current);
      if (!tool) return;

      // 释放指针捕获
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          // ignore - pointer may not be captured
        }
      }

      const result = tool.onPointerUp(
        point,
        appStateRef.current,
        elementsRef.current,
      );

      if (result.elements || result.appState) {
        onUpdate({
          elements: result.elements,
          appState: result.appState,
          captureHistory: result.captureHistory,
        });
      }

      // TextTool 特殊处理：pointerUp 后检查是否需要弹出输入框
      if (appStateRef.current.activeTool === "text") {
        const textTool = toolRegistry.getTextTool();
        const pendingPos = textTool?.getPendingPosition();
        if (pendingPos && textTool) {
          const state = appStateRef.current;
          const screenX = pendingPos.x * state.zoom + state.scrollX;
          const screenY = pendingPos.y * state.zoom + state.scrollY;

          setTextInput({
            visible: true,
            x: screenX,
            y: screenY,
            fontSize: state.currentFontSize * state.zoom,
            color: state.currentStrokeColor,
            value: "",
          });

          requestAnimationFrame(() => {
            textInputRef.current?.focus();
          });
        }
      }
    },
    [getScenePoint, toolRegistry, onUpdate],
  );

  // ==================== 键盘事件处理 ====================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果文字输入框可见，只处理 Enter 和 Escape
      if (textInput.visible) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelTextInput();
        }
        // Enter 不阻止（允许换行），Shift+Enter 或单独 Enter 在 textarea 的 onKeyDown 中处理
        return;
      }

      // Shift 键状态传播
      if (e.key === "Shift") {
        toolRegistry.setShiftPressed(true);
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        toolRegistry.setShiftPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [toolRegistry, textInput.visible, cancelTextInput]);

  // ==================== 防止右键菜单 ====================

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ==================== 渲染 ====================

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-gray-900"
      style={
        width && height
          ? { width: `${width}px`, height: `${height}px` }
          : undefined
      }
    >
      {/* 画布 */}
      <canvas
        ref={canvasRef}
        className="block touch-none"
        style={{
          cursor: appState.cursorType || "crosshair",
          width: `${canvasSize.width}px`,
          height: `${canvasSize.height}px`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
      />

      {/* 文字输入框（TextTool 的 overlay） */}
      {textInput.visible && (
        <div
          className="absolute z-10"
          style={{
            left: `${textInput.x}px`,
            top: `${textInput.y}px`,
          }}
        >
          <textarea
            ref={textInputRef}
            value={textInput.value}
            onChange={(e) =>
              setTextInput((prev) => ({ ...prev, value: e.target.value }))
            }
            onKeyDown={(e) => {
              // Enter (without Shift) → 提交
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitTextInput();
              }
              // Escape → 取消
              if (e.key === "Escape") {
                e.preventDefault();
                cancelTextInput();
              }
            }}
            onBlur={() => {
              // 失焦时自动提交（如果有内容）
              if (textInput.value.trim()) {
                commitTextInput();
              } else {
                cancelTextInput();
              }
            }}
            className="bg-transparent border-none outline-none resize-none
              text-left leading-[1.3] p-0 m-0 min-w-[40px] min-h-[1.3em]
              caret-current"
            style={{
              fontSize: `${textInput.fontSize}px`,
              color: textInput.color,
              fontFamily: "sans-serif",
              // 自动增长
              width: `${Math.max(40, textInput.value.length * textInput.fontSize * 0.6 + 20)}px`,
            }}
            placeholder="输入文字..."
            autoFocus
          />
          <div className="mt-1 text-[10px] text-gray-500 select-none whitespace-nowrap">
            Enter 确认 · Shift+Enter 换行 · Esc 取消
          </div>
        </div>
      )}

      {/* 画布信息指示器（缩放等） */}
      {appState.zoom !== 1 && (
        <div className="absolute bottom-2 right-2 text-[10px] text-gray-500 bg-gray-800/80 px-1.5 py-0.5 rounded select-none">
          {Math.round(appState.zoom * 100)}%
        </div>
      )}
    </div>
  );
}

export default AnnotatorCanvas;
