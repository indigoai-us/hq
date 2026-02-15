/**
 * NotificationContext - Manages push notification lifecycle.
 * Registers for notifications on login, handles incoming notifications,
 * routes tap actions to the correct screen, and manages badge count.
 *
 * Navigation on notification tap uses a ref-based approach since the provider
 * lives above the navigator hierarchy.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Notifications from "expo-notifications";
import { useAuth } from "./AuthContext";
import {
  configureNotificationHandler,
  registerForPushNotifications,
  registerPushToken,
  unregisterPushToken,
  setBadgeCount,
  clearBadgeCount,
  parseNotificationData,
  fetchNotificationSettings,
  updateNotificationSettings as apiUpdateSettings,
} from "../services/notifications";
import type { NotificationSettings } from "../types/notification";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../types/notification";

/** Callback type for handling notification tap navigation */
export type NotificationNavigator = (agentId: string) => void;

interface NotificationContextValue {
  /** Current push token (null if not registered) */
  pushToken: string | null;
  /** Whether notification permissions have been granted */
  permissionGranted: boolean;
  /** Current notification settings */
  settings: NotificationSettings;
  /** Current app badge count */
  badgeCount: number;
  /** Update notification settings */
  updateSettings: (settings: Partial<NotificationSettings>) => Promise<void>;
  /** Update badge count */
  updateBadgeCount: (count: number) => Promise<void>;
  /** Re-request notification permissions */
  requestPermission: () => Promise<boolean>;
  /** Register a navigation callback for notification taps */
  setNavigator: (navigator: NotificationNavigator) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

interface NotificationProviderProps {
  children: React.ReactNode;
}

// Configure the global notification handler once at module level
configureNotificationHandler();

export function NotificationProvider({ children }: NotificationProviderProps): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [badgeCount, setBadgeCountState] = useState(0);

  const navigatorRef = useRef<NotificationNavigator | null>(null);
  const notificationResponseListener = useRef<Notifications.Subscription | null>(null);
  const notificationReceivedListener = useRef<Notifications.Subscription | null>(null);

  const setNavigator = useCallback((navigator: NotificationNavigator) => {
    navigatorRef.current = navigator;
  }, []);

  // Register for push notifications when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      // Unregister on logout
      if (pushToken) {
        void unregisterPushToken(pushToken).catch(() => {});
        setPushToken(null);
      }
      void clearBadgeCount();
      setBadgeCountState(0);
      return;
    }

    let mounted = true;

    async function setup(): Promise<void> {
      // Register for push notifications
      const token = await registerForPushNotifications();

      if (!mounted) return;

      if (token) {
        setPushToken(token);
        setPermissionGranted(true);

        // Register token with API server
        try {
          await registerPushToken(token);
        } catch {
          // Server registration failed - notifications will still work locally
        }
      } else {
        setPermissionGranted(false);
      }

      // Fetch saved notification settings from server
      try {
        const serverSettings = await fetchNotificationSettings();
        if (mounted) {
          setSettings(serverSettings);
        }
      } catch {
        // Use defaults if fetch fails
      }
    }

    void setup();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for notification taps (user tapped a notification)
  useEffect(() => {
    notificationResponseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = parseNotificationData(response.notification);
        if (!data) return;

        // Navigate to the agent detail screen via registered navigator
        if (navigatorRef.current) {
          navigatorRef.current(data.agentId);
        }
      },
    );

    return () => {
      if (notificationResponseListener.current) {
        Notifications.removeNotificationSubscription(notificationResponseListener.current);
      }
    };
  }, []);

  // Listen for notifications received while app is in foreground (update badge)
  useEffect(() => {
    notificationReceivedListener.current = Notifications.addNotificationReceivedListener(() => {
      // Increment badge count when a notification arrives in foreground
      setBadgeCountState((prev) => {
        const next = prev + 1;
        void setBadgeCount(next);
        return next;
      });
    });

    return () => {
      if (notificationReceivedListener.current) {
        Notifications.removeNotificationSubscription(notificationReceivedListener.current);
      }
    };
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<NotificationSettings>): Promise<void> => {
      const newSettings = { ...settings, ...partial };
      setSettings(newSettings);

      try {
        await apiUpdateSettings(newSettings);
      } catch {
        // Revert on failure
        setSettings(settings);
        throw new Error("Failed to update notification settings.");
      }
    },
    [settings],
  );

  const updateBadgeCount = useCallback(async (count: number): Promise<void> => {
    setBadgeCountState(count);
    await setBadgeCount(count);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const token = await registerForPushNotifications();
    if (token) {
      setPushToken(token);
      setPermissionGranted(true);
      try {
        await registerPushToken(token);
      } catch {
        // Swallow - token still works locally
      }
      return true;
    }
    setPermissionGranted(false);
    return false;
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      pushToken,
      permissionGranted,
      settings,
      badgeCount,
      updateSettings,
      updateBadgeCount,
      requestPermission,
      setNavigator,
    }),
    [pushToken, permissionGranted, settings, badgeCount, updateSettings, updateBadgeCount, requestPermission, setNavigator],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access notification context. Must be used within NotificationProvider.
 */
export function useNotificationContext(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotificationContext must be used within a NotificationProvider");
  }
  return context;
}
