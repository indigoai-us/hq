/**
 * Agent detail screen - Full chat view for an agent's conversation.
 *
 * From Figma design (Agent detail screenshot):
 * - Back arrow + worker name header (handled by navigation stack)
 * - Chat-style message list with:
 *   - Agent reasoning/chain-of-thought visible as bulleted text
 *   - Inline tool/task execution blocks (e.g., "Task Explore HQ knowledge structure")
 *   - Messages with role-based styling (agent/user/system/tool)
 *   - Inline permission prompts (Allow/Deny) for tool execution
 * - Auto-scroll to bottom on new messages
 * - Loading state while fetching history
 * - Text input at bottom with send button and quick-reply options
 *
 * MOB-006: Agent detail screen with chat
 * MOB-007: Answer input on detail screen
 */
import React, { useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type ListRenderItemInfo,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChatBubble } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { PermissionPrompt } from "../components/PermissionPrompt";
import { StatusDot } from "../components/StatusDot";
import { colors, spacing, typography } from "../theme";
import { useAgentDetail } from "../hooks/useAgentDetail";
import type { AgentMessage, AgentStatus, AgentsStackParamList } from "../types";

type Props = NativeStackScreenProps<AgentsStackParamList, "AgentDetail">;

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

/** Map agent status to display label */
function statusLabel(status: AgentStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "waiting_input":
      return "Waiting for input";
    case "completed":
      return "Completed";
    case "error":
      return "Error";
    case "idle":
    default:
      return "Idle";
  }
}

export function AgentDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const { agentId } = route.params;
  const {
    agent,
    messages,
    loading,
    error,
    handlePermissionResponse,
    permissionSending,
    handleSendMessage,
    messageSending,
    handleAnswerQuestion,
    answerSending,
  } = useAgentDetail(agentId);

  const flatListRef = useRef<FlatList<AgentMessage>>(null);

  // Update the header title to the agent's name when loaded
  useEffect(() => {
    if (agent) {
      navigation.setOptions({
        title: agent.name,
      });
    }
  }, [agent, navigation]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      // Small delay so FlatList has time to render
      const timeout = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [messages.length]);

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<AgentMessage>) => (
      <ChatBubble
        message={item}
        testID={`message-${item.id}`}
      />
    ),
    [],
  );

  const keyExtractor = useCallback((item: AgentMessage) => item.id, []);

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerContainer} testID="agent-detail-loading">
        <ActivityIndicator size="large" color={colors.accent.blue} />
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.centerContainer} testID="agent-detail-error">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      testID="agent-detail-screen"
    >
      {/* Agent status bar */}
      {agent && (
        <View style={styles.statusBar} testID="agent-status-bar">
          <StatusDot variant={statusToVariant(agent.status)} size={8} />
          <Text style={styles.statusText}>{statusLabel(agent.status)}</Text>
          <Text style={styles.progressText}>
            {agent.progress.completed}/{agent.progress.total} tasks
          </Text>
        </View>
      )}

      {/* Message list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.messageList,
          messages.length === 0 ? styles.emptyList : undefined,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>
              Agent activity will appear here
            </Text>
          </View>
        }
        testID="message-list"
      />

      {/* Inline permission prompt (at bottom, above input) */}
      {agent?.currentPermission && (
        <PermissionPrompt
          permission={agent.currentPermission}
          onRespond={handlePermissionResponse}
          sending={permissionSending}
          testID="permission-prompt"
        />
      )}

      {/* Chat input with quick-reply options */}
      <ChatInput
        onSendMessage={handleSendMessage}
        onSelectOption={handleAnswerQuestion}
        currentQuestion={agent?.currentQuestion}
        sending={messageSending || answerSending}
        testID="chat-input"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background.primary,
    padding: spacing.xxl,
    gap: spacing.md,
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  errorText: {
    ...typography.body,
    color: colors.accent.red,
    textAlign: "center",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    gap: spacing.sm,
  },
  statusText: {
    ...typography.label,
    color: colors.text.secondary,
    flex: 1,
  },
  progressText: {
    ...typography.label,
    color: colors.text.tertiary,
  },
  messageList: {
    paddingVertical: spacing.md,
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  emptySubtext: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
});
