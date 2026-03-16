import { useEffect, useRef, useState } from "react";
import type { NewPluginHost } from "@/plugin-system/NewPluginHost";
import type { GenericPopupData, PopupData, PopupRendererProps } from "../../types";

// ==================== EditorToolbar 编辑器工具栏 ====================

export function EditorToolbar({
  host,
  onExecuteCommand,
  onEditorAction,
  onPopupAction,
  popupData,
  onPopupClose,
}: {
  host: NewPluginHost | null;
  onExecuteCommand: (commandId: string) => void;
  onEditorAction: (action: "bold" | "italic") => void;
  onPopupAction: (commandId: string, ...args: unknown[]) => void;
  popupData: PopupData | null;
  onPopupClose: () => void;
}) {
  // 按钮 ref map — 用于锚定弹窗位置
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // 触发按钮 ID 直接从 popupData.triggerCommand 读取
  // 对标 VS Code：宿主不再写死 type → commandId 的映射
  const popupTrigger = popupData?.triggerCommand ?? null;

  // 点击外部关闭弹窗
  useEffect(() => {
    if (!popupData) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (popupTrigger) {
        const btn = buttonRefs.current.get(popupTrigger);
        if (btn?.contains(target)) return;
      }
      onPopupClose();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onPopupClose();
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [popupData, popupTrigger, onPopupClose]);

  // 宿主内置按钮（不依赖插件）
  const builtinButtons: Array<{
    id: string;
    icon: string;
    title: string;
    action: () => void;
    shortcut?: string;
  }> = [
    {
      id: "bold",
      icon: "𝐁",
      title: "加粗",
      action: () => onEditorAction("bold"),
      shortcut: "Ctrl+B",
    },
    {
      id: "italic",
      icon: "𝐼",
      title: "斜体",
      action: () => onEditorAction("italic"),
      shortcut: "Ctrl+I",
    },
  ];

  // 插件按钮：从 ContributionManager 读取 editor/title 菜单贡献
  // 对标 VS Code menus["editor/title"]：宿主不感知具体插件，只渲染命令元数据
  const editorTitleMenus = host
    ? (host.contributions.getVisibleMenusByGroup().get("editor/title") ?? [])
    : [];

  const handlePluginButtonClick = (commandId: string) => {
    // 如果该弹窗已打开 → toggle 关闭
    if (popupTrigger === commandId && popupData) {
      onPopupClose();
      return;
    }
    // 在执行命令前，计算按钮位置并存入 state（供弹窗定位）
    const btn = buttonRefs.current.get(commandId);
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    }
    onExecuteCommand(commandId);
  };

  return (
    <div className="relative flex items-center gap-1 px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0">
      <span className="text-[10px] text-gray-600 mr-2 select-none">工具栏</span>

      {/* 宿主内置按钮 */}
      {builtinButtons.map((btn) => (
        <button
          type="button"
          key={btn.id}
          onClick={btn.action}
          title={`${btn.title}${btn.shortcut ? ` (${btn.shortcut})` : ""}`}
          className="w-8 h-8 flex items-center justify-center rounded-md text-sm font-semibold text-gray-400 hover:bg-gray-700 hover:text-white active:bg-gray-600 cursor-pointer transition-all duration-150"
        >
          {btn.icon}
        </button>
      ))}

      <div className="w-px h-5 bg-gray-800 mx-1" />

      {/* 插件按钮 — 由 editor/title 菜单贡献点驱动，宿主不写死任何插件 ID */}
      {editorTitleMenus.map((menu) => {
        const cmd = host?.contributions.getCommand(menu.command);
        const icon = cmd?.contribution.icon ?? "🔌";
        const title = cmd?.contribution.title ?? menu.command;
        const isPopupOpen = popupTrigger === menu.command && popupData != null;

        return (
          <button
            type="button"
            key={menu.command}
            ref={(el) => {
              if (el) buttonRefs.current.set(menu.command, el);
            }}
            onClick={() => handlePluginButtonClick(menu.command)}
            disabled={!host}
            title={title}
            className={`
              w-8 h-8 flex items-center justify-center rounded-md text-base
              transition-all duration-150
              ${isPopupOpen ? "bg-gray-700 ring-1 ring-blue-500/40" : ""}
              ${
                host
                  ? "hover:bg-gray-700 active:bg-gray-600 cursor-pointer"
                  : "opacity-30 cursor-not-allowed"
              }
            `}
          >
            {icon}
          </button>
        );
      })}

      <div className="w-px h-5 bg-gray-800 mx-1" />

      <div className="flex items-center gap-1 text-[10px] text-gray-600 ml-1">
        <span>🌐</span>
        <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-500 font-mono border border-gray-700 text-[9px]">
          Ctrl+Shift+T
        </kbd>
        <span>翻译</span>
      </div>

      {/* ── 锚定弹窗（popover）— 通过注册表查找渲染器，宿主不感知具体弹窗类型 ── */}
      {popupData &&
        popoverPos &&
        (() => {
          const Renderer = popupRendererRegistry.get(popupData.type);
          if (!Renderer) return null;
          return (
            <div
              ref={popoverRef}
              className="fixed z-[9999] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden animate-[fadeInUp_150ms_ease]"
              style={{ top: popoverPos.top, left: popoverPos.left }}
            >
              <Renderer
                data={popupData}
                onAction={(commandId: string, ...args: unknown[]) =>
                  onPopupAction(commandId, ...args)
                }
                onClose={onPopupClose}
              />
            </div>
          );
        })()}
    </div>
  );
}

