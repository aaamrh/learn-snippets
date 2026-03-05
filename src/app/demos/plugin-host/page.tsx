"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── 核心模块 ──────────────────────────────────────────────────
import { NewPluginHost } from "@/plugin-system/NewPluginHost";
import type { PluginHostEvent } from "@/plugin-system/NewPluginHost";
import { createContentEditableBridge } from "@/plugin-system/APIProxy";
import { SelectionToolbar } from "@/plugin-system/SelectionToolbar";
import { ContextMenu } from "@/plugin-system/ContextMenu";
import { EditorTabManager } from "@/plugin-system/EditorTabManager";
import type { EditorTab } from "@/plugin-system/EditorTabManager";
import type {
  SourcedSelectionToolbarContribution,
  SourcedStatusBarContribution,
  SourcedMenuContribution,
  SourcedViewContainerContribution,
} from "@/plugin-system/ContributionManager";
import type {
  PluginManifest,
  SelectionInfo,
  TreeItem,
  ConfigurationPropertySchema,
} from "@/plugin-system/manifest-types";

// ── 示例插件 ──────────────────────────────────────────────────
import {
  ALL_V2_PLUGINS,
  createDemoPluginLoader,
  getCategoryIcon,
  getCategoryLabel,
  getPluginsByCategory,
} from "@/plugin-system/plugins/v2";
import type { V2PluginDescriptor } from "@/plugin-system/plugins/v2";

// ── 插件弹窗数据类型 / 共享类型 ──────────────────────────────────
// 宿主只感知通用接口，不 import 任何具体插件的类型。
// 对标 VS Code：宿主不知道弹窗内容是什么，只知道有一个 type 字段用于查表。
import type {
  GenericPopupData,
  PopupRendererProps,
  SidebarPanel,
  TreeNode,
  ConfigEntry,
} from "./types";

type PopupData = GenericPopupData;

// ==================== 默认编辑内容 ====================

const DEFAULT_CONTENT =
  "在这里输入文字来测试插件系统。\n\n选中一段文字后，会弹出浮动工具条（翻译、复制为 Markdown）。\n\n字数统计和自动保存插件会在启动时自动激活。\n\nhttps://github.com 这是一个链接\n\n前端架构设计是一门深奥的学问。";

const SECOND_TAB_CONTENT =
  "# 第二个标签页\n\n这是多 Tab 编辑器的演示。\n\n你可以在不同标签页之间切换，每个标签页有独立的内容。\n\n修改内容会在标签上显示 ● 脏标记。";

// ==================== 编辑器辅助函数 ====================

/**
 * 对编辑器选区应用 wrapper（加粗 / 斜体）
 *
 * - 有选中文字时：toggle 包裹/移除 wrapper
 * - 无选中文字时：插入占位符并选中
 *
 * @param el       contentEditable 元素
 * @param action   "bold" → **  |  "italic" → *
 */
function applyTextWrap(el: HTMLElement, action: "bold" | "italic"): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return;

  const wrapper = action === "bold" ? "**" : "*";
  const selectedText = selection.toString();

  if (!selectedText) {
    // 没有选中文字 → 插入占位符
    const placeholder = action === "bold" ? "粗体文字" : "斜体文字";
    const insertText = `${wrapper}${placeholder}${wrapper}`;
    range.deleteContents();
    const textNode = document.createTextNode(insertText);
    range.insertNode(textNode);
    // 选中占位文字（不含 wrapper）
    const newRange = document.createRange();
    newRange.setStart(textNode, wrapper.length);
    newRange.setEnd(textNode, wrapper.length + placeholder.length);
    selection.removeAllRanges();
    selection.addRange(newRange);
  } else {
    // 有选中文字 → toggle 包裹/移除
    const alreadyWrapped =
      selectedText.startsWith(wrapper) &&
      selectedText.endsWith(wrapper) &&
      selectedText.length > wrapper.length * 2;
    const newText = alreadyWrapped
      ? selectedText.slice(wrapper.length, -wrapper.length)
      : `${wrapper}${selectedText}${wrapper}`;
    range.deleteContents();
    const textNode = document.createTextNode(newText);
    range.insertNode(textNode);
    const newRange = document.createRange();
    newRange.selectNodeContents(textNode);
    selection.removeAllRanges();
    selection.addRange(newRange);
  }

  // 触发 input 事件同步内容
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// ==================== 主页面组件 ====================

