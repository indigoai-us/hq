export type NotificationCategory = "agent_question" | "agent_permission" | "agent_status";

export interface NotificationData {
  category: NotificationCategory;
  agentId: string;
  agentName: string;
  questionId?: string;
  permissionId?: string;
}

export interface NotificationSettings {
  enabled: boolean;
  questionsEnabled: boolean;
  permissionsEnabled: boolean;
  statusUpdatesEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  questionsEnabled: true,
  permissionsEnabled: true,
  statusUpdatesEnabled: false,
};
