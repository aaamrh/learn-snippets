/**
 * Hook System（钩子系统）
 *
 * 灵感来源：Webpack Tapable、Vue Lifecycle Hooks
 *
 * 核心概念：
 * 1. Hook（钩子）- 可以被监听的事件点
 * 2. Tap（注册）- 向钩子注册回调
 * 3. Call（触发）- 触发钩子执行所有回调
 *
 * Hook 类型：
 * - SyncHook: 同步执行
 * - AsyncSeriesHook: 异步串行
 * - AsyncParallelHook: 异步并行
 * - SyncWaterfallHook: 同步瀑布流（上一个返回值传给下一个）
 * - SyncBailHook: 同步熔断（某个返回非 undefined 则停止）
 *
 * 解决的问题：
 * - 硬编码扩展点 → 声明式钩子
 * - 代码耦合 → 插件化解耦
 * - 难以定制 → 注册回调即可扩展
 */

// ==================== 基础类型 ====================

export interface TapOptions {
  name: string;
  /** 优先级，数字越小越先执行 */
  priority?: number;
}

interface TapInfo<T extends (...args: unknown[]) => unknown> {
  name: string;
  priority: number;
  fn: T;
}

// ==================== SyncHook ====================

/**
 * 同步钩子 - 按顺序同步执行所有回调
 */
export class SyncHook<Args extends unknown[] = []> {
  private taps: TapInfo<(...args: Args) => void>[] = [];

  tap(options: TapOptions | string, fn: (...args: Args) => void): void {
    const opts = typeof options === "string" ? { name: options } : options;
    this.taps.push({
      name: opts.name,
      priority: opts.priority ?? 100,
      fn,
    });
    this.taps.sort((a, b) => a.priority - b.priority);
  }

  call(...args: Args): void {
    for (const tap of this.taps) {
      tap.fn(...args);
    }
  }

  getTaps(): { name: string; priority: number }[] {
    return this.taps.map(({ name, priority }) => ({ name, priority }));
  }

  clear(): void {
    this.taps = [];
  }
}

// ==================== SyncWaterfallHook ====================

/**
 * 同步瀑布流钩子 - 每个回调的返回值作为下一个的输入
 */
export class SyncWaterfallHook<T> {
  private taps: TapInfo<(value: T) => T>[] = [];

  tap(options: TapOptions | string, fn: (value: T) => T): void {
    const opts = typeof options === "string" ? { name: options } : options;
    this.taps.push({
      name: opts.name,
      priority: opts.priority ?? 100,
      fn,
    });
    this.taps.sort((a, b) => a.priority - b.priority);
  }

  call(initial: T): T {
    return this.taps.reduce((value, tap) => tap.fn(value), initial);
  }

  getTaps(): { name: string; priority: number }[] {
    return this.taps.map(({ name, priority }) => ({ name, priority }));
  }
}

// ==================== SyncBailHook ====================

/**
 * 同步熔断钩子 - 某个回调返回非 undefined 则停止
 */
export class SyncBailHook<Args extends unknown[], R> {
  private taps: TapInfo<(...args: Args) => R | undefined>[] = [];

  tap(options: TapOptions | string, fn: (...args: Args) => R | undefined): void {
    const opts = typeof options === "string" ? { name: options } : options;
    this.taps.push({
      name: opts.name,
      priority: opts.priority ?? 100,
      fn,
    });
    this.taps.sort((a, b) => a.priority - b.priority);
  }

  call(...args: Args): R | undefined {
    for (const tap of this.taps) {
      const result = tap.fn(...args);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }

  getTaps(): { name: string; priority: number }[] {
    return this.taps.map(({ name, priority }) => ({ name, priority }));
  }
}

// ==================== AsyncSeriesHook ====================

/**
 * 异步串行钩子 - 按顺序依次执行异步回调
 */
export class AsyncSeriesHook<Args extends unknown[] = []> {
  private taps: TapInfo<(...args: Args) => Promise<void> | void>[] = [];

  tap(options: TapOptions | string, fn: (...args: Args) => Promise<void> | void): void {
    const opts = typeof options === "string" ? { name: options } : options;
    this.taps.push({
      name: opts.name,
      priority: opts.priority ?? 100,
      fn,
    });
    this.taps.sort((a, b) => a.priority - b.priority);
  }

  async call(...args: Args): Promise<void> {
    for (const tap of this.taps) {
      await tap.fn(...args);
    }
  }

  getTaps(): { name: string; priority: number }[] {
    return this.taps.map(({ name, priority }) => ({ name, priority }));
  }
}

// ==================== AsyncParallelHook ====================

/**
 * 异步并行钩子 - 并行执行所有异步回调
 */
export class AsyncParallelHook<Args extends unknown[] = []> {
  private taps: TapInfo<(...args: Args) => Promise<void> | void>[] = [];

  tap(options: TapOptions | string, fn: (...args: Args) => Promise<void> | void): void {
    const opts = typeof options === "string" ? { name: options } : options;
    this.taps.push({
      name: opts.name,
      priority: opts.priority ?? 100,
      fn,
    });
  }

  async call(...args: Args): Promise<void> {
    await Promise.all(this.taps.map((tap) => tap.fn(...args)));
  }

  getTaps(): { name: string; priority: number }[] {
    return this.taps.map(({ name, priority }) => ({ name, priority }));
  }
}

// ==================== AsyncSeriesWaterfallHook ====================

/**
 * 异步瀑布流钩子 - 异步版本的瀑布流
 */
export class AsyncSeriesWaterfallHook<T> {
  private taps: TapInfo<(value: T) => Promise<T> | T>[] = [];

  tap(options: TapOptions | string, fn: (value: T) => Promise<T> | T): void {
    const opts = typeof options === "string" ? { name: options } : options;
    this.taps.push({
      name: opts.name,
      priority: opts.priority ?? 100,
      fn,
    });
    this.taps.sort((a, b) => a.priority - b.priority);
  }

  async call(initial: T): Promise<T> {
    let value = initial;
    for (const tap of this.taps) {
      value = await tap.fn(value);
    }
    return value;
  }

  getTaps(): { name: string; priority: number }[] {
    return this.taps.map(({ name, priority }) => ({ name, priority }));
  }
}

// ==================== Interceptor ====================

/**
 * 钩子拦截器 - 可以在钩子执行前后插入逻辑
 */
export interface HookInterceptor<Args extends unknown[]> {
  /** 注册新 tap 时调用 */
  register?: (tap: TapInfo<(...args: Args) => unknown>) => TapInfo<(...args: Args) => unknown>;
  /** call 开始时调用 */
  call?: (...args: Args) => void;
  /** 每个 tap 执行前调用 */
  tap?: (tap: TapInfo<(...args: Args) => unknown>) => void;
  /** 出错时调用 */
  error?: (error: Error) => void;
  /** 完成时调用 */
  done?: () => void;
}

// ==================== Hookable 基类 ====================

/**
 * 可被 Hook 的基类
 * 继承此类可以快速创建带钩子的模块
 */
export abstract class Hookable {
  protected hooks: Record<string, SyncHook | AsyncSeriesHook | SyncWaterfallHook<unknown>> = {};

  /**
   * 获取所有钩子
   */
  getHooks(): Record<string, { type: string; taps: { name: string; priority: number }[] }> {
    const result: Record<string, { type: string; taps: { name: string; priority: number }[] }> = {};
    for (const [name, hook] of Object.entries(this.hooks)) {
      result[name] = {
        type: hook.constructor.name,
        taps: hook.getTaps(),
      };
    }
    return result;
  }
}
