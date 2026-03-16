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
import type { PluginManifest, SelectionInfo, TreeItem } from "@/plugin-system/manifest-types";

// ── 示例插件 ──────────────────────────────────────────────────
import { ALL_V2_PLUGINS, createDemoPluginLoader } from "@/plugin-system/plugins/v2";

// ── 共享类型 ──────────────────────────────────────────────────
import type { GenericPopupData, SidebarPanel, TreeNode, ConfigEntry, EventLogEntry } from "./types";

// ── 子组件 ────────────────────────────────────────────────────
import { EditorTabBar } from "./components/Editor/EditorTabBar";
import { EditorToolbar } from "./components/Editor/EditorToolbar";
import ActivityBarButton from "./components/Sidebar/ActivityBarButton";
import { OutlinePanel } from "./components/Sidebar/OutlinePanel";
import { SettingsPanel } from "./components/Sidebar/SettingsPanel";
import { BottomPanels } from "./components/BottomPanel/BottomPanels";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { PluginMarket } from "./components/PluginMarket/PluginMarket";

// ── 工具函数 ──────────────────────────────────────────────────
import { applyTextWrap } from "./utils";

type PopupData = GenericPopupData;

// ==================== 默认编辑内容 ====================

const DEFAULT_CONTENT =
  "在这里输入文字来测试插件系统。\n\n选中一段文字后，会弹出浮动工具条（翻译、复制为 Markdown）。\n\n字数统计和自动保存插件会在启动时自动激活。\n\nhttps://github.com 这是一个链接\n\n前端架构设计是一门深奥的学问。";

const SECOND_TAB_CONTENT =
  "# 第二个标签页\n\n这是多 Tab 编辑器的演示。\n\n你可以在不同标签页之间切换，每个标签页有独立的内容。\n\n修改内容会在标签上显示 ● 脏标记。";

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
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);

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
    if (isComposingRef.current) return;

    const host = hostRef.current;
    if (!host || !editorRef.current) return;

    const content = editorRef.current.textContent ?? "";

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
      if (commandId === "image-upload.doInsert") {
        setPopupData(null);
      }
    },
    [showToast],
  );

  // ── 快捷键处理 ──────────────────────────────────────────────

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
          <ActivityBarButton
            icon="⚡"
            title="大纲"
            active={sidebarPanel === "outline"}
            onClick={() => setSidebarPanel((p) => (p === "outline" ? null : "outline"))}
          />
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
