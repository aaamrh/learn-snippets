"use client";

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
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
// 对标 Tiptap BubbleMenu 的完整 Portal 实现，零第三方依赖。
//
// 三个核心升级（vs 旧版 fixed + getBoundingClientRect）：
//
// 1. React Portal（createPortal → document.body）
//    旧版：弹窗 div 在 React 组件树里，受父级 overflow/transform/z-index 影响
//    新版：直接挂到 body，与任何父级完全隔离，层级永远干净
//
// 2. 两阶段定位（invisible render → useLayoutEffect 读尺寸 → 显示）
//    旧版：渲染前用 getBoundingClientRect 算坐标，但此时弹窗自身尺寸未知，
//          无法判断是否超出视口
//    新版：先以 opacity:0 渲染弹窗，useLayoutEffect 读取弹窗真实宽高，
//          再算坐标，浏览器绘制前完成，用户看不到闪烁
//
// 3. 视口边界翻转
//    右边界：left + popupWidth > viewport → 改为右对齐（贴右边）
//    下边界：bottom + popupHeight > viewport → 弹到按钮上方
//    这就是 Floating UI / Tippy 的核心逻辑，用 ~20 行原生代码实现
function GlobalPopup({
  anchorEl,
  onClose,
  children,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  // SSR guard：服务端没有 window/document，createPortal 只能在客户端调用。
  // 用 useState 惰性初始化（传入函数）来判断当前环境：
  //   - 服务端：typeof window === 'undefined' → false，不渲染 portal
  //   - 客户端：typeof window === 'object'    → true，正常渲染 portal
  // 优势：不需要 useEffect + setState，零额外渲染，零 linter 警告。
  // 惰性初始化函数只在组件首次挂载时执行一次，之后 useState 忽略它。
  const [mounted] = useState(() => typeof window !== "undefined");

  // 两阶段定位：
  //   阶段一：opacity:0 先渲染，此时 popupRef.current 已有真实宽高
  //   阶段二：useLayoutEffect 读取尺寸 + anchorEl 位置，计算最终坐标，切换为 opacity:1
  // useLayoutEffect 在 DOM 更新后、浏览器绘制前同步执行，用户看不到任何闪烁
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorEl || !popupRef.current) return;

    const anchor = anchorEl.getBoundingClientRect();
    const popup = popupRef.current.getBoundingClientRect();
    const GAP = 6; // 弹窗与按钮之间的间距（px）

    // ── 垂直方向：优先放在下方，放不下就翻到上方 ──
    const spaceBelow = window.innerHeight - anchor.bottom - GAP;
    const placeBelow = spaceBelow >= popup.height;
    const top = placeBelow
      ? anchor.bottom + GAP // 按钮下方
      : anchor.top - popup.height - GAP; // 按钮上方（翻转）

    // ── 水平方向：优先左对齐，超出右边界就右对齐 ──
    const MARGIN = 8; // 距离视口右边缘的最小留白
    const left = Math.min(
      anchor.left, // 左对齐
      window.innerWidth - popup.width - MARGIN, // 不超出右边界
    );

    setPos({ top, left });
  }, [anchorEl]); // anchorEl 变化说明打开了新弹窗，重新计算坐标

  // 点击弹窗外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const outside = popupRef.current && !popupRef.current.contains(target);
      const notAnchor = anchorEl && !anchorEl.contains(target);
      if (outside && notAnchor) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorEl, onClose]);

  if (!mounted) return null;

  // createPortal 第二个参数是挂载目标：document.body
  // 弹窗 DOM 会直接成为 body 的子节点，完全脱离当前组件树的 DOM 层级，
  // 但 React 事件冒泡仍然沿组件树（不是 DOM 树）传播，行为与普通子组件一致
  return createPortal(
    <div
      ref={popupRef}
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        // 两阶段：pos 未就绪时不可见（避免坐标(0,0)的闪烁），就绪后立即显示
        opacity: pos ? 1 : 0,
        // 未就绪时不参与鼠标事件，避免影响 mousedown 外部关闭逻辑
        pointerEvents: pos ? "auto" : "none",
        // 硬编码高层级，body 直接子节点一般不会有层叠上下文竞争问题
        zIndex: 9999,
      }}
      className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl"
    >
      {children}
    </div>,
    document.body,
  );
}

