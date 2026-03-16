/**
 * 请求层架构
 *
 * 核心功能：
 * 1. 拦截器（Interceptor）- 请求/响应前后处理
 * 2. 重试（Retry）- 失败自动重试
 * 3. 取消（Cancel）- 取消进行中的请求
 * 4. 缓存（Cache）- 响应缓存
 * 5. 限流（Rate Limit）- 并发控制
 *
 * 解决的问题：
 * - 重复代码 → 统一处理
 * - 错误处理散落 → 集中拦截
 * - 无法取消 → AbortController
 */

// ==================== 类型定义 ====================

export interface RequestConfig {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string | number>;
  timeout?: number;
  retry?: number;
  retryDelay?: number;
  cache?: boolean | number; // true = 默认 TTL, number = 自定义 TTL
  signal?: AbortSignal;
}

export interface Response<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: RequestConfig;
}

export interface RequestError extends Error {
  config: RequestConfig;
  response?: Response;
  isTimeout?: boolean;
  isAborted?: boolean;
}

export type RequestInterceptor = (
  config: RequestConfig,
) => RequestConfig | Promise<RequestConfig>;

export type ResponseInterceptor<T = unknown> = (
  response: Response<T>,
) => Response<T> | Promise<Response<T>>;

export type ErrorInterceptor = (
  error: RequestError,
) => Response | Promise<Response> | never;

// ==================== RequestClient ====================

