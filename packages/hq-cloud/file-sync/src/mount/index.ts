export { S3MountManager } from './s3-mount-manager.js';
export type { S3MountManagerOptions, FsOperations } from './s3-mount-manager.js';
export { AwsCliFallback, buildDefaultSyncConfig } from './aws-cli-fallback.js';
export type { AwsCliFallbackOptions } from './aws-cli-fallback.js';
export {
  buildMountConfig,
  validateMountConfig,
  buildCacheConfig,
  buildMountOptions,
  buildCredentials,
} from './config.js';
export {
  buildCacheArgs,
  buildS3fsCacheArgs,
  buildGoofysCacheArgs,
  CACHE_PRESETS,
} from './cache-config.js';
export type { CachePresetName } from './cache-config.js';
export type {
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
} from './types.js';
