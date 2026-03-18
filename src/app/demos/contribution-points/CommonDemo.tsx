"use client";

import { useState, useRef, useCallback, useMemo, useEffect, type FC } from "react";
import {
  ContributionRegistry,
  type Extension,
  type EditorContext,
  type PanelProps,
} from "@/contribution-points/ContributionRegistry";

// ==================== Extension Definitions ====================

function makeLevel1Extensions(): Extension[] {
  return [
    {
      id: "bold",
      label: "加粗",
      keybinding: "ctrl+b",
      execute: (ctx) => {
        if (!ctx.selectedText) return;
        const wrapped = `**${ctx.selectedText}**`;
        const before = ctx.text.slice(0, ctx.selectionStart);
        const after = ctx.text.slice(ctx.selectionEnd);
        ctx.updateText(before + wrapped + after, ctx.selectionStart + 2, ctx.selectionEnd + 2);
      },
    },
    {
      id: "italic",
      label: "斜体",
      keybinding: "ctrl+i",
      execute: (ctx) => {
        if (!ctx.selectedText) return;
        const wrapped = `*${ctx.selectedText}*`;
        const before = ctx.text.slice(0, ctx.selectionStart);
        const after = ctx.text.slice(ctx.selectionEnd);
        ctx.updateText(before + wrapped + after, ctx.selectionStart + 1, ctx.selectionEnd + 1);
      },
    },
  ];
}

function makeLevel2Extensions(): Extension[] {
  return [
    {
      id: "bold",
      label: "加粗",
      keybinding: "ctrl+b",
      toolbar: { icon: "B", label: "加粗", order: 1 },
      execute: (ctx) => {
        if (!ctx.selectedText) return;
        const wrapped = `**${ctx.selectedText}**`;
        const before = ctx.text.slice(0, ctx.selectionStart);
        const after = ctx.text.slice(ctx.selectionEnd);
        ctx.updateText(before + wrapped + after, ctx.selectionStart + 2, ctx.selectionEnd + 2);
      },
    },
    {
      id: "italic",
      label: "斜体",
      keybinding: "ctrl+i",
      toolbar: { icon: "I", label: "斜体", order: 2 },
      execute: (ctx) => {
        if (!ctx.selectedText) return;
        const wrapped = `*${ctx.selectedText}*`;
        const before = ctx.text.slice(0, ctx.selectionStart);
        const after = ctx.text.slice(ctx.selectionEnd);
        ctx.updateText(before + wrapped + after, ctx.selectionStart + 1, ctx.selectionEnd + 1);
      },
    },
    {
      id: "heading",
      label: "标题",
      toolbar: { icon: "H1", label: "标题", order: 3 },
      execute: (ctx) => {
        const lineStart = ctx.text.lastIndexOf("\n", ctx.selectionStart - 1) + 1;
        const before = ctx.text.slice(0, lineStart);
        const after = ctx.text.slice(lineStart);
        ctx.updateText(before + "# " + after);
      },
    },
  ];
}

function makeLevel3Extensions(): Extension[] {
  return [
    {
      id: "bold",
      label: "加粗",
      keybinding: "ctrl+b",
      toolbar: { icon: "B", label: "加粗", order: 1 },
      contextMenu: { label: "加粗", group: "format" },
      execute: (ctx) => {
        if (!ctx.selectedText) return;
        const wrapped = `**${ctx.selectedText}**`;
        const before = ctx.text.slice(0, ctx.selectionStart);
        const after = ctx.text.slice(ctx.selectionEnd);
        ctx.updateText(before + wrapped + after, ctx.selectionStart + 2, ctx.selectionEnd + 2);
      },
    },
    {
      id: "italic",
      label: "斜体",
      keybinding: "ctrl+i",
      toolbar: { icon: "I", label: "斜体", order: 2 },
      contextMenu: { label: "斜体", group: "format" },
      execute: (ctx) => {
        if (!ctx.selectedText) return;
        const wrapped = `*${ctx.selectedText}*`;
        const before = ctx.text.slice(0, ctx.selectionStart);
        const after = ctx.text.slice(ctx.selectionEnd);
        ctx.updateText(before + wrapped + after, ctx.selectionStart + 1, ctx.selectionEnd + 1);
      },
    },
    {
      id: "heading",
      label: "标题",
      toolbar: { icon: "H1", label: "标题", order: 3 },
      contextMenu: { label: "标题", group: "format" },
      execute: (ctx) => {
        const lineStart = ctx.text.lastIndexOf("\n", ctx.selectionStart - 1) + 1;
        const before = ctx.text.slice(0, lineStart);
        const after = ctx.text.slice(lineStart);
        ctx.updateText(before + "# " + after);
      },
    },
    {
      id: "wordCount",
      label: "字数统计",
      statusBar: {
        position: "left",
        render: (ctx) => {
          const count = ctx.text.replace(/\s/g, "").length;
          return `字数: ${count}`;
        },
      },
      execute: () => {},
    },
    {
      id: "lineCount",
      label: "行数统计",
      statusBar: {
        position: "right",
        render: (ctx) => {
          const count = ctx.text.split("\n").length;
          return `行数: ${count}`;
        },
      },
      execute: () => {},
    },
  ];
}

