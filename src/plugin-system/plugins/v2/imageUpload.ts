// ==================== Image Upload Plugin (v2 Manifest 格式) ====================
//
// 点击工具栏按钮后弹出图片 URL 输入框，确认后以 Markdown 格式插入到编辑器
//
// 对标 VS Code 插件的 extension.ts：
// - 导出 activate / deactivate
// - 在 activate 中通过 api.commands.registerCommand 注册命令处理器
// - 命令 ID 必须与 Manifest contributes.commands 中声明的一致
//
// Manifest（定义在 manifest-types.ts 的 EXAMPLE_IMAGE_UPLOAD_MANIFEST）：
// - id: "image-upload"
// - activationEvents: ["onCommand:image-upload.insert"]
// - permissions: ["editor:insertText", "commands:register", "events:emit"]
// - contributes.commands: [{ command: "image-upload.insert", title: "插入图片", icon: "🖼" }]
//
// 弹窗机制（Portal 型，对标 Tiptap NodeView）：
//   插件通过 api.events.emit("ui:show-popup", { id, title, ... }) 通知宿主
//   宿主根据 type 渲染对应的表单 UI（图片 URL 输入框）
//   用户确认后，宿主调用 image-upload.doInsert 命令传入 URL
//   插件在 doInsert 命令中调用 api.editor.insertText() 插入 Markdown 图片语法
//
// 与 v1 版本 (plugins/imageUpload.tsx) 的区别：
//   v1：插件直接返回 React 元素（renderContent），耦合 React
//   v2：插件发送纯数据描述弹窗，宿主侧统一渲染，可在 Worker 沙箱中运行

import type { PluginEntry, PluginAPI } from "../../manifest-types";

// ==================== 弹窗数据类型 ====================

/**
 * 插件发送给宿主的弹窗请求数据
 *
 * 宿主通过监听 "ui:show-popup" 事件接收此数据
 * 根据 type === "image-upload" 渲染图片 URL 输入表单
 *
 * 设计原则（同 emojiPicker）：
 * - 传纯数据，不传 React 元素
 * - 可序列化，兼容 Worker 沙箱
 * - 宿主统一渲染，保证 UI 风格一致
 */
export interface ImageUploadPopupData {
  /** 弹窗类型标识 */
  type: "image-upload";
  /** 弹窗标题 */
  title: string;
  /** 输入框 placeholder */
  placeholder: string;
  /** 确认后要执行的命令 ID（宿主调用 executeCommand 传入 URL） */
  onConfirmCommand: string;
  /** 预设的示例图片 URL（可选，方便用户快速测试） */
  exampleUrls: ImageExample[];
}

/**
 * 示例图片（用于弹窗中的快速选择）
 */
export interface ImageExample {
  /** 显示名称 */
  label: string;
  /** 图片 URL */
  url: string;
}

// ==================== 预设示例图片 ====================

/**
 * 示例图片列表
 *
 * 使用公开可用的占位图服务
 * 在 Demo 中方便用户快速测试，不需要手动输入 URL
 */
const EXAMPLE_IMAGES: ImageExample[] = [
  {
    label: "风景 (600×400)",
    url: "https://picsum.photos/600/400",
  },
  {
    label: "头像 (200×200)",
    url: "https://picsum.photos/200/200",
  },
  {
    label: "宽幅 (800×300)",
    url: "https://picsum.photos/800/300",
  },
  {
    label: "占位图",
    url: "https://via.placeholder.com/400x300.png?text=Plugin+Demo",
  },
];

// ==================== Markdown 图片语法工具 ====================

/**
 * 将 URL 转换为 Markdown 图片语法
 *
 * 规则：
 * 1. 自动提取文件名作为 alt text
 * 2. 如果 URL 无法解析，使用 "图片" 作为默认 alt
 * 3. 前后加空行，保证 Markdown 渲染正确
 *
 * @param url 图片 URL
 * @param alt 可选的自定义 alt 文本
 * @returns Markdown 图片语法字符串
 */
