import type { Action, CanvasElement, AppState } from "../types";

// ==================== changeColor ====================

/**
 * Action: 修改选中元素的线条颜色
 *
 * formData: { color: string }
 * - 如果有选中元素 → 修改选中元素的 strokeColor
 * - 如果没有选中元素 → 修改 appState.currentStrokeColor（影响后续绘制）
 */
export const changeStrokeColorAction: Action = {
  name: "changeStrokeColor",
  label: "修改线条颜色",
  icon: "🎨",

  perform(
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    formData: unknown,
  ) {
    const { color } = formData as { color: string };

    if (appState.selectedElementIds.size > 0) {
      // 修改选中元素的 strokeColor
      const newElements = elements.map((el) =>
        appState.selectedElementIds.has(el.id)
          ? { ...el, strokeColor: color }
          : el,
      );

      return {
        elements: newElements,
        appState: { currentStrokeColor: color },
        captureHistory: true,
      };
    }

    // 没有选中元素，仅修改当前绘制颜色
    return {
      appState: { currentStrokeColor: color },
      captureHistory: false,
    };
  },
};

// ==================== changeFillColor ====================

/**
 * Action: 修改选中元素的填充颜色
 *
 * formData: { color: string }
 */
export const changeFillColorAction: Action = {
  name: "changeFillColor",
  label: "修改填充颜色",
  icon: "🪣",

  perform(
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    formData: unknown,
  ) {
    const { color } = formData as { color: string };

    if (appState.selectedElementIds.size > 0) {
      const newElements = elements.map((el) =>
        appState.selectedElementIds.has(el.id)
          ? { ...el, fillColor: color }
          : el,
      );

      return {
        elements: newElements,
        appState: { currentFillColor: color },
        captureHistory: true,
      };
    }

    return {
      appState: { currentFillColor: color },
      captureHistory: false,
    };
  },
};

// ==================== changeStrokeWidth ====================

/**
 * Action: 修改选中元素的线宽
 *
 * formData: { width: number }
 */
export const changeStrokeWidthAction: Action = {
  name: "changeStrokeWidth",
  label: "修改线宽",
  icon: "━",

  perform(
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    formData: unknown,
  ) {
    const { width } = formData as { width: number };

    if (appState.selectedElementIds.size > 0) {
      const newElements = elements.map((el) =>
        appState.selectedElementIds.has(el.id)
          ? { ...el, strokeWidth: width }
          : el,
      );

      return {
        elements: newElements,
        appState: { currentStrokeWidth: width },
        captureHistory: true,
      };
    }

    return {
      appState: { currentStrokeWidth: width },
      captureHistory: false,
    };
  },
};

// ==================== changeFontSize ====================

/**
 * Action: 修改选中文字元素的字号
 *
 * formData: { fontSize: number }
 */
export const changeFontSizeAction: Action = {
  name: "changeFontSize",
  label: "修改字号",
  icon: "T",

  perform(
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    formData: unknown,
  ) {
    const { fontSize } = formData as { fontSize: number };

    if (appState.selectedElementIds.size > 0) {
      const newElements = elements.map((el) => {
        if (!appState.selectedElementIds.has(el.id)) return el;
        if (el.type !== "text") return el;
        return { ...el, fontSize };
      });

      return {
        elements: newElements,
        appState: { currentFontSize: fontSize },
        captureHistory: true,
      };
    }

    return {
      appState: { currentFontSize: fontSize },
      captureHistory: false,
    };
  },
};

// ==================== changeOpacity ====================

/**
 * Action: 修改选中元素的透明度
 *
 * formData: { opacity: number }
 */
export const changeOpacityAction: Action = {
  name: "changeOpacity",
  label: "修改透明度",
  icon: "◐",

  perform(
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    formData: unknown,
  ) {
    const { opacity } = formData as { opacity: number };

    if (appState.selectedElementIds.size > 0) {
      const newElements = elements.map((el) =>
        appState.selectedElementIds.has(el.id)
          ? { ...el, opacity }
          : el,
      );

      return {
        elements: newElements,
        appState: { currentOpacity: opacity },
        captureHistory: true,
      };
    }

    return {
      appState: { currentOpacity: opacity },
      captureHistory: false,
    };
  },
};

// ==================== deleteElements ====================

/**
 * Action: 删除选中的元素（标记 isDeleted = true，软删除）
 *
 * 快捷键：Delete / Backspace
 */
