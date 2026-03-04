// ==================== EditorTabManager ====================
//
// 管理多个编辑器 Tab 的状态。
//
// 对标 VS Code 的多标签编辑器：
// - 每个 Tab 有独立的内容、标题、脏状态
// - 支持新建/关闭/切换 Tab
// - Tab 切换时通知宿主更新 EditorBridge 的目标元素
// - 变更事件通知（用于 UI 刷新）
//
// 设计原则：
// - EditorTabManager 是纯状态管理，不依赖 DOM 或 UI 框架
// - 通过事件回调通知变更，UI 层自行决定如何渲染
// - Tab 内容由 manager 持有，切换 Tab 时保存/恢复内容
// - 支持 Disposable 接口，集成到 NewPluginHost 的生命周期中
//
// 与其他模块的关系：
// | 模块              | 职责                                          |
// |-------------------|-----------------------------------------------|
// | APIProxy          | EditorBridge 支持 setTarget 切换 DOM 元素      |
// | NewPluginHost     | 持有 EditorTabManager 实例，协调生命周期        |
// | ContextKeyService | 维护 activeTabId / tabCount 等上下文变量        |
// | page.tsx          | 渲染 Tab 栏 UI、管理多个 contentEditable div    |

import type { Disposable } from "./manifest-types";

// ==================== 类型定义 ====================

/**
 * EditorTab — 单个编辑器标签页的状态
 */
export interface EditorTab {
  /** Tab ID（唯一标识） */
  id: string;
  /** Tab 标题（显示在标签栏上） */
  title: string;
  /** Tab 内容 */
  content: string;
  /** 是否有未保存的修改 */
  isDirty: boolean;
  /** 光标位置（可选，用于恢复光标） */
  cursorPosition?: { line: number; column: number };
  /** 创建时间戳 */
  createdAt: number;
  /** 语言/文件类型标识（可选，用于语法高亮等） */
  language?: string;
}

/**
 * Tab 事件类型
 */
export type TabEvent =
  | { type: "tab-added"; tab: EditorTab }
  | { type: "tab-removed"; tabId: string }
  | { type: "tab-activated"; tabId: string; previousTabId: string | null }
  | { type: "tab-content-changed"; tabId: string }
  | { type: "tab-title-changed"; tabId: string; title: string }
  | { type: "tab-dirty-changed"; tabId: string; isDirty: boolean }
  | { type: "tabs-reordered"; tabIds: string[] };

/**
 * Tab 事件监听器
 */
export type TabEventListener = (event: TabEvent) => void;

/**
 * EditorTabManager 配置
 */
export interface EditorTabManagerConfig {
  /** 初始 Tab 列表（可选，默认创建一个空白 Tab） */
  initialTabs?: Array<{ title: string; content?: string; language?: string }>;
  /** 最大 Tab 数量（可选，默认 20） */
  maxTabs?: number;
  /** 关闭最后一个 Tab 时是否自动创建空白 Tab（默认 true） */
  keepAtLeastOneTab?: boolean;
}

// ==================== EditorTabManager ====================

/**
 * EditorTabManager — 多标签编辑器管理器
 *
 * 用法：
 * ```ts
 * const tabManager = new EditorTabManager({
 *   initialTabs: [{ title: "untitled-1", content: "Hello World" }],
 * });
 *
 * // 新建 Tab
 * const newTab = tabManager.addTab("untitled-2", "some content");
 *
 * // 切换到新 Tab
 * tabManager.setActiveTab(newTab.id);
 *
 * // 更新内容
 * tabManager.updateContent(newTab.id, "updated content");
 *
 * // 关闭 Tab
 * tabManager.removeTab(newTab.id);
 *
 * // 监听事件
 * const disposable = tabManager.onEvent((event) => {
 *   if (event.type === "tab-activated") {
 *     console.log("Active tab:", event.tabId);
 *   }
 * });
 *
 * // 清理
 * tabManager.dispose();
 * ```
 */
export class EditorTabManager implements Disposable {
  // ── 状态 ──

  /** 所有 Tab（有序数组，顺序即标签栏顺序） */
  private tabs: EditorTab[] = [];

  /** 当前激活的 Tab ID */
  private activeTabId: string | null = null;

  /** 事件监听器 */
  private listeners: Set<TabEventListener> = new Set();

  /** ID 计数器 */
  private nextId: number = 1;

  /** 配置 */
  private config: Required<EditorTabManagerConfig>;

  /** 是否已销毁 */
  private _isDisposed: boolean = false;

  // ── 构造 ──

