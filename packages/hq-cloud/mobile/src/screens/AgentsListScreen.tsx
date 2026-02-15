/**
 * AgentsListScreen - Displays a scrollable list of agent cards with real-time updates.
 *
 * Matches the Figma "Agents" screen design:
 * - "AGENTS" section header
 * - Agent cards with type icon, name, status dot, progress bar + fraction
 * - Inline question display with multi-choice options when waiting_input
 * - Pull-to-refresh
 * - Empty state when no agents are running
 * - Error state with retry
 *
 * Data flow:
 * - Initial data fetched from API via useAgents hook
 * - Real-time updates via WebSocket (agent:updated, agent:created, agent:deleted)
 * - Question answers sent via agents service
 */
import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { SectionHeader, ActionButton } from "../components";
import { GlobalInputBar } from "../components/GlobalInputBar";
import { AgentCard } from "../components/AgentCard";
import { useAgents } from "../hooks/useAgents";
import { answerQuestion, respondToPermission, sendGlobalMessage } from "../services/agents";
import type { AgentsStackParamList, Agent } from "../types";
import type { AttachmentType } from "../components/AttachmentMenu";

type Props = NativeStackScreenProps<AgentsStackParamList, "AgentsList">;

export function AgentsListScreen({ navigation }: Props): React.JSX.Element {
  const { agents, loading, refreshing, error, refresh, updateAgent } = useAgents();

  const handleAgentPress = useCallback(
    (agentId: string) => {
      navigation.navigate("AgentDetail", { agentId });
    },
    [navigation],
  );

  const handleAnswerQuestion = useCallback(
    (agentId: string, questionId: string, answer: string) => {
      // Send answer to API first, then clear the question after a brief delay
      // so the "Answered" confirmation in AgentCard is visible to the user.
      void answerQuestion(agentId, questionId, answer)
        .then(() => {
          // Delay optimistic clear so "Answered" state shows briefly (~800ms)
          setTimeout(() => {
            updateAgent(agentId, {
              status: "running",
              currentQuestion: undefined,
            });
          }, 800);
        })
        .catch(() => {
          // Revert on failure - re-fetch will restore state
          refresh();
        });
    },
    [updateAgent, refresh],
  );

  const handleRespondPermission = useCallback(
    (agentId: string, permissionId: string, allowed: boolean) => {
      void respondToPermission(agentId, permissionId, allowed)
        .then(() => {
          // Delay optimistic clear so responded state shows briefly (~800ms)
          setTimeout(() => {
            updateAgent(agentId, {
              status: "running",
              currentPermission: undefined,
            });
          }, 800);
        })
        .catch(() => {
          // Revert on failure - re-fetch will restore state
          refresh();
        });
    },
    [updateAgent, refresh],
  );

  const handleGlobalMessage = useCallback(
    (content: string) => {
      void sendGlobalMessage(content).catch(() => {
        // Silent fail - could add toast/snackbar in future
      });
    },
    [],
  );

  const handleAttachment = useCallback((_type: AttachmentType) => {
    // Placeholder - media picker integration in future story
  }, []);

  const handleSpawnAgent = useCallback(() => {
    navigation.navigate("SpawnWorker");
  }, [navigation]);

  const handleCreateProject = useCallback(() => {
    // Placeholder - project creation flow in future story
  }, []);

  const renderAgent = useCallback(
    ({ item }: { item: Agent }) => (
      <AgentCard
        agent={item}
        onPress={() => handleAgentPress(item.id)}
        onAnswerQuestion={(questionId, answer) =>
          handleAnswerQuestion(item.id, questionId, answer)
        }
        onSubmitCustomAnswer={(questionId, answer) =>
          handleAnswerQuestion(item.id, questionId, answer)
        }
        onRespondPermission={(permissionId, allowed) =>
          handleRespondPermission(item.id, permissionId, allowed)
        }
        testID={`agent-card-${item.id}`}
      />
    ),
    [handleAgentPress, handleAnswerQuestion, handleRespondPermission],
  );

  const keyExtractor = useCallback((item: Agent) => item.id, []);

  // Loading state (initial load)
  if (loading && agents.length === 0) {
    return (
      <View style={styles.centerContainer} testID="agents-loading">
        <ActivityIndicator size="large" color={colors.accent.yellow} />
        <Text style={styles.loadingText}>Loading agents...</Text>
      </View>
    );
  }

  // Error state (no agents loaded)
  if (error && agents.length === 0) {
    return (
      <View style={styles.centerContainer} testID="agents-error">
        <Text style={styles.errorTitle}>Could not load agents</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <ActionButton
          label="Try Again"
          onPress={refresh}
          variant="primary"
          style={styles.retryButton}
          testID="agents-retry-button"
        />
      </View>
    );
  }

  // Empty state
  if (!loading && agents.length === 0) {
    return (
      <View style={styles.centerContainer} testID="agents-empty">
        <Text style={styles.emptyTitle}>No Agents Running</Text>
        <Text style={styles.emptySubtitle}>Spawn a worker to get started</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="agents-list-screen">
      <SectionHeader title="Agents" style={styles.sectionHeader} />
      <FlatList
        data={agents}
        keyExtractor={keyExtractor}
        renderItem={renderAgent}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.text.secondary}
            colors={[colors.accent.yellow]}
          />
        }
        showsVerticalScrollIndicator={false}
        testID="agents-flatlist"
      />
      <GlobalInputBar
        onSendMessage={handleGlobalMessage}
        onAttachment={handleAttachment}
        onSpawnAgent={handleSpawnAgent}
        onCreateProject={handleCreateProject}
        testID="global-input-bar"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background.primary,
    padding: spacing.xxl,
  },
  loadingText: {
    ...typography.bodySmall,
    marginTop: spacing.md,
  },
  errorTitle: {
    ...typography.title,
    fontSize: 20,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    ...typography.bodySmall,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  retryButton: {
    minWidth: 120,
  },
  emptyTitle: {
    ...typography.title,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    textAlign: "center",
  },
});
