/**
 * Stored API key record (key is stored as hash)
 */
export interface ApiKeyRecord {
  /** SHA-256 hash of the API key */
  keyHash: string;
  /** Human-readable name/description */
  name: string;
  /** When the key was created */
  createdAt: Date;
  /** When the key was last used */
  lastUsedAt: Date | null;
  /** Whether the key is active */
  active: boolean;
  /** Rate limit (requests per minute) */
  rateLimit: number;
  /** Associated device IDs */
  deviceIds: string[];
}

/**
 * Device registration record
 */
export interface DeviceRecord {
  deviceId: string;
  /** Hash of the API key this device is registered with */
  keyHash: string;
  /** Device name/description */
  name: string;
  /** When the device was registered */
  registeredAt: Date;
  /** When the device was last seen */
  lastSeenAt: Date | null;
  /** Device metadata */
  metadata?: Record<string, unknown>;
}

/**
 * API key generation result (raw key only returned once)
 */
export interface GeneratedApiKey {
  /** The raw API key (only shown once) */
  key: string;
  /** Key prefix for identification */
  prefix: string;
  /** Key record (without hash) */
  record: Omit<ApiKeyRecord, 'keyHash'>;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current request count in window */
  current: number;
  /** Maximum requests allowed in window */
  limit: number;
  /** Seconds until window resets */
  resetIn: number;
  /** Remaining requests in current window */
  remaining: number;
}

/**
 * Validation result for API key
 */
export interface ApiKeyValidation {
  valid: boolean;
  keyHash?: string;
  record?: ApiKeyRecord;
  error?: string;
}
