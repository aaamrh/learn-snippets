import type {
  ButtonExtension,
  Extension,
  EditorInstance,
  EditorState,
  MarkType,
  BlockType,
} from "../types";
import {
  EDITOR_EVENTS,
  PRESET_EMOJIS,
  countWords,
  countLines,
} from "../types";
import { BaseButtonExtension } from "./BaseButtonExtension";

// ==================== BoldExtension ====================

/**
 * 加粗扩展
 *
 * 对标 medium-editor 的 bold button：
 * - tagNames: ["b", "strong"] — 这些标签表示 bold 已应用
 * - style: font-weight 700|bold — CSS 样式也表示 bold
 * - command: "bold" — 执行 document.execCommand("bold")
 */
export class BoldExtension extends BaseButtonExtension {
  readonly name = "bold";
  readonly command = "bold";
  readonly label = "加粗";
  readonly icon = "B";
  readonly shortcut = "Ctrl+B";
  readonly tagNames = ["b", "strong"];
  readonly style = { prop: "font-weight", value: "700|bold" };
}

// ==================== ItalicExtension ====================

/**
 * 斜体扩展
 */
export class ItalicExtension extends BaseButtonExtension {
  readonly name = "italic";
  readonly command = "italic";
  readonly label = "斜体";
  readonly icon = "I";
  readonly shortcut = "Ctrl+I";
  readonly tagNames = ["i", "em"];
  readonly style = { prop: "font-style", value: "italic" };
}

// ==================== UnderlineExtension ====================

/**
 * 下划线扩展
 */
export class UnderlineExtension extends BaseButtonExtension {
  readonly name = "underline";
  readonly command = "underline";
  readonly label = "下划线";
  readonly icon = "U̲";
  readonly shortcut = "Ctrl+U";
  readonly tagNames = ["u"];
  readonly style = { prop: "text-decoration", value: "underline" };
}

// ==================== StrikethroughExtension ====================

/**
 * 删除线扩展
 */
export class StrikethroughExtension extends BaseButtonExtension {
  readonly name = "strikethrough";
  readonly command = "strikeThrough";
  readonly label = "删除线";
  readonly icon = "S̶";
  readonly tagNames = ["s", "strike", "del"];
  readonly style = { prop: "text-decoration", value: "line-through" };
}

// ==================== Heading1Extension ====================

/**
 * 标题 H1 扩展
 *
 * 与普通的 mark 按钮不同，heading 是块级格式。
 * 使用 formatBlock 命令而非 mark toggle。
 * active 状态通过 activeBlock 而非 activeMarks 判断。
 */
export class Heading1Extension extends BaseButtonExtension {
  readonly name = "heading1";
  readonly command = "formatBlock";
  readonly label = "标题 1";
  readonly icon = "H1";
  readonly tagNames = ["h1"];

  handleClick(_event?: MouseEvent): void {
    if (!this.editor) return;

    // 如果已经是 H1，切回 P
    if (this.isActive()) {
      this.editor.execCommand("formatBlock", "<p>");
    } else {
      this.editor.execCommand("formatBlock", "<h1>");
    }
  }

  checkState(state: EditorState): void {
    if (state.activeBlock === "h1") {
      this.setActive();
    } else {
      this.setInactive();
    }
  }

  isAlreadyApplied(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    return (node as HTMLElement).tagName.toLowerCase() === "h1";
  }
}

// ==================== Heading2Extension ====================

/**
 * 标题 H2 扩展
 */
export class Heading2Extension extends BaseButtonExtension {
  readonly name = "heading2";
  readonly command = "formatBlock";
  readonly label = "标题 2";
  readonly icon = "H2";
  readonly tagNames = ["h2"];

  handleClick(_event?: MouseEvent): void {
    if (!this.editor) return;

    if (this.isActive()) {
      this.editor.execCommand("formatBlock", "<p>");
    } else {
      this.editor.execCommand("formatBlock", "<h2>");
    }
  }

  checkState(state: EditorState): void {
    if (state.activeBlock === "h2") {
      this.setActive();
    } else {
      this.setInactive();
    }
  }

  isAlreadyApplied(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    return (node as HTMLElement).tagName.toLowerCase() === "h2";
  }
}

// ==================== Heading3Extension ====================

/**
 * 标题 H3 扩展
 */
