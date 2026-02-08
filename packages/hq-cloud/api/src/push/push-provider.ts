import type {
  PushProvider,
  PushPlatform,
  PushPayload,
  PushResult,
} from './types.js';

/**
 * Mock push notification provider for development/testing.
 * Simulates push notification delivery without actually sending.
 */
export class MockPushProvider implements PushProvider {
  readonly name = 'mock';

  /** Sent notifications (for testing inspection) */
  private sentNotifications: Array<{
    token: string;
    platform: PushPlatform;
    payload: PushPayload;
    timestamp: Date;
  }> = [];

  /** Tokens that should fail (for testing error scenarios) */
  private failingTokens: Set<string> = new Set();

  /**
   * Send a push notification to a device
   */
  async send(
    token: string,
    platform: PushPlatform,
    payload: PushPayload
  ): Promise<PushResult> {
    // Simulate network delay
    await this.delay(10);

    // Check for simulated failures
    if (this.failingTokens.has(token)) {
      return {
        deviceId: token,
        success: false,
        error: 'Invalid device token',
      };
    }

    // Record the notification
    this.sentNotifications.push({
      token,
      platform,
      payload,
      timestamp: new Date(),
    });

    return {
      deviceId: token,
      success: true,
      messageId: `mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }

  /**
   * Send push notifications to multiple devices
   */
  async sendBatch(
    targets: Array<{ deviceId: string; token: string; platform: PushPlatform }>,
    payload: PushPayload
  ): Promise<PushResult[]> {
    const results = await Promise.all(
      targets.map(async (target) => {
        const result = await this.send(target.token, target.platform, payload);
        return {
          ...result,
          deviceId: target.deviceId,
        };
      })
    );
    return results;
  }

  /**
   * Get all sent notifications (for testing)
   */
  getSentNotifications(): Array<{
    token: string;
    platform: PushPlatform;
    payload: PushPayload;
    timestamp: Date;
  }> {
    return [...this.sentNotifications];
  }

  /**
   * Clear sent notifications (for testing)
   */
  clearSentNotifications(): void {
    this.sentNotifications = [];
  }

  /**
   * Mark a token as failing (for testing error scenarios)
   */
  setTokenFailing(token: string, failing: boolean): void {
    if (failing) {
      this.failingTokens.add(token);
    } else {
      this.failingTokens.delete(token);
    }
  }

  /**
   * Clear all failing tokens
   */
  clearFailingTokens(): void {
    this.failingTokens.clear();
  }

  /**
   * Helper to simulate async delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * AWS SNS push provider stub.
 * TODO: Implement with actual AWS SDK when ready.
 */
export class AwsSnsPushProvider implements PushProvider {
  readonly name = 'aws-sns';

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _config: {
      region: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      iosApplicationArn?: string;
      androidApplicationArn?: string;
    }
  ) {
    // AWS SDK initialization would go here
  }

  send(
    _token: string,
    _platform: PushPlatform,
    _payload: PushPayload
  ): Promise<PushResult> {
    // TODO: Implement with AWS SNS SDK
    return Promise.reject(new Error('AWS SNS provider not yet implemented'));
  }

  sendBatch(
    _targets: Array<{ deviceId: string; token: string; platform: PushPlatform }>,
    _payload: PushPayload
  ): Promise<PushResult[]> {
    // TODO: Implement with AWS SNS SDK
    return Promise.reject(new Error('AWS SNS provider not yet implemented'));
  }
}

/**
 * Firebase Cloud Messaging push provider stub.
 * TODO: Implement with actual Firebase SDK when ready.
 */
export class FirebasePushProvider implements PushProvider {
  readonly name = 'firebase';

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _config: {
      projectId: string;
      serviceAccountKey?: string;
    }
  ) {
    // Firebase initialization would go here
  }

  send(
    _token: string,
    _platform: PushPlatform,
    _payload: PushPayload
  ): Promise<PushResult> {
    // TODO: Implement with Firebase Admin SDK
    return Promise.reject(new Error('Firebase provider not yet implemented'));
  }

  sendBatch(
    _targets: Array<{ deviceId: string; token: string; platform: PushPlatform }>,
    _payload: PushPayload
  ): Promise<PushResult[]> {
    // TODO: Implement with Firebase Admin SDK
    return Promise.reject(new Error('Firebase provider not yet implemented'));
  }
}

// Singleton push provider instance
let pushProvider: PushProvider | null = null;

/**
 * Get the configured push provider
 */
export function getPushProvider(): PushProvider {
  if (!pushProvider) {
    // Default to mock provider for development
    pushProvider = new MockPushProvider();
  }
  return pushProvider;
}

/**
 * Set the push provider (for configuration or testing)
 */
export function setPushProvider(provider: PushProvider): void {
  pushProvider = provider;
}

/**
 * Reset to default mock provider (for testing)
 */
export function resetPushProvider(): void {
  pushProvider = null;
}
