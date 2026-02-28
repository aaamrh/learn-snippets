import { Plugin } from "../types";

/**
 * 自动保存插件
 *
 * 工作方式：监听 'content:change' 事件，内容停止变化 5 秒后自动保存到 localStorage
 *
 * 为什么不用 extensions？
 *   因为它不需要向宿主的某个"槽位"贡献内容，
 *   它只是默默监听事件、自己干活，不需要宿主来展示它的结果。
 *   这是"推送模式"——插件自己监听事件主动干活。
 */
export const autoSavePlugin: Plugin = {
  id: "auto-save",
  name: "Auto Save",
  version: "1.0.0",

  activate(context) {
    let timer: ReturnType<typeof setTimeout>;

    const onContentChange = (content: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem("draft", content);
          context.emit("save:success", { timestamp: Date.now() });
        } catch (e) {
          context.emit("save:error", { error: e });
        }
      }, 5000);

      context.state.set("timer", timer);
    };

    context.on("content:change", onContentChange);
    context.state.set("onContentChange", onContentChange);
  },

  deactivate(context) {
    if (!context) return;

    clearTimeout(context.state.get("timer"));

    const onContentChange = context.state.get("onContentChange");
    if (onContentChange) {
      context.off("content:change", onContentChange);
    }
  },
};
