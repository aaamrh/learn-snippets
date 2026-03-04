"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import type {
  EditorState,
  ButtonExtension,
  ToolbarConfig,
} from "../types";
import {
  createDefaultEditorState,
  isButtonExtension,
  isFormExtension,
  FIXED_TOOLBAR_BUTTONS,
  BUBBLE_MENU_BUTTONS,
  PRESET_EMOJIS,
} from "../types";
import { EditorInstanceImpl } from "../core/EditorInstance";
import { createAllExtensions } from "../extensions/allExtensions";
import type { LinkExtension } from "../extensions/allExtensions";
import type { ImageExtension } from "../extensions/allExtensions";
import type { EmojiExtension } from "../extensions/allExtensions";
import type { CopyExtension } from "../extensions/allExtensions";

// ==================== Props ====================

interface EditorProps {
  /** 初始内容（HTML） */
  initialContent?: string;
  /** 固定工具栏按钮配置 */
  fixedToolbarButtons?: string[];
  /** 浮动工具栏按钮配置 */
  bubbleMenuButtons?: string[];
  /** 占位文字 */
  placeholder?: string;
  /** 自动保存间隔（ms），0 表示禁用 */
  autoSaveInterval?: number;
  /** 编辑器最小高度 */
  minHeight?: number;
}

// ==================== 主组件 ====================

/**
 * Editor —— 富文本编辑器主组件
 *
 * 架构说明：
 * - contenteditable 容器 + 固定 Toolbar + BubbleMenu + StatusBar
 * - 所有状态通过 EditorInstance 管理
 * - 所有扩展通过 Extension 模型注册
 * - Selection 变化 → checkState → 按钮高亮 + BubbleMenu 定位
 * - 所有变更走 Transaction（不可变状态流转）
 *
 * 对标：medium-editor + Tiptap/ProseMirror 的简化版
 */