  constructor(userConfig?: EditorTabManagerConfig) {
    this.config = {
      initialTabs: userConfig?.initialTabs ?? [{ title: "untitled-1" }],
      maxTabs: userConfig?.maxTabs ?? 20,
      keepAtLeastOneTab: userConfig?.keepAtLeastOneTab ?? true,
    };

    // 创建初始 Tab
    for (const tabDef of this.config.initialTabs) {
      const tab = this.createTab(tabDef.title, tabDef.content ?? "", tabDef.language);
      this.tabs.push(tab);
    }

    // 激活第一个 Tab
    if (this.tabs.length > 0) {
      this.activeTabId = this.tabs[0].id;
    }
  }

  // ==================== Tab 操作 ====================

  /**
   * 添加新 Tab
   *
   * @param title   Tab 标题
   * @param content 初始内容（默认空字符串）
   * @param language 语言标识（可选）
   * @returns 新创建的 Tab
   */
  addTab(title: string, content: string = "", language?: string): EditorTab {
    this.assertNotDisposed();

    if (this.tabs.length >= this.config.maxTabs) {
      throw new Error(
        `[EditorTabManager] Maximum tab count (${this.config.maxTabs}) reached. Close some tabs first.`,
      );
    }

    const tab = this.createTab(title, content, language);
    this.tabs.push(tab);

    this.emit({ type: "tab-added", tab: { ...tab } });

    // 自动激活新 Tab
    this.setActiveTab(tab.id);

    return { ...tab };
  }

  /**
   * 关闭 Tab
   *
   * @param tabId Tab ID
   */
  removeTab(tabId: string): void {
    this.assertNotDisposed();

    const index = this.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) {
      console.warn(`[EditorTabManager] Tab "${tabId}" not found.`);
      return;
    }

    // 如果只剩一个 Tab 且配置要求保留至少一个
    if (this.tabs.length === 1 && this.config.keepAtLeastOneTab) {
      // 创建一个新的空白 Tab 替代
      const newTab = this.createTab("untitled", "");
      this.tabs.splice(0, 1, newTab);
      this.activeTabId = newTab.id;

      this.emit({ type: "tab-removed", tabId });
      this.emit({ type: "tab-added", tab: { ...newTab } });
      this.emit({ type: "tab-activated", tabId: newTab.id, previousTabId: tabId });
      return;
    }

    const removedTab = this.tabs[index];
    this.tabs.splice(index, 1);

    this.emit({ type: "tab-removed", tabId: removedTab.id });

