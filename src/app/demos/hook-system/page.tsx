"use client";

import { useState, useRef, useCallback } from "react";
import {
  SyncHook,
  SyncWaterfallHook,
  SyncBailHook,
  AsyncSeriesHook,
} from "@/hook-system/Hookable";

// ==================== 模拟订单系统 ====================

interface Order {
  id: string;
  amount: number;
  userId: string;
  status: "pending" | "validated" | "paid" | "failed";
  logs: string[];
}

/**
 * 订单服务 - 使用 Hook 系统实现可扩展的订单处理流程
 */
class OrderService {
  // 定义钩子
  hooks = {
    /** 订单创建前（可修改订单数据） */
    beforeCreate: new SyncWaterfallHook<Order>(),
    /** 订单验证（任一返回 string 则验证失败） */
    validate: new SyncBailHook<[Order], string>(),
    /** 订单创建后 */
    afterCreate: new SyncHook<[Order]>(),
    /** 支付流程（异步串行） */
    payment: new AsyncSeriesHook<[Order]>(),
  };

  async createOrder(data: Omit<Order, "status" | "logs">): Promise<Order> {
    let order: Order = {
      ...data,
      status: "pending",
      logs: [`[${this.now()}] 订单创建开始`],
    };

    // 1. beforeCreate 钩子（瀑布流，可修改数据）
    order = this.hooks.beforeCreate.call(order);
    order.logs.push(`[${this.now()}] beforeCreate 钩子执行完毕`);

    // 2. validate 钩子（熔断，返回错误信息则失败）
    const validationError = this.hooks.validate.call(order);
    if (validationError) {
      order.status = "failed";
      order.logs.push(`[${this.now()}] 验证失败: ${validationError}`);
      return order;
    }
    order.status = "validated";
    order.logs.push(`[${this.now()}] 验证通过`);

    // 3. afterCreate 钩子
    this.hooks.afterCreate.call(order);
    order.logs.push(`[${this.now()}] afterCreate 钩子执行完毕`);

    // 4. payment 钩子（异步）
    try {
      await this.hooks.payment.call(order);
      order.status = "paid";
      order.logs.push(`[${this.now()}] 支付流程完成`);
    } catch (e) {
      order.status = "failed";
      order.logs.push(`[${this.now()}] 支付失败: ${(e as Error).message}`);
    }

    return order;
  }

  private now() {
    return new Date().toLocaleTimeString();
  }
}

// ==================== 页面组件 ====================

