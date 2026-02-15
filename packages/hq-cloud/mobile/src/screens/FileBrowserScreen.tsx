/**
 * FileBrowserScreen - Semantic tree view of HQ files (Navigator screen).
 *
 * Matches the Figma Navigator screen design:
 * - "NAVIGATOR" section header
 * - Top-level groupings: Companies, Standalone Projects
 * - Semantic tree: Companies > Projects > Workers/Knowledge
 * - Expandable/collapsible folders with chevron indicators
 * - Distinct icons by node type (company, project, worker, knowledge, file)
 * - Colored status dots per item (green=healthy, yellow=warning, red=error)
 * - Tap file/knowledge node to navigate to FileViewer
 * - Pull-to-refresh
 * - Loading, error, and empty states
 * - Real-time updates via WebSocket (navigator:updated)
 *
 * Data flow:
 * - Tree fetched from API via useNavigator hook
 * - Real-time updates via WebSocket subscription
 * - Expand/collapse state managed locally (not persisted)
 */
import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { SectionHeader, ActionButton } from "../components";
import { GlobalInputBar } from "../components/GlobalInputBar";
import { TreeGroup } from "../components/TreeGroup";
import { useNavigator } from "../hooks/useNavigator";
import { sendGlobalMessage } from "../services/agents";
import type { NavigatorStackParamList } from "../types";
import type { AttachmentType } from "../components/AttachmentMenu";

type Props = NativeStackScreenProps<NavigatorStackParamList, "FileBrowser">;

export function FileBrowserScreen({ navigation }: Props): React.JSX.Element {
  const {
    groups,
    loading,
    refreshing,
    error,
    refresh,
    expandedNodes,
    toggleNode,
  } = useNavigator();

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
    // MOB-011: Navigate to worker spawn flow when implemented
  }, []);

  const handleCreateProject = useCallback(() => {
    // Placeholder - project creation flow in future story
  }, []);

  const handleOpenFile = useCallback(
    (filePath: string) => {
      navigation.navigate("FileViewer", { filePath });
    },
    [navigation],
  );

  // Loading state (initial load)
  if (loading && groups.length === 0) {
    return (
      <View style={styles.centerContainer} testID="navigator-loading">
        <ActivityIndicator size="large" color={colors.accent.yellow} />
        <Text style={styles.loadingText}>Loading navigator...</Text>
      </View>
    );
  }

  // Error state (no tree loaded)
  if (error && groups.length === 0) {
    return (
      <View style={styles.centerContainer} testID="navigator-error">
        <Text style={styles.errorTitle}>Could not load navigator</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <ActionButton
          label="Try Again"
          onPress={refresh}
          variant="primary"
          style={styles.retryButton}
          testID="navigator-retry-button"
        />
      </View>
    );
  }

  // Empty state
  if (!loading && groups.length === 0) {
    return (
      <View style={styles.centerContainer} testID="navigator-empty">
        <Text style={styles.emptyTitle}>No Files Yet</Text>
        <Text style={styles.emptySubtitle}>
          Your companies, projects, and knowledge will appear here
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="navigator-screen">
      <SectionHeader title="Navigator" style={styles.sectionHeader} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.text.secondary}
            colors={[colors.accent.yellow]}
          />
        }
        showsVerticalScrollIndicator={false}
        testID="navigator-scroll"
      >
        {groups.map((group) => (
          <TreeGroup
            key={group.id}
            group={group}
            expandedNodes={expandedNodes}
            onToggle={toggleNode}
            onOpenFile={handleOpenFile}
          />
        ))}
      </ScrollView>
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
  scrollContent: {
    paddingBottom: spacing.xxl,
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
