"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DEMO_TITLES: Record<string, string> = {
  "/demos": "Demo 广场",
  "/demos/price-engine": "价格计算引擎",
  "/demos/canvas-annotator": "截图标注工具",
  "/demos/rich-editor": "富文本编辑器",
  "/demos/plugin-host": "VS Code 级插件系统",
  "/plugin-demo": "插件架构演示",
};

const DEMO_ICONS: Record<string, string> = {
  "/demos": "🎮",
  "/demos/price-engine": "💰",
  "/demos/canvas-annotator": "🎨",
  "/demos/rich-editor": "📝",
  "/demos/plugin-host": "🧩",
  "/plugin-demo": "🧩",
};

export default function DemosLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = DEMO_TITLES[pathname] ?? "Demo";
  const icon = DEMO_ICONS[pathname] ?? "🎮";

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm">
        <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* 左侧：返回 + 面包屑 */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-all shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              <span>首页</span>
            </Link>

            <span className="text-gray-700 text-sm select-none">/</span>

            {pathname !== "/demos" && (
              <>
                <Link
                  href="/demos"
                  className="text-sm text-gray-400 hover:text-white transition-colors shrink-0"
                >
                  Demo 广场
                </Link>
                <span className="text-gray-700 text-sm select-none">/</span>
              </>
            )}

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base leading-none">{icon}</span>
              <h1 className="text-sm font-semibold text-white truncate">{title}</h1>
            </div>
          </div>

          {/* 右侧：Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500 hidden sm:block">高级前端架构设计</span>
            <div className="w-px h-4 bg-gray-700 hidden sm:block" />
            <span className="text-xs font-mono text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded">
              Demo
            </span>
          </div>
        </div>
      </header>

      {/* 内容区 */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
