/**
 * SpawnConfirmation - Summary view before spawning a worker.
 * Shows selected worker, skill, and parameters for review.
 * MOB-011: Spawn worker from mobile
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";
import type { WorkerDefinition, WorkerSkill } from "../types";

interface SpawnConfirmationProps {
  /** Selected worker */
  worker: WorkerDefinition;
  /** Selected skill */
  skill: WorkerSkill;
  /** Configured parameters */
  parameters: Record<string, string>;
  /** Test ID for testing */
  testID?: string;
}

export function SpawnConfirmation({
  worker,
  skill,
  parameters,
  testID,
}: SpawnConfirmationProps): React.JSX.Element {
  const paramEntries = Object.entries(parameters).filter(([, v]) => v.trim().length > 0);

  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.heading}>Confirm Spawn</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Worker</Text>
        <Text style={styles.sectionValue}>{worker.name}</Text>
        <Text style={styles.sectionDescription}>{worker.description}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Skill</Text>
        <Text style={styles.sectionValue}>{skill.name}</Text>
        <Text style={styles.sectionDescription}>{skill.description}</Text>
      </View>

      {paramEntries.length > 0 && (
        <>
          <View style={styles.divider} />
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Parameters</Text>
            {paramEntries.map(([key, value]) => {
              const paramDef = skill.parameters?.find((p) => p.name === key);
              return (
                <View key={key} style={styles.paramRow}>
                  <Text style={styles.paramLabel}>
                    {paramDef?.label ?? key}
                  </Text>
                  <Text style={styles.paramValue}>{value}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  heading: {
    ...typography.cardTitle,
    fontSize: 18,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionValue: {
    ...typography.cardTitle,
  },
  sectionDescription: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
  },
  paramRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  paramLabel: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  paramValue: {
    ...typography.bodySmall,
    color: colors.text.primary,
    fontWeight: "500",
  },
});
