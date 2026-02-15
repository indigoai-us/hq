/**
 * PermissionPrompt - Inline permission request displayed in the chat.
 *
 * From Figma design (Agent detail screenshot):
 * Shows a card-like block within the chat with:
 * - "Allow to Run {command}?" description
 * - Deny (muted) and Allow (prominent) buttons side by side
 *
 * Used for tool execution approvals within the agent conversation.
 */
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { ActionButton } from "./ActionButton";
import { colors, spacing, typography, borderRadius } from "../theme";
import type { AgentPermissionRequest } from "../types";

interface PermissionPromptProps {
  /** The permission request to display */
  permission: AgentPermissionRequest;
  /** Called when user responds to the permission */
  onRespond: (permissionId: string, allowed: boolean) => void;
  /** Whether a response is being sent */
  sending?: boolean;
  /** Test ID for testing */
  testID?: string;
}

export function PermissionPrompt({
  permission,
  onRespond,
  sending = false,
  testID,
}: PermissionPromptProps): React.JSX.Element {
  const [responded, setResponded] = useState(false);
  const [responseType, setResponseType] = useState<"allowed" | "denied" | null>(null);

  const handleDeny = useCallback(() => {
    if (sending || responded) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResponded(true);
    setResponseType("denied");
    onRespond(permission.id, false);
  }, [sending, responded, onRespond, permission.id]);

  const handleAllow = useCallback(() => {
    if (sending || responded) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResponded(true);
    setResponseType("allowed");
    onRespond(permission.id, true);
  }, [sending, responded, onRespond, permission.id]);

  // Show response confirmation
  if (responded && responseType) {
    return (
      <View style={styles.container} testID={testID}>
        <View style={styles.respondedBlock}>
          <Text style={styles.respondedText}>
            {responseType === "allowed" ? "Allowed" : "Denied"}: {permission.tool}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.promptBlock}>
        <Text style={styles.description}>
          Allow to <Text style={styles.bold}>{permission.tool}</Text>{" "}
          {permission.description}?
        </Text>
        <View style={styles.buttonRow}>
          <ActionButton
            label="Deny"
            variant="muted"
            onPress={handleDeny}
            disabled={sending}
            testID={testID ? `${testID}-deny` : undefined}
            style={styles.denyButton}
          />
          <ActionButton
            label="Allow"
            variant="prominent"
            onPress={handleAllow}
            disabled={sending}
            testID={testID ? `${testID}-allow` : undefined}
            style={styles.allowButton}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  promptBlock: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: spacing.md,
  },
  description: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 22,
  },
  bold: {
    fontWeight: "700",
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  denyButton: {
    minWidth: 80,
  },
  allowButton: {
    minWidth: 80,
  },
  respondedBlock: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  respondedText: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
});
