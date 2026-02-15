/**
 * NotificationSettingsScreen - User-configurable notification preferences.
 * Allows toggling push notification categories on/off.
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  TouchableOpacity,
} from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";
import { useNotifications } from "../hooks/useNotifications";

interface SettingRowProps {
  label: string;
  description: string;
  value: boolean;
  onToggle: () => Promise<void>;
  disabled?: boolean;
}

function SettingRow({ label, description, value, onToggle, disabled }: SettingRowProps): React.JSX.Element {
  const [toggling, setToggling] = useState(false);

  const handleToggle = useCallback(async () => {
    if (toggling) return;
    setToggling(true);
    try {
      await onToggle();
    } catch {
      Alert.alert("Error", "Failed to update setting. Please try again.");
    } finally {
      setToggling(false);
    }
  }, [onToggle, toggling]);

  return (
    <View style={[styles.settingRow, disabled && styles.settingRowDisabled]}>
      <View style={styles.settingTextContainer}>
        <Text style={[styles.settingLabel, disabled && styles.settingLabelDisabled]}>
          {label}
        </Text>
        <Text style={[styles.settingDescription, disabled && styles.settingDescriptionDisabled]}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={() => void handleToggle()}
        disabled={disabled || toggling}
        trackColor={{ false: colors.background.elevated, true: colors.accent.blue }}
        thumbColor={value ? colors.text.primary : colors.text.tertiary}
        ios_backgroundColor={colors.background.elevated}
        accessibilityLabel={`${label} toggle`}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled: disabled || toggling }}
      />
    </View>
  );
}

export function NotificationSettingsScreen(): React.JSX.Element {
  const {
    permissionGranted,
    settings,
    toggleEnabled,
    toggleQuestions,
    togglePermissions,
    toggleStatusUpdates,
    requestPermission,
  } = useNotifications();

  const handleOpenSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const handleRequestPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert(
        "Notifications Disabled",
        "Push notifications are disabled in your device settings. Would you like to open settings to enable them?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: handleOpenSystemSettings },
        ],
      );
    }
  }, [requestPermission, handleOpenSystemSettings]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Permission banner */}
      {!permissionGranted && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionTitle}>Notifications are disabled</Text>
          <Text style={styles.permissionDescription}>
            Enable push notifications to get alerts when workers need your input.
          </Text>
          <TouchableOpacity
            style={styles.enableButton}
            onPress={() => void handleRequestPermission()}
            accessibilityRole="button"
            accessibilityLabel="Enable notifications"
          >
            <Text style={styles.enableButtonText}>Enable Notifications</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Master toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          <SettingRow
            label="Push Notifications"
            description="Receive alerts when workers need your attention"
            value={settings.enabled}
            onToggle={toggleEnabled}
          />
        </View>
      </View>

      {/* Category toggles */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>CATEGORIES</Text>
        <View style={styles.card}>
          <SettingRow
            label="Questions"
            description="When a worker asks you a question"
            value={settings.questionsEnabled}
            onToggle={toggleQuestions}
            disabled={!settings.enabled}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Permission Requests"
            description="When a worker needs approval to use a tool"
            value={settings.permissionsEnabled}
            onToggle={togglePermissions}
            disabled={!settings.enabled}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Status Updates"
            description="When a worker completes or encounters an error"
            value={settings.statusUpdatesEnabled}
            onToggle={toggleStatusUpdates}
            disabled={!settings.enabled}
          />
        </View>
      </View>

      {/* System settings link */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.systemSettingsLink}
          onPress={handleOpenSystemSettings}
          accessibilityRole="button"
          accessibilityLabel="Open device notification settings"
        >
          <Text style={styles.systemSettingsText}>Open Device Settings</Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>
          Manage notification sounds, badges, and banners in your device settings.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  contentContainer: {
    paddingVertical: spacing.lg,
  },
  permissionBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accent.yellow,
  },
  permissionTitle: {
    ...typography.cardTitle,
    marginBottom: spacing.xs,
  },
  permissionDescription: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
  },
  enableButton: {
    backgroundColor: colors.accent.blue,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: "flex-start",
  },
  enableButtonText: {
    ...typography.buttonSmall,
    color: colors.text.primary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    ...typography.sectionHeader,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  settingRowDisabled: {
    opacity: 0.5,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    ...typography.body,
    marginBottom: spacing.xxs,
  },
  settingLabelDisabled: {
    color: colors.text.tertiary,
  },
  settingDescription: {
    ...typography.caption,
  },
  settingDescriptionDisabled: {
    color: colors.text.tertiary,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginHorizontal: spacing.lg,
  },
  systemSettingsLink: {
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
  },
  systemSettingsText: {
    ...typography.buttonSmall,
    color: colors.accent.blue,
  },
  footnote: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
});
