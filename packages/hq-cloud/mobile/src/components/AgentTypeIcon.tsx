/**
 * AgentTypeIcon - Renders a distinctive icon for each agent type.
 * Uses Unicode symbols to differentiate research, content, ops, code, and social agents.
 * Matches the Figma design where each card has a type-specific icon to the left of the name.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme";
import type { AgentType } from "../types";

interface AgentTypeIconProps {
  /** The agent type determines which icon is shown */
  type: AgentType;
  /** Icon container size in pixels (default: 40) */
  size?: number;
  /** Test ID for testing */
  testID?: string;
}

/** Icon character and background tint per agent type */
const ICON_MAP: Record<AgentType, { symbol: string; tint: string }> = {
  research: { symbol: "\uD83D\uDD0D", tint: colors.accent.blue },
  content: { symbol: "\u2610", tint: colors.accent.yellow },
  ops: { symbol: "\u2699", tint: colors.accent.green },
  code: { symbol: "\u276F", tint: colors.accent.purple },
  social: { symbol: "\u2B50", tint: colors.accent.blue },
};

export function AgentTypeIcon({
  type,
  size = 40,
  testID,
}: AgentTypeIconProps): React.JSX.Element {
  const { symbol, tint } = ICON_MAP[type] ?? ICON_MAP.code;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tint + "1A", // 10% opacity tint
        },
      ]}
      testID={testID}
      accessibilityLabel={`${type} agent`}
    >
      <Text
        style={[
          styles.icon,
          {
            fontSize: size * 0.45,
            color: tint,
          },
        ]}
      >
        {symbol}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    textAlign: "center",
  },
});
