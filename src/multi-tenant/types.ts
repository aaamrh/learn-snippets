// ==================== 多租户类型定义 ====================

export type Plan = 'free' | 'pro' | 'enterprise'

/** 功能开关：不同套餐开放不同功能 */
export interface TenantFeatures {
  exportData: boolean      // 数据导出
  customDomain: boolean    // 自定义域名
  sso: boolean             // 单点登录
  apiAccess: boolean       // API 访问
  prioritySupport: boolean // 优先客服
}

/** 租户配置：主题、限额等个性化参数 */
export interface TenantConfig {
  primaryColor: string     // 主题色（CSS 颜色值）
  maxUsers: number         // 最大用户数
  maxStorage: number       // 最大存储（GB）
  logoText: string         // 品牌名称
}

/** 租户的一条业务数据（模拟隔离效果） */
export interface TenantOrder {
  id: string
  product: string
  amount: number
  status: 'paid' | 'pending'
}

/** 租户完整定义 */
export interface Tenant {
  id: string
  name: string
  slug: string             // 唯一标识，如 'acme'
  plan: Plan
  config: TenantConfig
  features: TenantFeatures
  orders: TenantOrder[]
}
