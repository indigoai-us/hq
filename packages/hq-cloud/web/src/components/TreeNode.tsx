"use client";

import type { NavigatorNode as NavigatorNodeType } from "@/types/navigator";
import { TreeNodeIcon } from "./TreeNodeIcon";
import { StatusDot } from "./StatusDot";

interface TreeNodeProps {
  node: NavigatorNodeType;
  depth: number;
  expanded: boolean;
  onToggle: (nodeId: string) => void;
  onFileSelect: (filePath: string) => void;
  expandedNodes: Set<string>;
}

export function TreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onFileSelect,
  expandedNodes,
}: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isFile = node.type === "file";

  const handleClick = () => {
    if (isFile && node.filePath) {
      onFileSelect(node.filePath);
    } else if (hasChildren) {
      onToggle(node.id);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center gap-2 py-1.5 px-2 hover:bg-overlay-light rounded transition-colors text-left"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Chevron */}
        {hasChildren ? (
          <span
            className={`text-text-tertiary text-xs transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ▶
          </span>
        ) : (
          <span className="w-3" />
        )}

        <TreeNodeIcon type={node.type} />

        <span className="flex-1 text-sm text-text-primary truncate">{node.name}</span>

        <StatusDot status={node.status} />
      </button>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expandedNodes.has(child.id)}
              onToggle={onToggle}
              onFileSelect={onFileSelect}
              expandedNodes={expandedNodes}
            />
          ))}
        </div>
      )}
    </div>
  );
}
