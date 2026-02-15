/**
 * useNotifications hook.
 * Provides notification state and actions for components.
 * Combines NotificationContext with badge count tracking from agent data.
 */
import { useCallback } from "react";
import { useNotificationContext } from "../contexts/NotificationContext";
import type { NotificationSettings } from "../types/notification";

interface UseNotificationsResult {
  /** Current push token */
  pushToken: string | null;
  /** Whether notification permissions have been granted */
  permissionGranted: boolean;
  /** Current notification settings */
  settings: NotificationSettings;
  /** Current app badge count */
  badgeCount: number;
  /** Update notification settings */
  updateSettings: (settings: Partial<NotificationSettings>) => Promise<void>;
  /** Update badge count based on pending items */
  updateBadgeCount: (pendingCount: number) => void;
  /** Request notification permissions */
  requestPermission: () => Promise<boolean>;
  /** Toggle master notification switch */
  toggleEnabled: () => Promise<void>;
  /** Toggle question notifications */
  toggleQuestions: () => Promise<void>;
  /** Toggle permission notifications */
  togglePermissions: () => Promise<void>;
  /** Toggle status update notifications */
  toggleStatusUpdates: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  const {
    pushToken,
    permissionGranted,
    settings,
    badgeCount,
    updateSettings,
    updateBadgeCount: contextUpdateBadge,
    requestPermission,
  } = useNotificationContext();

  const updateBadgeCount = useCallback(
    (pendingCount: number) => {
      void contextUpdateBadge(pendingCount);
    },
    [contextUpdateBadge],
  );

  const toggleEnabled = useCallback(async () => {
    if (!settings.enabled && !permissionGranted) {
      // Turning on but no permission - request it first
      const granted = await requestPermission();
      if (!granted) return;
    }
    await updateSettings({ enabled: !settings.enabled });
  }, [settings.enabled, permissionGranted, requestPermission, updateSettings]);

  const toggleQuestions = useCallback(async () => {
    await updateSettings({ questionsEnabled: !settings.questionsEnabled });
  }, [settings.questionsEnabled, updateSettings]);

  const togglePermissions = useCallback(async () => {
    await updateSettings({ permissionsEnabled: !settings.permissionsEnabled });
  }, [settings.permissionsEnabled, updateSettings]);

  const toggleStatusUpdates = useCallback(async () => {
    await updateSettings({ statusUpdatesEnabled: !settings.statusUpdatesEnabled });
  }, [settings.statusUpdatesEnabled, updateSettings]);

  return {
    pushToken,
    permissionGranted,
    settings,
    badgeCount,
    updateSettings,
    updateBadgeCount,
    requestPermission,
    toggleEnabled,
    toggleQuestions,
    togglePermissions,
    toggleStatusUpdates,
  };
}
