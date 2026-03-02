"use client";

import { useState, useEffect } from "react";
import { Pipeline } from "@/pipeline/Pipeline";
import { ALL_STEPS } from "@/pipeline/steps";
import type { PipelineResult } from "@/pipeline/types";

// ==================== 主页面 ====================
export default function PipelinePage() {
  const [input, setInput] = useState("  Hello@Spam.COM  ");
  const [enabledSteps, setEnabledSteps] = useState<Set<string>>(
    new Set(ALL_STEPS.map((s) => s.id)),
  );
  const [result, setResult] = useState<PipelineResult | null>(null);

  // 任何配置变化立即重新执行管道
  useEffect(() => {
    const pipeline = new Pipeline();
    for (const step of ALL_STEPS) {
      pipeline.pipeIf(enabledSteps.has(step.id), step);
    }
    pipeline.process(input).then(setResult);
  }, [input, enabledSteps]);

  function toggleStep(id: string) {
    setEnabledSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">🔧 管道模式</h1>
      <p className="text-sm text-gray-500 mb-8">
        数据依次流经每个步骤，每步只做一件事。开关任意步骤，观察数据如何被逐步变换。
      </p>

      {/* 输入框 */}
      <div className="mb-6">
        <label htmlFor="pipeline-input" className="block text-xs text-gray-400 mb-2">
          输入数据
        </label>
        <input
          id="pipeline-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="输入任意文本..."
        />
      </div>

      {/* 管道可视化 */}
      <div className="space-y-1">
        {/* 原始输入节点 */}
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-800/60 border border-gray-700/60">
          <span className="text-xs text-gray-500 w-24 shrink-0">原始输入</span>
          <span className="text-sm font-mono text-gray-300 truncate">
            {result?.original ?? input}
          </span>
        </div>

        {/* 每个步骤 */}
        {ALL_STEPS.map((step) => {
          const enabled = enabledSteps.has(step.id);
          const snapshot = result?.snapshots.find((s) => s.id === step.id);
          const isError = snapshot?.output.startsWith("[错误:");
          const changed = snapshot?.changed ?? false;

          return (
            <div key={step.id}>
              {/* 连接箭头 */}
              <div className="flex items-center gap-3 px-4 py-0.5">
                <span className="w-24 shrink-0" />
                <span className="text-gray-700 text-xs">↓</span>
              </div>

              {/* 步骤行 */}
              <div
                className={`rounded-lg border transition-all ${
                  !enabled
                    ? "border-gray-700/30 bg-gray-800/20 opacity-40"
                    : isError
                      ? "border-red-500/40 bg-red-500/5"
                      : changed
                        ? "border-blue-500/40 bg-blue-500/5"
                        : "border-gray-700/50 bg-gray-800/30"
                }`}
              >
                {/* 主行：步骤名 + 开关 + 输出值 */}
                <div className="flex items-center gap-3 px-4 py-2.5">
                  {/* 步骤名 */}
                  <div className="w-24 shrink-0">
                    <div
                      className={`text-xs font-medium ${
                        !enabled ? "text-gray-600" : isError ? "text-red-400" : "text-blue-400"
                      }`}
                    >
                      {step.name}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">{step.description}</div>
                  </div>

                  {/* 输出值 */}
                  <div className="flex-1 min-w-0">
                    {enabled && snapshot ? (
                      <span
                        className={`text-sm font-mono truncate block ${
                          isError ? "text-red-400" : changed ? "text-blue-300" : "text-gray-400"
                        }`}
                      >
                        {snapshot.output}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-700">— 已跳过 —</span>
                    )}
                  </div>

                  {/* 变化标记 */}
                  {enabled && snapshot && changed && !isError && (
                    <span className="text-xs text-blue-500 shrink-0">已变换</span>
                  )}
                  {enabled && snapshot && isError && (
                    <span className="text-xs text-red-500 shrink-0">出错</span>
                  )}

                  {/* 开关 */}
                  <button
                    type="button"
                    aria-label={enabled ? `关闭${step.name}` : `开启${step.name}`}
                    onClick={() => toggleStep(step.id)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      enabled ? "bg-blue-500" : "bg-gray-600"
                    }`}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                      style={{ transform: enabled ? "translateX(18px)" : "translateX(2px)" }}
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* 最终结果节点 */}
        <div className="flex items-center gap-3 px-4 py-0.5">
          <span className="w-24 shrink-0" />
          <span className="text-gray-700 text-xs">↓</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/30">
          <span className="text-xs text-green-400 w-24 shrink-0 font-medium">最终输出</span>
          <span className="text-sm font-mono text-green-300 truncate">{result?.final ?? "—"}</span>
        </div>
      </div>

      {/* 底部说明 */}
      <p className="mt-6 text-xs text-gray-600">
        💡 试试输入{" "}
        <button
          type="button"
          className="font-mono text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
          onClick={() => setInput("  Admin@Test123.COM  ")}
        >
          Admin@Test123.COM
        </button>{" "}
        观察敏感词过滤效果，或输入{" "}
        <button
          type="button"
          className="font-mono text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
          onClick={() => setInput("not-an-email")}
        >
          not-an-email
        </button>{" "}
        观察校验报错后管道如何继续。
      </p>
    </div>
  );
}
