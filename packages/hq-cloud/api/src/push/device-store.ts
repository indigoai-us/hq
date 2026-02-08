import type {
  DeviceToken,
  DeviceTokenStore,
  RegisterDeviceTokenInput,
} from './types.js';

/**
 * In-memory device token store.
 * Implements DeviceTokenStore interface for easy swapping to DynamoDB/Postgres later.
 */
class InMemoryDeviceTokenStore implements DeviceTokenStore {
  private tokens: Map<string, DeviceToken> = new Map();

  /**
   * Register or update a device token
   */
  register(input: RegisterDeviceTokenInput): DeviceToken {
    const existing = this.tokens.get(input.deviceId);
    const now = new Date();

    const token: DeviceToken = {
      deviceId: input.deviceId,
      token: input.token,
      platform: input.platform,
      registeredAt: existing?.registeredAt ?? now,
      lastPushAt: existing?.lastPushAt ?? null,
      active: true,
      metadata: input.metadata,
    };

    this.tokens.set(input.deviceId, token);
    return token;
  }

  /**
   * Get a device token by device ID
   */
  get(deviceId: string): DeviceToken | undefined {
    return this.tokens.get(deviceId);
  }

  /**
   * Get active token for a device ID
   */
  getActive(deviceId: string): DeviceToken | undefined {
    const token = this.tokens.get(deviceId);
    return token?.active ? token : undefined;
  }

  /**
   * Deactivate a device token
   */
  deactivate(deviceId: string): boolean {
    const token = this.tokens.get(deviceId);
    if (!token) {
      return false;
    }
    token.active = false;
    return true;
  }

  /**
   * Update last push timestamp
   */
  updateLastPush(deviceId: string): void {
    const token = this.tokens.get(deviceId);
    if (token) {
      token.lastPushAt = new Date();
    }
  }

  /**
   * Delete a device token
   */
  delete(deviceId: string): boolean {
    return this.tokens.delete(deviceId);
  }

  /**
   * Clear all tokens
   */
  clear(): void {
    this.tokens.clear();
  }

  /**
   * Get total count
   */
  get count(): number {
    return this.tokens.size;
  }
}

// Singleton instance
let store: InMemoryDeviceTokenStore | null = null;

/**
 * Get the device token store singleton
 */
export function getDeviceTokenStore(): DeviceTokenStore {
  if (!store) {
    store = new InMemoryDeviceTokenStore();
  }
  return store;
}

/**
 * Reset the store (for testing)
 */
export function resetDeviceTokenStore(): void {
  if (store) {
    store.clear();
  }
  store = null;
}
