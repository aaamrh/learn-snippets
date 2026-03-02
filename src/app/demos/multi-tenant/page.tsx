"use client";

import { useState } from "react";
import { TenantStorage } from "@/multi-tenant/TenantStorage";
import { registry } from "@/multi-tenant/tenants";

const TENANTS = registry.getAll().slice(0, 2); // 只取两个租户，对比更清晰
const BAD_KEY = "orders"; // 屎山：直接用这个 key

// ==================== 工具 ====================
function Badge({
  color,
  children,
}: {
  color: "red" | "green" | "gray";
  children: React.ReactNode;
}) {
  const cls = {
    red: "text-red-400 bg-red-500/10 border-red-500/30",
    green: "text-green-400 bg-green-500/10 border-green-500/30",
    gray: "text-gray-500 bg-gray-700/30 border-gray-700",
  }[color];
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>{children}</span>
  );
}

// ==================== 左列：屎山 ====================
// 问题：直接用固定 key 读写 localStorage
// 切换租户后，新租户读到的还是旧租户写的数据 → 数据泄漏
function BadSide({ slug }: { slug: string }) {
  const tenant = registry.resolve(slug) ?? TENANTS[0];

  // 直接读 localStorage（不带租户前缀）
  const raw = typeof window !== "undefined" ? localStorage.getItem(BAD_KEY) : null;
  const cached: string[] | null = raw ? JSON.parse(raw) : null;

  // 当前租户的"真实"订单
  const realOrders = tenant.orders.map((o) => o.product);

  // 屎山写法：直接写固定 key
  function writeCache() {
    localStorage.setItem(BAD_KEY, JSON.stringify(realOrders));
    // 强制重新渲染
    window.dispatchEvent(new Event("storage-update"));
  }

  function clearCache() {
    localStorage.removeItem(BAD_KEY);
    window.dispatchEvent(new Event("storage-update"));
  }

  // 判断是否发生了数据泄漏
  // 缓存存在 且 缓存内容和当前租户真实数据不一致
  const isLeak = cached !== null && JSON.stringify(cached) !== JSON.stringify(realOrders);

  return (
    <div className="flex flex-col gap-3">
      {/* 代码展示 */}
      <div className="rounded-lg bg-gray-900/80 p-3 text-xs font-mono leading-relaxed">
        <p className="text-gray-600 mb-1">{"// 屎山写法"}</p>
        <p>
          <span className="text-yellow-400">localStorage</span>
          <span className="text-gray-400">.getItem(</span>
          <span className="text-red-300">'orders'</span>
          <span className="text-gray-400">)</span>
        </p>
        <p className="text-gray-600 mt-1">{"// 所有租户共用同一个 key"}</p>
        <p className="text-gray-600">{"// 切换租户不会换 key"}</p>
      </div>

      {/* 当前 localStorage 状态 */}
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">localStorage 实际状态</span>
        </div>
        <div className="text-xs font-mono">
          <span className="text-gray-500">key: </span>
          <span className="text-red-300">"orders"</span>
          <p className="mt-1">
            <span className="text-gray-500">value: </span>
            {cached ? (
              <span className="text-gray-300">{JSON.stringify(cached)}</span>
            ) : (
              <span className="text-gray-600">null（无缓存）</span>
            )}
          </p>
        </div>
      </div>

      {/* 泄漏警告 */}
      {isLeak && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
          <p className="text-red-400 text-xs font-semibold mb-1">🚨 数据泄漏！</p>
          <p className="text-red-300/80 text-xs leading-relaxed">
            当前是 <strong>{tenant.name}</strong> 的页面，
            <br />
            但读到的是上一个租户写入的缓存数据。
          </p>
        </div>
      )}

      {/* 订单列表 */}
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/40 p-3">
        <p className="text-xs text-gray-500 mb-2">
          页面展示的订单 {isLeak && <span className="text-red-400">（来自缓存 — 数据错误！）</span>}
          {!isLeak && cached && <span className="text-green-400">（来自缓存）</span>}
          {!cached && <span className="text-gray-600">（无缓存，显示真实数据）</span>}
        </p>
        <div className="space-y-1">
          {(cached ?? realOrders).map((item) => (
            <div
              key={item}
              className={`text-sm px-2 py-1 rounded ${
                isLeak ? "text-red-300 bg-red-500/5" : "text-gray-300 bg-gray-700/20"
              }`}
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={writeCache}
          className="flex-1 py-2 rounded-lg border border-gray-600 bg-gray-700/50 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
        >
          写入缓存
        </button>
        <button
          type="button"
          onClick={clearCache}
          className="flex-1 py-2 rounded-lg border border-gray-700/40 bg-gray-800/30 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          清除缓存
        </button>
      </div>
    </div>
  );
}

// ==================== 右列：优雅 ====================
// 优雅：用 TenantStorage，key 自动加租户前缀
// 切换租户后，自动读取该租户自己的缓存，天然隔离
function GoodSide({ slug }: { slug: string }) {
  const tenant = registry.resolve(slug) ?? TENANTS[0];
  const storage = new TenantStorage(tenant);

  const cached = storage.get<string[]>("orders");
  const realOrders = tenant.orders.map((o) => o.product);
  const actualKey = storage.previewKey("orders");

  function writeCache() {
    storage.set("orders", realOrders);
    window.dispatchEvent(new Event("storage-update"));
  }

  function clearCache() {
    storage.remove("orders");
    window.dispatchEvent(new Event("storage-update"));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 代码展示 */}
      <div className="rounded-lg bg-gray-900/80 p-3 text-xs font-mono leading-relaxed">
        <p className="text-gray-600 mb-1">{"// 优雅写法"}</p>
        <p>
          <span className="text-yellow-400">storage</span>
          <span className="text-gray-400">.get(</span>
          <span className="text-green-300">'orders'</span>
          <span className="text-gray-400">)</span>
        </p>
        <p className="text-gray-600 mt-1">{"// 内部自动加前缀："}</p>
        <p>
          <span className="text-gray-600">{"// "}</span>
          <span className="text-green-400">"{actualKey}"</span>
        </p>
      </div>

      {/* 当前 localStorage 状态 */}
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">localStorage 实际状态</span>
        </div>
        <div className="text-xs font-mono">
          <p>
            <span className="text-gray-500">key: </span>
            <span className="text-green-300">"{actualKey}"</span>
          </p>
          <p className="mt-1">
            <span className="text-gray-500">value: </span>
            {cached ? (
              <span className="text-gray-300">{JSON.stringify(cached)}</span>
            ) : (
              <span className="text-gray-600">null（无缓存）</span>
            )}
          </p>
        </div>
      </div>

      {/* 隔离成功提示 */}
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
        <p className="text-green-400 text-xs font-semibold mb-1">✅ 数据天然隔离</p>
        <p className="text-green-300/70 text-xs leading-relaxed">
          每个租户读写各自的 key，
          <br />
          切换租户永远不会读到别人的数据。
        </p>
      </div>

      {/* 订单列表 */}
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/40 p-3">
        <p className="text-xs text-gray-500 mb-2">
          页面展示的订单{" "}
          {cached ? (
            <span className="text-green-400">（来自缓存 — 数据正确）</span>
          ) : (
            <span className="text-gray-600">（无缓存，显示真实数据）</span>
          )}
        </p>
        <div className="space-y-1">
          {(cached ?? realOrders).map((item) => (
            <div key={item} className="text-sm text-gray-300 px-2 py-1 rounded bg-gray-700/20">
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={writeCache}
          className="flex-1 py-2 rounded-lg border border-blue-500/40 bg-blue-500/10 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          写入缓存
        </button>
        <button
          type="button"
          onClick={clearCache}
          className="flex-1 py-2 rounded-lg border border-gray-700/40 bg-gray-800/30 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          清除缓存
        </button>
      </div>
    </div>
  );
}

// ==================== 主页面 ====================
export default function MultiTenantPage() {
  const [slug, setSlug] = useState(TENANTS[0].slug);
  // 用于监听 storage 变化强制重新渲染
  const [tick, setTick] = useState(0);

  // 监听自定义事件触发重渲染
  if (typeof window !== "undefined") {
    window.addEventListener("storage-update", () => setTick((t) => t + 1), { once: true });
  }

  const tenant = registry.resolve(slug) ?? TENANTS[0];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" key={tick}>
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">🏢 多租户隔离</h1>
      <p className="text-sm text-gray-500 mb-2">
        多租户最核心的问题：
        <strong className="text-gray-300">用户在 A 公司的账号里，看到了 B 公司的数据。</strong>
      </p>
      <p className="text-sm text-gray-600 mb-6">
        👇 操作步骤：① 在左列点「写入缓存」② 切换到另一个租户 ③ 观察左列是否出现数据泄漏
      </p>

      {/* 租户切换 */}
      <div className="flex gap-2 mb-8">
        {TENANTS.map((t) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => setSlug(t.slug)}
            className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              slug === t.slug
                ? "border-blue-500/50 bg-blue-500/10 text-white"
                : "border-gray-700/50 bg-gray-800/30 text-gray-500 hover:text-gray-300"
            }`}
          >
            <div className="font-bold">{t.name}</div>
            <div className="text-xs font-normal opacity-60 mt-0.5 capitalize">{t.plan}</div>
          </button>
        ))}
      </div>

      {/* 当前租户标签 */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: tenant.theme.primaryColor }}
        />
        <span className="text-sm text-gray-400">
          当前租户：<strong className="text-white">{tenant.name}</strong>
          <span className="ml-2 text-gray-600 font-mono text-xs">slug = "{tenant.slug}"</span>
        </span>
      </div>

      {/* 左右对比 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 左列：屎山 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge color="red">❌ 屎山</Badge>
            <span className="text-xs text-gray-500">localStorage 直接读写</span>
          </div>
          <BadSide key={slug} slug={slug} />
        </div>

        {/* 右列：优雅 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge color="green">✅ 优雅</Badge>
            <span className="text-xs text-gray-500">TenantStorage 自动隔离</span>
          </div>
          <GoodSide key={slug} slug={slug} />
        </div>
      </div>

      {/* 底部说明 */}
      <div className="mt-8 rounded-xl border border-gray-700/40 bg-gray-800/20 p-4">
        <p className="text-xs text-gray-500 mb-2 font-medium">原理</p>
        <p className="text-xs text-gray-600 leading-relaxed">
          <span className="text-red-400">屎山</span>：所有租户共用同一个 key{" "}
          <code className="bg-gray-800 px-1 rounded text-red-300">"orders"</code>
          ，切换租户时旧数据还留在 localStorage，新租户直接读到了别人的数据。
        </p>
        <p className="text-xs text-gray-600 leading-relaxed mt-2">
          <span className="text-green-400">优雅</span>：
          <code className="bg-gray-800 px-1 rounded text-green-300">TenantStorage</code> 内部把 key
          加上租户前缀——
          <code className="bg-gray-800 px-1 rounded text-gray-400">tenant:acme:orders</code> vs{" "}
          <code className="bg-gray-800 px-1 rounded text-gray-400">tenant:globex:orders</code>
          ——物理上就是两个不同的 key，天然不会互相污染。
        </p>
      </div>
    </div>
  );
}