export function Editor({
  initialContent = "",
  fixedToolbarButtons = FIXED_TOOLBAR_BUTTONS,
  bubbleMenuButtons = BUBBLE_MENU_BUTTONS,
  placeholder = "在这里开始输入...",
  autoSaveInterval = 5000,
  minHeight = 300,
}: EditorProps) {
  // ==================== Refs ====================

  const editorRef = useRef<HTMLDivElement>(null);
  const bubbleMenuRef = useRef<HTMLDivElement>(null);

  // ==================== EditorInstance (单例) ====================

  const editorInstance = useMemo(() => {
    return new EditorInstanceImpl(initialContent);
  }, []);

  // ==================== State ====================

  const [editorState, setEditorState] = useState<EditorState>(
    () => editorInstance.state,
  );
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);
  const [bubbleMenuPos, setBubbleMenuPos] = useState({ top: 0, left: 0 });

  // 弹出面板状态
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showImageForm, setShowImageForm] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // 强制刷新按钮状态的 key
  const [, forceUpdate] = useState(0);

  // ==================== 初始化 ====================

  useEffect(() => {
    // 注册所有扩展
    const extensions = createAllExtensions({
      autoSaveIntervalMs: autoSaveInterval,
    });
    for (const ext of extensions) {
      editorInstance.registerExtension(ext);
    }

    // 设置状态同步回调
    editorInstance.setOnStateChange((newState) => {
      setEditorState({ ...newState });
    });

    // 绑定 DOM
    if (editorRef.current) {
      editorInstance.bindElement(editorRef.current);

      // 设置初始内容
      if (initialContent) {
        editorRef.current.innerHTML = initialContent;
        editorInstance.syncStateFromDOM();
      }
    }

    // 监听弹出面板事件
    editorInstance.on("link:show-form", () => {
      setShowLinkForm(true);
      setLinkUrl("");
    });
    editorInstance.on("link:hide-form", () => setShowLinkForm(false));

    editorInstance.on("image:show-uploader", () => {
      setShowImageForm(true);
      setImageUrl("");
    });
    editorInstance.on("image:hide-uploader", () => setShowImageForm(false));

    editorInstance.on("emoji:show-picker", () => setShowEmojiPicker(true));
    editorInstance.on("emoji:hide-picker", () => setShowEmojiPicker(false));

    return () => {
      editorInstance.destroy();
    };
  }, []);

  // ==================== Selection & BubbleMenu ====================

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (
        !sel ||
        sel.isCollapsed ||
        !editorRef.current ||
        !editorRef.current.contains(sel.anchorNode)
      ) {
        setShowBubbleMenu(false);
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const editorRect = editorRef.current.getBoundingClientRect();

      if (rect.width === 0) {
        setShowBubbleMenu(false);
        return;
      }

      // 定位：选区上方居中
      const menuWidth = 280;
      let top = rect.top - editorRect.top - 44;
      let left = rect.left - editorRect.left + rect.width / 2 - menuWidth / 2;

      // 防溢出
      if (top < 0) {
        top = rect.bottom - editorRect.top + 8;
      }
      left = Math.max(0, Math.min(left, editorRect.width - menuWidth));

      setBubbleMenuPos({ top, left });
      setShowBubbleMenu(true);

      // 触发强制刷新以获取最新的按钮状态
      forceUpdate((n) => n + 1);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  // ==================== 事件处理 ====================

  /**
   * 工具栏按钮点击
   */
  const handleToolbarButtonClick = useCallback(
    (buttonName: string) => {
      const ext = editorInstance.getExtension(buttonName);
      if (ext && isButtonExtension(ext)) {
        ext.handleClick();
        // 强制刷新按钮状态
        forceUpdate((n) => n + 1);
      }
    },
    [editorInstance],
  );

  /**
   * 链接表单提交
   */
  const handleLinkSubmit = useCallback(() => {
    const linkExt = editorInstance.getExtension<LinkExtension>("link");
    if (linkExt && "applyLink" in linkExt) {
      (linkExt as LinkExtension).applyLink(linkUrl);
    }
    setShowLinkForm(false);
    setLinkUrl("");
  }, [editorInstance, linkUrl]);

  /**
   * 图片表单提交
   */
  const handleImageSubmit = useCallback(() => {
    const imageExt = editorInstance.getExtension<ImageExtension>("image");
    if (imageExt && "insertImage" in imageExt) {
      (imageExt as ImageExtension).insertImage(imageUrl);
    }
    setShowImageForm(false);
    setImageUrl("");
  }, [editorInstance, imageUrl]);

  /**
   * 表情选择
   */
  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      const emojiExt = editorInstance.getExtension<EmojiExtension>("emoji");
      if (emojiExt && "insertEmoji" in emojiExt) {
        (emojiExt as EmojiExtension).insertEmoji(emoji);
      }
      setShowEmojiPicker(false);
    },
    [editorInstance],
  );

  // ==================== 辅助函数 ====================

  /**
   * 获取按钮扩展列表（按名称过滤）
   */
  const getButtons = useCallback(
    (names: string[]): ButtonExtension[] => {
      return names
        .map((name) => editorInstance.getExtension(name))
        .filter((ext): ext is ButtonExtension => ext !== null && isButtonExtension(ext));
    },
    [editorInstance],
  );

  const fixedButtons = getButtons(fixedToolbarButtons);
  const bubbleButtons = getButtons(bubbleMenuButtons);

  // ==================== 格式化时间 ====================

  const formatSavedTime = (timestamp: number | null): string => {
    if (!timestamp) return "未保存";
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  };

  // ==================== 渲染 ====================

  return (
    <div className="flex flex-col bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-lg">
      {/* ==================== 固定工具栏 ==================== */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-gray-700 bg-gray-800/80 flex-wrap">
        {fixedButtons.map((btn, index) => {
          // 在某些按钮之间插入分隔符
          const showSeparator =
            index > 0 &&
            (btn.name === "heading1" ||
              btn.name === "link" ||
              btn.name === "emoji");

          return (
            <React.Fragment key={btn.name}>
              {showSeparator && (
                <div className="w-px h-6 bg-gray-700 mx-1" />
              )}
              <ToolbarButton
                extension={btn}
                onClick={() => handleToolbarButtonClick(btn.name)}
              />
            </React.Fragment>
          );
        })}
      </div>

      {/* ==================== 链接输入表单 ==================== */}
      {showLinkForm && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-gray-800/60">
          <span className="text-xs text-gray-400">🔗 链接地址:</span>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLinkSubmit();
              }
              if (e.key === "Escape") {
                setShowLinkForm(false);
                setLinkUrl("");
              }
            }}
            placeholder="https://example.com"
            className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200
              focus:outline-none focus:border-blue-500 placeholder-gray-600"
            autoFocus
          />
          <button
            type="button"
            onClick={handleLinkSubmit}
            className="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/40
              rounded hover:bg-blue-500/30 transition-colors"
          >
            确定
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLinkForm(false);
              setLinkUrl("");
            }}
            className="px-3 py-1 text-xs text-gray-400 hover:text-white transition-colors"
          >
            取消
          </button>
        </div>
      )}

      {/* ==================== 图片输入表单 ==================== */}
      {showImageForm && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-gray-800/60">
          <span className="text-xs text-gray-400">📷 图片地址:</span>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleImageSubmit();
              }
              if (e.key === "Escape") {
                setShowImageForm(false);
                setImageUrl("");
              }
            }}
            placeholder="https://example.com/image.png"
            className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200
              focus:outline-none focus:border-blue-500 placeholder-gray-600"
            autoFocus
          />
          <button
            type="button"
            onClick={handleImageSubmit}
            className="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/40
              rounded hover:bg-blue-500/30 transition-colors"
          >
            插入
          </button>
          <button
            type="button"
            onClick={() => {
              setShowImageForm(false);
              setImageUrl("");
            }}
            className="px-3 py-1 text-xs text-gray-400 hover:text-white transition-colors"
          >
            取消
          </button>
        </div>
      )}

      {/* ==================== 表情选择面板 ==================== */}
      {showEmojiPicker && (
        <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">😀 选择表情</span>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(false)}
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESET_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleEmojiSelect(emoji)}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700
                  transition-colors text-base cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ==================== 编辑区域（contenteditable） ==================== */}
      <div className="relative flex-1">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="prose prose-invert max-w-none px-6 py-4 focus:outline-none
            text-gray-200 leading-relaxed
            [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-3 [&_h1]:mt-4
            [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mb-2 [&_h2]:mt-3
            [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-white [&_h3]:mb-2 [&_h3]:mt-3
            [&_p]:mb-2 [&_p]:leading-relaxed
            [&_a]:text-blue-400 [&_a]:underline [&_a]:decoration-blue-400/50
            [&_blockquote]:border-l-4 [&_blockquote]:border-gray-600 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-400
            [&_img]:rounded-lg [&_img]:max-w-full [&_img]:my-2
            [&_b]:font-bold [&_strong]:font-bold
            [&_i]:italic [&_em]:italic
            [&_u]:underline"
          style={{ minHeight: `${minHeight}px` }}
          data-placeholder={placeholder}
          role="textbox"
          aria-multiline="true"
          aria-label="编辑器"
        />

        {/* 占位文字 */}
        {(!editorState.content || editorState.content === "<br>" || editorState.content.trim() === "") && (
          <div
            className="absolute top-4 left-6 text-gray-600 pointer-events-none select-none"
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}

        {/* ==================== 浮动工具条 (BubbleMenu) ==================== */}
        {showBubbleMenu && bubbleButtons.length > 0 && (
          <div
            ref={bubbleMenuRef}
            className="absolute z-20 flex items-center gap-0.5 px-2 py-1.5
              bg-gray-800 border border-gray-600 rounded-lg shadow-xl shadow-black/40
              animate-in fade-in-0 zoom-in-95 duration-150"
            style={{
              top: `${bubbleMenuPos.top}px`,
              left: `${bubbleMenuPos.left}px`,
            }}
            // 防止点击 BubbleMenu 时编辑器失焦
            onMouseDown={(e) => e.preventDefault()}
          >
            {bubbleButtons.map((btn, index) => {
              const isSeparatorBefore =
                index > 0 &&
                (btn.name === "translate" || btn.name === "copy");

              return (
                <React.Fragment key={btn.name}>
                  {isSeparatorBefore && (
                    <div className="w-px h-5 bg-gray-600 mx-0.5" />
                  )}
                  <BubbleMenuButton
                    extension={btn}
                    onClick={() => {
                      handleToolbarButtonClick(btn.name);
                      // 翻译和复制后隐藏 BubbleMenu
                      if (btn.name === "translate" || btn.name === "copy") {
                        setTimeout(() => {
                          setShowBubbleMenu(false);
                        }, 100);
                      }
                    }}
                  />
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* ==================== 状态栏 ==================== */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-700 bg-gray-800/60 text-[11px] text-gray-500">
        <div className="flex items-center gap-4">
          <span>
            字数:{" "}
            <span className="text-gray-300 font-mono tabular-nums">
              {editorState.wordCount}
            </span>
          </span>
          <span>
            行数:{" "}
            <span className="text-gray-300 font-mono tabular-nums">
              {editorState.lineCount}
            </span>
          </span>
          {editorState.activeMarks.size > 0 && (
            <span>
              格式:{" "}
              <span className="text-blue-400">
                {Array.from(editorState.activeMarks).join(", ")}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {editorState.isDirty && (
            <span className="text-yellow-500">● 未保存</span>
          )}
          <span>
            自动保存:{" "}
            <span className={editorState.lastSaved ? "text-green-400" : "text-gray-500"}>
              {editorState.lastSaved ? `已保存 ${formatSavedTime(editorState.lastSaved)}` : "未保存"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ==================== 固定工具栏按钮 ====================

interface ToolbarButtonProps {
  extension: ButtonExtension;
  onClick: () => void;
}

function ToolbarButton({ extension, onClick }: ToolbarButtonProps) {
  const isActive = extension.isActive();

  return (
    <button
      type="button"
      title={
        extension.shortcut
          ? `${extension.label} (${extension.shortcut})`
          : extension.label
      }
      aria-label={extension.label}
      aria-pressed={isActive}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()} // 防止点击按钮时编辑器失焦
      className={`
        flex items-center justify-center w-8 h-8 rounded-md
        text-sm font-medium transition-all duration-100 select-none
        ${
          isActive
            ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
            : "text-gray-400 hover:text-white hover:bg-gray-700/60 border border-transparent"
        }
      `}
    >
      {renderButtonIcon(extension)}
    </button>
  );
}

// ==================== BubbleMenu 按钮 ====================

interface BubbleMenuButtonProps {
  extension: ButtonExtension;
  onClick: () => void;
}

function BubbleMenuButton({ extension, onClick }: BubbleMenuButtonProps) {
  const isActive = extension.isActive();

  // CopyExtension 的特殊显示
  let displayIcon = extension.icon;
  let displayLabel = extension.label;
  if (extension.name === "copy" && "isJustCopied" in extension) {
    const copyExt = extension as CopyExtension;
    if (copyExt.isJustCopied()) {
      displayIcon = "✓";
      displayLabel = "已复制";
    }
  }

  return (
    <button
      type="button"
      title={displayLabel}
      aria-label={displayLabel}
      aria-pressed={isActive}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      className={`
        flex items-center justify-center px-2 py-1 rounded-md
        text-xs font-medium transition-all duration-100 select-none gap-1
        ${
          isActive
            ? "bg-blue-500/20 text-blue-400"
            : "text-gray-300 hover:text-white hover:bg-gray-700/60"
        }
      `}
    >
      <span className="text-sm">{displayIcon}</span>
      <span className="hidden sm:inline">{displayLabel}</span>
    </button>
  );
}

// ==================== 图标渲染 ====================

function renderButtonIcon(extension: ButtonExtension): React.ReactNode {
  const { icon, name } = extension;

  // 特殊样式处理
  switch (name) {
    case "bold":
      return <span className="font-bold text-[13px]">{icon}</span>;
    case "italic":
      return <span className="italic text-[13px]">{icon}</span>;
    case "underline":
      return <span className="underline text-[13px]">U</span>;
    case "strikethrough":
      return <span className="line-through text-[13px]">S</span>;
    case "heading1":
      return <span className="text-[11px] font-bold">{icon}</span>;
    case "heading2":
      return <span className="text-[11px] font-bold">{icon}</span>;
    case "heading3":
      return <span className="text-[11px] font-bold">{icon}</span>;
    default:
      return <span className="text-[14px]">{icon}</span>;
  }
}

export default Editor;
