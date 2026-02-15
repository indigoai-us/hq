/**
 * AgentCard - Full agent card matching the Figma Agents screen design.
 *
 * Layout (from Figma screenshot):
 * ┌─────────────────────────────────────────┐
 * │ [TypeIcon] Agent Name           3/4     │
 * │  ●         ═══════════════════          │
 * │                                         │
 * │  (if waiting_input with question:)      │
 * │  Which task do you want to work on? 10m │
 * │  ┌─────────────────────────────────┐    │
 * │  │ Option A                        │    │
 * │  ├─────────────────────────────────┤    │
 * │  │ Option B                        │    │
 * │  └─────────────────────────────────┘    │
 * │  Type something else...                 │
 * │                                         │
 * │  (after answering:)                     │
 * │  ✓ Answered                             │
 * │                                         │
 * │  (if waiting_input with permission:)    │
 * │  Allow to Read Desktop?             5m  │
 * │                    [Deny]  [Allow]      │
 * │                                         │
 * │  (after responding:)                    │
 * │  Allowed: Read Desktop                  │
 * └─────────────────────────────────────────┘
 *
 * The card is tappable and navigates to the AgentDetail screen.
 *
 * MOB-005: Quick answer from worker card
 * - Haptic feedback on option tap and custom answer submit
 * - Sending state disables buttons to prevent double-tap
 * - Brief "Answered" confirmation shown after answer sent
 *
 * MOB-012: Inline permission prompts on agent cards
 * - Permission prompt displayed inline when agent has currentPermission
 * - Allow (prominent) and Deny (muted) buttons with distinct styling
 * - Haptic feedback on Allow/Deny tap
 * - Timestamp shown on permission request
 * - Card updates immediately after response
 */
import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Card } from "./Card";
import { ProgressBar } from "./ProgressBar";
import { StatusDot } from "./StatusDot";
import { AgentTypeIcon } from "./AgentTypeIcon";
import { OptionButton } from "./OptionButton";
import { ActionButton } from "./ActionButton";
import { colors, spacing, typography, borderRadius } from "../theme";
import type { Agent, AgentStatus } from "../types";

interface AgentCardProps {
  /** Agent data to display */
  agent: Agent;
  /** Called when the card is tapped (navigate to detail) */
  onPress: () => void;
  /** Called when a question option is selected */
  onAnswerQuestion?: (questionId: string, answer: string) => void;
  /** Called when a custom answer is submitted */
  onSubmitCustomAnswer?: (questionId: string, answer: string) => void;
  /** Called when a permission request is responded to (MOB-012) */
  onRespondPermission?: (permissionId: string, allowed: boolean) => void;
  /** Test ID for testing */
  testID?: string;
}

/** Map agent status to StatusDot variant */
function statusToVariant(status: AgentStatus): "healthy" | "warning" | "error" | "idle" {
  switch (status) {
    case "running":
      return "healthy";
    case "waiting_input":
      return "warning";
    case "error":
      return "error";
    case "completed":
      return "healthy";
    case "idle":
    default:
      return "idle";
  }
}

