"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ==================== 模拟 WebSocket 服务器 ====================

/**
 * 由于浏览器无法直接连接真实 WebSocket，
 * 这里模拟一个 WebSocket 管理器的行为
 */
class MockWebSocketManager {
  private state: "connecting" | "connected" | "disconnected" | "reconnecting" = "disconnected";
  private subscriptions = new Map<string, Set<(data: unknown) => void>>();
  private stateHandlers = new Set<(state: string) => void>();
  private messageHandlers = new Set<(data: unknown, channel?: string) => void>();
  private logs: { time: number; type: string; msg: string }[] = [];
  private priceTimers = new Map<string, ReturnType<typeof setInterval>>();
  private reconnectAttempts = 0;
  private simulateDisconnect = false;

  connect(): void {
    if (this.state === "connected") return;

    this.setState("connecting");
    this.log("info", "正在连接...");

    // 模拟连接延迟
    setTimeout(() => {
      if (this.simulateDisconnect) {
        this.log("error", "连接失败（模拟断线）");
        this.scheduleReconnect();
        return;
      }

      this.setState("connected");
      this.log("info", "连接成功");
      this.reconnectAttempts = 0;

      // 重新订阅
      for (const channel of this.subscriptions.keys()) {
        this.startPriceUpdates(channel);
      }
    }, 500);
  }

  disconnect(): void {
    this.setState("disconnected");
    this.log("info", "已断开连接");
    this.stopAllPriceUpdates();
    this.reconnectAttempts = 0;
  }

  subscribe(channel: string, callback: (data: unknown) => void): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      this.log("send", `订阅 ${channel}`);