// ---- Level 4 Panel Components ----

const TranslatePanel: FC<PanelProps> = ({ context, onClose }) => {
  const [lang, setLang] = useState("en");
  const MOCK_TRANSLATIONS: Record<string, Record<string, string>> = {
    en: { 你好: "Hello", 世界: "World", default: "[EN] " },
    ja: { 你好: "こんにちは", 世界: "世界", default: "[JA] " },
    ko: { 你好: "안녕하세요", 世界: "세계", default: "[KO] " },
  };

  const handleTranslate = () => {
    if (!context.selectedText) return;
    const dict = MOCK_TRANSLATIONS[lang] ?? {};
    const translated = dict[context.selectedText] ?? `${dict.default ?? ""}${context.selectedText}`;
    const before = context.text.slice(0, context.selectionStart);
    const after = context.text.slice(context.selectionEnd);
    context.updateText(before + translated + after);
    onClose();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium text-white">翻译面板</div>
      <div className="text-xs text-gray-400">选中文字: {context.selectedText || "(未选中)"}</div>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
      >
        <option value="en">English</option>
        <option value="ja">日本語</option>
        <option value="ko">한국어</option>
      </select>
      <button
        onClick={handleTranslate}
        disabled={!context.selectedText}
        className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white text-sm transition-colors"
      >
        翻译
      </button>
    </div>
  );
};

const InsertLinkPanel: FC<PanelProps> = ({ context, onClose }) => {
  const [url, setUrl] = useState("");

  const handleInsert = () => {
    const linkText = context.selectedText || "链接";
    const markdown = `[${linkText}](${url})`;
    const before = context.text.slice(0, context.selectionStart);
    const after = context.text.slice(context.selectionEnd);
    context.updateText(before + markdown + after);
    onClose();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium text-white">插入链接</div>
      <div className="text-xs text-gray-400">
        链接文字: {context.selectedText || "(将使用 '链接')"}
      </div>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com"
        className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
      />
      <button
        onClick={handleInsert}
        disabled={!url}
        className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:text-gray-400 text-white text-sm transition-colors"
      >
        插入
      </button>
    </div>
  );
};

function makeLevel4Extensions(): Extension[] {
  return [
    ...makeLevel3Extensions(),
    {
      id: "translate",
      label: "翻译",
      toolbar: { icon: "🌐", label: "翻译", order: 10 },
      Panel: TranslatePanel,
      execute: () => {},
    },
    {
      id: "insertLink",
      label: "插入链接",
      toolbar: { icon: "🔗", label: "链接", order: 11 },
      Panel: InsertLinkPanel,
      execute: () => {},
    },
  ];
}

const LEVEL_EXTENSIONS: Record<number, () => Extension[]> = {
  1: makeLevel1Extensions,
  2: makeLevel2Extensions,
  3: makeLevel3Extensions,
  4: makeLevel4Extensions,
};

// ==================== Level Info ====================

interface LevelInfo {
  title: string;
  subtitle: string;
  description: string;
  mappings: string[];
}