export class Heading3Extension extends BaseButtonExtension {
  readonly name = "heading3";
  readonly command = "formatBlock";
  readonly label = "标题 3";
  readonly icon = "H3";
  readonly tagNames = ["h3"];

  handleClick(_event?: MouseEvent): void {
    if (!this.editor) return;

    if (this.isActive()) {
      this.editor.execCommand("formatBlock", "<p>");
    } else {
      this.editor.execCommand("formatBlock", "<h3>");
    }
  }

  checkState(state: EditorState): void {
    if (state.activeBlock === "h3") {
      this.setActive();
    } else {
      this.setInactive();
    }
  }

  isAlreadyApplied(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    return (node as HTMLElement).tagName.toLowerCase() === "h3";
  }
}

// ==================== BlockquoteExtension ====================

/**
 * 引用块扩展
 */
export class BlockquoteExtension extends BaseButtonExtension {
  readonly name = "blockquote";
  readonly command = "formatBlock";
  readonly label = "引用";
  readonly icon = "❝";
  readonly tagNames = ["blockquote"];

  handleClick(_event?: MouseEvent): void {
    if (!this.editor) return;

    if (this.isActive()) {
      this.editor.execCommand("formatBlock", "<p>");
    } else {
      this.editor.execCommand("formatBlock", "<blockquote>");
    }
  }

  checkState(state: EditorState): void {
    if (state.activeBlock === "blockquote") {
      this.setActive();
    } else {
      this.setInactive();
    }
  }

  isAlreadyApplied(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    return (node as HTMLElement).tagName.toLowerCase() === "blockquote";
  }
}

// ==================== LinkExtension ====================

/**
 * 链接扩展（FormExtension 的简化版）
 *
 * 对标 medium-editor 的 AnchorExtension / FormExtension：
 * - 点击按钮后弹出 URL 输入框（通过回调通知 UI 组件）
 * - 在选中文字上创建 <a> 标签
 * - active 状态通过检测祖先链中是否有 <a> 标签
 *
 * 简化设计：
 * - 不在扩展内部管理表单 DOM，而是通过事件通知 React 组件弹出表单
 * - React 组件通过调用 applyLink(url) 来完成链接创建
 */
export class LinkExtension extends BaseButtonExtension {
  readonly name = "link";
  readonly command = "createLink";
  readonly label = "链接";
  readonly icon = "🔗";
  readonly shortcut = "Ctrl+K";
  readonly tagNames = ["a"];

  /** 是否正在显示链接表单 */
  private _showingForm = false;

  /**
   * 点击按钮：
   * - 如果选区内已有链接 → 移除链接（unlink）
   * - 如果选区无链接 → 通知 UI 弹出链接输入框
   */
  handleClick(_event?: MouseEvent): void {
    if (!this.editor) return;

    if (this.isActive()) {
      // 已有链接 → 移除
      this.editor.execCommand("unlink");
    } else {
      // 无链接 → 通知 UI 弹出输入框
      this._showingForm = true;
      this.editor.emit("link:show-form");
    }
  }

  /**
   * 应用链接
   * 由 UI 组件在用户输入 URL 后调用
   */
  applyLink(url: string): void {
    if (!this.editor || !url.trim()) {
      this._showingForm = false;
      return;
    }

    // 确保 URL 有协议前缀
    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl) && !finalUrl.startsWith("mailto:")) {
      finalUrl = "https://" + finalUrl;
    }

    this.editor.execCommand("createLink", finalUrl);
    this._showingForm = false;
  }

  /**
   * 取消链接表单
   */
  cancelForm(): void {
    this._showingForm = false;
    this.editor?.emit("link:hide-form");
  }

  /**
   * 是否正在显示链接表单
   */
  isShowingForm(): boolean {
    return this._showingForm;
  }

  checkState(state: EditorState): void {
    if (state.activeMarks.has("link")) {
      this.setActive();
    } else {
      this.setInactive();
    }
  }
}

// ==================== ImageExtension ====================

/**
 * 图片扩展
 *
 * 行为：
 * - 点击按钮 → 通知 UI 弹出图片上传/URL 输入界面
 * - 用户提供图片 URL 后 → 在光标位置插入 <img> 标签
 */
export class ImageExtension extends BaseButtonExtension {
  readonly name = "image";
  readonly command = "insertImage";
  readonly label = "图片";
  readonly icon = "📷";

  /** 是否正在显示图片上传界面 */
  private _showingUploader = false;

