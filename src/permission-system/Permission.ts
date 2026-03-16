/**
 * 声明式权限系统
 *
 * 核心概念：
 * 1. Permission（权限）- 最小权限单元，如 "order:create"
 * 2. Role（角色）- 权限集合，如 "admin" 包含所有权限
 * 3. Policy（策略）- 动态权限判断，如 "只能编辑自己的订单"
 * 4. Resource（资源）- 被保护的对象
 *
 * 权限格式：
 * - "module:action" - 如 "order:create", "user:delete"
 * - 支持通配符 "*" - 如 "order:*" 表示订单的所有操作
 *
 * 解决的问题：
 * - 权限散落各处 → 集中管理
 * - 硬编码判断 → 声明式规则
 * - 难以维护 → 策略可组合
 */

// ==================== 类型定义 ====================

/** 权限字符串，格式: "module:action" */
export type PermissionString = string;

/** 角色定义 */
export interface RoleDefinition {
  name: string;
  permissions: PermissionString[];
  /** 继承其他角色 */
  extends?: string[];
}

/** 策略函数 - 动态判断权限 */
export type PolicyFn<TUser = unknown, TResource = unknown> = (
  user: TUser,
  resource: TResource,
  action: string,
) => boolean;

/** 策略定义 */
export interface PolicyDefinition<TUser = unknown, TResource = unknown> {
  name: string;
  /** 适用的资源类型 */
  resourceType: string;
  /** 适用的操作（可选，不填则适用所有操作） */
  actions?: string[];
  /** 判断函数 */
  check: PolicyFn<TUser, TResource>;
}

/** 权限检查上下文 */
export interface PermissionContext<TUser = unknown> {
  user: TUser;
  permissions: Set<PermissionString>;
  roles: Set<string>;
}

/** 权限检查结果 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  matchedBy?: "permission" | "role" | "policy" | "denied";
}

// ==================== PermissionManager ====================

/**
 * 权限管理器
 */
export class PermissionManager<TUser extends { id: string; roles?: string[] } = { id: string; roles?: string[] }> {
  private roles = new Map<string, RoleDefinition>();
  private policies: PolicyDefinition<TUser, unknown>[] = [];
  private deniedPermissions = new Set<PermissionString>();

  /**
   * 定义角色
   */
  defineRole(role: RoleDefinition): this {
    this.roles.set(role.name, role);
    return this;
  }

  /**
   * 批量定义角色
   */
  defineRoles(roles: RoleDefinition[]): this {
    for (const role of roles) {
      this.defineRole(role);
    }
    return this;
  }

  /**
   * 添加策略
   */
  addPolicy<TResource>(policy: PolicyDefinition<TUser, TResource>): this {
    this.policies.push(policy as PolicyDefinition<TUser, unknown>);
    return this;
  }

  /**
   * 获取角色的所有权限（包括继承）
   */
  getRolePermissions(roleName: string, visited = new Set<string>()): Set<PermissionString> {
    if (visited.has(roleName)) return new Set();
    visited.add(roleName);

    const role = this.roles.get(roleName);
    if (!role) return new Set();

    const permissions = new Set(role.permissions);

    // 递归获取继承的权限
    if (role.extends) {
      for (const parentRole of role.extends) {
        const parentPerms = this.getRolePermissions(parentRole, visited);
        for (const perm of parentPerms) {
          permissions.add(perm);
        }
      }
    }

    return permissions;
  }

  /**
   * 获取用户的所有权限
   */
  getUserPermissions(user: TUser): Set<PermissionString> {
    const permissions = new Set<PermissionString>();
    const roles = user.roles ?? [];

    for (const roleName of roles) {
      const rolePerms = this.getRolePermissions(roleName);
      for (const perm of rolePerms) {
        permissions.add(perm);
      }
    }

    return permissions;
  }

