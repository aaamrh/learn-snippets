"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { QuoteManager } from "@/quote-manager/QuoteManager";
import type { Quote } from "@/quote-manager/QuoteManager";

// ==================== 模拟数据 ====================
const SYMBOLS = ["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN"];

const BASE_PRICES: Record<string, number> = {
  AAPL: 178.5,
  TSLA: 248.3,
  GOOGL: 141.8,
  MSFT: 378.2,
  AMZN: 185.6,
};

/** 生成一条随机增量推送 */
function randomUpdate(symbol: string): Partial<Quote> {
  const base = BASE_PRICES[symbol];
  const price = +(base + (Math.random() - 0.5) * 4).toFixed(2);
  const change = +(price - base).toFixed(2);
  return {
    price,
    change,
    changePercent: +((change / base) * 100).toFixed(2),
    volume: Math.floor(Math.random() * 100000),
    timestamp: Date.now(),
  };
}

// ==================== 单行股价（memo 避免不必要重渲染） ====================
const QuoteRow = memo(function QuoteRow({
  symbol,
  quote,
}: {
  symbol: string;
  quote: Quote | undefined;
}) {
  const isUp = (quote?.change ?? 0) >= 0;
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/40 last:border-0">
      <span className="text-sm font-mono text-gray-300 w-14">{symbol}</span>
      <span className="text-sm font-mono font-semibold w-20 text-right">
        {quote ? (
          <span className={isUp ? "text-red-400" : "text-green-400"}>
            {quote.price.toFixed(2)}
          </span>
        ) : (
          <span className="text-gray-600">——</span>
        )}
      </span>
      <span
        className={`text-xs font-mono w-16 text-right ${
          isUp ? "text-red-400" : "text-green-400"
        }`}
      >
        {quote
          ? `${isUp ? "+" : ""}${quote.changePercent.toFixed(2)}%`
          : ""}
      </span>
    </div>
  );
});