  handleClick(_event?: MouseEvent): void {
    if (!this.editor) return;
    this._showingUploader = true;
    this.editor.emit("image:show-uploader");
  }

  /**
   * 插入图片
   * 由 UI 组件在用户提供图片 URL 后调用
   */
  insertImage(url: string, alt = ""): void {
    if (!this.editor || !url.trim()) {
      this._showingUploader = false;
      return;
    }

    const altAttr = alt ? ` alt="${alt}"` : "";
    const html = `<img src="${url}"${altAttr} style="max-width:100%;height:auto;border-radius:4px;margin:8px 0;" />`;
    this.editor.execCommand("insertHTML", html);
    this._showingUploader = false;
  }

  /**
   * 取消图片上传
   */
  cancelUploader(): void {
    this._showingUploader = false;
    this.editor?.emit("image:hide-uploader");
  }

  /**
   * 是否正在显示图片上传界面
   */
  isShowingUploader(): boolean {
    return this._showingUploader;
  }

  /**
   * 图片按钮不需要 active 状态
   */
  checkState(_state: EditorState): void {
    this.setInactive();
  }

  isAlreadyApplied(_node: Node): boolean {
    return false;
  }
}

// ==================== EmojiExtension ====================

/**
 * 表情扩展
 *
 * 行为：
 * - 点击按钮 → 通知 UI 弹出表情选择面板
 * - 用户选择表情后 → 在光标位置插入表情字符
 */
export class EmojiExtension extends BaseButtonExtension {
  readonly name = "emoji";
  readonly command = "insertText";
  readonly label = "表情";
  readonly icon = "😀";

  /** 是否正在显示表情面板 */
  private _showingPicker = false;

  /** 预设表情列表 */
  readonly emojis = PRESET_EMOJIS;

  handleClick(_event?: MouseEvent): void {
    if (!this.editor) return;
    this._showingPicker = !this._showingPicker;
    if (this._showingPicker) {
      this.editor.emit("emoji:show-picker");
    } else {
      this.editor.emit("emoji:hide-picker");
    }
  }

  /**
   * 插入表情
   * 由 UI 组件在用户选择表情后调用
   */
  insertEmoji(emoji: string): void {
    if (!this.editor) return;
    this.editor.execCommand("insertText", emoji);
    this._showingPicker = false;
  }

  /**
   * 是否正在显示表情面板
   */
  isShowingPicker(): boolean {
    return this._showingPicker;
  }

  /**
   * 关闭表情面板
   */
  closePicker(): void {
    this._showingPicker = false;
    this.editor?.emit("emoji:hide-picker");
  }

  checkState(_state: EditorState): void {
    this.setInactive();
  }

  isAlreadyApplied(_node: Node): boolean {
    return false;
  }
}

// ==================== TranslateExtension ====================

/**
 * 翻译扩展（BubbleMenu 专用按钮）
 *
 * 行为：
 * - 选中文字后，在 BubbleMenu 中显示翻译按钮
 * - 点击后将选中文字替换为"翻译"结果（模拟翻译 API）
 *
 * 这是一个 BubbleMenu 专用扩展的示例：
 * 它不出现在固定工具栏中，只出现在浮动工具条中
 */
export class TranslateExtension extends BaseButtonExtension {
  readonly name = "translate";
  readonly command = "__translate__";
  readonly label = "翻译";
  readonly icon = "🌐";

  handleClick(_event?: MouseEvent): void {
    if (!this.editor) return;

    const selectedText = this.editor.state.selection.text;
    if (!selectedText) return;

    // 模拟翻译（实际应调用翻译 API）
    const translated = this.mockTranslate(selectedText);

    // 替换选中文字
    this.editor.execCommand("insertText", translated);
  }

  /**
   * 模拟翻译函数
   * 实际项目中应替换为真实的翻译 API 调用
   */
  private mockTranslate(text: string): string {
    // 简单的中英文检测和模拟翻译
    const hasChinese = /[\u4e00-\u9fa5]/.test(text);

    if (hasChinese) {
      return `[EN] ${text}`;
    } else {
      return `[中文] ${text}`;
    }
  }

  checkState(_state: EditorState): void {
    // 翻译按钮不需要 active 状态
    this.setInactive();
  }

  isAlreadyApplied(_node: Node): boolean {
    return false;
  }
}

// ==================== CopyExtension ====================

