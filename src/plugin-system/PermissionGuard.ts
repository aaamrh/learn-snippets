// ==================== PermissionGuard ====================
//
// 对标 VS Code 的隐式权限模型（显式化版本）：
// - 包装 PluginAPI，拦截未授权的 API 调用
// - 根据插件 Manifest 中声明的 permissions 白名单决定放行或拒绝
// - 提供权限审计日志（记录每次 API 调用及其授权结果）
//
// VS Code 的权限是隐式的（你在 contributes 中声明了什么就能用什么），
// 我们的 Demo 显式化：插件必须在 Manifest.permissions 中声明需要的能力，
// 调用未声明的 API 会抛出 PermissionDeniedError。
//
// 设计原则：
// - PermissionGuard 是 PluginAPI 的装饰器（Decorator Pattern）
// - 它不改变 API 的行为，只在调用前检查权限
// - 每个插件有独立的 PermissionGuard 实例（因为权限声明不同）
// - 权限粒度到 namespace:method 级别（如 "editor:insertText"）
//
// 与其他模块的关系：
// | 模块               | 职责                                |
// |--------------------|------------------------------------|
// | PluginRegistry     | 存储 Manifest（含 permissions 声明） |
// | APIProxy           | 提供真实的 PluginAPI 实现            |
// | PermissionGuard    | 在 APIProxy 外层包装权限检查         |
// | PluginHost         | 创建 PermissionGuard 并注入给插件     |

import type {
  PluginAPI,
  EditorAPI,
  CommandsAPI,
  StatusBarAPI,
  EventsAPI,
  StorageAPI,
  Permission,
  Disposable,
  SelectionInfo,
} from "./manifest-types";

// ==================== 错误类型 ====================

/**
 * 权限拒绝错误
 *
 * 当插件调用了未在 Manifest permissions 中声明的 API 时抛出
 */
export class PermissionDeniedError extends Error {
  /** 被拒绝的权限 */
  public permission: string;
  /** 发起调用的插件 ID */
  public pluginId: string;
  /** 被调用的 API 方法 */
  public method: string;

  constructor(pluginId: string, permission: string, method: string) {
    super(
      `[PermissionGuard] Plugin "${pluginId}" does not have permission "${permission}" ` +
        `to call "${method}". Add "${permission}" to the plugin's Manifest permissions array.`,
    );
    this.name = "PermissionDeniedError";
    this.pluginId = pluginId;
    this.permission = permission;
    this.method = method;
  }
}

// ==================== 审计日志 ====================

/**
 * 权限审计日志条目
 */
