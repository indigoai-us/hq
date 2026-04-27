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
   * Opaque S3 VersionId of the cloud object at last successful sync.
   * Used as a parent pointer for divergence detection: pushes include it as
   * `If-Match` precondition; pulls compare it against the cloud's current
   * VersionId to distinguish fast-forward from divergence.
   *
   * Optional for backwards compatibility with journals written before
   * lineage tracking shipped. Missing = degraded mode (push without
   * If-Match, pull always treated as fast-forward). The next successful
   * sync stamps it.
   *
   * `null` (vs undefined) means the bucket has versioning disabled —
   * we got `VersionId: "null"` from S3 but recorded it explicitly so
   * we can distinguish "we know there's no version" from "field absent."
   */
  s3VersionId?: string | null;
}

export interface SyncJournal {
  version: "1";
  lastSync: string;
  files: Record<string, JournalEntry>;
}

/**
 * Per-entry record in `~/HQ/.hq-conflicts/index.json`. Written by share/sync
 * when divergence is detected (push with stale If-Match → 412, or pull where
 * cloud's VersionId chain doesn't include our last-known VersionId).
 *
 * Read by the `/resolve-conflicts` HQ skill which walks the user through
 * each entry, applies their decision (keep local | take cloud | discard),
 * cleans up the conflict file, and removes the entry from the index.
 */
export interface ConflictIndexEntry {
  /** Stable identifier — derived from path + detectedAt. Lets the index
   *  writer dedupe re-detections of the same conflict. */
  id: string;
  /** Path relative to hq_root of the original file (the local-canonical
   *  copy). Stays in place; the user resolves *into* it. */
  originalPath: string;
  /** Path relative to hq_root of the `.conflict-<ts>-<machine>.<ext>` file
   *  containing the cloud version that diverged from local. Excluded from
   *  sync via `.hqignore`. */
  conflictPath: string;
  /** ISO 8601 timestamp the conflict was detected. */
  detectedAt: string;
  /** Which side detected the conflict — push (local→cloud rejected by
   *  If-Match) or pull (cloud→local download saw divergent chain). */
  side: "push" | "pull";
  /** Short machine ID (first 6 chars of `~/.hq/menubar.json` machineId)
   *  to disambiguate when multiple machines conflict on the same key. */
  machineId: string;
  /** sha256 of the local file at detection time. */
  localHash: string;
  /** sha256 of the cloud file at detection time. */
  remoteHash: string;
  /** Cloud's current S3 VersionId at detection. */
  remoteVersionId: string;
  /** The VersionId we *thought* was the parent — i.e. what was in our
   *  journal entry. The chain from `lastKnownVersionId` to
   *  `remoteVersionId` is the divergent gap. */
  lastKnownVersionId: string | null;
}

export interface ConflictIndex {
  version: 1;
  conflicts: ConflictIndexEntry[];
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
