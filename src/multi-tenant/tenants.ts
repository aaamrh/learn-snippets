import { Tenant } from "./types";
import { TenantRegistry } from "./TenantRegistry";

// ==================== 预置租户数据 ====================

const tenantFree: Tenant = {
  id: "t1",
  name: "Acme 公司",
  slug: "acme",
  plan: "free",
  theme: {
    primaryColor: "#6b7280",
    logoText: "Acme",
  },
  quota: {
    users: 5,
    storage: 1024, // 1 GB
    apiCalls: 1000,
  },
  features: {
    orderExport: false,
    customDomain: false,
    sso: false,
    apiAccess: false,
  },
  orders: [
    { id: "o1", product: "基础套餐", amount: 0, status: "paid" },
    { id: "o2", product: "额外存储", amount: 900, status: "pending" },
  ],
};

const tenantPro: Tenant = {
  id: "t2",
  name: "Globex 科技",
  slug: "globex",
  plan: "pro",
  theme: {
    primaryColor: "#3b82f6",
    logoText: "Globex",
  },
  quota: {
    users: 50,
    storage: 102400, // 100 GB
    apiCalls: 50000,
  },
  features: {
    orderExport: true,
    customDomain: true,
    sso: false,
    apiAccess: true,
  },
  orders: [
    { id: "o3", product: "Pro 年付", amount: 299900, status: "paid" },
    { id: "o4", product: "用户席位 x10", amount: 49900, status: "paid" },
    { id: "o5", product: "API 调用包", amount: 19900, status: "pending" },
  ],
};

const tenantEnterprise: Tenant = {
  id: "t3",
  name: "Initech 集团",
  slug: "initech",
  plan: "enterprise",
  theme: {
    primaryColor: "#8b5cf6",
    logoText: "Initech",
  },
  quota: {
    users: 99999,
    storage: 10240000, // 10 TB
    apiCalls: 9999999,
  },
  features: {
    orderExport: true,
    customDomain: true,
    sso: true,
    apiAccess: true,
  },
  orders: [
    { id: "o6", product: "Enterprise 合同", amount: 2999900, status: "paid" },
    { id: "o7", product: "专属部署", amount: 999900, status: "paid" },
    { id: "o8", product: "安全审计", amount: 499900, status: "pending" },
    { id: "o9", product: "培训服务", amount: 299900, status: "paid" },
  ],
};

// ==================== 全局注册表实例 ====================
export const registry = new TenantRegistry()
  .register(tenantFree)
  .register(tenantPro)
  .register(tenantEnterprise);
