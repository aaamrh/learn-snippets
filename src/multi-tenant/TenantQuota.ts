import type { Tenant, TenantFeatures } from "./types";

// ==================== 租户配额管理 ====================
/**
 * TenantQuota — 集中管理配额检查和功能开关
 *
 * 核心价值（对比屎山）：
 *
 * ❌ 屎山：配额和功能判断散落各处
 *   if (tenant.quota.apiCalls > 0 && userCount < tenant.quota.users) { ... }
 *   if (tenant.features.orderExport === true) { ... }
 *   → 逻辑重复，阈值写死，改一处要找 N 个文件
 *
 * ✅ 优雅：集中在一个类里
 *   quota.canUse('apiCalls')   → true/false
 *   quota.hasFeature('orderExport') → true/false
 *   quota.getRemaining('users')  → 剩余数量
 *   → 业务逻辑只写一次，所有地方复用
 */
export class TenantQuota {
  private tenant: Tenant;
  /** 模拟当前已用量（Demo 用，真实场景从后端获取） */
  private usage: Record<string, number>;

  constructor(tenant: Tenant, usage?: Record<string, number>) {
    this.tenant = tenant;
    // 默认模拟一些已用量，让 Demo 更真实
    this.usage = usage ?? {
      users: Math.floor(tenant.quota.users * 0.6),
      storage: Math.floor(tenant.quota.storage * 0.4),
      apiCalls: Math.floor(tenant.quota.apiCalls * 0.8),
    };
  }

  /**
   * 检查某项资源是否还有剩余配额
   * @param resource  资源名，对应 TenantQuota 的 key
   * @param amount    本次需要消耗的量，默认 1
   */
  canUse(resource: keyof Tenant["quota"], amount = 1): boolean {
    const limit = this.tenant.quota[resource];
    const used = this.usage[resource] ?? 0;
    return used + amount <= limit;
  }

  /**
   * 获取某项资源的剩余配额
   */
  getRemaining(resource: keyof Tenant["quota"]): number {
    const limit = this.tenant.quota[resource];
    const used = this.usage[resource] ?? 0;
    return Math.max(0, limit - used);
  }

  /**
   * 获取某项资源的已用量
   */
  getUsed(resource: keyof Tenant["quota"]): number {
    return this.usage[resource] ?? 0;
  }

  /**
   * 获取某项资源的总配额上限
   */
  getLimit(resource: keyof Tenant["quota"]): number {
    return this.tenant.quota[resource];
  }

  /**
   * 获取使用百分比（0-100）
   */
  getPercent(resource: keyof Tenant["quota"]): number {
    const limit = this.tenant.quota[resource];
    if (limit <= 0) return 0;
    return Math.round(((this.usage[resource] ?? 0) / limit) * 100);
  }

  /**
   * 检查租户是否开启了某个功能
   * 统一在这里判断，不在组件里散落 tenant.features.xxx
   */
  hasFeature(feature: keyof TenantFeatures): boolean {
    return this.tenant.features[feature] === true;
  }
}
