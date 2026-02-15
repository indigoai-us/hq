/**
 * BrandHeader - Branded app header matching Figma design.
 * Shows hamburger menu icon (left), "Indigo" brand name with logo (center),
 * and icon group (right) with agents/settings icons.
 *
 * Visible at the top of Agents and Navigator screens in Figma.
 */
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors, spacing, typography } from "../theme";

interface BrandHeaderProps {
  /** Handler for left menu button */
  onMenuPress?: () => void;
  /** Handler for right icon group press */
  onIconsPress?: () => void;
  /** Test ID for testing */
  testID?: string;
}

export function BrandHeader({
  onMenuPress,
  onIconsPress,
  testID,
}: BrandHeaderProps): React.JSX.Element {
  return (
    <View style={styles.container} testID={testID}>
      {/* Left: Hamburger menu */}
      <Pressable
        onPress={onMenuPress}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel="Menu"
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <Text style={styles.menuIcon}>{"\u2261"}</Text>
      </Pressable>

      {/* Center: Brand logo + name */}
      <View style={styles.brand}>
        <Text style={styles.logoIcon}>{"\u25C7"}</Text>
        <Text style={styles.brandName}>Indigo</Text>
      </View>

      {/* Right: Icon group */}
      <Pressable
        onPress={onIconsPress}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <Text style={styles.rightIcons}>{"\u229A"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background.primary,
  },
  iconButton: {
    padding: spacing.xs,
    minWidth: 32,
    alignItems: "center",
  },
  menuIcon: {
    fontSize: 24,
    color: colors.text.primary,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  logoIcon: {
    fontSize: 20,
    color: colors.text.primary,
  },
  brandName: {
    ...typography.brandTitle,
  },
  rightIcons: {
    fontSize: 20,
    color: colors.text.primary,
  },
});
