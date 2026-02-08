/**
 * Push notification platform
 */
export type PushPlatform = 'ios' | 'android' | 'web';

/**
 * Device token registration record
 */
export interface DeviceToken {
  /** Device ID (matches WebSocket deviceId) */
  deviceId: string;
  /** Platform-specific push token */
  token: string;
  /** Platform (ios, android, web) */
  platform: PushPlatform;
  /** When the token was registered */
  registeredAt: Date;
  /** When the token was last used for push */
  lastPushAt: Date | null;
  /** Whether the token is active */
  active: boolean;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for registering a device token
 */
export interface RegisterDeviceTokenInput {
  /** Device ID */
  deviceId: string;
  /** Platform-specific push token */
  token: string;
  /** Platform */
  platform: PushPlatform;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Push notification payload
 */
export interface PushPayload {
  /** Notification title */
  title: string;
  /** Notification body */
  body: string;
  /** Additional data payload */
  data?: Record<string, unknown>;
  /** Badge count (iOS) */
  badge?: number;
  /** Sound name */
  sound?: string;
}

/**
 * Push notification result for a single device
 */
export interface PushResult {
  /** Device ID */
  deviceId: string;
  /** Whether the push was sent successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Provider-specific message ID */
  messageId?: string;
}

/**
 * Push provider interface - abstraction over AWS SNS, Firebase, etc.
 */
export interface PushProvider {
  /** Provider name */
  readonly name: string;

  /**
   * Send a push notification to a device
   * @param token Device token
   * @param platform Target platform
   * @param payload Notification payload
   * @returns Push result
   */
  send(token: string, platform: PushPlatform, payload: PushPayload): Promise<PushResult>;

  /**
   * Send push notifications to multiple devices
   * @param targets Array of device tokens with platforms
   * @param payload Notification payload
   * @returns Array of push results
   */
  sendBatch(
    targets: Array<{ deviceId: string; token: string; platform: PushPlatform }>,
    payload: PushPayload
  ): Promise<PushResult[]>;
}

/**
 * Device token store interface
 */
export interface DeviceTokenStore {
  /** Register or update a device token */
  register(input: RegisterDeviceTokenInput): DeviceToken;
  /** Get a device token by device ID */
  get(deviceId: string): DeviceToken | undefined;
  /** Get all active tokens for a device ID */
  getActive(deviceId: string): DeviceToken | undefined;
  /** Deactivate a device token */
  deactivate(deviceId: string): boolean;
  /** Update last push timestamp */
  updateLastPush(deviceId: string): void;
  /** Delete a device token */
  delete(deviceId: string): boolean;
  /** Clear all tokens (for testing) */
  clear(): void;
  /** Get total count */
  count: number;
}

/**
 * Question notification payload (sent when worker asks a question)
 */
export interface QuestionNotificationPayload {
  /** Question ID */
  questionId: string;
  /** Worker ID */
  workerId: string;
  /** Worker name */
  workerName: string;
  /** Question preview (truncated text) */
  questionPreview: string;
  /** Whether question has options */
  hasOptions: boolean;
}
