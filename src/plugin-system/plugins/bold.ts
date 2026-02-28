import { Plugin } from "../types";

/**
 * 加粗插件
 *
 * 工作方式：向 'editor:toolbar' 扩展点贡献一个工具栏按钮，
 * 点击时读取 textarea 当前选区，把选中文字包裹成 **text**。
 *
 * 如果没有选中文字，插入 **加粗文字** 占位符。
 *
 * 为什么用 extensions？
 *   因为需要向宿主的"工具栏槽位"贡献一个按钮描述对象，
 *   宿主调用 invokeExtension('editor:toolbar') 收集所有按钮后统一渲染。
 *   这是拉取模式。
 *
 * 插入内容的方式：
 *   不直接操作 DOM，而是通过 emit('editor:insert', { text, wrap }) 通知宿主，
 *   宿主负责在光标/选区位置插入内容。
 */
export const boldPlugin: Plugin = {
  id: "bold",
  name: "Bold",
  version: "1.0.0",

  extensions: {
    "editor:toolbar": {
      priority: 100,
      handler: ({ context }: { context: any }) => ({
        id: "bold",
        label: "B",
        title: "加粗 (Ctrl+B)",
        className: "font-black",
        onClick: (_anchorEl: HTMLElement) => {
          context.emit("editor:wrap-selection", {
            prefix: "**",
            suffix: "**",
            placeholder: "加粗文字",
          });
        },
      }),
    },
  },

  activate(context) {
    // 注册 Ctrl+B 快捷键（通过 shortcut 插件）
    const shortcutContext = context.host?.getContext?.("shortcut");
    const register = shortcutContext?.state.get("register");
    if (register) {
      register("Ctrl+B", () => {
        context.emit("editor:wrap-selection", {
          prefix: "**",
          suffix: "**",
          placeholder: "加粗文字",
        });
      });
    }
  },
};
