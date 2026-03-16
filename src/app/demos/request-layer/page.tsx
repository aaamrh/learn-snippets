"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { RequestClient } from "@/request-layer/RequestClient";

// ==================== 页面组件 ====================

export default function RequestLayerPage() {
  const clientRef = useRef(
    new RequestClient({
      baseURL: "/api",
      timeout: 5000,
      maxRetries: 3,
      retryDelay: 500,
      concurrentLimit: 3,
    }),
  );
  const client = clientRef.current;

  const [logs, setLogs] = useState(client.getLogs());
  const [stats, setStats] = useState(client.getStats());
  const [results, setResults] = useState<{ id: number; url: string; status: string; data?: string }[]>([]);
  const [interceptors, setInterceptors] = useState({
    auth: false,
    logger: false,
    errorHandler: false,
  });

  const resultIdRef = useRef(0);

  // 刷新状态
  const refresh = useCallback(() => {
    setLogs(client.getLogs());
    setStats(client.getStats());
  }, [client]);

  // 定期刷新
  useEffect(() => {
    const timer = setInterval(refresh, 200);
    return () => clearInterval(timer);
  }, [refresh]);

  // 添加拦截器
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    if (interceptors.auth) {
      unsubscribers.push(
        client.useRequestInterceptor((config) => {
          return {
            ...config,
            headers: {
              ...config.headers,
              Authorization: "Bearer mock-token-12345",
            },
          };
        }),
      );
    }

    if (interceptors.logger) {
      unsubscribers.push(
        client.useRequestInterceptor((config) => {
          console.log("[Logger] Request:", config.method, config.url);
          return config;
        }),
      );
      unsubscribers.push(
        client.useResponseInterceptor((response) => {
          console.log("[Logger] Response:", response.status, response.config.url);
          return response;
        }),
      );
    }

    if (interceptors.errorHandler) {
      unsubscribers.push(
        client.useErrorInterceptor((error) => {
          console.log("[ErrorHandler] Error:", error.message);
          throw error; // 继续抛出
        }),
      );
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [client, interceptors]);

  // 发送请求
  const sendRequest = async (url: string, options?: { cache?: boolean; retry?: number }) => {
    const id = ++resultIdRef.current;
    setResults((prev) => [...prev, { id, url, status: "pending" }]);

    try {
      const response = await client.get<{ message: string; timestamp: number }>(url, {
        cache: options?.cache,
        retry: options?.retry,
      });

      setResults((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: "success", data: JSON.stringify(response.data) }
            : r,
        ),
      );
    } catch (error) {
      setResults((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: "error", data: (error as Error).message }
            : r,
        ),
      );
    }
  };

  // 批量请求（测试并发限制）
  const sendBatchRequests = () => {
    for (let i = 0; i < 5; i++) {
      sendRequest(`/users/${i + 1}`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">🌐 请求层</h1>
      <p className="text-sm text-gray-500 mb-6">
        拦截器 + 重试 + 取消 + 缓存 + 并发控制，统一的 HTTP 请求管理。
      </p>

      <div className="grid grid-cols-3 gap-6">
        {/* 左侧：请求控制 */}
        <div className="space-y-4">
          {/* 发送请求 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">📤 发送请求</h3>
            <div className="space-y-2">
              <button
                onClick={() => sendRequest("/users/1")}
                className="w-full px-3 py-2 rounded-lg text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              >
                GET /users/1
              </button>
              <button
                onClick={() => sendRequest("/users/1", { cache: true })}
                className="w-full px-3 py-2 rounded-lg text-sm bg-green-500/20 text-green-400 hover:bg-green-500/30"
              >
                GET /users/1 (带缓存)
              </button>
              <button
                onClick={() => sendRequest("/error", { retry: 3 })}
                className="w-full px-3 py-2 rounded-lg text-sm bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
              >
                GET /error (测试重试)
              </button>
              <button
                onClick={sendBatchRequests}
                className="w-full px-3 py-2 rounded-lg text-sm bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
              >
                批量请求 x5 (测试并发)
              </button>
            </div>
          </div>

          {/* 拦截器配置 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">🔌 拦截器</h3>
            <div className="space-y-2">
              {[
                { key: "auth", label: "Auth 拦截器", desc: "自动添加 Token" },
                { key: "logger", label: "Logger 拦截器", desc: "打印请求日志" },
                { key: "errorHandler", label: "Error 拦截器", desc: "统一错误处理" },
              ].map(({ key, label, desc }) => (
                <label
                  key={key}
                  className="flex items-center justify-between p-2 rounded-lg bg-gray-700/30"
                >
                  <div>
                    <div className="text-sm text-gray-300">{label}</div>
                    <div className="text-xs text-gray-500">{desc}</div>
                  </div>
                  <button
                    onClick={() =>
                      setInterceptors((prev) => ({
                        ...prev,
                        [key]: !prev[key as keyof typeof prev],
                      }))
                    }
                    className={`w-10 h-5 rounded-full transition-colors ${
                      interceptors[key as keyof typeof interceptors]
                        ? "bg-blue-500"
                        : "bg-gray-600"
                    }`}
                  >
                    <span
                      className="block w-4 h-4 rounded-full bg-white shadow transition-transform"
                      style={{
                        transform: interceptors[key as keyof typeof interceptors]
                          ? "translateX(22px)"
                          : "translateX(2px)",
                      }}
                    />
                  </button>
                </label>
              ))}
            </div>
          </div>

          {/* 统计信息 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">📊 统计</h3>
            <div className="space-y-1 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">缓存条目</span>
                <span className="text-gray-300">{stats.cacheSize}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">进行中请求</span>
                <span className="text-blue-400">{stats.pendingRequests}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">当前并发</span>
                <span className="text-gray-300">{stats.currentConcurrent}/3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">等待队列</span>
                <span className="text-yellow-400">{stats.queueSize}</span>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => client.cancelAll()}
                className="flex-1 px-2 py-1 rounded text-xs bg-red-500/20 text-red-400"
              >
                取消所有
              </button>
              <button
                onClick={() => client.clearCache()}
                className="flex-1 px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-400"
              >
                清除缓存
              </button>
            </div>
          </div>
        </div>

        {/* 中间：请求结果 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-300">📥 请求结果</h3>
            <button
              onClick={() => setResults([])}
              className="text-xs text-gray-500 hover:text-gray-400"
            >
              清空
            </button>
          </div>
          <div className="space-y-2 max-h-[400px] overflow-auto">
            {results.slice().reverse().map((r) => (
              <div
                key={r.id}
                className={`p-3 rounded-lg ${
                  r.status === "pending"
                    ? "bg-yellow-500/10 border border-yellow-500/20"
                    : r.status === "success"
                      ? "bg-green-500/10 border border-green-500/20"
                      : "bg-red-500/10 border border-red-500/20"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-gray-400">{r.url}</span>
                  <span
                    className={`text-xs ${
                      r.status === "pending"
                        ? "text-yellow-400"
                        : r.status === "success"
                          ? "text-green-400"
                          : "text-red-400"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                {r.data && (
                  <div className="text-xs text-gray-500 font-mono truncate">
                    {r.data}
                  </div>
                )}
              </div>
            ))}
            {results.length === 0 && (
              <div className="text-sm text-gray-600 text-center py-8">
                发送请求查看结果
              </div>
            )}
          </div>
        </div>

        {/* 右侧：请求日志 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">📝 请求日志</h3>
          <div className="space-y-1 font-mono text-xs max-h-[400px] overflow-auto">
            {logs.slice().reverse().map((log, i) => (
              <div
                key={i}
                className={`p-1.5 rounded ${
                  log.type === "request"
                    ? "bg-blue-500/10 text-blue-400"
                    : log.type === "response"
                      ? "bg-green-500/10 text-green-400"
                      : log.type === "cache"
                        ? "bg-purple-500/10 text-purple-400"
                        : log.type === "retry"
                          ? "bg-yellow-500/10 text-yellow-400"
                          : log.type === "cancel"
                            ? "bg-red-500/10 text-red-400"
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
          <li>• <span className="text-gray-300">拦截器</span> - 请求/响应/错误分别拦截，可组合</li>
          <li>• <span className="text-gray-300">重试</span> - 失败自动重试，可配置次数和间隔</li>
          <li>• <span className="text-gray-300">缓存</span> - GET 请求自动缓存，支持自定义 TTL</li>
          <li>• <span className="text-gray-300">取消</span> - AbortController 取消进行中请求</li>
          <li>• <span className="text-gray-300">并发控制</span> - 限制同时进行的请求数，排队执行</li>
        </ul>
      </div>
    </div>
  );
}
