"use client";

import { useState, useMemo } from "react";
import { Container, createToken } from "@/di-container/Container";

// ==================== 定义 Token ====================

interface Logger {
  log(message: string): void;
  logs: string[];
}

interface HttpClient {
  get(url: string): Promise<string>;
}

interface UserService {
  getUser(id: string): Promise<{ id: string; name: string }>;
}

const LOGGER = createToken<Logger>("Logger");
const HTTP_CLIENT = createToken<HttpClient>("HttpClient");
const USER_SERVICE = createToken<UserService>("UserService");

// ==================== 实现类 ====================

class ConsoleLogger implements Logger {
  logs: string[] = [];
  log(message: string) {
    const entry = `[Console] ${new Date().toLocaleTimeString()} - ${message}`;
    this.logs.push(entry);
    console.log(entry);
  }
}

class PrettyLogger implements Logger {
  logs: string[] = [];
  log(message: string) {
    const entry = `✨ [Pretty] ${message}`;
    this.logs.push(entry);
    console.log(entry);
  }
}

class FetchHttpClient implements HttpClient {
  constructor(private logger: Logger) {}
  async get(url: string): Promise<string> {
    this.logger.log(`GET ${url}`);
    // 模拟请求
    await new Promise((r) => setTimeout(r, 300));
    return `Response from ${url}`;
  }
}

class MockHttpClient implements HttpClient {
  constructor(private logger: Logger) {}
  async get(url: string): Promise<string> {
    this.logger.log(`[MOCK] GET ${url}`);
    return `Mock response for ${url}`;
  }
}

class UserServiceImpl implements UserService {
  constructor(
    private http: HttpClient,
    private logger: Logger,
  ) {}

  async getUser(id: string) {
    this.logger.log(`Fetching user ${id}`);
    await this.http.get(`/api/users/${id}`);
    return { id, name: `User ${id}` };
  }
}

// ==================== 页面组件 ====================

export default function DIContainerPage() {
  const [loggerType, setLoggerType] = useState<"console" | "pretty">("console");
  const [httpType, setHttpType] = useState<"fetch" | "mock">("fetch");
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<string>("");

  // 根据配置创建容器
  const container = useMemo(() => {
    const c = new Container();

    // 注册 Logger（单例）
    c.register(LOGGER, {
      useFactory: () => (loggerType === "console" ? new ConsoleLogger() : new PrettyLogger()),
      scope: "singleton",
    });

    // 注册 HttpClient（依赖 Logger）
    c.register(HTTP_CLIENT, {
      useFactory: (container) => {
        const logger = container.resolve(LOGGER);
        return httpType === "fetch" ? new FetchHttpClient(logger) : new MockHttpClient(logger);
      },
      scope: "singleton",
    });

    // 注册 UserService（依赖 HttpClient 和 Logger）
    c.register(USER_SERVICE, {
      useFactory: (container) => {
        const http = container.resolve(HTTP_CLIENT);
        const logger = container.resolve(LOGGER);
        return new UserServiceImpl(http, logger);
      },
      scope: "singleton",
    });

    return c;
  }, [loggerType, httpType]);

  // 测试依赖解析
  const handleTest = async () => {
    setLogs([]);
    setResult("");

    const userService = container.resolve(USER_SERVICE);
    const user = await userService.getUser("123");

    const logger = container.resolve(LOGGER);
    setLogs([...logger.logs]);
    setResult(JSON.stringify(user, null, 2));
  };

  // 获取依赖树
  const dependencyTree = [
    {
      token: "UserService",
      impl: "UserServiceImpl",
      deps: [
        { token: "HttpClient", impl: httpType === "fetch" ? "FetchHttpClient" : "MockHttpClient" },
        { token: "Logger", impl: loggerType === "console" ? "ConsoleLogger" : "PrettyLogger" },
      ],
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">💉 依赖注入容器</h1>
      <p className="text-sm text-gray-500 mb-8">
        通过 Token 解耦依赖，切换实现只需重新注册，无需修改业务代码。
      </p>

      <div className="grid grid-cols-2 gap-6">
        {/* 左侧：配置面板 */}
        <div className="space-y-6">
          {/* Logger 选择 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Logger 实现</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setLoggerType("console")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                  loggerType === "console"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                    : "bg-gray-700/50 text-gray-400 border border-gray-600/50 hover:border-gray-500"
                }`}
              >
                ConsoleLogger
              </button>
              <button
                onClick={() => setLoggerType("pretty")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                  loggerType === "pretty"
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                    : "bg-gray-700/50 text-gray-400 border border-gray-600/50 hover:border-gray-500"
                }`}
              >
                PrettyLogger
              </button>
            </div>
          </div>

          {/* HttpClient 选择 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">HttpClient 实现</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setHttpType("fetch")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                  httpType === "fetch"
                    ? "bg-green-500/20 text-green-400 border border-green-500/40"
                    : "bg-gray-700/50 text-gray-400 border border-gray-600/50 hover:border-gray-500"
                }`}
              >
                FetchHttpClient
              </button>
              <button
                onClick={() => setHttpType("mock")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                  httpType === "mock"
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                    : "bg-gray-700/50 text-gray-400 border border-gray-600/50 hover:border-gray-500"
                }`}
              >
                MockHttpClient
              </button>
            </div>
          </div>

          {/* 依赖树可视化 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">依赖树</h3>
            <div className="font-mono text-xs space-y-1">
              {dependencyTree.map((node) => (
                <div key={node.token}>
                  <div className="text-blue-400">
                    {node.token} → <span className="text-white">{node.impl}</span>
                  </div>
                  {node.deps.map((dep, i) => (
                    <div key={dep.token} className="pl-4 text-gray-500">
                      {i === node.deps.length - 1 ? "└─" : "├─"} {dep.token} →{" "}
                      <span className="text-gray-300">{dep.impl}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* 测试按钮 */}
          <button
            onClick={handleTest}
            className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
          >
            调用 UserService.getUser("123")
          </button>
        </div>

        {/* 右侧：输出面板 */}
        <div className="space-y-4">
          {/* 日志输出 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 h-48">
            <h3 className="text-sm font-medium text-gray-300 mb-3">日志输出</h3>
            <div className="font-mono text-xs space-y-1 overflow-auto h-32">
              {logs.length === 0 ? (
                <div className="text-gray-600">点击按钮查看日志...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="text-green-400">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 返回结果 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">返回结果</h3>
            <pre className="font-mono text-xs text-gray-300">
              {result || "等待调用..."}
            </pre>
          </div>

          {/* 核心代码展示 */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">核心代码</h3>
            <pre className="font-mono text-xs text-gray-400 overflow-x-auto">
{`// 定义 Token
const LOGGER = createToken<Logger>("Logger");

// 注册实现
container.register(LOGGER, {
  useFactory: () => new ConsoleLogger(),
  scope: "singleton"
});

// 解析依赖
const logger = container.resolve(LOGGER);`}
            </pre>
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="mt-8 p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
        <h3 className="text-sm font-medium text-gray-300 mb-2">💡 架构要点</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• <span className="text-gray-300">Token</span> - 解耦依赖标识与具体实现</li>
          <li>• <span className="text-gray-300">Scope</span> - singleton（单例）/ transient（每次新建）/ scoped（作用域单例）</li>
          <li>• <span className="text-gray-300">Factory</span> - 延迟创建，支持依赖其他服务</li>
          <li>• <span className="text-gray-300">测试友好</span> - 注入 Mock 实现即可，无需修改业务代码</li>
        </ul>
      </div>
    </div>
  );
}
