"use client";

import { useState, useRef, useCallback, useMemo, useEffect, type FC } from "react";
import {
  PluginSystem,
  type PluginConfig,
  type PluginContext,
  type PanelProps,
  type LifecycleEvent,
} from "@/contribution-points/yuque/PluginSystem";

// ==================== Panel Components ====================

const TranslatePanel: FC<PanelProps> = ({ context, onClose }) => {
  const [lang, setLang] = useState("en");
  const TRANSLATIONS: Record<string, Record<string, string>> = {
    en: { 你好: "Hello", 世界: "World", default: "[EN] " },
    ja: { 你好: "こんにちは", 世界: "世界", default: "[JA] " },
  };

  const handleTranslate = () => {
    if (!context.selectedText) return;
    const dict = TRANSLATIONS[lang] ?? {};
    const translated =
      dict[context.selectedText] ?? `${dict.default ?? ""}${context.selectedText}`;
    const before = context.text.slice(0, context.selectionStart);
    const after = context.text.slice(context.selectionEnd);
    context.updateText(before + translated + after);
    onClose();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-gray-400">
        选中: {context.selectedText || "(无)"}
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
        disabled={!context.selectedText}
        className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-xs"
      >
        翻译
      </button>
    </div>
  );
};

// ==================== Plugin Configs ====================

function createPluginConfigs(): PluginConfig[] {
  return [
    {
      id: "bold-plugin",
      name: "加粗插件",
      version: "1.0.0",
      sandbox: false,
      onInit: () => {
        // 初始化逻辑
      },
      onSelectionChange: () => {
        // 选区变化回调
      },
      contributions: {
        commands: {
          bold: (ctx) => {
            if (!ctx.selectedText) return;
            const wrapped = `**${ctx.selectedText}**`;
            const before = ctx.text.slice(0, ctx.selectionStart);
            const after = ctx.text.slice(ctx.selectionEnd);
            ctx.updateText(before + wrapped + after);
          },
        },
        toolbar: [
          { icon: "B", tooltip: "加粗", command: "bold", order: 1 },
        ],
        contextMenu: [
          { label: "加粗", command: "bold", group: "format" },
        ],
      },
    },
    {
      id: "italic-plugin",
      name: "斜体插件",
      version: "1.0.0",
      sandbox: false,
      contributions: {
        commands: {
          italic: (ctx) => {
            if (!ctx.selectedText) return;
            const wrapped = `*${ctx.selectedText}*`;
            const before = ctx.text.slice(0, ctx.selectionStart);
            const after = ctx.text.slice(ctx.selectionEnd);
            ctx.updateText(before + wrapped + after);
          },
        },
        toolbar: [
          { icon: "I", tooltip: "斜体", command: "italic", order: 2 },
        ],
        contextMenu: [
          { label: "斜体", command: "italic", group: "format" },
        ],
      },
    },
    {
      id: "heading-plugin",
      name: "标题插件",
      version: "1.0.0",
      sandbox: false,
      contributions: {
        commands: {
          heading: (ctx) => {
            const lineStart =
              ctx.text.lastIndexOf("\n", ctx.selectionStart - 1) + 1;
            const before = ctx.text.slice(0, lineStart);
            const after = ctx.text.slice(lineStart);
            ctx.updateText(before + "# " + after);
          },
        },
        toolbar: [
          { icon: "H1", tooltip: "标题", command: "heading", order: 3 },
        ],
      },
    },
    {
      id: "word-count-plugin",
      name: "字数统计",
      version: "1.0.0",
      sandbox: true, // 沙箱隔离运行
      contributions: {
        statusBar: [
          {
            position: "left",
            render: (ctx) => {
              const count = ctx.text.replace(/\s/g, "").length;
              return `字数: ${count}`;
            },
          },
        ],
      },
    },
    {
      id: "translate-plugin",
      name: "翻译插件",
      version: "1.2.0",
      sandbox: true, // 沙箱隔离
      onInit: () => {
        // 翻译引擎初始化
      },
      onDestroy: () => {
        // 清理翻译缓存
      },
      contributions: {
        commands: {
          "open-translate": () => {
            // Panel 打开由宿主处理
          },
        },
        toolbar: [
          { icon: "🌐", tooltip: "翻译", command: "open-translate", order: 10 },
        ],
        panels: [
          {
            id: "translate-panel",
            title: "翻译面板",
            Component: TranslatePanel,
          },
        ],
      },
    },
  ];
}

// ==================== Demo Component ====================

const DEFAULT_TEXT = `选中文字后点击工具栏按钮操作。

语雀模式的核心差异：
- Config 驱动：一个 PluginConfig 对象声明一切
- 生命周期钩子：onInit / onDestroy / onSelectionChange
- sandbox: true 标记沙箱隔离运行
- 宿主维护 lifecycleLog，所有事件可追溯
- contributions 统一声明 commands/toolbar/statusBar/panels`;

