import { Tenant, Plan } from './types'

// ==================== 租户注册表 ====================
/**
 * TenantRegistry — 租户注册与查找
 *
 * 核心职责：
 *   1. 注册租户（register）
 *   2. 按 slug 查找租户（resolve）
 *   3. 读取某租户的配置项（getConfig）
 *   4. 检查某租户是否开启了某功能（hasFeature）
 *
 * 设计要点：
 *   - 所有租户数据隔离在各自的 Tenant 对象里，注册表只负责查找
 *   - resolve 找不到时返回 null，由调用方决定如何处理（不抛异常）
 *   - getConfig / hasFeature 通过 slug 定位租户，避免调用方持有 Tenant 引用
 */
export class TenantRegistry {
  private tenants = new Map<string, Tenant>()

  /** 注册一个租户，slug 重复时覆盖 */
  register(tenant: Tenant): this {
    this.tenants.set(tenant.slug, tenant)
    return this
  }

  /** 按 slug 查找租户，找不到返回 null */
  resolve(slug: string): Tenant | null {
    return this.tenants.get(slug) ?? null
  }

  /** 获取所有已注册租户列表 */
  getAll(): Tenant[] {
    return Array.from(this.tenants.values())
  }

  /**
   * 读取租户配置项
   * @param slug   租户标识
   * @param key    TenantConfig 的 key
   * @returns      配置值，租户不存在时返回 undefined
   */
  getConfig<K extends keyof Tenant['config']>(
    slug: string,
    key: K,
  ): Tenant['config'][K] | undefined {
    return this.tenants.get(slug)?.config[key]
  }

  /**
   * 检查租户是否开启了某个功能
   * @param slug    租户标识
   * @param feature TenantFeatures 的 key
   */
  hasFeature<K extends keyof Tenant['features']>(slug: string, feature: K): boolean {
    return this.tenants.get(slug)?.features[feature] ?? false
  }

  /**
   * 判断租户套餐是否满足最低要求
   * 用于"该功能需要 Pro 及以上"这类场景
   */
  meetsMinPlan(slug: string, minPlan: Plan): boolean {
    const ORDER: Plan[] = ['free', 'pro', 'enterprise']
    const tenant = this.tenants.get(slug)
    if (!tenant) return false
    return ORDER.indexOf(tenant.plan) >= ORDER.indexOf(minPlan)
  }
}
