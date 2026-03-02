"use client";

import { useState } from "react";
import { registry } from "@/multi-tenant/tenants";
import type { Tenant } from "@/multi-tenant/types";

const ALL_TENANTS = registry.getAll();

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_COLOR: Record<string, string> = {
  free: "text-gray-400 border-gray-600 bg-gray-700/40",
  pro: "text-blue-400 border-blue-500/50 bg-blue-500/10",
  enterprise: "text-purple-400 border-purple-500/50 bg-purple-500/10",
};

const FEATURE_LIST: { key: keyof Tenant["features"]; label: string }[] = [
  { key: "apiAccess", label: "API 访问" },
  { key: "exportData", label: "数据导出" },
  { key: "customDomain", label: "自定义域名" },
  { key: "sso", label: "单点登录 SSO" },
  { key: "prioritySupport", label: "优先客服" },
];

export default function MultiTenantPage() {
  const [slug, setSlug] = useState(ALL_TENANTS[0].slug);
  const tenant = registry.resolve(slug) ?? ALL_TENANTS[0];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">🏢 多租户</h1>
      <p className="text-sm text-gray-500 mb-8">
        同一套系统，不同租户有独立的配置、功能权限和数据。切换租户，观察隔离效果。
      </p>

      {/* 租户切换 */}
      <div className="flex gap-2 mb-8">
        {ALL_TENANTS.map((t) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => setSlug(t.slug)}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
              slug === t.slug
                ? PLAN_COLOR[t.plan]
                : "border-gray-700/50 bg-gray-800/30 text-gray-500 hover:text-gray-300"
            }`}
          >
            <div>{t.config.logoText}</div>
            <div className="text-xs font-normal opacity-70 mt-0.5">{PLAN_LABEL[t.plan]}</div>
          </button>
        ))}
      </div>

      {/* 主题色 + 配置 */}
      <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4 mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">配置中心</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {/* 主题色 */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 shrink-0">主题色</span>
            <div
              className="w-5 h-5 rounded-full border border-white/10 shrink-0"
              style={{ backgroundColor: tenant.config.primaryColor }}
            />
            <span className="font-mono text-gray-300 text-xs">{tenant.config.primaryColor}</span>
          </div>
          {/* 品牌名 */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 shrink-0">品牌名</span>
            <span className="font-bold text-base" style={{ color: tenant.config.primaryColor }}>
              {tenant.config.logoText}
            </span>
          </div>
          {/* 最大用户 */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 shrink-0">最大用户</span>
            <span className="font-mono text-gray-300">
              {tenant.config.maxUsers >= 99999 ? "无限制" : `${tenant.config.maxUsers} 人`}
            </span>
          </div>
          {/* 存储空间 */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 shrink-0">存储空间</span>
            <span className="font-mono text-gray-300">
              {tenant.config.maxStorage >= 10000 ? "无限制" : `${tenant.config.maxStorage} GB`}
            </span>
          </div>
        </div>
      </div>

      {/* 功能开关 */}
      <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4 mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">功能权限</p>
        <div className="space-y-2">
          {FEATURE_LIST.map(({ key, label }) => {
            const enabled = tenant.features[key];
            return (
              <div key={key} className="flex items-center justify-between">
                <span className={`text-sm ${enabled ? "text-gray-200" : "text-gray-600"}`}>
                  {label}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    enabled
                      ? "text-green-400 bg-green-500/10 border-green-500/30"
                      : "text-gray-600 bg-gray-700/30 border-gray-700"
                  }`}
                >
                  {enabled ? "✓ 已开启" : "✗ 未开启"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 隔离数据：订单 */}
      <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">租户数据（完全隔离）</p>
        <div className="space-y-2">
          {tenant.orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between py-1.5 border-b border-gray-700/30 last:border-0"
            >
              <span className="text-sm text-gray-300">{order.product}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-gray-400">
                  {order.amount === 0 ? "免费" : `¥${(order.amount / 100).toFixed(0)}`}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded border ${
                    order.status === "paid"
                      ? "text-green-400 border-green-500/30 bg-green-500/10"
                      : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                  }`}
                >
                  {order.status === "paid" ? "已付款" : "待付款"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