/**
 * 复制扩展（BubbleMenu 专用按钮）
 *
 * 行为：
 * - 选中文字后，在 BubbleMenu 中显示复制按钮
 * - 点击后将选中文字复制到剪贴板
 */
export class CopyExtension extends BaseButtonExtension {
  readonly name = "copy";
  readonly command = "__copy__";
  readonly label = "复制";
  readonly icon = "📋";

  /** 最近一次复制是否成功（用于短暂显示"已复制"反馈） */
  private _justCopied = false;
  private _copiedTimer: ReturnType<typeof setTimeout> | null = null;

  handleClick(_event?: MouseEvent): void {
    if (!this.editor) return;

    const selectedText = this.editor.state.selection.text;
    if (!selectedText) return;

    // 使用 Clipboard API 复制
    navigator.clipboard
      .writeText(selectedText)
      .then(() => {
        this._justCopied = true;
        this.editor?.emit("copy:success", selectedText);

        // 2 秒后重置"已复制"状态
        if (this._copiedTimer) clearTimeout(this._copiedTimer);
        this._copiedTimer = setTimeout(() => {
          this._justCopied = false;
          this._copiedTimer = null;
        }, 2000);
      })
      .catch(() => {
        // 降级：使用 execCommand
        try {
          document.execCommand("copy");
          this._justCopied = true;
          this.editor?.emit("copy:success", selectedText);
        } catch {
          console.warn("[CopyExtension] Copy failed");
        }
      });
  }

  /**
   * 是否刚刚复制成功（用于 UI 反馈）
   */
  isJustCopied(): boolean {
    return this._justCopied;
  }

  checkState(_state: EditorState): void {
    this.setInactive();
  }

  isAlreadyApplied(_node: Node): boolean {
    return false;
  }

  destroy(): void {
    if (this._copiedTimer) {
      clearTimeout(this._copiedTimer);
      this._copiedTimer = null;
    }
    super.destroy();
  }
}

// ==================== WordCountExtension ====================

/**
 * 字数统计扩展（纯 Extension，不是 Button）
 *
 * 对标 medium-editor 的纯逻辑扩展：
 * - 不渲染按钮，不出现在工具栏中
 * - 监听内容变化，计算字数和行数
 * - 通过事件通知 UI 更新状态栏
 *
 * 这是一个典型的"非 UI"扩展：
 * 它只处理数据，不直接操作 DOM 或渲染按钮
 */
export class WordCountExtension implements Extension {
  readonly name = "word-count";

  private editor: EditorInstance | null = null;

  init(editor: EditorInstance): void {
    this.editor = editor;

    // 立即计算一次
    this.updateCounts();
  }

  destroy(): void {
    this.editor = null;
  }

  /**
   * 内容变化时重新计算字数和行数
   */
  onStateChange(state: EditorState): void {
    // 状态已经包含了 wordCount 和 lineCount（在 EditorInstance.syncStateFromDOM 中计算）
    // 这里可以做额外的处理，比如发送自定义事件
    this.editor?.emit("wordcount:update", {
      wordCount: state.wordCount,
      lineCount: state.lineCount,
    });
  }

  private updateCounts(): void {
    if (!this.editor) return;

    const content = this.editor.state.content;
    const wordCount = countWords(content);
    const lineCount = countLines(content);

    this.editor.updateState({
      wordCount,
      lineCount,
    });
  }
}

// ==================== AutoSaveExtension ====================

/**
 * 自动保存扩展（纯 Extension，不是 Button）
 *
 * 行为：
 * - 监听内容变化
 * - 每隔指定时间自动"保存"（模拟保存到 localStorage）
 * - 通过事件通知 UI 更新保存状态
 *
 * 配置：
 * - intervalMs: 自动保存间隔（默认 5000ms）
 * - storageKey: localStorage 的 key（默认 "rich-editor:content"）
 */
export class AutoSaveExtension implements Extension {
  readonly name = "auto-save";

  private editor: EditorInstance | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private storageKey: string;

  constructor(options?: { intervalMs?: number; storageKey?: string }) {
    this.intervalMs = options?.intervalMs ?? 5000;
    this.storageKey = options?.storageKey ?? "rich-editor:content";
  }

