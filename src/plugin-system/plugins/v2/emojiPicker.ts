// ==================== Emoji Picker Plugin (v2 Manifest 格式) ====================
//
// 点击工具栏按钮后弹出表情面板，选择表情后插入到编辑器光标位置
//
// 对标 VS Code 插件的 extension.ts：
// - 导出 activate / deactivate
// - 在 activate 中通过 api.commands.registerCommand 注册命令处理器
// - 命令 ID 必须与 Manifest contributes.commands 中声明的一致
//
// Manifest（定义在 manifest-types.ts 的 EXAMPLE_EMOJI_MANIFEST）：
// - id: "emoji-picker"
// - activationEvents: ["onCommand:emoji-picker.insert"]
// - permissions: ["editor:insertText", "commands:register", "events:emit"]
// - contributes.commands: [{ command: "emoji-picker.insert", title: "插入表情", icon: "😊" }]
//
// 弹窗机制（Portal 型，对标 Tiptap NodeView）：
//   插件通过 api.events.emit("ui:show-popup", { id, title, renderContent }) 通知宿主
//   宿主只调用 renderContent(close)，不感知弹窗内容
//   插件在 renderContent 内部直接调用 api.editor.insertText()，完全自治

import type { PluginEntry, PluginAPI } from "../../manifest-types";

// ==================== 表情列表（插件私有数据）====================

/**
 * 表情分组
 *
 * 每个分组包含标签和表情列表
 * 在真实场景中可以从远程加载或使用 emoji-data 库
 */
interface EmojiGroup {
  label: string;
  icon: string;
  emojis: string[];
}

const EMOJI_GROUPS: EmojiGroup[] = [
  {
    label: "表情",
    icon: "😀",
    emojis: [
      "😀",
      "😂",
      "😍",
      "🤔",
      "😎",
      "🥳",
      "😭",
      "🤩",
      "😅",
      "😊",
      "🙃",
      "😇",
      "🥰",
      "😋",
      "😜",
      "🤗",
    ],
  },
  {
    label: "手势",
    icon: "👍",
    emojis: [
      "👍",
      "👎",
      "👏",
      "🙏",
      "💪",
      "🤝",
      "✌️",
      "🤞",
      "👋",
      "🤙",
      "👌",
      "✊",
      "🤜",
      "🤛",
      "☝️",
      "👆",
    ],
  },
  {
    label: "符号",
    icon: "❤️",
    emojis: [
      "❤️",
      "💔",
      "💯",
      "🔥",
      "⭐",
      "✨",
      "🎉",
      "🎊",
      "💡",
      "💎",
      "🏆",
      "🎯",
      "🚀",
      "⚡",
      "💫",
      "🌈",
    ],
  },
  {
    label: "动物",
    icon: "🐶",
    emojis: [
      "🐶",
      "🐱",
      "🐭",
      "🐻",
      "🦊",
      "🐼",
      "🐨",
      "🦁",
      "🐯",
      "🐸",
      "🐵",
      "🐧",
      "🦄",
      "🐝",
      "🦋",
      "🐢",
    ],
  },
  {
    label: "食物",
    icon: "🍎",
    emojis: [
      "🍎",
      "🍊",
      "🍋",
      "🍇",
      "🍓",
      "🍕",
      "🍔",
      "🍜",
      "🍦",
      "🍩",
      "🎂",
      "🍰",
      "🍫",
      "🍿",
      "☕",
      "🍺",
    ],
  },
  {
    label: "物品",
    icon: "💻",
    emojis: [
      "⚽",
      "🏀",
      "🎮",
      "🎵",
      "🎸",
      "📷",
      "💻",
      "📱",
      "📚",
      "🔑",
      "🎁",
      "📦",
      "🔔",
      "🗓️",
      "📌",
      "✏️",
    ],
  },
];

/**
 * 所有表情的扁平列表（用于快速搜索）
 */
const ALL_EMOJIS: string[] = EMOJI_GROUPS.flatMap((g) => g.emojis);

// ==================== 弹窗数据类型 ====================

