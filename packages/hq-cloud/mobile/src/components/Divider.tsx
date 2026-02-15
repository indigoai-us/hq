/**
 * Divider - Thin horizontal line for visual separation.
 * Uses the subtle border color from the design system.
 */
import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { colors, spacing } from "../theme";

interface DividerProps {
  /** Additional style overrides */
  style?: ViewStyle;
}

export function Divider({ style }: DividerProps): React.JSX.Element {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.subtle,
    marginVertical: spacing.md,
  },
});
