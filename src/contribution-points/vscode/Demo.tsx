"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Workbench } from "@/contribution-points/vscode/Workbench";
import {
  ExtensionHost,
  type EditorContext,
} from "@/contribution-points/vscode/ExtensionHost";
import { DEMO_EXTENSIONS } from "@/contribution-points/vscode/demoExtensions";

const DEFAULT_TEXT = `选中这段文字，然后试试快捷键或工具栏按钮。

这个教学版只保留 VS Code 最值得学的 4 件事：
- Workbench 先读 manifest，不先跑扩展代码
- commands / menus / keybindings 是分开的声明
- onCommand 触发 Extension Host 懒激活
- status bar 走运行时 API，而不是写死在 manifest 里`;

export default function VSCodeDemo() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [editorFocus, setEditorFocus] = useState(false);
  const [, forceUpdate] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const { workbench, extensionHost } = useMemo(() => {
    const nextWorkbench = new Workbench();
    const nextExtensionHost = new ExtensionHost();

    for (const extension of DEMO_EXTENSIONS) {
      nextWorkbench.install(extension.manifest);
      nextExtensionHost.install(extension.manifest, extension.activate);
    }

    nextExtensionHost.activateEagerExtensions();

    return {
      workbench: nextWorkbench,
      extensionHost: nextExtensionHost,
    };
  }, []);

  const syncWorkbenchContext = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    workbench.setContextKey("editorFocus", editorFocus);
    workbench.setContextKey("hasSelection", ta.selectionStart !== ta.selectionEnd);
    workbench.setContextKey("readOnly", ta.readOnly);

    forceUpdate((n) => n + 1);
  }, [editorFocus, workbench]);

  useEffect(() => {
    syncWorkbenchContext();
  }, [syncWorkbenchContext]);

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
      extensionHost.executeCommand(cmd, getEditorContext());
      syncWorkbenchContext();
      forceUpdate((n) => n + 1);
    },
    [extensionHost, getEditorContext, syncWorkbenchContext]
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

      const resolved = workbench.findCommandByKeybinding(combo);
      if (resolved?.enabled) {
        e.preventDefault();
        handleExecuteCommand(resolved.command);
      }
    },
    [handleExecuteCommand, workbench]
  );

  const editorTitleItems = workbench.getMenuItems("editor/title");
  const contextMenuItems = workbench.getMenuItems("editor/context");
  const statusBarItems = extensionHost.getStatusBarItems(getEditorContext());
  const extensions = workbench.getExtensions();
  const contextSnapshot = workbench.getContextSnapshot();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
        <h3 className="text-sm font-bold text-blue-400 mb-2">
          教学目标：保留 VS Code 的架构骨架，但把复杂工程细节拿掉
        </h3>
        <div className="grid gap-2 text-xs text-gray-300 sm:grid-cols-2">
          <div className="rounded border border-blue-800/40 bg-gray-900/40 p-3">
            <div className="font-semibold text-blue-300">1. Workbench</div>
            <div className="mt-1 text-gray-400">
              只读 manifest，决定 command、menu、keybinding 是否出现。
            </div>
          </div>
          <div className="rounded border border-blue-800/40 bg-gray-900/40 p-3">
            <div className="font-semibold text-blue-300">2. Extension Host</div>
            <div className="mt-1 text-gray-400">
              用户执行命令时，再按 activationEvents 激活并注册 handler。
            </div>
          </div>
          <div className="rounded border border-blue-800/40 bg-gray-900/40 p-3">
            <div className="font-semibold text-blue-300">3. when vs enablement</div>
            <div className="mt-1 text-gray-400">
              when 决定可见，enablement 决定出现后是否禁用。
            </div>
          </div>
          <div className="rounded border border-blue-800/40 bg-gray-900/40 p-3">
            <div className="font-semibold text-blue-300">4. Runtime API</div>
            <div className="mt-1 text-gray-400">
              状态栏由 activate() 注册，刻意不塞进 manifest，方便区分静态与运行时。
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1">
          Simulated Editor Title
          <span className="text-gray-600"> workbench.getMenuItems("editor/title")</span>
        </div>
        <div className="flex items-center gap-1 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700/50">
          {editorTitleItems.map((item) => (
            <button
              key={item.command}
              onClick={() => handleExecuteCommand(item.command)}
              disabled={!item.enabled}
              title={`${item.title}${item.keybinding ? ` (${item.keybinding})` : ""}${item.when ? ` [when: ${item.when}]` : ""}${item.enablement ? ` [enablement: ${item.enablement}]` : ""}`}
              className={`px-3 py-1.5 rounded text-sm font-bold transition-all ${
                item.enabled
                  ? "text-gray-300 hover:bg-gray-700 hover:text-white"
                  : "text-gray-600 cursor-not-allowed opacity-50"
              }`}
            >
              {item.icon ?? item.title}
            </button>
          ))}
          {editorTitleItems.length === 0 && (
            <span className="text-xs text-gray-600">当前没有可见的 editor/title 菜单项</span>
          )}
        </div>
      </div>

      <div className="relative" ref={editorWrapRef}>
        <div className="text-xs text-gray-500 mb-1">
          Editor <span className="text-gray-600">右键打开 editor/context，快捷键走 keybindings</span>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onInput={syncWorkbenchContext}
          onKeyDown={handleKeyDown}
          onFocus={() => setEditorFocus(true)}
          onBlur={() => {
            setEditorFocus(false);
            setContextMenu(null);
          }}
          onSelect={syncWorkbenchContext}
          onClick={syncWorkbenchContext}
          onKeyUp={syncWorkbenchContext}
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
              className="absolute z-50 min-w-40 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {contextMenuItems.map((item) => (
                <button
                  key={item.command}
                  onClick={() => {
                    handleExecuteCommand(item.command);
                    setContextMenu(null);
                  }}
                  disabled={!item.enabled}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center justify-between ${
                    item.enabled
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

      <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4">
        <h3 className="text-sm font-bold text-white mb-3">
          Architecture Inspector
        </h3>
        <div className="mb-4 rounded-lg border border-gray-700/50 bg-gray-900/50 p-3 text-xs font-mono text-gray-300">
          <div className="text-gray-500 mb-2">context keys</div>
          <pre className="whitespace-pre-wrap wrap-break-word text-blue-300/90">
            {JSON.stringify(contextSnapshot, null, 2)}
          </pre>
        </div>
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
                    extensionHost.isActivated(ext.name)
                      ? "bg-green-900/40 text-green-400 border border-green-700/30"
                      : "bg-gray-700/40 text-gray-500 border border-gray-600/30"
                  }`}
                >
                  {extensionHost.isActivated(ext.name) ? "activated" : "inactive"}
                </span>
              </div>
              <div className="space-y-1 text-gray-400">
                <div>
                  <span className="text-gray-500">activationEvents:</span>{" "}
                  <span className="text-yellow-400/80">
                    {JSON.stringify(ext.activationEvents)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">commands:</span>{" "}
                  {ext.commandCount}
                </div>
                <div>
                  <span className="text-gray-500">editor/title menus:</span>{" "}
                  {ext.editorTitleMenuCount}
                </div>
                <div>
                  <span className="text-gray-500">editor/context menus:</span>{" "}
                  {ext.editorContextMenuCount}
                </div>
                <div>
                  <span className="text-gray-500">keybindings:</span>{" "}
                  {ext.keybindingCount}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
