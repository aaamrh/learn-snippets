"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  ExtensionHost,
  type ExtensionManifest,
  type ActivateFn,
  type EditorContext,
} from "@/contribution-points/vscode/ExtensionHost";

// ==================== Manifests + Activate (分离式声明) ====================

const EXTENSIONS: Array<{ manifest: ExtensionManifest; activate: ActivateFn }> = [
  {
    manifest: {
      name: "bold",
      displayName: "Bold",
      activationEvents: ["onCommand:bold"],
      contributes: {
        commands: [
          { command: "bold", title: "加粗", icon: "B", keybinding: "ctrl+b" },
        ],
        menus: {
          "editor/toolbar": [
            { command: "bold", when: "hasSelection", order: 1 },
          ],
          "editor/context": [
            { command: "bold", when: "hasSelection", group: "format" },
          ],
        },
      },
    },
    activate: (api) => {
      api.registerCommand("bold", (ctx) => {
        if (!ctx.selectedText) return;
        const wrapped = `**${ctx.selectedText}**`;
        const before = ctx.text.slice(0, ctx.selectionStart);
        const after = ctx.text.slice(ctx.selectionEnd);
        ctx.updateText(
          before + wrapped + after,
          ctx.selectionStart + 2,
          ctx.selectionEnd + 2
        );
      });
    },
  },
  {
    manifest: {
      name: "italic",
      displayName: "Italic",
      activationEvents: ["onCommand:italic"],
      contributes: {
        commands: [
          { command: "italic", title: "斜体", icon: "I", keybinding: "ctrl+i" },
        ],
        menus: {
          "editor/toolbar": [
            { command: "italic", when: "hasSelection", order: 2 },
          ],
          "editor/context": [
            { command: "italic", when: "hasSelection", group: "format" },
          ],
        },
      },
    },
    activate: (api) => {
      api.registerCommand("italic", (ctx) => {
        if (!ctx.selectedText) return;
        const wrapped = `*${ctx.selectedText}*`;
        const before = ctx.text.slice(0, ctx.selectionStart);
        const after = ctx.text.slice(ctx.selectionEnd);
        ctx.updateText(
          before + wrapped + after,
          ctx.selectionStart + 1,
          ctx.selectionEnd + 1
        );
      });
    },
  },
  {
    manifest: {
      name: "heading",
      displayName: "Heading",
      activationEvents: ["onCommand:heading"],
      contributes: {
        commands: [{ command: "heading", title: "标题", icon: "H1" }],
        menus: {
          "editor/toolbar": [{ command: "heading", order: 3 }],
          "editor/context": [{ command: "heading", group: "format" }],
        },
      },
    },
    activate: (api) => {
      api.registerCommand("heading", (ctx) => {
        const lineStart =
          ctx.text.lastIndexOf("\n", ctx.selectionStart - 1) + 1;
        const before = ctx.text.slice(0, lineStart);
        const after = ctx.text.slice(lineStart);
        ctx.updateText(before + "# " + after);
      });
    },
  },
  {
    manifest: {
      name: "word-count",
      displayName: "Word Count",
      activationEvents: ["*"],
      contributes: {
        commands: [],
        statusBar: [{ id: "wordCount", alignment: "left" }],
      },
    },
    activate: (api) => {
      api.registerStatusBarProvider("wordCount", (ctx) => {
        const count = ctx.text.replace(/\s/g, "").length;
        return `字数: ${count}`;
      });
    },
  },
];

// ==================== Demo Component ====================

const DEFAULT_TEXT = `选中这段文字，然后试试快捷键或工具栏按钮。

VSCode 模式的核心差异：
- Manifest（纯 JSON）与 Activate（运行时代码）分离
- activationEvents 控制懒加载时机
- when 子句控制 UI 可见性
- 命令可以在不执行代码的情况下被声明和展示`;

