import React from "react";
import { CaptureUpdateAction, SHAPES } from "../types";
import type { Action, ActionPanelProps, CanvasElement, AppState, ToolType } from "../types";

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

  perform(elements: readonly CanvasElement[], appState: Readonly<AppState>, formData: unknown) {
    const { color } = formData as { color: string };

    if (appState.selectedElementIds.size > 0) {
      // 修改选中元素的 strokeColor
      const newElements = elements.map((el) =>
        appState.selectedElementIds.has(el.id) ? { ...el, strokeColor: color } : el,
      );

      return {
        elements: newElements,
        appState: { currentStrokeColor: color },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    }

    // 没有选中元素，仅修改当前绘制颜色
    return {
      appState: { currentStrokeColor: color },
      captureUpdate: CaptureUpdateAction.NEVER,
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

  perform(elements: readonly CanvasElement[], appState: Readonly<AppState>, formData: unknown) {
    const { color } = formData as { color: string };

    if (appState.selectedElementIds.size > 0) {
      const newElements = elements.map((el) =>
        appState.selectedElementIds.has(el.id) ? { ...el, fillColor: color } : el,
      );

      return {
        elements: newElements,
        appState: { currentFillColor: color },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    }

    return {
      appState: { currentFillColor: color },
      captureUpdate: CaptureUpdateAction.NEVER,
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

  perform(elements: readonly CanvasElement[], appState: Readonly<AppState>, formData: unknown) {
    const { width } = formData as { width: number };

    if (appState.selectedElementIds.size > 0) {
      const newElements = elements.map((el) =>
        appState.selectedElementIds.has(el.id) ? { ...el, strokeWidth: width } : el,
      );

      return {
        elements: newElements,
        appState: { currentStrokeWidth: width },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    }

    return {
      appState: { currentStrokeWidth: width },
      captureUpdate: CaptureUpdateAction.NEVER,
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

  perform(elements: readonly CanvasElement[], appState: Readonly<AppState>, formData: unknown) {
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
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    }

    return {
      appState: { currentFontSize: fontSize },
      captureUpdate: CaptureUpdateAction.NEVER,
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

  perform(elements: readonly CanvasElement[], appState: Readonly<AppState>, formData: unknown) {
    const { opacity } = formData as { opacity: number };

    if (appState.selectedElementIds.size > 0) {
      const newElements = elements.map((el) =>
        appState.selectedElementIds.has(el.id) ? { ...el, opacity } : el,
      );

      return {
        elements: newElements,
        appState: { currentOpacity: opacity },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    return {
      appState: { currentOpacity: opacity },
      captureUpdate: CaptureUpdateAction.NEVER,
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

  perform(elements: readonly CanvasElement[], appState: Readonly<AppState>, _formData: unknown) {
    if (appState.selectedElementIds.size === 0) {
      return { captureUpdate: CaptureUpdateAction.NEVER };
    }

    const newElements = elements.map((el) =>
      appState.selectedElementIds.has(el.id) ? { ...el, isDeleted: true } : el,
    );

    return {
      elements: newElements,
      appState: {
        selectedElementIds: new Set<string>(),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
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

  perform(elements: readonly CanvasElement[], _appState: Readonly<AppState>, _formData: unknown) {
    const hasVisibleElements = elements.some((el) => !el.isDeleted);

    if (!hasVisibleElements) {
      return { captureUpdate: CaptureUpdateAction.NEVER };
    }

    const newElements = elements.map((el) => (el.isDeleted ? el : { ...el, isDeleted: true }));

    return {
      elements: newElements,
      appState: { selectedElementIds: new Set<string>() },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },

  predicate(elements) {
    return elements.some((el) => !el.isDeleted);
  },

  PanelComponent({ elements, updateData }: ActionPanelProps) {
    const enabled = elements.some((el) => !el.isDeleted);
    return (
      <button
        type="button"
        title="清空画布"
        aria-label="清空画布"
        disabled={!enabled}
        onClick={() => updateData(null)}
        className={[
          "flex items-center justify-center w-9 h-9 rounded-lg",
          "text-base transition-all duration-150 select-none border border-transparent",
          enabled
            ? "text-gray-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
            : "text-gray-600 cursor-not-allowed opacity-50",
        ].join(" ")}
      >
        <span className="text-[15px] leading-none">🗑</span>
      </button>
    );
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

  perform(elements: readonly CanvasElement[], _appState: Readonly<AppState>, _formData: unknown) {
    const visibleIds = new Set(elements.filter((el) => !el.isDeleted).map((el) => el.id));

    return {
      appState: {
        selectedElementIds: visibleIds,
        activeTool: "select" as const,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
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
 * perform 不直接操作 HistoryManager，而是通过 sideEffect 声明意图，
 * 由 App 层的 updater 识别 sideEffect.type === "requestUndo" 并调用 HistoryManager.undo()。
 * Action.perform 保持纯函数，不持有对 HistoryManager 的引用。
 */
export const undoAction: Action = {
  name: "undo",
  label: "撤销",

  perform(_elements: readonly CanvasElement[], _appState: Readonly<AppState>, _formData: unknown) {
    return {
      sideEffect: { type: "requestUndo" },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },

  keyTest(event: KeyboardEvent) {
    return (event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey;
  },

  keyPriority: 100,

  PanelComponent({ updateData, isEnabled = true }: ActionPanelProps & { isEnabled?: boolean }) {
    return (
      <button
        type="button"
        title="撤销 (Ctrl+Z)"
        aria-label="撤销"
        disabled={!isEnabled}
        onClick={() => updateData(null)}
        className={[
          "flex items-center justify-center w-9 h-9 rounded-lg",
          "text-base transition-all duration-150 select-none border border-transparent",
          isEnabled
            ? "text-gray-400 hover:text-white hover:bg-gray-700/60"
            : "text-gray-600 cursor-not-allowed opacity-50",
        ].join(" ")}
      >
        <span className="text-[15px] leading-none">↶</span>
      </button>
    );
  },
};

// ==================== redo ====================

/**
 * Action: 重做
 *
 * 快捷键：Ctrl+Shift+Z / Cmd+Shift+Z 或 Ctrl+Y / Cmd+Y
 *
 * 与 undo 同理，通过 sideEffect 声明意图由 updater 处理。
 */
export const redoAction: Action = {
  name: "redo",
  label: "重做",

  perform(_elements: readonly CanvasElement[], _appState: Readonly<AppState>, _formData: unknown) {
    return {
      sideEffect: { type: "requestRedo" },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },

  keyTest(event: KeyboardEvent) {
    return (
      (event.ctrlKey || event.metaKey) &&
      (event.key === "y" || (event.key === "z" && event.shiftKey))
    );
  },

  keyPriority: 100,

  PanelComponent({ updateData, isEnabled = true }: ActionPanelProps & { isEnabled?: boolean }) {
    return (
      <button
        type="button"
        title="重做 (Ctrl+Y)"
        aria-label="重做"
        disabled={!isEnabled}
        onClick={() => updateData(null)}
        className={[
          "flex items-center justify-center w-9 h-9 rounded-lg",
          "text-base transition-all duration-150 select-none border border-transparent",
          isEnabled
            ? "text-gray-400 hover:text-white hover:bg-gray-700/60"
            : "text-gray-600 cursor-not-allowed opacity-50",
        ].join(" ")}
      >
        <span className="text-[15px] leading-none">↷</span>
      </button>
    );
  },
};

// ==================== toggleTranslate ====================

/**
 * Action: 打开/关闭翻译 Popover
 *
 * 对标 Excalidraw 的 openDialog 模式：
 * - perform 只负责切换 appState.openDialog
 * - PanelComponent 渲染 SplitButton（主体 + 语言下拉箭头）
 * - 翻译 UI 本身（TranslatePopover）由 page.tsx 根据 openDialog 渲染
 *
 * 快捷键：Ctrl+T / Cmd+T
 */
export const toggleTranslateAction: Action = {
  name: "toggleTranslate",
  label: "翻译",

  perform(_elements: readonly CanvasElement[], appState: Readonly<AppState>, _formData: unknown) {
    return {
      appState: {
        openDialog: appState.openDialog === "translate" ? null : "translate",
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },

  keyTest(event: KeyboardEvent) {
    return (event.ctrlKey || event.metaKey) && event.key === "t";
  },

  keyPriority: 50,

  PanelComponent({ appState, updateData }: ActionPanelProps) {
    const isActive = appState.openDialog === "translate";
    const currentLang = TRANSLATE_LANGS.find((l) => l.value === appState.translateTargetLang);

    return (
      <TranslateSplitButton
        isActive={isActive}
        currentLang={currentLang ?? TRANSLATE_LANGS[1]}
        onMainClick={() => updateData(null)}
        onLangSelect={(lang: string) => {
          // 切换语言时单独 dispatch 一个 changeTranslateTargetLang Action
          // 这里借助 updateData 传递附加指令
          updateData({ __changeLang: lang });
        }}
      />
    );
  },
};

// ==================== changeTranslateTargetLang ====================

/**
 * Action: 修改翻译目标语言
 *
 * formData: { lang: string }
 * 独立于 toggleTranslate，切换语言不影响 openDialog 状态
 */
export const changeTranslateTargetLangAction: Action = {
  name: "changeTranslateTargetLang",
  label: "切换翻译语言",

  perform(_elements: readonly CanvasElement[], _appState: Readonly<AppState>, formData: unknown) {
    const { lang } = formData as { lang: string };
    return {
      appState: { translateTargetLang: lang },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
};

// ==================== 翻译语言数据（供 PanelComponent 使用） ====================

export const TRANSLATE_LANGS = [
  { value: "zh", label: "中文", flag: "🇨🇳" },
  { value: "en", label: "英语", flag: "🇺🇸" },
  { value: "ja", label: "日语", flag: "🇯🇵" },
  { value: "ko", label: "韩语", flag: "🇰🇷" },
  { value: "fr", label: "法语", flag: "🇫🇷" },
  { value: "de", label: "德语", flag: "🇩🇪" },
  { value: "es", label: "西班牙语", flag: "🇪🇸" },
  { value: "ru", label: "俄语", flag: "🇷🇺" },
  { value: "pt", label: "葡萄牙语", flag: "🇵🇹" },
  { value: "ar", label: "阿拉伯语", flag: "🇸🇦" },
  { value: "it", label: "意大利语", flag: "🇮🇹" },
  { value: "th", label: "泰语", flag: "🇹🇭" },
];

// ==================== TranslateSplitButton（PanelComponent 子组件） ====================

/**
 * TranslateSplitButton —— 翻译分裂按钮
 *
 * 放在 actions.tsx 里而不是组件文件里，原因是它属于 toggleTranslateAction
 * 的 PanelComponent，与 Action 的数据逻辑强绑定。
 * 对标 Excalidraw 的 Action.PanelComponent 内联定义模式。
 *
 * 左侧：点击打开/关闭翻译 Popover
 * 右侧 ▾：展开语言菜单，选择目标语言
 */
function TranslateSplitButton({
  isActive,
  currentLang,
  onMainClick,
  onLangSelect,
}: {
  isActive: boolean;
  currentLang: { value: string; label: string; flag: string };
  onMainClick: () => void;
  onLangSelect: (lang: string) => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const arrowRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: PointerEvent) => {
      const t = e.target as Node;
      if (arrowRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", handler, true);
    return () => window.removeEventListener("pointerdown", handler, true);
  }, [menuOpen]);

  // ESC 关闭菜单
  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [menuOpen]);

  return (
    <div className="relative flex items-center">
      {/* 整体边框容器 */}
      <div
        className={[
          "flex items-center rounded-lg border transition-all duration-150",
          isActive
            ? "border-blue-500/40 bg-blue-500/10"
            : "border-transparent hover:border-gray-700/60",
        ].join(" ")}
      >
        {/* 左侧主体按钮 */}
        <button
          type="button"
          title={`翻译 → ${currentLang.label} (Ctrl+T)`}
          aria-label="翻译"
          aria-pressed={isActive}
          onClick={onMainClick}
          className={[
            "flex items-center gap-1 pl-2.5 pr-2 h-8 rounded-l-lg",
            "text-[13px] font-medium transition-colors duration-100 select-none",
            "border-r border-gray-700/50",
            isActive ? "text-blue-400" : "text-gray-400 hover:text-white",
          ].join(" ")}
        >
          <span className="text-[14px] leading-none">🌐</span>
          <span className="text-[13px] leading-none">{currentLang.flag}</span>
        </button>
        {/* 右侧箭头按钮 */}
        <button
          ref={arrowRef}
          type="button"
          title="选择翻译目标语言"
          aria-label="选择目标语言"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            setMenuOpen((p) => !p);
          }}
          className={[
            "flex items-center justify-center w-5 h-8 rounded-r-lg",
            "transition-colors duration-100 select-none",
            menuOpen || isActive ? "text-blue-400" : "text-gray-500 hover:text-white",
          ].join(" ")}
        >
          <ChevronDownIcon open={menuOpen} />
        </button>
      </div>
      {/* 语言下拉菜单 */}
      {menuOpen && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="选择目标语言"
          className="absolute top-full right-0 mt-1.5 z-50 bg-gray-900 border border-gray-700/80 rounded-xl shadow-xl py-1 min-w-[128px] overflow-hidden"
        >
          <div className="px-2.5 py-1 mb-0.5 text-[10px] text-gray-500 font-medium uppercase tracking-wide select-none">
            翻译目标语言
          </div>
          {TRANSLATE_LANGS.map((lang) => (
            <button
              key={lang.value}
              type="button"
              role="option"
              aria-selected={lang.value === currentLang.value}
              onClick={() => {
                onLangSelect(lang.value);
                setMenuOpen(false);
              }}
              className={[
                "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left",
                "transition-colors duration-75 select-none",
                lang.value === currentLang.value
                  ? "bg-blue-500/15 text-blue-300"
                  : "text-gray-300 hover:bg-gray-700/60 hover:text-white",
              ].join(" ")}
            >
              <span className="text-sm leading-none">{lang.flag}</span>
              <span>{lang.label}</span>
              {lang.value === currentLang.value && (
                <span className="ml-auto text-blue-400">
                  <CheckMarkIcon />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={9}
      height={9}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: "transform 150ms", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <path d="M2 3.5l3 3 3-3" />
    </svg>
  );
}

function CheckMarkIcon() {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 6l4 4 6-8" />
    </svg>
  );
}

// ==================== copyElements ====================

/**
 * 剪贴板数据格式
 */
interface ClipboardData {
  type: "canvas-annotator-elements";
  version: 1;
  elements: CanvasElement[];
}

/**
 * 序列化选中元素为剪贴板数据
 */
function serializeElementsForClipboard(
  elements: readonly CanvasElement[],
  selectedIds: Set<string>,
): string {
  const selectedElements = elements.filter(
    (el) => selectedIds.has(el.id) && !el.isDeleted,
  );

  const clipboardData: ClipboardData = {
    type: "canvas-annotator-elements",
    version: 1,
    elements: selectedElements as CanvasElement[],
  };

  return JSON.stringify(clipboardData);
}

/**
 * 反序列化剪贴板数据
 * 返回 null 表示数据格式无效
 */
function deserializeClipboardData(text: string): ClipboardData | null {
  try {
    const data = JSON.parse(text);
    if (
      data &&
      data.type === "canvas-annotator-elements" &&
      data.version === 1 &&
      Array.isArray(data.elements)
    ) {
      return data as ClipboardData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 为元素生成新 ID 并偏移位置
 * 避免粘贴时 ID 冲突和位置完全重叠
 */
function cloneElementsWithNewIds(
  elements: CanvasElement[],
  offsetX: number = 20,
  offsetY: number = 20,
): CanvasElement[] {
  return elements.map((el) => ({
    ...el,
    id: crypto.randomUUID(),
    x: el.x + offsetX,
    y: el.y + offsetY,
    // 对于箭头，还需要偏移终点
    ...(el.type === "arrow"
      ? { endX: el.endX + offsetX, endY: el.endY + offsetY }
      : {}),
    // 对于 pen，还需要偏移所有点
    ...(el.type === "pen"
      ? {
          points: el.points.map((p) => ({
            ...p,
            x: p.x + offsetX,
            y: p.y + offsetY,
          })),
        }
      : {}),
  })) as CanvasElement[];
}

/**
 * Action: 复制选中元素到剪贴板
 *
 * 快捷键：Ctrl+C / Cmd+C
 *
 * 通过 sideEffect: { type: "clipboardWrite" } 声明意图，
 * 由 updater 执行实际的剪贴板写入。
 */
export const copyElementsAction: Action = {
  name: "copyElements",
  label: "复制",

  perform(elements: readonly CanvasElement[], appState: Readonly<AppState>, _formData: unknown) {
    if (appState.selectedElementIds.size === 0) {
      return { captureUpdate: CaptureUpdateAction.NEVER };
    }

    const clipboardText = serializeElementsForClipboard(elements, appState.selectedElementIds);

    return {
      sideEffect: { type: "clipboardWrite", text: clipboardText },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },

  keyTest(event: KeyboardEvent, appState: Readonly<AppState>) {
    return (
      (event.ctrlKey || event.metaKey) &&
      event.key === "c" &&
      !event.shiftKey &&
      appState.selectedElementIds.size > 0
    );
  },

  predicate(_elements, appState) {
    return appState.selectedElementIds.size > 0;
  },

  keyPriority: 50,
};

// ==================== cutElements ====================

/**
 * Action: 剪切选中元素（复制 + 删除）
 *
 * 快捷键：Ctrl+X / Cmd+X
 *
 * 通过 sideEffect: { type: "clipboardWrite" } 声明剪贴板写入意图，
 * 同时返回 elements 变更（删除选中元素）。
 * updater 先执行 sideEffect，再应用 elements/appState 变更。
 */
export const cutElementsAction: Action = {
  name: "cutElements",
  label: "剪切",

  perform(elements: readonly CanvasElement[], appState: Readonly<AppState>, _formData: unknown) {
    if (appState.selectedElementIds.size === 0) {
      return { captureUpdate: CaptureUpdateAction.NEVER };
    }

    // 复制到剪贴板
    const clipboardText = serializeElementsForClipboard(elements, appState.selectedElementIds);

    // 删除选中元素（标记为 isDeleted）
    const newElements = elements.map((el) =>
      appState.selectedElementIds.has(el.id) ? { ...el, isDeleted: true } : el,
    );

    return {
      elements: newElements,
      appState: {
        selectedElementIds: new Set<string>(),
      },
      sideEffect: { type: "clipboardWrite", text: clipboardText },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },

  keyTest(event: KeyboardEvent, appState: Readonly<AppState>) {
    return (
      (event.ctrlKey || event.metaKey) &&
      event.key === "x" &&
      !event.shiftKey &&
      appState.selectedElementIds.size > 0
    );
  },

  predicate(_elements, appState) {
    return appState.selectedElementIds.size > 0;
  },

  keyPriority: 50,
};

// ==================== pasteElements ====================

/**
 * Action: 粘贴剪贴板内容到画布
 *
 * 快捷键：Ctrl+V / Cmd+V
 *
 * 通过 sideEffect: { type: "clipboardReadAndPaste" } 声明意图：
 * 1. updater 识别 sideEffect 后异步读取剪贴板
 * 2. 读取完成后调用 onAsyncComplete 获取实际的元素变更
 * 3. 应用变更并记入历史
 */
export const pasteElementsAction: Action = {
  name: "pasteElements",
  label: "粘贴",

  perform(_elements: readonly CanvasElement[], _appState: Readonly<AppState>, _formData: unknown) {
    return {
      sideEffect: { type: "clipboardReadAndPaste" },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },

  /**
   * 异步副作用完成后的回调：剪贴板读取完成后应用粘贴
   * 由 updater 在读取剪贴板后调用
   */
  onAsyncComplete(
    elements: readonly CanvasElement[],
    _appState: Readonly<AppState>,
    clipboardText: string,
  ) {
    const clipboardData = deserializeClipboardData(clipboardText);
    if (!clipboardData || clipboardData.elements.length === 0) {
      return null;
    }

    // 克隆元素：新 ID + 位置偏移
    const newElements = cloneElementsWithNewIds(clipboardData.elements);
    const newElementIds = new Set(newElements.map((el) => el.id));

    return {
      elements: [...elements, ...newElements],
      appState: {
        selectedElementIds: newElementIds,
        activeTool: "select" as const,
      },
    };
  },

  keyTest(event: KeyboardEvent) {
    return (event.ctrlKey || event.metaKey) && event.key === "v" && !event.shiftKey;
  },

  keyPriority: 50,
};

// ==================== changeActiveTool ====================

/**
 * ToolButton —— 工具按钮（从 MainToolbar 迁移至此）
 *
 * 作为 changeActiveToolAction.PanelComponent 的子组件，
 * 跟随 Action 定义，对标 Excalidraw 的内联 PanelComponent 模式。
 */
function ToolButton({
  label,
  icon,
  isActive,
  shortcutKey,
  onClick,
}: {
  label: string;
  icon: string;
  isActive: boolean;
  shortcutKey?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={shortcutKey ? `${label} (${shortcutKey.toUpperCase()})` : label}
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

/**
 * Action: 切换当前工具
 *
 * 对标 Excalidraw 的 changeActiveTool Action：
 * - PanelComponent 遍历 SHAPES 渲染 ToolButton
 * - keyTest 匹配 SHAPES 的 shortcutKey（排除修饰键，避免干扰 Ctrl+T 等组合键）
 * - perform 通过 sideEffect: { type: "switchTool" } 声明意图，由 updater 调用 toolRegistry.switchTool
 */
export const changeActiveToolAction: Action = {
  name: "changeActiveTool",
  label: "切换工具",

  perform(
    _elements: readonly CanvasElement[],
    _appState: Readonly<AppState>,
    formData: unknown,
  ) {
    const data = formData as { toolType?: ToolType; key?: string } | null;

    let toolType: ToolType | undefined;

    if (data?.toolType) {
      toolType = data.toolType;
    } else if (data?.key) {
      const key = data.key.toLowerCase();
      const shape = SHAPES.find((s) => s.shortcutKey === key);
      if (shape) {
        toolType = shape.type;
      }
    }

    if (!toolType) {
      return { captureUpdate: CaptureUpdateAction.NEVER };
    }

    return {
      sideEffect: { type: "switchTool", toolType },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },

  keyTest(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return false;
    }
    return SHAPES.some((s) => s.shortcutKey === event.key.toLowerCase());
  },

  keyPriority: -10,

  PanelComponent({ appState, updateData }: ActionPanelProps) {
    return (
      <div className="flex items-center gap-0.5">
        {SHAPES.map((shape) => (
          <ToolButton
            key={shape.type}
            label={shape.label}
            icon={shape.icon}
            shortcutKey={shape.shortcutKey}
            isActive={appState.activeTool === shape.type}
            onClick={() => updateData({ toolType: shape.type })}
          />
        ))}
      </div>
    );
  },
};

// ==================== 导出所有 Actions ====================

/**
 * 所有内置 Actions 的集合
 * 由 ActionManager.registerAll() 一次性注册
 */
export const ALL_ACTIONS: readonly Action[] = [
  changeActiveToolAction,
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
  toggleTranslateAction,
  changeTranslateTargetLangAction,
  copyElementsAction,
  cutElementsAction,
  pasteElementsAction,
];
