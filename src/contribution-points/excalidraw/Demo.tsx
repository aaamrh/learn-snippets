"use client";

import { useState, useRef, useCallback, useMemo, type FC } from "react";
import {
  ActionManager,
  type Action,
  type AppState,
  type PanelComponentProps,
} from "@/contribution-points/excalidraw/ActionManager";

// ==================== Panel Components ====================

const TranslatePanel: FC<PanelComponentProps> = ({ appState, updateData }) => {
  const [lang, setLang] = useState("en");
  const selected = appState.text.slice(
    appState.selectionStart,
    appState.selectionEnd
  );

  const TRANSLATIONS: Record<string, Record<string, string>> = {
    en: { 你好: "Hello", 世界: "World", default: "[EN] " },
    ja: { 你好: "こんにちは", 世界: "世界", default: "[JA] " },
  };

  const handleTranslate = () => {
    if (!selected) return;
    const dict = TRANSLATIONS[lang] ?? {};
    const translated =
      dict[selected] ?? `${dict.default ?? ""}${selected}`;
    const before = appState.text.slice(0, appState.selectionStart);
    const after = appState.text.slice(appState.selectionEnd);
    updateData({ text: before + translated + after });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-gray-400">
        选中: {selected || "(无)"}
      </div>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
      >
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>
      <button
        onClick={handleTranslate}
        disabled={!selected}
        className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-xs"
      >
        翻译
      </button>
    </div>
  );
};

// ==================== Actions (统一对象：数据 + 行为 + UI) ====================

function createActions(): Action[] {
  return [
    {
      name: "bold",
      label: "加粗",
      icon: "B",
      keywords: ["bold", "加粗", "粗体"],
      perform: (appState) => {
        const sel = appState.text.slice(
          appState.selectionStart,
          appState.selectionEnd
        );
        if (!sel) return {};
        const wrapped = `**${sel}**`;
        const before = appState.text.slice(0, appState.selectionStart);
        const after = appState.text.slice(appState.selectionEnd);
        return {
          appState: { text: before + wrapped + after },
          commitToHistory: true,
        };
      },
      keyTest: (e) => (e.ctrlKey || e.metaKey) && e.key === "b",
      predicate: (s) => s.selectionStart !== s.selectionEnd,
    },
    {
      name: "italic",
      label: "斜体",
      icon: "I",
      keywords: ["italic", "斜体"],
      perform: (appState) => {
        const sel = appState.text.slice(
          appState.selectionStart,
          appState.selectionEnd
        );
        if (!sel) return {};
        const wrapped = `*${sel}*`;
        const before = appState.text.slice(0, appState.selectionStart);
        const after = appState.text.slice(appState.selectionEnd);
        return {
          appState: { text: before + wrapped + after },
          commitToHistory: true,
        };
      },
      keyTest: (e) => (e.ctrlKey || e.metaKey) && e.key === "i",
      predicate: (s) => s.selectionStart !== s.selectionEnd,
    },
    {
      name: "heading",
      label: "标题",
      icon: "H1",
      keywords: ["heading", "标题", "h1"],
      perform: (appState) => {
        const lineStart =
          appState.text.lastIndexOf("\n", appState.selectionStart - 1) + 1;
        const before = appState.text.slice(0, lineStart);
        const after = appState.text.slice(lineStart);
        return {
          appState: { text: before + "# " + after },
          commitToHistory: true,
        };
      },
    },
    {
      name: "translate",
      label: "翻译",
      icon: "🌐",
      keywords: ["translate", "翻译"],
      perform: () => ({}),
      PanelComponent: TranslatePanel,
    },
  ];
}

// ==================== Demo Component ====================

const DEFAULT_TEXT = `选中文字后点击按钮或用快捷键操作。

Excalidraw 模式的核心差异：
- Action 是统一对象：数据 + 行为 + UI 组件全在一起
- keyTest 是函数而非字符串 → 更灵活
- PanelComponent 内嵌在 Action 中
- 没有 manifest，没有懒加载，全部运行时注册
- predicate 控制 Action 是否可用`;

