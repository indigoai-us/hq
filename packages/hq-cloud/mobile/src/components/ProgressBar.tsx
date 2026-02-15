/**
 * ProgressBar - Colored progress bar matching Figma design.
 * Yellow/gold for active tasks, green for completed tasks.
 *
 * Renders a horizontal bar with filled portion proportional to progress,
 * alongside an optional numeric fraction (e.g., "4/6").
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography, progressBar as progressTokens } from "../theme";

type ProgressVariant = "active" | "complete";

interface ProgressBarProps {
  /** Number of completed steps */
  completed: number;
  /** Total number of steps */
  total: number;
  /** Visual variant: "active" (yellow) or "complete" (green). Auto-detected if omitted. */
  variant?: ProgressVariant;
  /** Whether to show the fraction label (e.g., "4/6"). Default: true */
  showFraction?: boolean;
  /** Test ID for testing */
  testID?: string;
}

export function ProgressBar({
  completed,
  total,
  variant,
  showFraction = true,
  testID,
}: ProgressBarProps): React.JSX.Element {
  const safeTotal = Math.max(total, 1);
  const safeCompleted = Math.min(Math.max(completed, 0), safeTotal);
  const fraction = safeCompleted / safeTotal;

  // Auto-detect variant: green when fully complete, yellow when in progress
  const resolvedVariant = variant ?? (safeCompleted >= safeTotal ? "complete" : "active");
  const fillColor =
    resolvedVariant === "complete" ? colors.progress.complete : colors.progress.active;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.trackContainer}>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${fraction * 100}%`, backgroundColor: fillColor },
            ]}
          />
        </View>
      </View>
      {showFraction && (
        <Text style={styles.fraction}>
          {safeCompleted}/{safeTotal}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  trackContainer: {
    flex: 1,
  },
  track: {
    height: progressTokens.height,
    backgroundColor: colors.progress.track,
    borderRadius: progressTokens.borderRadius,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: progressTokens.borderRadius,
  },
  fraction: {
    ...typography.progressFraction,
  },
});
