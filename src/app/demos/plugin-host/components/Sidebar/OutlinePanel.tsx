import { useState } from "react";
import type { TreeNode } from "../../types";

export function OutlinePanel({
  treeNodes,
  treeLoading,
  onRefresh,
  onExecuteCommand,
}: {
  treeNodes: TreeNode[];
  treeLoading: boolean;
  onRefresh: () => void;
  onExecuteCommand: (commandId: string) => void;
}) {
  return (
    <>
      <div className="px-3 py-2 border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-wider flex items-center justify-between shrink-0">
        <span>⚡ 大纲</span>
        <button
          type="button"
          onClick={onRefresh}
          className="text-gray-600 hover:text-gray-400 text-xs"
          title="刷新大纲"
        >
          ↺
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {treeLoading ? (
          <div className="px-3 py-2 text-xs text-gray-600 animate-pulse">加载中...</div>
        ) : treeNodes.length === 0 ? (
          <div className="px-3 py-6 text-xs text-gray-700 text-center">
            <div className="text-2xl mb-2">📑</div>
            <div>暂无大纲数据</div>
            <div className="text-[10px] mt-1">需要 Outline View 插件处于激活状态</div>
          </div>
        ) : (
          treeNodes.map((node, i) => (
            <TreeNodeItem
              key={`${node.id}-${i}`}
              node={node}
              depth={0}
              onExecuteCommand={onExecuteCommand}
            />
          ))
        )}
      </div>
    </>
  );
}

export function TreeNodeItem({
  node,
  depth,
  onExecuteCommand,
}: {
  node: TreeNode;
  depth: number;
  onExecuteCommand: (commandId: string) => void;
}) {
  const [expanded, setExpanded] = useState(node.collapsibleState === "expanded");
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 rounded cursor-pointer hover:bg-gray-800/50 text-[11px] text-gray-400 group"
        style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: 8 }}
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v);
          if (node.command) onExecuteCommand(node.command.commandId);
        }}
      >
        {hasChildren ? (
          <span className="text-gray-600 w-3 shrink-0 text-[10px]">{expanded ? "▾" : "▸"}</span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {node.icon && <span className="shrink-0 text-xs">{node.icon}</span>}
        <span className="truncate flex-1">{node.label}</span>
        {node.description && (
          <span className="text-gray-700 text-[9px] shrink-0">{node.description}</span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child, i) => (
            <TreeNodeItem
              key={`${child.id}-${i}`}
              node={child}
              depth={depth + 1}
              onExecuteCommand={onExecuteCommand}
            />
          ))}
        </div>
      )}
    </div>
  );
}
