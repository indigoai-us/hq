/**
 * SkillPickerItem - Selectable skill card for the spawn flow.
 * Displays skill name, description, and parameter count.
 * MOB-011: Spawn worker from mobile
 */
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";
import type { WorkerSkill } from "../types";

interface SkillPickerItemProps {
  /** Skill to display */
  skill: WorkerSkill;
  /** Called when the skill is selected */
  onSelect: (skill: WorkerSkill) => void;
  /** Test ID for testing */
  testID?: string;
}

export function SkillPickerItem({
  skill,
  onSelect,
  testID,
}: SkillPickerItemProps): React.JSX.Element {
  const paramCount = skill.parameters?.length ?? 0;

  return (
    <Pressable
      onPress={() => onSelect(skill)}
      testID={testID}
      style={({ pressed }) => [
        styles.container,
        pressed ? styles.pressed : undefined,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Select ${skill.name} skill`}
    >
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {skill.name}
        </Text>
        <Text style={styles.description} numberOfLines={2}>
          {skill.description}
        </Text>
        {paramCount > 0 && (
          <Text style={styles.paramCount}>
            {paramCount} {paramCount === 1 ? "parameter" : "parameters"}
          </Text>
        )}
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
  content: {
    flex: 1,
    gap: spacing.xxs,
  },
  name: {
    ...typography.cardTitle,
  },
  description: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  paramCount: {
    ...typography.label,
    color: colors.text.tertiary,
  },
  chevron: {
    fontSize: 24,
    color: colors.text.tertiary,
    marginLeft: spacing.xs,
  },
});
