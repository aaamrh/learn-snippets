// ==================== V2 Plugins Index ====================
//
// 组合所有 v2 格式插件的 Manifest 和 PluginEntry 对象
//
// 使用方式（在 Demo 页面中）：
// ```ts
// import { ALL_V2_PLUGINS } from "@/plugin-system/plugins/v2";
//
// const host = new NewPluginHost({ editor: ... });
//
// // 批量安装所有插件（只解析 Manifest，不加载代码）
// for (const plugin of ALL_V2_PLUGINS) {
//   host.installPlugin(plugin.manifest);
// }
//
// // 启动宿主（触发 onStartup 激活）
// await host.start();
// ```
//
// 设计说明：
// - 在真实的 VS Code 插件系统中，Manifest 和代码是分离的：
//   宿主先读取 Manifest JSON 注册贡献点，
//   等满足 activationEvents 时才 dynamic import() 加载代码。
//
// - 在我们的 Demo 中，为了简化打包和开发体验：
//   所有插件代码在此文件中静态导入，
//   但通过 ActivationManager 的自定义 loader 实现「逻辑上的懒加载」——
//   loader 返回的 PluginEntry 虽然已经在内存中，
//   但 activate() 只有在满足 activationEvents 时才被调用。
//
//   这样既保留了架构上的「按需激活」语义，
//   又避免了 Demo 环境下 dynamic import() 路径解析的复杂性。

import type { PluginManifest, PluginEntry } from "../../manifest-types";
import {
  EXAMPLE_TRANSLATE_MANIFEST,
  EXAMPLE_COPY_MARKDOWN_MANIFEST,
  EXAMPLE_WORD_COUNT_MANIFEST,
  EXAMPLE_AUTO_SAVE_MANIFEST,
  EXAMPLE_EMOJI_MANIFEST,
  EXAMPLE_IMAGE_UPLOAD_MANIFEST,
  EXAMPLE_GIT_STATUS_MANIFEST,
  EXAMPLE_BASE_FORMATTER_MANIFEST,
  EXAMPLE_MARKDOWN_FORMATTER_MANIFEST,
  EXAMPLE_OUTLINE_VIEW_MANIFEST,
} from "../../manifest-types";

// 插件入口对象
import translatePlugin from "./translate";
import copyAsMarkdownPlugin from "./copyAsMarkdown";
import wordCountPlugin from "./wordCount";
import autoSavePlugin from "./autoSave";
import emojiPickerPlugin from "./emojiPicker";
import imageUploadPlugin from "./imageUpload";
import gitStatusPlugin from "./gitStatus";
import baseFormatterPlugin from "./baseFormatter";
import markdownFormatterPlugin from "./markdownFormatter";
import outlineViewPlugin from "./outlineView";

// ==================== 插件描述 ====================

/**
 * V2PluginDescriptor — 组合 Manifest 和 PluginEntry 的完整插件描述
 *
 * 在 Demo 中用于一次性注册所有插件。
 * 在真实插件系统中，Manifest 来自 JSON 文件，Entry 来自 dynamic import。
 */
export interface V2PluginDescriptor {
  /** 插件 Manifest（声明式描述） */
  manifest: PluginManifest;

  /** 插件入口对象（运行时代码） */
  entry: PluginEntry;

  /** 分类标签（用于 UI 展示） */
  category: "editor" | "toolbar" | "utility";

  /** 是否默认启用（安装后是否自动激活） */
  defaultEnabled: boolean;

  /** 简短描述（用于插件列表 UI） */
  shortDescription: string;
}

// ==================== 所有 V2 插件 ====================

/**
 * 翻译插件描述
 */
export const TRANSLATE_PLUGIN: V2PluginDescriptor = {
  manifest: EXAMPLE_TRANSLATE_MANIFEST,
  entry: translatePlugin,
  category: "toolbar",
  defaultEnabled: true,
  shortDescription: "选中文字后点击翻译按钮，模拟中英文翻译并替换选中文字",
};

/**
 * 复制为 Markdown 插件描述
 */
export const COPY_MARKDOWN_PLUGIN: V2PluginDescriptor = {
  manifest: EXAMPLE_COPY_MARKDOWN_MANIFEST,
  entry: copyAsMarkdownPlugin,
  category: "toolbar",
  defaultEnabled: true,
  shortDescription: "选中文字后点击复制按钮，将文字转换为 Markdown 格式并复制到剪贴板",
};

/**
 * 字数统计插件描述
 */
export const WORD_COUNT_PLUGIN: V2PluginDescriptor = {
  manifest: EXAMPLE_WORD_COUNT_MANIFEST,
  entry: wordCountPlugin,
  category: "utility",
  defaultEnabled: true,
  shortDescription: "实时在状态栏显示编辑器内容的字数统计（中文字数 + 英文单词数）",
};

/**
 * 自动保存插件描述
 */
export const AUTO_SAVE_PLUGIN: V2PluginDescriptor = {
  manifest: EXAMPLE_AUTO_SAVE_MANIFEST,
  entry: autoSavePlugin,
  category: "utility",
  defaultEnabled: true,
  shortDescription: "每 5 秒自动保存编辑器内容到浏览器本地存储，下次打开自动恢复",
};

/**
 * 表情选择器插件描述
 */
export const EMOJI_PICKER_PLUGIN: V2PluginDescriptor = {
  manifest: EXAMPLE_EMOJI_MANIFEST,
  entry: emojiPickerPlugin,
  category: "editor",
  defaultEnabled: true,
  shortDescription: "点击工具栏按钮弹出表情面板，选择表情后插入到编辑器光标位置",
};

/**
 * 图片上传插件描述
 */
