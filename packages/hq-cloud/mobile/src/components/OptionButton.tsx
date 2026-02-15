/**
 * OptionButton - Tappable option button matching Figma design.
 * Used for multi-choice question options on agent cards and chat.
 *
 * Renders as a dark elevated rectangle with white text.
 * Shows pressed state with lighter background.
 */
import React from "react";
import { Text, StyleSheet, Pressable } from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";

interface OptionButtonProps {
  /** Option label text */
  label: string;
  /** Press handler */
  onPress: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Test ID for testing */
  testID?: string;
}

export function OptionButton({
  label,
  onPress,
  disabled = false,
  testID,
}: OptionButtonProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled ? styles.pressed : undefined,
        disabled ? styles.disabled : undefined,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.label, disabled ? styles.labelDisabled : undefined]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.background.elevated,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  pressed: {
    backgroundColor: colors.background.tertiary,
    borderColor: colors.border.active,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.body,
    color: colors.text.primary,
  },
  labelDisabled: {
    color: colors.text.tertiary,
  },
});