export const deleteElementsAction: Action = {
  name: "deleteElements",
  label: "删除",
  icon: "🗑",

  perform(
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    _formData: unknown,
  ) {
    if (appState.selectedElementIds.size === 0) {
      return { captureHistory: false };
    }

    const newElements = elements.map((el) =>
      appState.selectedElementIds.has(el.id)
        ? { ...el, isDeleted: true }
        : el,
    );

    return {
      elements: newElements,
      appState: {
        selectedElementIds: new Set<string>(),
      },
      captureHistory: true,
    };
  },

  keyTest(event: KeyboardEvent, appState: Readonly<AppState>) {
    return (
      (event.key === "Delete" || event.key === "Backspace") &&
      appState.selectedElementIds.size > 0 &&
      !event.ctrlKey &&
      !event.metaKey
    );
  },

  predicate(_elements, appState) {
    return appState.selectedElementIds.size > 0;
  },

  keyPriority: 0,
};

// ==================== clearCanvas ====================

/**
 * Action: 清空画布（标记所有元素为 isDeleted）
 */
export const clearCanvasAction: Action = {
  name: "clearCanvas",
  label: "清空画布",
  icon: "🧹",

  perform(
    elements: readonly CanvasElement[],
    _appState: Readonly<AppState>,
    _formData: unknown,
  ) {
    const hasVisibleElements = elements.some((el) => !el.isDeleted);

    if (!hasVisibleElements) {
      return { captureHistory: false };
    }

    const newElements = elements.map((el) =>
      el.isDeleted ? el : { ...el, isDeleted: true },
    );

    return {
      elements: newElements,
      appState: {
        selectedElementIds: new Set<string>(),
      },
      captureHistory: true,
    };
  },

  predicate(elements) {
    return elements.some((el) => !el.isDeleted);
  },
};

// ==================== selectAll ====================

/**
 * Action: 全选所有可见元素
 *
 * 快捷键：Ctrl+A / Cmd+A
 */
export const selectAllAction: Action = {
  name: "selectAll",
  label: "全选",
  icon: "⊞",

  perform(
    elements: readonly CanvasElement[],
    _appState: Readonly<AppState>,
    _formData: unknown,
  ) {
    const visibleIds = new Set(
      elements.filter((el) => !el.isDeleted).map((el) => el.id),
    );

    return {
      appState: {
        selectedElementIds: visibleIds,
        activeTool: "select" as const,
      },
      captureHistory: false,
    };
  },

  keyTest(event: KeyboardEvent) {
    return (event.ctrlKey || event.metaKey) && event.key === "a";
  },

  keyPriority: 10,
};

// ==================== undo ====================

/**
 * Action: 撤销
 *
 * 快捷键：Ctrl+Z / Cmd+Z
 *
 * 注意：这个 Action 的 perform 不直接操作 HistoryManager，
 * 而是返回一个特殊标记，由 App 层的 updater 识别并调用 HistoryManager.undo()。
 *
 * 这是因为 Action.perform 是纯函数，不应该持有对 HistoryManager 的引用。
 * 实际的 undo 逻辑在 Canvas 组件的 updater 中实现。
 */
export const undoAction: Action = {
  name: "undo",
  label: "撤销",
  icon: "↶",

  perform(
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    _formData: unknown,
  ) {
    // 返回一个特殊标记，由 updater 识别
    // 实际的 undo 逻辑在 Canvas 组件中处理
    return {
      appState: { _undoRequested: true } as unknown as Partial<AppState>,
      captureHistory: false, // undo 本身不记入历史
    };
  },

  keyTest(event: KeyboardEvent) {
    return (
      (event.ctrlKey || event.metaKey) &&
      event.key === "z" &&
      !event.shiftKey
    );
  },

  keyPriority: 100, // undo 的优先级最高
};

// ==================== redo ====================

/**
 * Action: 重做
 *
 * 快捷键：Ctrl+Shift+Z / Cmd+Shift+Z 或 Ctrl+Y / Cmd+Y
 *
 * 与 undo 同理，返回特殊标记由 updater 处理。
 */
export const redoAction: Action = {
  name: "redo",
  label: "重做",
  icon: "↷",

  perform(
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    _formData: unknown,
  ) {
    return {
      appState: { _redoRequested: true } as unknown as Partial<AppState>,
      captureHistory: false,
    };
  },

  keyTest(event: KeyboardEvent) {
    return (
      (event.ctrlKey || event.metaKey) &&
      (event.key === "y" || (event.key === "z" && event.shiftKey))
    );
  },

  keyPriority: 100,
};

// ==================== 导出所有 Actions ====================

/**
 * 所有内置 Actions 的集合
 * 由 ActionManager.registerAll() 一次性注册
 */
export const ALL_ACTIONS: readonly Action[] = [
  changeStrokeColorAction,
  changeFillColorAction,
  changeStrokeWidthAction,
  changeFontSizeAction,
  changeOpacityAction,
  deleteElementsAction,
  clearCanvasAction,
  selectAllAction,
  undoAction,
  redoAction,
];