export default function ExcalidrawDemo() {
  const [appState, setAppState] = useState<AppState>({
    text: DEFAULT_TEXT,
    selectionStart: 0,
    selectionEnd: 0,
  });
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const manager = useMemo(() => {
    const m = new ActionManager();
    m.registerAll(createActions());
    return m;
  }, []);

  const syncSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    setAppState((prev) => ({
      ...prev,
      selectionStart: ta.selectionStart,
      selectionEnd: ta.selectionEnd,
    }));
  }, []);

  const handleExecuteAction = useCallback(
    (name: string) => {
      const action = manager.getAction(name);
      if (action?.PanelComponent) {
        setExpandedPanel((prev) => (prev === name ? null : name));
        return;
      }
      const result = manager.executeAction(name, appState);
      if (result.appState) {
        setAppState((prev) => ({ ...prev, ...result.appState }));
        setActionLog((prev) => [
          ...prev,
          `${name} → ${result.commitToHistory ? "committed" : "no-commit"}`,
        ]);
      }
    },
    [manager, appState]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const nativeEvent = e.nativeEvent;
      const { handled, result, actionName } = manager.handleKeyDown(
        nativeEvent as unknown as KeyboardEvent,
        appState
      );
      if (handled) {
        e.preventDefault();
        if (result.appState) {
          setAppState((prev) => ({ ...prev, ...result.appState }));
          setActionLog((prev) => [
            ...prev,
            `${actionName} (key) → ${result.commitToHistory ? "committed" : "no-commit"}`,
          ]);
        }
      }
    },
    [manager, appState]
  );

  const actions = manager.getActions();
  const panelAction = expandedPanel ? manager.getAction(expandedPanel) : null;

  return (
    <div className="space-y-4">
      {/* Key Concept */}
      <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
        <h3 className="text-sm font-bold text-orange-400 mb-2">
          Excalidraw 模式：Action = 统一对象
        </h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          每个 <strong className="text-orange-300">Action</strong>{" "}
          是一个完整的对象：name + label + icon + perform + keyTest +
          PanelComponent。 没有 Manifest/Activate 分离，一切都在运行时注册。
          <strong className="text-orange-300">keyTest</strong>{" "}
          是函数（非字符串），更灵活但不可序列化。
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 rounded bg-orange-900/40 text-orange-300 border border-orange-700/30">
            Action: 统一对象
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-orange-900/40 text-orange-300 border border-orange-700/30">
            keyTest: 函数匹配
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-orange-900/40 text-orange-300 border border-orange-700/30">
            PanelComponent: 内嵌 UI
          </span>
        </div>
      </div>

      {/* Action Bar */}
      <div>
        <div className="text-xs text-gray-500 mb-1">
          Action Bar{" "}
          <span className="text-gray-600">
            manager.getActions() — 所有 Action 平铺
          </span>
        </div>
        <div className="relative z-50 flex items-center gap-1 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700/50">
          {actions.map((action) => {
            const canExecute =
              !action.predicate || action.predicate(appState);
            const isPanel = action.PanelComponent != null;
            const isActive = expandedPanel === action.name;
            return (
              <div key={action.name} className="relative">
                <button
                  onClick={() => handleExecuteAction(action.name)}
                  disabled={!canExecute && !isPanel}
                  title={`${action.label}${action.keywords ? ` [${action.keywords.join(", ")}]` : ""}`}
                  className={`px-3 py-1.5 rounded text-sm font-bold transition-all ${
                    isActive
                      ? "bg-orange-600 text-white"
                      : canExecute || isPanel
                        ? "text-gray-300 hover:bg-gray-700 hover:text-white"
                        : "text-gray-600 cursor-not-allowed opacity-50"
                  }`}
                >
                  {action.icon ?? action.name}
                </button>
                {isActive && action.PanelComponent && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setExpandedPanel(null)}
                    />
                    <div className="absolute left-0 top-full mt-2 z-50 rounded-xl border border-orange-600/30 bg-gray-800 shadow-2xl p-4 w-72">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-orange-400 font-mono">
                          PanelComponent: {action.name}
                        </span>
                        <button
                          onClick={() => setExpandedPanel(null)}
                          className="text-gray-500 hover:text-white text-sm"
                        >
                          ×
                        </button>
                      </div>
                      <action.PanelComponent
                        appState={appState}
                        updateData={(data) =>
                          setAppState((prev) => ({ ...prev, ...data }))
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div>
        <div className="text-xs text-gray-500 mb-1">
          Editor <span className="text-gray-600">appState 驱动</span>
        </div>
        <textarea
          ref={textareaRef}
          value={appState.text}
          onChange={(e) =>
            setAppState((prev) => ({ ...prev, text: e.target.value }))
          }
          onSelect={syncSelection}
          onClick={syncSelection}
          onKeyDown={handleKeyDown}
          className="w-full h-48 bg-gray-900 border border-gray-700/60 rounded-xl p-4 text-sm text-gray-200 font-mono leading-relaxed resize-none focus:outline-none focus:border-orange-500/50 transition-all"
          spellCheck={false}
        />
      </div>

      {/* Action Log */}
      {actionLog.length > 0 && (
        <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400">
              Action Log
            </span>
            <button
              onClick={() => setActionLog([])}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              clear
            </button>
          </div>
          <div className="space-y-0.5 text-xs font-mono text-gray-500 max-h-24 overflow-y-auto">
            {actionLog.map((log, i) => (
              <div key={i}>
                <span className="text-gray-600">{i + 1}.</span> {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Inspector */}
      <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4">
        <h3 className="text-sm font-bold text-white mb-3">
          Action Inspector (Excalidraw Style)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {actions.map((action) => {
            const canExecute =
              !action.predicate || action.predicate(appState);
            return (
              <div
                key={action.name}
                className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3 text-xs font-mono"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-orange-400 font-bold">
                    {action.name}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      canExecute
                        ? "bg-green-900/40 text-green-400 border border-green-700/30"
                        : "bg-red-900/40 text-red-400 border border-red-700/30"
                    }`}
                  >
                    {canExecute ? "available" : "disabled"}
                  </span>
                </div>
                <div className="space-y-1 text-gray-400">
                  <div>
                    <span className="text-gray-500">label:</span>{" "}
                    {action.label}
                  </div>
                  <div>
                    <span className="text-gray-500">icon:</span>{" "}
                    {action.icon ?? "-"}
                  </div>
                  <div>
                    <span className="text-gray-500">keyTest:</span>{" "}
                    {action.keyTest ? (
                      <span className="text-green-400">fn()</span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">predicate:</span>{" "}
                    {action.predicate ? (
                      <span className="text-yellow-400">fn()</span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">PanelComponent:</span>{" "}
                    {action.PanelComponent ? (
                      <span className="text-green-400">FC</span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">keywords:</span>{" "}
                    {action.keywords?.join(", ") ?? "-"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
