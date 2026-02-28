import { Plugin } from "../types";

/**
 * 字数统计插件
 *
 * 工作方式：向 'editor:status-bar' 扩展点贡献一个 handler，
 * 宿主渲染状态栏时调用 invokeExtension('editor:status-bar', { content })，
 * 本插件返回 { label: '字数', value: 42 }，宿主拿到结果渲染到界面上。
 *
 * 为什么用 extensions 而不是 activate？
 *   因为它需要向宿主的"状态栏槽位"贡献数据，
 *   宿主主动来问"状态栏要显示什么"，插件被动回答。
 *   这是"拉取模式"——宿主触发扩展点，插件被动提供数据。
 *
 *   对比 autoSave：
 *     autoSave  → 推送模式，插件自己监听事件、主动干活
 *     wordCount → 拉取模式，宿主触发扩展点，插件被动提供数据
 */
export const wordCountPlugin: Plugin = {
  id: "word-count",
  name: "Word Count",
  version: "1.0.0",

  extensions: {
    /**
     * 'editor:status-bar' 扩展点
     * 宿主调用：host.invokeExtension('editor:status-bar', { content })
     * 本插件返回：{ label: '字数', value: number }
     */
    "editor:status-bar": {
      priority: 10,
      handler: ({ content }: { content: string }) => {
        const chineseCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWordCount = content
          .replace(/[\u4e00-\u9fa5]/g, "")
          .trim()
          .split(/\s+/)
          .filter(Boolean).length;

        const total = chineseCount + englishWordCount;

        return {
          label: "字数",
          value: total,
        };
      },
    },
  },
};
