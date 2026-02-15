/**
 * TreeNode - A single row in the Navigator semantic tree.
 *
 * Renders:
 * - Indentation based on depth
 * - Chevron (expand/collapse) for nodes with children
 * - Type-specific icon via TreeNodeIcon
 * - Node name
 * - Status dot (green/yellow/red) aligned to the right
 *
 * Supports:
 * - Tap to expand/collapse folder nodes
 * - Tap to navigate on leaf nodes (file/knowledge with filePath)
 * - Recursive rendering of children when expanded
 *
 * Matches the Figma Navigator screen layout with its hierarchical indentation.
 */
import React, { useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { TreeNodeIcon } from "./TreeNodeIcon";
import { StatusDot } from "./StatusDot";
import { colors, spacing, typography } from "../theme";
import type { NavigatorNode } from "../types";

/** Horizontal indentation per tree depth level */
const INDENT_PER_LEVEL = 24;

interface TreeNodeProps {
  /** The node data to render */
  node: NavigatorNode;
  /** Depth level for indentation (0 = top level) */
  depth: number;
  /** Set of expanded node IDs */
  expandedNodes: Set<string>;
  /** Toggle expand/collapse for a node */
  onToggle: (nodeId: string) => void;
  /** Navigate to file viewer for leaf nodes */
  onOpenFile: (filePath: string) => void;
  /** Test ID prefix for testing */
  testIDPrefix?: string;
}

export function TreeNode({
  node,
  depth,
  expandedNodes,
  onToggle,
  onOpenFile,
  testIDPrefix = "tree-node",
}: TreeNodeProps): React.JSX.Element {
  const hasChildren = node.children != null && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isLeaf = !hasChildren;
  const testID = `${testIDPrefix}-${node.id}`;

  const handlePress = useCallback(() => {
    if (hasChildren) {
      onToggle(node.id);
    } else if (node.filePath) {
      onOpenFile(node.filePath);
    }
  }, [hasChildren, node.id, node.filePath, onToggle, onOpenFile]);

  return (
    <View testID={testID}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.row,
          { paddingLeft: spacing.lg + depth * INDENT_PER_LEVEL },
          pressed ? styles.rowPressed : undefined,
        ]}
        testID={`${testID}-row`}
        accessibilityRole="button"
        accessibilityLabel={`${node.name}, ${node.type}${hasChildren ? (isExpanded ? ", expanded" : ", collapsed") : ""}`}
      >
        {/* Chevron for expandable nodes */}
        <View style={styles.chevronContainer}>
          {hasChildren ? (
            <Text
              style={[styles.chevron, isExpanded ? styles.chevronExpanded : undefined]}
              testID={`${testID}-chevron`}
            >
              {"\u203A"}
            </Text>
          ) : (
            <View style={styles.chevronSpacer} />
          )}
        </View>

        {/* Node type icon */}
        <TreeNodeIcon type={node.type} testID={`${testID}-icon`} />

        {/* Node name */}
        <Text
          style={[styles.name, isLeaf ? styles.nameLeaf : undefined]}
          numberOfLines={1}
          testID={`${testID}-name`}
        >
          {node.name}
        </Text>

        {/* Status dot */}
        <StatusDot variant={node.status} size={8} />
      </Pressable>

      {/* Render children recursively when expanded */}
      {hasChildren && isExpanded && (
        <View testID={`${testID}-children`}>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              testIDPrefix={testIDPrefix}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.overlay.light,
  },
  chevronContainer: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    fontSize: 18,
    color: colors.text.secondary,
    transform: [{ rotate: "0deg" }],
  },
  chevronExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  chevronSpacer: {
    width: 16,
  },
  name: {
    ...typography.body,
    flex: 1,
  },
  nameLeaf: {
    ...typography.bodySmall,
    color: colors.text.primary,
  },
});
