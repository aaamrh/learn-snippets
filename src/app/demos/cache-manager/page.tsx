"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { CacheManager } from "@/cache-manager/CacheManager";

// ==================== 模拟数据 ====================

interface StockPrice {
  symbol: string;
  price: number;
  change: number;
  timestamp: number;
}

const SYMBOLS = ["BTC", "ETH", "SOL", "DOGE", "XRP"];

function mockFetchPrice(symbol: string): Promise<StockPrice> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        symbol,
        price: Math.round((Math.random() * 10000 + 100) * 100) / 100,
        change: Math.round((Math.random() * 10 - 5) * 100) / 100,
        timestamp: Date.now(),
      });
    }, 300 + Math.random() * 200);
  });
}

// ==================== 页面组件 ====================

export default function CacheManagerPage() {
  const cacheRef = useRef(
    new CacheManager<string, StockPrice>({
      maxSize: 10,
      defaultTTL: 5000, // 5 秒
      enableLRU: true,
      cleanupInterval: 1000,
    }),
  );
  const cache = cacheRef.current;

  const [entries, setEntries] = useState<ReturnType<typeof cache.entries>>([]);
  const [stats, setStats] = useState(cache.getStats());
  const [logs, setLogs] = useState<{ time: string; msg: string; type: "hit" | "miss" | "set" | "evict" }[]>([]);
  const [loading, setLoading] = useState<Set<string>>(new Set());

  // 刷新显示
  const refresh = useCallback(() => {
    setEntries(cache.entries());
    setStats(cache.getStats());
  }, [cache]);

  // 定期刷新
  useEffect(() => {
    const timer = setInterval(refresh, 500);
    return () => clearInterval(timer);
  }, [refresh]);

  // 添加日志
  const addLog = (msg: string, type: "hit" | "miss" | "set" | "evict") => {
    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), msg, type },
      ...prev.slice(0, 19),
    ]);
  };

  // 获取价格（演示缓存）
  const fetchPrice = async (symbol: string) => {
    // 先尝试缓存
    const cached = cache.get(symbol);
    if (cached) {
      addLog(`[HIT] ${symbol} = $${cached.price}`, "hit");
      refresh();
      return;
    }

    addLog(`[MISS] ${symbol} - 正在获取...`, "miss");
    setLoading((prev) => new Set(prev).add(symbol));

    const data = await mockFetchPrice(symbol);

    cache.set(symbol, data, {
      ttl: 5000,
      tags: ["price", `symbol:${symbol}`],
    });

    addLog(`[SET] ${symbol} = $${data.price}`, "set");
    setLoading((prev) => {
      const next = new Set(prev);
      next.delete(symbol);
      return next;
    });
    refresh();
  };

  // 批量失效
  const invalidateAll = () => {
    const count = cache.invalidateByTag("price");
    addLog(`[EVICT] 按标签失效 "price"，清除 ${count} 条`, "evict");
    refresh();
  };

  // 清空缓存
  const clearAll = () => {
    cache.clear();
    addLog(`[EVICT] 清空所有缓存`, "evict");
    refresh();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">📦 缓存管理器</h1>
      <p className="text-sm text-gray-500 mb-6">
        LRU + TTL + 标签，自动淘汰、按标签批量失效、统计命中率。
      </p>

      <div className="grid grid-cols-3 gap-6">
        {/* 左侧：操作面板 */}
        <div className="space-y-4">
          {/* 获取价格 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">📈 获取价格</h3>
            <div className="grid grid-cols-2 gap-2">
              {SYMBOLS.map((symbol) => (
                <button
                  key={symbol}
                  onClick={() => fetchPrice(symbol)}
                  disabled={loading.has(symbol)}
                  className="px-3 py-2 rounded-lg text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50"
                >
                  {loading.has(symbol) ? "..." : symbol}
                </button>
              ))}
            </div>
            <div className="mt-3 text-xs text-gray-500">
              TTL: 5秒，点击后观察缓存状态
            </div>
          </div>

          {/* 批量操作 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">🔧 批量操作</h3>
            <div className="space-y-2">
              <button
                onClick={invalidateAll}
                className="w-full px-3 py-2 rounded-lg text-sm bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
              >
                按标签失效 (price)
              </button>
              <button
                onClick={clearAll}
                className="w-full px-3 py-2 rounded-lg text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30"
              >
                清空所有缓存
              </button>
            </div>
          </div>

          {/* 统计信息 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">📊 统计信息</h3>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">缓存条目</span>
                <span className="text-gray-300">{stats.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">命中次数</span>
                <span className="text-green-400">{stats.hits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">未命中</span>
                <span className="text-red-400">{stats.misses}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">命中率</span>
                <span className={stats.hitRate > 0.5 ? "text-green-400" : "text-yellow-400"}>
                  {(stats.hitRate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">淘汰次数</span>
                <span className="text-gray-300">{stats.evictions}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 中间：缓存内容 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">💾 缓存内容</h3>
          <div className="space-y-2 max-h-[400px] overflow-auto">
            {entries.length > 0 ? (
              entries.map((entry) => (
                <div
                  key={String(entry.key)}
                  className={`p-3 rounded-lg ${
                    entry.isExpired
                      ? "bg-red-500/10 border border-red-500/20"
                      : "bg-gray-700/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-300">
                      {String(entry.key)}
                    </span>
                    {entry.isExpired ? (
                      <span className="text-xs text-red-400">已过期</span>
                    ) : (
                      <span className="text-xs text-green-400">
                        {entry.ttlRemaining !== null
                          ? `${Math.ceil(entry.ttlRemaining / 1000)}s`
                          : "永久"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    价格: ${(entry.value as StockPrice).price}
                  </div>
                  <div className="text-xs text-gray-500">
                    访问: {entry.accessCount}次
                  </div>
                  <div className="flex gap-1 mt-1">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-600 text-center py-8">
                缓存为空，点击按钮获取数据
              </div>
            )}
          </div>
        </div>

        {/* 右侧：操作日志 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">📝 操作日志</h3>
          <div className="space-y-1 font-mono text-xs max-h-[400px] overflow-auto">
            {logs.map((log, i) => (
              <div
                key={i}
                className={`p-1.5 rounded ${
                  log.type === "hit"
                    ? "bg-green-500/10 text-green-400"
                    : log.type === "miss"
                      ? "bg-yellow-500/10 text-yellow-400"
                      : log.type === "set"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-red-500/10 text-red-400"
                }`}
              >
                <span className="text-gray-500">{log.time}</span>
                <span className="ml-2">{log.msg}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-gray-600">暂无日志...</div>
            )}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="mt-8 p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
        <h3 className="text-sm font-medium text-gray-300 mb-2">💡 架构要点</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• <span className="text-gray-300">TTL</span> - 自动过期，无需手动清理</li>
          <li>• <span className="text-gray-300">LRU</span> - 容量满时淘汰最久未访问的</li>
          <li>• <span className="text-gray-300">标签</span> - 批量失效相关缓存（如清除所有价格缓存）</li>
          <li>• <span className="text-gray-300">getOrSet</span> - 缓存未命中时自动获取并缓存</li>
          <li>• <span className="text-gray-300">统计</span> - 命中率监控，优化缓存策略</li>
        </ul>
      </div>
    </div>
  );
}
