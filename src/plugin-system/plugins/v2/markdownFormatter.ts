// ==================== Markdown Formatter Plugin (v2 Manifest 格式) ====================
//
// Markdown 格式化插件 — 依赖 base-formatter 的高级格式化
//
// 对标 VS Code 插件间依赖机制：
// - 声明 dependencies: ["base-formatter"]
// - 激活时宿主自动先激活 base-formatter
// - 通过 api.commands.executeCommand("base-formatter.formatText", text) 调用基础格式化
// - 在基础格式化结果上叠加 Markdown 专用格式化规则
//
// Manifest（定义在 manifest-types.ts 的 EXAMPLE_MARKDOWN_FORMATTER_MANIFEST）：
// - id: "markdown-formatter"
// - activationEvents: ["onCommand:markdown-formatter.format"]
// - permissions: ["commands:register", "commands:execute", "editor:getSelectedText",
//                 "editor:replaceSelection", "ui:selectionToolbar"]
// - dependencies: ["base-formatter"]
// - contributes.commands: [{ command: "markdown-formatter.format", title: "Markdown 格式化", icon: "📝" }]
// - contributes.selectionToolbar: [{ command: "markdown-formatter.format", title: "MD 格式化", ... }]
// - contributes.menus: [{ command: "markdown-formatter.format", group: "editor/context", ... }]
//
// 教学要点：
// - 演示插件间依赖：本插件是依赖方（consumer）
// - 演示 api.commands.executeCommand 调用其他插件的命令（带参数和返回值）
// - 演示如何在一个插件的结果基础上叠加另一个插件的处理
// - 演示 selectionToolbar + menus 的双重 UI 入口

import type { PluginEntry, PluginAPI } from "../../manifest-types";

// ==================== Markdown 格式化规则 ====================

/**
 * Markdown 格式化结果
 */
interface MarkdownFormatResult {
  /** 格式化后的文本 */
  formatted: string;
  /** 应用的规则列表 */
  appliedRules: string[];
  /** 是否有变更 */
  hasChanges: boolean;
}

/**
 * 标准化 Markdown 标题格式
 *
 * 规则：
 * - # 后面必须有一个空格
 * - 标题前后各有一个空行（首行标题除外）
 * - 移除标题末尾的 # 符号（如 "## Title ##" → "## Title"）
 *
 * @param text 输入文本
 * @returns 格式化后的文本
 */