export default function VSCodeDemo() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [, forceUpdate] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const host = useMemo(() => {
    const h = new ExtensionHost();
    for (const { manifest, activate } of EXTENSIONS) {
      h.install(manifest, activate);
    }
    // Eagerly activate word-count (activationEvent: "*")
    h.activate("word-count");
    return h;
  }, []);

  // Update context key based on selection
  const updateContextKeys = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const hasSelection = ta.selectionStart !== ta.selectionEnd;
    host.setContextKey("hasSelection", hasSelection);
    forceUpdate((n) => n + 1);
  }, [host]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handler = () => updateContextKeys();
    ta.addEventListener("select", handler);
    ta.addEventListener("click", handler);
    ta.addEventListener("keyup", handler);
    return () => {
      ta.removeEventListener("select", handler);
      ta.removeEventListener("click", handler);
      ta.removeEventListener("keyup", handler);
    };
  }, [updateContextKeys]);

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

  const handleExecuteCommand = useCallback(
    (cmd: string) => {
      host.executeCommand(cmd, getEditorContext());
      forceUpdate((n) => n + 1);
    },
    [host, getEditorContext]
  );

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

      const cmd = host.findByKeybinding(combo);
      if (cmd) {
        e.preventDefault();
        handleExecuteCommand(cmd);
      }
    },
    [host, handleExecuteCommand]
  );

  const toolbarItems = host.getToolbarItems();
  const contextMenuItems = host.getContextMenuItems();
  const statusBarItems = host.getStatusBarItems(getEditorContext());
  const extensions = host.getExtensions();

  return (
    <div className="space-y-4">
      {/* Key Concept */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
        <h3 className="text-sm font-bold text-blue-400 mb-2">
          VSCode 模式：Manifest + Activation 分离
        </h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          扩展分为两部分：
          <strong className="text-blue-300">Manifest</strong>（纯 JSON，声明
          commands、menus、activationEvents） 和{" "}
          <strong className="text-blue-300">Activate</strong>
          （运行时函数，注册命令处理器）。 宿主可以在不执行代码的情况下读取
          Manifest → 实现懒加载、Marketplace 展示。
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/30">
            activationEvents: 懒加载
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/30">
            when clause: 条件可见
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/30">
            Manifest/Activate 分离
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div>
        <div className="text-xs text-gray-500 mb-1">
          Toolbar{" "}
          <span className="text-gray-600">
            host.getToolbarItems() + when 子句
          </span>
        </div>
        <div className="flex items-center gap-1 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700/50">
          {toolbarItems.map((item) => (
            <button
              key={item.command}
              onClick={() => handleExecuteCommand(item.command)}
              disabled={!item.visible}
              title={`${item.title}${item.keybinding ? ` (${item.keybinding})` : ""}${item.when ? ` [when: ${item.when}]` : ""}`}
              className={`px-3 py-1.5 rounded text-sm font-bold transition-all ${
                item.visible
                  ? "text-gray-300 hover:bg-gray-700 hover:text-white"
                  : "text-gray-600 cursor-not-allowed opacity-50"
              }`}
            >
              {item.icon ?? item.title}
              {!item.visible && (
                <span className="ml-1 text-xs font-normal text-gray-600">
                  (hidden)
                </span>
              )}
            </button>
          ))}
          {toolbarItems.length === 0 && (
            <span className="text-xs text-gray-600">无工具栏项</span>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="relative" ref={editorWrapRef}>
        <div className="text-xs text-gray-500 mb-1">
          Editor <span className="text-gray-600">右键打开菜单</span>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
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
          className="w-full h-48 bg-gray-900 border border-gray-700/60 rounded-xl p-4 text-sm text-gray-200 font-mono leading-relaxed resize-none focus:outline-none focus:border-blue-500/50 transition-all"
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
                  key={item.command}
                  onClick={() => {
                    handleExecuteCommand(item.command);
                    setContextMenu(null);
                  }}
                  disabled={!item.visible}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center justify-between ${
                    item.visible
                      ? "text-gray-300 hover:bg-gray-700 hover:text-white"
                      : "text-gray-600 cursor-not-allowed"
                  }`}
                >
                  <span>{item.title}</span>
                  {item.keybinding && (
                    <span className="text-xs text-gray-500 ml-4">
                      {item.keybinding}
                    </span>
                  )}
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
              .filter((i) => i.alignment === "left")
              .map((i) => (
                <span key={i.id}>{i.text}</span>
              ))}
          </div>
          <div className="flex items-center gap-4">
            {statusBarItems
              .filter((i) => i.alignment === "right")
              .map((i) => (
                <span key={i.id}>{i.text}</span>
              ))}
          </div>
        </div>
      )}

      {/* Extension Inspector */}
      <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4">
        <h3 className="text-sm font-bold text-white mb-3">
          Extension Inspector (VSCode Style)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {extensions.map((ext) => (
            <div
              key={ext.name}
              className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3 text-xs font-mono"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-blue-400 font-bold">
                  {ext.displayName}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    ext.activated
                      ? "bg-green-900/40 text-green-400 border border-green-700/30"
                      : "bg-gray-700/40 text-gray-500 border border-gray-600/30"
                  }`}
                >
                  {ext.activated ? "activated" : "inactive"}
                </span>
              </div>
              <div className="space-y-1 text-gray-400">
                <div>
                  <span className="text-gray-500">activationEvents:</span>{" "}
                  <span className="text-yellow-400/80">
                    {JSON.stringify(ext.manifest.activationEvents)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">commands:</span>{" "}
                  {(ext.manifest.contributes.commands ?? [])
                    .map((c) => c.command)
                    .join(", ") || "-"}
                </div>
                <div>
                  <span className="text-gray-500">toolbar menus:</span>{" "}
                  {
                    (ext.manifest.contributes.menus?.["editor/toolbar"] ?? [])
                      .length
                  }{" "}
                  items
                </div>
                <div>
                  <span className="text-gray-500">context menus:</span>{" "}
                  {
                    (ext.manifest.contributes.menus?.["editor/context"] ?? [])
                      .length
                  }{" "}
                  items
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
