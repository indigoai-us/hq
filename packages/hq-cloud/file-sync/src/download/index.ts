export { DownloadManager } from './download-manager.js';
export type { TypedDownloadManagerEmitter } from './download-manager.js';
export { ChangeDetector } from './change-detector.js';
export { FileDownloader } from './file-downloader.js';
export { SyncStateManager } from './sync-state.js';
export { buildDownloadConfig, validateDownloadConfig } from './config.js';
export type {
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
} from './types.js';
export { DEFAULT_DOWNLOAD_CONFIG } from './types.js';
