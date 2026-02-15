"use client";

import { useCallback } from "react";
import { useNotificationContext } from "@/contexts/NotificationContext";

export function useNotifications() {
  const ctx = useNotificationContext();

  const toggleEnabled = useCallback(async () => {
    await ctx.updateSettings({ enabled: !ctx.settings.enabled });
  }, [ctx]);

  const toggleQuestions = useCallback(async () => {
    await ctx.updateSettings({ questionsEnabled: !ctx.settings.questionsEnabled });
  }, [ctx]);

  const togglePermissions = useCallback(async () => {
    await ctx.updateSettings({ permissionsEnabled: !ctx.settings.permissionsEnabled });
  }, [ctx]);

  const toggleStatusUpdates = useCallback(async () => {
    await ctx.updateSettings({ statusUpdatesEnabled: !ctx.settings.statusUpdatesEnabled });
  }, [ctx]);

  return {
    ...ctx,
    toggleEnabled,
    toggleQuestions,
    togglePermissions,
    toggleStatusUpdates,
  };
}
