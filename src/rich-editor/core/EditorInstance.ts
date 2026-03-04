import type {
  EditorState,
  EditorInstance,
  Extension,
  ButtonExtension,
  Transaction,
  TransactionStep,
  MarkType,
  BlockType,
  ShortcutConfig,
  Disposable,
} from "../types";
import {
  createDefaultEditorState,
  isButtonExtension,
  countWords,
  countLines,
  DEFAULT_SHORTCUTS,
  EDITOR_EVENTS,
} from "../types";

// ==================== EventBus ====================

/**
 * 简单的事件总线实现
 * 用于编辑器内部的事件通信
 */
class EventBus {
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[EditorInstance] Error in event handler for "${event}":`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

// ==================== TransactionImpl ====================

/**
 * Transaction 的具体实现
 *
 * 对标 ProseMirror 的 Transaction：
 * - 链式 API：每个操作方法返回新的 Transaction（不可变）
 * - dispatch() 时按顺序执行所有 steps
 * - 所有变更走 Transaction，保证状态流转的可追溯性
 *
 * 简化设计：
 * - 我们不实现完整的 ProseMirror 文档树
 * - 而是基于 contenteditable + document.execCommand / Selection API
 * - Transaction 主要用于描述和记录操作，保持数据流的单向性
 */
class TransactionImpl implements Transaction {
  readonly oldState: EditorState;
  readonly steps: readonly TransactionStep[];
  readonly meta: Record<string, unknown>;

  private readonly dispatchFn: (tr: TransactionImpl) => void;

  constructor(
    oldState: EditorState,
    dispatchFn: (tr: TransactionImpl) => void,
    steps: readonly TransactionStep[] = [],
    meta: Record<string, unknown> = {},
  ) {
    this.oldState = oldState;
    this.dispatchFn = dispatchFn;
    this.steps = steps;
    this.meta = meta;
  }

  private clone(
    newSteps: readonly TransactionStep[],
    newMeta?: Record<string, unknown>,
  ): TransactionImpl {
    return new TransactionImpl(
      this.oldState,
      this.dispatchFn,
      newSteps,
      newMeta ?? this.meta,
    );
  }

  toggleMark(mark: MarkType, attrs?: Record<string, string>): Transaction {
    return this.clone([...this.steps, { type: "toggleMark", mark, attrs }]);
  }

  setBlock(block: BlockType): Transaction {
    return this.clone([...this.steps, { type: "setBlock", block }]);
  }

  insertText(text: string): Transaction {
    return this.clone([...this.steps, { type: "insertText", text }]);
  }

  insertHTML(html: string): Transaction {
    return this.clone([...this.steps, { type: "insertHTML", html }]);
  }

  setSelection(from: number, to: number): Transaction {
    return this.clone([...this.steps, { type: "setSelection", from, to }]);
  }

  setMeta(key: string, value: unknown): Transaction {
    return this.clone(this.steps, { ...this.meta, [key]: value });
  }

  dispatch(): void {
    this.dispatchFn(this);
  }
}

// ==================== SelectionObserver ====================

/**
 * SelectionObserver —— 选区变化监听器
 *
 * 对标 medium-editor 的 selection 监听逻辑：
 * - 监听 document 的 selectionchange 事件
 * - 读取当前选区信息（位置、文本、矩形）
 * - 检测选区内激活的 marks（通过爬 DOM 祖先链）
 * - 通知编辑器实例更新状态
 */
class SelectionObserver {
  private editorElement: HTMLElement | null = null;
  private onSelectionChange: ((info: SelectionInfo) => void) | null = null;
  private boundHandler: (() => void) | null = null;

  /** 开始监听 */
  start(
    editorElement: HTMLElement,
    callback: (info: SelectionInfo) => void,
  ): void {
    this.editorElement = editorElement;
    this.onSelectionChange = callback;

    this.boundHandler = () => {
      this.checkSelection();
    };

    document.addEventListener("selectionchange", this.boundHandler);
  }

  /** 停止监听 */
  stop(): void {
    if (this.boundHandler) {
      document.removeEventListener("selectionchange", this.boundHandler);
      this.boundHandler = null;
    }
    this.editorElement = null;
    this.onSelectionChange = null;
  }

  /** 手动触发一次选区检查 */
  check(): void {
    this.checkSelection();
  }

  private checkSelection(): void {
    if (!this.editorElement || !this.onSelectionChange) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      this.onSelectionChange({
        from: 0,
        to: 0,
        empty: true,
        text: "",
        rect: null,
        activeMarks: new Set(),
        activeBlock: "p",
        isInEditor: false,
      });
      return;
    }

    const range = sel.getRangeAt(0);

    // 检查选区是否在编辑器内部
    const isInEditor = this.editorElement.contains(range.commonAncestorContainer);
    if (!isInEditor) {
      this.onSelectionChange({
        from: 0,
        to: 0,
        empty: true,
        text: "",
        rect: null,
        activeMarks: new Set(),
        activeBlock: "p",
        isInEditor: false,
      });
      return;
    }

    // 获取选区矩形
    let rect: DOMRect | null = null;
    if (!sel.isCollapsed) {
      rect = range.getBoundingClientRect();
    }

    // 检测激活的 marks（通过爬 DOM 祖先链）
    const activeMarks = this.detectActiveMarks(range.commonAncestorContainer);
    const activeBlock = this.detectActiveBlock(range.commonAncestorContainer);

    this.onSelectionChange({
      from: range.startOffset,
      to: range.endOffset,
      empty: sel.isCollapsed,
      text: sel.toString(),
      rect,
      activeMarks,
      activeBlock,
      isInEditor: true,
    });
  }

  /**
   * 检测激活的 marks
   *
   * 对标 medium-editor 的 checkActiveButtons() 逻辑：
   * 从选区的公共祖先节点开始，向上爬 DOM 树，
   * 检查每个节点是否对应某种 mark
   */
  private detectActiveMarks(node: Node): Set<MarkType> {
    const marks = new Set<MarkType>();
    let current: Node | null = node;

    while (current && current !== this.editorElement) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const el = current as HTMLElement;
        const tag = el.tagName.toLowerCase();

        // 检查标签名
        if (tag === "b" || tag === "strong") marks.add("bold");
        if (tag === "i" || tag === "em") marks.add("italic");
        if (tag === "u") marks.add("underline");
        if (tag === "s" || tag === "strike" || tag === "del") marks.add("strikethrough");
        if (tag === "a") marks.add("link");

        // 检查 CSS 样式
        const style = el.style;
        if (style.fontWeight === "bold" || style.fontWeight === "700") marks.add("bold");
        if (style.fontStyle === "italic") marks.add("italic");
        if (style.textDecoration?.includes("underline")) marks.add("underline");
        if (style.textDecoration?.includes("line-through")) marks.add("strikethrough");
      }

      current = current.parentNode;
    }

    // 同时通过 queryCommandState 检测（作为补充）
    try {
      if (document.queryCommandState("bold")) marks.add("bold");
      if (document.queryCommandState("italic")) marks.add("italic");
      if (document.queryCommandState("underline")) marks.add("underline");
      if (document.queryCommandState("strikeThrough")) marks.add("strikethrough");
    } catch {
      // queryCommandState 在某些情况下可能抛出异常
    }

    return marks;
  }

  /**
   * 检测当前的块级格式
   */
  private detectActiveBlock(node: Node): BlockType {
    let current: Node | null = node;

    while (current && current !== this.editorElement) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const tag = (current as HTMLElement).tagName.toLowerCase();
        if (tag === "h1") return "h1";
        if (tag === "h2") return "h2";
        if (tag === "h3") return "h3";
        if (tag === "blockquote") return "blockquote";
        if (tag === "p") return "p";
      }
      current = current.parentNode;
    }

    return "p";
  }
}

/** SelectionObserver 回调的数据结构 */
interface SelectionInfo {
  from: number;
  to: number;
  empty: boolean;
  text: string;
  rect: DOMRect | null;
  activeMarks: Set<MarkType>;
  activeBlock: BlockType;
  isInEditor: boolean;
}

// ==================== EditorInstanceImpl ====================

/**
 * EditorInstanceImpl —— 编辑器实例的具体实现
 *
 * 核心职责：
 * 1. 管理 EditorState（不可变状态）
 * 2. 创建和分发 Transaction（状态变更通道）
 * 3. 管理 Extension 的注册/初始化/销毁
 * 4. 提供事件系统（EventBus）
 * 5. 代理 document.execCommand（供扩展调用）
 * 6. 管理 SelectionObserver（选区变化监听）
 *
 * 数据流：
 * 用户操作 → createTransaction() → 添加 steps → dispatch()
 *   → 执行 steps（execCommand 等）→ 更新 EditorState
 *   → 通知扩展（onStateChange / checkState）→ UI 重新渲染
 */
export class EditorInstanceImpl implements EditorInstance {
  // ==================== 内部状态 ====================

  private _state: EditorState;
  private eventBus: EventBus;
  private extensions: Map<string, Extension> = new Map();
  private selectionObserver: SelectionObserver;
  private editorElement: HTMLElement | null = null;
  private shortcuts: ShortcutConfig[];
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false;

  // 外部状态同步回调（用于通知 React 组件重新渲染）
  private onStateChangeFn: ((state: EditorState) => void) | null = null;

  constructor(initialContent = "") {
    this._state = {
      ...createDefaultEditorState(),
      content: initialContent,
      wordCount: countWords(initialContent),
      lineCount: countLines(initialContent),
    };

    this.eventBus = new EventBus();
    this.selectionObserver = new SelectionObserver();
    this.shortcuts = [...DEFAULT_SHORTCUTS];
  }

  // ==================== State ====================

  get state(): EditorState {
    return this._state;
  }

  updateState(partial: Partial<EditorState>): void {
    if (this.isDestroyed) return;

    const newState: EditorState = { ...this._state, ...partial };
    this._state = newState;

    // 通知所有扩展
    for (const ext of this.extensions.values()) {
      try {
        ext.onStateChange?.(newState);
      } catch (err) {
        console.error(`[EditorInstance] Error in extension "${ext.name}" onStateChange:`, err);
      }
    }

    // 通知外部
    this.onStateChangeFn?.(newState);
    this.eventBus.emit(EDITOR_EVENTS.STATE_CHANGE, newState);
  }

  // ==================== Transaction ====================

  createTransaction(): Transaction {
    return new TransactionImpl(
      this._state,
      (tr) => this.applyTransaction(tr),
    );
  }

  /**
   * 应用 Transaction 中的所有 steps
   *
   * 对标 ProseMirror 的 EditorState.apply(transaction)：
   * - 按顺序执行每个 step
   * - 执行完成后读取 contenteditable 的最新内容
   * - 更新 EditorState
   * - 通知扩展和外部
   */
  private applyTransaction(tr: TransactionImpl): void {
    if (this.isDestroyed) return;

    for (const step of tr.steps) {
      this.executeStep(step);
    }

    // 执行完所有 steps 后，读取最新状态
    this.syncStateFromDOM();
  }

  /**
   * 执行单个 TransactionStep
   */
  private executeStep(step: TransactionStep): void {
    switch (step.type) {
      case "toggleMark":
        this.executeToggleMark(step.mark, step.attrs);
        break;
      case "setBlock":
        this.executeSetBlock(step.block);
        break;
      case "insertText":
        this.executeInsertText(step.text);
        break;
      case "insertHTML":
        this.executeInsertHTML(step.html);
        break;
      case "setSelection":
        this.executeSetSelection(step.from, step.to);
        break;
      case "setMeta":
        // meta 不执行 DOM 操作，只记录元信息
        break;
    }
  }

  private executeToggleMark(mark: MarkType, attrs?: Record<string, string>): void {
    const commandMap: Record<MarkType, string> = {
      bold: "bold",
      italic: "italic",
      underline: "underline",
      strikethrough: "strikeThrough",
      link: "createLink",
    };

    const command = commandMap[mark];
    if (!command) return;

    if (mark === "link" && attrs?.href) {
      document.execCommand(command, false, attrs.href);
    } else if (mark === "link" && !attrs?.href) {
      document.execCommand("unlink", false);
    } else {
      document.execCommand(command, false);
    }
  }

  private executeSetBlock(block: BlockType): void {
    const blockMap: Record<BlockType, string> = {
      p: "p",
      h1: "h1",
      h2: "h2",
      h3: "h3",
      blockquote: "blockquote",
    };

    const tag = blockMap[block];
    if (!tag) return;

    if (block === "blockquote") {
      // 对于 blockquote，使用 formatBlock 可能无法正确工作
      // 因此用 indent/outdent 的思路或者 formatBlock
      document.execCommand("formatBlock", false, `<${tag}>`);
    } else {
      document.execCommand("formatBlock", false, `<${tag}>`);
    }
  }

  private executeInsertText(text: string): void {
    document.execCommand("insertText", false, text);
  }

  private executeInsertHTML(html: string): void {
    document.execCommand("insertHTML", false, html);
  }

  private executeSetSelection(from: number, to: number): void {
    const el = this.editorElement;
    if (!el) return;

    const sel = window.getSelection();
    if (!sel) return;

    try {
      const range = document.createRange();
      // 简化实现：在 contenteditable 中精确设置偏移比较复杂
      // 这里做一个基本的实现
      if (el.firstChild) {
        const textNode = this.findTextNode(el, from);
        if (textNode) {
          range.setStart(textNode.node, textNode.offset);
          if (from === to) {
            range.collapse(true);
          } else {
            const endNode = this.findTextNode(el, to);
            if (endNode) {
              range.setEnd(endNode.node, endNode.offset);
            }
          }
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    } catch {
      // 设置选区失败时静默处理
    }
  }

  /**
   * 在 DOM 树中查找指定偏移位置的文本节点
   */
  private findTextNode(
    root: Node,
    offset: number,
  ): { node: Node; offset: number } | null {
    let currentOffset = 0;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();

    while (node) {
      const length = node.textContent?.length ?? 0;
      if (currentOffset + length >= offset) {
        return { node, offset: offset - currentOffset };
      }
      currentOffset += length;
      node = walker.nextNode();
    }

    return null;
  }

  // ==================== DOM 同步 ====================

  /**
   * 从 contenteditable DOM 元素读取最新状态并更新 EditorState
   *
   * 在 Transaction 执行后调用，确保 state 与 DOM 保持同步
   */
  syncStateFromDOM(): void {
    const el = this.editorElement;
    if (!el) return;

    const content = el.innerHTML;
    const wordCount = countWords(content);
    const lineCount = countLines(content);

    this.updateState({
      content,
      wordCount,
      lineCount,
      isDirty: true,
    });

    this.eventBus.emit(EDITOR_EVENTS.CONTENT_CHANGE, content);
  }

  // ==================== Extension 管理 ====================

  registerExtension(extension: Extension): void {
    if (this.isDestroyed) return;

    if (this.extensions.has(extension.name)) {
      console.warn(
        `[EditorInstance] Extension "${extension.name}" is already registered, overwriting.`,
      );
    }

    this.extensions.set(extension.name, extension);

    // 初始化扩展
    try {
      extension.init?.(this);
    } catch (err) {
      console.error(
        `[EditorInstance] Error initializing extension "${extension.name}":`,
        err,
      );
    }

    this.eventBus.emit(EDITOR_EVENTS.EXTENSION_REGISTERED, extension.name);
  }

  getExtension<T extends Extension = Extension>(name: string): T | null {
    return (this.extensions.get(name) as T) ?? null;
  }

  getAllExtensions(): Extension[] {
    return Array.from(this.extensions.values());
  }

  getButtonExtensions(): ButtonExtension[] {
    return this.getAllExtensions().filter(isButtonExtension);
  }

  // ==================== 事件系统 ====================

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.eventBus.on(event, handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.eventBus.off(event, handler);
  }

  emit(event: string, ...args: unknown[]): void {
    this.eventBus.emit(event, ...args);
  }

  // ==================== 命令执行 ====================

  /**
   * 代理 document.execCommand
   *
   * 供扩展调用，执行编辑命令后自动同步状态
   */
  execCommand(command: string, value?: string): void {
    if (this.isDestroyed) return;

    // 特殊命令处理
    if (command === "__save__") {
      this.save();
      return;
    }

    // 确保焦点在编辑器内
    this.editorElement?.focus();

    try {
      document.execCommand(command, false, value ?? "");
    } catch (err) {
      console.error(`[EditorInstance] execCommand("${command}") failed:`, err);
    }

    // 同步状态
    this.syncStateFromDOM();

    // 触发选区检查（命令可能改变了格式状态）
    requestAnimationFrame(() => {
      this.selectionObserver.check();
    });
  }

  // ==================== Editor Element ====================

  getEditorElement(): HTMLElement | null {
    return this.editorElement;
  }

  /**
   * 绑定 contenteditable DOM 元素
   *
   * 由 React 组件在挂载时调用
   * 绑定后启动 SelectionObserver 和键盘事件监听
   */
  bindElement(element: HTMLElement): void {
    this.editorElement = element;

    // 启动选区监听
    this.selectionObserver.start(element, (info) => {
      this.handleSelectionChange(info);
    });

    // 绑定键盘事件（快捷键）
    element.addEventListener("keydown", this.handleKeyDown);

    // 绑定 input 事件（内容变化）
    element.addEventListener("input", this.handleInput);

    // 绑定焦点事件
    element.addEventListener("focus", this.handleFocus);
    element.addEventListener("blur", this.handleBlur);

    // 初始化扩展的 checkState
    requestAnimationFrame(() => {
      this.selectionObserver.check();
    });
  }

  /**
   * 解绑 contenteditable DOM 元素
   *
   * 由 React 组件在卸载时调用
   */
  unbindElement(): void {
    if (this.editorElement) {
      this.editorElement.removeEventListener("keydown", this.handleKeyDown);
      this.editorElement.removeEventListener("input", this.handleInput);
      this.editorElement.removeEventListener("focus", this.handleFocus);
      this.editorElement.removeEventListener("blur", this.handleBlur);
    }

    this.selectionObserver.stop();
    this.editorElement = null;
  }

  // ==================== 事件处理 ====================

  /**
   * 选区变化处理
   *
   * 对标 medium-editor 的 Toolbar.checkState()：
   * - 更新 EditorState 中的 selection / activeMarks / activeBlock
   * - 通知所有按钮扩展更新 active 状态
   * - 触发 SELECTION_CHANGE 事件
   */
  private handleSelectionChange = (info: SelectionInfo): void => {
    if (this.isDestroyed) return;

    // 更新状态
    this.updateState({
      selection: {
        from: info.from,
        to: info.to,
        empty: info.empty,
        text: info.text,
        rect: info.rect,
      },
      activeMarks: info.activeMarks,
      activeBlock: info.activeBlock,
    });

    // 通知按钮扩展更新状态
    // 对标 medium-editor 的 checkActiveButtons()
    for (const ext of this.extensions.values()) {
      if (isButtonExtension(ext)) {
        // 检查每个按钮是否应该 active
        let shouldBeActive = false;

        if (ext.tagNames || ext.style) {
          // 通过 marks 检查
          const commandMarkMap: Record<string, MarkType> = {
            bold: "bold",
            italic: "italic",
            underline: "underline",
            strikeThrough: "strikethrough",
            strikethrough: "strikethrough",
          };

          const markType = commandMarkMap[ext.command];
          if (markType && info.activeMarks.has(markType)) {
            shouldBeActive = true;
          }
        }

        if (shouldBeActive) {
          ext.setActive();
        } else {
          ext.setInactive();
        }
      }

      // 调用通用的 checkState
      try {
        ext.checkState?.(this._state);
      } catch (err) {
        console.error(
          `[EditorInstance] Error in extension "${ext.name}" checkState:`,
          err,
        );
      }
    }

    this.eventBus.emit(EDITOR_EVENTS.SELECTION_CHANGE, this._state.selection);
  };

  /**
   * 键盘事件处理（快捷键）
   */
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.isDestroyed) return;

    for (const shortcut of this.shortcuts) {
      const ctrlMatch = shortcut.ctrlKey
        ? e.ctrlKey || e.metaKey
        : true;
      const shiftMatch = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.altKey ? e.altKey : !e.altKey;
      const keyMatch = e.key.toLowerCase() === shortcut.eventKey.toLowerCase();

      if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
        e.preventDefault();
        e.stopPropagation();

        this.execCommand(shortcut.command, shortcut.value);
        return;
      }
    }
  };

  /**
   * 输入事件处理（内容变化）
   */
  private handleInput = (): void => {
    if (this.isDestroyed) return;
    this.syncStateFromDOM();
  };

  /**
   * 焦点获得
   */
  private handleFocus = (): void => {
    if (this.isDestroyed) return;
    this.eventBus.emit(EDITOR_EVENTS.FOCUS);
  };

  /**
   * 焦点丢失
   */
  private handleBlur = (): void => {
    if (this.isDestroyed) return;
    this.eventBus.emit(EDITOR_EVENTS.BLUR);
  };

  // ==================== 保存 ====================

  /**
   * 手动保存
   */
  save(): void {
    const now = Date.now();
    this.updateState({
      lastSaved: now,
      isDirty: false,
    });
    this.eventBus.emit(EDITOR_EVENTS.SAVE, this._state.content, now);
  }

  /**
   * 设置自动保存（每隔指定时间自动保存一次）
   */
  setAutoSave(intervalMs: number): Disposable {
    this.clearAutoSave();

    this.autoSaveTimer = setInterval(() => {
      if (this._state.isDirty) {
        this.save();
      }
    }, intervalMs);

    return {
      dispose: () => {
        this.clearAutoSave();
      },
    };
  }

  private clearAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // ==================== 外部状态同步 ====================

  /**
   * 设置状态变化回调（用于通知 React 组件重新渲染）
   */
  setOnStateChange(fn: ((state: EditorState) => void) | null): void {
    this.onStateChangeFn = fn;
  }

  // ==================== 销毁 ====================

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // 清除自动保存
    this.clearAutoSave();

    // 销毁所有扩展
    for (const ext of this.extensions.values()) {
      try {
        ext.destroy?.();
      } catch (err) {
        console.error(
          `[EditorInstance] Error destroying extension "${ext.name}":`,
          err,
        );
      }
    }
    this.extensions.clear();

    // 解绑 DOM
    this.unbindElement();

    // 清除事件
    this.eventBus.clear();
    this.onStateChangeFn = null;
  }
}
