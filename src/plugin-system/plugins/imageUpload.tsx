import React, { useState, useRef, useEffect } from "react";
import type { Plugin, PluginContext } from "../types";

// ==================== ImageForm 组件（插件私有，宿主不感知）====================
// 以前：ImageForm 定义在 page.tsx，宿主感知它的存在并手动渲染
// 现在：ImageForm 定义在插件内部，宿主只负责挂载 renderContent() 的返回值
//
// 对标 Tiptap NodeView：
//   Tiptap 扩展通过 addNodeView() 返回自己的 React 组件，
//   宿主（ProseMirror）只负责在合适的位置挂载，完全不感知组件内部结构。
function ImageForm({
  onConfirm,
  onClose,
}: {
  onConfirm: (url: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="p-4 w-80">
      <div className="text-xs text-zinc-400 mb-2 font-bold">🖼 插入图片</div>
      <input
        ref={inputRef}
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && url.trim()) onConfirm(url);
          if (e.key === "Escape") onClose();
        }}
        placeholder="输入图片 URL，如 https://..."
        className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-blue-500 mb-3"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => url.trim() && onConfirm(url)}
          disabled={!url.trim()}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-40 transition-colors"
        >
          插入
        </button>
      </div>
    </div>
  );
}

// ==================== imageUpload 插件 ====================
/**
 * 改造后的图片上传插件
 *
 * 旧方案（宿主感知型）:
 *   emit('editor:open-popup', { type: 'image-upload', anchorEl })
 *   → 宿主判断 type === 'image-upload' → 宿主渲染 <ImageForm onConfirm={宿主写死的回调} />
 *   问题：宿主必须认识每一种弹窗类型，新增插件必须改宿主
 *
 * 新方案（Portal 型，对标 Tiptap）:
 *   emit('editor:open-popup', { anchorEl, renderContent: (close) => <ImageForm ... /> })
 *   → 宿主只调用 renderContent(close)，不感知里面是什么
 *   → ImageForm 内部直接调用 ctx.insertText()，不经过宿主中转
 *   好处：宿主代码永远不需要改，插件完全自治
 */
export const imageUploadPlugin: Plugin = {
  id: "image-upload",
  name: "Image Upload",
  version: "1.0.0",

  extensions: {
    "editor:toolbar": {
      priority: 80,
      handler: ({ context }: { context: PluginContext }) => ({
        id: "image-upload",
        label: "🖼",
        title: "插入图片",
        className: "",
        onClick: (anchorEl: HTMLElement) => {
          // 插件 emit 的不再是 type 字符串，而是一个渲染函数
          // 宿主拿到这个函数后直接调用，完全不需要知道里面渲染的是什么
          context.emit("editor:open-popup", {
            anchorEl,
            // renderContent 是插件交给宿主的"渲染票据"
            // close 由宿主传入，插件调用它来关闭弹窗
            renderContent: (close: () => void) =>
              React.createElement(ImageForm, {
                onConfirm: (url: string) => {
                  // 直接调用宿主注入的 insertText，不经过任何事件中转
                  // 宿主不感知插入的是图片 Markdown，插件完全自治
                  context.insertText(`![图片](${url})`);
                  close();
                },
                onClose: close,
              }),
          });
        },
      }),
    },
  },
};
