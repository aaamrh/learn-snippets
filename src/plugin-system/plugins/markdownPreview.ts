import type { Plugin, PluginContext } from "../types";

/**
 * Markdown 预览插件 — 推送订阅模式（对标 Tiptap）
 *
 * 旧方案（宿主轮询型）:
 *   extensions['editor:panel'] → 宿主每次内容变化都调用 invokeExtension('editor:panel', { content })
 *   问题：宿主必须主动轮询，且同时拉取所有扩展点（toolbar/panel/status-bar 一起拉）
 *
 * 新方案（插件订阅型，对标 Tiptap）:
 *   activate 时订阅 'content:change' → 内容变化时自己转 HTML → emit 结果给宿主
 *   宿主只需 on('ui:panel:update') 接收，不主动问任何人
 *
 * dependencies 也一并删除：
 *   旧版依赖 word-count 是因为注册顺序影响扩展点执行顺序，
 *   新版各插件完全独立订阅事件，不存在顺序依赖
 */

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

export const markdownPreviewPlugin: Plugin = {
  id: "markdown-preview",
  name: "Markdown Preview",
  version: "1.0.0",

  // dependencies 删除：新方案各插件通过事件总线独立通信，无注册顺序依赖

  activate(context: PluginContext) {
    // 插件自己订阅内容变化，不等宿主来问
    // 每次内容变化：自己转 HTML → 把结果推给宿主
    // 宿主通过 host.on('ui:panel:update') 接收，不感知是谁转的
    const onContentChange = (content: string) => {
      context.emit("ui:panel:update", {
        id: "markdown-preview",
        title: "Markdown 预览",
        html: markdownToHtml(content),
      });
    };

    context.on("content:change", onContentChange);
    // 存入 state 供 deactivate 时取出解绑
    context.state.set("onContentChange", onContentChange);
  },

  deactivate(context?: PluginContext) {
    if (!context) return;
    // 停用时必须解绑，否则插件停用后仍会收到事件并推送数据
    const onContentChange = context.state.get("onContentChange");
    if (onContentChange) {
      context.off("content:change", onContentChange);
    }
    // 通知宿主把自己的面板从 panelMap 里删除
    // 否则宿主 Map 里的旧数据还在，停用后预览面板不会消失
    context.emit("ui:panel:remove", { id: "markdown-preview" });
  },
};
