"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { registry } from "./tenants";
import type { Tenant } from "./types";

// ==================== Context 类型 ====================
interface TenantContextValue {
  tenant: Tenant;
  /** 切换租户，整个组件树自动更新 */
  switchTenant: (slug: string) => void;
}

// ==================== Context ====================
const TenantContext = createContext<TenantContextValue | null>(null);

// ==================== Provider ====================
/**
 * TenantProvider — 放在组件树顶层，只需设置一次。
 *
 * 核心价值：
 *   子组件不需要接收任何 tenantId prop，
 *   直接调用 useTenant() 就能拿到当前租户的完整信息。
 *   切换租户时只改这一处，整棵树自动更新。
 */
export function TenantProvider({
  initialSlug,
  children,
}: {
  initialSlug: string;
  children: ReactNode;
}) {
  const [slug, setSlug] = useState(initialSlug);

  // slug 变化时自动应用主题色
  const tenant = useMemo(
    () => registry.resolve(slug) ?? registry.getAll()[0],
    [slug]
  );

  // 自动把主题色写入 CSS 变量，全局生效
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--tenant-color",
      tenant.theme.primaryColor
    );
  }, [tenant.theme.primaryColor]);

  const value = useMemo<TenantContextValue>(
    () => ({ tenant, switchTenant: setSlug }),
    [tenant]
  );

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

// ==================== Hook ====================
/**
 * useTenant — 在任意子组件中获取当前租户上下文。
 *
 * 不需要 prop drilling，不需要知道父组件是谁，
 * 任何层级都能直接调用。
 */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used inside <TenantProvider>");
  }
  return ctx;
}
