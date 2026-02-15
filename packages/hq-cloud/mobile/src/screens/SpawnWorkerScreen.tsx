/**
 * SpawnWorkerScreen - Multi-step flow to spawn a worker from mobile.
 *
 * Steps:
 * 1. Pick a worker from the registry
 * 2. Select a skill for the chosen worker
 * 3. Configure optional parameters (if the skill has any)
 * 4. Review and confirm spawn
 *
 * After successful spawn, navigates to the new agent's detail screen.
 *
 * MOB-011: Spawn worker from mobile
 */
import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { SectionHeader, ActionButton } from "../components";
import { WorkerPickerItem } from "../components/WorkerPickerItem";
import { SkillPickerItem } from "../components/SkillPickerItem";
import { ParameterInput } from "../components/ParameterInput";
import { SpawnConfirmation } from "../components/SpawnConfirmation";
import { useSpawnWorker } from "../hooks/useSpawnWorker";
import type { AgentsStackParamList, WorkerDefinition, WorkerSkill } from "../types";

type Props = NativeStackScreenProps<AgentsStackParamList, "SpawnWorker">;

export function SpawnWorkerScreen({ navigation }: Props): React.JSX.Element {
  const {
    workers,
    loading,
    error,
    step,
    selectedWorker,
    selectedSkill,
    parameters,
    spawning,
    selectWorker,
    selectSkill,
    setParameter,
    goToConfirm,
    confirmSpawn,
    canProceed,
  } = useSpawnWorker();

  const handleConfirmSpawn = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await confirmSpawn();
    if (result) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Navigate to the newly spawned agent's detail screen
      navigation.replace("AgentDetail", { agentId: result.agentId });
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Spawn Failed", "Could not spawn the worker. Please try again.");
    }
  }, [confirmSpawn, navigation]);

  const handleSelectWorker = useCallback(
    (worker: WorkerDefinition) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      selectWorker(worker);
    },
    [selectWorker],
  );

  const handleSelectSkill = useCallback(
    (skill: WorkerSkill) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      selectSkill(skill);
    },
    [selectSkill],
  );

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerContainer} testID="spawn-loading">
        <ActivityIndicator size="large" color={colors.accent.yellow} />
        <Text style={styles.loadingText}>Loading workers...</Text>
      </View>
    );
  }

  // Error state
  if (error && workers.length === 0) {
    return (
      <View style={styles.centerContainer} testID="spawn-error">
        <Text style={styles.errorTitle}>Could not load workers</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  // Step 1: Pick a worker
  if (step === "pick-worker") {
    return (
      <View style={styles.container} testID="spawn-pick-worker">
        <SectionHeader title="Select Worker" style={styles.sectionHeader} />
        <FlatList
          data={workers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <WorkerPickerItem
              worker={item}
              onSelect={handleSelectWorker}
              testID={`worker-item-${item.id}`}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          testID="worker-list"
        />
      </View>
    );
  }

  // Step 2: Pick a skill
  if (step === "pick-skill" && selectedWorker) {
    return (
      <View style={styles.container} testID="spawn-pick-skill">
        <SectionHeader
          title={`${selectedWorker.name} \u2014 Skills`}
          style={styles.sectionHeader}
        />
        <FlatList
          data={selectedWorker.skills}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SkillPickerItem
              skill={item}
              onSelect={handleSelectSkill}
              testID={`skill-item-${item.id}`}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          testID="skill-list"
        />
      </View>
    );
  }

  // Step 3: Configure parameters
  if (step === "configure" && selectedWorker && selectedSkill) {
    const skillParams = selectedSkill.parameters ?? [];

    return (
      <View style={styles.container} testID="spawn-configure">
        <SectionHeader title="Configure" style={styles.sectionHeader} />
        <ScrollView
          contentContainerStyle={styles.configureContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.configureSubtitle}>
            {selectedWorker.name} \u2014 {selectedSkill.name}
          </Text>
          {skillParams.map((param) => (
            <ParameterInput
              key={param.name}
              parameter={param}
              value={parameters[param.name] ?? param.defaultValue ?? ""}
              onChange={setParameter}
              testID={`param-${param.name}`}
            />
          ))}
        </ScrollView>
        <View style={styles.footer}>
          <ActionButton
            label="Continue"
            onPress={goToConfirm}
            variant="primary"
            disabled={!canProceed}
            fullWidth
            testID="spawn-continue-button"
          />
        </View>
      </View>
    );
  }

  // Step 4: Confirm spawn
  if (step === "confirm" && selectedWorker && selectedSkill) {
    return (
      <View style={styles.container} testID="spawn-confirm">
        <ScrollView
          contentContainerStyle={styles.confirmContent}
          showsVerticalScrollIndicator={false}
        >
          <SpawnConfirmation
            worker={selectedWorker}
            skill={selectedSkill}
            parameters={parameters}
            testID="spawn-confirmation"
          />

          {error && (
            <Text style={styles.spawnError} testID="spawn-error-message">
              {error}
            </Text>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <ActionButton
            label="Spawn Worker"
            onPress={() => void handleConfirmSpawn()}
            variant="prominent"
            loading={spawning}
            disabled={spawning}
            fullWidth
            testID="spawn-confirm-button"
          />
        </View>
      </View>
    );
  }

  // Fallback (should not reach here)
  return (
    <View style={styles.centerContainer}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
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
  configureContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  configureSubtitle: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  confirmContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.background.primary,
  },
  spawnError: {
    ...typography.bodySmall,
    color: colors.accent.red,
    textAlign: "center",
  },
});
