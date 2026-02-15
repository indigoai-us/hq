/**
 * LoadingScreen - Shown during initial auth state determination (auto-login check).
 */
import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { colors, spacing } from "../theme";

export function LoadingScreen(): React.JSX.Element {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.accent.blue} />
      <Text style={styles.text}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background.primary,
  },
  text: {
    color: colors.text.secondary,
    fontSize: 16,
    marginTop: spacing.lg,
  },
});
