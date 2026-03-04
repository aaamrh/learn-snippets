import type { Plugin, PluginContext } from "../types";

/**
 * 字数统计插件 — 推送订阅模式（对标 Tiptap）
 *
 * 旧方案（宿主轮询型）:
 *   extensions['editor:status-bar'] → 宿主每次内容变化都调用 invokeExtension 来问插件
 *   问题：宿主必须主动轮询，toolbar/panel/status-bar 全部一起拉，即使没变化
 *
 * 新方案（插件订阅型，对标 Tiptap）:
 *   activate 时订阅 'content:change' → 内容变化时自己计算 → emit 结果给宿主
 *   宿主只需 on('ui:status-bar:update') 接收，不主动问任何人
 *
 * 对标 Tiptap 的 addProseMirrorPlugins():
 *   Tiptap 扩展通过 ProseMirror Plugin 的 view.update() 钩子感知文档变化，
 *   自己计算、自己更新，宿主（编辑器）完全不感知。
 *   此处简化为事件总线订阅，原理完全相同：
 *     扩展自己订阅变化 → 自己计算 → 自己推结果
 */

function calcWordCount(content: string): number {
  const chineseCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWordCount = content
    .replace(/[\u4e00-\u9fa5]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return chineseCount + englishWordCount;
}

export const wordCountPlugin: Plugin = {
  id: "word-count",
  name: "Word Count",
  version: "1.0.0",

  activate(context: PluginContext) {
    // 插件自己订阅内容变化，不等宿主来问
    // 每次内容变化：自己算字数 → 把结果推给宿主
    // 宿主通过 host.on('ui:status-bar:update') 接收，不感知是谁算的
    const onContentChange = (content: string) => {
      const value = calcWordCount(content);
      context.emit("ui:status-bar:update", { id: "word-count", label: "字数", value });
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
    // 通知宿主把自己的条目从 statusBarMap 里删除
    // 否则宿主 Map 里的旧数据还在，停用后徽章不会消失
    context.emit("ui:status-bar:remove", { id: "word-count" });
  },
};
