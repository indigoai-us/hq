/**
 * Push notification service for HQ Cloud Mobile.
 * Handles registration, permission requests, badge management,
 * and token registration with the HQ Cloud API.
 */
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiRequest } from "./api";
import type { NotificationSettings, NotificationData } from "../types/notification";

const SETTINGS_STORAGE_KEY = "hq_notification_settings";

/**
 * Configure how notifications appear when the app is in the foreground.
 * Shows alert + badge + sound so the user still sees worker questions.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Request push notification permissions and get the Expo push token.
 * Returns the token string, or null if permissions are denied or device is not physical.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    return null;
  }

  // Check current permission status
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  // Set up Android notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3B82F6",
    });
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: projectId as string | undefined,
  });

  return tokenData.data;
}

/**
 * Register the push token with the HQ Cloud API.
 * The server uses this to send targeted push notifications.
 */
export async function registerPushToken(token: string): Promise<void> {
  await apiRequest("/api/notifications/register", {
    method: "POST",
    body: {
      token,
      platform: Platform.OS,
      deviceName: Device.deviceName ?? "Unknown",
    },
  });
}

/**
 * Unregister the push token from the HQ Cloud API.
 * Called on logout to stop notifications.
 */
export async function unregisterPushToken(token: string): Promise<void> {
  await apiRequest("/api/notifications/unregister", {
    method: "POST",
    body: { token },
  });
}

/**
 * Update notification settings on the server.
 */
export async function updateNotificationSettings(
  settings: NotificationSettings,
): Promise<void> {
  await apiRequest("/api/notifications/settings", {
    method: "PUT",
    body: settings,
  });
}

/**
 * Fetch notification settings from the server.
 */
export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  return apiRequest<NotificationSettings>("/api/notifications/settings");
}

/**
 * Set the app badge count.
 * Shows the number of pending questions/permissions on the app icon.
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear the app badge count.
 */
export async function clearBadgeCount(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}

/**
 * Get the current badge count.
 */
export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}

/**
 * Parse notification data from a notification response.
 * Returns typed notification data if valid, null otherwise.
 */
export function parseNotificationData(
  notification: Notifications.Notification,
): NotificationData | null {
  const data = notification.request.content.data as Record<string, unknown> | undefined;

  if (!data || typeof data.category !== "string" || typeof data.agentId !== "string") {
    return null;
  }

  return {
    category: data.category as NotificationData["category"],
    agentId: data.agentId as string,
    agentName: (data.agentName as string) ?? "Agent",
    questionId: data.questionId as string | undefined,
    permissionId: data.permissionId as string | undefined,
  };
}

/**
 * Dismiss all delivered notifications.
 */
export async function dismissAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}

export { SETTINGS_STORAGE_KEY };
