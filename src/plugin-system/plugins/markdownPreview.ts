import { Plugin } from "../types";

function markdownToHtml(content: string): string {
  return content
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/\n(?!<h[1-6]|<li)/g, "<br />");
}

/**
 * Markdown 预览插件
 *
 * 工作方式：向 'editor:panel' 扩展点贡献一个 handler，
 * 宿主渲染面板区时调用 invokeExtension('editor:panel', { content })，
 * 本插件返回 { id, title, html }，宿主统一渲染。
 *
 * 为什么用 extensions 而不是 activate？
 *   因为需要向宿主"面板槽位"贡献渲染内容，
 *   宿主主动来问"面板区要展示什么"，插件被动回答 —— 拉取模式。
 */
export const markdownPreviewPlugin: Plugin = {
  id: "markdown-preview",
  name: "Markdown Preview",
  version: "1.0.0",

  dependencies: ["word-count"],

  extensions: {
    "editor:panel": {
      priority: 10,
      handler: ({ content }: { content: string }) => {
        return {
          id: "markdown-preview",
          title: "Markdown 预览",
          html: markdownToHtml(content),
        };
      },
    },
  },
};
