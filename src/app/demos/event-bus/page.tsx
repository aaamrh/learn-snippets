"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { EventBus } from "@/event-bus/EventBus";

// ==================== 事件类型定义 ====================

interface AppEvents {
  "user:login": { userId: string; name: string };
  "user:logout": { userId: string };
  "cart:add": { productId: string; name: string; price: number };
  "cart:remove": { productId: string };
  "order:created": { orderId: string; total: number };
  "notification:show": { type: "success" | "error" | "info"; message: string };
}

// ==================== 模拟组件 ====================

interface User {
  userId: string;
  name: string;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
}

// ==================== 页面组件 ====================

export default function EventBusPage() {
  const busRef = useRef(new EventBus<AppEvents>());
  const bus = busRef.current;

  // 模拟状态
  const [user, setUser] = useState<User | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notifications, setNotifications] = useState<{ id: number; type: string; message: string }[]>([]);
  const [eventHistory, setEventHistory] = useState<{ time: string; event: string; payload: string }[]>([]);
  const [subscribers, setSubscribers] = useState<{ event: string; count: number }[]>([]);
  const notificationIdRef = useRef(0);

  // 更新订阅者统计
  const updateSubscribers = useCallback(() => {
    const events = bus.eventNames();
    setSubscribers(events.map((e) => ({ event: String(e), count: bus.listenerCount(e) })));
  }, [bus]);

  // 添加事件历史
  const addHistory = useCallback((event: string, payload: unknown) => {
    setEventHistory((prev) => [
      {
        time: new Date().toLocaleTimeString(),
        event,
        payload: JSON.stringify(payload),
      },
      ...prev.slice(0, 19),
    ]);
  }, []);

  // 设置事件监听
  useEffect(() => {
    // 监听用户事件
    const loginSub = bus.on("user:login", (payload) => {
      setUser(payload);
      addHistory("user:login", payload);
    });

    const logoutSub = bus.on("user:logout", (payload) => {
      setUser(null);
      setCart([]);
      addHistory("user:logout", payload);
    });

    // 监听购物车事件
    const cartAddSub = bus.on("cart:add", (payload) => {
      setCart((prev) => [...prev, payload]);
      addHistory("cart:add", payload);
    });

    const cartRemoveSub = bus.on("cart:remove", (payload) => {
      setCart((prev) => prev.filter((item) => item.productId !== payload.productId));
      addHistory("cart:remove", payload);
    });

    // 监听订单事件
    const orderSub = bus.on("order:created", (payload) => {
      setCart([]);
      addHistory("order:created", payload);
      // 自动触发通知
      bus.emit("notification:show", {
        type: "success",
        message: `订单 ${payload.orderId} 创建成功，金额 ¥${payload.total}`,
      });
    });

    // 监听通知事件
    const notifySub = bus.on("notification:show", (payload) => {
      const id = ++notificationIdRef.current;
      setNotifications((prev) => [...prev, { id, ...payload }]);
      addHistory("notification:show", payload);
      // 3秒后自动移除
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 3000);
    });

    updateSubscribers();

    return () => {
      loginSub.unsubscribe();
      logoutSub.unsubscribe();
      cartAddSub.unsubscribe();
      cartRemoveSub.unsubscribe();
      orderSub.unsubscribe();
      notifySub.unsubscribe();
    };
  }, [bus, addHistory, updateSubscribers]);

  // 更新订阅者统计
  useEffect(() => {
    updateSubscribers();
  }, [user, cart, updateSubscribers]);

  // 模拟商品
  const products = [
    { id: "p1", name: "iPhone 15", price: 6999 },
    { id: "p2", name: "AirPods Pro", price: 1899 },
    { id: "p3", name: "MacBook Air", price: 8999 },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 通知区域 */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`px-4 py-2 rounded-lg shadow-lg text-sm animate-pulse ${
              n.type === "success"
                ? "bg-green-500 text-white"
                : n.type === "error"
                  ? "bg-red-500 text-white"
                  : "bg-blue-500 text-white"
            }`}
          >
            {n.message}
          </div>
        ))}
      </div>

      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">📡 事件总线</h1>
      <p className="text-sm text-gray-500 mb-6">
        类型安全的发布/订阅模式，解耦组件间通信，避免 props drilling。
      </p>

      <div className="grid grid-cols-3 gap-6">
        {/* 左侧：用户和商品 */}
        <div className="space-y-4">
          {/* 用户模块 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">👤 用户模块</h3>
            {user ? (
              <div className="space-y-3">
                <div className="text-sm text-gray-400">
                  已登录: <span className="text-green-400">{user.name}</span>
                </div>
                <button
                  onClick={() => bus.emit("user:logout", { userId: user.userId })}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30"
                >
                  退出登录
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() =>
                    bus.emit("user:login", { userId: "u1", name: "Alice" })
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                >
                  以 Alice 登录
                </button>
                <button
                  onClick={() =>
                    bus.emit("user:login", { userId: "u2", name: "Bob" })
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                >
                  以 Bob 登录
                </button>
              </div>
            )}
          </div>

          {/* 商品列表 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">🛍️ 商品列表</h3>
            <div className="space-y-2">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-gray-700/30"
                >
                  <div>
                    <div className="text-sm text-gray-300">{p.name}</div>
                    <div className="text-xs text-gray-500">¥{p.price}</div>
                  </div>
                  <button
                    onClick={() =>
                      bus.emit("cart:add", {
                        productId: p.id,
                        name: p.name,
                        price: p.price,
                      })
                    }
                    disabled={!user}
                    className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    加入购物车
                  </button>
                </div>
              ))}
            </div>
            {!user && (
              <div className="mt-2 text-xs text-gray-500">请先登录</div>
            )}
          </div>
        </div>

        {/* 中间：购物车和订单 */}
        <div className="space-y-4">
          {/* 购物车 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">
              🛒 购物车 ({cart.length})
            </h3>
            {cart.length > 0 ? (
              <>
                <div className="space-y-2 mb-3">
                  {cart.map((item, i) => (
                    <div
                      key={`${item.productId}-${i}`}
                      className="flex items-center justify-between p-2 rounded-lg bg-gray-700/30"
                    >
                      <div>
                        <div className="text-sm text-gray-300">{item.name}</div>
                        <div className="text-xs text-gray-500">¥{item.price}</div>
                      </div>
                      <button
                        onClick={() =>
                          bus.emit("cart:remove", { productId: item.productId })
                        }
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                  <span className="text-sm text-gray-400">
                    总计: ¥{cart.reduce((sum, item) => sum + item.price, 0)}
                  </span>
                  <button
                    onClick={() =>
                      bus.emit("order:created", {
                        orderId: `ORD_${Date.now()}`,
                        total: cart.reduce((sum, item) => sum + item.price, 0),
                      })
                    }
                    className="px-3 py-1.5 rounded-lg text-sm bg-green-500 text-white hover:bg-green-600"
                  >
                    下单
                  </button>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-600">购物车为空</div>
            )}
          </div>

          {/* 订阅者统计 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">📊 订阅者统计</h3>
            <div className="space-y-1 font-mono text-xs">
              {subscribers.map((s) => (
                <div key={s.event} className="flex justify-between">
                  <span className="text-blue-400">{s.event}</span>
                  <span className="text-gray-400">{s.count} 订阅者</span>
                </div>
              ))}
            </div>
          </div>

          {/* 手动触发 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">🔔 手动触发通知</h3>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  bus.emit("notification:show", { type: "success", message: "操作成功！" })
                }
                className="flex-1 px-2 py-1.5 rounded text-xs bg-green-500/20 text-green-400"
              >
                Success
              </button>
              <button
                onClick={() =>
                  bus.emit("notification:show", { type: "error", message: "出错了！" })
                }
                className="flex-1 px-2 py-1.5 rounded text-xs bg-red-500/20 text-red-400"
              >
                Error
              </button>
              <button
                onClick={() =>
                  bus.emit("notification:show", { type: "info", message: "提示信息" })
                }
                className="flex-1 px-2 py-1.5 rounded text-xs bg-blue-500/20 text-blue-400"
              >
                Info
              </button>
            </div>
          </div>
        </div>

        {/* 右侧：事件历史 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">📜 事件历史</h3>
          <div className="space-y-2 font-mono text-xs max-h-[500px] overflow-auto">
            {eventHistory.length > 0 ? (
              eventHistory.map((h, i) => (
                <div key={i} className="p-2 rounded bg-gray-900/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-500">{h.time}</span>
                    <span className="text-blue-400">{h.event}</span>
                  </div>
                  <div className="text-gray-500 text-[10px] break-all">{h.payload}</div>
                </div>
              ))
            ) : (
              <div className="text-gray-600">暂无事件...</div>
            )}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="mt-8 p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
        <h3 className="text-sm font-medium text-gray-300 mb-2">💡 架构要点</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• <span className="text-gray-300">类型安全</span> - 事件名和 payload 都有类型检查</li>
          <li>• <span className="text-gray-300">解耦</span> - 组件不直接依赖，通过事件通信</li>
          <li>• <span className="text-gray-300">命名空间</span> - 支持 "module:event" 格式</li>
          <li>• <span className="text-gray-300">事件历史</span> - 可追溯，便于调试</li>
        </ul>
      </div>
    </div>
  );
}