const LEVEL_INFO: Record<number, LevelInfo> = {
  1: {
    title: "Command Registry",
    subtitle: "纯逻辑，无 UI",
    description:
      "Registry = Map<id, Command>，这就是所有插件系统的内核。插件注册命令和快捷键，用户通过键盘触发。没有任何按钮。",
    mappings: [
      "VSCode → CommandRegistry",
      "Excalidraw → ActionManager.executeAction",
      "Tiptap → Commands",
    ],
  },
  2: {
    title: "+ Toolbar Slot",
    subtitle: "插件声明 UI，宿主渲染",
    description:
      "插件不渲染 UI，只声明元数据（icon、label、order）。宿主调用 registry.getToolbarItems() 获取声明，自己渲染按钮。",
    mappings: [
      "VSCode → contributes.commands + contributes.menus",
      "Excalidraw → Action.icon + Action.label",
      "Tiptap → Extension.addOptions",
    ],
  },
  3: {
    title: "+ Multiple Slots",
    subtitle: "一次注册，多处渲染",
    description:
      "一个扩展可以同时声明 toolbar + statusBar + contextMenu。不是所有扩展都需要每个插槽。每个 UI 区域独立查询同一个注册表。",
    mappings: [
      "VSCode → contributes.statusBar / contributes.menus",
      "Excalidraw → canvasActions + toolbarItems",
      "语雀 → toolbar + statusBar + contextMenu",
    ],
  },
  4: {
    title: "+ Component Contributions",
    subtitle: "组件级贡献",
    description:
      "当简单数据（icon+label）描述不了 UI 时，插件提供 React 组件。宿主在按钮点击时将组件渲染为 Popover。",
    mappings: [
      "VSCode → WebView / Custom Editor",
      "Excalidraw → Action.PanelComponent",
      "Tiptap → NodeView / Extension.addNodeView",
    ],
  },
};

// ==================== Sub-components ====================

