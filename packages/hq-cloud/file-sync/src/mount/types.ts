/**
 * Types for S3 filesystem mount in worker containers.
 *
 * Supports two mount backends:
 * - s3fs: FUSE-based S3 mount (better compatibility)
 * - goofys: High-performance FUSE-based S3 mount (faster)
 *
 * Falls back to AWS CLI sync when neither mount backend is available.
 */

/** Supported mount backend types */
export type MountBackend = 's3fs' | 'goofys';

/** Mount status lifecycle */
export type MountStatus = 'unmounted' | 'mounting' | 'mounted' | 'error' | 'fallback';

/** Sync direction for AWS CLI fallback */
export type SyncDirection = 'pull' | 'push' | 'bidirectional';

/** S3 mount configuration */
export interface S3MountConfig {
  /** S3 bucket name */
  bucketName: string;

  /** AWS region */
  region: string;

  /** S3 prefix to mount (e.g., {userId}/hq) */
  prefix: string;

  /** Local mount point (e.g., /hq) */
  mountPoint: string;

  /** Preferred mount backend */
  preferredBackend: MountBackend;

  /** Whether to auto-fallback to AWS CLI sync if mount fails */
  enableFallback: boolean;

  /** Cache configuration for mount performance */
  cache: MountCacheConfig;

  /** Mount-specific options */
  mountOptions: MountOptions;

  /** AWS credentials configuration */
  credentials: MountCredentials;
}

/** Cache configuration for S3 mount performance */
export interface MountCacheConfig {
  /** Enable local caching */
  enabled: boolean;

  /** Local cache directory */
  cacheDir: string;

  /** Maximum cache size in megabytes */
  maxSizeMb: number;

  /** Cache entry TTL in seconds */
  ttlSeconds: number;

  /** Check for new versions of cached files on open */
  checkOnOpen: boolean;

  /** Use stat cache to reduce S3 HEAD requests */
  statCacheEnabled: boolean;

  /** Stat cache TTL in seconds */
  statCacheTtlSeconds: number;

  /** Type cache TTL for directory listings in seconds */
  typeCacheTtlSeconds: number;
}

/** Backend-specific mount options */
export interface MountOptions {
  /** Allow other users to access the mount (requires allow_other in /etc/fuse.conf) */
  allowOther: boolean;

  /** File permission mode (e.g., 0755) */
  fileMode: number;

  /** Directory permission mode (e.g., 0755) */
  dirMode: number;

  /** UID for mounted files */
  uid?: number;

  /** GID for mounted files */
  gid?: number;

  /** Maximum number of retries for failed operations */
  retries: number;

  /** Connection timeout in seconds */
  connectTimeout: number;

  /** Read timeout in seconds */
  readTimeout: number;

  /** Maximum number of parallel requests */
  parallelCount: number;

  /** Multipart upload threshold in megabytes */
  multipartThresholdMb: number;

  /** Enable server-side encryption */
  sseEnabled: boolean;

  /** Additional raw mount options (passed directly to the backend) */
  extraOptions: string[];
}

/** AWS credentials for mount access */
export interface MountCredentials {
  /** Use IAM role (ECS task role) - preferred in containers */
  useIamRole: boolean;

  /** AWS access key ID (fallback if IAM role unavailable) */
  accessKeyId?: string;

  /** AWS secret access key (fallback if IAM role unavailable) */
  secretAccessKey?: string;

  /** AWS session token (for temporary credentials) */
  sessionToken?: string;

  /** Credentials file path (for s3fs passwd file) */
  credentialsFile?: string;
}

/** State of the current mount */
export interface MountState {
  /** Current mount status */
  status: MountStatus;

  /** Active backend (null if unmounted or in fallback mode) */
  backend: MountBackend | null;

  /** Mount point path */
  mountPoint: string;

  /** S3 source URI */
  s3Uri: string;

  /** Timestamp when mount was established */
  mountedAt: string | null;

  /** Last error message */
  lastError: string | null;

  /** Whether fallback sync is active */
  fallbackActive: boolean;

  /** PID of the mount process (if applicable) */
  pid: number | null;
}

/** Result of a mount/unmount operation */
export interface MountOperationResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Current mount state after the operation */
  state: MountState;

  /** Human-readable message */
  message: string;

  /** Duration of the operation in milliseconds */
  durationMs: number;
}

/** AWS CLI sync operation configuration */
export interface SyncOperationConfig {
  /** S3 source or destination URI */
  s3Uri: string;

  /** Local directory path */
  localPath: string;

  /** Sync direction */
  direction: SyncDirection;

  /** Delete files at destination that don't exist at source */
  deleteRemoved: boolean;

  /** Exclude patterns (glob) */
  excludePatterns: string[];

  /** Include patterns (glob, applied after exclude) */
  includePatterns: string[];

  /** Maximum concurrent requests for the sync */
  maxConcurrentRequests: number;

  /** Use multipart uploads for large files */
  multipartEnabled: boolean;

  /** Multipart chunk size in megabytes */
  multipartChunkSizeMb: number;

  /** Dry run mode - show what would be synced without syncing */
  dryRun: boolean;
}

/** Result of an AWS CLI sync operation */
export interface SyncOperationResult {
  /** Whether the sync succeeded */
  success: boolean;

  /** Number of files synced */
  filesSynced: number;

  /** Total bytes transferred */
  bytesTransferred: number;

  /** Number of files deleted (if deleteRemoved was true) */
  filesDeleted: number;

  /** Duration of the sync in milliseconds */
  durationMs: number;

  /** Error message if sync failed */
  error?: string;

  /** Detailed output from the sync command */
  output: string;
}

/** Backend availability check result */
export interface BackendAvailability {
  /** Whether s3fs is available */
  s3fsAvailable: boolean;

  /** s3fs version string */
  s3fsVersion: string | null;

  /** Whether goofys is available */
  goofysAvailable: boolean;

  /** goofys version string */
  goofysVersion: string | null;

  /** Whether AWS CLI is available */
  awsCliAvailable: boolean;

  /** AWS CLI version string */
  awsCliVersion: string | null;

  /** Whether FUSE is available */
  fuseAvailable: boolean;
}