export default function PluginHostDemoPage() {
  // ── Refs ──────────────────────────────────────────────────
  const editorRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<NewPluginHost | null>(null);
  const tabManagerRef = useRef<EditorTabManager | null>(null);
  const isComposingRef = useRef(false);

  // ── State ──────────────────────────────────────────────────
  const [isReady, setIsReady] = useState(false);

  // 编辑器
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);

  // 多 Tab
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // 插件
  const [installedPlugins, setInstalledPlugins] = useState<Set<string>>(new Set());
  const [activePlugins, setActivePlugins] = useState<Set<string>>(new Set());
  const [pluginErrors, setPluginErrors] = useState<Map<string, string>>(new Map());

  // 选中工具条
  const [toolbarItems, setToolbarItems] = useState<SourcedSelectionToolbarContribution[]>([]);
  const [executingCommand, setExecutingCommand] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  // 状态栏
  const [statusBarItems, setStatusBarItems] = useState<SourcedStatusBarContribution[]>([]);

  // 事件日志
  const [eventLog, setEventLog] = useState<Array<{ time: string; type: string; detail: string }>>(
    [],
  );

  // 诊断
  const [diagnosticsData, setDiagnosticsData] = useState<unknown>(null);

  // Toast
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // 弹窗
  const [popupData, setPopupData] = useState<PopupData | null>(null);

  // 底部面板
  const [showEventLog, setShowEventLog] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{
    groups: Map<string, SourcedMenuContribution[]>;
    position: { x: number; y: number };
  } | null>(null);

  // ── 侧栏状态 ──────────────────────────────────────────────
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>(null);

  // ── TreeView 大纲 ──────────────────────────────────────────
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // ── 配置面板 ──────────────────────────────────────────────
  const [configEntries, setConfigEntries] = useState<ConfigEntry[]>([]);

  // ── 视图容器（从 ContributionManager 获取）──────────────────
  const [viewContainers, setViewContainers] = useState<SourcedViewContainerContribution[]>([]);

  // ── 工具函数 ──────────────────────────────────────────────

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const addLog = useCallback((type: string, detail: string) => {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setEventLog((prev) => [{ time, type, detail }, ...prev].slice(0, 100));
  }, []);

  const refreshUI = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;

    const manifests = host.getInstalledPlugins();
    setInstalledPlugins(new Set(manifests.map((m) => m.id)));

    const activeIds = new Set<string>();
    for (const m of manifests) {
      if (host.registry.isActive(m.id)) {
        activeIds.add(m.id);
      }
    }
    setActivePlugins(activeIds);

    setStatusBarItems(host.getStatusBarItems().filter((item) => activeIds.has(item.pluginId)));
    setToolbarItems(host.getVisibleSelectionToolbarItems());
    setDiagnosticsData(host.getDiagnostics());
    setViewContainers(host.contributions.getAllViewContainers());
  }, []);

  // ── 刷新大纲 TreeView ──────────────────────────────────────
  const refreshOutlineTree = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;

    const provider = host.contributions.getTreeDataProvider("outline-view");
    if (!provider) {
      setTreeNodes([]);
      return;
    }

    setTreeLoading(true);
    try {
      const roots = await provider.getChildren();
      const buildNodes = async (items: TreeItem[]): Promise<TreeNode[]> => {
        const result: TreeNode[] = [];
        for (const item of items) {
          const node: TreeNode = {
            id: item.id,
            label: item.label,
            icon: item.icon,
            description: item.description,
            collapsibleState: item.collapsibleState,
            command: item.command,
          };
          if (item.collapsibleState !== "none") {
            const children = await provider.getChildren(item.id);
            if (children.length > 0) {
              node.children = await buildNodes(children);
            }
          }
          result.push(node);
        }
        return result;
      };
      setTreeNodes(await buildNodes(roots));
    } catch (err) {
      console.error("[OutlineView] Failed to load tree:", err);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  // ── 刷新配置面板 ──────────────────────────────────────────
  const refreshConfigEntries = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;

    const entries: ConfigEntry[] = [];
    const manifests = host.getInstalledPlugins();

    for (const manifest of manifests) {
      if (!manifest.contributes?.configuration) continue;
      const { title, properties } = manifest.contributes.configuration;
      const pluginName = title ?? manifest.name;

      for (const [key, schema] of Object.entries(properties)) {
        const value = host.configurationService.get(manifest.id, key);
        entries.push({ pluginId: manifest.id, pluginName, key, schema, value });
      }
    }

    setConfigEntries(entries);
  }, []);

  // ── 刷新 Tab 状态 ──────────────────────────────────────────
  const refreshTabs = useCallback(() => {
    const tm = tabManagerRef.current;
    if (!tm) return;
    setTabs(tm.getTabs());
    setActiveTabId(tm.getActiveTabId());
  }, []);

  // ── 初始化 PluginHost ──────────────────────────────────────

  useEffect(() => {
    if (hostRef.current) return;

    const editorBridge = createContentEditableBridge(() => editorRef.current);

    const host = new NewPluginHost({
      editor: editorBridge,
      sandboxMode: "main-thread",
      pluginLoader: createDemoPluginLoader(ALL_V2_PLUGINS),
      throwOnPermissionDeny: true,
      onPermissionAudit: (entry) => {
        if (!entry.allowed) {
          addLog(
            "permission-denied",
            `插件 "${entry.pluginId}" 调用 ${entry.method} 被拒绝 (需要 ${entry.permission})`,
          );
        }
      },
    });

    hostRef.current = host;

    // ── 初始化 EditorTabManager ──
    const tabManager = new EditorTabManager({
      initialTabs: [
        { title: "untitled-1", content: DEFAULT_CONTENT },
        { title: "notes.md", content: SECOND_TAB_CONTENT },
      ],
    });
    tabManagerRef.current = tabManager;

    // 监听 Tab 事件
    tabManager.onEvent((event) => {
      switch (event.type) {
        case "tab-activated": {
          const tab = tabManager.getTab(event.tabId);
          if (tab && editorRef.current) {
            editorRef.current.textContent = tab.content;
            // 不调用 setEditorContent — contentEditable 是非受控的
            // 通知插件内容变化
            host.notifyContentChange();
          }
          break;
        }
        case "tab-added":
        case "tab-removed":
        case "tab-dirty-changed":
        case "tab-title-changed":
        case "tabs-reordered":
          break;
      }
      refreshTabs();
    });

    // 初始同步 Tab 数据到 state
    setTabs(tabManager.getTabs());
    setActiveTabId(tabManager.getActiveTabId());

    // 监听宿主事件
    host.onEvent((event: PluginHostEvent) => {
      switch (event.type) {
        case "plugin-installed":
          addLog("installed", `插件 "${event.pluginId}" 已安装`);
          break;
        case "plugin-activated":
          addLog("activated", `插件 "${event.pluginId}" 已激活 (原因: ${event.reason})`);
          break;
        case "plugin-deactivated":
          addLog("deactivated", `插件 "${event.pluginId}" 已停用`);
          break;
        case "plugin-uninstalled":
          addLog("uninstalled", `插件 "${event.pluginId}" 已卸载`);
          break;
        case "plugin-error":
          addLog("error", `插件 "${event.pluginId}" 错误: ${event.error}`);
          setPluginErrors((prev) => new Map(prev).set(event.pluginId, event.error));
          break;
        case "plugin-auto-disabled":
          addLog(
            "error",
            `插件 "${event.pluginId}" 连续错误 ${event.consecutiveErrors} 次，已自动停用`,
          );
          break;
        case "command-executed":
          addLog("command", `命令 "${event.commandId}" 已执行`);
          break;
        case "statusbar-updated":
        case "selection-toolbar-updated":
          break;
      }
      refreshUI();
    });

    // 监听贡献点变化
    host.contributions.onEvent((ev) => {
      refreshUI();
      if (ev.type === "tree-data-provider-registered" || ev.type === "view-refresh-requested") {
        refreshOutlineTree();
      }
      if (ev.type === "configuration-changed") {
        refreshConfigEntries();
      }
    });

    // 监听插件发出的 ui:show-popup 事件
    host.onPluginEvent("ui:show-popup", (data: unknown) => {
      setPopupData(data as PopupData);
    });

    // 监听自动保存事件
    host.onPluginEvent("auto-save:saved", (data: unknown) => {
      const d = data as { timestamp?: number };
      if (d?.timestamp) {
        addLog("system", `自动保存完成 @ ${new Date(d.timestamp).toLocaleTimeString()}`);
        // 标记当前 Tab 为已保存
        const tm = tabManagerRef.current;
        const atId = tm?.getActiveTabId();
        if (tm && atId) {
          tm.markSaved(atId);
        }
      }
    });

    // 注册宿主级 Ctrl+S
    host.keybindings.registerHostKeybinding("Ctrl+S", () => {
      addLog("system", "Ctrl+S 手动保存");
      showToast("已保存", "success");
      const tm = tabManagerRef.current;
      const atId = tm?.getActiveTabId();
      if (tm && atId) {
        tm.markSaved(atId);
      }
    });

    // 注册宿主级 Ctrl+B / Ctrl+I（加粗 / 斜体）
    host.keybindings.registerHostKeybinding("Ctrl+B", () => {
      if (editorRef.current) applyTextWrap(editorRef.current, "bold");
    });
    host.keybindings.registerHostKeybinding("Ctrl+I", () => {
      if (editorRef.current) applyTextWrap(editorRef.current, "italic");
    });

    // 安装所有默认插件
    for (const plugin of ALL_V2_PLUGINS) {
      try {
        host.installPlugin(plugin.manifest);
      } catch (error) {
        console.error(`Failed to install plugin "${plugin.manifest.id}":`, error);
      }
    }

    // 启动
    host.start().then(() => {
      setIsReady(true);
      refreshUI();
      refreshConfigEntries();
      addLog("system", "插件宿主已启动，onStartup 插件已激活");
    });

    return () => {
      tabManager.dispose();
      tabManagerRef.current = null;
      host.dispose();
      hostRef.current = null;
    };
  }, [addLog, refreshUI, refreshTabs, refreshOutlineTree, refreshConfigEntries, showToast]);

  // ── 初始化编辑器 DOM 内容（非受控模式） ──────────────────────
  useEffect(() => {
    if (editorRef.current && !editorRef.current.textContent) {
      editorRef.current.textContent = DEFAULT_CONTENT;
    }
  }, []);

  // ── 选区监听 ──────────────────────────────────────────────

  useEffect(() => {
    if (!isReady) return;

    const handleSelectionChange = () => {
      const host = hostRef.current;
      if (!host || !editorRef.current) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        setSelectionInfo(null);
        setSelectionRect(null);
        host.updateSelection(null);
        refreshUI();
        return;
      }

      const range = selection.getRangeAt(0);

      if (!editorRef.current.contains(range.commonAncestorContainer)) {
        setSelectionInfo(null);
        setSelectionRect(null);
        host.updateSelection(null);
        refreshUI();
        return;
      }

      const text = selection.toString();
      if (!text || text.trim() === "") {
        setSelectionInfo(null);
        setSelectionRect(null);
        host.updateSelection(null);
        refreshUI();
        return;
      }

      const rect = range.getBoundingClientRect();
      const info: SelectionInfo = {
        text,
        start: 0,
        end: text.length,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      };

      setSelectionInfo(info);
      setSelectionRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      host.updateSelection(info);
      refreshUI();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [isReady, refreshUI]);

  // ── 编辑器内容变化 ──────────────────────────────────────────

  const handleEditorInput = useCallback(() => {
    // IME 输入法组合期间不处理，等 compositionend 后再同步
    if (isComposingRef.current) return;

    const host = hostRef.current;
    if (!host || !editorRef.current) return;

    const content = editorRef.current.textContent ?? "";
    // 不调用 setEditorContent — contentEditable 是非受控的，
    // React 重渲染会导致光标跳到最前面 + IME 内容错乱

    // 同步到 TabManager
    const tm = tabManagerRef.current;
    const atId = tm?.getActiveTabId();
    if (tm && atId) {
      tm.updateContent(atId, content);
    }

    host.notifyContentChange();
    refreshUI();
  }, [refreshUI]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    // compositionend 后立即同步一次内容
    handleEditorInput();
  }, [handleEditorInput]);

  // ── 命令执行 ──────────────────────────────────────────────

  const handleExecuteCommand = useCallback(
    async (commandId: string) => {
      const host = hostRef.current;
      if (!host) return;

      setExecutingCommand(commandId);
      try {
        await host.executeCommand(commandId);
        showToast(`命令 "${commandId}" 执行成功`, "success");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        showToast(`命令执行失败: ${msg}`, "error");
        addLog("error", `命令 "${commandId}" 执行失败: ${msg}`);
      } finally {
        setExecutingCommand(null);
        refreshUI();
      }
    },
    [showToast, addLog, refreshUI],
  );

  // ── 插件管理操作 ──────────────────────────────────────────

  const handleInstallPlugin = useCallback(
    (manifest: PluginManifest) => {
      const host = hostRef.current;
      if (!host) return;
      try {
        host.installPlugin(manifest);
        refreshUI();
        refreshConfigEntries();
        showToast(`插件 "${manifest.name}" 已安装`, "success");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        showToast(`安装失败: ${msg}`, "error");
      }
    },
    [refreshUI, refreshConfigEntries, showToast],
  );

  const handleUninstallPlugin = useCallback(
    async (pluginId: string) => {
      const host = hostRef.current;
      if (!host) return;
      try {
        await host.uninstallPlugin(pluginId, true);
        setPluginErrors((prev) => {
          const next = new Map(prev);
          next.delete(pluginId);
          return next;
        });
        refreshUI();
        refreshConfigEntries();
        showToast(`插件 "${pluginId}" 已卸载`, "success");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        showToast(`卸载失败: ${msg}`, "error");
      }
    },
    [refreshUI, refreshConfigEntries, showToast],
  );

  const handleActivatePlugin = useCallback(
    async (pluginId: string) => {
      const host = hostRef.current;
      if (!host) return;
      try {
        const result = await host.activatePlugin(pluginId, "manual");
        if (result.success) {
          showToast(`插件 "${pluginId}" 已激活`, "success");
        } else {
          showToast(`激活失败: ${result.error}`, "error");
        }
        refreshUI();
        refreshConfigEntries();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        showToast(`激活失败: ${msg}`, "error");
      }
    },
    [refreshUI, refreshConfigEntries, showToast],
  );

  const handleDeactivatePlugin = useCallback(
    async (pluginId: string) => {
      const host = hostRef.current;
      if (!host) return;
      try {
        await host.deactivatePlugin(pluginId);
        refreshUI();
        refreshConfigEntries();
        showToast(`插件 "${pluginId}" 已停用`, "success");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        showToast(`停用失败: ${msg}`, "error");
      }
    },
    [refreshUI, refreshConfigEntries, showToast],
  );

  // ── 编辑器内置操作（加粗 / 斜体）──────────────────────────────

  const handleEditorAction = useCallback((action: "bold" | "italic") => {
    if (editorRef.current) applyTextWrap(editorRef.current, action);
  }, []);

  // ── 弹窗回调 ──────────────────────────────────────────────

  const handlePopupAction = useCallback(
    async (commandId: string, ...args: unknown[]) => {
      const host = hostRef.current;
      if (!host) return;
      try {
        await host.executeCommand(commandId, ...args);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        showToast(`操作失败: ${msg}`, "error");
      }
      // 图片插入后关闭弹窗；表情选择不关闭（允许连续选择）
      if (commandId === "image-upload.doInsert") {
        setPopupData(null);
      }
    },
    [showToast],
  );

  // ── 快捷键处理（已内置在 KeybindingService 中，这里补充 Escape 等 UI 快捷键）──

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [contextMenu]);

  // ── 右键菜单处理 ──────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const host = hostRef.current;
    if (!host) return;

    e.preventDefault();
    const groups = host.contributions.getVisibleMenusByGroup();
    if (groups.size === 0) return;

    setContextMenu({
      groups,
      position: { x: e.clientX, y: e.clientY },
    });
  }, []);

  // ── Tab 操作 ──────────────────────────────────────────────

  const handleTabClick = useCallback(
    (tabId: string) => {
      const tm = tabManagerRef.current;
      if (!tm) return;
      tm.setActiveTab(tabId);
      refreshTabs();
    },
    [refreshTabs],
  );

  const handleTabClose = useCallback(
    (tabId: string) => {
      const tm = tabManagerRef.current;
      if (!tm) return;
      tm.removeTab(tabId);
      refreshTabs();
      // 同步编辑器内容
      const activeTab = tm.getActiveTab();
      if (activeTab && editorRef.current) {
        editorRef.current.textContent = activeTab.content;
      }
    },
    [refreshTabs],
  );

  const handleTabAdd = useCallback(() => {
    const tm = tabManagerRef.current;
    if (!tm) return;
    const count = tm.tabCount + 1;
    tm.addTab(`untitled-${count}`, "");
    refreshTabs();
    if (editorRef.current) {
      editorRef.current.textContent = "";
    }
  }, [refreshTabs]);

  // ── 配置更新 ──────────────────────────────────────────────

  const handleConfigChange = useCallback(
    (pluginId: string, key: string, value: unknown) => {
      const host = hostRef.current;
      if (!host) return;
      host.configurationService.update(pluginId, key, value);
      addLog("system", `配置更新: [${pluginId}] ${key} = ${JSON.stringify(value)}`);
      refreshConfigEntries();
    },
    [addLog, refreshConfigEntries],
  );

  // ── 侧栏切换自动刷新数据 ──────────────────────────────────

  useEffect(() => {
    if (sidebarPanel === "outline") {
      refreshOutlineTree();
    }
    if (sidebarPanel === "settings") {
      refreshConfigEntries();
    }
  }, [sidebarPanel, refreshOutlineTree, refreshConfigEntries]);

  // ── 渲染 ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-gray-950 text-gray-100">
      {/* ── 顶部标题栏 ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-white">🧩 VS Code 风格插件宿主</h1>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
              Manifest
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              ContributionPoint
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ActivationEvent
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Permission
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              MultiTab
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
              TreeView
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            已安装: <span className="text-blue-400 font-mono">{installedPlugins.size}</span>
          </span>
          <span>
            已激活: <span className="text-green-400 font-mono">{activePlugins.size}</span>
          </span>
          <span>
            Tab: <span className="text-cyan-400 font-mono">{tabs.length}</span>
          </span>
          {!isReady && <span className="text-amber-400 animate-pulse">初始化中...</span>}
        </div>
      </div>

      {/* ── 主内容区 ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* ════════ ActivityBar ════════ */}
        <div className="w-10 bg-gray-900 border-r border-gray-800 flex flex-col items-center pt-2 gap-1 shrink-0">
          {/* 大纲按钮 */}
          <ActivityBarButton
            icon="⚡"
            title="大纲"
            active={sidebarPanel === "outline"}
            onClick={() => setSidebarPanel((p) => (p === "outline" ? null : "outline"))}
          />
          {/* 配置按钮 */}
          <ActivityBarButton
            icon="⚙️"
            title="插件配置"
            active={sidebarPanel === "settings"}
            onClick={() => setSidebarPanel((p) => (p === "settings" ? null : "settings"))}
          />

          {/* 动态视图容器按钮 */}
          {viewContainers
            .filter((vc) => vc.id !== "outline-container")
            .map((vc) => (
              <ActivityBarButton
                key={vc.id}
                icon={vc.icon}
                title={vc.title}
                active={false}
                onClick={() => showToast(`视图容器: ${vc.title}`, "info")}
              />
            ))}

          <div className="flex-1" />

          {/* 底部分隔 */}
          <div className="w-5 border-t border-gray-800 mb-2" />
        </div>

        {/* ════════ 侧栏 ════════ */}
        {sidebarPanel && (
          <div className="w-56 bg-gray-900/50 border-r border-gray-800 flex flex-col shrink-0 overflow-hidden">
            {sidebarPanel === "outline" && (
              <OutlinePanel
                treeNodes={treeNodes}
                treeLoading={treeLoading}
                onRefresh={refreshOutlineTree}
                onExecuteCommand={handleExecuteCommand}
              />
            )}
            {sidebarPanel === "settings" && (
              <SettingsPanel entries={configEntries} onChange={handleConfigChange} />
            )}
          </div>
        )}

        {/* ════════ 编辑器区域 ════════ */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-800">
          {/* ── Tab 栏 ── */}
          <EditorTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onTabAdd={handleTabAdd}
          />

          {/* ── 编辑器工具栏 ── */}
          <EditorToolbar
            host={hostRef.current}
            onExecuteCommand={handleExecuteCommand}
            onEditorAction={handleEditorAction}
            onPopupAction={handlePopupAction}
            popupData={popupData}
            onPopupClose={() => setPopupData(null)}
          />

          {/* ── 使用提示 ── */}
          <div className="px-4 py-1.5 bg-gray-900/50 border-b border-gray-800 text-[11px] text-gray-600 flex items-center gap-3 shrink-0">
            <span>💡 选中文字弹出浮动工具条</span>
            <span>⌨️ Ctrl+Shift+T 翻译</span>
            <span>📊 状态栏实时统计</span>
            <span>🖱️ 右键查看上下文菜单</span>
          </div>

          {/* ── 编辑器 ── */}
          <div className="flex-1 overflow-auto p-4">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              tabIndex={0}
              onInput={handleEditorInput}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onContextMenu={handleContextMenu}
              onFocus={() => {
                hostRef.current?.updateContext({ editorFocused: true });
              }}
              onBlur={() => {
                hostRef.current?.updateContext({ editorFocused: false });
              }}
              className="
                min-h-50 max-w-none p-5
                bg-gray-900 border border-gray-700 rounded-xl
                text-gray-200 text-sm leading-relaxed
                focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20
                whitespace-pre-wrap wrap-break-word
                selection:bg-blue-500/30
              "
              style={{ caretColor: "#60a5fa" }}
            />
          </div>
        </div>

        {/* ════════ 右侧：插件市场 ════════ */}
        <div className="w-95 shrink-0 flex flex-col overflow-hidden bg-gray-900/30">
          <div className="px-3 py-2 border-b border-gray-800 shrink-0">
            <h2 className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
              <span>🧩</span>
              <span>插件市场</span>
              <span className="text-gray-600 font-normal ml-1">({ALL_V2_PLUGINS.length})</span>
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-3">
            <PluginMarket
              plugins={ALL_V2_PLUGINS}
              installedPlugins={installedPlugins}
              activePlugins={activePlugins}
              pluginErrors={pluginErrors}
              onInstall={handleInstallPlugin}
              onUninstall={handleUninstallPlugin}
              onActivate={handleActivatePlugin}
              onDeactivate={handleDeactivatePlugin}
            />
          </div>
        </div>
      </div>

      {/* ── 底部面板区：事件日志 + 诊断 ── */}
      <BottomPanels
        eventLog={eventLog}
        onClearLog={() => setEventLog([])}
        diagnosticsData={diagnosticsData}
        onRefreshDiagnostics={() => {
          if (hostRef.current) {
            setDiagnosticsData(hostRef.current.getDiagnostics());
          }
        }}
        showEventLog={showEventLog}
        setShowEventLog={setShowEventLog}
        showDiagnostics={showDiagnostics}
        setShowDiagnostics={setShowDiagnostics}
        logCount={eventLog.length}
      />

      {/* ── 状态栏 ── */}
      <StatusBar items={statusBarItems} host={hostRef.current} selectionInfo={selectionInfo} />

      {/* ── 选中浮动工具条 ── */}
      <SelectionToolbar
        items={toolbarItems}
        selectionRect={selectionRect}
        visible={selectionInfo != null && toolbarItems.length > 0}
        onExecuteCommand={handleExecuteCommand}
        executingCommandId={executingCommand}
      />

      {/* ── 右键上下文菜单 ── */}
      {contextMenu && (
        <ContextMenu
          groups={contextMenu.groups}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onExecute={(commandId) => {
            handleExecuteCommand(commandId);
            setContextMenu(null);
          }}
          getKeybinding={(cmdId) => {
            const host = hostRef.current;
            if (!host) return null;
            return host.keybindings.getKeybindingForCommand(cmdId) ?? null;
          }}
          getCommandTitle={(cmdId) => {
            const host = hostRef.current;
            if (!host) return null;
            return host.contributions.getCommand(cmdId)?.contribution.title ?? null;
          }}
          getCommandIcon={(cmdId) => {
            const host = hostRef.current;
            if (!host) return null;
            return host.contributions.getCommand(cmdId)?.contribution.icon ?? null;
          }}
        />
      )}

      {/* ── Toast 提示 ── */}
      {toast && (
        <div
          className={`
            fixed bottom-16 left-1/2 -translate-x-1/2 z-[10001]
            px-4 py-2 rounded-lg text-sm font-medium shadow-lg
            transition-all duration-200 animate-[fadeInUp_200ms_ease]
            ${toast.type === "success" ? "bg-green-600 text-white" : ""}
            ${toast.type === "error" ? "bg-red-600 text-white" : ""}
            ${toast.type === "info" ? "bg-gray-700 text-gray-200 border border-gray-600" : ""}
          `}
        >
          {toast.type === "success" && "✅ "}
          {toast.type === "error" && "❌ "}
          {toast.type === "info" && "ℹ️ "}
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ==================== ActivityBarButton ====================

function ActivityBarButton({
  icon,
  title,
  active,
  onClick,
}: {
  icon: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`
        w-8 h-8 flex items-center justify-center rounded text-sm transition-colors
        ${
          active
            ? "bg-gray-700 text-white border-l-2 border-blue-500"
            : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
        }
      `}
    >
      {icon}
    </button>
  );
}

// ==================== EditorTabBar 多标签栏 ====================

function EditorTabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabAdd,
}: {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabAdd: () => void;
}) {
  return (
    <div className="flex items-center bg-gray-900 border-b border-gray-800 shrink-0 h-8 select-none overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onTabClick(tab.id)}
            className={`
              group flex items-center gap-1.5 px-3 h-full text-[11px] cursor-pointer
              border-r border-gray-800 shrink-0 transition-colors
              ${
                isActive
                  ? "bg-gray-950 text-gray-200 border-t-2 border-t-blue-500 -mb-px"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
              }
            `}
          >
            <span className="text-[10px] opacity-60">📄</span>
            <span className="truncate max-w-24">{tab.title}</span>
            {tab.isDirty && <span className="text-amber-400 text-[10px]">●</span>}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className={`
                w-4 h-4 flex items-center justify-center rounded text-[10px]
                transition-colors ml-0.5
                ${
                  isActive
                    ? "text-gray-500 hover:text-gray-200 hover:bg-gray-700"
                    : "text-transparent group-hover:text-gray-600 hover:!text-gray-300 hover:bg-gray-700"
                }
              `}
            >
              ✕
            </button>
          </div>
        );
      })}

      {/* 新建 Tab 按钮 */}
      <button
        type="button"
        onClick={onTabAdd}
        title="新建标签页"
        className="w-8 h-full flex items-center justify-center text-gray-600 hover:text-gray-300 hover:bg-gray-800/50 transition-colors shrink-0"
      >
        +
      </button>

      <div className="flex-1" />
    </div>
  );
}

