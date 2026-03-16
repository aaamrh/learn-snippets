/**
 * 类型安全的事件总线
 *
 * 核心概念：
 * 1. 发布/订阅模式 - 解耦事件发送者和接收者
 * 2. 类型安全 - 通过 TypeScript 泛型确保事件类型正确
 * 3. 命名空间 - 支持 "module:event" 格式
 *
 * 解决的问题：
 * - 组件间强耦合 → 通过事件解耦
 * - props drilling → 跨层级通信
 * - 全局状态污染 → 事件驱动
 */

// ==================== 类型定义 ====================

type EventHandler<T = unknown> = (payload: T) => void;

interface Subscription {
  unsubscribe: () => void;
}

interface EventRecord {
  timestamp: number;
  event: string;
  payload: unknown;
}

// ==================== EventBus ====================

/**
 * 类型安全的事件总线
 *
 * @example
 * ```ts
 * // 定义事件类型
 * interface AppEvents {
 *   'user:login': { userId: string; name: string };
 *   'user:logout': void;
 *   'order:created': { orderId: string; amount: number };
 * }
 *
 * // 创建类型安全的事件总线
 * const bus = new EventBus<AppEvents>();
 *
 * // 订阅事件（有类型提示）
 * bus.on('user:login', (payload) => {
 *   console.log(payload.userId); // ✓ 类型正确
 * });
 *
 * // 发布事件
 * bus.emit('user:login', { userId: '123', name: 'Alice' });
 * ```
 */
export class EventBus<Events extends Record<string, unknown> = Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<EventHandler>>();
  private onceHandlers = new Map<keyof Events, Set<EventHandler>>();
  private history: EventRecord[] = [];
  private maxHistorySize = 100;
  private debugMode = false;

  /**
   * 订阅事件
   */
  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): Subscription {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);

    return {
      unsubscribe: () => this.off(event, handler),
    };
  }

  /**
   * 订阅一次性事件
   */
  once<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): Subscription {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler as EventHandler);

    return {
      unsubscribe: () => {
        this.onceHandlers.get(event)?.delete(handler as EventHandler);
      },
    };
  }

  /**
   * 取消订阅
   */
  off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void {
    this.handlers.get(event)?.delete(handler as EventHandler);
    this.onceHandlers.get(event)?.delete(handler as EventHandler);
  }

  /**
   * 发布事件
   */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    if (this.debugMode) {
      console.log(`[EventBus] ${String(event)}`, payload);
    }

    // 记录历史
    this.history.push({
      timestamp: Date.now(),
      event: String(event),
      payload,
    });
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // 触发普通处理器
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (e) {
          console.error(`[EventBus] Error in handler for ${String(event)}:`, e);
        }
      }
    }

    // 触发一次性处理器
    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        try {
          handler(payload);
        } catch (e) {
          console.error(`[EventBus] Error in once handler for ${String(event)}:`, e);
        }
      }
      this.onceHandlers.delete(event);
    }
  }

  /**
   * 清除所有订阅
   */
  clear(): void {
    this.handlers.clear();
    this.onceHandlers.clear();
  }

  /**
   * 清除特定事件的所有订阅
   */
  clearEvent<K extends keyof Events>(event: K): void {
    this.handlers.delete(event);
    this.onceHandlers.delete(event);
  }

  /**
   * 获取事件的订阅者数量
   */
  listenerCount<K extends keyof Events>(event: K): number {
    return (this.handlers.get(event)?.size ?? 0) + (this.onceHandlers.get(event)?.size ?? 0);
  }

  /**
   * 获取所有事件名
   */
  eventNames(): (keyof Events)[] {
    const names = new Set<keyof Events>();
    for (const key of this.handlers.keys()) {
      names.add(key);
    }
    for (const key of this.onceHandlers.keys()) {
      names.add(key);
    }
    return Array.from(names);
  }

  /**
   * 获取事件历史
   */
  getHistory(): EventRecord[] {
    return [...this.history];
  }

  /**
   * 清除历史
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * 开启调试模式
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * 等待事件（Promise 化）
   */
  waitFor<K extends keyof Events>(event: K, timeout?: number): Promise<Events[K]> {
    return new Promise((resolve, reject) => {
      const timer = timeout
        ? setTimeout(() => {
            this.off(event, handler);
            reject(new Error(`Timeout waiting for event: ${String(event)}`));
          }, timeout)
        : null;

      const handler = (payload: Events[K]) => {
        if (timer) clearTimeout(timer);
        resolve(payload);
      };

      this.once(event, handler);
    });
  }

  /**
   * 创建命名空间事件总线
   */
  namespace<NS extends string>(ns: NS): NamespacedEventBus<Events, NS> {
    return new NamespacedEventBus(this, ns);
  }
}

// ==================== 命名空间事件总线 ====================

/**
 * 命名空间事件总线 - 自动添加前缀
 */
class NamespacedEventBus<Events extends Record<string, unknown>, NS extends string> {
  constructor(
    private bus: EventBus<Events>,
    private ns: NS,
  ) {}

  private prefixEvent(event: string): keyof Events {
    return `${this.ns}:${event}` as keyof Events;
  }

  on<K extends string>(event: K, handler: EventHandler<Events[`${NS}:${K}` & keyof Events]>): Subscription {
    return this.bus.on(this.prefixEvent(event), handler as EventHandler);
  }

  emit<K extends string>(event: K, payload: Events[`${NS}:${K}` & keyof Events]): void {
    this.bus.emit(this.prefixEvent(event), payload);
  }

  off<K extends string>(event: K, handler: EventHandler<Events[`${NS}:${K}` & keyof Events]>): void {
    this.bus.off(this.prefixEvent(event), handler as EventHandler);
  }
}

// ==================== 全局实例 ====================

/**
 * 默认的全局事件总线
 */
export const globalEventBus = new EventBus();
