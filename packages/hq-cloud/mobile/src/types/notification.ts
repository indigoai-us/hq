/**
 * Notification types for HQ Cloud Mobile.
 * Defines push notification payloads and settings.
 */

/** Notification categories for routing tap actions */
export type NotificationCategory = "agent_question" | "agent_permission" | "agent_status";

/** Data payload embedded in a push notification */
export interface NotificationData {
  /** Notification category for routing */
  category: NotificationCategory;
  /** ID of the agent that triggered the notification */
  agentId: string;
  /** Agent name for display */
  agentName: string;
  /** Optional question ID for question notifications */
  questionId?: string;
  /** Optional permission ID for permission notifications */
  permissionId?: string;
}

/** User-configurable notification settings */
export interface NotificationSettings {
  /** Master toggle for all push notifications */
  enabled: boolean;
  /** Notify when a worker asks a question */
  questionsEnabled: boolean;
  /** Notify when a worker requests permission */
  permissionsEnabled: boolean;
  /** Notify on worker status changes (completed, error) */
  statusUpdatesEnabled: boolean;
}

/** Default notification settings for new users */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  questionsEnabled: true,
  permissionsEnabled: true,
  statusUpdatesEnabled: false,
};