  init(editor: EditorInstance): void {
    this.editor = editor;

    // 尝试从 localStorage 恢复内容
    this.restoreContent();

    // 启动自动保存定时器
    this.timer = setInterval(() => {
      this.autoSave();
    }, this.intervalMs);

    // 监听手动保存事件（Ctrl+S）
    editor.on(EDITOR_EVENTS.SAVE, () => {
      this.saveToStorage();
    });
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.editor = null;
  }

  onStateChange(_state: EditorState): void {
    // 状态变化不立即保存，等自动保存定时器触发
  }

  /**
   * 执行自动保存
   */
  private autoSave(): void {
    if (!this.editor) return;
    if (!this.editor.state.isDirty) return;

    this.saveToStorage();
    this.editor.updateState({
      lastSaved: Date.now(),
      isDirty: false,
    });

    this.editor.emit("autosave:saved", Date.now());
  }

  /**
   * 保存到 localStorage
   */
  private saveToStorage(): void {
    if (!this.editor) return;

    try {
      const content = this.editor.state.content;
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(this.storageKey, content);
      }
    } catch (err) {
      console.warn("[AutoSaveExtension] Failed to save to localStorage:", err);
    }
  }

  /**
   * 从 localStorage 恢复内容
   */
  private restoreContent(): void {
    if (!this.editor) return;

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const saved = localStorage.getItem(this.storageKey);
        if (saved && saved.trim()) {
          // 只在编辑器内容为空时恢复
          if (!this.editor.state.content || !this.editor.state.content.trim()) {
            this.editor.updateState({
              content: saved,
              wordCount: countWords(saved),
              lineCount: countLines(saved),
              isDirty: false,
            });

            // 设置到 DOM
            const el = this.editor.getEditorElement();
            if (el) {
              el.innerHTML = saved;
            }

            this.editor.emit("autosave:restored", saved);
          }
        }
      }
    } catch (err) {
      console.warn("[AutoSaveExtension] Failed to restore from localStorage:", err);
    }
  }

  /**
   * 清除保存的内容
   */
  clearStorage(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem(this.storageKey);
      }
    } catch {
      // ignore
    }
  }

  /**
   * 获取保存间隔
   */
  getIntervalMs(): number {
    return this.intervalMs;
  }
}

// ==================== 创建所有扩展的工厂函数 ====================

/**
 * 创建固定工具栏所需的所有扩展
 */
export function createFixedToolbarExtensions(): ButtonExtension[] {
  return [
    new BoldExtension(),
    new ItalicExtension(),
    new UnderlineExtension(),
    new Heading1Extension(),
    new Heading2Extension(),
    new LinkExtension(),
    new ImageExtension(),
    new EmojiExtension(),
  ];
}

/**
 * 创建浮动工具栏（BubbleMenu）所需的所有扩展
 *
 * 注意：BubbleMenu 的 bold/italic/underline 可以复用固定工具栏的同一个实例
 * 这里只创建 BubbleMenu 专用的扩展
 */
export function createBubbleMenuExtensions(): ButtonExtension[] {
  return [
    new TranslateExtension(),
    new CopyExtension(),
  ];
}

/**
 * 创建所有非 UI 扩展（纯逻辑）
 */
export function createLogicExtensions(options?: {
  autoSaveIntervalMs?: number;
  autoSaveStorageKey?: string;
}): Extension[] {
  return [
    new WordCountExtension(),
    new AutoSaveExtension({
      intervalMs: options?.autoSaveIntervalMs,
      storageKey: options?.autoSaveStorageKey,
    }),
  ];
}

/**
 * 创建所有扩展
 * 返回去重后的完整扩展列表
 */
export function createAllExtensions(options?: {
  autoSaveIntervalMs?: number;
  autoSaveStorageKey?: string;
}): Extension[] {
  return [
    // 格式扩展（Button）
    new BoldExtension(),
    new ItalicExtension(),
    new UnderlineExtension(),
    new StrikethroughExtension(),
    new Heading1Extension(),
    new Heading2Extension(),
    new Heading3Extension(),
    new BlockquoteExtension(),

    // 插入类扩展（Button + Form）
    new LinkExtension(),
    new ImageExtension(),
    new EmojiExtension(),

    // BubbleMenu 专用扩展
    new TranslateExtension(),
    new CopyExtension(),

    // 纯逻辑扩展
    new WordCountExtension(),
    new AutoSaveExtension({
      intervalMs: options?.autoSaveIntervalMs,
      storageKey: options?.autoSaveStorageKey,
    }),
  ];
}