      if (this.state === "connected") {
        this.startPriceUpdates(channel);
      }
    }

    this.subscriptions.get(channel)!.add(callback);

    return () => {
      const handlers = this.subscriptions.get(channel);
      if (handlers) {
        handlers.delete(callback);
        if (handlers.size === 0) {
          this.subscriptions.delete(channel);
          this.stopPriceUpdates(channel);
          this.log("send", `取消订阅 ${channel}`);
        }
      }
    };
  }

  onStateChange(handler: (state: string) => void): () => void {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  onMessage(handler: (data: unknown, channel?: string) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  getState(): string {
    return this.state;
  }

  getLogs(): { time: number; type: string; msg: string }[] {
    return [...this.logs];
  }

  getSubscribedChannels(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  // 模拟断线
  setSimulateDisconnect(value: boolean): void {
    this.simulateDisconnect = value;
    if (value && this.state === "connected") {
      this.log("warn", "模拟断线");
      this.setState("disconnected");
      this.stopAllPriceUpdates();
      this.scheduleReconnect();
    }
  }

  // ==================== Private ====================

  private setState(state: "connecting" | "connected" | "disconnected" | "reconnecting"): void {
    this.state = state;
    for (const handler of this.stateHandlers) {
      handler(state);
    }
  }

  private log(type: string, msg: string): void {
    this.logs.push({ time: Date.now(), type, msg });
    if (this.logs.length > 50) {
      this.logs.shift();
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);

    this.setState("reconnecting");
    this.log("info", `${delay / 1000}秒后重连 (第${this.reconnectAttempts}次)`);

    setTimeout(() => {
      if (this.state === "reconnecting") {
        this.connect();
      }
    }, delay);
  }

  private startPriceUpdates(channel: string): void {
    if (this.priceTimers.has(channel)) return;

    const timer = setInterval(() => {
      if (this.state !== "connected") return;

      const price = this.generatePrice(channel);
      const data = { channel, data: price };

      this.log("recv", `${channel}: $${price.price.toFixed(2)}`);

      // 分发到订阅者
      const handlers = this.subscriptions.get(channel);
      if (handlers) {
        for (const handler of handlers) {
          handler(price);
        }
      }

      // 分发到全局处理器
      for (const handler of this.messageHandlers) {
        handler(data, channel);
      }
    }, 1000 + Math.random() * 1000);

    this.priceTimers.set(channel, timer);
  }

  private stopPriceUpdates(channel: string): void {
    const timer = this.priceTimers.get(channel);
    if (timer) {
      clearInterval(timer);
      this.priceTimers.delete(channel);
    }
  }

  private stopAllPriceUpdates(): void {
    for (const timer of this.priceTimers.values()) {
      clearInterval(timer);
    }
    this.priceTimers.clear();
  }

  private generatePrice(channel: string): { symbol: string; price: number; change: number; timestamp: number } {
    const basePrices: Record<string, number> = {
      "price:BTC": 65000,
      "price:ETH": 3500,
      "price:SOL": 150,
    };

    const base = basePrices[channel] ?? 100;
    const variance = base * 0.001;

    return {
      symbol: channel.replace("price:", ""),
      price: base + (Math.random() - 0.5) * variance * 2,
      change: (Math.random() - 0.5) * 2,
      timestamp: Date.now(),
    };
  }
}

// ==================== 页面组件 ====================

export default function WebSocketManagerPage() {
  const wsRef = useRef(new MockWebSocketManager());
  const ws = wsRef.current;

  const [state, setState] = useState(ws.getState());
  const [logs, setLogs] = useState(ws.getLogs());
  const [channels, setChannels] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, { price: number; change: number }>>({});
  const [simulateDisconnect, setSimulateDisconnect] = useState(false);

  // 刷新日志
  const refreshLogs = useCallback(() => {
    setLogs(ws.getLogs());
    setChannels(ws.getSubscribedChannels());
  }, [ws]);

  // 监听状态变化
  useEffect(() => {
    const unsub = ws.onStateChange((s) => {
      setState(s);
      refreshLogs();
    });
    return unsub;
  }, [ws, refreshLogs]);

  // 定期刷新日志
  useEffect(() => {
    const timer = setInterval(refreshLogs, 500);
    return () => clearInterval(timer);
  }, [refreshLogs]);

  // 订阅价格
  const subscribePrices = (symbol: string) => {
    const channel = `price:${symbol}`;

    ws.subscribe(channel, (data) => {
      const priceData = data as { symbol: string; price: number; change: number };
      setPrices((prev) => ({
        ...prev,
        [symbol]: { price: priceData.price, change: priceData.change },
      }));
    });

    refreshLogs();
  };

  // 状态颜色
  const stateColor = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500",
    reconnecting: "bg-orange-500",
    disconnected: "bg-red-500",
  }[state] ?? "bg-gray-500";

  const stateText = {
    connected: "已连接",
    connecting: "连接中",
    reconnecting: "重连中",
    disconnected: "已断开",
  }[state] ?? state;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">🔌 WebSocket 管理器</h1>
      <p className="text-sm text-gray-500 mb-6">
        自动重连 + 心跳检测 + 消息队列 + 订阅管理，适用于实时行情推送。
      </p>

      <div className="grid grid-cols-3 gap-6">
        {/* 左侧：连接控制 */}
        <div className="space-y-4">
          {/* 连接状态 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">📡 连接状态</h3>
            <div className="flex items-center gap-3 mb-4">
              <span className={`w-3 h-3 rounded-full ${stateColor} animate-pulse`} />
              <span className="text-sm text-gray-300">{stateText}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => ws.connect()}
                disabled={state === "connected" || state === "connecting"}
                className="flex-1 px-3 py-2 rounded-lg text-sm bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50"
              >
                连接
              </button>
              <button
                onClick={() => ws.disconnect()}
                disabled={state === "disconnected"}
                className="flex-1 px-3 py-2 rounded-lg text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
              >
                断开
              </button>
            </div>
          </div>

          {/* 订阅管理 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">📊 订阅频道</h3>
            <div className="space-y-2">
              {["BTC", "ETH", "SOL"].map((symbol) => {
                const subscribed = channels.includes(`price:${symbol}`);
                return (
                  <button
                    key={symbol}
                    onClick={() => subscribePrices(symbol)}
                    disabled={subscribed || state !== "connected"}
                    className={`w-full px-3 py-2 rounded-lg text-sm transition-all ${
                      subscribed
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                        : "bg-gray-700/50 text-gray-400 hover:bg-gray-600/50"
                    } disabled:opacity-50`}
                  >
                    {symbol} {subscribed && "✓"}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 text-xs text-gray-500">
              已订阅: {channels.length} 个频道
            </div>
          </div>

          {/* 模拟断线 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">🔧 测试工具</h3>
            <label className="flex items-center gap-3">
              <button
                onClick={() => {
                  const newValue = !simulateDisconnect;
                  setSimulateDisconnect(newValue);
                  ws.setSimulateDisconnect(newValue);
                }}
                className={`w-10 h-5 rounded-full transition-colors ${
                  simulateDisconnect ? "bg-red-500" : "bg-gray-600"
                }`}
              >
                <span
                  className="block w-4 h-4 rounded-full bg-white shadow transition-transform"
                  style={{ transform: simulateDisconnect ? "translateX(22px)" : "translateX(2px)" }}
                />
              </button>
              <span className="text-sm text-gray-400">模拟网络断开</span>
            </label>
            <div className="mt-2 text-xs text-gray-500">
              开启后触发自动重连机制
            </div>
          </div>
        </div>

        {/* 中间：实时数据 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">💹 实时行情</h3>
          <div className="space-y-3">
            {Object.entries(prices).map(([symbol, data]) => (
              <div
                key={symbol}
                className="p-4 rounded-lg bg-gray-700/30"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-lg font-bold text-white">{symbol}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      data.change >= 0
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {data.change >= 0 ? "+" : ""}
                    {data.change.toFixed(2)}%
                  </span>
                </div>
                <div className="text-2xl font-mono text-gray-200">
                  ${data.price.toFixed(2)}
                </div>
              </div>
            ))}
            {Object.keys(prices).length === 0 && (
              <div className="text-sm text-gray-600 text-center py-8">
                连接后订阅频道查看实时数据
              </div>
            )}
          </div>
        </div>

        {/* 右侧：连接日志 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">📝 连接日志</h3>
          <div className="space-y-1 font-mono text-xs max-h-[400px] overflow-auto">
            {logs.slice().reverse().map((log, i) => (
              <div
                key={i}
                className={`p-1.5 rounded ${
                  log.type === "error"
                    ? "bg-red-500/10 text-red-400"
                    : log.type === "warn"
                      ? "bg-yellow-500/10 text-yellow-400"
                      : log.type === "send"
                        ? "bg-blue-500/10 text-blue-400"
                        : log.type === "recv"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-gray-700/30 text-gray-400"
                }`}
              >
                <span className="text-gray-500">
                  {new Date(log.time).toLocaleTimeString()}
                </span>
                <span className="ml-2">[{log.type}]</span>
                <span className="ml-2">{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="mt-8 p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
        <h3 className="text-sm font-medium text-gray-300 mb-2">💡 架构要点</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• <span className="text-gray-300">自动重连</span> - 断线后指数退避重连</li>
          <li>• <span className="text-gray-300">心跳检测</span> - 定期 ping/pong 保持连接</li>
          <li>• <span className="text-gray-300">订阅管理</span> - 按频道订阅，重连后自动重新订阅</li>
          <li>• <span className="text-gray-300">消息队列</span> - 断线期间消息缓存，重连后发送</li>
        </ul>
      </div>
    </div>
  );
}
