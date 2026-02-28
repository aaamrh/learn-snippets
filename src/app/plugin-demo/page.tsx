"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { PluginHost } from "@/plugin-system/PluginHost";
import { autoSavePlugin } from "@/plugin-system/plugins/autoSave";
import { wordCountPlugin } from "@/plugin-system/plugins/wordCount";
import { lineCountPlugin } from "@/plugin-system/plugins/lineCount";
import { markdownPreviewPlugin } from "@/plugin-system/plugins/markdownPreview";
import { shortcutPlugin } from "@/plugin-system/plugins/shortcut";
import { boldPlugin } from "@/plugin-system/plugins/bold";
import { italicPlugin } from "@/plugin-system/plugins/italic";
import { imageUploadPlugin } from "@/plugin-system/plugins/imageUpload";
import { emojiPlugin } from "@/plugin-system/plugins/emoji";

// ==================== 类型 ====================
interface StatusBarItem {
  label: string;
  value: number | string;
}

interface Panel {
  id: string;
  title: string;
  html: string;
}

interface ToolbarItem {
  id: string;
  label: string;
  title: string;
  className?: string;
  onClick: (anchorEl: HTMLElement) => void;
}

interface PluginMeta {
  id: string;
  name: string;
  active: boolean;
  description: string;
  mode: "push" | "pull" | "mixed";
}

// ==================== 插件元数据 ====================
const PLUGIN_META: PluginMeta[] = [
  {
    id: "auto-save",
    name: "Auto Save",
    active: true,
    description: "监听内容变化，5s 后自动保存（推送模式）",
    mode: "push",
  },
  {
    id: "word-count",
    name: "Word Count",
    active: true,
    description: "向状态栏贡献字数（拉取模式）",
    mode: "pull",
  },
  {
    id: "line-count",
    name: "Line Count",
    active: true,
    description: "向同一状态栏扩展点贡献行数（拉取模式）",
    mode: "pull",
  },
  {
    id: "shortcut",
    name: "Shortcut",
    active: true,
    description: "全局快捷键管理（推送模式）",
    mode: "push",
  },
  {
    id: "markdown-preview",
    name: "MD Preview",
    active: true,
    description: "向面板区贡献 Markdown 渲染结果（拉取模式）",
    mode: "pull",
  },
  {
    id: "bold",
    name: "Bold",
    active: true,
    description: "向工具栏贡献加粗按钮，Ctrl+B（混合模式）",
    mode: "mixed",
  },
  {
    id: "italic",
    name: "Italic",
    active: true,
    description: "向工具栏贡献斜体按钮，Ctrl+I（混合模式）",
    mode: "mixed",
  },
  {
    id: "image-upload",
    name: "Image Upload",
    active: true,
    description: "向工具栏贡献图片按钮，点击弹窗输入 URL（混合模式）",
    mode: "mixed",
  },
  {
    id: "emoji",
    name: "Emoji",
    active: true,
    description: "向工具栏贡献表情按钮，点击弹出表情面板（混合模式）",
    mode: "mixed",
  },
];

const ALL_PLUGIN_IDS = PLUGIN_META.map((p) => p.id);

const DEFAULT_CONTENT = `# 插件系统演示

这是一个**真实运行**的插件架构演示。

## 试试看

1. 选中一段文字，点击工具栏的 **B** 或 *I* 按钮
2. 点击 🖼 插入图片，点击 😊 插入表情
3. 右上角可以单独关掉每个插件，观察效果变化
4. 底部状态栏展示了 extensionPoints 的完整调用链

> 所有功能都是插件贡献的，核心编辑器本身不知道要显示什么。
`;

// ==================== MarkdownPanel ====================
function MarkdownPanel({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html;
  }, [html]);
  return (
    <div
      ref={ref}
      className="flex-1 overflow-auto p-4 text-sm leading-relaxed prose prose-invert prose-sm max-w-none"
    />
  );
}