export interface PermissionAuditEntry {
  /** 发起调用的插件 ID */
  pluginId: string;
  /** 被调用的 API 方法（如 "editor.insertText"） */
  method: string;
  /** 需要的权限（如 "editor:insertText"） */
  permission: string;
  /** 是否被允许 */
  allowed: boolean;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 权限审计日志回调
 */
export type PermissionAuditCallback = (entry: PermissionAuditEntry) => void;

// ==================== 权限映射表 ====================

/**
 * API 方法到权限的映射表
 *
 * key = "namespace.method"（如 "editor.insertText"）
 * value = 对应的权限字符串（如 "editor:insertText"）
 *
 * 这张表定义了每个 API 方法需要哪个权限才能调用。
 * 权限粒度精确到单个方法。
 */
const METHOD_PERMISSION_MAP: Record<string, Permission> = {
  // Editor API
  "editor.insertText": "editor:insertText",
  "editor.replaceSelection": "editor:replaceSelection",
  "editor.getSelectedText": "editor:getSelectedText",
  "editor.getContent": "editor:getContent",
  "editor.onSelectionChange": "editor:onSelectionChange",

  // Commands API
  "commands.registerCommand": "commands:register",
  "commands.executeCommand": "commands:execute",

  // StatusBar API
  "statusBar.update": "statusBar:update",
  "statusBar.remove": "statusBar:remove",
  "statusBar.setTooltip": "statusBar:setTooltip",
  "statusBar.setColor": "statusBar:setColor",
  "statusBar.setBackgroundColor": "statusBar:setBackgroundColor",
  "statusBar.setCommand": "statusBar:setCommand",

  // Events API
  "events.on": "events:on",
  "events.emit": "events:emit",

  // Storage API
  "storage.get": "storage:get",
  "storage.set": "storage:set",

  // Configuration API
  "configuration.get": "configuration:read",
  "configuration.update": "configuration:write",
  "configuration.onDidChange": "configuration:read",

  // Views API
  "views.registerTreeDataProvider": "views:register",
  "views.refreshView": "views:register",

  // Editor Tab API
  "editor.openTab": "editor:openTab",
  "editor.closeTab": "editor:closeTab",
};

// ==================== PermissionGuard 主类 ====================

/**
 * PermissionGuard — 权限守卫
 *
 * 用法：
 * ```ts
 * const realAPI = createPluginAPI(...);  // 真实的 API 实现
 * const guard = new PermissionGuard("translate", ["editor:insertText", "editor:getSelectedText"]);
 * const guardedAPI = guard.wrap(realAPI);
 *
 * // 插件拿到的是 guardedAPI，调用未授权的方法会抛出 PermissionDeniedError
 * await guardedAPI.editor.insertText("hello");      // ✅ 有权限
 * await guardedAPI.editor.getContent();              // ❌ 抛出 PermissionDeniedError
 * ```
 *
 * 设计要点：
 * 1. 使用 Proxy 而非手工包装每个方法
 *    - 好处：新增 API 方法时不需要修改 PermissionGuard
 *    - 只需在 METHOD_PERMISSION_MAP 中添加映射
 * 2. 审计日志记录所有 API 调用（成功和拒绝的）
 *    - 用于调试面板展示插件行为
 *    - 可选功能，通过 setAuditCallback 启用
 * 3. 支持运行时动态修改权限（如用户授权弹窗后补授权限）
 */
export class PermissionGuard {
  /** 插件 ID */
  private pluginId: string;

  /** 已授权的权限集合 */
  private grantedPermissions: Set<string>;

  /** 审计日志回调 */
  private auditCallback: PermissionAuditCallback | null = null;

  /** 审计日志（内存中保留最近 N 条） */
  private auditLog: PermissionAuditEntry[] = [];

  /** 审计日志最大条数 */
  private static readonly MAX_AUDIT_LOG_SIZE = 500;

  /** 被拒绝的调用计数（按权限分组） */
  private deniedCounts: Map<string, number> = new Map();

  /** 是否在拒绝时抛出错误（false 时只记录日志，不阻断调用） */
  private throwOnDeny: boolean;

  constructor(
    pluginId: string,
    permissions: string[],
    options?: {
      throwOnDeny?: boolean;
      auditCallback?: PermissionAuditCallback;
    },
  ) {
    this.pluginId = pluginId;
    this.grantedPermissions = new Set(permissions);
    this.throwOnDeny = options?.throwOnDeny ?? true;
    this.auditCallback = options?.auditCallback ?? null;
  }

  // ==================== 核心方法 ====================

  /**
   * 包装 PluginAPI，返回带权限检查的代理对象
   *
   * 使用 Proxy 拦截每个 namespace 的方法调用：
   * - 调用前检查权限（通过 METHOD_PERMISSION_MAP 映射）
   * - 有权限 → 放行，调用真实 API
   * - 无权限 → 根据 throwOnDeny 决定是否抛出 PermissionDeniedError
   *
   * @param api 真实的 PluginAPI 实现
   * @returns 带权限检查的 PluginAPI 代理
   */
  wrap(api: PluginAPI): PluginAPI {
    return {
      editor: this.wrapNamespace("editor", api.editor),
      commands: this.wrapNamespace("commands", api.commands),
      statusBar: this.wrapNamespace("statusBar", api.statusBar),
      events: this.wrapNamespace("events", api.events),
      storage: this.wrapNamespace("storage", api.storage),
      configuration: this.wrapNamespace("configuration", api.configuration),
      views: this.wrapNamespace("views", api.views),
    };
  }