  /**
   * 检查权限（静态权限 + 策略）
   */
  check(
    user: TUser,
    permission: PermissionString,
    resource?: { type: string; data: unknown },
  ): PermissionResult {
    // 1. 检查是否被明确拒绝
    if (this.deniedPermissions.has(permission)) {
      return { allowed: false, reason: "Permission explicitly denied", matchedBy: "denied" };
    }

    // 2. 获取用户权限
    const userPermissions = this.getUserPermissions(user);

    // 3. 检查直接权限匹配
    if (this.matchPermission(permission, userPermissions)) {
      return { allowed: true, matchedBy: "permission" };
    }

    // 4. 如果有资源，检查策略
    if (resource) {
      const [, action] = permission.split(":");
      const applicablePolicies = this.policies.filter(
        (p) =>
          p.resourceType === resource.type &&
          (!p.actions || p.actions.includes(action)),
      );

      for (const policy of applicablePolicies) {
        if (policy.check(user, resource.data, action)) {
          return { allowed: true, reason: `Policy: ${policy.name}`, matchedBy: "policy" };
        }
      }
    }

    return { allowed: false, reason: "No matching permission or policy" };
  }

  /**
   * 简化的权限检查（只返回 boolean）
   */
  can(user: TUser, permission: PermissionString, resource?: { type: string; data: unknown }): boolean {
    return this.check(user, permission, resource).allowed;
  }

  /**
   * 批量检查权限
   */
  canAll(user: TUser, permissions: PermissionString[]): boolean {
    return permissions.every((p) => this.can(user, p));
  }

  /**
   * 检查是否有任一权限
   */
  canAny(user: TUser, permissions: PermissionString[]): boolean {
    return permissions.some((p) => this.can(user, p));
  }

  /**
   * 获取所有已定义的角色
   */
  getRoles(): RoleDefinition[] {
    return Array.from(this.roles.values());
  }

  /**
   * 获取所有策略
   */
  getPolicies(): { name: string; resourceType: string; actions?: string[] }[] {
    return this.policies.map((p) => ({
      name: p.name,
      resourceType: p.resourceType,
      actions: p.actions,
    }));
  }

  // ==================== Private ====================

  /**
   * 匹配权限（支持通配符）
   */
  private matchPermission(required: PermissionString, userPermissions: Set<PermissionString>): boolean {
    // 直接匹配
    if (userPermissions.has(required)) return true;

    // 检查通配符
    const [module] = required.split(":");

    // 检查 "module:*" 通配符
    if (userPermissions.has(`${module}:*`)) return true;

    // 检查 "*" 超级权限
    if (userPermissions.has("*")) return true;

    return false;
  }
}

// ==================== React 集成 ====================

import { createContext, useContext, type ReactNode, createElement } from "react";

const PermissionContext = createContext<{
  manager: PermissionManager<{ id: string; roles?: string[] }>;
  user: { id: string; roles?: string[] } | null;
} | null>(null);

/**
 * 权限 Provider
 */
export function PermissionProvider({
  manager,
  user,
  children,
}: {
  manager: PermissionManager<{ id: string; roles?: string[] }>;
  user: { id: string; roles?: string[] } | null;
  children: ReactNode;
}) {
  return createElement(PermissionContext.Provider, { value: { manager, user } }, children);
}

/**
 * 使用权限 Hook
 */
export function usePermission() {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error("usePermission must be used within PermissionProvider");

  return {
    can: (permission: PermissionString, resource?: { type: string; data: unknown }) => {
      if (!ctx.user) return false;
      return ctx.manager.can(ctx.user, permission, resource);
    },
    canAll: (permissions: PermissionString[]) => {
      if (!ctx.user) return false;
      return ctx.manager.canAll(ctx.user, permissions);
    },
    canAny: (permissions: PermissionString[]) => {
      if (!ctx.user) return false;
      return ctx.manager.canAny(ctx.user, permissions);
    },
    user: ctx.user,
    permissions: ctx.user ? ctx.manager.getUserPermissions(ctx.user) : new Set<string>(),
  };
}

/**
 * 权限守卫组件
 */
export function Permission({
  rule,
  resource,
  fallback = null,
  children,
}: {
  rule: PermissionString | PermissionString[];
  resource?: { type: string; data: unknown };
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, canAll } = usePermission();

  const allowed = Array.isArray(rule)
    ? canAll(rule)
    : can(rule, resource);

  return createElement("span", null, allowed ? children : fallback);
}
