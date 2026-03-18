"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const CommonDemo = dynamic(() => import("./CommonDemo"), { ssr: false });
const VSCodeDemo = dynamic(() => import("@/contribution-points/vscode/Demo"), { ssr: false });
const ExcalidrawDemo = dynamic(() => import("@/contribution-points/excalidraw/Demo"), { ssr: false });
const TiptapDemo = dynamic(() => import("@/contribution-points/tiptap/Demo"), { ssr: false });
const YuqueDemo = dynamic(() => import("@/contribution-points/yuque/Demo"), { ssr: false });

// ==================== Tab Definitions ====================

interface TabDef {
  id: string;
  label: string;
  color: string;        // active bg
  borderColor: string;  // active ring
  description: string;
}

const TABS: TabDef[] = [
  {
    id: "common",
    label: "公共模式",
    color: "bg-blue-600",
    borderColor: "shadow-blue-600/20",
    description: "Registry + Contribution Points — 所有插件系统共享的核心模式",
  },
  {
    id: "vscode",
    label: "VSCode",
    color: "bg-blue-500",
    borderColor: "shadow-blue-500/20",
    description: "Manifest + Activation 分离，when 子句，activationEvents 懒加载",
  },
  {
    id: "excalidraw",
    label: "Excalidraw",
    color: "bg-orange-500",
    borderColor: "shadow-orange-500/20",
    description: "Action = 统一对象（数据 + 行为 + UI），keyTest 函数匹配，PanelComponent",
  },
  {
    id: "tiptap",
    label: "Tiptap",
    color: "bg-purple-500",
    borderColor: "shadow-purple-500/20",
    description: "Extension.create() 工厂模式，chain().run() 链式命令，can() 预检查",
  },
  {
    id: "yuque",
    label: "语雀",
    color: "bg-emerald-500",
    borderColor: "shadow-emerald-500/20",
    description: "Config 驱动 + 生命周期钩子（onInit/onDestroy），可选沙箱隔离",
  },
];

// ==================== Page ====================

export default function ContributionPointsPage() {
  const [activeTab, setActiveTab] = useState("common");
  const currentTab = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="max-w-screen-lg mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">
          Contribution Points 渐进式教学
        </h1>
        <p className="text-sm text-gray-400">
          5 个视角揭示插件系统的核心模式 — 从公共抽象到 VSCode / Excalidraw /
          Tiptap / 语雀 的具体实现
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-gray-800/60 rounded-lg border border-gray-700/50 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm rounded-md transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? `${tab.color} text-white shadow-lg ${tab.borderColor}`
                : "text-gray-400 hover:text-white hover:bg-gray-700/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Description */}
      <div className="text-xs text-gray-500">
        {currentTab.description}
      </div>

      {/* Tab Content */}
      {activeTab === "common" && <CommonDemo />}
      {activeTab === "vscode" && <VSCodeDemo />}
      {activeTab === "excalidraw" && <ExcalidrawDemo />}
      {activeTab === "tiptap" && <TiptapDemo />}
      {activeTab === "yuque" && <YuqueDemo />}
    </div>
  );
}