function LevelTabs({ level, onChange }: { level: number; onChange: (l: number) => void }) {
  const tabs = [
    { n: 1, label: "1 命令注册" },
    { n: 2, label: "2 工具栏" },
    { n: 3, label: "3 多插槽" },
    { n: 4, label: "4 组件" },
  ];
  return (
    <div className="flex gap-1 p-1 bg-gray-800/60 rounded-lg border border-gray-700/50">
      {tabs.map((t) => (
        <button
          key={t.n}
          onClick={() => onChange(t.n)}
          className={`px-4 py-2 text-sm rounded-md transition-all ${
            level === t.n
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
              : "text-gray-400 hover:text-white hover:bg-gray-700/50"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ConceptCard({ info }: { info: LevelInfo }) {
  return (
    <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-5">
      <div className="flex items-baseline gap-3 mb-2">
        <h3 className="text-lg font-bold text-white">{info.title}</h3>
        <span className="text-sm text-gray-400">{info.subtitle}</span>
      </div>
      <p className="text-sm text-gray-400 leading-relaxed mb-3">{info.description}</p>
      <div className="flex flex-wrap gap-2">
        {info.mappings.map((m) => (
          <span
            key={m}
            className="text-xs px-2 py-1 rounded bg-gray-700/60 text-gray-300 border border-gray-600/30"
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

function Toolbar({
  registry,
  onExecute,
  activePanel,
  onTogglePanel,
  editorContext,
  onClosePanel,
}: {
  registry: ContributionRegistry;
  onExecute: (id: string) => void;
  activePanel: string | null;
  onTogglePanel: (id: string) => void;
  editorContext: EditorContext;
  onClosePanel: () => void;
}) {
  const items = registry.getToolbarItems();
  if (items.length === 0) return null;

  return (
    <div className="relative z-50 flex items-center gap-1 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700/50">
      {items.map((ext) => {
        const hasPanel = ext.Panel != null;
        const isActive = activePanel === ext.id;
        return (
          <div key={ext.id} className="relative">
            <button
              onClick={() => (hasPanel ? onTogglePanel(ext.id) : onExecute(ext.id))}
              title={`${ext.toolbar!.label}${ext.keybinding ? ` (${ext.keybinding})` : ""}`}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              } ${ext.toolbar!.icon.length > 2 ? "text-base" : "font-bold"}`}
            >
              {ext.toolbar!.icon}
            </button>
            {isActive && ext.Panel && (
              <PanelPopover
                ext={ext}
                editorContext={editorContext}
                onClose={onClosePanel}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBar({
  registry,
  editorContext,
}: {
  registry: ContributionRegistry;
  editorContext: EditorContext;
}) {
  const items = registry.getStatusBarItems();
  if (items.length === 0) return null;

  const leftItems = items.filter((e) => e.statusBar!.position === "left");
  const rightItems = items.filter((e) => e.statusBar!.position === "right");

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-800/60 rounded-lg border border-gray-700/50 text-xs text-gray-400">
      <div className="flex items-center gap-4">
        {leftItems.map((ext) => (
          <span key={ext.id}>{ext.statusBar!.render(editorContext)}</span>
        ))}
      </div>
      <div className="flex items-center gap-4">
        {rightItems.map((ext) => (
          <span key={ext.id}>{ext.statusBar!.render(editorContext)}</span>
        ))}
      </div>
    </div>
  );
}

function ContextMenuComponent({
  registry,
  position,
  onExecute,
  onClose,
}: {
  registry: ContributionRegistry;
  position: { x: number; y: number };
  onExecute: (id: string) => void;
  onClose: () => void;
}) {
  const items = registry.getContextMenuItems();
  if (items.length === 0) return null;

  const groups = items.reduce<Record<string, Extension[]>>((acc, ext) => {
    const group = ext.contextMenu!.group;
    if (!acc[group]) acc[group] = [];
    acc[group].push(ext);
    return acc;
  }, {});

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute z-50 min-w-[160px] bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 overflow-hidden"
        style={{ left: position.x, top: position.y }}
      >
        {Object.entries(groups).map(([group, exts], gi) => (
          <div key={group}>
            {gi > 0 && <div className="border-t border-gray-700 my-1" />}
            {exts.map((ext) => (
              <button
                key={ext.id}
                onClick={() => {
                  onExecute(ext.id);
                  onClose();
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center justify-between"
              >
                <span>{ext.contextMenu!.label}</span>
                {ext.keybinding && (
                  <span className="text-xs text-gray-500 ml-4">{ext.keybinding}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function PanelPopover({
  ext,
  editorContext,
  onClose,
}: {
  ext: Extension;
  editorContext: EditorContext;
  onClose: () => void;
}) {
  if (!ext.Panel) return null;
  const PanelComp = ext.Panel;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full mt-2 z-50 rounded-xl border border-gray-600 bg-gray-800 shadow-2xl p-4 w-72">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500 font-mono">Panel: {ext.id}</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-sm"
          >
            ×
          </button>
        </div>
        <PanelComp context={editorContext} onClose={onClose} />
      </div>
    </>
  );
}

function RegistryInspector({ registry }: { registry: ContributionRegistry }) {
  const all = registry.getAll();
  return (
    <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-5">
      <h3 className="text-sm font-bold text-white mb-3">Registry 状态检视器</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {all.map((ext) => (
          <div
            key={ext.id}
            className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3 text-xs font-mono"
          >
            <div className="text-blue-400 font-bold mb-2">{ext.id}</div>
            <div className="space-y-1 text-gray-400">
              <div>
                <span className="text-gray-500">command:</span>{" "}
                {ext.keybinding ?? <span className="text-gray-600">none</span>}
              </div>
              <div>
                <span className="text-gray-500">toolbar:</span>{" "}
                {ext.toolbar ? (
                  <span className="text-green-400">
                    icon={ext.toolbar.icon} order={ext.toolbar.order}
                  </span>
                ) : (
                  <span className="text-gray-600">-</span>
                )}
              </div>
              <div>
                <span className="text-gray-500">statusBar:</span>{" "}
                {ext.statusBar ? (
                  <span className="text-green-400">{ext.statusBar.position}</span>
                ) : (
                  <span className="text-gray-600">-</span>
                )}
              </div>
              <div>
                <span className="text-gray-500">contextMenu:</span>{" "}
                {ext.contextMenu ? (
                  <span className="text-green-400">group={ext.contextMenu.group}</span>
                ) : (
                  <span className="text-gray-600">-</span>
                )}
              </div>
              <div>
                <span className="text-gray-500">Panel:</span>{" "}
                {ext.Panel ? (
                  <span className="text-green-400">FC</span>
                ) : (
                  <span className="text-gray-600">-</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== Main Component ====================

const DEFAULT_TEXT = `选中这段文字，然后试试快捷键或工具栏按钮。

Contribution Points 是所有插件系统的核心模式：
- Registry 是一个 Map，插件注册 { id, execute }
- Contribution Points 是宿主定义的 UI 插槽
- 宿主渲染，插件声明 — 插件不碰 DOM

试试选中一些文字，用 Ctrl+B 加粗，或 Ctrl+I 斜体。`;

export default function CommonDemo() {
  const [level, setLevel] = useState(1);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);

  const registry = useMemo(() => {
    const reg = new ContributionRegistry();
    const exts = LEVEL_EXTENSIONS[level]?.() ?? [];
    for (const ext of exts) {
      reg.register(ext);
    }
    return reg;
  }, [level]);

  useEffect(() => {
    setActivePanel(null);
    setContextMenu(null);
  }, [level]);

  const getEditorContext = useCallback((): EditorContext => {
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

  const handleExecute = useCallback(
    (id: string) => {
      registry.execute(id, getEditorContext());
    },
    [registry, getEditorContext],
  );

  const handleTogglePanel = useCallback((id: string) => {
    setActivePanel((prev) => (prev === id ? null : id));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const combo = [
        e.ctrlKey || e.metaKey ? "ctrl" : "",
        e.shiftKey ? "shift" : "",
        e.altKey ? "alt" : "",
        e.key.toLowerCase(),
      ]
        .filter(Boolean)
        .join("+");

      const ext = registry.findByKeybinding(combo);
      if (ext) {
        e.preventDefault();
        registry.execute(ext.id, getEditorContext());
      }
    },
    [registry, getEditorContext],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (level < 3) return;
      const items = registry.getContextMenuItems();
      if (items.length === 0) return;
      e.preventDefault();
      const rect = editorWrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setContextMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [level, registry],
  );

  const editorContext = getEditorContext();

  return (
    <div className="space-y-6">
      {/* Level Tabs */}
      <LevelTabs level={level} onChange={setLevel} />

      {/* Concept Card */}
      <ConceptCard info={LEVEL_INFO[level]} />

      {/* Toolbar (level >= 2) */}
      {level >= 2 && (
        <div className="relative">
          <div className="absolute -left-3 top-0 bottom-0 w-0.5 bg-blue-500/30 rounded" />
          <div className="text-xs text-gray-500 mb-1.5 ml-1">
            Toolbar Slot
            <span className="text-gray-600 ml-2">registry.getToolbarItems()</span>
          </div>
          <Toolbar
            registry={registry}
            onExecute={handleExecute}
            activePanel={level >= 4 ? activePanel : null}
            onTogglePanel={handleTogglePanel}
            editorContext={editorContext}
            onClosePanel={() => setActivePanel(null)}
          />
        </div>
      )}

      {/* Editor */}
      <div className="relative" ref={editorWrapRef}>
        {level < 2 && (
          <div className="text-xs text-gray-500 mb-1.5">
            Editor
            <span className="text-gray-600 ml-2">仅快捷键 (Ctrl+B / Ctrl+I)</span>
          </div>
        )}
        {level >= 3 && (
          <div className="text-xs text-gray-500 mb-1.5">
            Editor
            <span className="text-gray-600 ml-2">右键打开菜单</span>
          </div>
        )}
        {level === 2 && (
          <div className="text-xs text-gray-500 mb-1.5">
            Editor
            <span className="text-gray-600 ml-2">快捷键 + 工具栏</span>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          className="w-full h-56 bg-gray-900 border border-gray-700/60 rounded-xl p-4 text-sm text-gray-200 font-mono leading-relaxed resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          spellCheck={false}
        />

        {/* Context Menu */}
        {contextMenu && level >= 3 && (
          <ContextMenuComponent
            registry={registry}
            position={contextMenu}
            onExecute={handleExecute}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>

      {/* Status Bar (level >= 3) */}
      {level >= 3 && (
        <div>
          <div className="text-xs text-gray-500 mb-1.5">
            StatusBar Slot
            <span className="text-gray-600 ml-2">registry.getStatusBarItems()</span>
          </div>
          <StatusBar registry={registry} editorContext={editorContext} />
        </div>
      )}

      {/* Registry Inspector */}
      <RegistryInspector registry={registry} />
    </div>
  );
}
