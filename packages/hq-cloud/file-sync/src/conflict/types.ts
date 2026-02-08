/**
 * Types for the conflict detection and resolution module.
 *
 * Conflicts occur when both the local file and S3 object have changed
 * since the last sync. This module detects such conflicts and provides
 * configurable resolution strategies.
 */

/** Strategy for resolving sync conflicts */
export type ConflictResolutionStrategy =
  | 'keep_both'    // Rename local to .conflict, download remote
  | 'local_wins'   // Keep local version, skip remote download
  | 'remote_wins'  // Overwrite local with remote version
  | 'manual';      // Defer resolution, log for user review

/** Current state of a conflict */
export type ConflictStatus =
  | 'detected'     // Conflict detected, not yet resolved
  | 'resolved'     // Conflict has been resolved
  | 'deferred';    // Conflict deferred for manual resolution

/** Information about the local side of a conflict */
export interface ConflictLocalInfo {
  /** Path relative to HQ root */
  relativePath: string;

  /** SHA-256 hash of the current local file */
  currentHash: string;

  /** SHA-256 hash at last sync (from sync state) */
  lastSyncedHash: string;

  /** Local file size in bytes */
  sizeBytes: number;

  /** Local file last modified timestamp (ms since epoch) */
  lastModified: number;
}

/** Information about the remote (S3) side of a conflict */
export interface ConflictRemoteInfo {
  /** S3 object key */
  s3Key: string;

  /** Path relative to HQ root */
  relativePath: string;

  /** Content hash from S3 object metadata (content-hash) */
  currentHash: string;

  /** ETag at last sync (from sync state) */
  lastSyncedEtag: string;

  /** Current S3 ETag */
  currentEtag: string;

  /** S3 object size in bytes */
  sizeBytes: number;

  /** S3 LastModified timestamp (ms since epoch) */
  lastModified: number;
}

/** A detected conflict between local and remote versions of a file */
export interface SyncConflict {
  /** Unique identifier for this conflict */
  id: string;

  /** Path relative to HQ root */
  relativePath: string;

  /** Local file information */
  local: ConflictLocalInfo;

  /** Remote (S3) file information */
  remote: ConflictRemoteInfo;

  /** Current conflict status */
  status: ConflictStatus;

  /** Strategy used (or to be used) for resolution */
  strategy: ConflictResolutionStrategy;

  /** Timestamp when the conflict was detected (ms since epoch) */
  detectedAt: number;

  /** Timestamp when the conflict was resolved (ms since epoch, null if unresolved) */
  resolvedAt: number | null;

  /** Path to the .conflict file (only for keep_both strategy) */
  conflictFilePath: string | null;

  /** Error message if resolution failed */
  error: string | null;
}

/** Configuration for the conflict module */
export interface ConflictConfig {
  /** Default resolution strategy (default: keep_both) */
  defaultStrategy: ConflictResolutionStrategy;

  /** Per-path strategy overrides (glob pattern -> strategy) */
  strategyOverrides: Record<string, ConflictResolutionStrategy>;

  /** Maximum number of conflicts to retain in the log */
  maxLogEntries: number;

  /** Suffix for conflict files (default: .conflict) */
  conflictSuffix: string;

  /** Whether to include a timestamp in conflict file names (default: true) */
  timestampConflictFiles: boolean;
}

/** Default conflict configuration */
export const DEFAULT_CONFLICT_CONFIG: ConflictConfig = {
  defaultStrategy: 'keep_both',
  strategyOverrides: {},
  maxLogEntries: 1000,
  conflictSuffix: '.conflict',
  timestampConflictFiles: true,
};

/** Result of attempting to resolve a conflict */
export interface ConflictResolutionResult {
  /** The conflict that was resolved */
  conflict: SyncConflict;

  /** Whether resolution succeeded */
  success: boolean;

  /** The action that was taken */
  action: string;

  /** Error message if resolution failed */
  error?: string;
}

/** Input data for conflict detection (provided by download/upload integration) */
export interface ConflictCheckInput {
  /** Path relative to HQ root */
  relativePath: string;

  /** Absolute path to local file */
  localAbsolutePath: string;

  /** Current local file hash (SHA-256) */
  localHash: string;

  /** Local file size in bytes */
  localSizeBytes: number;

  /** Local file last modified timestamp (ms since epoch) */
  localLastModified: number;

  /** S3 object key */
  s3Key: string;

  /** Content hash from S3 metadata */
  remoteHash: string;

  /** Current S3 ETag */
  remoteEtag: string;

  /** S3 object size in bytes */
  remoteSizeBytes: number;

  /** S3 LastModified timestamp (ms since epoch) */
  remoteLastModified: number;

  /** Hash at last sync (from local state, empty string if never synced) */
  lastSyncedHash: string;

  /** ETag at last sync (from local state, empty string if never synced) */
  lastSyncedEtag: string;
}

/** API-compatible conflict listing response */
export interface ConflictListResponse {
  /** Array of conflicts */
  conflicts: SyncConflict[];

  /** Total number of conflicts (may differ from array length if paginated) */
  total: number;

  /** Number of unresolved conflicts */
  unresolved: number;

  /** Number of resolved conflicts */
  resolved: number;

  /** Number of deferred conflicts */
  deferred: number;
}

/** Query options for listing conflicts */
export interface ConflictQuery {
  /** Filter by status */
  status?: ConflictStatus;

  /** Filter by relative path prefix */
  pathPrefix?: string;

  /** Maximum number of results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Sort order */
  sortBy?: 'detectedAt' | 'resolvedAt' | 'relativePath';

  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
}
