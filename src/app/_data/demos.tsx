"use client";

import { useState, useEffect } from "react";

const demos: Record<string, () => JSX.Element> = {
  onion: function OnionDemo() {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">洋葱模型：请求从外到内，响应从内到外</div>
        <div className="relative w-48 h-48 mx-auto">
          {["日志", "埋点", "缓存", "请求"].map((label, i) => (
            <div
              key={i}
              className={`absolute rounded-full border-2 flex items-center justify-center
            ${i === 0 ? "inset-0 border-red-400" : ""}
            ${i === 1 ? "inset-4 border-yellow-400" : ""}
            ${i === 2 ? "inset-8 border-green-400" : ""}
            ${i === 3 ? "inset-12 border-blue-400 bg-blue-900/30" : ""}`}
            >
              {i === 3 && <span className="text-xs">{label}</span>}
            </div>
          ))}
          <div className="absolute -right-20 top-1/2 text-xs text-gray-400">→ 请求方向</div>
          <div className="absolute -left-20 top-1/2 text-xs text-gray-400">← 响应方向</div>
        </div>
        <p className="text-sm text-gray-400">✅ 每层中间件可以：前置处理 → 调用next → 后置处理</p>
      </div>
    );
  },
  ioc: function IocDemo() {
    return (
      <div className="space-y-3 text-sm">
        <div className="text-gray-400">传统方式：组件自己创建依赖</div>
        <div className="bg-red-900/20 p-3 rounded border border-red-500/30">
          <code>const service = new UserService(new Http(), new Cache())</code>
        </div>
        <div className="text-gray-400">IoC方式：容器注入依赖</div>
        <div className="bg-green-900/20 p-3 rounded border border-green-500/30">
          <code>const service = container.resolve(Tokens.UserService)</code>
        </div>
        <p className="text-gray-400">✅ 解耦、易测试、易替换</p>
      </div>
    );
  },
  ratelimit: function RateLimitDemo() {
    const [tokens, setTokens] = useState(5);
    return (
      <div className="space-y-3">
        <div className="text-sm text-gray-400">令牌桶：每秒补充令牌，允许突发</div>
        <div className="flex gap-1">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded ${i < tokens ? "bg-green-500" : "bg-gray-700"}`}
              />
            ))}
        </div>
        <button
          onClick={() => setTokens((t) => Math.max(0, t - 1))}
          className="px-4 py-2 bg-blue-600 rounded"
        >
          消耗令牌
        </button>
        <button onClick={() => setTokens(5)} className="px-4 py-2 bg-gray-700 rounded ml-2">
          重置
        </button>
        <p className="text-sm text-gray-400">✅ 允许突发流量 + 平滑限流</p>
      </div>
    );
  },
  plugin: function PluginDemo() {
    return (
      <div className="space-y-3">
        <div className="text-sm text-gray-400">插件生命周期</div>
        <div className="flex gap-2">
          {["install", "activate", "running", "deactivate", "uninstall"].map((s, i) => (
            <div key={s} className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xs
              ${i === 2 ? "bg-green-600" : "bg-gray-700"}`}
              >
                {i + 1}
              </div>
              <span className="text-xs mt-1">{s}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-400">✅ 宿主稳定，功能通过插件扩展</p>
      </div>
    );
  },
  "price-engine": function PriceEngineDemo() {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
            规则引擎
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            策略模式
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
            优先级调度
          </span>
        </div>
        <div className="bg-gray-800/60 rounded-lg border border-gray-700/60 p-4 space-y-3">
          <p className="text-sm text-gray-300 font-medium">规则执行链（按 priority 升序）</p>
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {[
              {
                icon: "⚡",
                name: "FlashSale",
                p: 5,
                color: "text-red-400 border-red-500/40 bg-red-500/10",
              },
              {
                icon: "👑",
                name: "Member",
                p: 10,
                color: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
              },
              {
                icon: "🎁",
                name: "FullReduction",
                p: 20,
                color: "text-blue-400 border-blue-500/40 bg-blue-500/10",
              },
              {
                icon: "🎫",
                name: "Coupon",
                p: 30,
                color: "text-green-400 border-green-500/40 bg-green-500/10",
              },
              {
                icon: "📍",
                name: "Region",
                p: 40,
                color: "text-purple-400 border-purple-500/40 bg-purple-500/10",
              },
            ].map((r, i, arr) => (
              <div key={r.name} className="flex items-center gap-1.5">
                <span className={`px-2 py-1 rounded border font-mono ${r.color}`}>
                  {r.icon} P{r.p} {r.name}
                </span>
                {i < arr.length - 1 && <span className="text-gray-600">→</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            每条规则自治：<code className="bg-gray-700 px-1 rounded">isApplicable()</code>{" "}
            判断是否触发，
            <code className="bg-gray-700 px-1 rounded">apply()</code> 返回折扣明细。 新增规则只需{" "}
            <code className="bg-gray-700 px-1 rounded">engine.register(new XxxRule())</code>
            ，无需改引擎代码。
          </p>
        </div>
        <a
          href="/demos/price-engine"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-gradient-to-r from-green-600/80 to-emerald-600/80 hover:from-green-500/80 hover:to-emerald-500/80 text-white font-medium text-sm transition-all border border-green-500/30 hover:border-green-400/50 hover:shadow-lg hover:shadow-green-500/10"
        >
          <span>💰</span>
          <span>进入完整 Demo — 实时调整优惠规则</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    );
  },
  seckill: function SeckillDemo() {
    const [count, setCount] = useState(10);
    const [status, setStatus] = useState<"countdown" | "ready" | "processing">("countdown");

    useEffect(() => {
      if (count > 0) {
        const t = setTimeout(() => setCount((c) => c - 1), 1000);
        return () => clearTimeout(t);
      } else {
        setStatus("ready");
      }
    }, [count]);

    return (
      <div className="space-y-3 text-center">
        {status === "countdown" && (
          <div className="text-3xl font-bold text-yellow-400">{count}s</div>
        )}
        {status === "ready" && (
          <button
            onClick={() => setStatus("processing")}
            className="px-8 py-4 bg-red-600 rounded-lg text-xl animate-pulse"
          >
            立即抢购
          </button>
        )}
        {status === "processing" && <div className="text-blue-400">排队中，前方还有 128 人...</div>}
        <p className="text-sm text-gray-400">✅ 服务器时间同步 + 排队机制</p>
      </div>
    );
  },
  realtime: function RealtimeDemo() {
    const [stocks] = useState([
      { symbol: "AAPL", price: 178.52, change: 2.3 },
      { symbol: "GOOGL", price: 141.8, change: -0.8 },
      { symbol: "TSLA", price: 248.5, change: 5.2 },
    ]);
    const [connected] = useState(true);

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-xs">{connected ? "WebSocket 已连接" : "断线重连中..."}</span>
        </div>
        <div className="space-y-1">
          {stocks.map((s) => (
            <div key={s.symbol} className="flex justify-between text-sm">
              <span>{s.symbol}</span>
              <span className={s.change >= 0 ? "text-green-400" : "text-red-400"}>
                ${s.price} ({s.change >= 0 ? "+" : ""}
                {s.change}%)
              </span>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-400">✅ 心跳检测 + 断线重连 + 批量更新</p>
      </div>
    );
  },
  "sku-selector": function SkuSelectorDemo() {
    const [selected, setSelected] = useState<Record<string, string>>({});
    const specs = [
      { id: "color", name: "颜色", values: ["红", "蓝", "黑"] },
      { id: "size", name: "尺寸", values: ["S", "M", "L"] },
    ];

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">SKU选择器：动态计算可选路径</div>
        {specs.map((spec) => (
          <div key={spec.id} className="space-y-2">
            <div className="text-sm font-medium">{spec.name}</div>
            <div className="flex gap-2">
              {spec.values.map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    setSelected((s) => ({ ...s, [spec.id]: s[spec.id] === v ? "" : v }))
                  }
                  className={`px-3 py-1 rounded border text-sm
                    ${
                      selected[spec.id] === v
                        ? "border-blue-500 bg-blue-900/30"
                        : "border-gray-600 hover:border-gray-400"
                    }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="text-sm text-gray-400">
          已选: {Object.values(selected).filter(Boolean).join(" / ") || "未选择"}
        </div>
        <p className="text-sm text-gray-400">✅ 图论路径搜索 + 状态矩阵</p>
      </div>
    );
  },
  "coupon-stack": function CouponStackDemo() {
    const [coupons, setCoupons] = useState<string[]>([]);
    const couponList = [
      { id: "full", name: "满100减20", type: "满减" },
      { id: "discount", name: "8折券", type: "折扣" },
      { id: "shipping", name: "包邮券", type: "运费" },
    ];

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">选择优惠券（自动判断互斥/叠加）</div>
        <div className="space-y-2">
          {couponList.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                setCoupons((cs) =>
                  cs.includes(c.id) ? cs.filter((x) => x !== c.id) : [...cs, c.id],
                )
              }
              className={`w-full p-2 rounded border text-left text-sm
                ${
                  coupons.includes(c.id)
                    ? "border-green-500 bg-green-900/30"
                    : "border-gray-600 hover:border-gray-400"
                }`}
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-gray-400 ml-2">({c.type})</span>
            </button>
          ))}
        </div>
        <div className="text-sm">
          已选 {coupons.length} 张，预计优惠 ¥{coupons.length * 20}
        </div>
        <p className="text-sm text-gray-400">✅ 规则引擎 + 策略模式</p>
      </div>
    );
  },
  "inventory-lock": function InventoryLockDemo() {
    const [stock, setStock] = useState(10);
    const [locked, setLocked] = useState(0);

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">库存预占演示</div>
        <div className="flex gap-4 items-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">{stock - locked}</div>
            <div className="text-xs text-gray-400">可购买</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">{locked}</div>
            <div className="text-xs text-gray-400">预占中</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-400">{stock}</div>
            <div className="text-xs text-gray-400">总库存</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setLocked((l) => Math.min(l + 1, stock))}
            className="px-4 py-2 bg-blue-600 rounded text-sm"
          >
            锁定1件
          </button>
          <button
            onClick={() => {
              setStock((s) => s - locked);
              setLocked(0);
            }}
            className="px-4 py-2 bg-green-600 rounded text-sm"
            disabled={locked === 0}
          >
            确认购买
          </button>
          <button
            onClick={() => setLocked(0)}
            className="px-4 py-2 bg-gray-600 rounded text-sm"
            disabled={locked === 0}
          >
            释放库存
          </button>
        </div>
        <p className="text-sm text-gray-400">✅ 乐观锁 + 超时自动释放</p>
      </div>
    );
  },
  "account-freeze": function AccountFreezeDemo() {
    const [balance, setBalance] = useState(1000);
    const [frozen, setFrozen] = useState(0);

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">账户余额操作演示</div>
        <div className="p-4 bg-gray-800 rounded-lg space-y-2">
          <div className="flex justify-between">
            <span>可用余额</span>
            <span className="text-green-400 font-bold">¥{balance.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>冻结金额</span>
            <span className="text-orange-400">¥{frozen.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-700 pt-2">
            <span>总资产</span>
            <span>¥{(balance + frozen).toFixed(2)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setBalance((b) => b - 100);
              setFrozen((f) => f + 100);
            }}
            className="px-3 py-1 bg-blue-600 rounded text-sm"
            disabled={balance < 100}
          >
            冻结¥100
          </button>
          <button
            onClick={() => {
              setFrozen(0);
            }}
            className="px-3 py-1 bg-gray-600 rounded text-sm"
            disabled={frozen === 0}
          >
            解冻全部
          </button>
          <button
            onClick={() => {
              setFrozen(0);
            }}
            className="px-3 py-1 bg-green-600 rounded text-sm"
            disabled={frozen === 0}
          >
            扣款确认
          </button>
        </div>
        <p className="text-sm text-gray-400">✅ 状态机 + 幂等性保证</p>
      </div>
    );
  },
  "distributed-id": function DistributedIdDemo() {
    const [ids, setIds] = useState<string[]>([]);

    const generateId = () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 6);
      return `ORD${timestamp}${random}`.toUpperCase();
    };

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">雪花算法ID生成演示</div>
        <button
          onClick={() => setIds((ids) => [generateId(), ...ids.slice(0, 5)])}
          className="px-4 py-2 bg-blue-600 rounded"
        >
          生成ID
        </button>
        <div className="space-y-1">
          {ids.map((id, i) => (
            <div key={i} className="text-sm font-mono bg-gray-800 p-2 rounded">
              {id}
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-400">时间戳(41bit) + 机器ID(10bit) + 序列号(12bit)</div>
        <p className="text-sm text-gray-400">✅ 全局唯一 + 时间有序</p>
      </div>
    );
  },
  "quote-merge": function QuoteMergeDemo() {
    const [updates, setUpdates] = useState(0);
    const [renders, setRenders] = useState(0);

    useEffect(() => {
      const timer = setInterval(() => {
        setUpdates((u) => u + Math.floor(Math.random() * 10) + 1);
      }, 100);
      return () => clearInterval(timer);
    }, []);

    useEffect(() => {
      const timer = setInterval(() => {
        setRenders((r) => r + 1);
      }, 50);
      return () => clearInterval(timer);
    }, []);

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">高频数据合并演示</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-red-900/20 rounded">
            <div className="text-2xl font-bold text-red-400">{updates}</div>
            <div className="text-xs text-gray-400">推送次数/秒</div>
          </div>
          <div className="text-center p-4 bg-green-900/20 rounded">
            <div className="text-2xl font-bold text-green-400">{renders}</div>
            <div className="text-xs text-gray-400">渲染次数/秒</div>
          </div>
        </div>
        <div className="text-sm text-gray-400">推送:渲染比例 ≈ 2:1（合并后减少50%渲染）</div>
        <p className="text-sm text-gray-400">✅ 数据合并 + 批量更新</p>
      </div>
    );
  },
  "data-permission": function DataPermissionDemo() {
    const [role, setRole] = useState<"admin" | "manager" | "sales">("sales");

    const permissions = {
      admin: { scope: "全部数据", fields: "全部字段", masked: "无" },
      manager: { scope: "部门数据", fields: "全部字段", masked: "手机号" },
      sales: { scope: "个人数据", fields: "部分字段", masked: "手机号/邮箱/身份证" },
    };

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">数据权限过滤演示</div>
        <div className="flex gap-2">
          {(["admin", "manager", "sales"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-4 py-2 rounded text-sm
                ${role === r ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
            >
              {r === "admin" ? "管理员" : r === "manager" ? "经理" : "销售"}
            </button>
          ))}
        </div>
        <div className="p-4 bg-gray-800 rounded space-y-2 text-sm">
          <div className="flex justify-between">
            <span>数据范围</span>
            <span className="text-blue-400">{permissions[role].scope}</span>
          </div>
          <div className="flex justify-between">
            <span>可见字段</span>
            <span className="text-green-400">{permissions[role].fields}</span>
          </div>
          <div className="flex justify-between">
            <span>脱敏字段</span>
            <span className="text-orange-400">{permissions[role].masked}</span>
          </div>
        </div>
        <p className="text-sm text-gray-400">✅ 策略模式 + AOP切面</p>
      </div>
    );
  },
  "audit-trail": function AuditTrailDemo() {
    const [logs, setLogs] = useState<{ action: string; time: string; user: string }[]>([]);

    const addLog = (action: string) => {
      setLogs((logs) =>
        [
          {
            action,
            time: new Date().toLocaleTimeString(),
            user: "当前用户",
          },
          ...logs,
        ].slice(0, 5),
      );
    };

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">操作审计追踪演示</div>
        <div className="flex gap-2">
          <button
            onClick={() => addLog("创建订单")}
            className="px-3 py-1 bg-blue-600 rounded text-sm"
          >
            创建
          </button>
          <button
            onClick={() => addLog("修改价格")}
            className="px-3 py-1 bg-yellow-600 rounded text-sm"
          >
            修改
          </button>
          <button
            onClick={() => addLog("删除订单")}
            className="px-3 py-1 bg-red-600 rounded text-sm"
          >
            删除
          </button>
          <button
            onClick={() => addLog("导出数据")}
            className="px-3 py-1 bg-gray-600 rounded text-sm"
          >
            导出
          </button>
        </div>
        <div className="space-y-2">
          {logs.map((log, i) => (
            <div key={i} className="flex justify-between text-sm p-2 bg-gray-800 rounded">
              <span>{log.action}</span>
              <span className="text-gray-400">
                {log.time} - {log.user}
              </span>
            </div>
          ))}
          {logs.length === 0 && <div className="text-sm text-gray-500">暂无操作记录</div>}
        </div>
        <p className="text-sm text-gray-400">✅ 装饰器模式 + 链路追踪</p>
      </div>
    );
  },
  "multi-tenant": function MultiTenantDemo() {
    const [tenant, setTenant] = useState<"A" | "B" | "C">("A");

    const tenants = {
      A: { name: "企业A", color: "#3b82f6", users: 100, storage: "50GB" },
      B: { name: "企业B", color: "#10b981", users: 50, storage: "30GB" },
      C: { name: "企业C", color: "#f59e0b", users: 20, storage: "10GB" },
    };

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">多租户隔离演示</div>
        <div className="flex gap-2">
          {(["A", "B", "C"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTenant(t)}
              style={{ backgroundColor: tenant === t ? tenants[t].color : "#374151" }}
              className="px-4 py-2 rounded text-sm text-white"
            >
              租户{t}
            </button>
          ))}
        </div>
        <div className="p-4 rounded" style={{ backgroundColor: `${tenants[tenant].color}20` }}>
          <div className="font-bold text-lg" style={{ color: tenants[tenant].color }}>
            {tenants[tenant].name}
          </div>
          <div className="text-sm text-gray-400 mt-2">
            用户数: {tenants[tenant].users} | 存储: {tenants[tenant].storage}
          </div>
        </div>
        <p className="text-sm text-gray-400">✅ 上下文传播 + 数据路由</p>
      </div>
    );
  },
  default: () => <div className="text-gray-400 text-sm">详细代码请查看「优雅设计」标签</div>,
};

export { demos };
