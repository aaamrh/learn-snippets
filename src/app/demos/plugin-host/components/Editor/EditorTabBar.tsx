import type { EditorTab } from "@/plugin-system/EditorTabManager";

export function EditorTabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabAdd,
}: {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabAdd: () => void;
}) {
  return (
    <div className="flex items-center bg-gray-900 border-b border-gray-800 shrink-0 h-8 select-none overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onTabClick(tab.id)}
            className={`
              group flex items-center gap-1.5 px-3 h-full text-[11px] cursor-pointer
              border-r border-gray-800 shrink-0 transition-colors
              ${
                isActive
                  ? "bg-gray-950 text-gray-200 border-t-2 border-t-blue-500 -mb-px"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
              }
            `}
          >
            <span className="text-[10px] opacity-60">📄</span>
            <span className="truncate max-w-24">{tab.title}</span>
            {tab.isDirty && <span className="text-amber-400 text-[10px]">●</span>}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className={`
                w-4 h-4 flex items-center justify-center rounded text-[10px]
                transition-colors ml-0.5
                ${
                  isActive
                    ? "text-gray-500 hover:text-gray-200 hover:bg-gray-700"
                    : "text-transparent group-hover:text-gray-600 hover:!text-gray-300 hover:bg-gray-700"
                }
              `}
            >
              ✕
            </button>
          </div>
        );
      })}

      {/* 新建 Tab 按钮 */}
      <button
        type="button"
        onClick={onTabAdd}
        title="新建标签页"
        className="w-8 h-full flex items-center justify-center text-gray-600 hover:text-gray-300 hover:bg-gray-800/50 transition-colors shrink-0"
      >
        +
      </button>

      <div className="flex-1" />
    </div>
  );
}