export const IMAGE_UPLOAD_PLUGIN: V2PluginDescriptor = {
  manifest: EXAMPLE_IMAGE_UPLOAD_MANIFEST,
  entry: imageUploadPlugin,
  category: "editor",
  defaultEnabled: true,
  shortDescription: "点击工具栏按钮输入图片 URL，以 Markdown 格式插入到编辑器",
};

/**
 * Git 状态插件描述
 */
export const GIT_STATUS_PLUGIN: V2PluginDescriptor = {
  manifest: EXAMPLE_GIT_STATUS_MANIFEST,
  entry: gitStatusPlugin,
  category: "utility",
  defaultEnabled: true,
  shortDescription: "在状态栏显示模拟的 Git 分支信息，带颜色和 tooltip 交互",
};

/**
 * 基础格式化插件描述
 */
export const BASE_FORMATTER_PLUGIN: V2PluginDescriptor = {
  manifest: EXAMPLE_BASE_FORMATTER_MANIFEST,
  entry: baseFormatterPlugin,
  category: "editor",
  defaultEnabled: true,
  shortDescription: "提供基础文本格式化能力（trim、标准化空格等），作为其他格式化插件的依赖",
};

/**
 * Markdown 格式化插件描述
 */
export const MARKDOWN_FORMATTER_PLUGIN: V2PluginDescriptor = {
  manifest: EXAMPLE_MARKDOWN_FORMATTER_MANIFEST,
  entry: markdownFormatterPlugin,
  category: "toolbar",
  defaultEnabled: true,
  shortDescription: "在基础格式化基础上添加 Markdown 语法格式化（依赖 base-formatter）",
};

/**
 * 大纲视图插件描述
 */
export const OUTLINE_VIEW_PLUGIN: V2PluginDescriptor = {
  manifest: EXAMPLE_OUTLINE_VIEW_MANIFEST,
  entry: outlineViewPlugin,
  category: "utility",
  defaultEnabled: true,
  shortDescription: "解析编辑器内容，以树形视图展示文本大纲结构",
};

/**
 * 所有 V2 插件的集合
 *
 * 按推荐的安装顺序排列：
 * 1. 工具类插件（onStartup 激活，先安装先可用）
 * 2. 基础依赖插件（被其他插件依赖，需要先安装）
 * 3. 编辑器增强插件（onCommand 激活，按需加载）
 * 4. 工具条插件（onCommand 激活，按需加载）
 */
export const ALL_V2_PLUGINS: V2PluginDescriptor[] = [
  WORD_COUNT_PLUGIN,
  AUTO_SAVE_PLUGIN,
  GIT_STATUS_PLUGIN,
  OUTLINE_VIEW_PLUGIN,
  BASE_FORMATTER_PLUGIN,
  EMOJI_PICKER_PLUGIN,
  IMAGE_UPLOAD_PLUGIN,
  TRANSLATE_PLUGIN,
  COPY_MARKDOWN_PLUGIN,
  MARKDOWN_FORMATTER_PLUGIN,
];

// ==================== 自定义 Loader ====================

/**
 * 创建 Demo 专用的插件加载器
 *
 * 替换默认的 dynamic import() 加载器，
 * 从内存中的 V2PluginDescriptor 直接返回 PluginEntry。
 *
 * 这样做的好处：
 * - 避免了 dynamic import() 在 Next.js / Webpack 中的路径解析问题
 * - 保留了架构上的「按需激活」语义（loader 只在满足 activationEvents 时被调用）
 * - 简化 Demo 开发（不需要为每个插件创建独立的打包入口）
 *
 * 使用方式：
 * ```ts
 * const host = new NewPluginHost({
 *   editor: ...,
 *   pluginLoader: createDemoPluginLoader(ALL_V2_PLUGINS),
 * });
 * ```
 */
export function createDemoPluginLoader(
  plugins: V2PluginDescriptor[],
): (manifest: PluginManifest) => Promise<PluginEntry> {
  // 构建 pluginId → entry 的映射表
  const entryMap = new Map<string, PluginEntry>();
  for (const plugin of plugins) {
    entryMap.set(plugin.manifest.id, plugin.entry);
  }

  return async (manifest: PluginManifest): Promise<PluginEntry> => {
    const entry = entryMap.get(manifest.id);

    if (!entry) {
      throw new Error(
        `[DemoPluginLoader] Plugin "${manifest.id}" not found in the demo plugin registry. ` +
          `Available plugins: [${Array.from(entryMap.keys()).join(", ")}]`,
      );
    }

    // 模拟加载延迟（让 UI 能观察到「加载中」状态）
    await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));

    console.log(`[DemoPluginLoader] Loaded plugin "${manifest.id}" from memory.`);
    return entry;
  };
}

// ==================== 工具函数 ====================

/**
 * 按分类分组所有插件
 *
 * @returns Map<category, V2PluginDescriptor[]>
 */
export function getPluginsByCategory(): Map<string, V2PluginDescriptor[]> {
  const categories = new Map<string, V2PluginDescriptor[]>();

  for (const plugin of ALL_V2_PLUGINS) {
    if (!categories.has(plugin.category)) {
      categories.set(plugin.category, []);
    }
    categories.get(plugin.category)!.push(plugin);
  }

  return categories;
}

/**
 * 获取指定分类的显示名称
 */
export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    editor: "编辑器增强",
    toolbar: "选中工具条",
    utility: "实用工具",
  };
  return labels[category] ?? category;
}

/**
 * 获取指定分类的图标
 */
export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    editor: "✏️",
    toolbar: "🔧",
    utility: "⚙️",
  };
  return icons[category] ?? "📦";
}
