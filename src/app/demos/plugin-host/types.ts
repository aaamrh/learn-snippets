// ==================== plugin-host demo 共享类型 ====================
//
// 所有跨文件引用的接口和类型集中在此，避免循环依赖。

import type { ConfigurationPropertySchema } from "@/plugin-system/manifest-types";

// ── 弹窗数据 ──────────────────────────────────────────────────

/**
 * 通用弹窗数据接口：宿主不感知任何具体插件的弹窗类型。
 *
 * 对标 VS Code 的 QuickPick / InputBox 模型：
 *   宿主只提供"通用渲染原语"，插件声明自己需要哪种原语 + 传入纯数据。
 *   宿主收到数据后，用注册表（popupRendererRegistry）查找对应渲染器，
 *   完全不知道是哪个插件发出的请求。
 *
 * 新增弹窗插件只需：
 *   1. 在 emit("ui:show-popup") 的数据里填写 triggerCommand / closeOnAction
 *   2. 在宿主侧调用一次 popupRendererRegistry.set(type, Component)
 *   page.tsx 的其余代码一行都不用改。
 */
export interface GenericPopupData {
  /** 弹窗类型标识（由插件自己声明，宿主用于查表） */
  type: string;
  /**
   * 触发此弹窗的命令 ID（即工具栏按钮对应的 commandId）
   * 宿主用此字段定位锚定按钮，无需写死具体插件 ID。
   */
  triggerCommand: string;
  /**
   * 执行主操作命令后是否自动关闭弹窗
   * 由插件自己声明业务策略，宿主不再写死 if commandId === "xxx"。
   */
  closeOnAction: boolean;
  /** 其余字段由各插件自由扩展，渲染器可以读取 */
  [key: string]: unknown;
}

export type PopupData = GenericPopupData;

// ── 侧栏 ──────────────────────────────────────────────────────

export type SidebarPanel = "outline" | "settings" | null;

// ── TreeView ──────────────────────────────────────────────────

export interface TreeNode {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  collapsibleState?: "collapsed" | "expanded" | "none";
  command?: { commandId: string; args?: unknown[] };
  children?: TreeNode[];
}

// ── 配置项 ────────────────────────────────────────────────────

export interface ConfigEntry {
  pluginId: string;
  pluginName: string;
  key: string;
  schema: ConfigurationPropertySchema;
  value: unknown;
}

// ── 弹窗渲染器 ────────────────────────────────────────────────

/**
 * 所有弹窗渲染器的统一 props 接口。
 *
 * - data：插件 emit 的原始 popupData
 * - onAction：用户操作时回调（传 commandId + args 给宿主执行命令）
 * - onClose：关闭弹窗
 */
export interface PopupRendererProps {
  data: GenericPopupData;
  onAction: (commandId: string, ...args: unknown[]) => void;
  onClose: () => void;
}

// ── 编辑器内置操作 ────────────────────────────────────────────

export type EditorAction = "bold" | "italic";

// ── 事件日志条目 ──────────────────────────────────────────────

export interface EventLogEntry {
  time: string;
  type: string;
  detail: string;
}
