"use client";

import { useState, useMemo } from "react";
import {
  PermissionManager,
  PermissionProvider,
  usePermission,
  Permission,
} from "@/permission-system/Permission";

// ==================== 用户类型 ====================

interface User {
  id: string;
  name: string;
  roles?: string[];
}

// ==================== 订单类型 ====================

interface Order {
  id: string;
  userId: string;
  amount: number;
  status: "pending" | "paid" | "shipped";
}

// ==================== 创建权限管理器 ====================

function createPermissionManager() {
  const manager = new PermissionManager<User>();

  // 定义角色
  manager.defineRoles([
    {
      name: "guest",
      permissions: ["order:view"],
    },
    {
      name: "user",
      permissions: ["order:view", "order:create", "profile:view", "profile:edit"],
      extends: ["guest"],
    },
    {
      name: "vip",
      permissions: ["order:export", "support:priority"],
      extends: ["user"],
    },
    {
      name: "operator",
      permissions: ["order:*", "user:view"],
      extends: ["user"],
    },
    {
      name: "admin",
      permissions: ["*"], // 超级权限
    },
  ]);

  // 添加策略：用户只能编辑自己的订单
  manager.addPolicy<Order>({
    name: "own-order-edit",
    resourceType: "order",
    actions: ["edit", "cancel"],
    check: (user, order) => order.userId === user.id,
  });

  // 添加策略：VIP 可以编辑任何待处理订单
  manager.addPolicy<Order>({
    name: "vip-pending-order",
    resourceType: "order",
    actions: ["edit"],
    check: (user, order) => (user.roles?.includes("vip") ?? false) && order.status === "pending",
  });

  return manager;
}

// ==================== 模拟数据 ====================

const USERS: User[] = [
  { id: "u1", name: "游客", roles: ["guest"] },
  { id: "u2", name: "普通用户", roles: ["user"] },
  { id: "u3", name: "VIP 用户", roles: ["vip"] },
  { id: "u4", name: "运营人员", roles: ["operator"] },
  { id: "u5", name: "管理员", roles: ["admin"] },
];

const ORDERS: Order[] = [
  { id: "ord1", userId: "u2", amount: 199, status: "pending" },
  { id: "ord2", userId: "u3", amount: 599, status: "paid" },
  { id: "ord3", userId: "u2", amount: 99, status: "shipped" },
];

// ==================== Demo 内容组件 ====================

