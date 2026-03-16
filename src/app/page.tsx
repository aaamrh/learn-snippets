"use client";

import {
  useState,
  useCallback,
  useMemo,
} from "react";
import { ScenarioType, Scenario, scenarios } from "./_data/scenarios";
import { demos } from "./_data/demos";

// ==================== 类型定义 ====================
type TabType = "problem" | "bad" | "good" | "demo";

// ==================== 代码高亮组件 ====================
function CodeBlock({ code, type }: { code: string; type: "bad" | "good" }) {
  const bgColor = type === "bad" ? "bg-red-950/30" : "bg-green-950/30";
  const borderColor = type === "bad" ? "border-red-500/30" : "border-green-500/30";
  const headerColor = type === "bad" ? "text-red-400" : "text-green-400";

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}>
      <div className={`px-4 py-2 border-b ${borderColor} flex items-center gap-2`}>
        <span className={`text-sm font-medium ${headerColor}`}>
          {type === "bad" ? "💩 烂代码 - 别这样写" : "✨ 优雅设计 - 值得学习"}
        </span>
      </div>
      <pre className="p-4 text-sm overflow-x-auto max-h-[1000px]">
        <code className="text-gray-300 whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

// ==================== 主组件 ====================
export default function Home() {
  const [activeScenario, setActiveScenario] = useState<ScenarioType>("onion");
  const [activeTab, setActiveTab] = useState<TabType>("problem");

  const scenario = scenarios.find((s) => s.id === activeScenario)!;

  // 按类别分组
  const categories = useMemo(() => {
    const groups: Record<string, Scenario[]> = {};
    scenarios.forEach((s) => {
      const cat = s.category || "其他";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex">
      {/* 左侧导航 */}
      <aside className="w-72 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            高级前端架构设计
          </h1>
          <p className="text-xs text-gray-500 mt-1">经典模式 × 领域场景</p>
        </div>

        <nav className="flex-1 overflow-auto p-2 space-y-1">
          {Object.entries(categories).map(([cat, items]) => (
            <div key={cat}>
              <div
                className={`px-2 py-1 text-xs font-medium ${
                  cat === "架构模式"
                    ? "text-purple-400"
                    : cat === "电商领域"
                      ? "text-blue-400"
                      : cat === "金融领域"
                        ? "text-green-400"
                        : cat === "企业级场景"
                          ? "text-orange-400"
                          : "text-gray-400"
                }`}
              >
                {cat === "架构模式" && "🏗️ "}
                {cat === "电商领域" && "🛒 "}
                {cat === "金融领域" && "💰 "}
                {cat === "企业级场景" && "🏢 "}
                {cat}
              </div>
              {items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveScenario(s.id);
                    setActiveTab("problem");
                  }}
                  className={`w-full text-left p-2 rounded text-sm transition-all ${
                    activeScenario === s.id
                      ? "bg-blue-600/20 border border-blue-500/50 text-white"
                      : "hover:bg-gray-800 text-gray-400"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{s.title}</span>
                    <span className="text-xs opacity-50">
                      {"💩".repeat(Math.min(s.difficulty, 5))}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">{s.subtitle}</div>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* 右侧内容 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Tab 导航 */}
        <div className="border-b border-gray-800 flex">
          {[
            { id: "problem" as const, label: "📋 问题分析" },
            { id: "bad" as const, label: "💩 烂代码" },
            { id: "good" as const, label: "✨ 优雅设计" },
            { id: "demo" as const, label: "🎮 Demo" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm transition-all border-b-2 ${
                activeTab === tab.id
                  ? "border-blue-500 bg-gray-800/50"
                  : "border-transparent hover:bg-gray-800/30"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === "problem" && (
            <div className="space-y-4">
              <div className="inline-block px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
                易屎山指数：{"💩".repeat(Math.min(scenario.difficulty, 5))}
              </div>
              <pre className="whitespace-pre-wrap text-gray-300 leading-relaxed bg-gray-800 p-4 rounded-lg text-sm overflow-auto">
                {scenario.problem}
              </pre>
              <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
                <span className="font-medium text-blue-400">🎯 设计模式：</span>
                <span className="text-gray-300 ml-2">{scenario.designPattern}</span>
              </div>
            </div>
          )}

          {activeTab === "bad" && <CodeBlock code={scenario.badCode} type="bad" />}
          {activeTab === "good" && <CodeBlock code={scenario.goodCode} type="good" />}

          {activeTab === "demo" && (
            <div className="p-6 bg-gray-800/50 rounded-lg border border-gray-700">
              {(demos[activeScenario] || demos.default)()}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
