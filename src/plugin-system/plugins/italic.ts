import { Plugin } from "../types";

/**
 * 斜体插件
 *
 * 工作方式：向 'editor:toolbar' 扩展点贡献一个工具栏按钮，
 * 点击时读取 textarea 当前选区，把选中文字包裹成 *text*。
 *
 * 如果没有选中文字，插入 *斜体文字* 占位符。
 */
export const italicPlugin: Plugin = {
  id: "italic",
  name: "Italic",
  version: "1.0.0",

  extensions: {
    "editor:toolbar": {
      priority: 90,
      handler: ({ context }: { context: any }) => ({
        id: "italic",
        label: "I",
        title: "斜体 (Ctrl+I)",
        className: "italic",
        onClick: (_anchorEl: HTMLElement) => {
          context.emit("editor:wrap-selection", {
            prefix: "*",
            suffix: "*",
            placeholder: "斜体文字",
          });
        },
      }),
    },
  },

  activate(context) {
    const shortcutContext = context.host?.getContext?.("shortcut");
    const register = shortcutContext?.state.get("register");
    if (register) {
      register("Ctrl+I", () => {
        context.emit("editor:wrap-selection", {
          prefix: "*",
          suffix: "*",
          placeholder: "斜体文字",
        });
      });
    }
  },
};