export default function YuqueDemo() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [, forceUpdate] = useState(0);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);

  const system = useMemo(() => {
    const s = new PluginSystem();
    for (const config of createPluginConfigs()) {
      s.register(config);
    }
    return s;
  }, []);

  // Initialize all plugins on mount
  useEffect(() => {
    const ctx = getContext();
    system.initAll(ctx);
    forceUpdate((n) => n + 1);
    return () => {
      system.destroyAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system]);

  const getContext = useCallback((): PluginContext => {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? 0;
    const end = ta?.selectionEnd ?? 0;
    return {
      text,
      selectionStart: start,
      selectionEnd: end,
      selectedText: text.slice(start, end),
      updateText: (newText, newSelStart?, newSelEnd?) => {
        setText(newText);
        if (newSelStart != null && newSelEnd != null) {
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = newSelStart;
              textareaRef.current.selectionEnd = newSelEnd;
              textareaRef.current.focus();
            }
          });
        }
      },
    };
  }, [text]);

  const handleSelectionChange = useCallback(() => {
    const ctx = getContext();
    system.notifySelectionChange(ctx);
    forceUpdate((n) => n + 1);
  }, [system, getContext]);

  const handleExecuteCommand = useCallback(
    (commandId: string) => {
      // Check if this opens a panel
      const panels = system.getPanels();
      const panel = panels.find(
        (p) => p.pluginId === commandId.replace("open-", "") + "-plugin"
      );
      if (panel) {
        setActivePanel((prev) => (prev === panel.id ? null : panel.id));
        return;
      }
      system.executeCommand(commandId, getContext());
      forceUpdate((n) => n + 1);
    },
    [system, getContext]
  );

  const toolbarItems = system.getToolbarItems();
  const statusBarItems = system.getStatusBarItems(getContext());
  const contextMenuItems = system.getContextMenuItems();
  const panels = system.getPanels();
  const plugins = system.getPlugins();
  const lifecycleLog = system.lifecycleLog;
  const activePanelData = activePanel
    ? panels.find((p) => p.id === activePanel)
    : null;

  return (
    <div className="space-y-4">
      {/* Key Concept */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <h3 className="text-sm font-bold text-emerald-400 mb-2">
          语雀模式：Config 驱动 + 生命周期 + 沙箱
        </h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          每个插件是一个{" "}
          <strong className="text-emerald-300">PluginConfig</strong>{" "}
          对象，包含 contributions（声明）+ 生命周期钩子（行为）。
          标记{" "}
          <strong className="text-emerald-300">sandbox: true</strong>{" "}
          的插件在隔离环境中运行。宿主通过{" "}
          <strong className="text-emerald-300">lifecycleLog</strong>{" "}
          记录所有事件。
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/30">
            PluginConfig: 统一配置
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/30">
            onInit/onDestroy: 生命周期
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/30">
            sandbox: 沙箱隔离
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/30">
            lifecycleLog: 事件追溯
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div>
        <div className="text-xs text-gray-500 mb-1">
          Toolbar{" "}
          <span className="text-gray-600">
            system.getToolbarItems() — contributions.toolbar
          </span>
        </div>
        <div className="relative z-50 flex items-center gap-1 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700/50">
          {toolbarItems.map((item) => {
            const itemPanel = panels.find((p) => p.pluginId === item.pluginId);
            const isActive = itemPanel != null && activePanel === itemPanel.id;
            return (
              <div key={`${item.pluginId}-${item.command}`} className="relative">
                <button
                  onClick={() => handleExecuteCommand(item.command)}
                  title={`${item.tooltip} [${item.pluginId}]${item.sandbox ? " (sandbox)" : ""}`}
                  className={`px-3 py-1.5 rounded text-sm font-bold transition-all flex items-center gap-1 ${
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  {item.icon}
                  {item.sandbox && (
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400/70" title="sandbox" />
                  )}
                </button>
                {isActive && itemPanel && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setActivePanel(null)}
                    />
                    <div className="absolute left-0 top-full mt-2 z-50 rounded-xl border border-emerald-600/30 bg-gray-800 shadow-2xl p-4 w-72">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-emerald-400 font-mono">
                          Panel: {itemPanel.title}
                        </span>
                        <button
                          onClick={() => setActivePanel(null)}
                          className="text-gray-500 hover:text-white text-sm"
                        >
                          ×
                        </button>
                      </div>
                      <itemPanel.Component
                        context={getContext()}
                        onClose={() => setActivePanel(null)}
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
      <div className="relative" ref={editorWrapRef}>
        <div className="text-xs text-gray-500 mb-1">
          Editor{" "}
          <span className="text-gray-600">
            右键打开菜单 — onSelectionChange 触发生命周期
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSelect={handleSelectionChange}
          onClick={handleSelectionChange}
          onContextMenu={(e) => {
            if (contextMenuItems.length === 0) return;
            e.preventDefault();
            const rect = editorWrapRef.current?.getBoundingClientRect();
            if (!rect) return;
            setContextMenu({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            });
          }}
          className="w-full h-48 bg-gray-900 border border-gray-700/60 rounded-xl p-4 text-sm text-gray-200 font-mono leading-relaxed resize-none focus:outline-none focus:border-emerald-500/50 transition-all"
          spellCheck={false}
        />
        {contextMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setContextMenu(null)}
            />
            <div
              className="absolute z-50 min-w-[160px] bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {contextMenuItems.map((item) => (
                <button
                  key={`${item.pluginId}-${item.command}`}
                  onClick={() => {
                    handleExecuteCommand(item.command);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Status Bar */}
      {statusBarItems.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800/60 rounded-lg border border-gray-700/50 text-xs text-gray-400">
          <div className="flex items-center gap-4">
            {statusBarItems
              .filter((i) => i.position === "left")
              .map((i, idx) => (
                <span key={idx}>{i.text}</span>
              ))}
          </div>
          <div className="flex items-center gap-4">
            {statusBarItems
              .filter((i) => i.position === "right")
              .map((i, idx) => (
                <span key={idx}>{i.text}</span>
              ))}
          </div>
        </div>
      )}

      {/* Lifecycle Log */}
      {lifecycleLog.length > 0 && (
        <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400">
              Lifecycle Log
            </span>
            <span className="text-xs text-gray-600">
              宿主记录的所有生命周期事件
            </span>
          </div>
          <div className="space-y-0.5 text-xs font-mono text-gray-500 max-h-32 overflow-y-auto">
            {lifecycleLog.map((event, i) => (
              <LifecycleLogItem key={i} index={i} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Plugin Inspector */}
      <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4">
        <h3 className="text-sm font-bold text-white mb-3">
          Plugin Inspector (语雀 Style)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3 text-xs font-mono"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-emerald-400 font-bold">
                  {plugin.name}
                </span>
                <div className="flex items-center gap-1.5">
                  {plugin.sandbox && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-900/40 text-yellow-400 border border-yellow-700/30">
                      sandbox
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      plugin.initialized
                        ? "bg-green-900/40 text-green-400 border border-green-700/30"
                        : "bg-gray-700/40 text-gray-500 border border-gray-600/30"
                    }`}
                  >
                    {plugin.initialized ? "initialized" : "pending"}
                  </span>
                </div>
              </div>
              <div className="space-y-1 text-gray-400">
                <div>
                  <span className="text-gray-500">version:</span>{" "}
                  {plugin.version}
                </div>
                <div>
                  <span className="text-gray-500">commands:</span>{" "}
                  <span className="text-green-400/70">
                    {plugin.contributionSummary.commands}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">toolbar:</span>{" "}
                  <span className="text-green-400/70">
                    {plugin.contributionSummary.toolbar}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">statusBar:</span>{" "}
                  <span className="text-green-400/70">
                    {plugin.contributionSummary.statusBar}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">contextMenu:</span>{" "}
                  <span className="text-green-400/70">
                    {plugin.contributionSummary.contextMenu}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">panels:</span>{" "}
                  <span className="text-green-400/70">
                    {plugin.contributionSummary.panels}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Lifecycle Log Item ----

function LifecycleLogItem({
  index,
  event,
}: {
  index: number;
  event: LifecycleEvent;
}) {
  const colorMap: Record<string, string> = {
    init: "text-green-400/70",
    destroy: "text-red-400/70",
    selectionChange: "text-blue-400/70",
    command: "text-purple-400/70",
    "sandbox-message": "text-yellow-400/70",
  };

  const formatEvent = (e: LifecycleEvent): string => {
    switch (e.type) {
      case "init":
        return `${e.pluginId} initialized${e.sandbox ? " (sandbox)" : ""}`;
      case "destroy":
        return `${e.pluginId} destroyed`;
      case "selectionChange":
        return `${e.pluginId} selection: "${e.selection}"`;
      case "command":
        return `${e.pluginId} → ${e.command}`;
      case "sandbox-message":
        return `${e.pluginId}: ${e.message}`;
    }
  };

  return (
    <div>
      <span className="text-gray-600">{index + 1}.</span>{" "}
      <span className={colorMap[event.type] ?? "text-gray-400"}>
        [{event.type}]
      </span>{" "}
      {formatEvent(event)}
    </div>
  );
}
