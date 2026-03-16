"use client";

import Link from "next/link";

// ==================== Demo 卡片数据 ====================
interface DemoCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  icon: string;
  tags: string[];
  difficulty: number;
  status: "ready" | "coming";
  gradient: string;
  pattern: string;
}

const DEMO_CARDS: DemoCard[] = [
  // ==================== 基础设施层 ====================
  {
    id: "di-container",
    title: "依赖注入容器",
    subtitle: "Token + Provider + Scope + Factory",
    description:
      "轻量级 DI 容器：Token 解耦依赖、singleton/transient/scoped 作用域、Factory 延迟创建、支持依赖链自动解析，切换实现无需修改业务代码。",
    href: "/demos/di-container",
    icon: "💉",
    tags: ["DI", "IoC", "解耦", "可测试性"],
    difficulty: 3,
    status: "ready",
    gradient: "from-cyan-500/20 via-blue-500/10 to-transparent",
    pattern: "plugin",
  },
  {
    id: "hook-system",
    title: "Hook 钩子系统",
    subtitle: "SyncHook + AsyncHook + Waterfall + Bail",
    description:
      "对标 Webpack Tapable：同步/异步钩子、瀑布流（数据依次变换）、熔断（首个返回值即停止）、优先级控制执行顺序，实现插件化架构的基础。",
    href: "/demos/hook-system",
    icon: "🪝",
    tags: ["Hook", "插件化", "可扩展", "Tapable"],
    difficulty: 3,
    status: "ready",
    gradient: "from-violet-500/20 via-purple-500/10 to-transparent",
    pattern: "plugin",
  },
  {
    id: "event-bus",
    title: "事件总线",
    subtitle: "Pub/Sub + 类型安全 + 命名空间",
    description:
      "类型安全的发布/订阅模式：事件名和 payload 都有类型检查、命名空间隔离、事件历史追溯、waitFor Promise 化，解耦组件间通信。",
    href: "/demos/event-bus",
    icon: "📡",
    tags: ["Pub/Sub", "解耦", "类型安全", "事件驱动"],
    difficulty: 2,
    status: "ready",
    gradient: "from-pink-500/20 via-rose-500/10 to-transparent",
    pattern: "plugin",
  },
  // ==================== 业务支撑层 ====================
  {
    id: "permission-system",
    title: "权限系统",
    subtitle: "Role + Permission + Policy + Guard",
    description:
      "声明式权限管理：角色继承、通配符匹配、动态策略（只能编辑自己的订单）、React 组件集成，告别 if-else 权限判断。",
    href: "/demos/permission-system",
    icon: "🔐",
    tags: ["RBAC", "策略模式", "声明式", "权限控制"],
    difficulty: 3,
    status: "ready",
    gradient: "from-red-500/20 via-orange-500/10 to-transparent",
    pattern: "tenant",
  },
  {
    id: "config-center",
    title: "配置中心",
    subtitle: "分层配置 + 热更新 + 持久化",
    description:
      "分层配置管理：defaults → env → user 优先级覆盖、深度合并嵌套对象、TypeScript 类型安全、自动持久化到 localStorage、订阅变化自动更新。",
    href: "/demos/config-center",
    icon: "⚙️",
    tags: ["配置管理", "分层覆盖", "热更新", "持久化"],
    difficulty: 2,
    status: "ready",
    gradient: "from-amber-500/20 via-yellow-500/10 to-transparent",
    pattern: "pipeline",
  },
  {
    id: "cache-manager",
    title: "缓存管理器",
    subtitle: "LRU + TTL + Tag + 自动淘汰",
    description:
      "高级缓存管理：LRU 最近最少使用淘汰、TTL 自动过期、标签批量失效、getOrSet 懒加载、命中率统计，告别手动清理缓存。",
    href: "/demos/cache-manager",
    icon: "📦",
    tags: ["LRU", "TTL", "缓存", "性能优化"],
    difficulty: 3,
    status: "ready",
    gradient: "from-teal-500/20 via-green-500/10 to-transparent",
    pattern: "price",
  },
  // ==================== 网络层 ====================
  {
    id: "websocket-manager",
    title: "WebSocket 管理器",
    subtitle: "自动重连 + 心跳 + 订阅管理",
    description:
      "WebSocket 连接管理：断线自动重连（指数退避）、心跳检测保活、频道订阅/取消、离线消息队列、重连后自动重新订阅，适用于实时行情推送。",
    href: "/demos/websocket-manager",
    icon: "🔌",
    tags: ["WebSocket", "实时通信", "重连", "心跳"],
    difficulty: 3,
    status: "ready",
    gradient: "from-blue-500/20 via-indigo-500/10 to-transparent",
    pattern: "plugin",
  },
  {
    id: "request-layer",
    title: "请求层",
    subtitle: "拦截器 + 重试 + 缓存 + 并发控制",
    description:
      "统一 HTTP 请求管理：请求/响应/错误拦截器、失败自动重试、响应缓存、AbortController 取消、并发限制排队，告别重复的请求处理代码。",
    href: "/demos/request-layer",
    icon: "🌐",
    tags: ["HTTP", "拦截器", "重试", "缓存"],
    difficulty: 3,
    status: "ready",
    gradient: "from-sky-500/20 via-cyan-500/10 to-transparent",
    pattern: "pipeline",
  },
  // ==================== 原有 Demo ====================
  {
    id: "plugin-host",
    title: "VS Code 级插件系统",
    subtitle: "Manifest + 按需激活 + Worker 沙箱 + 权限模型",
    description:
      "对标 VS Code 的插件宿主架构：Manifest 声明式贡献点、activationEvents 按需懒加载、ContextKeyService when 条件求值、PermissionGuard 权限拦截、选中浮动工具条由插件驱动、运行时 install/uninstall。",
    href: "/demos/plugin-host",
    icon: "🧩",
    tags: ["Plugin Host", "Manifest", "沙箱隔离", "权限模型", "按需激活"],
    difficulty: 5,
    status: "ready",
    gradient: "from-indigo-500/20 via-blue-500/10 to-transparent",
    pattern: "plugin",
  },
  {
    id: "plugin-system",
    title: "插件架构演示",
    subtitle: "PluginHost + 扩展点 + 事件总线",
    description:
      "完整的前端插件系统：扩展点（Pull 拉取）与事件总线（Push 推送）双模式、插件热插拔、快捷键声明式注册、原型链共享 Context，参考 Tiptap/ProseMirror 设计。",
    href: "/plugin-demo",
    icon: "🧩",
    tags: ["插件系统", "策略模式", "发布订阅", "IoC"],
    difficulty: 4,
    status: "ready",
    gradient: "from-blue-500/20 via-purple-500/10 to-transparent",
    pattern: "plugin",
  },
  {
    id: "price-engine",
    title: "价格计算引擎",
    subtitle: "规则引擎 + 策略模式 + 优先级调度",
    description:
      "电商复杂优惠规则处理：秒杀价修正 → 会员折扣 → 满减活动 → 优惠券（最优券策略）→ 地区补贴，五条规则按 priority 依次叠加，支持实时开关任意规则、查看执行日志。",
    href: "/demos/price-engine",
    icon: "💰",
    tags: ["规则引擎", "策略模式", "优先级", "电商"],
    difficulty: 3,
    status: "ready",
    gradient: "from-green-500/20 via-emerald-500/10 to-transparent",
    pattern: "price",
  },
  {
    id: "pipeline",
    title: "管道模式",
    subtitle: "Pipeline + 步骤链 + 数据变换",
    description:
      "数据依次流经一组独立步骤，每步只做一件事。可实时开关任意步骤，观察输入如何被逐步变换。",
    href: "/demos/pipeline",
    icon: "🔧",
    tags: ["管道模式", "函数组合", "数据变换"],
    difficulty: 2,
    status: "ready",
    gradient: "from-orange-500/20 via-amber-500/10 to-transparent",
    pattern: "pipeline",
  },
  {
    id: "multi-tenant",
    title: "多租户",
    subtitle: "租户注册表 + 配置隔离 + 功能开关",
    description: "同一套系统，不同租户有独立的配置、功能权限和数据。切换租户，直观看到隔离效果。",
    href: "/demos/multi-tenant",
    icon: "🏢",
    tags: ["多租户", "配置中心", "权限控制"],
    difficulty: 2,
    status: "ready",
    gradient: "from-purple-500/20 via-violet-500/10 to-transparent",
    pattern: "tenant",
  },
  {
    id: "canvas-annotator",
    title: "截图标注工具",
    subtitle: "Command + Strategy + Undo/Redo",
    description:
      "对标 Excalidraw/Figma 的截图标注工具：Action/ActionManager 命令模式、Tool 策略模式（画笔/矩形/圆形/箭头/文字/橡皮擦/选择）、HistoryManager 撤销重做栈、二级属性面板动态渲染。",
    href: "/demos/canvas-annotator",
    icon: "🎨",
    tags: ["Command 模式", "Strategy 模式", "Undo/Redo", "Canvas"],
    difficulty: 4,
    status: "ready",
    gradient: "from-rose-500/20 via-pink-500/10 to-transparent",
    pattern: "annotator",
  },
  {
    id: "rich-editor",
    title: "富文本编辑器",
    subtitle: "Editor Extension + BubbleMenu + Transaction",
    description:
      "对标 medium-editor/Tiptap：Extension/Button/Form 三层模型、Selection 驱动按钮状态、EditorState + Transaction 不可变状态流转、固定 Toolbar + 浮动 BubbleMenu 同一套机制、字数统计、自动保存。",
    href: "/demos/rich-editor",
    icon: "📝",
    tags: ["Extension 模型", "Selection 驱动", "Transaction", "BubbleMenu"],
    difficulty: 4,
    status: "ready",
    gradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
    pattern: "editor",
  },
];