// ==================== OutlinePanel 大纲面板 ====================

function OutlinePanel({
  treeNodes,
  treeLoading,
  onRefresh,
  onExecuteCommand,
}: {
  treeNodes: TreeNode[];
  treeLoading: boolean;
  onRefresh: () => void;
  onExecuteCommand: (commandId: string) => void;
}) {
  return (
    <>
      <div className="px-3 py-2 border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-wider flex items-center justify-between shrink-0">
        <span>⚡ 大纲</span>
        <button
          type="button"
          onClick={onRefresh}
          className="text-gray-600 hover:text-gray-400 text-xs"
          title="刷新大纲"
        >
          ↺
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {treeLoading ? (
          <div className="px-3 py-2 text-xs text-gray-600 animate-pulse">加载中...</div>
        ) : treeNodes.length === 0 ? (
          <div className="px-3 py-6 text-xs text-gray-700 text-center">
            <div className="text-2xl mb-2">📑</div>
            <div>暂无大纲数据</div>
            <div className="text-[10px] mt-1">需要 Outline View 插件处于激活状态</div>
          </div>
        ) : (
          treeNodes.map((node, i) => (
            <TreeNodeItem
              key={`${node.id}-${i}`}
              node={node}
              depth={0}
              onExecuteCommand={onExecuteCommand}
            />
          ))
        )}
      </div>
    </>
  );
}

