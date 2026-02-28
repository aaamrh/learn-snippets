import { Plugin } from "../types";

function formatKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  if (!["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
    parts.push(e.key.toUpperCase());
  }
  return parts.join("+");
}

/**
 * 快捷键插件
 *
 * 工作方式：
 *   1. activate 时在 window 上注册全局 keydown 监听
 *   2. 将一个 register API 存入 context.state，供其他插件或宿主注册快捷键
 *   3. deactivate 时移除监听，防止内存泄漏
 *
 * 为什么不用 extensions？
 *   因为它不向宿主的某个"槽位"贡献数据，
 *   它只是在后台默默监听键盘事件、调度其他函数执行。
 *   这是典型的"推送模式"，用 activate 即可。
 */

export type RegisterShortcut = (key: string, handler: () => void) => void;
export type UnregisterShortcut = (key: string) => void;

export const shortcutPlugin: Plugin = {
  id: "shortcut",
  name: "Shortcut Manager",
  version: "1.0.0",

  activate(context) {
    const shortcuts = new Map<string, () => void>();

    const register: RegisterShortcut = (key, handler) => {
      shortcuts.set(key, handler);
    };

    const unregister: UnregisterShortcut = (key) => {
      shortcuts.delete(key);
    };

    const onKeydown = (e: KeyboardEvent) => {
      const key = formatKey(e);
      const fn = shortcuts.get(key);
      if (fn) {
        e.preventDefault();
        fn();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", onKeydown);
    }

    context.state.set("shortcuts", shortcuts);
    context.state.set("register", register);
    context.state.set("unregister", unregister);
    context.state.set("onKeydown", onKeydown);
  },

  deactivate(context) {
    if (!context) return;

    const onKeydown = context.state.get("onKeydown");
    if (onKeydown && typeof window !== "undefined") {
      window.removeEventListener("keydown", onKeydown);
    }

    context.state.get("shortcuts")?.clear();
  },
};
