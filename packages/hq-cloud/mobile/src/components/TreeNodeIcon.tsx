/**
 * TreeNodeIcon - Renders a distinctive icon for each navigator node type.
 *
 * Uses Unicode symbols matching the Figma Navigator screen:
 * - company: building icon
 * - project: rocket/gear icon
 * - worker: pen/chart icons (varies by context)
 * - knowledge: document icon
 * - file: page icon
 *
 * Icons are rendered inline (no circular background) to match the
 * tree row style in the Figma design.
 */
import React from "react";
import { Text, StyleSheet } from "react-native";
import { colors } from "../theme";
import type { NavigatorNodeType } from "../types";

interface TreeNodeIconProps {
  /** The node type determines which icon is shown */
  type: NavigatorNodeType;
  /** Font size for the icon (default: 16) */
  size?: number;
  /** Test ID for testing */
  testID?: string;
}

/** Icon character and color per node type */
const ICON_MAP: Record<NavigatorNodeType, { symbol: string; color: string }> = {
  company: { symbol: "\uD83C\uDFE2", color: colors.text.secondary },   // building
  project: { symbol: "\uD83D\uDE80", color: colors.text.secondary },   // rocket
  worker: { symbol: "\u270E", color: colors.text.secondary },          // pencil
  knowledge: { symbol: "\uD83D\uDCC4", color: colors.text.secondary }, // document
  file: { symbol: "\uD83D\uDCC3", color: colors.text.secondary },     // page
};

export function TreeNodeIcon({
  type,
  size = 16,
  testID,
}: TreeNodeIconProps): React.JSX.Element {
  const { symbol, color } = ICON_MAP[type];

  return (
    <Text
      style={[styles.icon, { fontSize: size, color }]}
      testID={testID}
      accessibilityLabel={`${type} icon`}
    >
      {symbol}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: {
    textAlign: "center",
    width: 24,
  },
});
