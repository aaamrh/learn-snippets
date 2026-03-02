// ==================== 多租户类型定义 ====================

export type Plan = "free" | "pro" | "enterprise";

/** 主题 */
export interface TenantTheme {
  primaryColor: string;
  logoText: string;
}

/** 配额：资源用量上限 */
export interface TenantQuota {
  users: number; // 最大用户数
  storage: number; // 最大存储 MB
  apiCalls: number; // 每月 API 调用次数
}

/** 功能开关 */
export interface TenantFeatures {
  orderExport: boolean; // 订单导出
  customDomain: boolean; // 自定义域名
  sso: boolean; // 单点登录
  apiAccess: boolean; // API 访问
}

/** 租户的一条订单（模拟隔离数据） */
export interface TenantOrder {
  id: string;
  product: string;
  amount: number;
  status: "paid" | "pending";
}

/** 租户完整定义 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  theme: TenantTheme;
  quota: TenantQuota;
  features: TenantFeatures;
  orders: TenantOrder[];
}
