/**
 * SectionHeader - Uppercase section label matching Figma design.
 * Renders text like "AGENTS" or "NAVIGATOR" in the standard caps style.
 */
import React from "react";
import { Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { typography, spacing } from "../theme";

interface SectionHeaderProps {
  /** Section title (will be rendered in uppercase) */
  title: string;
  /** Additional style for the text */
  style?: TextStyle | ViewStyle;
  /** Test ID for testing */
  testID?: string;
}

export function SectionHeader({
  title,
  style,
  testID,
}: SectionHeaderProps): React.JSX.Element {
  return (
    <Text style={[styles.header, style]} testID={testID}>
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: {
    ...typography.sectionHeader,
    marginBottom: spacing.md,
  },
});
