// ==================== Copy as Markdown Plugin (v2 Manifest 格式) ====================
//
// 选中文字后复制为 Markdown 格式到剪贴板
//
// 对标 VS Code 插件的 extension.ts：
// - 导出 activate / deactivate
// - 在 activate 中通过 api.commands.registerCommand 注册命令处理器
// - 命令 ID 必须与 Manifest contributes.commands 中声明的一致
//
// Manifest（定义在 manifest-types.ts 的 EXAMPLE_COPY_MARKDOWN_MANIFEST）：
// - id: "copy-as-markdown"
// - activationEvents: ["onCommand:copy-as-markdown.copy"]
// - permissions: ["editor:getSelectedText", "commands:register", "ui:selectionToolbar"]
// - contributes.commands: [{ command: "copy-as-markdown.copy", title: "复制为 Markdown", icon: "📋" }]
// - contributes.selectionToolbar: [{ command: "copy-as-markdown.copy", title: "复制 MD", icon: "📋", when: "editorHasSelection", priority: 20 }]

import type { PluginEntry, PluginAPI } from "../../manifest-types";

// ==================== Markdown 转换工具 ====================

/**
 * 检测文本中的模式并转换为 Markdown 格式
 *
 * 支持的转换规则：
 * 1. 多行文本 → 保留换行（每行末尾加两个空格实现 Markdown 换行）
 * 2. 检测 URL → 转换为 Markdown 链接 [url](url)
 * 3. 检测 email → 转换为 Markdown 链接 [email](mailto:email)
 * 4. 检测列表格式（以 - / * / 数字. 开头的行） → 保持为 Markdown 列表
 * 5. 检测代码关键字（function / const / import 等） → 包裹为行内代码
 * 6. 纯文本 → 原样输出
 *
 * 在真实场景中，可以做更复杂的 HTML → Markdown 转换（如 Turndown 库）
 * Demo 中用简单规则模拟，避免外部依赖
 */
function textToMarkdown(text: string): string {
  if (!text || text.trim() === "") return text;

  const lines = text.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    result.push(processLine(line));
  }

  return result.join("\n");
}

/**
 * 处理单行文本
 */
function processLine(line: string): string {
  let processed = line;

  // 1. URL 转换为 Markdown 链接
  // 匹配 http:// 或 https:// 开头的 URL
  processed = processed.replace(
    /https?:\/\/[^\s<>\"\'\)\]]+/g,
    (url) => `[${shortenUrl(url)}](${url})`
  );

  // 2. Email 转换为 Markdown 链接
  processed = processed.replace(
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    (email) => `[${email}](mailto:${email})`
  );

  // 3. 检测代码关键字，包裹为行内代码
  // 只有当行内出现编程关键字且不在列表项中时才处理
  const codeKeywords =
    /\b(function|const|let|var|import|export|return|class|interface|type|async|await|if|else|for|while|switch|case|break|continue|try|catch|throw|new|this|typeof|instanceof|null|undefined|true|false|void|enum|implements|extends|static|private|public|protected|readonly)\b/;

  if (codeKeywords.test(processed) && !isListItem(processed)) {
    // 检查是否整行看起来像代码
    if (looksLikeCode(processed)) {
      processed = "`" + processed.trim() + "`";
    } else {
      // 只包裹关键字部分
      processed = processed.replace(codeKeywords, (keyword) => "`" + keyword + "`");
    }
  }

  // 4. 列表项保持原样（已经是 Markdown 列表格式）
  // - xxx / * xxx / 1. xxx → 不需要额外处理

  return processed;
}

/**
 * 检测一行是否为列表项
 */
function isListItem(line: string): boolean {
  const trimmed = line.trimStart();
  return /^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
}

/**
 * 检测一行是否看起来像代码
 *
 * 启发式规则：
 * - 包含分号结尾
 * - 包含 = 赋值
 * - 包含 () 函数调用
 * - 包含 {} 代码块
 * - 包含 => 箭头函数
 */
function looksLikeCode(line: string): boolean {
  const trimmed = line.trim();
  // 如果行很长且包含多个代码特征，认为是代码行
  const codeIndicators = [
    /;\s*$/,           // 分号结尾
    /\s*=\s*/,         // 赋值
    /\(.*\)/,          // 函数调用
    /\{.*\}/,          // 代码块
    /=>/,              // 箭头函数
    /\/\//,            // 注释
    /\.\w+\(/,         // 方法调用
  ];

  let score = 0;
  for (const indicator of codeIndicators) {
    if (indicator.test(trimmed)) score++;
  }

  // 至少命中 2 个代码特征
  return score >= 2;
}

/**
 * 缩短 URL 用于显示
 * 例如 https://www.example.com/very/long/path → example.com/...
 */
function shortenUrl(url: string): string {
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
    // URL 解析失败，返回原始文本（截断）
    return url.length > 40 ? url.slice(0, 37) + "..." : url;
  }
}

// ==================== 剪贴板工具 ====================

/**
 * 复制文本到剪贴板
 *
 * 优先使用 Clipboard API（现代浏览器），
 * 降级到 document.execCommand("copy")（旧浏览器）
 *
 * @param text 要复制的文本
 * @returns 是否复制成功
 */
async function copyToClipboard(text: string): Promise<boolean> {
  // 方式 1: Clipboard API（推荐）
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API 失败（可能是权限问题），降级到方式 2
    }
  }

  // 方式 2: execCommand 降级方案
  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;

      // 确保 textarea 不可见且不影响布局
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";

      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);

      return success;
    } catch {
      return false;
    }
  }

  return false;
}