function toMarkdownImage(url: string, alt?: string): string {
  const altText = alt ?? extractAltFromUrl(url);
  return `![${altText}](${url})`;
}

/**
 * 从 URL 中提取文件名作为 alt text
 *
 * 例如：
 * - https://example.com/photo.jpg → photo
 * - https://picsum.photos/600/400  → 图片
 * - https://via.placeholder.com/400x300.png → 400x300
 */
function extractAltFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    // 尝试提取文件名（去掉扩展名）
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      // 去掉常见图片扩展名
      const name = lastSegment.replace(/\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff?)$/i, "");
      if (name && name.length > 0 && name.length <= 50) {
        return name;
      }
    }
  } catch {
    // URL 解析失败，使用默认值
  }

  return "图片";
}

/**
 * 简单的 URL 格式校验
 *
 * 不追求严格的 RFC 合规，只要看起来像 URL 就行
 * 支持 http:// / https:// / data: 协议
 */
function isValidImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  // 支持 http(s) 和 data URI
  if (/^https?:\/\/.+/i.test(trimmed)) return true;
  if (/^data:image\/.+/i.test(trimmed)) return true;

  return false;
}

// ==================== 插件入口 ====================

const imageUploadPlugin: PluginEntry = {
  /**
   * 激活阶段
   *
   * 注册两个命令：
   * 1. image-upload.insert：触发弹窗显示（用户点击工具栏按钮时调用）
   * 2. image-upload.doInsert：实际插入图片（用户在弹窗中确认 URL 后调用）
   *
   * 流程：
   * 1. 用户点击工具栏「图片」按钮 → 宿主调用 image-upload.insert
   * 2. 插件通过 events.emit("ui:show-popup") 发送弹窗请求
   * 3. 宿主渲染图片 URL 输入表单
   * 4. 用户输入 URL 并确认 → 宿主调用 image-upload.doInsert(url)
   * 5. 插件校验 URL → 转换为 Markdown → 调用 api.editor.insertText 插入
   */
  activate(api: PluginAPI): void {
    // ── 注册「打开图片上传面板」命令 ──
    api.commands.registerCommand("image-upload.insert", async () => {
      const popupData: ImageUploadPopupData = {
        type: "image-upload",
        title: "🖼 插入图片",
        placeholder: "输入图片 URL，如 https://example.com/photo.jpg",
        onConfirmCommand: "image-upload.doInsert",
        exampleUrls: EXAMPLE_IMAGES,
      };

      api.events.emit("ui:show-popup", popupData);

      console.log("[ImageUpload] Popup requested.");
    });

    // ── 注册「实际插入图片」命令 ──
    api.commands.registerCommand(
      "image-upload.doInsert",
      async (...args: unknown[]) => {
        const url = args[0];

        if (typeof url !== "string" || url.trim() === "") {
          console.warn("[ImageUpload] doInsert called without valid URL.");
          return { success: false, reason: "empty-url" };
        }

        // 校验 URL 格式
        if (!isValidImageUrl(url)) {
          console.warn(`[ImageUpload] Invalid image URL: "${url}"`);
          return { success: false, reason: "invalid-url" };
        }

        try {
          // 转换为 Markdown 图片语法
          const markdown = toMarkdownImage(url.trim());

          // 插入到编辑器
          await api.editor.insertText(markdown);

          console.log(`[ImageUpload] Inserted image: ${url}`);

          // 通知宿主插入成功
          api.events.emit("image-upload:inserted", {
            url: url.trim(),
            markdown,
          });

          return { success: true, url: url.trim(), markdown };
        } catch (error) {
          console.error("[ImageUpload] Failed to insert image:", error);
          return {
            success: false,
            reason: "insert-failed",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    console.log(
      `[ImageUpload] Plugin activated. ${EXAMPLE_IMAGES.length} example images available.`
    );
  },

  /**
   * 停用阶段
   *
   * 命令处理器通过 Disposable 自动清理，
   * 此处不需要额外清理逻辑。
   */
  deactivate(): void {
    console.log("[ImageUpload] Plugin deactivated.");
  },
};

export default imageUploadPlugin;
