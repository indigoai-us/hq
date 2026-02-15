export interface NotificationSettings {
  enabled: boolean;
  questionsEnabled: boolean;
  permissionsEnabled: boolean;
  statusUpdatesEnabled: boolean;
}

export interface UserSettingsResponse {
  hqDir: string | null;
  notifications: NotificationSettings;
  onboarded: boolean;
  hasClaudeToken?: boolean;
  claudeTokenSetAt?: string | null;
}

export interface ClaudeTokenStatusResponse {
  hasToken: boolean;
  setAt: string | null;
}

export interface ClaudeTokenStoreResponse {
  ok: boolean;
  hasToken: boolean;
  setAt: string | null;
}

export interface OnboardingStatusResponse {
  onboarded: boolean;
}

export interface SetupResponse {
  ok: boolean;
  onboarded: boolean;
  hqDir: string;
  s3Prefix: string | null;
  totalFiles: number;
}

export interface SyncProgressEvent {
  uploaded: number;
  total: number;
  failed: number;
  file: string;
  done?: boolean;
  error?: string;
}
