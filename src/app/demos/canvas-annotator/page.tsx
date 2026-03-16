"use client";

import React, { useState, useCallback, useRef, useMemo, useEffect, type RefObject } from "react";
import type { AppState, CanvasElement, ToolType, ActionResult } from "@/canvas-annotator/types";
import { createDefaultAppState } from "@/canvas-annotator/types";
import { HistoryManager } from "@/canvas-annotator/actions/HistoryManager";
import { ActionManager } from "@/canvas-annotator/actions/ActionManager";
import { ALL_ACTIONS, pasteElementsAction } from "@/canvas-annotator/actions/actions";
import { ToolRegistry } from "@/canvas-annotator/tools/ToolRegistry";
import { MainToolbar } from "@/canvas-annotator/components/MainToolbar";
import { SecondaryToolbar } from "@/canvas-annotator/components/SecondaryToolbar";
import { AnnotatorCanvas } from "@/canvas-annotator/components/AnnotatorCanvas";
import { TranslatePopover } from "@/canvas-annotator/components/TranslateModal";

// ==================== 页面组件 ====================

/**
 * Canvas Annotator Demo 页面
 *
 * 职责：
 * 1. 管理全局 state（elements + appState）
 * 2. 协调 ToolRegistry、ActionManager、HistoryManager
 * 3. 组装 MainToolbar、SecondaryToolbar、AnnotatorCanvas
 * 4. 处理键盘快捷键（通过 ActionManager.handleKeyDown）
 *
 * 架构对标 Excalidraw：
 * - App Component 是唯一的状态持有者
 * - 所有子组件都是受控组件
 * - 所有状态变更通过 updater 管道统一处理
 */
