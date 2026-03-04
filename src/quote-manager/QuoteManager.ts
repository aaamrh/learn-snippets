// ==================== 报价数据类型 ====================

export interface Quote {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  timestamp: number
}

// ==================== 报价管理器 ====================
/**
 * QuoteManager — 增量合并 + 批量更新
 *
 * 解决的核心问题：
 *   高频推送（每秒 100 条）时，如果每条都 setState，React 每条都重渲染。
 *   QuoteManager 把 50ms 内的所有推送先收进 pendingUpdates，
 *   窗口到期后 flush() 一次性合并写入，只触发一次 setState。
 *
 * 关键数据结构：
 *   quotes        → 当前最新报价（已 flush 的"快照"）
 *   pendingUpdates → 50ms 窗口内积压的增量更新（还没写入 quotes）
 *
 * 数据流：
 *   receiveUpdate(symbol, partial)
 *     → 合并进 pendingUpdates（同一 symbol 多条只保留最新）
 *     → scheduleBatch()（如果还没定时器就启动）
 *     → [50ms 后] flush()
 *       → 把 pendingUpdates 合并写入 quotes
 *       → notify() 通知订阅者（只调用一次）
 *       → 清空 pendingUpdates
 */
export class QuoteManager {
  /** 当前所有股票的最新报价（已合并的快照） */
  private quotes = new Map<string, Quote>()

  /**
   * 待处理的增量更新
   * key = symbol，value = 50ms 内该 symbol 所有推送合并后的最新值
   * 同一 symbol 多次推送只保留最后一次（后来的覆盖前面的）
   */
  private pendingUpdates = new Map<string, Partial<Quote>>()

  /** 订阅者集合 */
  private subscribers = new Set<(quotes: Map<string, Quote>) => void>()

  /** 批处理定时器，null 表示当前没有待执行的批处理 */
  private batchTimer: ReturnType<typeof setTimeout> | null = null

  /** 批处理窗口大小（ms） */
  readonly batchInterval: number

  /** 统计：总共收到多少次 receiveUpdate 调用 */
  receivedCount = 0

  /** 统计：总共 flush 了多少次（= 触发 setState 的次数） */
  flushCount = 0

  constructor(batchInterval = 50) {
    this.batchInterval = batchInterval
  }

  /**
   * 接收一条增量推送（高频调用入口）
   *
   * 关键：不直接写 quotes，而是先合并进 pendingUpdates。
   * 同一 symbol 在窗口内推送 N 次，pendingUpdates 里只有一条（后者覆盖前者）。
   * 这样 flush 时合并写入 quotes 的也只有一条，只触发一次渲染。
   */
  receiveUpdate(symbol: string, partial: Partial<Quote>) {
    this.receivedCount++

    const existing = this.pendingUpdates.get(symbol)
    if (existing) {
      // 同一 symbol 多次推送：字段级合并，后来的字段覆盖前面的
      this.pendingUpdates.set(symbol, { ...existing, ...partial })
    } else {
      this.pendingUpdates.set(symbol, partial)
    }

    this.scheduleBatch()
  }

  /**
   * 启动批处理定时器
   * 如果已经有定时器在跑，直接返回（不重复启动）。
   * 这保证了无论 50ms 内来多少条推送，只会 flush 一次。
   */
  private scheduleBatch() {
    if (this.batchTimer !== null) return

    this.batchTimer = setTimeout(() => {
      this.flush()
      this.batchTimer = null
    }, this.batchInterval)
  }

  /**
   * 立即将 pendingUpdates 合并写入 quotes，然后通知订阅者。
   * 无论 pendingUpdates 里有多少条，notify() 只调用一次。
   */
  flush() {
    if (this.pendingUpdates.size === 0) return

    for (const [symbol, partial] of this.pendingUpdates) {
      const existing = this.quotes.get(symbol)
      if (existing) {
        // 增量合并：只更新推送过来的字段，其余字段保持原值
        this.quotes.set(symbol, { ...existing, ...partial, symbol })
      } else {
        // 第一次见到这个 symbol
        this.quotes.set(symbol, { ...partial, symbol } as Quote)
      }
    }

    this.pendingUpdates.clear()
    this.flushCount++
    this.notify()
  }

  /**
   * 订阅报价更新
   * 每次 flush 后调用一次（不管有多少条推送）
   * 返回取消订阅函数
   */
  subscribe(callback: (quotes: Map<string, Quote>) => void): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  /** 通知所有订阅者，传递当前 quotes 的快照 */
  private notify() {
    const snapshot = new Map(this.quotes)
    for (const cb of this.subscribers) {
      cb(snapshot)
    }
  }

  /** 获取当前所有报价（快照） */
  getQuotes(): Map<string, Quote> {
    return new Map(this.quotes)
  }

  /** 重置所有数据和统计（Demo 用） */
  reset() {
    this.quotes.clear()
    this.pendingUpdates.clear()
    this.receivedCount = 0
    this.flushCount = 0
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
  }
}