  /**
   * 包装一个 API namespace（如 editor、commands 等）
   *
   * 为 namespace 对象创建 Proxy，拦截所有方法调用
   */
  private wrapNamespace<T extends object>(namespace: string, target: T): T {
    const guard = this;

    return new Proxy(target, {
      get(obj: T, prop: string | symbol) {
        const value = (obj as Record<string | symbol, unknown>)[prop];

        // 只拦截函数调用，非函数属性直接返回
        if (typeof value !== "function") {
          return value;
        }

        const methodKey = `${namespace}.${String(prop)}`;

        // 返回包装后的函数
        return function (this: unknown, ...args: unknown[]) {
          // 检查权限
          const permission = METHOD_PERMISSION_MAP[methodKey];

          if (permission) {
            const allowed = guard.checkPermission(permission);

            // 记录审计日志
            guard.recordAudit(methodKey, permission, allowed);

            if (!allowed) {
              guard.recordDenied(permission);

              if (guard.throwOnDeny) {
                throw new PermissionDeniedError(guard.pluginId, permission, methodKey);
              } else {
                // 不抛出错误，但返回一个被拒绝的 Promise（对于异步方法）
                // 或 undefined（对于同步方法）
                console.warn(
                  `[PermissionGuard] Plugin "${guard.pluginId}" called "${methodKey}" ` +
                    `without permission "${permission}". Call was silently blocked.`,
                );
                return undefined;
              }
            }
          } else {
            // 没有在映射表中的方法 → 允许调用（宽松模式）
            // 这样新增的 API 方法在没有配置权限映射前不会被阻断
            guard.recordAudit(methodKey, "__unmapped__", true);
          }

          // 权限检查通过，调用真实 API
          return (value as Function).apply(obj, args);
        };
      },
    });
  }

  // ==================== 权限检查 ====================

  /**
   * 检查是否拥有指定权限
   *
   * @param permission 权限字符串（如 "editor:insertText"）
   * @returns 是否有权限
   */
  checkPermission(permission: string): boolean {
    return this.grantedPermissions.has(permission);
  }

  /**
   * 检查是否拥有所有指定权限
   *
   * @param permissions 权限列表
   * @returns 是否全部拥有
   */
  checkAllPermissions(permissions: string[]): boolean {
    return permissions.every((p) => this.grantedPermissions.has(p));
  }

  /**
   * 检查是否拥有任一指定权限
   *
   * @param permissions 权限列表
   * @returns 是否拥有其中任一权限
   */
  checkAnyPermission(permissions: string[]): boolean {
    return permissions.some((p) => this.grantedPermissions.has(p));
  }

  // ==================== 权限动态管理 ====================

  /**
   * 授予额外权限
   *
   * 用途：用户在权限请求弹窗中授权后，动态补充权限
   *
   * @param permission 要授予的权限
   */
  grant(permission: string): void {
    this.grantedPermissions.add(permission);
  }

  /**
   * 批量授予权限
   */
  grantAll(permissions: string[]): void {
    for (const p of permissions) {
      this.grantedPermissions.add(p);
    }
  }

  /**
   * 撤销权限
   *
   * @param permission 要撤销的权限
   */
  revoke(permission: string): void {
    this.grantedPermissions.delete(permission);
  }

  /**
   * 获取当前已授权的权限列表
   */
  getGrantedPermissions(): string[] {
    return Array.from(this.grantedPermissions);
  }

  /**
   * 获取插件需要但尚未拥有的权限列表
   *
   * @param requiredPermissions 插件需要的权限
   * @returns 缺少的权限列表
   */
  getMissingPermissions(requiredPermissions: string[]): string[] {
    return requiredPermissions.filter((p) => !this.grantedPermissions.has(p));
  }

  // ==================== 审计日志 ====================

  /**
   * 设置审计日志回调
   *
   * @param callback 审计日志回调函数
   */
  setAuditCallback(callback: PermissionAuditCallback | null): void {
    this.auditCallback = callback;
  }

