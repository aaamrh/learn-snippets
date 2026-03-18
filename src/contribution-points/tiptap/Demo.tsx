"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Extension, TiptapEditor, type EditorState } from "@/contribution-points/tiptap/TiptapEditor";

// ==================== Extensions (Extension.create 工厂模式) ====================

function createExtensions(): Extension[] {
  return [
    Extension.create({
      name: "bold",
      addCommands: () => ({
        toggleBold: () => (state: EditorState) => {
          const sel = state.text.slice(state.selectionStart, state.selectionEnd);
          if (!sel) return false;
          const wrapped = `**${sel}**`;
          const before = state.text.slice(0, state.selectionStart);
          const after = state.text.slice(state.selectionEnd);
          return {
            text: before + wrapped + after,
            selectionStart: state.selectionStart + 2,
            selectionEnd: state.selectionEnd + 2,
          };
        },
      }),
      addKeyboardShortcuts: () => ({
        "ctrl+b": "toggleBold",
      }),
    }),
    Extension.create({
      name: "italic",
      addCommands: () => ({
        toggleItalic: () => (state: EditorState) => {
          const sel = state.text.slice(state.selectionStart, state.selectionEnd);
          if (!sel) return false;
          const wrapped = `*${sel}*`;
          const before = state.text.slice(0, state.selectionStart);
          const after = state.text.slice(state.selectionEnd);
          return {
            text: before + wrapped + after,
            selectionStart: state.selectionStart + 1,
            selectionEnd: state.selectionEnd + 1,
          };
        },
      }),
      addKeyboardShortcuts: () => ({
        "ctrl+i": "toggleItalic",
      }),
    }),
    Extension.create({
      name: "heading",
      addCommands: () => ({
        toggleHeading: () => (state: EditorState) => {
          const lineStart =
            state.text.lastIndexOf("\n", state.selectionStart - 1) + 1;
          const before = state.text.slice(0, lineStart);
          const after = state.text.slice(lineStart);
          return {
            text: before + "# " + after,
            selectionStart: state.selectionStart + 2,
            selectionEnd: state.selectionEnd + 2,
          };
        },
      }),
    }),
    Extension.create<Record<string, unknown>, { selectionCount: number }>({
      name: "selectionTracker",
      addStorage: () => ({ selectionCount: 0 }),
      onSelectionUpdate: (_state, storage) => {
        storage.selectionCount += 1;
      },
    }),
  ];
}

// ==================== Demo Component ====================

const DEFAULT_TEXT = `选中文字后试试链式命令和快捷键。

Tiptap 模式的核心差异：
- Extension.create() 工厂模式，静态方法构造
- chain().toggleBold().run() 链式命令
- can().chain().toggleBold().run() 提前检查
- addStorage() 扩展私有状态
- 不可变 EditorState，每次返回新状态`;