// ==================== GlobalPopup ====================
// 唯一的弹窗容器，负责定位 + 点击外部关闭。
// 内容（children）由调用方决定，GlobalPopup 本身不关心里面渲染什么。
//
// 这就是业界方案的核心：
//   宿主只维护一套定位 + 关闭逻辑
//   每个插件只需关心"我的弹窗内容长什么样"
function GlobalPopup({
  anchorEl,
  onClose,
  children,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 点击弹窗外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedOutsidePopup = ref.current && !ref.current.contains(target);
      const clickedOutsideAnchor = anchorEl && !anchorEl.contains(target);
      if (clickedOutsidePopup && clickedOutsideAnchor) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorEl, onClose]);

  // 根据 anchorEl 计算弹窗位置，始终贴在按钮正下方
  const rect = anchorEl?.getBoundingClientRect();
  const style: React.CSSProperties = rect
    ? { position: "fixed", top: rect.bottom + 6, left: rect.left }
    : { position: "fixed", top: 0, left: 0 };

  return (
    <div
      ref={ref}
      style={style}
      className="z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl"
    >
      {children}
    </div>
  );
}

// ==================== ImageForm（纯内容，不管定位）====================
// 只负责渲染图片输入表单，onConfirm / onClose 由宿主传入
function ImageForm({
  onConfirm,
  onClose,
}: {
  onConfirm: (url: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="p-4 w-80">
      <div className="text-xs text-zinc-400 mb-2 font-bold">🖼 插入图片</div>
      <input
        ref={inputRef}
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && url.trim()) onConfirm(url);
          if (e.key === "Escape") onClose();
        }}
        placeholder="输入图片 URL，如 https://..."
        className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-blue-500 mb-3"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => onConfirm(url)}
          disabled={!url.trim()}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-40 transition-colors"
        >
          插入
        </button>
      </div>
    </div>
  );
}

// ==================== EmojiGrid（纯内容，不管定位）====================
// 只负责渲染表情网格，onSelect / onClose 由宿主传入
const EMOJI_LIST = [
  "😀",
  "😂",
  "😍",
  "🤔",
  "😎",
  "🥳",
  "😭",
  "🤩",
  "👍",
  "👎",
  "👏",
  "🙏",
  "💪",
  "🤝",
  "✌️",
  "🤞",
  "❤️",
  "💔",
  "💯",
  "🔥",
  "⭐",
  "✨",
  "🎉",
  "🎊",
  "🐶",
  "🐱",
  "🐭",
  "🐻",
  "🦊",
  "🐼",
  "🐨",
  "🦁",
  "🍎",
  "🍊",
  "🍋",
  "🍇",
  "🍓",
  "🍕",
  "🍔",
  "🍜",
  "⚽",
  "🏀",
  "🎮",
  "🎵",
  "🎸",
  "📷",
  "💻",
  "📱",
];

