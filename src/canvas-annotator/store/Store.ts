import { CaptureUpdateAction } from "../types";
import type { IHistoryManager, HistoryEntry } from "../types";

/**
 * Store — 历史捕获调度器（对标 Excalidraw Store）
 *
 * 核心职责：
 * 1. 接收 CaptureUpdateAction 请求（IMMEDIATELY / EVENTUALLY / NEVER）
 * 2. IMMEDIATELY → 立即推入 undo 栈
 * 3. EVENTUALLY → 延迟合并，debounce 后推入（避免连续滑块操作产生大量 undo 条目）
 * 4. NEVER → 不做任何处理
 *
 * 设计要点：
 * - 只升级不降级：IMMEDIATELY > EVENTUALLY > NEVER
 * - flush() 在每次 updater 调用末尾触发
 * - Store 不持有 HistoryManager，通过 flush 参数注入
 */
export class Store {
  private scheduledCapture: CaptureUpdateAction = CaptureUpdateAction.NEVER;
  private eventuallyTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEntry: HistoryEntry | null = null;

  /** EVENTUALLY debounce 延迟（毫秒） */
  private static readonly EVENTUALLY_DELAY_MS = 300;

  /**
   * 调度一次捕获请求 — 只升级不降级
   *
   * 优先级：IMMEDIATELY > EVENTUALLY > NEVER
   */
  scheduleCaptureUpdate(action: CaptureUpdateAction): void {
    if (action === CaptureUpdateAction.IMMEDIATELY) {
      this.scheduledCapture = CaptureUpdateAction.IMMEDIATELY;
    } else if (
      action === CaptureUpdateAction.EVENTUALLY &&
      this.scheduledCapture === CaptureUpdateAction.NEVER
    ) {
      this.scheduledCapture = CaptureUpdateAction.EVENTUALLY;
    }
    // NEVER 不做任何事
  }

  /**
   * 在 updater 末尾调用：根据当前调度状态决定是否推入历史
   *
   * - IMMEDIATELY → 立即 push，取消任何 pending 的 EVENTUALLY timer
   * - EVENTUALLY → 设置/重置 debounce timer，延迟 push
   * - NEVER → 不做任何事
   */
  flush(historyManager: IHistoryManager, currentEntry: HistoryEntry): void {
    const capture = this.scheduledCapture;
    this.scheduledCapture = CaptureUpdateAction.NEVER;

    switch (capture) {
      case CaptureUpdateAction.IMMEDIATELY: {
        // 取消待定的 EVENTUALLY（如果有），直接推入
        this.cancelEventuallyTimer();
        historyManager.push(currentEntry);
        break;
      }
      case CaptureUpdateAction.EVENTUALLY: {
        // 保存最新快照，重置 debounce timer
        this.pendingEntry = currentEntry;
        this.cancelEventuallyTimer();
        this.eventuallyTimer = setTimeout(() => {
          if (this.pendingEntry) {
            historyManager.push(this.pendingEntry);
            this.pendingEntry = null;
          }
          this.eventuallyTimer = null;
        }, Store.EVENTUALLY_DELAY_MS);
        break;
      }
      case CaptureUpdateAction.NEVER:
        // 不做任何处理
        break;
    }
  }

  /**
   * 立即刷入 pending 的 EVENTUALLY 快照（用于组件卸载等场景）
   */
  flushPending(historyManager: IHistoryManager): void {
    this.cancelEventuallyTimer();
    if (this.pendingEntry) {
      historyManager.push(this.pendingEntry);
      this.pendingEntry = null;
    }
  }

  /**
   * 清理定时器（组件卸载时调用）
   */
  destroy(): void {
    this.cancelEventuallyTimer();
    this.pendingEntry = null;
  }

  private cancelEventuallyTimer(): void {
    if (this.eventuallyTimer !== null) {
      clearTimeout(this.eventuallyTimer);
      this.eventuallyTimer = null;
    }
  }
}
