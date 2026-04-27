/**
 * HQ Cloud Sync Types
 */

export interface SyncConfig {
  bucket: string;
  region: string;
  userId: string;
  prefix: string; // e.g. "hq/"
}

export interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: string;
  refreshToken: string;
  userId: string;
  bucket: string;
  region: string;
  teamId?: string;
}

export interface JournalEntry {
  hash: string;
  size: number;
  syncedAt: string;
  direction: "up" | "down";
  /**
   * S3 ETag of the remote object as of last successful sync, normalized (no
   * surrounding quotes). Optional for backwards compatibility: entries
   * written before this field existed won't have it, in which case
   * conflict detection falls back to comparing remote `lastModified`
   * against `syncedAt`.
   */
  remoteEtag?: string;
}

export interface SyncJournal {
  version: "1";
  lastSync: string;
  files: Record<string, JournalEntry>;
}

export interface SyncStatus {
  running: boolean;
  lastSync: string | null;
  fileCount: number;
  bucket: string | null;
  errors: string[];
}

export interface PushResult {
  filesUploaded: number;
  bytesUploaded: number;
}

export interface PullResult {
  filesDownloaded: number;
  bytesDownloaded: number;
}

export interface DaemonState {
  pid: number;
  startedAt: string;
  hqRoot: string;
}

/**
 * Entity-aware context for vault-backed S3 operations (VLT-5).
 * Resolved from vault-service entity registry + STS vending.
 */
export interface EntityContext {
  /** Entity UID (cmp_*) */
  uid: string;
  /** Entity slug (human-readable, stable key for per-company local state). */
  slug: string;
  /** S3 bucket name for this entity */
  bucketName: string;
  /** AWS region */
  region: string;
  /** STS-scoped credentials */
  credentials: VaultCredentials;
  /** When the credentials expire (ISO 8601) */
  expiresAt: string;
}

export interface VaultCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

/**
 * Configuration for connecting to the vault-service API.
 */
export interface VaultServiceConfig {
  /** Vault API base URL (e.g. https://vault-api.example.com) */
  apiUrl: string;
  /** Cognito JWT token for authentication */
  authToken: string;
  /** AWS region for S3 client (defaults to entity region or us-east-1) */
  region?: string;
}
