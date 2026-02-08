export {
  S3BucketManager,
  buildBucketConfig,
  validateBucketConfig,
  buildUserPolicy,
  buildWorkerPolicy,
  buildAdminPolicy,
  buildSharePolicy,
  buildShareWritePolicy,
  toAwsPolicyDocument,
  HQ_FOLDER_STRUCTURE,
} from './s3/index.js';

export type {
  S3BucketConfig,
  EncryptionConfig,
  LifecycleRule,
  LifecycleTransition,
  CorsRule,
  PublicAccessBlockConfig,
  S3PolicyStatement,
  S3BucketPolicy,
  UserS3Path,
  SyncObjectMetadata,
  BucketOperationResult,
  HQFolder,
} from './s3/index.js';

// Daemon module
export {
  SyncDaemon,
  FileWatcher,
  EventQueue,
  buildDaemonConfig,
  validateDaemonConfig,
  DEFAULT_IGNORED_PATTERNS,
  DEFAULT_DAEMON_CONFIG,
} from './daemon/index.js';

export type {
  SyncHandler,
  TypedSyncDaemonEmitter,
  FileWatcherCallbacks,
  SyncDaemonConfig,
  DaemonState,
  FileEvent,
  FileEventType,
  SyncDaemonStats,
  SyncDaemonEvents,
  FileSyncResult,
} from './daemon/index.js';

// Sharing module
export {
  ShareStore,
  ShareAuditLog,
  ShareService,
  getShareStore,
  getAuditLog,
  resetShareStore,
  resetAuditLog,
  validateCreateShareInput,
  SHARE_PERMISSIONS,
  SHARE_STATUSES,
} from './sharing/index.js';

export type {
  Share,
  SharePermission,
  ShareStatus,
  CreateShareInput,
  UpdateShareInput,
  ShareQuery,
  SharePolicyResult,
  SharePolicyStatement,
  ShareValidation,
  ShareServiceConfig,
  AuditAction,
  AuditLogEntry,
  AuditLogQuery,
  WriteAccessResult,
} from './sharing/index.js';

// S3 Mount module
export {
  S3MountManager,
  AwsCliFallback,
  buildDefaultSyncConfig,
  buildMountConfig,
  validateMountConfig,
  buildCacheConfig,
  buildMountOptions,
  buildCredentials,
  buildCacheArgs,
  buildS3fsCacheArgs,
  buildGoofysCacheArgs,
  CACHE_PRESETS,
} from './mount/index.js';

export type {
  S3MountManagerOptions,
  FsOperations,
  AwsCliFallbackOptions,
  CachePresetName,
  S3MountConfig,
  MountBackend,
  MountStatus,
  MountCacheConfig,
  MountOptions,
  MountCredentials,
  MountState,
  MountOperationResult,
  SyncOperationConfig,
  SyncOperationResult,
  SyncDirection,
  BackendAvailability,
} from './mount/index.js';

// Upload module
export {
  S3Uploader,
  hashFile,
  hashBuffer,
  createUploadHandler,
  buildUploadConfig,
  DEFAULT_UPLOAD_CONFIG,
} from './upload/index.js';

export type {
  UploadHandlerOptions,
  UploadConfig,
  HashAlgorithm,
  FileHashResult,
  UploadStatus,
  FileUploadProgress,
  BatchUploadProgress,
  UploadProgressCallback,
  UploadResult,
} from './upload/index.js';

// Ignore module (.hqignore selective sync)
export {
  HqIgnore,
  parsePattern,
  parsePatterns,
  checkIgnored,
  DEFAULT_HQ_IGNORE_PATTERNS,
} from './ignore/index.js';

export type {
  TypedHqIgnoreEmitter,
  IgnoreRule,
  IgnoreCheckResult,
  HqIgnoreConfig,
  HqIgnoreEvents,
} from './ignore/index.js';

// Download module (S3 -> local sync)
export {
  DownloadManager,
  ChangeDetector,
  FileDownloader,
  SyncStateManager,
  buildDownloadConfig,
  validateDownloadConfig,
  DEFAULT_DOWNLOAD_CONFIG,
} from './download/index.js';

export type {
  TypedDownloadManagerEmitter,
  DownloadSyncConfig,
  DeletedFilePolicy,
  S3ObjectInfo,
  DetectedChange,
  DownloadResult,
  DownloadPollResult,
  SyncStateEntry,
  SyncState,
  DownloadManagerStats,
  DownloadManagerEvents,
} from './download/index.js';

// Status module (sync status aggregation for mobile)
export {
  SyncStatusManager,
  DEFAULT_STATUS_MANAGER_CONFIG,
} from './status/index.js';

export type {
  SyncHealth,
  SyncStatusDirection,
  SyncError,
  SyncProgress,
  SyncStatus,
  SyncTriggerResult,
  SyncStatusMessage,
  SyncProgressMessage,
  SyncErrorMessage,
  SyncCompleteMessage,
  SyncStatusManagerConfig,
} from './status/index.js';

// Conflict module (conflict detection and resolution)
export {
  ConflictDetector,
  ConflictResolver,
  ConflictLog,
  DEFAULT_CONFLICT_CONFIG,
} from './conflict/index.js';

export type {
  ConflictResolutionStrategy,
  ConflictStatus,
  ConflictLocalInfo,
  ConflictRemoteInfo,
  SyncConflict,
  ConflictConfig,
  ConflictResolutionResult,
  ConflictCheckInput,
  ConflictListResponse,
  ConflictQuery,
} from './conflict/index.js';