// ==================== 插件入口 ====================

const copyAsMarkdownPlugin: PluginEntry = {
  /**
   * 激活阶段
   *
   * 注册 "copy-as-markdown.copy" 命令的处理器。
   * 当用户点击 SelectionToolbar 的「复制 MD」按钮时，
   * PluginHost 会调用此命令。
   *
   * 流程：
   * 1. 获取选中文字（api.editor.getSelectedText）
   * 2. 将文字转换为 Markdown 格式
   * 3. 复制到剪贴板
   * 4. 通过事件通知宿主复制结果（可选）
   */
  activate(api: PluginAPI): void {
    // 注册命令处理器
    api.commands.registerCommand("copy-as-markdown.copy", async () => {
      // 1. 获取选中文字
      const selectedText = await api.editor.getSelectedText();

      if (!selectedText || selectedText.trim() === "") {
        console.log("[CopyAsMarkdown] No text selected, skipping.");
        return { success: false, reason: "no-selection" };
      }

      console.log(
        `[CopyAsMarkdown] Converting to Markdown: "${selectedText.slice(0, 50)}${selectedText.length > 50 ? "..." : ""}"`
      );

      try {
        // 2. 转换为 Markdown
        const markdown = textToMarkdown(selectedText);

        // 3. 复制到剪贴板
        const success = await copyToClipboard(markdown);

        if (success) {
          console.log(
            `[CopyAsMarkdown] Copied to clipboard (${markdown.length} chars)`
          );

          // 4. 通过事件通知宿主（UI 可以显示 toast 提示）
          api.events.emit("copy-as-markdown:copied", {
            originalLength: selectedText.length,
            markdownLength: markdown.length,
            preview:
              markdown.length > 100
                ? markdown.slice(0, 97) + "..."
                : markdown,
          });

          return { success: true, length: markdown.length };
        } else {
          console.warn("[CopyAsMarkdown] Failed to copy to clipboard.");
          return { success: false, reason: "clipboard-failed" };
        }
      } catch (error) {
        console.error("[CopyAsMarkdown] Error:", error);
        return {
          success: false,
          reason: "error",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log("[CopyAsMarkdown] Plugin activated. Command registered.");
  },

  /**
   * 停用阶段
   *
   * 命令处理器通过 Disposable 自动清理，
   * 此处不需要额外清理逻辑。
   */
  deactivate(): void {
    console.log("[CopyAsMarkdown] Plugin deactivated.");
  },
};

export default copyAsMarkdownPlugin;
