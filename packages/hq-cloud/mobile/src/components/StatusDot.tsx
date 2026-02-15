/**
 * StatusDot - colored indicator for agent/file health status.
 * Green = healthy, Yellow = warning, Red = error, Gray = idle.
 */
import React from "react";
import { View, StyleSheet } from "react-native";
import { colors } from "../theme";

type StatusDotVariant = "healthy" | "warning" | "error" | "idle";

interface StatusDotProps {
  variant: StatusDotVariant;
  size?: number;
}

export function StatusDot({ variant, size = 8 }: StatusDotProps): React.JSX.Element {
  const color = colors.status[variant];

  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    // Base styles handled by inline
  },
});
