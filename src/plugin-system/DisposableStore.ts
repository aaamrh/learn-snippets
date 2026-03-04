// ==================== DisposableStore ====================
//
// 统一管理一组 Disposable 的工具类。
//
// 解决的问题：
// - 之前各模块用 `const disposables: Disposable[] = []` 手动管理，
//   没有防重复 dispose 保护，也没有统一的资源计数。
// - 插件停用时不确定是否所有资源都被清理干净。
//
// 设计原则：
// - DisposableStore 本身也实现 Disposable 接口（可以嵌套组合）
// - 调用 dispose() 后再 add() 会立即 dispose 新加的资源（防泄漏）
// - 防止重复 dispose（幂等操作）
// - 提供 size 属性方便诊断面板展示资源数量
//
// 使用方式：
// ```ts
// const store = new DisposableStore();
//
// // 添加资源
// const d1 = store.add(someDisposable);
// store.addMany([d2, d3]);
//
// // 查看当前资源数
// console.log(store.size); // 3
//
// // 清理所有
// store.dispose();
// console.log(store.isDisposed); // true
// console.log(store.size); // 0
//
// // dispose 后再 add 会立即清理新资源
// store.add(d4); // d4.dispose() 被立即调用
// ```
//
// 与其他模块的关系：
// | 模块              | 使用方式                                    |
// |-------------------|---------------------------------------------|
// | APIProxy          | createPluginAPI 用 DisposableStore 替换数组   |
// | NewPluginHost     | pluginDisposables 用 DisposableStore 替换数组 |
// | PluginRegistry    | 每个插件的 disposables 可改用 DisposableStore |
// | KeybindingService | 内部资源管理                                 |

import type { Disposable } from "./manifest-types";

// ==================== 安全 dispose 工具函数 ====================

/**
 * 安全地 dispose 一个资源，捕获并报告错误但不抛出。
 *
 * @param disposable  要清理的资源
 * @param label       可选的标识（出错时用于日志定位）
 * @returns 是否成功（无异常）
 */
export function safeDispose(disposable: Disposable, label?: string): boolean {
  try {
    disposable.dispose();
    return true;
  } catch (error) {
    const prefix = label ? `[DisposableStore:${label}]` : "[DisposableStore]";
    console.error(`${prefix} Error disposing resource:`, error);
    return false;
  }
}

/**
 * 安全地 dispose 一组资源。
 *
 * @param disposables 要清理的资源数组
 * @param label       可选的标识
 * @returns 成功清理的数量
 */
export function safeDisposeAll(disposables: Disposable[], label?: string): number {
  let successCount = 0;
  for (const d of disposables) {
    if (safeDispose(d, label)) {
      successCount++;
    }
  }
  return successCount;
}

// ==================== MutableDisposable ====================

/**
 * 持有一个可替换的 Disposable。
 *
 * 设置新值时自动 dispose 旧值。
 * 适合需要"当前只持有一个资源，随时可以换"的场景，
 * 比如事件监听器的重新绑定。
 *
 * ```ts
 * const holder = new MutableDisposable();
 * holder.value = listenerA;  // 持有 A
 * holder.value = listenerB;  // A 被 dispose，持有 B
 * holder.dispose();          // B 被 dispose
 * ```
 */
export class MutableDisposable implements Disposable {
  private _value: Disposable | null = null;
  private _isDisposed = false;

  get value(): Disposable | null {
    return this._value;
  }

  set value(newValue: Disposable | null) {
    // 如果已经 disposed，新值也立即 dispose
    if (this._isDisposed) {
      if (newValue) {
        safeDispose(newValue);
      }
      return;
    }

    // dispose 旧值
    if (this._value) {
      safeDispose(this._value);
    }

    this._value = newValue;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * 清除当前持有的资源（dispose 并设为 null），但不标记自身为 disposed。
   * 之后仍可设置新的 value。
   */
  clear(): void {
    if (this._value) {
      safeDispose(this._value);
      this._value = null;
    }
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    if (this._value) {
      safeDispose(this._value);
      this._value = null;
    }
  }
}

// ==================== DisposableStore ====================

/**
 * DisposableStore — Disposable 集合管理器
 *
 * 核心特性：
 * 1. 统一收集和清理一组 Disposable
 * 2. 自身实现 Disposable 接口，可嵌套组合
 * 3. dispose 后再 add 新资源会立即 dispose（防泄漏）
 * 4. dispose 是幂等的（重复调用不会报错）
 * 5. 提供 size / isDisposed 属性供诊断
 */
export class DisposableStore implements Disposable {
  /**
   * 内部资源列表
   *
   * 使用数组而非 Set，因为：
   * - 同一个 Disposable 可能被 add 多次（虽然不推荐，但不应静默丢弃）
   * - 保持添加顺序，dispose 时按添加顺序清理（与 VS Code 的 DisposableStore 行为一致）
   */
  private _items: Disposable[] = [];

  /** 是否已被 dispose */
  private _isDisposed = false;

  /** 可选标识，用于调试日志 */
  private _label: string | undefined;

  constructor(label?: string) {
    this._label = label;
  }

  // ==================== 状态查询 ====================

  /**
   * 是否已被 dispose
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * 当前持有的 Disposable 数量
   */
  get size(): number {
    return this._items.length;
  }

  // ==================== 添加资源 ====================

