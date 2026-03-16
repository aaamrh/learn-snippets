import { useState } from "react";

// ==================== DiagnosticsContent ====================

export function DiagnosticsContent({ data }: { data: unknown }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-gray-700 text-xs">
        🔍 点击「刷新」查看当前诊断数据
      </div>
    );
  }

  const d = data as Record<string, unknown>;

  const sections = [
    {
      title: "总览",
      data: { started: d.started, disposed: d.disposed, sandboxMode: d.sandboxMode },
    },
    { title: "Registry", data: d.registry },
    { title: "Contributions", data: d.contributions },
    { title: "Activation", data: d.activation },
    { title: "Context Keys", data: d.contextKeys },
    { title: "Sandboxes", data: d.sandboxes },
    { title: "Permission Guards", data: d.guards },
  ];

  return (
    <div className="divide-y divide-gray-800/50">
      {sections.map((section) => (
        <DiagnosticsSection key={section.title} title={section.title} data={section.data} />
      ))}
    </div>
  );
}

// ==================== DiagnosticsSection ====================

export function DiagnosticsSection({ title, data }: { title: string; data: unknown }) {
  const [expanded, setExpanded] = useState(false);

  if (data === undefined || data === null) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-gray-400 hover:bg-gray-800/50 transition-colors"
      >
        <span>{title}</span>
        <span className="text-gray-700 text-[10px]">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-[10px] text-gray-600 bg-gray-950/50 overflow-auto max-h-48 font-mono leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
