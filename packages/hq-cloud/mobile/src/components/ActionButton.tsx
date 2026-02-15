/**
 * ActionButton - Styled button for primary/secondary actions.
 * Matches Figma design for Allow/Deny permission prompts.
 *
 * Variants:
 * - "primary": Blue background, white text (standard action)
 * - "prominent": White background, dark text (e.g., "Allow")
 * - "muted": Dark background, gray text (e.g., "Deny")
 * - "destructive": Red text on dark background (e.g., "Log Out")
 */
import React from "react";
import { Text, StyleSheet, Pressable, ViewStyle, ActivityIndicator } from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";

type ActionButtonVariant = "primary" | "prominent" | "muted" | "destructive";

interface ActionButtonProps {
  /** Button label */
  label: string;
  /** Press handler */
  onPress: () => void;
  /** Visual variant */
  variant?: ActionButtonVariant;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether to show a loading spinner */
  loading?: boolean;
  /** Fill the available width */
  fullWidth?: boolean;
  /** Additional style overrides */
  style?: ViewStyle;
  /** Test ID for testing */
  testID?: string;
}

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  testID,
}: ActionButtonProps): React.JSX.Element {
  const buttonStyle = variantStyles[variant];
  const textColor = variantTextColors[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        buttonStyle,
        fullWidth ? styles.fullWidth : undefined,
        pressed && !isDisabled ? styles.pressed : undefined,
        isDisabled ? styles.disabled : undefined,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const variantStyles: Record<ActionButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.button.primary },
  prominent: {
    backgroundColor: colors.button.prominent,
    borderWidth: 0,
  },
  muted: { backgroundColor: colors.button.muted },
  destructive: {
    backgroundColor: "transparent",
    borderColor: colors.accent.red,
    borderWidth: 1,
  },
};

const variantTextColors: Record<ActionButtonVariant, string> = {
  primary: colors.text.primary,
  prominent: colors.button.prominentText,
  muted: colors.text.secondary,
  destructive: colors.accent.red,
};

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  fullWidth: {
    width: "100%",
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.buttonSmall,
  },
});