/**
 * 插件发送给宿主的弹窗请求数据
 *
 * 宿主通过监听 "ui:show-popup" 事件接收此数据
 * renderContent 返回一个描述弹窗内容的纯数据对象（非 React 元素）
 * 宿主侧根据此数据结构渲染对应的 UI
 *
 * 为什么不直接传 React 元素？
 * - v2 插件运行在可能的 Worker 沙箱中，不能直接操作 DOM / React
 * - 传纯数据（表情列表 + 回调 ID）比传 React 元素更安全、可序列化
 * - 宿主侧统一渲染，保证 UI 风格一致
 */
export interface EmojiPopupData {
  /** 弹窗类型标识 */
  type: "emoji-picker";
  /** 弹窗标题 */
  title: string;
  /** 表情分组数据 */
  groups: EmojiGroup[];
  /** 所有表情（扁平列表，用于搜索） */
  allEmojis: string[];
  /** 选择表情后要执行的命令 ID（宿主调用 executeCommand 传入选中的 emoji） */
  onSelectCommand: string;
  /**
   * 触发此弹窗的命令 ID（对标 GenericPopupData.triggerCommand）
   * 宿主用此字段定位锚定按钮，无需写死具体插件 ID。
   */
  triggerCommand: string;
  /**
   * 执行主操作后是否自动关闭弹窗
   * 表情选择后保持弹窗打开，允许连续插入多个表情。
   */
  closeOnAction: boolean;
}

// ==================== 插件入口 ====================

const emojiPickerPlugin: PluginEntry = {
  /**
   * 激活阶段
   *
   * 注册 "emoji-picker.insert" 命令的处理器。
   * 当用户点击工具栏的「表情」按钮时，PluginHost 会调用此命令。
   *
   * 流程：
   * 1. 命令被调用时，通过 events.emit 发送弹窗请求给宿主
   * 2. 宿主渲染表情面板
   * 3. 用户选择表情后，宿主调用 emoji-picker.doInsert 命令
   * 4. 插件在 doInsert 命令中调用 api.editor.insertText 插入表情
   *
   * 为什么分两个命令？
   * - emoji-picker.insert：触发弹窗显示（声明在 Manifest contributes.commands 中）
   * - emoji-picker.doInsert：实际插入表情（内部命令，由宿主在用户选择后调用）
   * 这样的分离让「打开面板」和「插入内容」解耦，
   * 弹窗的显示由宿主控制（位置、动画等），插件只管业务逻辑
   */
  activate(api: PluginAPI): void {
    // ── 注册「打开表情面板」命令 ──
    api.commands.registerCommand("emoji-picker.insert", async () => {
      // 发送弹窗请求给宿主
      // 宿主监听 "ui:show-popup" 事件，根据 type 渲染对应 UI
      const popupData: EmojiPopupData = {
        type: "emoji-picker",
        title: "😊 选择表情",
        groups: EMOJI_GROUPS,
        allEmojis: ALL_EMOJIS,
        onSelectCommand: "emoji-picker.doInsert",
        triggerCommand: "emoji-picker.insert",
        closeOnAction: false,
      };

      api.events.emit("ui:show-popup", popupData);

      console.log("[EmojiPicker] Popup requested.");
    });

    // ── 注册「实际插入表情」命令 ──
    api.commands.registerCommand("emoji-picker.doInsert", async (...args: unknown[]) => {
      const emoji = args[0];

      if (typeof emoji !== "string" || emoji.trim() === "") {
        console.warn("[EmojiPicker] doInsert called without valid emoji string.");
        return { success: false, reason: "invalid-emoji" };
      }

      try {
        await api.editor.insertText(emoji);
        console.log(`[EmojiPicker] Inserted emoji: ${emoji}`);
        return { success: true, emoji };
      } catch (error) {
        console.error("[EmojiPicker] Failed to insert emoji:", error);
        return {
          success: false,
          reason: "insert-failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log(
      `[EmojiPicker] Plugin activated. ${ALL_EMOJIS.length} emojis in ${EMOJI_GROUPS.length} groups.`,
    );
  },

  /**
   * 停用阶段
   *
   * 命令处理器通过 Disposable 自动清理，
   * 此处不需要额外清理逻辑。
   */
  deactivate(): void {
    console.log("[EmojiPicker] Plugin deactivated.");
  },
};

export default emojiPickerPlugin;