// ==================== 辅助组件 ====================
function DifficultyDots({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            i < value ? "bg-amber-400" : "bg-gray-700"
          }`}
        />
      ))}
    </div>
  );
}

function PatternBg({ pattern }: { pattern: string }) {
  if (pattern === "annotator") {
    return (
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="annotator-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <rect
              x="8"
              y="8"
              width="32"
              height="32"
              rx="4"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <line x1="8" y1="8" x2="40" y2="40" stroke="white" strokeWidth="0.5" />
            <circle cx="24" cy="24" r="6" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#annotator-grid)" />
      </svg>
    );
  }
  if (pattern === "editor") {
    return (
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="editor-grid" width="48" height="24" patternUnits="userSpaceOnUse">
            <line x1="0" y1="12" x2="48" y2="12" stroke="white" strokeWidth="0.5" />
            <rect x="4" y="6" width="14" height="4" rx="1" fill="white" opacity="0.5" />
            <rect x="22" y="6" width="8" height="4" rx="1" fill="white" opacity="0.3" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#editor-grid)" />
      </svg>
    );
  }
  if (pattern === "pipeline") {
    return (
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="pipe-grid" width="40" height="20" patternUnits="userSpaceOnUse">
            <line x1="0" y1="10" x2="40" y2="10" stroke="white" strokeWidth="1" />
            <circle cx="20" cy="10" r="2" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pipe-grid)" />
      </svg>
    );
  }
  if (pattern === "tenant") {
    return (
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="tenant-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect
              x="4"
              y="4"
              width="32"
              height="32"
              rx="2"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <rect x="12" y="4" width="16" height="8" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tenant-grid)" />
      </svg>
    );
  }
  if (pattern === "plugin") {
    return (
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="plug-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="3" fill="white" />
            <line x1="20" y1="0" x2="20" y2="14" stroke="white" strokeWidth="1" />
            <line x1="20" y1="26" x2="20" y2="40" stroke="white" strokeWidth="1" />
            <line x1="0" y1="20" x2="14" y2="20" stroke="white" strokeWidth="1" />
            <line x1="26" y1="20" x2="40" y2="20" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#plug-grid)" />
      </svg>
    );
  }
  if (pattern === "price") {
    return (
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="price-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <rect
              x="8"
              y="8"
              width="32"
              height="32"
              rx="4"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <line x1="24" y1="4" x2="24" y2="16" stroke="white" strokeWidth="1.5" />
            <line x1="24" y1="32" x2="24" y2="44" stroke="white" strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#price-grid)" />
      </svg>
    );
  }
  return null;
}

function ComingSoonCard() {
  return (
    <div className="relative rounded-2xl border border-dashed border-gray-700/60 bg-gray-800/20 p-6 flex flex-col items-center justify-center gap-3 min-h-[280px] group cursor-default">
      <div className="w-12 h-12 rounded-xl border border-dashed border-gray-600 flex items-center justify-center text-2xl text-gray-600 group-hover:border-gray-500 group-hover:text-gray-500 transition-all">
        +
      </div>
      <p className="text-sm text-gray-600 group-hover:text-gray-500 transition-colors">
        更多 Demo 即将上线
      </p>
    </div>
  );
}

// ==================== 主卡片 ====================
function DemoCard({ card }: { card: DemoCard }) {
  const isReady = card.status === "ready";

  const inner = (
    <div
      className={`
        relative rounded-2xl border overflow-hidden flex flex-col min-h-[280px]
        transition-all duration-300 group
        ${
          isReady
            ? "border-gray-700/80 bg-gray-800/40 hover:border-gray-600 hover:bg-gray-800/70 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/40 cursor-pointer"
            : "border-gray-700/40 bg-gray-800/20 opacity-60 cursor-not-allowed"
        }
      `}
    >
      {/* 渐变背景 */}
      <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} pointer-events-none`} />
      {/* 图案背景 */}
      <PatternBg pattern={card.pattern} />

      {/* 内容 */}
      <div className="relative flex flex-col flex-1 p-6 gap-4">
        {/* 顶部：图标 + 状态 */}
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-xl bg-gray-700/60 flex items-center justify-center text-2xl shadow-inner border border-gray-600/30 group-hover:scale-110 transition-transform duration-300">
            {card.icon}
          </div>
          {card.status === "coming" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 border border-gray-600 shrink-0">
              即将上线
            </span>
          )}
          {card.status === "ready" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 shrink-0">
              可体验
            </span>
          )}
        </div>

        {/* 标题 */}
        <div>
          <h2 className="text-lg font-bold text-white group-hover:text-white leading-snug">
            {card.title}
          </h2>
          <p className="text-sm text-gray-400 mt-0.5 leading-snug">{card.subtitle}</p>
        </div>

        {/* 描述 */}
        <p className="text-sm text-gray-500 leading-relaxed flex-1 group-hover:text-gray-400 transition-colors">
          {card.description}
        </p>

        {/* 底部：标签 + 难度 + 箭头 */}
        <div className="flex items-end justify-between gap-2 pt-2 border-t border-gray-700/50">
          <div className="flex flex-wrap gap-1.5">
            {card.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-md bg-gray-700/60 text-gray-400 border border-gray-600/30"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <DifficultyDots value={card.difficulty} />
            {isReady && (
              <div className="w-7 h-7 rounded-full bg-gray-700/60 border border-gray-600/40 flex items-center justify-center group-hover:bg-blue-500/20 group-hover:border-blue-500/40 transition-all">
                <svg
                  className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (!isReady) return inner;
  return (
    <Link href={card.href} className="block">
      {inner}
    </Link>
  );
}

// ==================== 统计条 ====================
function StatsBar() {
  const readyCount = DEMO_CARDS.filter((c) => c.status === "ready").length;
  const totalTags = [...new Set(DEMO_CARDS.flatMap((c) => c.tags))].length;

  return (
    <div className="flex items-center gap-6 text-sm text-gray-500">
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span>{readyCount} 个可体验</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-purple-400" />
        <span>{totalTags} 个技术标签</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-blue-400" />
        <span>持续更新中</span>
      </div>
    </div>
  );
}

// ==================== 页面入口 ====================
export default function DemosPage() {
  return (
    <div className="max-w-screen-xl mx-auto px-6 py-10">
      {/* 页头 */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Interactive
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Architecture
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">
          Demo{" "}
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            广场
          </span>
        </h1>
        <p className="text-gray-400 text-sm leading-relaxed max-w-xl">
          每个 Demo 都是一个可交互的完整实现，对应首页中某个架构设计场景的"优雅设计"版本，
          <br />
          可以直接操作、修改参数，观察系统的运行行为。
        </p>
        <div className="mt-4">
          <StatsBar />
        </div>
      </div>

      {/* 卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {DEMO_CARDS.map((card) => (
          <DemoCard key={card.id} card={card} />
        ))}
        {/* 占位卡片 */}
        <ComingSoonCard />
        <ComingSoonCard />
      </div>

      {/* 底部说明 */}
      <div className="mt-12 pt-8 border-t border-gray-800 text-center">
        <p className="text-xs text-gray-600">
          所有 Demo 均为纯前端实现，无需后端接口，代码位于{" "}
          <code className="font-mono bg-gray-800 px-1 py-0.5 rounded text-gray-400">src/</code>{" "}
          目录，可直接阅读源码。
        </p>
      </div>
    </div>
  );
}
