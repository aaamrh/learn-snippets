/**
 * 高级缓存管理器
 *
 * 核心概念：
 * 1. TTL（Time To Live）- 缓存过期时间
 * 2. LRU（Least Recently Used）- 最近最少使用淘汰
 * 3. 标签（Tag）- 按标签批量失效
 * 4. 自动刷新 - 后台静默更新
 *
 * 解决的问题：
 * - 手动清理 → 自动淘汰
 * - 过期逻辑散落 → 统一 TTL
 * - 批量失效难 → 标签管理
 */

// ==================== 类型定义 ====================

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  accessedAt: number;
  expiresAt: number | null; // null 表示永不过期
  tags: Set<string>;
  accessCount: number;
}

interface CacheOptions {
  /** 缓存容量（条目数） */
  maxSize?: number;
  /** 默认 TTL（毫秒） */
  defaultTTL?: number;
  /** 是否启用 LRU 淘汰 */
  enableLRU?: boolean;
  /** 定期清理间隔（毫秒） */
  cleanupInterval?: number;
}

interface SetOptions {
  /** 过期时间（毫秒），0 表示使用默认，-1 表示永不过期 */
  ttl?: number;
  /** 标签，用于批量失效 */
  tags?: string[];
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

// ==================== CacheManager ====================

/**
 * 高级缓存管理器
 */
export class CacheManager<K = string, V = unknown> {
  private cache = new Map<K, CacheEntry<V>>();
  private tagIndex = new Map<string, Set<K>>();

  private maxSize: number;
  private defaultTTL: number;
  private enableLRU: boolean;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // 统计
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.defaultTTL = options.defaultTTL ?? 5 * 60 * 1000; // 5 分钟
    this.enableLRU = options.enableLRU ?? true;

    // 启动定期清理
    if (options.cleanupInterval) {
      this.cleanupTimer = setInterval(() => this.cleanup(), options.cleanupInterval);
    }
  }

  /**
   * 设置缓存
   */
  set(key: K, value: V, options: SetOptions = {}): void {
    // 检查容量，需要时淘汰
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    const now = Date.now();
    const ttl = options.ttl === -1 ? null : (options.ttl ?? this.defaultTTL);
    const tags = new Set(options.tags ?? []);

    // 如果已存在，先清理旧的标签索引
    const existing = this.cache.get(key);
    if (existing) {
      this.removeFromTagIndex(key, existing.tags);
    }

    // 设置新条目
    const entry: CacheEntry<V> = {
      value,
      createdAt: now,
      accessedAt: now,
      expiresAt: ttl ? now + ttl : null,
      tags,
      accessCount: 0,
    };

    this.cache.set(key, entry);

    // 更新标签索引
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  /**
   * 获取缓存
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // 检查过期
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // 更新访问信息
    entry.accessedAt = Date.now();
    entry.accessCount++;
    this.hits++;

    return entry.value;
  }

  /**
   * 检查是否存在且未过期
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * 删除缓存
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.removeFromTagIndex(key, entry.tags);
    return this.cache.delete(key);
  }

  /**
   * 按标签批量失效
   */
  invalidateByTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;

    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) count++;
    }

    this.tagIndex.delete(tag);
    return count;
  }

  /**
   * 按标签批量失效（多个标签）
   */
  invalidateByTags(tags: string[]): number {
    let count = 0;
    for (const tag of tags) {
      count += this.invalidateByTag(tag);
    }
    return count;
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.tagIndex.clear();
  }

  /**
   * 获取或设置（懒加载）
   */
  async getOrSet(key: K, factory: () => V | Promise<V>, options: SetOptions = {}): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const value = await factory();
    this.set(key, value, options);
    return value;
  }

  /**
   * 刷新缓存（后台静默更新）
   */
  async refresh(key: K, factory: () => V | Promise<V>): Promise<void> {
    const entry = this.cache.get(key);
    if (!entry) return;

    try {
      const value = await factory();
      this.set(key, value, {
        ttl: entry.expiresAt ? entry.expiresAt - entry.createdAt : -1,
        tags: Array.from(entry.tags),
      });
    } catch (e) {
      console.warn("Cache refresh failed:", e);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      evictions: this.evictions,
    };
  }

  /**
   * 获取所有键
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取所有条目信息（用于调试）
   */
  entries(): Array<{
    key: K;
    value: V;
    createdAt: number;
    accessedAt: number;
    expiresAt: number | null;
    tags: string[];
    accessCount: number;
    isExpired: boolean;
    ttlRemaining: number | null;
  }> {
    const now = Date.now();
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      value: entry.value,
      createdAt: entry.createdAt,
      accessedAt: entry.accessedAt,
      expiresAt: entry.expiresAt,
      tags: Array.from(entry.tags),
      accessCount: entry.accessCount,
      isExpired: entry.expiresAt ? now > entry.expiresAt : false,
      ttlRemaining: entry.expiresAt ? Math.max(0, entry.expiresAt - now) : null,
    }));
  }

  /**
   * 销毁（清理定时器）
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }

  // ==================== Private ====================

  /**
   * 淘汰条目（LRU）
   */
  private evict(): void {
    if (!this.enableLRU) {
      // 非 LRU 模式，直接删除第一个
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.delete(firstKey);
        this.evictions++;
      }
      return;
    }

    // LRU: 找到最久未访问的
    let oldestKey: K | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.delete(oldestKey);
      this.evictions++;
    }
  }

  /**
   * 清理过期条目
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.delete(key);
      }
    }
  }

  /**
   * 从标签索引中移除
   */
  private removeFromTagIndex(key: K, tags: Set<string>): void {
    for (const tag of tags) {
      const tagKeys = this.tagIndex.get(tag);
      if (tagKeys) {
        tagKeys.delete(key);
        if (tagKeys.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }
}

// ==================== 便捷工厂函数 ====================

/**
 * 创建带 TTL 的缓存
 */
export function createTTLCache<V>(ttlMs: number, maxSize = 1000): CacheManager<string, V> {
  return new CacheManager({
    defaultTTL: ttlMs,
    maxSize,
    enableLRU: true,
    cleanupInterval: ttlMs,
  });
}

/**
 * 创建永不过期的 LRU 缓存
 */
export function createLRUCache<V>(maxSize: number): CacheManager<string, V> {
  return new CacheManager({
    maxSize,
    defaultTTL: -1,
    enableLRU: true,
  });
}
