import type { Tenant } from "./types";

// ==================== 请求日志（供 UI 展示） ====================
export interface RequestLog {
  method: string;
  url: string;
  headers: Record<string, string>;
}

// ==================== 租户 HTTP 客户端 ====================
/**
 * TenantHttpClient — 自动注入租户信息的 HTTP 客户端
 *
 * 核心价值（对比屎山）：
 *
 * ❌ 屎山：每个请求手动处理
 *   fetch(`/api/${tenantId}/orders`, {
 *     headers: { 'X-Tenant-Id': tenantId }
 *   })
 *   → tenantId 需要从外部传入，忘了就出 bug
 *
 * ✅ 优雅：客户端自动处理
 *   client.get('/orders')
 *   → tenantId 从构造时注入，之后所有请求自动带上
 *
 * 这里不真正发请求（Demo 环境），只生成请求描述供 UI 展示。
 */
export class TenantHttpClient {
  private tenant: Tenant;
  /** 最近一次请求的日志，供 UI 读取展示 */
  lastRequest: RequestLog | null = null;

  constructor(tenant: Tenant) {
    this.tenant = tenant;
  }

  /**
   * 构造请求（不真正发出），记录日志。
   * 自动完成两件事：
   *   1. URL 加上租户前缀：/orders → /t/{slug}/orders
   *   2. Header 加上 X-Tenant-Id
   */
  private buildRequest(method: string, url: string): RequestLog {
    const fullUrl = `/api/t/${this.tenant.slug}${url}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Tenant-Id": this.tenant.id,
    };

    const log: RequestLog = { method, url: fullUrl, headers };
    this.lastRequest = log;
    return log;
  }

  get(url: string): RequestLog {
    return this.buildRequest("GET", url);
  }

  post(url: string): RequestLog {
    return this.buildRequest("POST", url);
  }

  delete(url: string): RequestLog {
    return this.buildRequest("DELETE", url);
  }
}
