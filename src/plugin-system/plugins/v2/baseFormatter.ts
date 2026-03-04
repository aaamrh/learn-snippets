// ==================== Base Formatter Plugin (v2 Manifest 格式) ====================
//
// 基础文本格式化插件 — 作为其他格式化插件的依赖
//
// 对标 VS Code 插件间依赖机制：
// - 提供基础格式化能力（trim、标准化空格、移除多余空行等）
// - 其他格式化插件（如 markdownFormatter）声明 dependencies: ["base-formatter"]
// - 安装时宿主自动检查依赖、激活时先激活依赖
//
// Manifest（定义在 manifest-types.ts 的 EXAMPLE_BASE_FORMATTER_MANIFEST）：
// - id: "base-formatter"
// - activationEvents: ["onCommand:base-formatter.formatText"]
// - permissions: ["commands:register", "editor:getSelectedText", "editor:replaceSelection"]
// - contributes.commands: [{ command: "base-formatter.formatText", title: "基础格式化", icon: "📐" }]
//
// 教学要点：
// - 演示插件间依赖：本插件是被依赖方（provider）
// - 其他插件通过 api.commands.executeCommand("base-formatter.formatText", text) 调用
// - 命令支持传参和返回值（输入原始文本，返回格式化后的文本）

import type { PluginEntry, PluginAPI } from "../../manifest-types";

// ==================== 格式化规则 ====================

/**
 * 格式化选项
 */
interface FormatOptions {
  /** 是否 trim 首尾空白（默认 true） */
  trim?: boolean;
  /** 是否标准化空格（连续空格合并为一个，默认 true） */
  normalizeSpaces?: boolean;
  /** 是否移除多余空行（连续 3+ 空行合并为 2 空行，默认 true） */
  collapseBlankLines?: boolean;
  /** 是否修复中英文之间的空格（默认 true） */
  fixCjkSpacing?: boolean;
  /** 是否移除行尾空白（默认 true） */
  trimTrailingWhitespace?: boolean;
  /** 是否确保文件末尾有一个换行（默认 true） */
  ensureFinalNewline?: boolean;
}

/**
 * 默认格式化选项
 */
const DEFAULT_OPTIONS: Required<FormatOptions> = {
  trim: true,
  normalizeSpaces: true,
  collapseBlankLines: true,
  fixCjkSpacing: true,
  trimTrailingWhitespace: true,
  ensureFinalNewline: true,
};

// ==================== 格式化函数 ====================

/**
 * 执行基础文本格式化
 *
 * 按以下顺序应用规则：
 * 1. trim 首尾空白
 * 2. 行尾空白移除
 * 3. 标准化行内空格（不影响缩进）
 * 4. 合并多余空行
 * 5. 中英文空格修复
 * 6. 确保文件末尾换行
 *
 * @param text    原始文本
 * @param options 格式化选项
 * @returns 格式化后的文本
 */
function formatText(text: string, options: FormatOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!text) return text;

  let result = text;

  // 1. trim 首尾空白
  if (opts.trim) {
    result = result.trim();
  }

  // 2. 行尾空白移除
  if (opts.trimTrailingWhitespace) {
    result = result
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");
  }

  // 3. 标准化行内空格（保留缩进，只处理非缩进部分的连续空格）
  if (opts.normalizeSpaces) {
    result = result
      .split("\n")
      .map((line) => {
        // 保留行首缩进
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "";
        const content = line.slice(indent.length);

        // 合并连续空格为一个（不影响缩进）
        const normalizedContent = content.replace(/ {2,}/g, " ");

        return indent + normalizedContent;
      })
      .join("\n");
  }

  // 4. 合并多余空行（连续 3+ 空行 → 2 空行）
  if (opts.collapseBlankLines) {
    result = result.replace(/\n{4,}/g, "\n\n\n");
  }

  // 5. 中英文空格修复
  // 在中文字符和英文/数字之间添加空格（如果没有的话）
  if (opts.fixCjkSpacing) {
    // 中文后面紧跟英文/数字 → 加空格
    result = result.replace(
      /([\u4e00-\u9fff\u3400-\u4dbf])([a-zA-Z0-9])/g,
      "$1 $2",
    );
    // 英文/数字后面紧跟中文 → 加空格
    result = result.replace(
      /([a-zA-Z0-9])([\u4e00-\u9fff\u3400-\u4dbf])/g,
      "$1 $2",
    );
    // 中文后面紧跟左括号 → 加空格
    result = result.replace(
      /([\u4e00-\u9fff\u3400-\u4dbf])(\()/g,
      "$1 $2",
    );
    // 右括号后面紧跟中文 → 加空格
    result = result.replace(
      /(\))([\u4e00-\u9fff\u3400-\u4dbf])/g,
      "$1 $2",
    );
  }

  // 6. 确保文件末尾有换行
  if (opts.ensureFinalNewline && result.length > 0 && !result.endsWith("\n")) {
    result += "\n";
  }

  return result;
}