function formatHeadings(text: string): { text: string; changed: boolean } {
  let result = text;
  const original = text;

  // # 后面必须有空格
  result = result.replace(/^(#{1,6})([^ #\n])/gm, "$1 $2");

  // 移除标题末尾的 # 符号
  result = result.replace(/^(#{1,6}\s+.*?)\s+#+\s*$/gm, "$1");

  return { text: result, changed: result !== original };
}

/**
 * 标准化 Markdown 列表格式
 *
 * 规则：
 * - 无序列表统一使用 - 符号（替换 * 和 +）
 * - 列表项标记后必须有一个空格
 * - 嵌套列表缩进标准化为 2 空格
 *
 * @param text 输入文本
 * @returns 格式化后的文本
 */
function formatLists(text: string): { text: string; changed: boolean } {
  let result = text;
  const original = text;

  // 统一无序列表符号为 -
  result = result.replace(/^(\s*)[*+](\s)/gm, "$1-$2");

  // 列表项标记后确保有空格
  result = result.replace(/^(\s*)-([^ \n])/gm, "$1- $2");

  // 有序列表标记后确保有空格
  result = result.replace(/^(\s*)(\d+\.)([^ \n])/gm, "$1$2 $3");

  return { text: result, changed: result !== original };
}

/**
 * 标准化 Markdown 强调格式
 *
 * 规则：
 * - 粗体统一使用 **（替换 __）
 * - 斜体统一使用 *（替换 _，仅在单词级别使用时）
 * - 修复不配对的强调标记
 *
 * @param text 输入文本
 * @returns 格式化后的文本
 */
function formatEmphasis(text: string): { text: string; changed: boolean } {
  let result = text;
  const original = text;

  // __text__ → **text**（粗体）
  result = result.replace(/__([^_\n]+?)__/g, "**$1**");

  // _text_（仅在非单词字符边界时）→ *text*（斜体）
  // 只替换被空格或行首/行尾包围的 _text_ 模式，避免误伤 snake_case
  result = result.replace(/(?<=^|[\s(])\b_([^_\n]+?)_\b(?=$|[\s).,!?;:])/gm, "*$1*");

  return { text: result, changed: result !== original };
}

/**
 * 标准化 Markdown 代码块格式
 *
 * 规则：
 * - 代码块前后各有一个空行
 * - 行内代码前后各有一个空格（中文字符除外）
 *
 * @param text 输入文本
 * @returns 格式化后的文本
 */
function formatCodeBlocks(text: string): { text: string; changed: boolean } {
  let result = text;
  const original = text;

  // 代码块前后确保有空行
  // 处理 ```...``` 代码块
  result = result.replace(/([^\n])\n(```)/g, "$1\n\n$2");
  result = result.replace(/(```[^\n]*\n(?:[\s\S]*?)```)\n([^\n])/g, "$1\n\n$2");

  return { text: result, changed: result !== original };
}

/**
 * 标准化 Markdown 链接格式
 *
 * 规则：
 * - 裸 URL 转换为 Markdown 链接格式
 * - 修复链接文本和 URL 之间的空格
 *
 * @param text 输入文本
 * @returns 格式化后的文本
 */
function formatLinks(text: string): { text: string; changed: boolean } {
  let result = text;
  const original = text;

  // 修复 [text] (url) 中间多余的空格 → [text](url)
  result = result.replace(/\]\s+\(/g, "](");

  // 裸 URL 转换为链接（但不在已有的 []() 或 <> 中的 URL）
  // 只处理行首或被空格包围的 URL
  result = result.replace(
    /(?<![(\[<])(https?:\/\/[^\s<>\]\)]+)(?![)\]>])/g,
    (match, url: string) => {
      // 如果 URL 前面已经有 ]( 说明已经在链接中，不处理
      const shortUrl = shortenUrlForDisplay(url);
      return `[${shortUrl}](${url})`;
    },
  );

  return { text: result, changed: result !== original };
}

/**
 * 缩短 URL 用于链接显示文本
 */
function shortenUrlForDisplay(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname;

    if (path === "/" || path === "") {
      return host;
    }

    if (url.length > 50) {
      return `${host}/...`;
    }

    return `${host}${path}`;
  } catch {
    return url.length > 40 ? url.slice(0, 37) + "..." : url;
  }
}

/**
 * 标准化 Markdown 段落间距
 *
 * 规则：
 * - 段落之间确保有一个空行
 * - 块级元素（标题、列表、代码块、引用）前后各有一个空行
 *
 * @param text 输入文本
 * @returns 格式化后的文本
 */
function formatParagraphSpacing(text: string): { text: string; changed: boolean } {
  let result = text;
  const original = text;

  // 标题前确保有空行（但不是文档开头）
  result = result.replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2");

  // 标题后确保有空行
  result = result.replace(/^(#{1,6}\s+[^\n]+)\n([^#\n])/gm, "$1\n\n$2");

  // 引用块前后确保有空行
  result = result.replace(/([^\n>])\n(>)/g, "$1\n\n$2");

  // 水平线前后确保有空行
  result = result.replace(/([^\n])\n(---+|===+|\*\*\*+)\n/g, "$1\n\n$2\n");
  result = result.replace(/\n(---+|===+|\*\*\*+)\n([^\n])/g, "\n$1\n\n$2");

  return { text: result, changed: result !== original };
}

/**
 * 应用所有 Markdown 格式化规则
 *
 * @param text    输入文本
 * @returns 格式化结果
 */
function applyMarkdownRules(text: string): MarkdownFormatResult {
  const appliedRules: string[] = [];
  let current = text;

  // 按顺序应用规则
  const rules = [
    { name: "标题格式化", fn: formatHeadings },
    { name: "列表格式化", fn: formatLists },
    { name: "强调格式化", fn: formatEmphasis },
    { name: "代码块格式化", fn: formatCodeBlocks },
    { name: "链接格式化", fn: formatLinks },
    { name: "段落间距", fn: formatParagraphSpacing },
  ];

  for (const rule of rules) {
    const result = rule.fn(current);
    if (result.changed) {
      current = result.text;
      appliedRules.push(rule.name);
    }
  }

  return {
    formatted: current,
    appliedRules,
    hasChanges: current !== text,
  };
}

// ==================== 插件入口 ====================

const markdownFormatterPlugin: PluginEntry = {
  /**
   * 激活阶段
   *
   * 注册 "markdown-formatter.format" 命令的处理器。
   *
   * 流程：
   * 1. 获取选中文字
   * 2. 调用 base-formatter 进行基础格式化（通过 commands.executeCommand）
   * 3. 在基础格式化结果上应用 Markdown 专用规则
   * 4. 用最终结果替换选中文字
   *
   * 这体现了插件间依赖的核心模式：
   * - markdownFormatter 不重复实现基础格式化逻辑
   * - 通过命令系统调用 base-formatter 的能力
   * - 各插件职责单一，组合使用
   */
  activate(api: PluginAPI): void {
    api.commands.registerCommand("markdown-formatter.format", async () => {
      // 1. 获取选中文字
      const selectedText = await api.editor.getSelectedText();

      if (!selectedText || selectedText.trim() === "") {
        console.log("[MarkdownFormatter] No text selected, skipping.");
        return {
          success: false,
          reason: "no-selection",
        };
      }

      console.log(
        `[MarkdownFormatter] Formatting ${selectedText.length} chars of Markdown text...`,
      );

      try {
        // 2. 调用 base-formatter 进行基础格式化
        //    这是插件间依赖的核心：通过 executeCommand 调用另一个插件的命令
        const baseResult = (await api.commands.executeCommand(
          "base-formatter.formatText",
          selectedText,
        )) as { formatted: string; changes: string[] } | undefined;

        // 使用基础格式化的结果（如果 base-formatter 没有激活或不可用，则使用原始文本）
        const baseFormatted = baseResult?.formatted ?? selectedText;
        const baseChanges = baseResult?.changes ?? [];

        console.log(
          `[MarkdownFormatter] Base formatting applied. Changes: ${baseChanges.join(", ") || "none"}`,
        );

        // 3. 应用 Markdown 专用规则
        const mdResult = applyMarkdownRules(baseFormatted);

        console.log(
          `[MarkdownFormatter] Markdown rules applied: ${mdResult.appliedRules.join(", ") || "none"}`,
        );

        // 4. 用最终结果替换选中文字
        const finalText = mdResult.formatted;

        if (finalText !== selectedText) {
          await api.editor.replaceSelection(finalText);

          const allChanges = [...baseChanges, ...mdResult.appliedRules];
          console.log(
            `[MarkdownFormatter] Replaced selection. All changes: ${allChanges.join(", ")}`,
          );

          return {
            success: true,
            originalLength: selectedText.length,
            formattedLength: finalText.length,
            baseChanges,
            markdownRules: mdResult.appliedRules,
          };
        } else {
          console.log("[MarkdownFormatter] Text already formatted, no changes needed.");
          return {
            success: true,
            originalLength: selectedText.length,
            formattedLength: finalText.length,
            baseChanges: [],
            markdownRules: [],
            message: "Text already formatted",
          };
        }
      } catch (error) {
        console.error("[MarkdownFormatter] Error during formatting:", error);

        // 如果 base-formatter 不可用，仍然尝试应用 Markdown 规则
        console.log(
          "[MarkdownFormatter] Falling back to Markdown-only formatting (base-formatter unavailable).",
        );

        const mdResult = applyMarkdownRules(selectedText);
        if (mdResult.hasChanges) {
          await api.editor.replaceSelection(mdResult.formatted);
        }

        return {
          success: mdResult.hasChanges,
          fallback: true,
          markdownRules: mdResult.appliedRules,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log(
      "[MarkdownFormatter] Plugin activated. Command registered. Depends on: base-formatter.",
    );
  },

  /**
   * 停用阶段
   *
   * 命令处理器通过 Disposable 自动清理。
   */
  deactivate(): void {
    console.log("[MarkdownFormatter] Plugin deactivated.");
  },
};

export default markdownFormatterPlugin;
