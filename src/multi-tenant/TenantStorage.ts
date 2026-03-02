import type { Tenant } from "./types";

// ==================== 租户存储（key 自动隔离） ====================
/**
 * TenantStorage — 租户级别的 localStorage 封装
 *
 * 核心价值（对比屎山）：
 *
 * ❌ 屎山：key 混在一起，租户之间互相污染
 *   localStorage.setItem('orders', JSON.stringify(data))
 *   → A 租户和 B 租户读到同一份数据
 *   → 切换租户时要手动清理，容易遗漏
 *
 * ✅ 优雅：key 自动加租户前缀，天然隔离
 *   storage.set('orders', data)
 *   → 实际写入 "tenant:acme:orders"
 *   → 切换租户后读取的是 "tenant:globex:orders"，完全隔离
 *
 * 调用方完全不需要知道 tenantId 是什么，Storage 内部自动处理。
 */
export class TenantStorage {
  private tenant: Tenant;

  constructor(tenant: Tenant) {
    this.tenant = tenant;
  }

  /**
   * 生成带租户前缀的实际 key
   * "orders" → "tenant:acme:orders"
   * 这是隔离的核心：同名 key 在不同租户下物理上是不同的 key
   */
  private prefixedKey(key: string): string {
    return `tenant:${this.tenant.slug}:${key}`;
  }

  /** 读取值（自动加前缀） */
  get<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(this.prefixedKey(key));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  /** 写入值（自动加前缀） */
  set<T>(key: string, value: T): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.prefixedKey(key), JSON.stringify(value));
  }

  /** 删除（自动加前缀） */
  remove(key: string): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.prefixedKey(key));
  }

  /**
   * 清除该租户的所有数据
   * 切换租户或租户注销时调用
   */
  clearAll(): void {
    if (typeof window === "undefined") return;
    const prefix = `tenant:${this.tenant.slug}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  }

  /**
   * 返回实际存储的 key 字符串（供 UI 展示用）
   * 让用户直观看到隔离效果：同一个逻辑 key 在不同租户下不同
   */
  previewKey(key: string): string {
    return this.prefixedKey(key);
  }
}
