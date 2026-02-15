/**
 * WorkerPickerItem - Selectable worker card for the spawn flow.
 * Displays worker name, category icon, description, and skill count.
 * MOB-011: Spawn worker from mobile
 */
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";
import type { WorkerDefinition, WorkerCategory } from "../types";

interface WorkerPickerItemProps {
  /** Worker definition to display */
  worker: WorkerDefinition;
  /** Called when the worker is selected */
  onSelect: (worker: WorkerDefinition) => void;
  /** Test ID for testing */
  testID?: string;
}

/** Category icon and tint color mapping */
const CATEGORY_MAP: Record<WorkerCategory, { symbol: string; tint: string; label: string }> = {
  code: { symbol: "\u276F", tint: colors.accent.purple, label: "Code" },
  content: { symbol: "\u2610", tint: colors.accent.yellow, label: "Content" },
  social: { symbol: "\u2B50", tint: colors.accent.blue, label: "Social" },
  research: { symbol: "\uD83D\uDD0D", tint: colors.accent.blue, label: "Research" },
  ops: { symbol: "\u2699", tint: colors.accent.green, label: "Ops" },
};

export function WorkerPickerItem({
  worker,
  onSelect,
  testID,
}: WorkerPickerItemProps): React.JSX.Element {
  const category = CATEGORY_MAP[worker.category] ?? CATEGORY_MAP.code;

  return (
    <Pressable
      onPress={() => onSelect(worker)}
      testID={testID}
      style={({ pressed }) => [
        styles.container,
        pressed ? styles.pressed : undefined,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Select ${worker.name} worker`}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: category.tint + "1A" },
        ]}
      >
        <Text style={[styles.iconText, { color: category.tint }]}>
          {category.symbol}
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {worker.name}
          </Text>
          <View style={[styles.categoryBadge, { backgroundColor: category.tint + "1A" }]}>
            <Text style={[styles.categoryText, { color: category.tint }]}>
              {category.label}
            </Text>
          </View>
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {worker.description}
        </Text>
        <Text style={styles.skillCount}>
          {worker.skills.length} {worker.skills.length === 1 ? "skill" : "skills"}
        </Text>
      </View>

      <Text style={styles.chevron}>{"\u203A"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pressed: {
    borderColor: colors.border.active,
    backgroundColor: colors.background.elevated,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 20,
    textAlign: "center",
  },
  content: {
    flex: 1,
    gap: spacing.xxs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  name: {
    ...typography.cardTitle,
    flex: 1,
  },
  categoryBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.sm,
  },
  categoryText: {
    ...typography.caption,
    fontWeight: "600",
  },
  description: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  skillCount: {
    ...typography.label,
    color: colors.text.tertiary,
  },
  chevron: {
    fontSize: 24,
    color: colors.text.tertiary,
    marginLeft: spacing.xs,
  },
});