  /**
   * 记录审计日志
   */
  private recordAudit(method: string, permission: string, allowed: boolean): void {
    const entry: PermissionAuditEntry = {
      pluginId: this.pluginId,
      method,
      permission,
      allowed,
      timestamp: Date.now(),
    };

    // 添加到内存日志
    this.auditLog.push(entry);
    if (this.auditLog.length > PermissionGuard.MAX_AUDIT_LOG_SIZE) {
      // 移除最旧的一半
      this.auditLog = this.auditLog.slice(Math.floor(PermissionGuard.MAX_AUDIT_LOG_SIZE / 2));
    }

    // 回调通知
    if (this.auditCallback) {
      try {
        this.auditCallback(entry);
      } catch (error) {
        console.error("[PermissionGuard] Error in audit callback:", error);
      }
    }
  }

  /**
   * 记录被拒绝的调用计数
   */
  private recordDenied(permission: string): void {
    this.deniedCounts.set(permission, (this.deniedCounts.get(permission) ?? 0) + 1);
  }

  /**
   * 获取审计日志
   *
   * @param limit 返回的最大条数（默认 100）
   * @returns 审计日志（最新的在前）
   */
  getAuditLog(limit: number = 100): PermissionAuditEntry[] {
    return this.auditLog.slice(-limit).reverse();
  }

  /**
   * 获取被拒绝的调用统计
   *
   * @returns key = 权限字符串, value = 被拒绝的次数
   */
  getDeniedStats(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [permission, count] of this.deniedCounts) {
      result[permission] = count;
    }
    return result;
  }

  /**
   * 清空审计日志
   */
  clearAuditLog(): void {
    this.auditLog = [];
    this.deniedCounts.clear();
  }

  // ==================== 诊断 ====================

  /**
   * 获取权限守卫的诊断信息
   */
  getDiagnostics(): PermissionGuardDiagnostics {
    const denied = this.auditLog.filter((e) => !e.allowed);
    const allowed = this.auditLog.filter((e) => e.allowed);

    return {
      pluginId: this.pluginId,
      grantedPermissions: this.getGrantedPermissions(),
      throwOnDeny: this.throwOnDeny,
      totalCalls: this.auditLog.length,
      allowedCalls: allowed.length,
      deniedCalls: denied.length,
      deniedStats: this.getDeniedStats(),
      recentDenied: denied
        .slice(-10)
        .reverse()
        .map((e) => ({
          method: e.method,
          permission: e.permission,
          timestamp: e.timestamp,
        })),
    };
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建带权限保护的 PluginAPI
 *
 * 便捷工厂函数，一步完成 PermissionGuard 创建和 API 包装
 *
 * @param pluginId    插件 ID
 * @param permissions 插件声明的权限列表
 * @param api         真实的 PluginAPI 实现
 * @param options     可选配置
 * @returns { guardedAPI, guard } 包装后的 API 和 PermissionGuard 实例
 */
export function createGuardedAPI(
  pluginId: string,
  permissions: string[],
  api: PluginAPI,
  options?: {
    throwOnDeny?: boolean;
    auditCallback?: PermissionAuditCallback;
  },
): { guardedAPI: PluginAPI; guard: PermissionGuard } {
  const guard = new PermissionGuard(pluginId, permissions, options);
  const guardedAPI = guard.wrap(api);
  return { guardedAPI, guard };
}

/**
 * 获取所有已知的权限列表
 *
 * 从 METHOD_PERMISSION_MAP 中提取所有唯一的权限值
 * 加上 UI 层面的权限（不在方法映射中但在 Manifest 中声明的）
 */
export function getAllKnownPermissions(): string[] {
  const permissions = new Set<string>(Object.values(METHOD_PERMISSION_MAP));
  // 添加 UI 级别的权限
  permissions.add("ui:selectionToolbar");
  return Array.from(permissions);
}

/**
 * 获取指定 API 方法需要的权限
 *
 * @param method API 方法（如 "editor.insertText"）
 * @returns 需要的权限，如果方法不在映射表中则返回 null
 */
export function getRequiredPermission(method: string): string | null {
  return METHOD_PERMISSION_MAP[method] ?? null;
}

// ==================== 诊断类型 ====================

export interface PermissionGuardDiagnostics {
  pluginId: string;
  grantedPermissions: string[];
  throwOnDeny: boolean;
  totalCalls: number;
  allowedCalls: number;
  deniedCalls: number;
  deniedStats: Record<string, number>;
  recentDenied: Array<{
    method: string;
    permission: string;
    timestamp: number;
  }>;
}