  /**
   * 添加一个 Disposable 到 store 中。
   *
   * 如果 store 已经被 dispose，传入的资源会被立即 dispose（防泄漏）。
   *
   * @param disposable 要管理的 Disposable
   * @returns 传入的 Disposable 本身（方便链式调用 / 保存引用）
   *
   * @example
   * ```ts
   * const listener = store.add(emitter.on("event", handler));
   * // listener 仍可单独使用，同时也会在 store.dispose() 时被清理
   * ```
   */
  add<T extends Disposable>(disposable: T): T {
    if (this._isDisposed) {
      // store 已 dispose，立即清理新资源，防止泄漏
      console.warn(
        `[DisposableStore${this._label ? `:${this._label}` : ""}] ` +
          `Adding disposable to an already disposed store. The disposable will be immediately disposed.`,
      );
      safeDispose(disposable, this._label);
      return disposable;
    }

    this._items.push(disposable);
    return disposable;
  }

  /**
   * 批量添加 Disposable。
   *
   * @param disposables 要管理的 Disposable 数组
   *
   * @example
   * ```ts
   * store.addMany([listener1, listener2, timer]);
   * ```
   */
  addMany(disposables: Disposable[]): void {
    for (const d of disposables) {
      this.add(d);
    }
  }

  /**
   * 从 store 中移除一个 Disposable（不 dispose 它）。
   *
   * 用于需要把资源"转移"到别处管理的场景。
   *
   * @param disposable 要移除的 Disposable
   * @returns 是否成功移除
   */
  remove(disposable: Disposable): boolean {
    const index = this._items.indexOf(disposable);
    if (index >= 0) {
      this._items.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 从 store 中移除并 dispose 一个 Disposable。
   *
   * @param disposable 要移除并清理的 Disposable
   * @returns 是否找到并清理了该资源
   */
  deleteAndDispose(disposable: Disposable): boolean {
    const removed = this.remove(disposable);
    if (removed) {
      safeDispose(disposable, this._label);
    }
    return removed;
  }

  // ==================== 清理 ====================

  /**
   * 清理所有已添加的 Disposable，但不标记 store 为 disposed。
   *
   * 清理后 store 仍可继续使用（添加新资源）。
   * 适合需要"重置"而非"销毁"的场景。
   *
   * @returns 成功清理的资源数量
   */
  clear(): number {
    const items = this._items.slice(); // 拷贝，防止 dispose 过程中修改数组
    this._items = [];
    return safeDisposeAll(items, this._label);
  }

  /**
   * 清理所有资源并标记 store 为 disposed。
   *
   * dispose 后再调用 add() 会立即 dispose 新资源（防泄漏）。
   * 重复调用 dispose() 是安全的（幂等）。
   *
   * @returns 成功清理的资源数量
   */
  dispose(): number {
    if (this._isDisposed) {
      return 0;
    }

    this._isDisposed = true;

    const items = this._items.slice();
    this._items = [];
    return safeDisposeAll(items, this._label);
  }

  // ==================== 工具方法 ====================

  /**
   * 创建一个 Disposable，调用时会从 store 中移除并 dispose 指定资源。
   *
   * 适合需要"提前释放某个资源"的场景。
   *
   * @example
   * ```ts
   * const earlyRelease = store.createEarlyDisposer(heavyResource);
   * // ... 某些条件下提前释放
   * earlyRelease.dispose(); // heavyResource 被 dispose 并从 store 中移除
   * ```
   */
  createEarlyDisposer(disposable: Disposable): Disposable {
    return {
      dispose: () => {
        this.deleteAndDispose(disposable);
      },
    };
  }

  /**
   * 遍历所有持有的 Disposable（只读）。
   *
   * 用于诊断和调试。
   */
  [Symbol.iterator](): IterableIterator<Disposable> {
    return this._items[Symbol.iterator]();
  }

  // ==================== 诊断 ====================

  /**
   * 获取诊断信息
   */
  getDiagnostics(): DisposableStoreDiagnostics {
    return {
      label: this._label ?? null,
      size: this._items.length,
      isDisposed: this._isDisposed,
    };
  }

  /**
   * 转为字符串（调试用）
   */
  toString(): string {
    const label = this._label ? `"${this._label}"` : "anonymous";
    const status = this._isDisposed ? "disposed" : "active";
    return `DisposableStore(${label}, ${status}, ${this._items.length} items)`;
  }
}

// ==================== 工厂函数 ====================

/**
 * 快捷创建一个 Disposable（从函数）。
 *
 * @example
 * ```ts
 * const timer = setInterval(tick, 1000);
 * store.add(toDisposable(() => clearInterval(timer)));
 * ```
 */
export function toDisposable(fn: () => void): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      fn();
    },
  };
}

/**
 * 组合多个 Disposable 为一个。
 *
 * @example
 * ```ts
 * const combined = combineDisposables(listener1, listener2, timer);
 * combined.dispose(); // 三个都被 dispose
 * ```
 */
export function combineDisposables(...disposables: Disposable[]): Disposable {
  const store = new DisposableStore();
  store.addMany(disposables);
  return store;
}

/**
 * 创建一个"一次性" Disposable，dispose 后再调用 dispose 不会重复执行。
 *
 * 与 toDisposable 的区别：此函数接受一个已有的 Disposable 并包装它，
 * 而 toDisposable 从函数创建新的 Disposable。
 */
export function onceDisposable(disposable: Disposable): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      disposable.dispose();
    },
  };
}

// ==================== 诊断类型 ====================

export interface DisposableStoreDiagnostics {
  /** store 标识 */
  label: string | null;
  /** 当前持有的资源数量 */
  size: number;
  /** 是否已被 dispose */
  isDisposed: boolean;
}
