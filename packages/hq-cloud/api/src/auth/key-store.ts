import { createHash, randomBytes } from 'crypto';
import type { ApiKeyRecord, DeviceRecord, GeneratedApiKey, ApiKeyValidation } from './types.js';

/** API key prefix for identification */
const KEY_PREFIX = 'hq_';
/** Default rate limit (requests per minute) */
const DEFAULT_RATE_LIMIT = 60;

/**
 * Hash a raw API key using SHA-256
 */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generate a cryptographically secure random API key
 */
function generateRawKey(): string {
  // Generate 32 bytes of random data, encode as base64url
  const randomPart = randomBytes(32).toString('base64url');
  return `${KEY_PREFIX}${randomPart}`;
}

/**
 * In-memory API key store.
 * In production, this should be replaced with a persistent store.
 */
class ApiKeyStore {
  private keys: Map<string, ApiKeyRecord> = new Map();
  private devices: Map<string, DeviceRecord> = new Map();

  /**
   * Generate a new API key
   */
  generate(name: string, rateLimit: number = DEFAULT_RATE_LIMIT): GeneratedApiKey {
    const rawKey = generateRawKey();
    const keyHash = hashApiKey(rawKey);

    const record: ApiKeyRecord = {
      keyHash,
      name,
      createdAt: new Date(),
      lastUsedAt: null,
      active: true,
      rateLimit,
      deviceIds: [],
    };

    this.keys.set(keyHash, record);

    return {
      key: rawKey,
      prefix: rawKey.substring(0, KEY_PREFIX.length + 8) + '...',
      record: {
        name: record.name,
        createdAt: record.createdAt,
        lastUsedAt: record.lastUsedAt,
        active: record.active,
        rateLimit: record.rateLimit,
        deviceIds: record.deviceIds,
      },
    };
  }

  /**
   * Validate a raw API key
   */
  validate(rawKey: string): ApiKeyValidation {
    if (!rawKey) {
      return { valid: false, error: 'API key is required' };
    }

    if (!rawKey.startsWith(KEY_PREFIX)) {
      return { valid: false, error: 'Invalid API key format' };
    }

    const keyHash = hashApiKey(rawKey);
    const record = this.keys.get(keyHash);

    if (!record) {
      return { valid: false, error: 'API key not found' };
    }

    if (!record.active) {
      return { valid: false, error: 'API key is inactive' };
    }

    // Update last used timestamp
    record.lastUsedAt = new Date();

    return { valid: true, keyHash, record };
  }

  /**
   * Get a key record by hash
   */
  getByHash(keyHash: string): ApiKeyRecord | undefined {
    return this.keys.get(keyHash);
  }

  /**
   * Revoke an API key by hash
   */
  revoke(keyHash: string): boolean {
    const record = this.keys.get(keyHash);
    if (!record) {
      return false;
    }
    record.active = false;
    return true;
  }

  /**
   * Delete an API key by hash
   */
  delete(keyHash: string): boolean {
    // Also remove associated devices
    const record = this.keys.get(keyHash);
    if (record) {
      for (const deviceId of record.deviceIds) {
        this.devices.delete(deviceId);
      }
    }
    return this.keys.delete(keyHash);
  }

  /**
   * List all keys (without hashes for security)
   */
  listKeys(): Array<Omit<ApiKeyRecord, 'keyHash'> & { id: string }> {
    return Array.from(this.keys.entries()).map(([hash, record]) => ({
      id: hash.substring(0, 12) + '...',
      name: record.name,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      active: record.active,
      rateLimit: record.rateLimit,
      deviceIds: record.deviceIds,
    }));
  }

  /**
   * Register a device with an API key
   */
  registerDevice(
    keyHash: string,
    deviceId: string,
    name: string,
    metadata?: Record<string, unknown>
  ): DeviceRecord | null {
    const keyRecord = this.keys.get(keyHash);
    if (!keyRecord || !keyRecord.active) {
      return null;
    }

    // Check if device already exists
    const existing = this.devices.get(deviceId);
    if (existing) {
      // Update existing device
      existing.keyHash = keyHash;
      existing.name = name;
      existing.metadata = metadata;

      // Update key's device list if needed
      if (!keyRecord.deviceIds.includes(deviceId)) {
        // Remove from old key if any
        for (const [, record] of this.keys) {
          const idx = record.deviceIds.indexOf(deviceId);
          if (idx !== -1) {
            record.deviceIds.splice(idx, 1);
          }
        }
        keyRecord.deviceIds.push(deviceId);
      }

      return existing;
    }

    const device: DeviceRecord = {
      deviceId,
      keyHash,
      name,
      registeredAt: new Date(),
      lastSeenAt: null,
      metadata,
    };

    this.devices.set(deviceId, device);
    keyRecord.deviceIds.push(deviceId);

    return device;
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): DeviceRecord | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Update device last seen timestamp
   */
  updateDeviceLastSeen(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeenAt = new Date();
    }
  }

  /**
   * Validate that a device belongs to an API key
   */
  validateDeviceForKey(deviceId: string, keyHash: string): boolean {
    const device = this.devices.get(deviceId);
    return device !== undefined && device.keyHash === keyHash;
  }

  /**
   * List devices for a key
   */
  listDevicesForKey(keyHash: string): DeviceRecord[] {
    const keyRecord = this.keys.get(keyHash);
    if (!keyRecord) {
      return [];
    }
    return keyRecord.deviceIds
      .map((id) => this.devices.get(id))
      .filter((d): d is DeviceRecord => d !== undefined);
  }

  /**
   * Unregister a device
   */
  unregisterDevice(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) {
      return false;
    }

    // Remove from key's device list
    const keyRecord = this.keys.get(device.keyHash);
    if (keyRecord) {
      const idx = keyRecord.deviceIds.indexOf(deviceId);
      if (idx !== -1) {
        keyRecord.deviceIds.splice(idx, 1);
      }
    }

    return this.devices.delete(deviceId);
  }

  /**
   * Get total number of keys
   */
  get keyCount(): number {
    return this.keys.size;
  }

  /**
   * Get total number of devices
   */
  get deviceCount(): number {
    return this.devices.size;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.keys.clear();
    this.devices.clear();
  }
}

// Singleton instance
let store: ApiKeyStore | null = null;

/**
 * Get the API key store singleton
 */
export function getApiKeyStore(): ApiKeyStore {
  if (!store) {
    store = new ApiKeyStore();
  }
  return store;
}

/**
 * Reset the store (for testing)
 */
export function resetApiKeyStore(): void {
  if (store) {
    store.clear();
  }
  store = null;
}
