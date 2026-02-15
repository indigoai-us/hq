"use client";

import { useState } from "react";
import type { NavigatorGroup } from "@/types/navigator";
import { TreeNode } from "./TreeNode";

interface TreeGroupProps {
  group: NavigatorGroup;
  expandedNodes: Set<string>;
  onToggle: (nodeId: string) => void;
  onFileSelect: (filePath: string) => void;
}

export function TreeGroup({ group, expandedNodes, onToggle, onFileSelect }: TreeGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 py-2 px-3 hover:bg-overlay-light rounded transition-colors"
      >
        <span
          className={`text-text-tertiary text-xs transition-transform ${collapsed ? "" : "rotate-90"}`}
        >
          ▶
        </span>
        <span className="text-sm font-medium">📁</span>
        <span className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
          {group.name}
        </span>
        <span className="text-xs text-text-tertiary ml-auto">
          {group.children.length}
        </span>
      </button>

      {!collapsed && (
        <div>
          {group.children.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={1}
              expanded={expandedNodes.has(node.id)}
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