// ==================== EmojiPopup 表情面板 ====================
//
// 遵循统一的 PopupRendererProps 接口。
// 宿主通过 popupRendererRegistry 查表调用，不需要 import 此组件。
// 内部通过类型断言访问 emoji-picker 专有字段。

function EmojiPopup({ data, onAction, onClose }: PopupRendererProps) {
  // 类型断言：此组件只会在 type === "emoji-picker" 时被调用
  const d = data as GenericPopupData & {
    title: string;
    groups: Array<{ label: string; icon: string; emojis: string[] }>;
    allEmojis: string[];
    onSelectCommand: string;
  };

  const [activeGroup, setActiveGroup] = useState(0);
  const [search, setSearch] = useState("");

  const displayEmojis = search
    ? d.allEmojis.filter(() => true)
    : (d.groups[activeGroup]?.emojis ?? []);

  return (
    <div className="w-80">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
        <span className="text-sm font-semibold text-white">{d.title}</span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors text-xs"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-800/50">
        {d.groups.map((group, index) => (
          <button
            type="button"
            key={group.label}
            onClick={() => {
              setActiveGroup(index);
              setSearch("");
            }}
            title={group.label}
            className={`
              w-7 h-7 flex items-center justify-center rounded text-sm transition-colors
              ${activeGroup === index && !search ? "bg-gray-700" : "hover:bg-gray-800"}
            `}
          >
            {group.icon}
          </button>
        ))}
      </div>

      <div className="p-3 grid grid-cols-8 gap-0.5 max-h-48 overflow-auto">
        {displayEmojis.map((emoji) => (
          <button
            type="button"
            key={emoji}
            onClick={() => onAction(d.onSelectCommand, emoji)}
            className="w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-gray-700 transition-colors leading-none"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-gray-800/50 text-[10px] text-gray-600">
        点击表情即可插入 · 共 {d.allEmojis.length} 个表情
      </div>
    </div>
  );
}

// ==================== ImageUploadPopup ====================
//
// 遵循统一的 PopupRendererProps 接口。
// 内部通过类型断言访问 image-upload 专有字段。

function ImageUploadPopup({ data, onAction, onClose }: PopupRendererProps) {
  // 类型断言：此组件只会在 type === "image-upload" 时被调用
  const d = data as GenericPopupData & {
    title: string;
    placeholder: string;
    onConfirmCommand: string;
    exampleUrls: Array<{ label: string; url: string }>;
  };

  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (url.trim()) {
      onAction(d.onConfirmCommand, url.trim());
    }
  };

  return (
    <div className="w-96">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
        <span className="text-sm font-semibold text-white">{d.title}</span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors text-xs"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3">
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) handleSubmit();
            if (e.key === "Escape") onClose();
          }}
          placeholder={d.placeholder}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 placeholder:text-gray-600"
        />

        {d.exampleUrls.length > 0 && (
          <div>
            <span className="text-[10px] text-gray-600 block mb-1.5">快速选择示例：</span>
            <div className="flex flex-wrap gap-1.5">
              {d.exampleUrls.map((example) => (
                <button
                  type="button"
                  key={example.url}
                  onClick={() => setUrl(example.url)}
                  className="px-2 py-1 text-[11px] rounded-md bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors border border-gray-700"
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors rounded-md hover:bg-gray-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!url.trim()}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            插入
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== popupRendererRegistry ====================
//
// 对标 VS Code 的 WebviewViewProvider 注册表：
// 宿主只维护一张 type → Component 的映射表，完全不感知具体弹窗。
// 新增弹窗类型只需：1) 插件 emit type  2) 此处注册一行
// page.tsx 的其余代码一行都不用改。
export const popupRendererRegistry = new Map<string, React.ComponentType<PopupRendererProps>>([
  ["emoji-picker", EmojiPopup],
  ["image-upload", ImageUploadPopup],
]);