export default function TiptapDemo() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [, forceUpdate] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editor = useMemo(() => {
    return new TiptapEditor({
      extensions: createExtensions(),
      content: DEFAULT_TEXT,
      onUpdate: (state) => {
        setText(state.text);
      },
    });
  }, []);

  const syncSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    editor.updateSelection(ta.selectionStart, ta.selectionEnd);
    forceUpdate((n) => n + 1);
  }, [editor]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      editor.updateText(e.target.value);
      forceUpdate((n) => n + 1);
    },
    [editor]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const combo = [
        e.ctrlKey || e.metaKey ? "ctrl" : "",
        e.shiftKey ? "shift" : "",
        e.altKey ? "alt" : "",
        e.key.toLowerCase(),
      ]
        .filter(Boolean)
        .join("+");

      const handled = editor.handleKeyDown(combo);
      if (handled) {
        e.preventDefault();
        forceUpdate((n) => n + 1);
      }
    },
    [editor]
  );

  const handleExecuteCommand = useCallback(
    (extName: string, cmdName: string) => {
      editor.executeCommand(extName, cmdName);
      forceUpdate((n) => n + 1);
    },
    [editor]
  );

  const extensions = editor.getExtensions();
  const state = editor.state;
  const commandLog = editor.commandLog;

  // Check can() for each command button
  const canBold =
    state.selectionStart !== state.selectionEnd &&
    editor.can().chain().run !== undefined;
  const canItalic = state.selectionStart !== state.selectionEnd;

  return (
    <div className="space-y-4">
      {/* Key Concept */}
      <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
        <h3 className="text-sm font-bold text-purple-400 mb-2">
          Tiptap 模式：Extension.create() + 链式命令
        </h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          每个扩展通过{" "}
          <strong className="text-purple-300">Extension.create()</strong>{" "}
          工厂模式创建。命令可以{" "}
          <strong className="text-purple-300">链式调用</strong>：
          <code className="text-purple-300/80 text-[11px]">
            editor.chain().toggleBold().run()
          </code>
          。 用{" "}
          <strong className="text-purple-300">can()</strong>{" "}
          提前检查命令是否可执行。每次操作返回新的 EditorState（不可变）。
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-700/30">
            Extension.create(): 工厂模式
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-700/30">
            chain().run(): 链式命令
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-700/30">
            can(): 预检查
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-700/30">
            addStorage(): 扩展状态
          </span>
        </div>
      </div>

      {/* Command Bar with can() indicators */}
      <div>
        <div className="text-xs text-gray-500 mb-1">
          Command Bar{" "}
          <span className="text-gray-600">
            editor.chain().command().run() — can() 检查
          </span>
        </div>
        <div className="flex items-center gap-1 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700/50">
          {[
            {
              ext: "bold",
              cmd: "toggleBold",
              icon: "B",
              label: "加粗",
              canRun: canBold,
              shortcut: "ctrl+b",
            },
            {
              ext: "italic",
              cmd: "toggleItalic",
              icon: "I",
              label: "斜体",
              canRun: canItalic,
              shortcut: "ctrl+i",
            },
            {
              ext: "heading",
              cmd: "toggleHeading",
              icon: "H1",
              label: "标题",
              canRun: true,
              shortcut: undefined,
            },
          ].map((item) => (
            <button
              key={item.cmd}
              onClick={() => handleExecuteCommand(item.ext, item.cmd)}
              disabled={!item.canRun}
              title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ""} — can(): ${item.canRun}`}
              className={`px-3 py-1.5 rounded text-sm font-bold transition-all flex items-center gap-1.5 ${
                item.canRun
                  ? "text-gray-300 hover:bg-gray-700 hover:text-white"
                  : "text-gray-600 cursor-not-allowed opacity-50"
              }`}
            >
              {item.icon}
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  item.canRun ? "bg-green-400" : "bg-gray-600"
                }`}
                title={`can(): ${item.canRun}`}
              />
            </button>
          ))}
          <div className="ml-auto text-xs text-gray-600 font-mono">
            can() = {canBold ? "true" : "false"}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div>
        <div className="text-xs text-gray-500 mb-1">
          Editor{" "}
          <span className="text-gray-600">
            不可变 EditorState — 每次返回新对象
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onSelect={syncSelection}
          onClick={syncSelection}
          onKeyDown={handleKeyDown}
          className="w-full h-48 bg-gray-900 border border-gray-700/60 rounded-xl p-4 text-sm text-gray-200 font-mono leading-relaxed resize-none focus:outline-none focus:border-purple-500/50 transition-all"
          spellCheck={false}
        />
      </div>

      {/* Command Chain Log */}
      {commandLog.length > 0 && (
        <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400">
              Command Chain Log
            </span>
            <span className="text-xs text-gray-600">
              链式命令执行记录
            </span>
          </div>
          <div className="space-y-0.5 text-xs font-mono text-gray-500 max-h-24 overflow-y-auto">
            {commandLog.map((log, i) => (
              <div key={i}>
                <span className="text-gray-600">{i + 1}.</span>{" "}
                <span className="text-purple-400/80">{log.chain}</span>{" "}
                <span
                  className={
                    log.success ? "text-green-400/70" : "text-red-400/70"
                  }
                >
                  → {log.success ? "success" : "failed"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extension Inspector */}
      <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4">
        <h3 className="text-sm font-bold text-white mb-3">
          Extension Inspector (Tiptap Style)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {extensions.map((ext) => {
            const commands = ext.getCommandNames();
            const shortcuts = ext.getShortcuts();
            const hasStorage =
              Object.keys(ext.storage).length > 0;
            return (
              <div
                key={ext.name}
                className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3 text-xs font-mono"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-purple-400 font-bold">
                    {ext.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400/70 border border-purple-700/20">
                    Extension.create()
                  </span>
                </div>
                <div className="space-y-1 text-gray-400">
                  <div>
                    <span className="text-gray-500">addCommands:</span>{" "}
                    {commands.length > 0 ? (
                      <span className="text-green-400">
                        {commands.join(", ")}
                      </span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">
                      addKeyboardShortcuts:
                    </span>{" "}
                    {Object.keys(shortcuts).length > 0 ? (
                      <span className="text-yellow-400/80">
                        {Object.entries(shortcuts)
                          .map(([k, v]) => `${k} → ${v}`)
                          .join(", ")}
                      </span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">addStorage:</span>{" "}
                    {hasStorage ? (
                      <span className="text-blue-400">
                        {JSON.stringify(ext.storage)}
                      </span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">addOptions:</span>{" "}
                    {Object.keys(ext.options).length > 0 ? (
                      <span className="text-green-400">
                        {JSON.stringify(ext.options)}
                      </span>
                    ) : (
                      <span className="text-gray-600">{"{}"}</span>
                    )}
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
