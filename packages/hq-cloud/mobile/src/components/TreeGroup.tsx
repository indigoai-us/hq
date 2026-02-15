/**
 * TreeGroup - A top-level grouping in the Navigator tree.
 *
 * Renders a collapsible section header (e.g., "Companies", "Standalone Projects")
 * with a folder icon and chevron. When expanded, renders child NavigatorNodes
 * using the TreeNode component.
 *
 * Matches the Figma Navigator screen where top-level groups have folder icons
 * and expand to show their hierarchical contents.
 */
import React, { useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { TreeNode } from "./TreeNode";
import { colors, spacing, typography } from "../theme";
import type { NavigatorGroup } from "../types";

interface TreeGroupProps {
  /** The group data to render */
  group: NavigatorGroup;
  /** Set of expanded node IDs (includes group IDs) */
  expandedNodes: Set<string>;
  /** Toggle expand/collapse for a node or group */
  onToggle: (nodeId: string) => void;
  /** Navigate to file viewer for leaf nodes */
  onOpenFile: (filePath: string) => void;
  /** Test ID prefix for testing */
  testIDPrefix?: string;
}

export function TreeGroup({
  group,
  expandedNodes,
  onToggle,
  onOpenFile,
  testIDPrefix = "tree-group",
}: TreeGroupProps): React.JSX.Element {
  const isExpanded = expandedNodes.has(group.id);
  const testID = `${testIDPrefix}-${group.id}`;

  const handlePress = useCallback(() => {
    onToggle(group.id);
  }, [group.id, onToggle]);

  return (
    <View testID={testID}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.header,
          pressed ? styles.headerPressed : undefined,
        ]}
        testID={`${testID}-header`}
        accessibilityRole="button"
        accessibilityLabel={`${group.name}, ${isExpanded ? "expanded" : "collapsed"}`}
      >
        {/* Chevron */}
        <Text
          style={[styles.chevron, isExpanded ? styles.chevronExpanded : undefined]}
          testID={`${testID}-chevron`}
        >
          {"\u203A"}
        </Text>

        {/* Folder icon */}
        <Text style={styles.folderIcon}>{"\uD83D\uDCC2"}</Text>

        {/* Group name */}
        <Text style={styles.name} testID={`${testID}-name`}>
          {group.name}
        </Text>
      </Pressable>

      {/* Child nodes when expanded */}
      {isExpanded && (
        <View testID={`${testID}-children`}>
          {group.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  headerPressed: {
    backgroundColor: colors.overlay.light,
  },
  chevron: {
    fontSize: 18,
    color: colors.text.secondary,
    width: 16,
    textAlign: "center",
    transform: [{ rotate: "0deg" }],
  },
  chevronExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  folderIcon: {
    fontSize: 16,
    color: colors.text.secondary,
    width: 24,
    textAlign: "center",
  },
  name: {
    ...typography.body,
    flex: 1,
  },
});
