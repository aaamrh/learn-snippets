import { Plugin } from "../types";

/**
 * 表情插件
 *
 * 改造后的方案：
 *   插件只负责逻辑，不关心弹窗 UI 怎么渲染、怎么定位。
 *   点击按钮时把 anchorEl（按钮 DOM 节点）和弹窗类型一起 emit 给宿主，
 *   宿主统一用 GlobalPopup 处理定位和显示。
 *
 * emit('editor:open-popup', { type: 'emoji', anchorEl: buttonEl })
 *   ↓
 * 宿主 GlobalPopup 定位到 anchorEl 下方
 *   ↓
 * 宿主内部根据 type 渲染 <EmojiGrid />
 *   ↓
 * 用户点击表情后宿主 emit('editor:insert', { text: '😀' })
 */
export const emojiPlugin: Plugin = {
  id: "emoji",
  name: "Emoji",
  version: "1.0.0",

  activate(context) {
    // 表情列表存入 state，宿主可通过 host.getContext('emoji').state.get('list') 读取
    context.state.set("list", [
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
    ]);
  },

  extensions: {
    "editor:toolbar": {
      priority: 70,
      handler: ({ context }: { context: any }) => ({
        id: "emoji",
        label: "😊",
        title: "插入表情",
        className: "",
        onClick: (anchorEl: HTMLElement) => {
          context.emit("editor:open-popup", {
            type: "emoji",
            anchorEl,
          });
        },
      }),
    },
  },
};