    // 如果关闭的是当前激活的 Tab，需要切换到其他 Tab
    if (this.activeTabId === tabId) {
      if (this.tabs.length > 0) {
        // 优先切换到右侧 Tab，如果没有则切换到左侧
        const newIndex = Math.min(index, this.tabs.length - 1);
        this.setActiveTab(this.tabs[newIndex].id);
      } else {
        this.activeTabId = null;
      }
    }
  }

  /**
   * 切换激活 Tab
   *
   * @param tabId 要激活的 Tab ID
   */
  setActiveTab(tabId: string): void {
    this.assertNotDisposed();

    if (this.activeTabId === tabId) return;

    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) {
      console.warn(`[EditorTabManager] Tab "${tabId}" not found.`);
      return;
    }

    const previousTabId = this.activeTabId;
    this.activeTabId = tabId;

    this.emit({ type: "tab-activated", tabId, previousTabId });
  }

  /**
   * 更新 Tab 内容
   *
   * @param tabId   Tab ID
   * @param content 新内容
   */
  updateContent(tabId: string, content: string): void {
    this.assertNotDisposed();

    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    tab.content = content;

    // 标记为脏
    if (!tab.isDirty) {
      tab.isDirty = true;
      this.emit({ type: "tab-dirty-changed", tabId, isDirty: true });
    }

    this.emit({ type: "tab-content-changed", tabId });
  }

  /**
   * 重命名 Tab
   *
   * @param tabId Tab ID
   * @param title 新标题
   */
  renameTab(tabId: string, title: string): void {
    this.assertNotDisposed();

    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (tab.title === title) return;

    tab.title = title;
    this.emit({ type: "tab-title-changed", tabId, title });
  }

  /**
   * 标记 Tab 为已保存（清除脏标记）
   *
   * @param tabId Tab ID
   */
  markSaved(tabId: string): void {
    this.assertNotDisposed();

    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab || !tab.isDirty) return;

    tab.isDirty = false;
    this.emit({ type: "tab-dirty-changed", tabId, isDirty: false });
  }

  /**
   * 更新光标位置
   *
   * @param tabId    Tab ID
   * @param position 光标位置
   */
  updateCursorPosition(tabId: string, position: { line: number; column: number }): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    tab.cursorPosition = position;
  }

  /**
   * 移动 Tab 到指定位置（拖拽排序）
   *
   * @param tabId    要移动的 Tab ID
   * @param newIndex 目标位置索引
   */
  moveTab(tabId: string, newIndex: number): void {
    this.assertNotDisposed();

    const currentIndex = this.tabs.findIndex((t) => t.id === tabId);
    if (currentIndex === -1) return;

    const clampedIndex = Math.max(0, Math.min(newIndex, this.tabs.length - 1));
    if (currentIndex === clampedIndex) return;

    const [tab] = this.tabs.splice(currentIndex, 1);
    this.tabs.splice(clampedIndex, 0, tab);

    this.emit({ type: "tabs-reordered", tabIds: this.tabs.map((t) => t.id) });
  }

  // ==================== 查询 ====================

  /**
   * 获取所有 Tab（返回副本）
   */
  getTabs(): EditorTab[] {
    return this.tabs.map((t) => ({ ...t }));
  }

  /**
   * 获取当前激活的 Tab
   */
  getActiveTab(): EditorTab | null {
    if (!this.activeTabId) return null;
    const tab = this.tabs.find((t) => t.id === this.activeTabId);
    return tab ? { ...tab } : null;
  }

  /**
   * 获取当前激活的 Tab ID
   */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /**
   * 根据 ID 获取 Tab
   *
   * @param tabId Tab ID
   */
  getTab(tabId: string): EditorTab | null {
    const tab = this.tabs.find((t) => t.id === tabId);
    return tab ? { ...tab } : null;
  }

  /**
   * 获取 Tab 总数
   */
  get tabCount(): number {
    return this.tabs.length;
  }

  /**
   * 检查是否有未保存的 Tab
   */
  hasDirtyTabs(): boolean {
    return this.tabs.some((t) => t.isDirty);
  }

  /**
   * 获取所有未保存的 Tab
   */
  getDirtyTabs(): EditorTab[] {
    return this.tabs.filter((t) => t.isDirty).map((t) => ({ ...t }));
  }

  /**
   * 根据标题查找 Tab
   *
   * @param title Tab 标题
   */
  findByTitle(title: string): EditorTab | null {
    const tab = this.tabs.find((t) => t.title === title);
    return tab ? { ...tab } : null;
  }

  // ==================== 事件 ====================

  /**
   * 监听 Tab 事件
   *
   * @param handler 事件处理器
   * @returns Disposable
   */
  onEvent(handler: TabEventListener): Disposable {
    this.listeners.add(handler);

    return {
      dispose: () => {
        this.listeners.delete(handler);
      },
    };
  }

  // ==================== 生命周期 ====================

  /**
   * 销毁 Tab 管理器
   */
  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    this.tabs = [];
    this.activeTabId = null;
    this.listeners.clear();
  }

  /** 是否已销毁 */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  // ==================== 诊断 ====================

  /**
   * 获取诊断信息
   */
  getDiagnostics(): EditorTabManagerDiagnostics {
    return {
      tabCount: this.tabs.length,
      activeTabId: this.activeTabId,
      dirtyTabCount: this.tabs.filter((t) => t.isDirty).length,
      isDisposed: this._isDisposed,
      tabs: this.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        contentLength: t.content.length,
        isDirty: t.isDirty,
        createdAt: t.createdAt,
        language: t.language,
      })),
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 创建 Tab 对象（不添加到列表中）
   */
  private createTab(title: string, content: string, language?: string): EditorTab {
    const id = `tab-${this.nextId++}`;

    return {
      id,
      title,
      content,
      isDirty: false,
      createdAt: Date.now(),
      language,
    };
  }

  /**
   * 触发事件
   */
  private emit(event: TabEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[EditorTabManager] Error in event listener:", error);
      }
    }
  }

  /**
   * 断言未被销毁
   */
  private assertNotDisposed(): void {
    if (this._isDisposed) {
      throw new Error("[EditorTabManager] Tab manager has been disposed.");
    }
  }
}

// ==================== 诊断类型 ====================

export interface EditorTabManagerDiagnostics {
  tabCount: number;
  activeTabId: string | null;
  dirtyTabCount: number;
  isDisposed: boolean;
  tabs: Array<{
    id: string;
    title: string;
    contentLength: number;
    isDirty: boolean;
    createdAt: number;
    language?: string;
  }>;
}