/** Format a timestamp string into a relative time label (e.g., "5m") */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export function AgentCard({
  agent,
  onPress,
  onAnswerQuestion,
  onSubmitCustomAnswer,
  onRespondPermission,
  testID,
}: AgentCardProps): React.JSX.Element {
  const [customAnswer, setCustomAnswer] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [answered, setAnswered] = React.useState(false);
  const [permissionResponded, setPermissionResponded] = React.useState(false);
  const [permissionResponseType, setPermissionResponseType] = React.useState<"allowed" | "denied" | null>(null);
  const hasQuestion = agent.status === "waiting_input" && agent.currentQuestion != null;
  const hasPermission = agent.status === "waiting_input" && agent.currentPermission != null;

  // Reset answered state when a new question appears
  React.useEffect(() => {
    if (hasQuestion) {
      setAnswered(false);
      setSending(false);
    }
  }, [hasQuestion, agent.currentQuestion?.id]);

  // Reset permission responded state when a new permission appears
  React.useEffect(() => {
    if (hasPermission) {
      setPermissionResponded(false);
      setPermissionResponseType(null);
    }
  }, [hasPermission, agent.currentPermission?.id]);

  const handleOptionPress = React.useCallback(
    (option: string) => {
      if (agent.currentQuestion && onAnswerQuestion && !sending) {
        setSending(true);
        setAnswered(true);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onAnswerQuestion(agent.currentQuestion.id, option);
      }
    },
    [agent.currentQuestion, onAnswerQuestion, sending],
  );

  const handleSubmitCustom = React.useCallback(() => {
    if (customAnswer.trim() && agent.currentQuestion && onSubmitCustomAnswer && !sending) {
      setSending(true);
      setAnswered(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSubmitCustomAnswer(agent.currentQuestion.id, customAnswer.trim());
      setCustomAnswer("");
    }
  }, [customAnswer, agent.currentQuestion, onSubmitCustomAnswer, sending]);

  const handlePermissionAllow = React.useCallback(() => {
    if (agent.currentPermission && onRespondPermission && !permissionResponded) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPermissionResponded(true);
      setPermissionResponseType("allowed");
      onRespondPermission(agent.currentPermission.id, true);
    }
  }, [agent.currentPermission, onRespondPermission, permissionResponded]);

  const handlePermissionDeny = React.useCallback(() => {
    if (agent.currentPermission && onRespondPermission && !permissionResponded) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPermissionResponded(true);
      setPermissionResponseType("denied");
      onRespondPermission(agent.currentPermission.id, false);
    }
  }, [agent.currentPermission, onRespondPermission, permissionResponded]);

  return (
    <Card onPress={onPress} testID={testID}>
      {/* Top row: icon + name + progress fraction */}
      <View style={styles.headerRow}>
        <AgentTypeIcon type={agent.type} size={36} testID={testID ? `${testID}-icon` : undefined} />
        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.agentName} numberOfLines={1}>
              {agent.name}
            </Text>
            <Text style={styles.fraction}>
              {agent.progress.completed}/{agent.progress.total}
            </Text>
          </View>
          {/* Status dot + progress bar row */}
          <View style={styles.progressRow}>
            <StatusDot variant={statusToVariant(agent.status)} size={6} />
            <View style={styles.progressBarWrapper}>
              <ProgressBar
                completed={agent.progress.completed}
                total={agent.progress.total}
                showFraction={false}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Question section (only when waiting_input with question, no permission) */}
      {hasQuestion && !hasPermission && agent.currentQuestion && (
        <View style={styles.questionSection}>
          {/* Question text + time */}
          <View style={styles.questionHeader}>
            <Text style={styles.questionText}>{agent.currentQuestion.text}</Text>
            <Text style={styles.questionTime}>
              {formatRelativeTime(agent.currentQuestion.askedAt)}
            </Text>
          </View>

          {/* Answered confirmation state */}
          {answered ? (
            <View style={styles.answeredRow} testID={testID ? `${testID}-answered` : undefined}>
              <Text style={styles.answeredText}>Answered</Text>
            </View>
          ) : (
            <>
              {/* Multi-choice options */}
              {agent.currentQuestion.options && agent.currentQuestion.options.length > 0 && (
                <View style={styles.optionsList}>
                  {agent.currentQuestion.options.map((option) => (
                    <OptionButton
                      key={option}
                      label={option}
                      onPress={() => handleOptionPress(option)}
                      disabled={sending}
                      testID={testID ? `${testID}-option-${option}` : undefined}
                    />
                  ))}
                </View>
              )}

              {/* Custom answer input */}
              <TextInput
                style={[styles.customInput, sending ? styles.customInputDisabled : undefined]}
                placeholder="Type something else..."
                placeholderTextColor={colors.text.tertiary}
                value={customAnswer}
                onChangeText={setCustomAnswer}
                onSubmitEditing={handleSubmitCustom}
                returnKeyType="send"
                editable={!sending}
                testID={testID ? `${testID}-custom-input` : undefined}
              />
            </>
          )}
        </View>
      )}

      {/* Permission section (MOB-012: when waiting_input with permission request) */}
      {hasPermission && agent.currentPermission && (
        <View style={styles.permissionSection} testID={testID ? `${testID}-permission` : undefined}>
          {permissionResponded && permissionResponseType ? (
            <View style={styles.permissionRespondedRow} testID={testID ? `${testID}-permission-responded` : undefined}>
              <Text style={styles.permissionRespondedText}>
                {permissionResponseType === "allowed" ? "Allowed" : "Denied"}: {agent.currentPermission.tool}
              </Text>
            </View>
          ) : (
            <>
              {/* Permission description + timestamp */}
              <View style={styles.permissionHeader}>
                <Text style={styles.permissionText}>
                  Allow to <Text style={styles.permissionBold}>{agent.currentPermission.tool}</Text>{" "}
                  {agent.currentPermission.description}?
                </Text>
                <Text style={styles.permissionTime}>
                  {formatRelativeTime(agent.currentPermission.requestedAt)}
                </Text>
              </View>

              {/* Allow / Deny buttons */}
              <View style={styles.permissionButtonRow}>
                <ActionButton
                  label="Deny"
                  variant="muted"
                  onPress={handlePermissionDeny}
                  disabled={permissionResponded}
                  testID={testID ? `${testID}-permission-deny` : undefined}
                  style={styles.permissionDenyButton}
                />
                <ActionButton
                  label="Allow"
                  variant="prominent"
                  onPress={handlePermissionAllow}
                  disabled={permissionResponded}
                  testID={testID ? `${testID}-permission-allow` : undefined}
                  style={styles.permissionAllowButton}
                />
              </View>
            </>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  headerInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  agentName: {
    ...typography.cardTitle,
    flex: 1,
    marginRight: spacing.sm,
  },
  fraction: {
    ...typography.progressFraction,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  progressBarWrapper: {
    flex: 1,
  },
  questionSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  questionText: {
    ...typography.bodySmall,
    color: colors.text.primary,
    flex: 1,
  },
  questionTime: {
    ...typography.label,
    color: colors.text.tertiary,
  },
  optionsList: {
    gap: spacing.sm,
  },
  customInput: {
    ...typography.bodySmall,
    color: colors.text.primary,
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  customInputDisabled: {
    opacity: 0.5,
  },
  answeredRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  answeredText: {
    ...typography.bodySmall,
    color: colors.accent.green,
  },
  // MOB-012: Permission prompt styles
  permissionSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  permissionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  permissionText: {
    ...typography.bodySmall,
    color: colors.text.primary,
    flex: 1,
  },
  permissionBold: {
    fontWeight: "700",
  },
  permissionTime: {
    ...typography.label,
    color: colors.text.tertiary,
  },
  permissionButtonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  permissionDenyButton: {
    minWidth: 80,
  },
  permissionAllowButton: {
    minWidth: 80,
  },
  permissionRespondedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  permissionRespondedText: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
});
