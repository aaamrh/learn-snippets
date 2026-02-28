import { Plugin } from "../types";

/**
 * 行数统计插件
 *
 * 工作方式：向 'editor:status-bar' 扩展点贡献一个 handler，
 * 和 wordCountPlugin 贡献到同一个扩展点。
 *
 * 这就演示了"extensionPoints 的同一个 key 下有多个 handler"的场景：
 *   extensionPoints = {
 *     'editor:status-bar': [
 *       { priority: 10, handler: wordCount.handler },   // → { label: '字数', value: 42 }
 *       { priority: 8,  handler: lineCount.handler },   // → { label: '行数', value: 6 }
 *     ]
 *   }
 *
 * 宿主调用 invokeExtension('editor:status-bar', { content }) 时，
 * 两个 handler 都会执行，返回值合并成数组：
 *   [ { label: '字数', value: 42 }, { label: '行数', value: 6 } ]
 * 宿主拿到数组后统一渲染到状态栏，不需要知道是谁提供的。
 */
export const lineCountPlugin: Plugin = {
  id: "line-count",
  name: "Line Count",
  version: "1.0.0",

  extensions: {
    /**
     * 和 wordCountPlugin 贡献到同一个扩展点 'editor:status-bar'
     * priority: 8，比 wordCount 的 10 低，所以排在字数后面显示
     */
    "editor:status-bar": {
      priority: 8,
      handler: ({ content }: { content: string }) => {
        // 按换行符切割，过滤掉末尾空行
        const lines = content.split("\n");
        const nonEmptyLines = lines.filter((line) => line.trim().length > 0).length;

        return {
          label: "行数",
          value: nonEmptyLines,
        };
      },
    },
  },
};
