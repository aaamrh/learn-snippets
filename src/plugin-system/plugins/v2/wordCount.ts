// ==================== Word Count Plugin (v2 Manifest 格式) ====================
//
// 实时显示编辑器内容的字数统计
//
// 对标 VS Code 的字数统计扩展：
// - 在状态栏显示当前文档的字数/字符数
// - 监听内容变化事件，实时更新统计
// - 通过 api.statusBar.update 更新状态栏显示
//
// Manifest（定义在 manifest-types.ts 的 EXAMPLE_WORD_COUNT_MANIFEST）：
// - id: "word-count"
// - activationEvents: ["onStartup"]
// - permissions: ["editor:getContent", "events:on", "statusBar:update"]
// - contributes.statusBar: [{ id: "word-count.counter", text: "字数: 0", alignment: "left", priority: 100 }]

import type { PluginEntry, PluginAPI } from "../../manifest-types";

// ==================== 字数统计工具 ====================

/**
 * 统计结果
 */
interface WordCountResult {
  /** 总字符数（含空格） */
  chars: number;
  /** 总字符数（不含空格） */
  charsNoSpace: number;
  /** 中文字数 */
  chineseChars: number;
  /** 英文单词数 */
  englishWords: number;
  /** 行数 */
  lines: number;
  /** 段落数（非空行数） */
  paragraphs: number;
}

/**
 * 统计文本的字数信息
 *
 * 统计规则：
 * - 中文字符按个数计算（每个汉字算 1 个字）
 * - 英文按空格分词（每个单词算 1 个词）
 * - 数字按连续数字序列计算（每段算 1 个词）
 * - 标点符号不计入字数
 *
 * @param text 要统计的文本
 * @returns 统计结果
 */
function countWords(text: string): WordCountResult {
  if (!text || text.trim() === "") {
    return {
      chars: 0,
      charsNoSpace: 0,
      chineseChars: 0,
      englishWords: 0,
      lines: 0,
      paragraphs: 0,
    };
  }

  // 总字符数
  const chars = text.length;

  // 不含空格的字符数
  const charsNoSpace = text.replace(/\s/g, "").length;

  // 中文字符数（CJK 统一表意文字）
  const chineseMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
  const chineseChars = chineseMatches ? chineseMatches.length : 0;

  // 英文单词数
  // 先移除中文字符，再按空格分词
  const textWithoutChinese = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ");
  const englishMatches = textWithoutChinese.match(/[a-zA-Z]+/g);
  const englishWords = englishMatches ? englishMatches.length : 0;

  // 行数
  const lines = text.split("\n").length;

  // 段落数（非空行数）
  const paragraphs = text.split("\n").filter((line) => line.trim().length > 0).length;

  return {
    chars,
    charsNoSpace,
    chineseChars,
    englishWords,
    lines,
    paragraphs,
  };
}

/**
 * 格式化统计结果为显示文本
 *
 * 短格式：用于状态栏（空间有限）
 * 长格式：用于 tooltip 或详情面板
 */
function formatCount(result: WordCountResult, format: "short" | "long" = "short"): string {
  const totalWords = result.chineseChars + result.englishWords;

  if (format === "short") {
    // 状态栏简短格式
    if (totalWords === 0) {
      return "字数: 0";
    }
    return `字数: ${totalWords}`;
  }

  // 详细格式
  return [
    `总字数: ${totalWords}`,
    `中文: ${result.chineseChars}`,
    `英文: ${result.englishWords} 词`,
    `字符: ${result.chars}`,
    `行: ${result.lines}`,
    `段落: ${result.paragraphs}`,
  ].join(" | ");
}

// ==================== 插件入口 ====================

/** 模块级变量：保存 debounceTimer 引用，供 deactivate 清理 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const wordCountPlugin: PluginEntry = {
  /**
   * 激活阶段
   *
   * 流程：
   * 1. 获取当前编辑器内容，初始化统计
   * 2. 更新状态栏
   * 3. 监听 content:change 事件，实时更新统计
   */
  activate(api: PluginAPI): void {
    const STATUS_BAR_ID = "word-count.counter";

    /**
     * 更新字数统计并刷新状态栏
     */
    async function updateCount(): Promise<void> {
      try {
        const content = await api.editor.getContent();
        const result = countWords(content);
        const label = formatCount(result, "short");
        const detail = formatCount(result, "long");

        api.statusBar.update(STATUS_BAR_ID, {
          label,
          value: detail,
          icon: "📊",
        });
      } catch (error) {
        console.error("[WordCount] Error updating count:", error);
        api.statusBar.update(STATUS_BAR_ID, {
          label: "字数: --",
          icon: "📊",
        });
      }
    }

    // 1. 初始化统计
    updateCount();

    // 2. 监听内容变化事件
    // 使用防抖，避免高频输入时频繁统计
    const DEBOUNCE_MS = 300;

    api.events.on("content:change", () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        updateCount();
        debounceTimer = null;
      }, DEBOUNCE_MS);
    });

    // 3. 也监听 selection 变化（选中文字时显示选中字数）
    api.events.on("editor:selection-change", async () => {
      try {
        const selectedText = await api.editor.getSelectedText();

        if (selectedText && selectedText.length > 0) {
          // 有选中文字，显示选中字数
          const selectedResult = countWords(selectedText);
          const selectedTotal = selectedResult.chineseChars + selectedResult.englishWords;
          const content = await api.editor.getContent();
          const totalResult = countWords(content);
          const totalWords = totalResult.chineseChars + totalResult.englishWords;

          api.statusBar.update(STATUS_BAR_ID, {
            label: `选中: ${selectedTotal} / 总计: ${totalWords}`,
            value: `选中 ${selectedResult.chars} 字符`,
            icon: "📊",
          });
        } else {
          // 无选中，显示总字数
          updateCount();
        }
      } catch {
        // 忽略选区变化时的错误（可能是快速切换导致）
      }
    });

    console.log("[WordCount] Plugin activated. Listening for content changes.");
  },

  /**
   * 停用阶段
   *
   * 事件监听通过 Disposable 自动清理。
   * 清除状态栏显示。
   */
  deactivate(): void {
    // 清理防抖定时器，防止停用后残余的 setTimeout 回调继续更新状态栏
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    console.log("[WordCount] Plugin deactivated.");
  },
};

export default wordCountPlugin;