export default function CanvasAnnotatorPage() {
  // ==================== 核心状态 ====================

  const [elements, setElements] = useState<readonly CanvasElement[]>([]);
  const [appState, setAppState] = useState<AppState>(createDefaultAppState);

  // 翻译 Popover 锚点：挂在工具栏容器上，TranslatePopover 据此定位
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 用 ref 保存最新状态，避免闭包陷阱
  const elementsRef = useRef(elements);
  const appStateRef = useRef(appState);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  // ==================== 核心管理器（单例） ====================

  const historyManager = useMemo(() => new HistoryManager(), []);
  const toolRegistry = useMemo(() => new ToolRegistry(), []);

  // ==================== 统一状态更新管道 ====================

  /**
   * updater —— 所有状态变更的统一入口
   *
   * 对标 Excalidraw 的 ActionManager.updater：
   * - 接收 ActionResult（elements + appState + captureHistory）
   * - 如果 captureHistory 为 true，先将当前状态压入 undo 栈
   * - 然后应用新的 elements 和 appState
   * - 特殊处理 undo/redo 请求标记
   */
  const updater = useCallback(
    (result: ActionResult) => {
      const currentElements = elementsRef.current;
      const currentAppState = appStateRef.current;

      // 特殊处理：undo 请求
      if (result.appState && "_undoRequested" in result.appState) {
        const snapshot = historyManager.undo({
          elements: currentElements,
          appState: {
            activeTool: currentAppState.activeTool,
            currentStrokeColor: currentAppState.currentStrokeColor,
            currentFillColor: currentAppState.currentFillColor,
            currentStrokeWidth: currentAppState.currentStrokeWidth,
            currentFontSize: currentAppState.currentFontSize,
            currentOpacity: currentAppState.currentOpacity,
          },
        });

        if (snapshot) {
          setElements(snapshot.elements);
          setAppState((prev) => ({ ...prev, ...snapshot.appState }));
        }
        return;
      }

      // 特殊处理：redo 请求
      if (result.appState && "_redoRequested" in result.appState) {
        const snapshot = historyManager.redo({
          elements: currentElements,
          appState: {
            activeTool: currentAppState.activeTool,
            currentStrokeColor: currentAppState.currentStrokeColor,
            currentFillColor: currentAppState.currentFillColor,
            currentStrokeWidth: currentAppState.currentStrokeWidth,
            currentFontSize: currentAppState.currentFontSize,
            currentOpacity: currentAppState.currentOpacity,
          },
        });

        if (snapshot) {
          setElements(snapshot.elements);
          setAppState((prev) => ({ ...prev, ...snapshot.appState }));
        }
        return;
      }

      // 特殊处理：剪贴板写入请求（复制/剪切）
      if (result.appState && "_clipboardWrite" in result.appState) {
        const clipboardText = (result.appState as Record<string, unknown>)._clipboardWrite as string;

        // 异步写入剪贴板（不阻塞 UI）
        navigator.clipboard.writeText(clipboardText).catch((err) => {
          console.warn("Failed to write to clipboard:", err);
        });

        // 如果是剪切操作（有 elements 变更），需要继续处理
        // 清理 _clipboardWrite 标记后继续走正常流程
        const cleanResult = {
          ...result,
          appState: { ...result.appState },
        };
        delete (cleanResult.appState as Record<string, unknown>)["_clipboardWrite"];

        // 如果只是复制（没有 elements 变更），直接返回
        if (!result.elements) {
          return;
        }

        // 剪切操作：继续处理元素删除
        result = cleanResult;
      }

      // 特殊处理：剪贴板读取请求（粘贴）
      if (result.appState && "_clipboardReadRequested" in result.appState) {
        // 异步读取剪贴板并应用粘贴
        navigator.clipboard
          .readText()
          .then((text) => {
            const pasteResult = pasteElementsAction.applyPaste(
              elementsRef.current,
              appStateRef.current,
              text,
            );

            if (pasteResult) {
              // 粘贴操作需要记入历史
              historyManager.push({
                elements: elementsRef.current,
                appState: {
                  activeTool: appStateRef.current.activeTool,
                  currentStrokeColor: appStateRef.current.currentStrokeColor,
                  currentFillColor: appStateRef.current.currentFillColor,
                  currentStrokeWidth: appStateRef.current.currentStrokeWidth,
                  currentFontSize: appStateRef.current.currentFontSize,
                  currentOpacity: appStateRef.current.currentOpacity,
                },
              });

              setElements(pasteResult.elements);
              setAppState((prev) => ({ ...prev, ...pasteResult.appState }));
            }
          })
          .catch((err) => {
            console.warn("Failed to read from clipboard:", err);
          });

        return;
      }

      // 如果需要记入历史，先保存当前快照
      if (result.captureHistory) {
        historyManager.push({
          elements: currentElements,
          appState: {
            activeTool: currentAppState.activeTool,
            currentStrokeColor: currentAppState.currentStrokeColor,
            currentFillColor: currentAppState.currentFillColor,
            currentStrokeWidth: currentAppState.currentStrokeWidth,
            currentFontSize: currentAppState.currentFontSize,
            currentOpacity: currentAppState.currentOpacity,
          },
        });
      }

      // 应用新状态
      if (result.elements !== undefined) {
        setElements(result.elements ?? []);
      }

      if (result.appState) {
        // 过滤掉内部标记字段
        const cleanState = { ...result.appState };
        delete (cleanState as Record<string, unknown>)["_undoRequested"];
        delete (cleanState as Record<string, unknown>)["_redoRequested"];
        delete (cleanState as Record<string, unknown>)["_clipboardWrite"];
        delete (cleanState as Record<string, unknown>)["_clipboardReadRequested"];

        setAppState((prev) => ({ ...prev, ...cleanState }));
      }
    },
    [historyManager],
  );

  // ==================== ActionManager ====================

  const actionManager = useMemo(() => {
    const mgr = new ActionManager(
      updater,
      () => appStateRef.current,
      () => elementsRef.current,
    );
    mgr.registerAll(ALL_ACTIONS);
    return mgr;
  }, [updater]);

  // 保持 ActionManager 的 updater 和 getter 引用最新
  useEffect(() => {
    actionManager.setUpdater(updater);
    actionManager.setGetters(
      () => appStateRef.current,
      () => elementsRef.current,
    );
  }, [actionManager, updater]);

  // 注入历史状态 getter：让 isActionEnabled("undo"/"redo") 能返回真实状态
  // ActionManager 不直接依赖 HistoryManager，通过 getter 解耦
  useEffect(() => {
    actionManager.setHistoryStateGetter(() => ({
      canUndo: historyManager.canUndo(),
      canRedo: historyManager.canRedo(),
    }));
  }, [actionManager, historyManager]);

  // ==================== 键盘快捷键处理 ====================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略来自输入元素的键盘事件
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // 交给 ActionManager 处理（undo/redo/delete/selectAll/toggleTranslate 等）
      actionManager.handleKeyDown(e);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionManager]);

  // ==================== 工具切换 ====================

  const handleToolChange = useCallback(
    (toolType: ToolType) => {
      const stateUpdates = toolRegistry.switchTool(toolType, appStateRef.current);
      setAppState((prev) => ({ ...prev, ...stateUpdates }));
    },
    [toolRegistry],
  );

  // ==================== 属性面板变更 ====================

  const handlePropertyChange = useCallback(
    (stateKey: keyof AppState, value: unknown) => {
      // 查找是否有对应的 Action 可以处理
      const actionMap: Record<string, { action: string; dataKey: string }> = {
        currentStrokeColor: { action: "changeStrokeColor", dataKey: "color" },
        currentFillColor: { action: "changeFillColor", dataKey: "color" },
        currentStrokeWidth: { action: "changeStrokeWidth", dataKey: "width" },
        currentFontSize: { action: "changeFontSize", dataKey: "fontSize" },
        currentOpacity: { action: "changeOpacity", dataKey: "opacity" },
      };

      const mapping = actionMap[stateKey];
      if (mapping) {
        actionManager.executeAction(mapping.action, {
          [mapping.dataKey]: value,
        });
      } else {
        // 没有对应 Action，直接更新 appState
        setAppState((prev) => ({ ...prev, [stateKey]: value }));
      }
    },
    [actionManager],
  );

  // ==================== Canvas 更新回调 ====================

  const handleCanvasUpdate = useCallback(
    (update: {
      elements?: readonly CanvasElement[];
      appState?: Partial<AppState>;
      captureHistory?: boolean;
    }) => {
      updater({
        elements: update.elements,
        appState: update.appState,
        captureHistory: update.captureHistory ?? false,
      });
    },
    [updater],
  );

  // ==================== 翻译弹窗关闭 ====================

  /**
   * 关闭翻译 Popover：通过 ActionManager 将 openDialog 置为 null
   * 这样关闭行为也走 Action 管道，保持数据流一致
   */
  const handleTranslateClose = useCallback(() => {
    updater({
      appState: { openDialog: null },
      captureHistory: false,
    });
  }, [updater]);

  // ==================== 属性面板配置 ====================

  const activeTool = toolRegistry.getActiveTool(appState);
  const panelConfig = activeTool?.getPropertyPanel?.() ?? null;

  // ==================== 统计信息 ====================

  const visibleElementCount = elements.filter((el) => !el.isDeleted).length;

  // ==================== 渲染 ====================

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-gray-900 overflow-hidden select-none">
      {/* ==================== 顶部工具区 ==================== */}
      <div className="flex flex-col items-center gap-2 pt-3 pb-2 px-4 z-10">
        {/* 主工具栏 */}
        {/*
         * 对标 Excalidraw LayerUI：Toolbar 只接收 actionManager
         * 所有按钮（撤销/重做/清空/翻译）都通过 actionManager.renderAction() 渲染
         * Toolbar 本身不感知任何业务逻辑
         */}
        <div ref={toolbarRef}>
          <MainToolbar
            appState={appState}
            actionManager={actionManager}
            onToolChange={handleToolChange}
          />
        </div>

        {/* 二级工具条 */}
        <SecondaryToolbar
          appState={appState}
          panelConfig={panelConfig}
          onPropertyChange={handlePropertyChange}
        />
      </div>

      {/* ==================== 画布区域 ==================== */}
      <div className="flex-1 relative overflow-hidden mx-4 mb-4 rounded-xl border border-gray-700/50">
        <AnnotatorCanvas
          elements={elements}
          appState={appState}
          toolRegistry={toolRegistry}
          onUpdate={handleCanvasUpdate}
        />
      </div>

      {/* ==================== 底部状态栏 ==================== */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-800 bg-gray-900/95 text-[11px] text-gray-500">
        <div className="flex items-center gap-4">
          <span>
            元素: <span className="text-gray-300 font-mono">{visibleElementCount}</span>
          </span>
          <span>
            工具: <span className="text-gray-300">{getToolLabel(appState.activeTool)}</span>
          </span>
          {appState.selectedElementIds.size > 0 && (
            <span>
              选中:{" "}
              <span className="text-blue-400 font-mono">{appState.selectedElementIds.size}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>
            撤销栈: <span className="text-gray-300 font-mono">{historyManager.undoSize()}</span>
          </span>
          <span>
            重做栈: <span className="text-gray-300 font-mono">{historyManager.redoSize()}</span>
          </span>
          <span className="text-gray-600">缩放: {Math.round(appState.zoom * 100)}%</span>
        </div>
      </div>
      {/* ==================== 翻译 Popover ==================== */}
      {/*
       * openDialog 由 toggleTranslateAction.perform 控制（appState 的一部分）
       * TranslatePopover 锚定在工具栏容器上，不再需要单独的 ref 穿透
       */}
      <TranslatePopover
        anchorRef={toolbarRef}
        isOpen={appState.openDialog === "translate"}
        onClose={handleTranslateClose}
        targetLangProp={appState.translateTargetLang}
      />
    </div>
  );
}

// ==================== 辅助函数 ====================

function getToolLabel(toolType: ToolType): string {
  const labels: Record<ToolType, string> = {
    pen: "画笔",
    rect: "矩形",
    circle: "圆形",
    arrow: "箭头",
    text: "文字",
    eraser: "橡皮擦",
    select: "选择",
  };
  return labels[toolType] ?? toolType;
}
