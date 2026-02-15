import { apiRequest } from "@/lib/api-client";
import type { NotificationSettings } from "@/types/notification";

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  return apiRequest<NotificationSettings>("/api/notifications/settings");
}

export async function updateNotificationSettings(
  settings: Partial<NotificationSettings>,
): Promise<void> {
  await apiRequest("/api/notifications/settings", {
    method: "PUT",
    body: settings,
  });
}

export async function registerPushSubscription(
  subscription: PushSubscription,
): Promise<void> {
  await apiRequest("/api/notifications/web-push/register", {
    method: "POST",
    body: { subscription: subscription.toJSON() },
  });
}

export async function unregisterPushSubscription(
  endpoint: string,
): Promise<void> {
  await apiRequest("/api/notifications/web-push/unregister", {
    method: "POST",
    body: { endpoint },
  });
}
