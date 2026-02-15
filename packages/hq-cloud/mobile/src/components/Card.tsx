/**
 * Card - Reusable card component matching Figma design system.
 * Dark card on darker background with subtle border and rounded corners.
 *
 * Used for agent cards, option cards, and other elevated containers.
 */
import React from "react";
import { View, StyleSheet, Pressable, ViewStyle } from "react-native";
import { colors, spacing, shadows, cardStyle as cardTokens } from "../theme";

interface CardProps {
  children: React.ReactNode;
  /** Optional press handler - makes card tappable */
  onPress?: () => void;
  /** Additional style overrides */
  style?: ViewStyle;
  /** Whether to show active border on press (default: true when onPress provided) */
  showPressState?: boolean;
  /** Test ID for testing */
  testID?: string;
}

export function Card({
  children,
  onPress,
  style,
  showPressState = true,
  testID,
}: CardProps): React.JSX.Element {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [
          styles.card,
          shadows.card,
          showPressState && pressed ? styles.pressed : undefined,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, shadows.card, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.card,
    borderRadius: cardTokens.borderRadius,
    padding: spacing.lg,
    borderWidth: cardTokens.borderWidth,
    borderColor: colors.border.subtle,
  },
  pressed: {
    borderColor: colors.border.active,
    backgroundColor: colors.background.elevated,
  },
});
