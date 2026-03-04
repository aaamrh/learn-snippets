import type { HistoryEntry, IHistoryManager } from "../types";

const MAX_HISTORY_SIZE = 100;

/**
 * HistoryManager —— Undo/Redo 历史栈
 *
 * 设计要点（对标 Excalidraw）：
 * - undo = pop undoStack, push current to redoStack, apply popped
 * - redo = pop redoStack, push current to undoStack, apply popped
 * - 任何新操作 = push current to undoStack, clear redoStack
 * - 限制栈深度，防止内存泄漏
 */
export class HistoryManager implements IHistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  /**
   * 将当前状态压入 undo 栈（在执行新操作之前调用）
   * 同时清空 redo 栈（新操作使 redo 链失效）
   */
  push(entry: HistoryEntry): void {
    this.undoStack.push(this.cloneEntry(entry));
    // 新操作打断 redo 链
    this.redoStack = [];
    // 限制栈深度
    if (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }
  }

  /**
   * 撤销：弹出 undo 栈顶，将 current 推入 redo 栈，返回要恢复的快照
   * @param current 当前状态（用于推入 redo 栈）
   * @returns 要恢复到的历史快照，或 null（无可撤销）
   */
  undo(current: HistoryEntry): HistoryEntry | null {
    if (!this.canUndo()) return null;

    // 把当前状态推入 redo 栈
    this.redoStack.push(this.cloneEntry(current));

    // 弹出 undo 栈顶
    const entry = this.undoStack.pop()!;
    return entry;
  }

  /**
   * 重做：弹出 redo 栈顶，将 current 推入 undo 栈，返回要恢复的快照
   * @param current 当前状态（用于推入 undo 栈）
   * @returns 要恢复到的历史快照，或 null（无可重做）
   */
  redo(current: HistoryEntry): HistoryEntry | null {
    if (!this.canRedo()) return null;

    // 把当前状态推入 undo 栈
    this.undoStack.push(this.cloneEntry(current));

    // 弹出 redo 栈顶
    const entry = this.redoStack.pop()!;
    return entry;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  undoSize(): number {
    return this.undoStack.length;
  }

  redoSize(): number {
    return this.redoStack.length;
  }

  /**
   * 深拷贝历史条目，避免外部引用修改栈内快照
   *
   * 这里用结构化拷贝：
   * - elements 是 readonly 数组，内部元素是 plain object，可以用展开复制
   * - appState 的几个字段都是原始类型
   */
  private cloneEntry(entry: HistoryEntry): HistoryEntry {
    return {
      elements: entry.elements.map((el) => ({ ...el })),
      appState: { ...entry.appState },
    };
  }
}
