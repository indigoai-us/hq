"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { NotificationSettings } from "@/types/notification";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/types/notification";
import {
  fetchNotificationSettings,
  updateNotificationSettings,
  registerPushSubscription,
} from "@/services/notifications";
import { useAuth } from "./AuthContext";

interface NotificationContextValue {
  permissionGranted: boolean;
  settings: NotificationSettings;
  badgeCount: number;
  updateSettings: (partial: Partial<NotificationSettings>) => Promise<void>;
  updateBadgeCount: (count: number) => void;
  requestPermission: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [badgeCount, setBadgeCount] = useState(0);

  // Check initial notification permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermissionGranted(Notification.permission === "granted");
    }
  }, []);

  // Load settings when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    let mounted = true;

    async function loadSettings() {
      try {
        const s = await fetchNotificationSettings();
        if (mounted) setSettings(s);
      } catch {
        // Use defaults
      }
    }

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }

    const result = await Notification.requestPermission();
    const granted = result === "granted";
    setPermissionGranted(granted);

    if (granted && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: undefined, // Server provides VAPID key
        });
        await registerPushSubscription(subscription);
      } catch {
        // Push subscription failed
      }
    }

    return granted;
  }, []);

  const handleUpdateSettings = useCallback(
    async (partial: Partial<NotificationSettings>) => {
      const updated = { ...settings, ...partial };
      setSettings(updated);
      try {
        await updateNotificationSettings(partial);
      } catch {
        // Revert on failure
        setSettings(settings);
      }
    },
    [settings],
  );

  const updateBadgeCount = useCallback((count: number) => {
    setBadgeCount(count);
    if ("setAppBadge" in navigator) {
      if (count > 0) {
        (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> })
          .setAppBadge(count)
          .catch(() => {});
      } else {
        (navigator as Navigator & { clearAppBadge: () => Promise<void> })
          .clearAppBadge()
          .catch(() => {});
      }
    }
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      permissionGranted,
      settings,
      badgeCount,
      updateSettings: handleUpdateSettings,
      updateBadgeCount,
      requestPermission,
    }),
    [permissionGranted, settings, badgeCount, handleUpdateSettings, updateBadgeCount, requestPermission],
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotificationContext(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotificationContext must be used within a NotificationProvider");
  }
  return context;
}
