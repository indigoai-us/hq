/**
 * Types for the S3 download/pull sync module.
 *
 * Downloads changed files from S3 to the local HQ directory,
 * comparing LastModified timestamps to detect changes.
 */

/** How to handle files deleted from S3 */
export type DeletedFilePolicy = 'delete' | 'keep' | 'trash';

/** Configuration for the download sync module */
export interface DownloadSyncConfig {
  /** S3 bucket name */
  bucketName: string;

  /** AWS region */
  region: string;

  /** S3 prefix for the user space (e.g., {userId}/hq/) */
  s3Prefix: string;

  /** Absolute path to the local HQ directory */
  localDir: string;

  /** Poll interval in milliseconds (default: 30000) */
  pollIntervalMs: number;

  /** Maximum number of concurrent downloads */
  maxConcurrentDownloads: number;

  /** How to handle files deleted from S3 */
  deletedFilePolicy: DeletedFilePolicy;

  /** Directory for trashed files when deletedFilePolicy is 'trash' */
  trashDir: string;

  /** Path to the sync state file (for tracking LastModified) */
  stateFilePath: string;

  /** Glob patterns to exclude from download */
  excludePatterns: string[];

  /** Preserve S3 LastModified as local file mtime */
  preserveTimestamps: boolean;

  /** Maximum number of S3 list pages to fetch per poll (safety limit) */
  maxListPages: number;
}

/** Default configuration values */
export const DEFAULT_DOWNLOAD_CONFIG: Omit<
  DownloadSyncConfig,
  'bucketName' | 'region' | 's3Prefix' | 'localDir' | 'stateFilePath' | 'trashDir'
> = {
  pollIntervalMs: 30_000,
  maxConcurrentDownloads: 5,
  deletedFilePolicy: 'keep',
  excludePatterns: [],
  preserveTimestamps: true,
  maxListPages: 100,
};

/** Metadata for an S3 object as seen during a poll */
export interface S3ObjectInfo {
  /** S3 object key (full path including prefix) */
  key: string;

  /** Relative path (key with s3Prefix stripped) */
  relativePath: string;

  /** S3 LastModified timestamp (ms since epoch) */
  lastModified: number;

  /** Object size in bytes */
  size: number;

  /** S3 ETag */
  etag: string;
}

/** Detected change from comparing S3 state to local state */
export interface DetectedChange {
  /** Type of change detected */
  type: 'added' | 'modified' | 'deleted';

  /** Path relative to the HQ root */
  relativePath: string;

  /** S3 object info (null for deleted files) */
  s3Object: S3ObjectInfo | null;

  /** Previous LastModified from local state (null for new files) */
  previousLastModified: number | null;
}

/** Result of downloading a single file */
export interface DownloadResult {
  /** Path relative to HQ root */
  relativePath: string;

  /** Whether the download succeeded */
  success: boolean;

  /** Change type that triggered the download */
  changeType: DetectedChange['type'];

  /** Bytes downloaded (0 for deletions) */
  bytesDownloaded: number;

  /** Duration of the download in milliseconds */
  durationMs: number;

  /** Error message if download failed */
  error?: string;
}

/** Result of a full download poll cycle */
export interface DownloadPollResult {
  /** Whether the poll cycle completed successfully */
  success: boolean;

  /** Number of changes detected */
  changesDetected: number;

  /** Number of files successfully downloaded */
  filesDownloaded: number;

  /** Number of files deleted locally */
  filesDeleted: number;

  /** Number of errors encountered */
  errors: number;

  /** Individual file results */
  results: DownloadResult[];

  /** Duration of the entire poll cycle in milliseconds */
  durationMs: number;

  /** Timestamp when the poll started */
  polledAt: number;

  /** Error message if the poll cycle itself failed */
  error?: string;
}

/** Persistent state entry for a synced file */
export interface SyncStateEntry {
  /** Path relative to HQ root */
  relativePath: string;

  /** S3 LastModified timestamp when last synced (ms since epoch) */
  lastModified: number;

  /** S3 ETag when last synced */
  etag: string;

  /** File size when last synced */
  size: number;

  /** Timestamp when this entry was last updated */
  syncedAt: number;
}

/** Full sync state persisted to disk */
export interface SyncState {
  /** Version of the state file format */
  version: 1;

  /** User ID this state belongs to */
  userId: string;

  /** S3 prefix this state tracks */
  s3Prefix: string;

  /** Timestamp of last successful poll */
  lastPollAt: number | null;

  /** Map of relativePath -> SyncStateEntry */
  entries: Record<string, SyncStateEntry>;
}

/** Stats for the download manager (compatible with daemon stats) */
export interface DownloadManagerStats {
  /** Whether the download manager is actively polling */
  isPolling: boolean;

  /** Number of poll cycles completed */
  pollCyclesCompleted: number;

  /** Total files downloaded since start */
  totalFilesDownloaded: number;

  /** Total files deleted since start */
  totalFilesDeleted: number;

  /** Total errors since start */
  totalErrors: number;

  /** Timestamp of last successful poll */
  lastPollAt: number | null;

  /** Duration of last poll cycle in ms */
  lastPollDurationMs: number | null;

  /** Number of tracked files in sync state */
  trackedFiles: number;
}

/** Events emitted by the DownloadManager (compatible with daemon events) */
export interface DownloadManagerEvents {
  /** Poll cycle started */
  pollStart: () => void;

  /** Poll cycle completed */
  pollComplete: (result: DownloadPollResult) => void;

  /** A change was detected */
  changeDetected: (change: DetectedChange) => void;

  /** A file was downloaded */
  fileDownloaded: (result: DownloadResult) => void;

  /** An error occurred */
  error: (error: Error) => void;
}
