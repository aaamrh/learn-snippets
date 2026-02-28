import { Plugin } from "../types";

// 模块级变量，在 activate 时赋值，addKeyboardShortcuts 的 handler 通过闭包访问
let _emit: ((event: string, data?: any) => void) | null = null;

const wrapItalic = () => {
  _emit?.("editor:wrap-selection", {
    prefix: "*",
    suffix: "*",
    placeholder: "斜体文字",
  });
};

/**
 * 斜体插件
 *
 * 快捷键方案（参考 Tiptap addKeyboardShortcuts 设计）：
 *   插件只声明 { 'Ctrl+I': handler }，不依赖 shortcut 插件的内部 state，
 *   不需要知道 shortcut 插件存不存在。
 *   宿主（PluginHost.activate）统一收集所有插件的 addKeyboardShortcuts，
 *   然后注册到 shortcut 插件里。
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

  // 声明快捷键，宿主统一收集注册，插件本身不感知 shortcut 插件的存在
  addKeyboardShortcuts() {
    return {
      "Ctrl+I": wrapItalic,
    };
  },

  activate(context) {
    // 把 context.emit 赋值给模块级变量，供 addKeyboardShortcuts 的 handler 使用
    _emit = context.emit.bind(context);
  },

  deactivate() {
    // 停用时清空，防止插件停用后快捷键仍然触发
    _emit = null;
  },
};
