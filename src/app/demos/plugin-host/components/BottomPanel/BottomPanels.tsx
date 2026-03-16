import type { EventLogEntry } from "../../types";
import { EventLogContent } from "./EventLogContent";
import { DiagnosticsContent } from "./DiagnosticsContent";

export function BottomPanels({
  eventLog,
  onClearLog,
  diagnosticsData,
  onRefreshDiagnostics,
  showEventLog,
  setShowEventLog,
  showDiagnostics,
  setShowDiagnostics,
  logCount,
}: {
  eventLog: EventLogEntry[];
  onClearLog: () => void;
  diagnosticsData: unknown;
  onRefreshDiagnostics: () => void;
  showEventLog: boolean;
  setShowEventLog: (v: boolean) => void;
  showDiagnostics: boolean;
  setShowDiagnostics: (v: boolean) => void;
  logCount: number;
}) {
  const anyOpen = showEventLog || showDiagnostics;

  return (
    <div className="border-t border-gray-800 bg-gray-900/80 shrink-0">
      <div className="flex items-center gap-0.5 px-2 h-7 border-b border-gray-800/50">
        <PanelTab
          label="📋 事件日志"
          active={showEventLog}
          badge={logCount > 0 ? logCount : undefined}
          onClick={() => {
            setShowEventLog(!showEventLog);
            if (!showEventLog) setShowDiagnostics(false);
          }}
        />
        <PanelTab
          label="🔍 诊断"
          active={showDiagnostics}
          onClick={() => {
            setShowDiagnostics(!showDiagnostics);
            if (!showDiagnostics) {
              setShowEventLog(false);
              onRefreshDiagnostics();
            }
          }}
        />

        <div className="flex-1" />

        {showEventLog && (
          <button
            type="button"
            onClick={onClearLog}
            className="px-2 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            清空
          </button>
        )}
        {showDiagnostics && (
          <button
            type="button"
            onClick={onRefreshDiagnostics}
            className="px-2 py-0.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            🔄 刷新
          </button>
        )}
      </div>

      {anyOpen && (
        <div className="h-44 overflow-auto">
          {showEventLog && <EventLogContent events={eventLog} />}
          {showDiagnostics && <DiagnosticsContent data={diagnosticsData} />}
        </div>
      )}
    </div>
  );
}

export function PanelTab({
  label,
  active,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-1 px-2.5 h-full text-[11px] transition-colors border-b-2 -mb-px
        ${
          active
            ? "text-gray-200 border-blue-500"
            : "text-gray-600 border-transparent hover:text-gray-400"
        }
      `}
    >
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`
            text-[9px] px-1 py-px rounded-full font-mono
            ${active ? "bg-blue-500/20 text-blue-400" : "bg-gray-800 text-gray-500"}
          `}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