// ==================== 统计条 ====================
function StatBar({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: "red" | "green";
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-700/30 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={`text-sm font-mono font-semibold ${
          highlight === "red"
            ? "text-red-400"
            : highlight === "green"
              ? "text-green-400"
              : "text-gray-300"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ==================== 左列：屎山 ====================
// 每条推送立刻 setState → 每条都重渲染
function BadSide({
  running,
  pushCount,
}: {
  running: boolean;
  pushCount: number;
}) {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const renderCount = useRef(0);
  // 每次组件函数体执行就是一次渲染
  renderCount.current += 1;

  // 暴露给外部订阅推送
  const handleUpdate = useCallback(
    (symbol: string, partial: Partial<Quote>) => {
      // ❌ 屎山核心问题：每条推送都 setState，每条都触发重渲染
      setQuotes((prev) => {
        const next = new Map(prev);
        const existing = next.get(symbol);
        next.set(symbol, {
          ...(existing ?? { symbol, price: 0, change: 0, changePercent: 0, volume: 0, timestamp: 0 }),
          ...partial,
          symbol,
        });
        return next;
      });
    },
    []
  );

  // 注册到全局，让父组件推送数据进来
  useEffect(() => {
    (window as any).__badSideUpdate = handleUpdate;
    return () => {
      delete (window as any).__badSideUpdate;
    };
  }, [handleUpdate]);

  // 不在推送时重置
  useEffect(() => {
    if (!running) {
      renderCount.current = 0;
      setQuotes(new Map());
    }
  }, [running]);

  const ratio =
    pushCount > 0 ? (renderCount.current / pushCount).toFixed(2) : "—";

  return (
    <div className="flex flex-col gap-3">
      {/* 代码说明 */}
      <div className="rounded-lg bg-gray-900/80 p-3 text-xs font-mono leading-relaxed">
        <p className="text-gray-600 mb-1">{"// 每条推送立刻 setState"}</p>
        <p>
          <span className="text-yellow-400">ws</span>
          <span className="text-gray-400">.onmessage = (e) {"=>"} {"{"}</span>
        </p>
        <p className="pl-4">
          <span className="text-red-400">setQuotes</span>
          <span className="text-gray-400">(prev {"=>"} {"{"}...{"}"}</span>
          <span className="text-gray-400">)</span>
        </p>
        <p>
          <span className="text-gray-400">{"}"}</span>
        </p>
        <p className="text-gray-600 mt-1">{"// 100条/秒 → 重渲染100次/秒"}</p>
      </div>

      {/* 统计 */}
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
        <StatBar label="收到推送" value={pushCount} />
        <StatBar
          label="触发渲染"
          value={renderCount.current}
          highlight="red"
        />
        <StatBar label="渲染/推送" value={ratio} highlight="red" />
      </div>

      {/* 股价表格 */}
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/40">
        {SYMBOLS.map((s) => (
          <QuoteRow key={s} symbol={s} quote={quotes.get(s)} />
        ))}
      </div>
    </div>
  );
}

// ==================== 右列：优雅 ====================
// 推送进 QuoteManager → 50ms 后批量 flush → 只 setState 一次
function GoodSide({
  running,
  pushCount,
}: {
  running: boolean;
  pushCount: number;
}) {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const managerRef = useRef<QuoteManager | null>(null);
  const renderCount = useRef(0);
  renderCount.current += 1;

  useEffect(() => {
    const manager = new QuoteManager(50);
    managerRef.current = manager;

    // ✅ 优雅核心：flush 后才触发一次 setState
    const unsub = manager.subscribe((newQuotes) => {
      setQuotes(newQuotes);
    });

    (window as any).__goodSideUpdate = (
      symbol: string,
      partial: Partial<Quote>
    ) => {
      manager.receiveUpdate(symbol, partial);
    };

    return () => {
      unsub();
      delete (window as any).__goodSideUpdate;
    };
  }, []);

  useEffect(() => {
    if (!running) {
      renderCount.current = 0;
      managerRef.current?.reset();
      setQuotes(new Map());
    }
  }, [running]);

  const flushCount = managerRef.current?.flushCount ?? 0;
  const ratio =
    pushCount > 0 ? (renderCount.current / pushCount).toFixed(2) : "—";

  return (
    <div className="flex flex-col gap-3">
      {/* 代码说明 */}
      <div className="rounded-lg bg-gray-900/80 p-3 text-xs font-mono leading-relaxed">
        <p className="text-gray-600 mb-1">{"// 推送进管理器，50ms 批量刷新"}</p>
        <p>
          <span className="text-yellow-400">ws</span>
          <span className="text-gray-400">.onmessage = (e) {"=>"} {"{"}</span>
        </p>
        <p className="pl-4">
          <span className="text-green-400">manager</span>
          <span className="text-gray-400">.receiveUpdate(s, data)</span>
        </p>
        <p>
          <span className="text-gray-400">{"}"}</span>
        </p>
        <p className="text-gray-600 mt-1">
          {"// 100条/秒 → 每50ms合并一次 → 渲染2次/秒"}
        </p>
      </div>

      {/* 统计 */}
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
        <StatBar label="收到推送" value={pushCount} />
        <StatBar
          label="flush 次数"
          value={flushCount}
          highlight="green"
        />
        <StatBar
          label="触发渲染"
          value={renderCount.current}
          highlight="green"
        />
        <StatBar label="渲染/推送" value={ratio} highlight="green" />
      </div>

      {/* 股价表格 */}
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/40">
        {SYMBOLS.map((s) => (
          <QuoteRow key={s} symbol={s} quote={quotes.get(s)} />
        ))}
      </div>
    </div>
  );
}

// ==================== 主页面 ====================
export default function QuoteMergePage() {
  const [running, setRunning] = useState(false);
  const [pushCount, setPushCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pushCountRef = useRef(0);

  const start = useCallback(() => {
    pushCountRef.current = 0;
    setPushCount(0);
    setRunning(true);

    // 每 10ms 推一条（100条/秒），模拟高频行情推送
    timerRef.current = setInterval(() => {
      const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      const update = randomUpdate(symbol);

      // 同时推给左右两列
      (window as any).__badSideUpdate?.(symbol, update);
      (window as any).__goodSideUpdate?.(symbol, update);

      pushCountRef.current += 1;
      setPushCount(pushCountRef.current);
    }, 10);

    // 3 秒后自动停止
    setTimeout(() => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRunning(false);
    }, 3000);
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
    setPushCount(0);
    pushCountRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">📈 报价推送与合并</h1>
      <p className="text-sm text-gray-500 mb-6">
        模拟每秒 100 条行情推送，对比「每条都 setState」和「50ms 批处理后才 setState」的渲染次数差距。
      </p>

      {/* 控制按钮 */}
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {running ? "推送中…（3秒）" : "开始推送"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={running}
          className="px-5 py-2.5 rounded-lg border border-gray-600 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-400 text-sm transition-colors"
        >
          重置
        </button>
        {running && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs text-gray-500">
              已推送 <span className="text-white font-mono">{pushCount}</span> 条
            </span>
          </div>
        )}
      </div>

      {/* 左右对比 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs px-2 py-0.5 rounded border text-red-400 bg-red-500/10 border-red-500/30 font-medium">
              ❌ 屎山
            </span>
            <span className="text-xs text-gray-500">每条推送立即 setState</span>
          </div>
          <BadSide running={running} pushCount={pushCount} />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs px-2 py-0.5 rounded border text-green-400 bg-green-500/10 border-green-500/30 font-medium">
              ✅ 优雅
            </span>
            <span className="text-xs text-gray-500">50ms 批处理后 setState</span>
          </div>
          <GoodSide running={running} pushCount={pushCount} />
        </div>
      </div>

      {/* 底部原理说明 */}
      <div className="mt-8 rounded-xl border border-gray-700/40 bg-gray-800/20 p-4">
        <p className="text-xs text-gray-500 mb-2 font-medium">原理</p>
        <p className="text-xs text-gray-600 leading-relaxed">
          <span className="text-red-400">屎山</span>：每条 WebSocket 消息直接
          <code className="bg-gray-800 px-1 rounded text-red-300 mx-1">setState</code>
          ，100条/秒 = 100次渲染/秒，页面卡顿。
        </p>
        <p className="text-xs text-gray-600 leading-relaxed mt-2">
          <span className="text-green-400">优雅</span>：推送先进
          <code className="bg-gray-800 px-1 rounded text-green-300 mx-1">pendingUpdates</code>
          ，同一股票多条只保留最新值（字段级合并）；50ms 窗口到期后
          <code className="bg-gray-800 px-1 rounded text-green-300 mx-1">flush()</code>
          一次性写入 + 通知订阅者，只触发
          <strong className="text-white mx-1">一次</strong>
          setState，渲染次数从 100次/秒 降到 约2次/秒。
        </p>
      </div>
    </div>
  );
}