export class RequestClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  private cache = new Map<string, { data: Response; expiresAt: number }>();
  private pendingRequests = new Map<string, AbortController>();
  private concurrentLimit: number;
  private currentConcurrent = 0;
  private requestQueue: Array<() => void> = [];

  // 日志
  private logs: { time: number; type: string; msg: string }[] = [];

  constructor(options: {
    baseURL?: string;
    headers?: Record<string, string>;
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    concurrentLimit?: number;
  } = {}) {
    this.baseURL = options.baseURL ?? "";
    this.defaultHeaders = options.headers ?? {};
    this.timeout = options.timeout ?? 30000;
    this.maxRetries = options.maxRetries ?? 0;
    this.retryDelay = options.retryDelay ?? 1000;
    this.concurrentLimit = options.concurrentLimit ?? 10;
  }

  /**
   * 添加请求拦截器
   */
  useRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index > -1) this.requestInterceptors.splice(index, 1);
    };
  }

  /**
   * 添加响应拦截器
   */
  useResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index > -1) this.responseInterceptors.splice(index, 1);
    };
  }

  /**
   * 添加错误拦截器
   */
  useErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index > -1) this.errorInterceptors.splice(index, 1);
    };
  }

  /**
   * 发送请求
   */
  async request<T = unknown>(config: RequestConfig): Promise<Response<T>> {
    // 应用请求拦截器
    let finalConfig = { ...config };
    for (const interceptor of this.requestInterceptors) {
      finalConfig = await interceptor(finalConfig);
    }

    // 检查缓存
    const cacheKey = this.getCacheKey(finalConfig);
    if (finalConfig.cache && finalConfig.method === "GET") {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        this.log("cache", `命中缓存: ${finalConfig.url}`);
        return cached.data as Response<T>;
      }
    }

    // 等待并发限制
    await this.waitForSlot();

    try {
      const response = await this.executeRequest<T>(finalConfig);

      // 缓存响应
      if (finalConfig.cache && finalConfig.method === "GET") {
        const ttl = typeof finalConfig.cache === "number" ? finalConfig.cache : 60000;
        this.cache.set(cacheKey, {
          data: response,
          expiresAt: Date.now() + ttl,
        });
        this.log("cache", `已缓存: ${finalConfig.url}`);
      }

      // 应用响应拦截器
      let finalResponse = response;
      for (const interceptor of this.responseInterceptors) {
        finalResponse = (await interceptor(finalResponse)) as Response<T>;
      }

      return finalResponse;
    } catch (error) {
      // 应用错误拦截器
      let handled = false;
      for (const interceptor of this.errorInterceptors) {
        try {
          const result = await interceptor(error as RequestError);
          if (result) {
            handled = true;
            return result as Response<T>;
          }
        } catch {
          // 拦截器未处理，继续
        }
      }

      if (!handled) {
        throw error;
      }

      throw error;
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * GET 请求
   */
  get<T = unknown>(url: string, config?: Omit<RequestConfig, "url" | "method">): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: "GET" });
  }

  /**
   * POST 请求
   */
  post<T = unknown>(url: string, body?: unknown, config?: Omit<RequestConfig, "url" | "method" | "body">): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: "POST", body });
  }

  /**
   * PUT 请求
   */
  put<T = unknown>(url: string, body?: unknown, config?: Omit<RequestConfig, "url" | "method" | "body">): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: "PUT", body });
  }

  /**
   * DELETE 请求
   */
  delete<T = unknown>(url: string, config?: Omit<RequestConfig, "url" | "method">): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: "DELETE" });
  }

  /**
   * 取消请求
   */
  cancel(url: string): void {
    const controller = this.pendingRequests.get(url);
    if (controller) {
      controller.abort();
      this.pendingRequests.delete(url);
      this.log("cancel", `已取消: ${url}`);
    }
  }

  /**
   * 取消所有请求
   */
  cancelAll(): void {
    for (const [url, controller] of this.pendingRequests) {
      controller.abort();
      this.log("cancel", `已取消: ${url}`);
    }
    this.pendingRequests.clear();
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.log("cache", "缓存已清空");
  }

  /**
   * 获取日志
   */
  getLogs(): { time: number; type: string; msg: string }[] {
    return [...this.logs];
  }

  /**
   * 获取统计
   */
  getStats(): {
    cacheSize: number;
    pendingRequests: number;
    currentConcurrent: number;
    queueSize: number;
  } {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      currentConcurrent: this.currentConcurrent,
      queueSize: this.requestQueue.length,
    };
  }

  // ==================== Private ====================

  private async executeRequest<T>(config: RequestConfig, retryCount = 0): Promise<Response<T>> {
    const url = this.buildURL(config);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout ?? this.timeout);

    this.pendingRequests.set(url, controller);
    this.log("request", `${config.method ?? "GET"} ${url}`);

    try {
      // 模拟请求（实际项目中使用 fetch）
      const response = await this.mockFetch<T>(config, controller.signal);
      this.log("response", `${response.status} ${url}`);
      return response;
    } catch (error) {
      const err = error as RequestError;
      err.config = config;

      // 检查是否可重试
      const maxRetries = config.retry ?? this.maxRetries;
      if (retryCount < maxRetries && !err.isAborted) {
        this.log("retry", `重试 ${retryCount + 1}/${maxRetries}: ${url}`);
        await this.sleep(config.retryDelay ?? this.retryDelay);
        return this.executeRequest<T>(config, retryCount + 1);
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
      this.pendingRequests.delete(url);
    }
  }

  private buildURL(config: RequestConfig): string {
    let url = this.baseURL + config.url;

    if (config.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(config.params)) {
        searchParams.append(key, String(value));
      }
      url += (url.includes("?") ? "&" : "?") + searchParams.toString();
    }

    return url;
  }

  private getCacheKey(config: RequestConfig): string {
    return `${config.method ?? "GET"}:${this.buildURL(config)}`;
  }

  private async waitForSlot(): Promise<void> {
    if (this.currentConcurrent < this.concurrentLimit) {
      this.currentConcurrent++;
      return;
    }

    return new Promise((resolve) => {
      this.requestQueue.push(() => {
        this.currentConcurrent++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.currentConcurrent--;
    const next = this.requestQueue.shift();
    if (next) next();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(type: string, msg: string): void {
    this.logs.push({ time: Date.now(), type, msg });
    if (this.logs.length > 100) {
      this.logs.shift();
    }
  }

  /**
   * 模拟 fetch（用于演示）
   */
  private async mockFetch<T>(config: RequestConfig, signal: AbortSignal): Promise<Response<T>> {
    return new Promise((resolve, reject) => {
      const delay = 200 + Math.random() * 500;

      const timeout = setTimeout(() => {
        if (signal.aborted) {
          const error = new Error("Request aborted") as RequestError;
          error.isAborted = true;
          reject(error);
          return;
        }

        // 模拟随机失败（用于测试重试）
        if (Math.random() < 0.2) {
          const error = new Error("Network error") as RequestError;
          reject(error);
          return;
        }

        resolve({
          data: { message: "success", url: config.url, timestamp: Date.now() } as T,
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          config,
        });
      }, delay);

      signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        const error = new Error("Request aborted") as RequestError;
        error.isAborted = true;
        reject(error);
      });
    });
  }
}

// ==================== 便捷实例 ====================

export const http = new RequestClient({
  baseURL: "/api",
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  concurrentLimit: 10,
});