function DemoContent() {
  const { can, permissions, user } = usePermission();
  const [checkResult, setCheckResult] = useState<{
    permission: string;
    result: boolean;
    order?: Order;
  } | null>(null);

  // 权限列表
  const allPermissions = [
    "order:view",
    "order:create",
    "order:edit",
    "order:delete",
    "order:export",
    "profile:view",
    "profile:edit",
    "user:view",
    "user:delete",
    "support:priority",
  ];

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* 左侧：权限列表 */}
      <div className="space-y-4">
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            👤 当前用户权限
          </h3>
          <div className="text-xs text-gray-400 mb-3">
            角色: {user?.roles?.join(", ") || "无"}
          </div>
          <div className="space-y-1 font-mono text-xs">
            {allPermissions.map((perm) => {
              const allowed = can(perm);
              return (
                <div
                  key={perm}
                  className={`flex items-center gap-2 px-2 py-1 rounded ${
                    allowed ? "bg-green-500/10" : "bg-gray-700/30"
                  }`}
                >
                  <span className={allowed ? "text-green-400" : "text-gray-600"}>
                    {allowed ? "✓" : "✗"}
                  </span>
                  <span className={allowed ? "text-gray-300" : "text-gray-600"}>
                    {perm}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 实际权限集合 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">📋 权限集合</h3>
          <div className="font-mono text-xs text-blue-400 space-y-0.5">
            {Array.from(permissions).map((p) => (
              <div key={p}>{p}</div>
            ))}
            {permissions.size === 0 && (
              <div className="text-gray-600">无权限</div>
            )}
          </div>
        </div>
      </div>

      {/* 中间：操作演示 */}
      <div className="space-y-4">
        {/* 按钮级权限 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">🔘 按钮级权限</h3>
          <div className="space-y-2">
            <Permission rule="order:create">
              <button className="w-full px-3 py-2 rounded-lg text-sm bg-blue-500 text-white">
                创建订单
              </button>
            </Permission>
            <Permission rule="order:create" fallback={
              <button className="w-full px-3 py-2 rounded-lg text-sm bg-gray-700 text-gray-500 cursor-not-allowed" disabled>
                创建订单 (无权限)
              </button>
            }>
              <button className="w-full px-3 py-2 rounded-lg text-sm bg-blue-500 text-white">
                创建订单
              </button>
            </Permission>

            <Permission rule="order:export">
              <button className="w-full px-3 py-2 rounded-lg text-sm bg-green-500 text-white">
                导出订单
              </button>
            </Permission>
            <Permission rule="order:export" fallback={
              <button className="w-full px-3 py-2 rounded-lg text-sm bg-gray-700 text-gray-500 cursor-not-allowed" disabled>
                导出订单 (VIP 专属)
              </button>
            }>
              <button className="w-full px-3 py-2 rounded-lg text-sm bg-green-500 text-white">
                导出订单
              </button>
            </Permission>

            <Permission rule="user:delete">
              <button className="w-full px-3 py-2 rounded-lg text-sm bg-red-500 text-white">
                删除用户 (管理员)
              </button>
            </Permission>
            <Permission rule="user:delete" fallback={
              <button className="w-full px-3 py-2 rounded-lg text-sm bg-gray-700 text-gray-500 cursor-not-allowed" disabled>
                删除用户 (管理员专属)
              </button>
            }>
              <button className="w-full px-3 py-2 rounded-lg text-sm bg-red-500 text-white">
                删除用户 (管理员)
              </button>
            </Permission>
          </div>
        </div>

        {/* 资源级权限（策略） */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">📦 资源级权限</h3>
          <div className="space-y-2">
            {ORDERS.map((order) => {
              const canEdit = can("order:edit", { type: "order", data: order });
              const isOwn = order.userId === user?.id;

              return (
                <div
                  key={order.id}
                  className="p-3 rounded-lg bg-gray-700/30 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-300">{order.id}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                        order.status === "pending"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : order.status === "paid"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-blue-500/20 text-blue-400"
                      }`}>
                        {order.status}
                      </span>
                      {isOwn && (
                        <span className="ml-2 text-xs text-purple-400">(我的)</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-400">¥{order.amount}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCheckResult({ permission: "order:edit", result: canEdit, order })}
                      className={`flex-1 px-2 py-1 rounded text-xs ${
                        canEdit
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-gray-600/20 text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      编辑 {canEdit ? "✓" : "✗"}
                    </button>
                    <button
                      onClick={() => {
                        const canCancel = can("order:cancel", { type: "order", data: order });
                        setCheckResult({ permission: "order:cancel", result: canCancel, order });
                      }}
                      className="flex-1 px-2 py-1 rounded text-xs bg-gray-600/20 text-gray-400"
                    >
                      取消
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 右侧：检查结果 */}
      <div className="space-y-4">
        {checkResult && (
          <div className={`rounded-xl p-4 border ${
            checkResult.result
              ? "bg-green-500/10 border-green-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}>
            <h3 className="text-sm font-medium text-gray-300 mb-2">权限检查结果</h3>
            <div className="font-mono text-xs space-y-1">
              <div>
                <span className="text-gray-500">权限: </span>
                <span className="text-blue-400">{checkResult.permission}</span>
              </div>
              <div>
                <span className="text-gray-500">结果: </span>
                <span className={checkResult.result ? "text-green-400" : "text-red-400"}>
                  {checkResult.result ? "允许" : "拒绝"}
                </span>
              </div>
              {checkResult.order && (
                <>
                  <div>
                    <span className="text-gray-500">资源: </span>
                    <span className="text-gray-300">{checkResult.order.id}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">所有者: </span>
                    <span className="text-gray-300">{checkResult.order.userId}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 代码示例 */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">代码示例</h3>
          <pre className="font-mono text-xs text-gray-400 overflow-x-auto">
{`// 声明式组件
<Permission rule="order:create">
  <CreateButton />
</Permission>

// Hook 方式
const { can } = usePermission();
if (can("order:edit", {
  type: "order",
  data: order
})) {
  // 允许编辑
}

// 策略定义
manager.addPolicy({
  name: "own-order-edit",
  resourceType: "order",
  actions: ["edit"],
  check: (user, order) =>
    order.userId === user.id
});`}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ==================== 页面组件 ====================

export default function PermissionSystemPage() {
  const [currentUser, setCurrentUser] = useState<User>(USERS[1]);

  const permissionManager = useMemo(() => createPermissionManager(), []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">🔐 权限系统</h1>
      <p className="text-sm text-gray-500 mb-6">
        声明式权限 + 策略组合，支持角色继承、通配符、资源级权限。
      </p>

      {/* 用户切换 */}
      <div className="mb-6 flex items-center gap-2">
        <span className="text-sm text-gray-400">切换用户:</span>
        {USERS.map((u) => (
          <button
            key={u.id}
            onClick={() => setCurrentUser(u)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
              currentUser.id === u.id
                ? "bg-blue-500 text-white"
                : "bg-gray-700/50 text-gray-400 hover:bg-gray-600/50"
            }`}
          >
            {u.name}
          </button>
        ))}
      </div>

      {/* 权限内容 */}
      <PermissionProvider manager={permissionManager} user={currentUser}>
        <DemoContent />
      </PermissionProvider>

      {/* 底部说明 */}
      <div className="mt-8 p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
        <h3 className="text-sm font-medium text-gray-300 mb-2">💡 架构要点</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• <span className="text-gray-300">角色继承</span> - VIP extends User extends Guest</li>
          <li>• <span className="text-gray-300">通配符</span> - "order:*" 匹配所有订单操作，"*" 是超级权限</li>
          <li>• <span className="text-gray-300">策略</span> - 动态判断，如"只能编辑自己的订单"</li>
          <li>• <span className="text-gray-300">声明式</span> - {"<Permission rule=\"...\">"}，无需手动 if-else</li>
        </ul>
      </div>
    </div>
  );
}