export default function HookSystemPage() {
  const orderServiceRef = useRef<OrderService | null>(null);
  const [enabledPlugins, setEnabledPlugins] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<Order | null>(null);
  const [hookInfo, setHookInfo] = useState<Record<string, { type: string; taps: string[] }>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // 初始化 OrderService 并注册插件
  const getOrderService = useCallback(() => {
    const service = new OrderService();

    // 根据启用的插件注册钩子
    if (enabledPlugins.has("discount")) {
      service.hooks.beforeCreate.tap({ name: "DiscountPlugin", priority: 10 }, (order) => {
        if (order.amount >= 100) {
          order.logs.push(`[DiscountPlugin] 满100减10，原价 ${order.amount}`);
          return { ...order, amount: order.amount - 10 };
        }
        return order;
      });
    }

    if (enabledPlugins.has("vip-discount")) {
      service.hooks.beforeCreate.tap({ name: "VIPPlugin", priority: 20 }, (order) => {
        if (order.userId.startsWith("vip_")) {
          order.logs.push(`[VIPPlugin] VIP 用户 9 折，原价 ${order.amount}`);
          return { ...order, amount: Math.round(order.amount * 0.9) };
        }
        return order;
      });
    }

    if (enabledPlugins.has("limit-check")) {
      service.hooks.validate.tap("LimitPlugin", (order) => {
        if (order.amount > 500) {
          return "单笔订单不能超过 500 元";
        }
        return undefined;
      });
    }

    if (enabledPlugins.has("blacklist")) {
      service.hooks.validate.tap({ name: "BlacklistPlugin", priority: 5 }, (order) => {
        if (order.userId === "banned_user") {
          return "用户已被封禁";
        }
        return undefined;
      });
    }

    if (enabledPlugins.has("notify")) {
      service.hooks.afterCreate.tap("NotifyPlugin", (order) => {
        order.logs.push(`[NotifyPlugin] 发送通知给用户 ${order.userId}`);
      });
    }

    if (enabledPlugins.has("analytics")) {
      service.hooks.afterCreate.tap("AnalyticsPlugin", (order) => {
        order.logs.push(`[AnalyticsPlugin] 上报埋点数据`);
      });
    }

    if (enabledPlugins.has("payment-log")) {
      service.hooks.payment.tap("PaymentLogPlugin", async (order) => {
        order.logs.push(`[PaymentLogPlugin] 记录支付日志`);
        await new Promise((r) => setTimeout(r, 200));
      });
    }

    if (enabledPlugins.has("risk-check")) {
      service.hooks.payment.tap({ name: "RiskPlugin", priority: 5 }, async (order) => {
        order.logs.push(`[RiskPlugin] 风控检查中...`);
        await new Promise((r) => setTimeout(r, 300));
        if (order.amount > 300) {
          order.logs.push(`[RiskPlugin] 大额订单，需人工审核`);
        }
      });
    }

    orderServiceRef.current = service;
    return service;
  }, [enabledPlugins]);

  // 更新钩子信息显示
  const updateHookInfo = useCallback(() => {
    const service = getOrderService();
    const info: Record<string, { type: string; taps: string[] }> = {};
    for (const [name, hook] of Object.entries(service.hooks)) {
      info[name] = {
        type: hook.constructor.name,
        taps: hook.getTaps().map((t) => `${t.name} (p:${t.priority})`),
      };
    }
    setHookInfo(info);
  }, [getOrderService]);

  // 切换插件
  const togglePlugin = (id: string) => {
    setEnabledPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 创建订单
  const handleCreateOrder = async (userId: string, amount: number) => {
    setIsProcessing(true);
    const service = getOrderService();
    updateHookInfo();

    const result = await service.createOrder({
      id: `ORD_${Date.now()}`,
      amount,
      userId,
    });

    setOrder(result);
    setIsProcessing(false);
  };

  // 插件列表
  const plugins = [
    { id: "discount", name: "满减插件", hook: "beforeCreate", desc: "满100减10" },
    { id: "vip-discount", name: "VIP折扣", hook: "beforeCreate", desc: "VIP用户9折" },
    { id: "limit-check", name: "限额检查", hook: "validate", desc: "单笔不超500" },
    { id: "blacklist", name: "黑名单", hook: "validate", desc: "封禁用户拦截" },
    { id: "notify", name: "通知插件", hook: "afterCreate", desc: "发送用户通知" },
    { id: "analytics", name: "埋点插件", hook: "afterCreate", desc: "上报分析数据" },
    { id: "risk-check", name: "风控检查", hook: "payment", desc: "大额订单审核" },
    { id: "payment-log", name: "支付日志", hook: "payment", desc: "记录支付流水" },
  ];

  // 测试场景
  const testCases = [
    { label: "普通订单 ¥50", userId: "user_001", amount: 50 },
    { label: "满减订单 ¥120", userId: "user_002", amount: 120 },
    { label: "VIP 订单 ¥200", userId: "vip_001", amount: 200 },
    { label: "超限订单 ¥600", userId: "user_003", amount: 600 },
    { label: "封禁用户", userId: "banned_user", amount: 100 },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">🪝 Hook 系统</h1>
      <p className="text-sm text-gray-500 mb-6">
        通过钩子实现插件化架构，业务流程可扩展、可定制，无需修改核心代码。
      </p>

      <div className="grid grid-cols-3 gap-6">
        {/* 左侧：插件配置 */}
        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">插件列表</h3>
            <div className="space-y-2">
              {plugins.map((plugin) => (
                <label
                  key={plugin.id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                    enabledPlugins.has(plugin.id)
                      ? "bg-blue-500/10 border border-blue-500/30"
                      : "hover:bg-gray-700/30 border border-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={enabledPlugins.has(plugin.id)}
                    onChange={() => togglePlugin(plugin.id)}
                    className="w-4 h-4 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200">{plugin.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      <span className="text-blue-400">{plugin.hook}</span> · {plugin.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 钩子状态 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">钩子状态</h3>
            <div className="space-y-2 font-mono text-xs">
              {Object.entries(hookInfo).map(([name, info]) => (
                <div key={name}>
                  <div className="text-blue-400">{name}</div>
                  <div className="text-gray-500 text-[10px]">{info.type}</div>
                  {info.taps.length > 0 ? (
                    info.taps.map((tap, i) => (
                      <div key={i} className="pl-3 text-gray-400">
                        └ {tap}
                      </div>
                    ))
                  ) : (
                    <div className="pl-3 text-gray-600">└ (无)</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 中间：测试场景 */}
        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">测试场景</h3>
            <div className="space-y-2">
              {testCases.map((tc) => (
                <button
                  key={tc.label}
                  onClick={() => handleCreateOrder(tc.userId, tc.amount)}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 rounded-lg text-sm text-left bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 transition-colors disabled:opacity-50"
                >
                  {tc.label}
                  <span className="text-xs text-gray-500 ml-2">({tc.userId})</span>
                </button>
              ))}
            </div>
          </div>

          {/* 订单结果 */}
          {order && (
            <div
              className={`rounded-xl p-4 border ${
                order.status === "paid"
                  ? "bg-green-500/10 border-green-500/30"
                  : order.status === "failed"
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-gray-800/50 border-gray-700/50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">订单结果</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    order.status === "paid"
                      ? "bg-green-500/20 text-green-400"
                      : order.status === "failed"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-gray-500/20 text-gray-400"
                  }`}
                >
                  {order.status}
                </span>
              </div>
              <div className="text-xs text-gray-400 space-y-0.5">
                <div>订单号: {order.id}</div>
                <div>用户: {order.userId}</div>
                <div>金额: ¥{order.amount}</div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：执行日志 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 h-fit">
          <h3 className="text-sm font-medium text-gray-300 mb-3">执行日志</h3>
          <div className="space-y-1 font-mono text-xs max-h-96 overflow-auto">
            {order?.logs.map((log, i) => (
              <div
                key={i}
                className={`${
                  log.includes("失败") || log.includes("封禁")
                    ? "text-red-400"
                    : log.includes("Plugin")
                      ? "text-blue-400"
                      : "text-gray-400"
                }`}
              >
                {log}
              </div>
            )) ?? <div className="text-gray-600">选择测试场景查看日志...</div>}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="mt-8 p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
        <h3 className="text-sm font-medium text-gray-300 mb-2">💡 架构要点</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>
            • <span className="text-gray-300">SyncWaterfallHook</span> - 瀑布流，数据依次变换（如折扣叠加）
          </li>
          <li>
            • <span className="text-gray-300">SyncBailHook</span> - 熔断，首个返回值即停止（如校验）
          </li>
          <li>
            • <span className="text-gray-300">AsyncSeriesHook</span> - 异步串行，依次执行（如支付流程）
          </li>
          <li>
            • <span className="text-gray-300">Priority</span> - 优先级控制执行顺序
          </li>
        </ul>
      </div>
    </div>
  );
}
