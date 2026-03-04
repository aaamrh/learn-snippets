import React from "react";
import type { Plugin, PluginContext } from "../types";

// ==================== 表情列表（插件私有）====================
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

// ==================== EmojiGrid 组件（插件私有，宿主不感知）====================
// 以前：EmojiGrid 定义在 page.tsx，宿主感知它并手动渲染
// 现在：EmojiGrid 定义在插件内部，宿主只负责挂载 renderContent() 的返回值
//
// 对标 Tiptap NodeView：
//   Tiptap 扩展通过 addNodeView() 返回自己的 React 组件，
//   宿主（ProseMirror）只负责在合适的位置挂载，完全不感知组件内部结构。
function EmojiGrid({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  return React.createElement(
    "div",
    { className: "p-3 w-72" },
    React.createElement(
      "div",
      { className: "text-xs text-zinc-400 mb-2 font-bold" },
      "😊 选择表情",
    ),
    React.createElement(
      "div",
      { className: "grid grid-cols-8 gap-1" },
      ...EMOJI_LIST.map((emoji) =>
        React.createElement(
          "button",
          {
            key: emoji,
            type: "button",
            title: emoji,
            className: "text-xl hover:bg-zinc-700 rounded p-0.5 transition-colors leading-none",
            onClick: () => {
              onSelect(emoji);
              onClose();
            },
          },
          emoji,
        ),
      ),
    ),
  );
}

// ==================== emojiPlugin ====================
/**
 * 改造后的表情插件
 *
 * 旧方案（宿主感知型）:
 *   emit('editor:open-popup', { type: 'emoji', anchorEl })
 *   → 宿主判断 type === 'emoji' → 宿主渲染 <EmojiGrid onSelect={宿主写死的回调} />
 *   问题：宿主必须认识每一种弹窗类型，新增插件必须改宿主
 *
 * 新方案（Portal 型，对标 Tiptap）:
 *   emit('editor:open-popup', { anchorEl, renderContent: (close) => <EmojiGrid ... /> })
 *   → 宿主只调用 renderContent(close)，不感知里面是什么
 *   → EmojiGrid 内部直接调用 ctx.insertText()，不经过宿主中转
 *   好处：宿主代码永远不需要改，插件完全自治
 */
export const emojiPlugin: Plugin = {
  id: "emoji",
  name: "Emoji",
  version: "1.0.0",

  activate(context) {
    // 表情列表存入 state，外部可通过 getContext('emoji').state.get('list') 读取
    context.state.set("list", EMOJI_LIST);
  },

  extensions: {
    "editor:toolbar": {
      priority: 70,
      handler: ({ context }: { context: PluginContext }) => ({
        id: "emoji",
        label: "😊",
        title: "插入表情",
        className: "",
        onClick: (anchorEl: HTMLElement) => {
          // 插件 emit 的不再是 type 字符串，而是一个渲染函数
          // 宿主拿到这个函数后直接调用，完全不需要知道里面渲染的是什么
          context.emit("editor:open-popup", {
            anchorEl,
            // renderContent 是插件交给宿主的"渲染票据"
            // close 由宿主传入，插件调用它来关闭弹窗
            renderContent: (close: () => void) =>
              React.createElement(EmojiGrid, {
                onSelect: (emoji: string) => {
                  // 直接调用宿主注入的 insertText，不经过任何事件中转
                  // 宿主不感知插入的是表情，插件完全自治
                  context.insertText(emoji);
                  close();
                },
                onClose: close,
              }),
          });
        },
      }),
    },
  },
};
