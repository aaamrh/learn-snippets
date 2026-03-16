import type { EventLogEntry } from "../../types";

export function EventLogContent({
  events,
}: {
  events: EventLogEntry[];
}) {
  const typeColors: Record<string, string> = {
    installed: "text-blue-400",
    activated: "text-green-400",
    deactivated: "text-amber-400",
    uninstalled: "text-gray-400",
    error: "text-red-400",
    command: "text-purple-400",
    "permission-denied": "text-red-500",
    system: "text-cyan-400",
  };

  const typeIcons: Record<string, string> = {
    installed: "📥",
    activated: "✅",
    deactivated: "⏸",
    uninstalled: "🗑",
    error: "❌",
    command: "⚡",
    "permission-denied": "🚫",
    system: "🔧",
  };

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-700 text-xs">
        📭 暂无事件记录 — 操作插件后事件会出现在这里
      </div>
    );
  }

  return (
    <div className="font-mono text-[11px] p-1">
      {events.map((event, idx) => (
        <div
          key={`${event.time}-${event.type}-${idx}`}
          className="flex items-start gap-1.5 py-0.5 px-2 rounded hover:bg-gray-800/50 transition-colors"
        >
          <span className="text-gray-700 shrink-0 w-16">{event.time}</span>
          <span className="shrink-0 w-3.5">{typeIcons[event.type] ?? "•"}</span>
          <span className={`shrink-0 w-24 truncate ${typeColors[event.type] ?? "text-gray-400"}`}>
            [{event.type}]
          </span>
          <span className="text-gray-500 break-all">{event.detail}</span>
        </div>
      ))}
    </div>
  );
}