function EmojiGrid({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="p-3 w-72">
      <div className="text-xs text-zinc-400 mb-2 font-bold">😊 选择表情</div>
      <div className="grid grid-cols-8 gap-1">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="text-xl hover:bg-zinc-700 rounded p-0.5 transition-colors leading-none"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ==================== 主页面 ====================
export default function PluginDemoPage() {
  const hostRef = useRef<PluginHost | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // popup state：type 决定渲染哪个内容组件，anchorEl 决定弹窗位置
  // 这是 GlobalPopup 方案的核心：宿主只存这两个字段，不需要感知每个插件的弹窗细节
  const [popup, setPopup] = useState<{
    type: "image-upload" | "emoji";
    anchorEl: HTMLElement;
  } | null>(null);

  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [statusBarItems, setStatusBarItems] = useState<StatusBarItem[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [toolbarItems, setToolbarItems] = useState<ToolbarItem[]>([]);
  const [pluginStates, setPluginStates] = useState<PluginMeta[]>(PLUGIN_META);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [saveTime, setSaveTime] = useState("");
  const [logs, setLogs] = useState<{ id: number; text: string }[]>([]);

  const logIdRef = useRef(0);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    const id = ++logIdRef.current;
    setLogs((prev) => [{ id, text: `[${time}] ${msg}` }, ...prev].slice(0, 30));
  }, []);

  // ── 拉取所有扩展点数据 ────────────────────────────────────────
  const refreshExtensions = useCallback(async (host: PluginHost, text: string) => {
    const [items, panelList, tbItems] = await Promise.all([
      host.invokeExtension<StatusBarItem>("editor:status-bar", { content: text }),
      host.invokeExtension<Panel>("editor:panel", { content: text }),
      host.invokeExtension<ToolbarItem>("editor:toolbar", { context: host }),
    ]);
    setStatusBarItems(items);
    setPanels(panelList);
    setToolbarItems(tbItems);
  }, []);

  // ── 插入文字到光标位置 ────────────────────────────────────────
  const insertAtCursor = useCallback(
    (text: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const next = ta.value.slice(0, start) + text + ta.value.slice(end);
      setContent(next);
      requestAnimationFrame(() => {
        ta.selectionStart = start + text.length;
        ta.selectionEnd = start + text.length;
        ta.focus();
      });
      const host = hostRef.current;
      if (!host) return;
      host.emit("content:change", next);
      refreshExtensions(host, next);
    },
    [refreshExtensions],
  );

  // ── 包裹选区（加粗 / 斜体）────────────────────────────────────
  const wrapSelection = useCallback(
    ({ prefix, suffix, placeholder }: { prefix: string; suffix: string; placeholder: string }) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const selected = ta.value.slice(start, end) || placeholder;
      const wrapped = `${prefix}${selected}${suffix}`;
      const next = ta.value.slice(0, start) + wrapped + ta.value.slice(end);
      setContent(next);
      requestAnimationFrame(() => {
        ta.selectionStart = start + prefix.length;
        ta.selectionEnd = start + prefix.length + selected.length;
        ta.focus();
      });
      const host = hostRef.current;
      if (!host) return;
      host.emit("content:change", next);
      refreshExtensions(host, next);
    },
    [refreshExtensions],
  );

  // ── 初始化插件系统 ────────────────────────────────────────────
  useEffect(() => {
    const host = new PluginHost();

    host.defineExtensionPoint("editor:status-bar");
    host.defineExtensionPoint("editor:panel");
    host.defineExtensionPoint("editor:toolbar");

    (async () => {
      // 注册（有依赖的后注册）
      for (const plugin of [
        autoSavePlugin,
        wordCountPlugin,
        lineCountPlugin,
        shortcutPlugin,
        markdownPreviewPlugin,
        boldPlugin,
        italicPlugin,
        imageUploadPlugin,
        emojiPlugin,
      ]) {
        await host.register(plugin);
      }
      addLog("所有插件注册完成");

      // shortcut 必须最先激活，因为其他插件的 addKeyboardShortcuts 需要它的 register API 就绪
      await host.activate("shortcut");
      for (const id of ALL_PLUGIN_IDS.filter((id) => id !== "shortcut")) {
        await host.activate(id);
      }
      addLog("所有插件激活完成");

      // 监听 autoSave 保存成功事件
      host.on("save:success", ({ timestamp }: { timestamp: number }) => {
        const time = new Date(timestamp).toLocaleTimeString();
        setSaveStatus("saved");
        setSaveTime(time);
        addLog("autoSave 触发保存 → localStorage['draft'] 已更新");
        setTimeout(() => setSaveStatus("idle"), 3000);
      });

      // 监听插件发出的"包裹选区"事件
      host.on(
        "editor:wrap-selection",
        (payload: { prefix: string; suffix: string; placeholder: string }) => {
          wrapSelection(payload);
          addLog(`editor:wrap-selection → prefix="${payload.prefix}" suffix="${payload.suffix}"`);
        },
      );

      // 监听插件发出的"打开弹窗"事件
      // 插件传来 { type, anchorEl }，宿主存起来，GlobalPopup 负责定位和渲染
      host.on(
        "editor:open-popup",
        ({ type, anchorEl }: { type: "image-upload" | "emoji"; anchorEl: HTMLElement }) => {
          setPopup({ type, anchorEl });
          addLog(`editor:open-popup → type="${type}"（GlobalPopup 接管定位）`);
        },
      );

      // Ctrl+S 是宿主级快捷键（不属于任何插件），直接注册到 shortcut 插件
      // 插件级快捷键（Ctrl+B / Ctrl+I）已由 PluginHost.activate 统一收集注册，无需在此处理
      const register = host.getContext("shortcut")?.state.get("register") as
        | ((key: string, fn: () => void) => void)
        | undefined;
      if (register) {
        register("Ctrl+S", () => {
          const draft = textareaRef.current?.value ?? "";
          localStorage.setItem("draft", draft);
          addLog("Ctrl+S 手动保存（宿主级快捷键，直接注册）");
          setSaveStatus("saved");
          setSaveTime(new Date().toLocaleTimeString());
          setTimeout(() => setSaveStatus("idle"), 3000);
        });
      }

      hostRef.current = host;
      await refreshExtensions(host, DEFAULT_CONTENT);
    })();

    return () => {
      for (const id of ALL_PLUGIN_IDS) {
        host.uninstall(id);
      }
    };
  }, [addLog, refreshExtensions, wrapSelection]);

  // ── 内容变化 ──────────────────────────────────────────────────
  const handleChange = useCallback(
    async (value: string) => {
      setContent(value);
      setSaveStatus("saving");
      const host = hostRef.current;
      if (!host) return;
      host.emit("content:change", value);
      await refreshExtensions(host, value);
    },
    [refreshExtensions],
  );

  // ── 插件开关 ──────────────────────────────────────────────────
  const togglePlugin = useCallback(
    async (pluginId: string, currentActive: boolean) => {
      const host = hostRef.current;
      if (!host) return;
      if (currentActive) {
        await host.deactivate(pluginId);
        addLog(`[${pluginId}] 停用 → 从 extensionPoints 花名册摘除`);
      } else {
        await host.activate(pluginId);
        addLog(`[${pluginId}] 激活 → 重新挂回 extensionPoints 花名册`);
      }
      setPluginStates((prev) =>
        prev.map((p) => (p.id === pluginId ? { ...p, active: !currentActive } : p)),
      );
      await refreshExtensions(host, content);
    },
    [addLog, refreshExtensions, content],
  );

  // ── 弹窗确认处理 ─────────────────────────────────────────────
  const handleImageConfirm = useCallback(
    (url: string) => {
      if (!url.trim()) return;
      insertAtCursor(`![图片](${url})`);
      addLog(`imageUpload → 插入 ![图片](${url.slice(0, 30)}...)`);
      setPopup(null);
    },
    [insertAtCursor, addLog],
  );

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      insertAtCursor(emoji);
      addLog(`emoji → 插入 ${emoji}`);
    },
    [insertAtCursor, addLog],
  );

  // ── 颜色映射 ─────────────────────────────────────────────────
  const statusBarColors: Record<string, string> = {
    字数: "text-blue-400 border-blue-700 bg-blue-950",
    行数: "text-purple-400 border-purple-700 bg-purple-950",
  };

  const modeBadge: Record<PluginMeta["mode"], string> = {
    pull: "bg-blue-900/40 border-blue-700 text-blue-300",
    push: "bg-green-900/40 border-green-700 text-green-300",
    mixed: "bg-amber-900/40 border-amber-700 text-amber-300",
  };
  const modeDot: Record<PluginMeta["mode"], string> = {
    pull: "bg-blue-400",
    push: "bg-green-400",
    mixed: "bg-amber-400",
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 font-mono overflow-hidden">
      {/* ── 顶部标题栏 + 插件开关 ── */}
      <header className="px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white">Plugin System Demo</span>
            <span className="text-xs text-zinc-500">— 插件架构可视化演示</span>
          </div>
        </div>

        {/* 插件开关列表 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {pluginStates.map((plugin) => (
            <button
              key={plugin.id}
              type="button"
              onClick={() => togglePlugin(plugin.id, plugin.active)}
              title={plugin.description}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border transition-all ${
                plugin.active ? modeBadge[plugin.mode] : "bg-zinc-800 border-zinc-700 text-zinc-500"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${plugin.active ? modeDot[plugin.mode] : "bg-zinc-600"}`}
              />
              {plugin.name}
              {/*<span className="text-[10px] opacity-60">{modeLabel[plugin.mode]}</span>*/}
            </button>
          ))}
          <span className="text-[10px] text-zinc-600 ml-1">🔵拉取 &nbsp; 🟢推送 &nbsp; 🟡混合</span>
        </div>
      </header>

      {/* ── 主体区域 ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：工具栏 + 编辑区 */}
        <div className="flex flex-col w-1/2 border-r border-zinc-800">
          {/* 工具栏（invokeExtension('editor:toolbar') 贡献） */}
          <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {toolbarItems.length > 0 ? (
                toolbarItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    id={`toolbar-btn-${item.id}`}
                    title={item.title}
                    onClick={(e) => {
                      item.onClick(e.currentTarget);
                    }}
                    className={`px-2.5 py-1 rounded text-sm border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 hover:border-zinc-500 text-zinc-200 transition-all ${item.className ?? ""}`}
                  >
                    {item.label}
                  </button>
                ))
              ) : (
                <span className="text-xs text-zinc-600">工具栏插件全部停用</span>
              )}
              {toolbarItems.length > 0 && (
                <span className="text-[10px] text-zinc-600 ml-2">
                  ← invokeExtension('editor:toolbar') 贡献
                </span>
              )}
            </div>

            {/* 字数/行数徽章 */}
            <div className="flex items-center gap-1.5">
              {statusBarItems.length > 0 ? (
                <>
                  {statusBarItems.map((item) => (
                    <span
                      key={item.label}
                      className={`flex items-center gap-1 border rounded px-2 py-0.5 text-xs font-bold ${
                        statusBarColors[item.label] ?? "text-zinc-300 border-zinc-600 bg-zinc-800"
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                      {item.label} {item.value}
                    </span>
                  ))}
                </>
              ) : (
                <span className="text-xs text-zinc-600">统计插件已停用</span>
              )}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            className="flex-1 bg-zinc-950 text-zinc-200 p-4 resize-none outline-none text-sm leading-relaxed font-mono"
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="在这里输入 Markdown..."
            spellCheck={false}
          />
        </div>

        {/* 右侧：Markdown 预览 + 日志 */}
        <div className="flex flex-col w-1/2 overflow-hidden">
          {/* Markdown 预览面板 */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {panels.length > 0 ? (
              panels.map((panel) => (
                <div key={panel.id} className="flex flex-col flex-1 overflow-hidden">
                  <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-blue-400 shrink-0 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    {panel.title}
                    <span className="text-zinc-600 ml-auto text-[10px]">
                      markdownPreviewPlugin → invokeExtension('editor:panel')
                    </span>
                  </div>
                  <MarkdownPanel html={panel.html} />
                </div>
              ))
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
                <div className="text-center">
                  <div className="text-3xl mb-2">🔌</div>
                  <div>markdownPreview 插件已停用</div>
                  <div className="text-xs mt-1 text-zinc-700">右上角开关重新启用</div>
                </div>
              </div>
            )}
          </div>

          {/* 运行日志 */}
          <div className="h-44 border-t border-zinc-800 bg-zinc-900 flex flex-col shrink-0">
            <div className="px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-800 shrink-0 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              运行日志
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-0.5">
              {logs.length === 0 ? (
                <div className="text-zinc-600 text-xs px-1">等待操作...</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="text-xs text-zinc-400 leading-5">
                    {log.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 底部状态栏 ── */}
      <footer className="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-t border-zinc-800 text-[10px] shrink-0">
        <div className="flex items-center gap-1.5 text-zinc-600">
          <span>invokeExtension('editor:status-bar')</span>
          <span className="text-zinc-700">→ [</span>
          {statusBarItems.find((i) => i.label === "字数") ? (
            <span className="text-blue-400">
              wordCount: {statusBarItems.find((i) => i.label === "字数")?.value}
            </span>
          ) : (
            <span className="text-zinc-700">wordCount: 停用</span>
          )}
          <span className="text-zinc-700">,</span>
          {statusBarItems.find((i) => i.label === "行数") ? (
            <span className="text-purple-400">
              lineCount: {statusBarItems.find((i) => i.label === "行数")?.value}
            </span>
          ) : (
            <span className="text-zinc-700">lineCount: 停用</span>
          )}
          <span className="text-zinc-700">]</span>
        </div>

        <div className="flex items-center gap-3 text-zinc-500">
          <span className="text-zinc-700">autoSavePlugin → emit('save:success')</span>
          {saveStatus === "saving" && (
            <span className="text-yellow-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
              等待保存...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-green-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              已保存 {saveTime}
            </span>
          )}
          {saveStatus === "idle" && (
            <span className="text-zinc-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              Ctrl+S 手动保存
            </span>
          )}
        </div>
      </footer>

      {/* ── GlobalPopup：唯一弹窗容器，定位逻辑只写一次 ── */}
      {/* 宿主只关心 anchorEl（在哪）和 type（显示什么），不感知各插件弹窗细节 */}
      {popup && (
        <GlobalPopup anchorEl={popup.anchorEl} onClose={() => setPopup(null)}>
          {popup.type === "image-upload" && (
            <ImageForm onConfirm={handleImageConfirm} onClose={() => setPopup(null)} />
          )}
          {popup.type === "emoji" && (
            <EmojiGrid onSelect={handleEmojiSelect} onClose={() => setPopup(null)} />
          )}
        </GlobalPopup>
      )}
    </div>
  );
}
