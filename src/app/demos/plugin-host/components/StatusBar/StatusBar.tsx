import type { SourcedStatusBarContribution } from "@/plugin-system/ContributionManager";
import type { NewPluginHost } from "@/plugin-system/NewPluginHost";
import type { SelectionInfo } from "@/plugin-system/manifest-types";

// ==================== StatusBar 组件 ====================

export function StatusBar({
  items,
  host,
  selectionInfo,
}: {
  items: SourcedStatusBarContribution[];
  host: NewPluginHost | null;
  selectionInfo: SelectionInfo | null;
}) {
  const leftItems = items.filter((item) => (item.alignment ?? "left") === "left");
  const rightItems = items.filter((item) => item.alignment === "right");

  return (
    <div className="h-6 flex items-center justify-between px-3 bg-[#1a1a2e] border-t border-gray-800 text-[11px] text-gray-500 shrink-0 select-none">
      <div className="flex items-center gap-3">
        {leftItems.map((item) => {
          const content = host?.getStatusBarContent(item.id) ?? null;
          const command = host?.contributions.getStatusBarCommand(item.id) ?? item.command;
          const tooltip = host?.contributions.getStatusBarTooltip(item.id) ?? item.tooltip;
          const color = host?.contributions.getStatusBarColor(item.id) ?? item.color;
          const backgroundColor =
            host?.contributions.getStatusBarBackgroundColor(item.id) ?? item.backgroundColor;
          return (
            <StatusBarItem
              key={item.id}
              item={item}
              content={content}
              onClick={command ? () => host?.executeCommand(command) : undefined}
              tooltip={tooltip}
              color={color}
              backgroundColor={backgroundColor}
            />
          );
        })}
        {selectionInfo && (
          <span className="text-blue-400">选中 {selectionInfo.text.length} 字符</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {rightItems.map((item) => {
          const content = host?.getStatusBarContent(item.id) ?? null;
          const command = host?.contributions.getStatusBarCommand(item.id) ?? item.command;
          const tooltip = host?.contributions.getStatusBarTooltip(item.id) ?? item.tooltip;
          const color = host?.contributions.getStatusBarColor(item.id) ?? item.color;
          const backgroundColor =
            host?.contributions.getStatusBarBackgroundColor(item.id) ?? item.backgroundColor;
          return (
            <StatusBarItem
              key={item.id}
              item={item}
              content={content}
              onClick={command ? () => host?.executeCommand(command) : undefined}
              tooltip={tooltip}
              color={color}
              backgroundColor={backgroundColor}
            />
          );
        })}
        <span className="text-gray-700">Plugin Host v2</span>
      </div>
    </div>
  );
}

// ==================== StatusBarItem ====================

export function StatusBarItem({
  item,
  content,
  onClick,
  tooltip,
  color,
  backgroundColor,
}: {
  item: SourcedStatusBarContribution;
  content: { label: string; value?: string; icon?: string } | null;
  onClick?: () => void;
  tooltip?: string;
  color?: string;
  backgroundColor?: string;
}) {
  const displayContent = content ?? { label: item.text ?? item.id };
  const titleText = tooltip ?? displayContent.value ?? displayContent.label;

  return (
    <button
      type="button"
      onClick={onClick}
      title={titleText}
      className={`
        flex items-center gap-1 transition-colors rounded px-1
        ${onClick ? "hover:text-white cursor-pointer" : "cursor-default"}
      `}
      style={{
        color: color ?? undefined,
        backgroundColor: backgroundColor ?? undefined,
      }}
    >
      {displayContent.icon && <span>{displayContent.icon}</span>}
      <span>{displayContent.label}</span>
    </button>
  );
}
