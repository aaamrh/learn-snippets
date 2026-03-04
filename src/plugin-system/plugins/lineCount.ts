import type { Plugin, PluginContext } from "../types";

/**
 * 行数统计插件 — 推送订阅模式（对标 Tiptap）
 *
 * 旧方案（宿主轮询型）:
 *   extensions['editor:status-bar'] → 宿主每次内容变化都调用 invokeExtension 来问插件
 *   问题：宿主必须主动轮询，所有扩展点全部一起拉，即使没变化
 *
 * 新方案（插件订阅型，对标 Tiptap）:
 *   activate 时订阅 'content:change' → 内容变化时自己计算 → emit 结果给宿主
 *   宿主只需 on('ui:status-bar:update') 接收，不主动问任何人
 *
 * 与 wordCount 的关系：
 *   两个插件都向同一个 'ui:status-bar:update' 事件推送数据，
 *   宿主收到后按 id 合并到 statusBarItems 数组里统一渲染。
 *   插件之间完全不知道对方的存在，宿主也不知道有多少个插件在推送。
 */

function calcLineCount(content: string): number {
  return content.split("\n").filter((line) => line.trim().length > 0).length;
}

export const lineCountPlugin: Plugin = {
  id: "line-count",
  name: "Line Count",
  version: "1.0.0",

  activate(context: PluginContext) {
    // 插件自己订阅内容变化，不等宿主来问
    // 每次内容变化：自己算行数 → 把结果推给宿主
    const onContentChange = (content: string) => {
      const value = calcLineCount(content);
      context.emit("ui:status-bar:update", { id: "line-count", label: "行数", value });
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
    context.emit("ui:status-bar:remove", { id: "line-count" });
  },
};