// ==================== 主页面 ====================
export default function PluginDemoPage() {
  const hostRef = useRef<PluginHost | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // popup state：插件传来的弹窗描述
  // anchorEl  → 决定弹窗定位在哪个按钮旁
  // renderContent → 插件自己提供的渲染函数，宿主直接调用，完全不感知里面是什么
  //
  // 与旧方案的本质区别：
  //   旧：{ type: 'emoji' | 'image-upload' }  → 宿主必须认识每种类型
  //   新：{ renderContent: (close) => ReactNode } → 宿主只负责调用，零感知
  const [popup, setPopup] = useState<{
    anchorEl: HTMLElement;
    renderContent: (close: () => void) => ReactNode;
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
  // 用 ref 存 insertAtCursor 的最新引用，避免把它列入 useEffect deps。
  // 插件持有的是一个稳定的包装函数，每次调用时通过 ref.current 拿到最新版本，
  // 即使 insertAtCursor 因 refreshExtensions 重建，插件侧也无感知，
  // 同时 useEffect（初始化插件系统）不需要把它列为依赖，不会重复初始化。
  const insertAtCursorRef = useRef<(text: string) => void>(() => {});

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    const id = ++logIdRef.current;
    setLogs((prev) => [{ id, text: `[${time}] ${msg}` }, ...prev].slice(0, 30));
  }, []);

  // ── 只拉取 toolbar（toolbar 不依赖内容，仅在插件激活/停用时重新拉取）──
  // 对标 Tiptap：toolbar 按钮列表由扩展声明，与文档内容无关，
  // 不应该在每次内容变化时重新拉取。
  // status-bar 和 panel 已改为插件主动推送（订阅模式），宿主不再主动问。
  const refreshToolbar = useCallback(async (host: PluginHost) => {
    const tbItems = await host.invokeExtension<ToolbarItem>("editor:toolbar", { context: host });
    setToolbarItems(tbItems);
  }, []);

  // ── 插入文字到光标位置 ────────────────────────────────────────
  // 注入到每个插件的 context.insertText（通过 host.injectInsertText）。
  // 插件直接调用，不经过事件中转。
  // emit('content:change') 会触发所有订阅插件自己推送最新数据，宿主不需要再主动拉取。
  const insertAtCursor = useCallback((text: string) => {
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
    // emit 即可，wordCount/lineCount/markdownPreview 插件自己订阅并推送结果
    host.emit("content:change", next);
  }, []);

  // 用 useLayoutEffect 同步 ref，确保每次 insertAtCursor 重建后 ref 立即更新，
  // 且不在渲染阶段直接写 ref（满足 React 规范：ref 只能在 effect / handler 中修改）。
  // useLayoutEffect 在 DOM 更新后、浏览器绘制前同步执行，
  // 保证插件在下一次调用 insertText 时拿到的一定是最新版本。
  useEffect(() => {
    insertAtCursorRef.current = insertAtCursor;
  }, [insertAtCursor]);

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
      // emit 即可，订阅插件自己响应，宿主不主动拉取
      host.emit("content:change", next);
    },
    [],
  );

  // ── 初始化插件系统 ────────────────────────────────────────────
  useEffect(() => {
    const host = new PluginHost();

    // editor:status-bar 和 editor:panel 已改为插件主动推送，不再需要扩展点定义。
    // 只保留 editor:toolbar：toolbar 按钮列表不随内容变化，
    // 仅在插件激活/停用时由宿主主动拉取一次。
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

      // ── 关键：在 activate 之前注入 insertText ──────────────────
      // 对标 Tiptap：Tiptap 把整个 editor 实例（含 commands）传给扩展，
      // 扩展通过 this.editor.commands.insertContent() 操作编辑器。
      // 此处注入的是一个稳定的包装函数（通过 ref 间接调用），
      // 这样即使 insertAtCursor 因 refreshExtensions 变化而重建，
      // 插件持有的函数引用依然有效，始终调用到最新版本。
      host.injectInsertText((text) => insertAtCursorRef.current(text));
      addLog("insertText 能力已注入所有插件 context");

      // shortcut 必须最先激活，因为其他插件的 addKeyboardShortcuts 需要它的 register API 就绪
      await host.activate("shortcut");
      for (const id of ALL_PLUGIN_IDS.filter((id) => id !== "shortcut")) {
        await host.activate(id);
      }
      addLog("所有插件激活完成");

      // ── 宿主监听插件推送的 UI 数据（对标 Tiptap 推送模式）──────
      // 旧方案：宿主主动调用 invokeExtension 轮询所有插件
      // 新方案：插件订阅 content:change，自己算好后 emit 结果，宿主只负责接收
      //
      // ui:status-bar:update — wordCount / lineCount 各自推送自己的数据
      // 宿主按 id 合并到 Map，再转为数组渲染，顺序固定（Map 插入顺序）
      // 不需要知道有多少个插件在推，也不需要关心推的顺序
      const statusBarMap = new Map<string, StatusBarItem>();
      host.on("ui:status-bar:update", (item: StatusBarItem & { id: string }) => {
        statusBarMap.set(item.id, { label: item.label, value: item.value });
        setStatusBarItems([...statusBarMap.values()]);
      });

      // ui:status-bar:remove — 插件停用时通知宿主删除自己的条目
      // 对应旧方案：旧方案每次 toggle 后重新拉取，结果自然准确；
      // 新方案插件主动推送，停用时必须主动告知宿主删除，否则旧数据残留在 Map 里
      host.on("ui:status-bar:remove", ({ id }: { id: string }) => {
        statusBarMap.delete(id);
        setStatusBarItems([...statusBarMap.values()]);
      });

      // ui:panel:update — markdownPreview 推送渲染后的 HTML
      // 同理，按 id 合并，支持多个面板插件共存
      const panelMap = new Map<string, Panel>();
      host.on("ui:panel:update", (panel: Panel) => {
        panelMap.set(panel.id, panel);
        setPanels([...panelMap.values()]);
      });

      // ui:panel:remove — 面板插件停用时通知宿主删除自己的面板
      host.on("ui:panel:remove", ({ id }: { id: string }) => {
        panelMap.delete(id);
        setPanels([...panelMap.values()]);
      });

      addLog("宿主已订阅 ui:status-bar:update / ui:panel:update 及对应 remove 事件");

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
      // 插件传来 { anchorEl, renderContent }，宿主只负责存起来，不感知弹窗内容
      //
      // 与旧方案的本质区别：
      //   旧：宿主收到 type，自己判断渲染哪个组件（宿主感知插件细节）
      //   新：宿主收到 renderContent 函数，直接调用即可（宿主完全不感知）
      //
      // 这意味着：新增任何弹窗型插件，这里的代码一个字都不用改
      host.on(
        "editor:open-popup",
        ({
          anchorEl,
          renderContent,
        }: {
          anchorEl: HTMLElement;
          renderContent: (close: () => void) => ReactNode;
        }) => {
          setPopup({ anchorEl, renderContent });
          addLog(`editor:open-popup → 插件提供 renderContent，宿主零感知挂载`);
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

      // toolbar 只拉一次（按钮列表不随内容变化）
      await refreshToolbar(host);

      // 触发一次内容变化事件，让所有订阅插件完成首次渲染
      // wordCount / lineCount / markdownPreview 会收到并各自推送初始数据
      host.emit("content:change", DEFAULT_CONTENT);
      addLog("首次 emit content:change → 插件各自推送初始数据");
    })();

    return () => {
      for (const id of ALL_PLUGIN_IDS) {
        host.uninstall(id);
      }
    };
  }, [addLog, refreshToolbar, wrapSelection]);

  // ── 内容变化 ──────────────────────────────────────────────────
  // emit 后插件自己响应并推送结果，宿主不再主动拉取任何扩展点
  const handleChange = useCallback((value: string) => {
    setContent(value);
    setSaveStatus("saving");
    const host = hostRef.current;
    if (!host) return;
    host.emit("content:change", value);
  }, []);

  // ── 插件开关 ──────────────────────────────────────────────────
  const togglePlugin = useCallback(
    async (pluginId: string, currentActive: boolean) => {
      const host = hostRef.current;
      if (!host) return;
      if (currentActive) {
        await host.deactivate(pluginId);
        addLog(`[${pluginId}] 停用`);
      } else {
        await host.activate(pluginId);
        addLog(`[${pluginId}] 激活`);
      }
      setPluginStates((prev) =>
        prev.map((p) => (p.id === pluginId ? { ...p, active: !currentActive } : p)),
      );
      // toolbar 按钮列表变了，重新拉取一次
      await refreshToolbar(host);
      // 重新触发一次内容变化，让刚激活的插件完成首次推送
      // （停用的插件已在 deactivate 时解绑监听，不会重复推送）
      host.emit("content:change", content);
    },
    [addLog, refreshToolbar, content],
  );

  // ── 颜色映射 ─────────────────────────────────────────────────
  // handleImageConfirm / handleEmojiSelect 已删除：
  //   旧方案：宿主写两个回调，分别感知"图片确认"和"表情选择"的业务逻辑
  //   新方案：插件在 renderContent 内部直接调用 ctx.insertText()，宿主无需参与
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
      {/*                                                              */}
      {/* 旧：宿主判断 popup.type → 渲染对应组件（宿主感知插件细节）  */}
      {/* 新：宿主调用 popup.renderContent(close) → 挂载返回值        */}
      {/*     宿主完全不知道里面是 ImageForm、EmojiGrid 还是别的东西   */}
      {/*     新增任何弹窗型插件，这里一个字都不用改 ✅               */}
      {popup && (
        <GlobalPopup anchorEl={popup.anchorEl} onClose={() => setPopup(null)}>
          {popup.renderContent(() => setPopup(null))}
        </GlobalPopup>
      )}
    </div>
  );
}
