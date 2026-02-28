import { Plugin } from "../types";

/**
 * 图片上传插件
 *
 * 改造后的方案：
 *   插件只负责逻辑，不关心弹窗 UI 怎么渲染、怎么定位。
 *   点击按钮时把 anchorEl（按钮 DOM 节点）和弹窗类型一起 emit 给宿主，
 *   宿主统一用 GlobalPopup 处理定位和显示。
 *
 * emit('editor:open-popup', { type: 'image-upload', anchorEl: buttonEl })
 *   ↓
 * 宿主 GlobalPopup 定位到 anchorEl 下方
 *   ↓
 * 宿主内部根据 type 渲染 <ImageForm />
 *   ↓
 * 用户确认后宿主 emit('editor:insert', { text: '![](url)' })
 */
export const imageUploadPlugin: Plugin = {
  id: "image-upload",
  name: "Image Upload",
  version: "1.0.0",

  extensions: {
    "editor:toolbar": {
      priority: 80,
      handler: ({ context }: { context: any }) => ({
        id: "image-upload",
        label: "🖼",
        title: "插入图片",
        className: "",
        // onClick 由宿主在工具栏按钮的 onClick 事件里调用
        // 宿主会把 e.currentTarget（按钮 DOM）一并传给 emit
        onClick: (anchorEl: HTMLElement) => {
          context.emit("editor:open-popup", {
            type: "image-upload",
            anchorEl,
          });
        },
      }),
    },
  },
};