// ==================== TreeNodeItem ====================

function TreeNodeItem({
  node,
  depth,
  onExecuteCommand,
}: {
  node: TreeNode;
  depth: number;
  onExecuteCommand: (commandId: string) => void;
}) {
  const [expanded, setExpanded] = useState(node.collapsibleState === "expanded");
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 rounded cursor-pointer hover:bg-gray-800/50 text-[11px] text-gray-400 group"
        style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: 8 }}
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v);
          if (node.command) onExecuteCommand(node.command.commandId);
        }}
      >
        {hasChildren ? (
          <span className="text-gray-600 w-3 shrink-0 text-[10px]">{expanded ? "▾" : "▸"}</span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {node.icon && <span className="shrink-0 text-xs">{node.icon}</span>}
        <span className="truncate flex-1">{node.label}</span>
        {node.description && (
          <span className="text-gray-700 text-[9px] shrink-0">{node.description}</span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child, i) => (
            <TreeNodeItem
              key={`${child.id}-${i}`}
              node={child}
              depth={depth + 1}
              onExecuteCommand={onExecuteCommand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== SettingsPanel 配置面板 ====================

function SettingsPanel({
  entries,
  onChange,
}: {
  entries: ConfigEntry[];
  onChange: (pluginId: string, key: string, value: unknown) => void;
}) {
  // 按插件名分组
  const grouped = new Map<string, ConfigEntry[]>();
  for (const entry of entries) {
    if (!grouped.has(entry.pluginName)) {
      grouped.set(entry.pluginName, []);
    }
    grouped.get(entry.pluginName)!.push(entry);
  }

  return (
    <>
      <div className="px-3 py-2 border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-wider shrink-0">
        ⚙️ 插件配置
      </div>
      <div className="flex-1 overflow-auto py-2 px-2 space-y-3">
        {entries.length === 0 ? (
          <div className="px-1 py-6 text-xs text-gray-700 text-center">
            <div className="text-2xl mb-2">⚙️</div>
            <div>无可配置项</div>
            <div className="text-[10px] mt-1">安装带有配置的插件后此处会显示</div>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([pluginName, groupEntries]) => (
            <div key={pluginName}>
              <div className="text-[10px] text-gray-500 font-semibold mb-1.5 px-1">
                {pluginName}
              </div>
              <div className="space-y-2 bg-gray-800/30 rounded-lg p-2 border border-gray-800/50">
                {groupEntries.map((entry) => (
                  <div key={entry.key}>
                    <div className="text-[9px] text-gray-600 mb-0.5 font-mono">{entry.key}</div>
                    <ConfigControl entry={entry} onChange={onChange} />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ==================== ConfigControl 配置控件 ====================

function ConfigControl({
  entry,
  onChange,
}: {
  entry: ConfigEntry;
  onChange: (pluginId: string, key: string, value: unknown) => void;
}) {
  const { schema, value } = entry;

  if (schema.type === "boolean") {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(entry.pluginId, entry.key, e.target.checked)}
          className="w-3.5 h-3.5 accent-blue-500"
        />
        <span className="text-[11px] text-gray-400">{schema.description}</span>
      </label>
    );
  }

  if (schema.type === "number") {
    return (
      <div className="space-y-1">
        <div className="text-[10px] text-gray-600">{schema.description}</div>
        <input
          type="number"
          value={Number(value)}
          min={schema.minimum}
          max={schema.maximum}
          onChange={(e) => onChange(entry.pluginId, entry.key, Number(e.target.value))}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500"
        />
      </div>
    );
  }

  if (schema.type === "string" && schema.enum) {
    return (
      <div className="space-y-1">
        <div className="text-[10px] text-gray-600">{schema.description}</div>
        <select
          value={String(value)}
          onChange={(e) => onChange(entry.pluginId, entry.key, e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500"
        >
          {schema.enum.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // fallback: string input
  return (
    <div className="space-y-1">
      <div className="text-[10px] text-gray-600">{schema.description}</div>
      <input
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(entry.pluginId, entry.key, e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500"
      />
    </div>
  );
}

// ==================== EditorToolbar 编辑器工具栏 ====================

function EditorToolbar({
  host,
  onExecuteCommand,
  onEditorAction,
  onPopupAction,
  popupData,
  onPopupClose,
}: {
  host: NewPluginHost | null;
  onExecuteCommand: (commandId: string) => void;
  onEditorAction: (action: "bold" | "italic") => void;
  onPopupAction: (commandId: string, ...args: unknown[]) => void;
  popupData: PopupData | null;
  onPopupClose: () => void;
}) {
  // 按钮 ref map — 用于锚定弹窗位置
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // 触发按钮 ID 直接从 popupData.triggerCommand 读取
  // 对标 VS Code：宿主不再写死 type → commandId 的映射
  const popupTrigger = popupData?.triggerCommand ?? null;

  // 点击外部关闭弹窗
  useEffect(() => {
    if (!popupData) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (popupTrigger) {
        const btn = buttonRefs.current.get(popupTrigger);
        if (btn?.contains(target)) return;
      }
      onPopupClose();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onPopupClose();
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [popupData, popupTrigger, onPopupClose]);

  // 宿主内置按钮（不依赖插件）
  const builtinButtons: Array<{
    id: string;
    icon: string;
    title: string;
    action: () => void;
    shortcut?: string;
  }> = [
    {
      id: "bold",
      icon: "𝐁",
      title: "加粗",
      action: () => onEditorAction("bold"),
      shortcut: "Ctrl+B",
    },
    {
      id: "italic",
      icon: "𝐼",
      title: "斜体",
      action: () => onEditorAction("italic"),
      shortcut: "Ctrl+I",
    },
  ];

  // 插件按钮：从 ContributionManager 读取 editor/title 菜单贡献
  // 对标 VS Code menus["editor/title"]：宿主不感知具体插件，只渲染命令元数据
  const editorTitleMenus = host
    ? (host.contributions.getVisibleMenusByGroup().get("editor/title") ?? [])
    : [];

  const handlePluginButtonClick = (commandId: string) => {
    // 如果该弹窗已打开 → toggle 关闭
    if (popupTrigger === commandId && popupData) {
      onPopupClose();
      return;
    }
    // 在执行命令前，计算按钮位置并存入 state（供弹窗定位）
    const btn = buttonRefs.current.get(commandId);
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    }
    onExecuteCommand(commandId);
  };

  return (
    <div className="relative flex items-center gap-1 px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0">
      <span className="text-[10px] text-gray-600 mr-2 select-none">工具栏</span>

      {/* 宿主内置按钮 */}
      {builtinButtons.map((btn) => (
        <button
          type="button"
          key={btn.id}
          onClick={btn.action}
          title={`${btn.title}${btn.shortcut ? ` (${btn.shortcut})` : ""}`}
          className="w-8 h-8 flex items-center justify-center rounded-md text-sm font-semibold text-gray-400 hover:bg-gray-700 hover:text-white active:bg-gray-600 cursor-pointer transition-all duration-150"
        >
          {btn.icon}
        </button>
      ))}

      <div className="w-px h-5 bg-gray-800 mx-1" />

      {/* 插件按钮 — 由 editor/title 菜单贡献点驱动，宿主不写死任何插件 ID */}
      {editorTitleMenus.map((menu) => {
        const cmd = host?.contributions.getCommand(menu.command);
        const icon = cmd?.contribution.icon ?? "🔌";
        const title = cmd?.contribution.title ?? menu.command;
        const isPopupOpen = popupTrigger === menu.command && popupData != null;

        return (
          <button
            type="button"
            key={menu.command}
            ref={(el) => {
              if (el) buttonRefs.current.set(menu.command, el);
            }}
            onClick={() => handlePluginButtonClick(menu.command)}
            disabled={!host}
            title={title}
            className={`
              w-8 h-8 flex items-center justify-center rounded-md text-base
              transition-all duration-150
              ${isPopupOpen ? "bg-gray-700 ring-1 ring-blue-500/40" : ""}
              ${
                host
                  ? "hover:bg-gray-700 active:bg-gray-600 cursor-pointer"
                  : "opacity-30 cursor-not-allowed"
              }
            `}
          >
            {icon}
          </button>
        );
      })}

      <div className="w-px h-5 bg-gray-800 mx-1" />

      <div className="flex items-center gap-1 text-[10px] text-gray-600 ml-1">
        <span>🌐</span>
        <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-500 font-mono border border-gray-700 text-[9px]">
          Ctrl+Shift+T
        </kbd>
        <span>翻译</span>
      </div>

      {/* ── 锚定弹窗（popover）— 通过注册表查找渲染器，宿主不感知具体弹窗类型 ── */}
      {popupData &&
        popoverPos &&
        (() => {
          const Renderer = popupRendererRegistry.get(popupData.type);
          if (!Renderer) return null;
          return (
            <div
              ref={popoverRef}
              className="fixed z-[9999] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden animate-[fadeInUp_150ms_ease]"
              style={{ top: popoverPos.top, left: popoverPos.left }}
            >
              <Renderer
                data={popupData}
                onAction={(commandId: string, ...args: unknown[]) =>
                  onPopupAction(commandId, ...args)
                }
                onClose={onPopupClose}
              />
            </div>
          );
        })()}
    </div>
  );
}

// ==================== EmojiPopup 表情面板 ====================
//
// 遵循统一的 PopupRendererProps 接口。
// 宿主通过 popupRendererRegistry 查表调用，不需要 import 此组件。
// 内部通过类型断言访问 emoji-picker 专有字段。

function EmojiPopup({ data, onAction, onClose }: PopupRendererProps) {
  // 类型断言：此组件只会在 type === "emoji-picker" 时被调用
  const d = data as GenericPopupData & {
    title: string;
    groups: Array<{ label: string; icon: string; emojis: string[] }>;
    allEmojis: string[];
    onSelectCommand: string;
  };

  const [activeGroup, setActiveGroup] = useState(0);
  const [search, setSearch] = useState("");

  const displayEmojis = search
    ? d.allEmojis.filter(() => true)
    : (d.groups[activeGroup]?.emojis ?? []);

  return (
    <div className="w-80">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
        <span className="text-sm font-semibold text-white">{d.title}</span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors text-xs"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-800/50">
        {d.groups.map((group, index) => (
          <button
            type="button"
            key={group.label}
            onClick={() => {
              setActiveGroup(index);
              setSearch("");
            }}
            title={group.label}
            className={`
              w-7 h-7 flex items-center justify-center rounded text-sm transition-colors
              ${activeGroup === index && !search ? "bg-gray-700" : "hover:bg-gray-800"}
            `}
          >
            {group.icon}
          </button>
        ))}
      </div>

      <div className="p-3 grid grid-cols-8 gap-0.5 max-h-48 overflow-auto">
        {displayEmojis.map((emoji) => (
          <button
            type="button"
            key={emoji}
            onClick={() => onAction(d.onSelectCommand, emoji)}
            className="w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-gray-700 transition-colors leading-none"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-gray-800/50 text-[10px] text-gray-600">
        点击表情即可插入 · 共 {d.allEmojis.length} 个表情
      </div>
    </div>
  );
}

// ==================== ImageUploadPopup ====================
//
// 遵循统一的 PopupRendererProps 接口。
// 内部通过类型断言访问 image-upload 专有字段。

function ImageUploadPopup({ data, onAction, onClose }: PopupRendererProps) {
  // 类型断言：此组件只会在 type === "image-upload" 时被调用
  const d = data as GenericPopupData & {
    title: string;
    placeholder: string;
    onConfirmCommand: string;
    exampleUrls: Array<{ label: string; url: string }>;
  };

  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (url.trim()) {
      onAction(d.onConfirmCommand, url.trim());
    }
  };

  return (
    <div className="w-96">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
        <span className="text-sm font-semibold text-white">{d.title}</span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors text-xs"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3">
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) handleSubmit();
            if (e.key === "Escape") onClose();
          }}
          placeholder={d.placeholder}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 placeholder:text-gray-600"
        />

        {d.exampleUrls.length > 0 && (
          <div>
            <span className="text-[10px] text-gray-600 block mb-1.5">快速选择示例：</span>
            <div className="flex flex-wrap gap-1.5">
              {d.exampleUrls.map((example) => (
                <button
                  type="button"
                  key={example.url}
                  onClick={() => setUrl(example.url)}
                  className="px-2 py-1 text-[11px] rounded-md bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors border border-gray-700"
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors rounded-md hover:bg-gray-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!url.trim()}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            插入
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== popupRendererRegistry ====================
//
// 对标 VS Code 的 WebviewViewProvider 注册表：
// 宿主只维护一张 type → Component 的映射表，完全不感知具体弹窗。
// 新增弹窗类型只需：1) 插件 emit type  2) 此处注册一行
// page.tsx 的其余代码一行都不用改。
const popupRendererRegistry = new Map<
  string,
  React.ComponentType<import("./types").PopupRendererProps>
>([
  ["emoji-picker", EmojiPopup],
  ["image-upload", ImageUploadPopup],
]);

// ==================== BottomPanels 底部面板 ====================

function BottomPanels({
  eventLog,
  onClearLog,
  diagnosticsData,
  onRefreshDiagnostics,
  showEventLog,
  setShowEventLog,
  showDiagnostics,
  setShowDiagnostics,
  logCount,
}: {
  eventLog: Array<{ time: string; type: string; detail: string }>;
  onClearLog: () => void;
  diagnosticsData: unknown;
  onRefreshDiagnostics: () => void;
  showEventLog: boolean;
  setShowEventLog: (v: boolean) => void;
  showDiagnostics: boolean;
  setShowDiagnostics: (v: boolean) => void;
  logCount: number;
}) {
  const anyOpen = showEventLog || showDiagnostics;

  return (
    <div className="border-t border-gray-800 bg-gray-900/80 shrink-0">
      <div className="flex items-center gap-0.5 px-2 h-7 border-b border-gray-800/50">
        <PanelTab
          label="📋 事件日志"
          active={showEventLog}
          badge={logCount > 0 ? logCount : undefined}
          onClick={() => {
            setShowEventLog(!showEventLog);
            if (!showEventLog) setShowDiagnostics(false);
          }}
        />
        <PanelTab
          label="🔍 诊断"
          active={showDiagnostics}
          onClick={() => {
            setShowDiagnostics(!showDiagnostics);
            if (!showDiagnostics) {
              setShowEventLog(false);
              onRefreshDiagnostics();
            }
          }}
        />

        <div className="flex-1" />

        {showEventLog && (
          <button
            type="button"
            onClick={onClearLog}
            className="px-2 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            清空
          </button>
        )}
        {showDiagnostics && (
          <button
            type="button"
            onClick={onRefreshDiagnostics}
            className="px-2 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            🔄 刷新
          </button>
        )}
      </div>

      {anyOpen && (
        <div className="h-44 overflow-auto">
          {showEventLog && <EventLogContent events={eventLog} />}
          {showDiagnostics && <DiagnosticsContent data={diagnosticsData} />}
        </div>
      )}
    </div>
  );
}

function PanelTab({
  label,
  active,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-1 px-2.5 h-full text-[11px] transition-colors border-b-2 -mb-px
        ${
          active
            ? "text-gray-200 border-blue-500"
            : "text-gray-600 border-transparent hover:text-gray-400"
        }
      `}
    >
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`
            text-[9px] px-1 py-px rounded-full font-mono
            ${active ? "bg-blue-500/20 text-blue-400" : "bg-gray-800 text-gray-500"}
          `}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

// ==================== EventLogContent ====================

function EventLogContent({
  events,
}: {
  events: Array<{ time: string; type: string; detail: string }>;
}) {
  const typeColors: Record<string, string> = {
    installed: "text-blue-400",
    activated: "text-green-400",
    deactivated: "text-amber-400",
    uninstalled: "text-gray-400",
    error: "text-red-400",
    command: "text-purple-400",
    "permission-denied": "text-red-500",
    system: "text-cyan-400",
  };

  const typeIcons: Record<string, string> = {
    installed: "📥",
    activated: "✅",
    deactivated: "⏸",
    uninstalled: "🗑",
    error: "❌",
    command: "⚡",
    "permission-denied": "🚫",
    system: "🔧",
  };

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-700 text-xs">
        📭 暂无事件记录 — 操作插件后事件会出现在这里
      </div>
    );
  }

  return (
    <div className="font-mono text-[11px] p-1">
      {events.map((event, idx) => (
        <div
          key={`${event.time}-${event.type}-${idx}`}
          className="flex items-start gap-1.5 py-0.5 px-2 rounded hover:bg-gray-800/50 transition-colors"
        >
          <span className="text-gray-700 shrink-0 w-16">{event.time}</span>
          <span className="shrink-0 w-3.5">{typeIcons[event.type] ?? "•"}</span>
          <span className={`shrink-0 w-24 truncate ${typeColors[event.type] ?? "text-gray-400"}`}>
            [{event.type}]
          </span>
          <span className="text-gray-500 break-all">{event.detail}</span>
        </div>
      ))}
    </div>
  );
}

// ==================== DiagnosticsContent ====================

function DiagnosticsContent({ data }: { data: unknown }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-gray-700 text-xs">
        🔍 点击「刷新」查看当前诊断数据
      </div>
    );
  }

  const d = data as Record<string, unknown>;

  const sections = [
    {
      title: "总览",
      data: { started: d.started, disposed: d.disposed, sandboxMode: d.sandboxMode },
    },
    { title: "Registry", data: d.registry },
    { title: "Contributions", data: d.contributions },
    { title: "Activation", data: d.activation },
    { title: "Context Keys", data: d.contextKeys },
    { title: "Sandboxes", data: d.sandboxes },
    { title: "Permission Guards", data: d.guards },
  ];

  return (
    <div className="divide-y divide-gray-800/50">
      {sections.map((section) => (
        <DiagnosticsSection key={section.title} title={section.title} data={section.data} />
      ))}
    </div>
  );
}

function DiagnosticsSection({ title, data }: { title: string; data: unknown }) {
  const [expanded, setExpanded] = useState(false);

  if (data === undefined || data === null) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-gray-400 hover:bg-gray-800/50 transition-colors"
      >
        <span>{title}</span>
        <span className="text-gray-700 text-[10px]">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-[10px] text-gray-600 bg-gray-950/50 overflow-auto max-h-48 font-mono leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ==================== StatusBar 组件 ====================

function StatusBar({
  items,
  host,
  selectionInfo,
}: {
  items: SourcedStatusBarContribution[];
  host: NewPluginHost | null;
  selectionInfo: SelectionInfo | null;
}) {
  const leftItems = items.filter((item) => (item.alignment ?? "left") === "left");
  const rightItems = items.filter((item) => item.alignment === "right");

  return (
    <div className="h-6 flex items-center justify-between px-3 bg-[#1a1a2e] border-t border-gray-800 text-[11px] text-gray-500 shrink-0 select-none">
      <div className="flex items-center gap-3">
        {leftItems.map((item) => {
          const content = host?.getStatusBarContent(item.id) ?? null;
          const command = host?.contributions.getStatusBarCommand(item.id) ?? item.command;
          const tooltip = host?.contributions.getStatusBarTooltip(item.id) ?? item.tooltip;
          const color = host?.contributions.getStatusBarColor(item.id) ?? item.color;
          const backgroundColor =
            host?.contributions.getStatusBarBackgroundColor(item.id) ?? item.backgroundColor;
          return (
            <StatusBarItem
              key={item.id}
              item={item}
              content={content}
              onClick={command ? () => host?.executeCommand(command) : undefined}
              tooltip={tooltip}
              color={color}
              backgroundColor={backgroundColor}
            />
          );
        })}
        {selectionInfo && (
          <span className="text-blue-400">选中 {selectionInfo.text.length} 字符</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {rightItems.map((item) => {
          const content = host?.getStatusBarContent(item.id) ?? null;
          const command = host?.contributions.getStatusBarCommand(item.id) ?? item.command;
          const tooltip = host?.contributions.getStatusBarTooltip(item.id) ?? item.tooltip;
          const color = host?.contributions.getStatusBarColor(item.id) ?? item.color;
          const backgroundColor =
            host?.contributions.getStatusBarBackgroundColor(item.id) ?? item.backgroundColor;
          return (
            <StatusBarItem
              key={item.id}
              item={item}
              content={content}
              onClick={command ? () => host?.executeCommand(command) : undefined}
              tooltip={tooltip}
              color={color}
              backgroundColor={backgroundColor}
            />
          );
        })}
        <span className="text-gray-700">Plugin Host v2</span>
      </div>
    </div>
  );
}

function StatusBarItem({
  item,
  content,
  onClick,
  tooltip,
  color,
  backgroundColor,
}: {
  item: SourcedStatusBarContribution;
  content: { label: string; value?: string; icon?: string } | null;
  onClick?: () => void;
  tooltip?: string;
  color?: string;
  backgroundColor?: string;
}) {
  const displayContent = content ?? { label: item.text ?? item.id };
  const titleText = tooltip ?? displayContent.value ?? displayContent.label;

  return (
    <button
      type="button"
      onClick={onClick}
      title={titleText}
      className={`
        flex items-center gap-1 transition-colors rounded px-1
        ${onClick ? "hover:text-white cursor-pointer" : "cursor-default"}
      `}
      style={{
        color: color ?? undefined,
        backgroundColor: backgroundColor ?? undefined,
      }}
    >
      {displayContent.icon && <span>{displayContent.icon}</span>}
      <span>{displayContent.label}</span>
    </button>
  );
}

// ==================== PluginMarket 组件 ====================

function PluginMarket({
  plugins,
  installedPlugins,
  activePlugins,
  pluginErrors,
  onInstall: handleInstall,
  onUninstall,
  onActivate,
  onDeactivate,
}: {
  plugins: V2PluginDescriptor[];
  installedPlugins: Set<string>;
  activePlugins: Set<string>;
  pluginErrors: Map<string, string>;
  onInstall: (manifest: PluginManifest) => void;
  onUninstall: (pluginId: string) => void;
  onActivate: (pluginId: string) => void;
  onDeactivate: (pluginId: string) => void;
}) {
  const categories = getPluginsByCategory();

  return (
    <div className="space-y-4">
      {Array.from(categories.entries()).map(([category, categoryPlugins]) => (
        <div key={category}>
          <h3 className="text-[11px] font-semibold text-gray-500 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
            <span>{getCategoryIcon(category)}</span>
            <span>{getCategoryLabel(category)}</span>
            <span className="text-gray-700">({categoryPlugins.length})</span>
          </h3>

          <div className="space-y-2">
            {categoryPlugins.map((plugin) => {
              const id = plugin.manifest.id;
              const isInstalled = installedPlugins.has(id);
              const isActive = activePlugins.has(id);
              const error = pluginErrors.get(id);

              const dependents = ALL_V2_PLUGINS.filter((p) =>
                p.manifest.dependencies?.includes(id),
              ).map((p) => p.manifest.id);

              return (
                <PluginCard
                  key={id}
                  plugin={plugin}
                  isInstalled={isInstalled}
                  isActive={isActive}
                  error={error}
                  onInstall={() => handleInstall(plugin.manifest)}
                  onUninstall={() => onUninstall(id)}
                  onActivate={() => onActivate(id)}
                  onDeactivate={() => onDeactivate(id)}
                  installedPlugins={installedPlugins}
                />
              );
            })}
          </div>
        </div>
      ))}

      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 text-[10px] text-gray-600 leading-relaxed space-y-1">
        <h4 className="text-gray-400 font-semibold text-[11px]">📐 架构说明</h4>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              PluginManifest
            </code>{" "}
            声明贡献点和权限
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              ActivationManager
            </code>{" "}
            按 activationEvents 按需激活
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              PermissionGuard
            </code>{" "}
            拦截未授权 API 调用
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              ContributionManager
            </code>{" "}
            驱动 UI 贡献点
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              EditorTabManager
            </code>{" "}
            多 Tab 编辑器状态
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              ConfigurationService
            </code>{" "}
            插件配置管理
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              TreeDataProvider
            </code>{" "}
            侧栏大纲视图
          </li>
        </ul>
      </div>
    </div>
  );
}

// ==================== PluginCard 组件 ====================

function PluginCard({
  plugin,
  isInstalled,
  isActive,
  error,
  onInstall,
  onUninstall,
  onActivate,
  onDeactivate,
  installedPlugins,
}: {
  plugin: V2PluginDescriptor;
  isInstalled: boolean;
  isActive: boolean;
  error?: string;
  onInstall: () => void;
  onUninstall: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  installedPlugins: Set<string>;
}) {
  const m = plugin.manifest;
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      className={`
        relative rounded-lg border p-3 transition-all text-xs
        ${isActive ? "border-green-600/40 bg-green-950/20" : ""}
        ${isInstalled && !isActive ? "border-gray-700/60 bg-gray-900/40" : ""}
        ${!isInstalled ? "border-gray-800 bg-gray-900/20 opacity-60" : ""}
        ${error ? "border-red-600/40 bg-red-950/10" : ""}
      `}
    >
      {/* 头部 */}
      <div className="flex items-start gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-base shrink-0 border border-gray-700/50">
          {m.icon ?? "📦"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-[12px] font-semibold text-white truncate">{m.name}</h4>
            <span className="text-[9px] text-gray-700 font-mono">v{m.version}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1 wrap-break-word">
            {plugin.shortDescription}
          </p>
        </div>
      </div>

      {/* 状态标签 */}
      <div className="flex flex-wrap gap-1 mb-2">
        {isActive && (
          <span className="text-[9px] px-1 py-px rounded bg-green-500/15 text-green-400 border border-green-500/20">
            ● 已激活
          </span>
        )}
        {isInstalled && !isActive && (
          <span className="text-[9px] px-1 py-px rounded bg-gray-700/50 text-gray-400 border border-gray-600/30">
            ○ 已安装
          </span>
        )}
        {!isInstalled && (
          <span className="text-[9px] px-1 py-px rounded bg-gray-800 text-gray-600 border border-gray-700/30">
            未安装
          </span>
        )}
        {error && (
          <span className="text-[9px] px-1 py-px rounded bg-red-500/15 text-red-400 border border-red-500/20">
            ⚠ 错误
          </span>
        )}
        {m.activationEvents.map((ae) => (
          <span
            key={ae}
            className="text-[9px] px-1 py-px rounded bg-blue-500/10 text-blue-400/60 border border-blue-500/15 font-mono"
          >
            {ae}
          </span>
        ))}
      </div>

      {error && (
        <div className="text-[10px] text-red-400 bg-red-950/30 border border-red-900/30 rounded p-1.5 mb-2 wrap-break-word">
          {error}
        </div>
      )}

      {/* 详情展开 */}
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="text-[10px] text-gray-700 hover:text-gray-400 transition-colors mb-1.5"
      >
        {showDetails ? "▾ 收起" : "▸ 详情"}
      </button>

      {showDetails && (
        <div className="text-[10px] space-y-1.5 mb-2 text-gray-500 bg-gray-800/30 rounded-lg p-2 border border-gray-800">
          {/* 权限 */}
          <div>
            <span className="text-gray-400 font-medium">权限:</span>
            <div className="flex flex-wrap gap-0.5 mt-0.5">
              {m.permissions.map((p) => (
                <span
                  key={p}
                  className="px-1 py-px rounded bg-amber-500/10 text-amber-400/60 border border-amber-500/15 font-mono text-[9px]"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* 命令 */}
          {m.contributes?.commands && m.contributes.commands.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">命令:</span>
              <div className="mt-0.5 space-y-0.5">
                {m.contributes.commands.map((cmd) => (
                  <div key={cmd.command} className="flex items-center gap-1">
                    <span className="text-[10px]">{cmd.icon ?? "⚡"}</span>
                    <span className="font-mono text-[9px] text-gray-500">{cmd.command}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 快捷键 */}
          {m.contributes?.keybindings && m.contributes.keybindings.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">快捷键:</span>
              <div className="mt-0.5 space-y-0.5">
                {m.contributes.keybindings.map((kb) => (
                  <div key={kb.command + kb.key} className="flex items-center gap-1">
                    <kbd className="px-1 py-px rounded bg-gray-700 text-gray-400 text-[9px] font-mono border border-gray-600">
                      {kb.key}
                    </kbd>
                    <span className="text-gray-600">→ {kb.command}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 状态栏 */}
          {m.contributes?.statusBar && m.contributes.statusBar.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">状态栏:</span>
              {m.contributes.statusBar.map((sb) => (
                <div key={sb.id} className="font-mono text-[9px] text-gray-600 mt-0.5">
                  {sb.id} ({sb.alignment ?? "left"})
                </div>
              ))}
            </div>
          )}

          {/* 选中工具条 */}
          {m.contributes?.selectionToolbar && m.contributes.selectionToolbar.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">选中工具条:</span>
              {m.contributes.selectionToolbar.map((st) => (
                <div key={st.command} className="flex items-center gap-1 text-[9px] mt-0.5">
                  <span>{st.icon ?? "🔧"}</span>
                  <span className="text-gray-500">{st.title}</span>
                  {st.when && <span className="text-gray-700 font-mono">(when: {st.when})</span>}
                </div>
              ))}
            </div>
          )}

          {/* 右键菜单 */}
          {m.contributes?.menus && m.contributes.menus.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">右键菜单:</span>
              {m.contributes.menus.map((menu) => (
                <div key={menu.command} className="font-mono text-[9px] text-gray-600 mt-0.5">
                  {menu.command} → {menu.group ?? "default"}
                </div>
              ))}
            </div>
          )}

          {/* 依赖关系 */}
          {m.dependencies && m.dependencies.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">依赖:</span>
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {m.dependencies.map((dep) => {
                  const depInstalled = installedPlugins.has(dep);
                  return (
                    <span
                      key={dep}
                      className={`px-1 py-px rounded font-mono text-[9px] border ${
                        depInstalled
                          ? "bg-green-500/10 text-green-400/70 border-green-500/20"
                          : "bg-red-500/10 text-red-400/70 border-red-500/20"
                      }`}
                    >
                      {depInstalled ? "✓" : "✗"} {dep}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 配置项 */}
          {m.contributes?.configuration && (
            <div>
              <span className="text-gray-400 font-medium">
                配置 ({Object.keys(m.contributes.configuration.properties).length} 项):
              </span>
              <div className="mt-0.5 space-y-0.5">
                {Object.entries(m.contributes.configuration.properties).map(([key, schema]) => (
                  <div key={key} className="text-[9px] text-gray-600">
                    <span className="font-mono text-gray-500">{key}</span>
                    <span className="text-gray-700 ml-1">
                      ({schema.type}, 默认: {String(schema.default)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 视图面板 */}
          {m.contributes?.viewsContainers?.activitybar &&
            m.contributes.viewsContainers.activitybar.length > 0 && (
              <div>
                <span className="text-gray-400 font-medium">视图面板:</span>
                {m.contributes.viewsContainers.activitybar.map((vc) => (
                  <div key={vc.id} className="text-[9px] text-gray-600 mt-0.5">
                    {vc.icon} {vc.title} <span className="font-mono text-gray-700">({vc.id})</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-1.5">
        {!isInstalled && (
          <button
            type="button"
            onClick={onInstall}
            className="px-2.5 py-1 text-[10px] rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            安装
          </button>
        )}

        {isInstalled && !isActive && (
          <>
            <button
              type="button"
              onClick={onActivate}
              className="px-2.5 py-1 text-[10px] rounded-md bg-green-600 text-white hover:bg-green-500 transition-colors"
            >
              激活
            </button>
            <button
              type="button"
              onClick={onUninstall}
              className="px-2.5 py-1 text-[10px] rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              卸载
            </button>
          </>
        )}

        {isInstalled && isActive && (
          <>
            <button
              type="button"
              onClick={onDeactivate}
              className="px-2.5 py-1 text-[10px] rounded-md bg-amber-600 text-white hover:bg-amber-500 transition-colors"
            >
              停用
            </button>
            <button
              type="button"
              onClick={onUninstall}
              className="px-2.5 py-1 text-[10px] rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              卸载
            </button>
          </>
        )}
      </div>
    </div>
  );
}
