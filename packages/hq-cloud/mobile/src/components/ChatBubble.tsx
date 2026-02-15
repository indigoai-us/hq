/**
 * ChatBubble - Renders a single message in the agent detail chat.
 *
 * Supports four message roles with distinct styling:
 * - agent: Left-aligned, dark card background, bullet indicator
 * - user: Right-aligned, highlighted with user's selected text
 * - system: Centered, muted, smaller text
 * - tool: Left-aligned, monospace with tool execution block styling
 *
 * From Figma design:
 * - Agent messages show as dark bubbles with bullet point (chain-of-thought)
 * - Tool execution shown as "Task {toolName}" in monospace
 * - User messages appear right-aligned
 * - System messages are centered, dim
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";
import type { AgentMessage } from "../types";

interface ChatBubbleProps {
  /** The message to display */
  message: AgentMessage;
  /** Test ID for testing */
  testID?: string;
}

/** Format timestamp to short time string */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  const m = minutes.toString().padStart(2, "0");
  return `${h}:${m} ${ampm}`;
}

/** Tool execution status indicator */
function toolStatusIcon(status?: "running" | "completed" | "failed"): string {
  switch (status) {
    case "running":
      return "\u25CB"; // circle outline
    case "completed":
      return "\u2713"; // checkmark
    case "failed":
      return "\u2717"; // x mark
    default:
      return "\u25CB";
  }
}

export function ChatBubble({ message, testID }: ChatBubbleProps): React.JSX.Element {
  const { role, content, timestamp, toolName, toolStatus } = message;

  // Tool execution block
  if (role === "tool") {
    return (
      <View style={styles.toolContainer} testID={testID}>
        <View style={styles.toolBlock}>
          <Text style={styles.toolStatusIcon}>
            {toolStatusIcon(toolStatus)}
          </Text>
          <View style={styles.toolContent}>
            <Text style={styles.toolLabel}>Task</Text>
            <Text style={styles.toolName} numberOfLines={2}>
              {toolName ?? content}
            </Text>
          </View>
        </View>
        {content && toolName && (
          <Text style={styles.toolOutput} numberOfLines={3}>
            {content}
          </Text>
        )}
        <Text style={styles.timestamp}>{formatTime(timestamp)}</Text>
      </View>
    );
  }

  // System message
  if (role === "system") {
    return (
      <View style={styles.systemContainer} testID={testID}>
        <Text style={styles.systemText}>{content}</Text>
        <Text style={styles.systemTimestamp}>{formatTime(timestamp)}</Text>
      </View>
    );
  }

  // User message (right-aligned)
  if (role === "user") {
    return (
      <View style={styles.userContainer} testID={testID}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{content}</Text>
        </View>
        <Text style={[styles.timestamp, styles.userTimestamp]}>
          {formatTime(timestamp)}
        </Text>
      </View>
    );
  }

  // Agent message (left-aligned with bullet)
  return (
    <View style={styles.agentContainer} testID={testID}>
      <View style={styles.agentRow}>
        <View style={styles.bulletWrapper}>
          <View style={styles.bullet} />
        </View>
        <View style={styles.agentBubble}>
          <Text style={styles.agentText}>{content}</Text>
        </View>
      </View>
      <Text style={styles.timestamp}>{formatTime(timestamp)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Agent message styles
  agentContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    alignItems: "flex-start",
  },
  agentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    maxWidth: "90%",
  },
  bulletWrapper: {
    width: spacing.xl,
    paddingTop: spacing.sm,
    alignItems: "center",
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text.secondary,
  },
  agentBubble: {
    flex: 1,
  },
  agentText: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 22,
  },

  // User message styles
  userContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    alignItems: "flex-end",
  },
  userBubble: {
    backgroundColor: colors.background.elevated,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: "85%",
  },
  userText: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 22,
  },

  // System message styles
  systemContainer: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  systemText: {
    ...typography.caption,
    color: colors.text.tertiary,
    textAlign: "center",
  },
  systemTimestamp: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginTop: spacing.xxs,
  },

  // Tool execution block styles
  toolContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    alignItems: "flex-start",
  },
  toolBlock: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: "90%",
    gap: spacing.sm,
  },
  toolStatusIcon: {
    ...typography.mono,
    color: colors.accent.yellow,
    fontSize: 14,
  },
  toolContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
  },
  toolLabel: {
    ...typography.buttonSmall,
    color: colors.text.primary,
  },
  toolName: {
    ...typography.mono,
    color: colors.text.secondary,
    flex: 1,
  },
  toolOutput: {
    ...typography.mono,
    color: colors.text.tertiary,
    paddingLeft: spacing.xxl,
    marginTop: spacing.xs,
    maxWidth: "90%",
  },

  // Shared timestamp
  timestamp: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginTop: spacing.xxs,
    paddingLeft: spacing.xl,
  },
  userTimestamp: {
    paddingLeft: 0,
    paddingRight: spacing.xs,
  },
});