/**
 * 获取格式化变更的摘要信息
 *
 * 比较原始文本和格式化后的文本，生成人类可读的变更描述。
 *
 * @param original  原始文本
 * @param formatted 格式化后的文本
 * @returns 变更描述列表
 */
function getChangeSummary(original: string, formatted: string): string[] {
  const changes: string[] = [];

  if (original === formatted) {
    changes.push("文本已经是规范格式，无需修改");
    return changes;
  }

  // 字符数变化
  const charDiff = formatted.length - original.length;
  if (charDiff !== 0) {
    changes.push(
      charDiff > 0
        ? `增加了 ${charDiff} 个字符`
        : `减少了 ${Math.abs(charDiff)} 个字符`,
    );
  }

  // 行数变化
  const originalLines = original.split("\n").length;
  const formattedLines = formatted.split("\n").length;
  const lineDiff = formattedLines - originalLines;
  if (lineDiff !== 0) {
    changes.push(
      lineDiff > 0
        ? `增加了 ${lineDiff} 行`
        : `减少了 ${Math.abs(lineDiff)} 行`,
    );
  }

  // 检测具体变更类型
  if (original !== original.trim() && formatted === formatted.trim()) {
    changes.push("移除了首尾空白");
  }

  if (/  +/.test(original) && !/  +/.test(formatted.replace(/^ +/gm, ""))) {
    changes.push("标准化了空格");
  }

  if (/\n{4,}/.test(original) && !/\n{4,}/.test(formatted)) {
    changes.push("合并了多余空行");
  }

  // 中英文空格
  const cjkSpacePattern = /([\u4e00-\u9fff])([a-zA-Z0-9])|([a-zA-Z0-9])([\u4e00-\u9fff])/;
  if (cjkSpacePattern.test(original) && !cjkSpacePattern.test(formatted)) {
    changes.push("修复了中英文间距");
  }

  if (changes.length === 0) {
    changes.push("进行了微小的格式调整");
  }

  return changes;
}

// ==================== 插件入口 ====================

const baseFormatterPlugin: PluginEntry = {
  /**
   * 激活阶段
   *
   * 注册 "base-formatter.formatText" 命令的处理器。
   *
   * 命令用法（被依赖方调用）：
   * ```ts
   * // 方式 1：格式化传入的文本并返回结果
   * const result = await api.commands.executeCommand("base-formatter.formatText", text);
   * // result = { formatted: "...", changes: ["..."] }
   *
   * // 方式 2：不传参时格式化当前选中文字
   * await api.commands.executeCommand("base-formatter.formatText");
   * ```
   */
  activate(api: PluginAPI): void {
    api.commands.registerCommand(
      "base-formatter.formatText",
      async (...args: unknown[]) => {
        // 判断调用模式
        if (args.length > 0 && typeof args[0] === "string") {
          // 模式 1：格式化传入的文本（被其他插件调用）
          const inputText = args[0] as string;
          const options = (args[1] as FormatOptions) ?? {};
          const formatted = formatText(inputText, options);
          const changes = getChangeSummary(inputText, formatted);

          console.log(
            `[BaseFormatter] Formatted text (${inputText.length} → ${formatted.length} chars). ` +
              `Changes: ${changes.join(", ")}`,
          );

          return { formatted, changes };
        }

        // 模式 2：格式化当前选中文字（直接用户操作）
        const selectedText = await api.editor.getSelectedText();

        if (!selectedText || selectedText.trim() === "") {
          console.log("[BaseFormatter] No text selected, skipping.");
          return { formatted: "", changes: ["没有选中文字"] };
        }

        const formatted = formatText(selectedText);
        const changes = getChangeSummary(selectedText, formatted);

        if (selectedText !== formatted) {
          await api.editor.replaceSelection(formatted);
          console.log(
            `[BaseFormatter] Replaced selection. Changes: ${changes.join(", ")}`,
          );
        } else {
          console.log("[BaseFormatter] Text already formatted, no changes needed.");
        }

        return { formatted, changes };
      },
    );

    console.log("[BaseFormatter] Plugin activated. Command registered.");
  },

  /**
   * 停用阶段
   *
   * 命令处理器通过 Disposable 自动清理。
   */
  deactivate(): void {
    console.log("[BaseFormatter] Plugin deactivated.");
  },
};

export default baseFormatterPlugin;
