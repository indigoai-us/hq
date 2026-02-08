export { SyncDaemon } from './sync-daemon.js';
export type { SyncHandler, TypedSyncDaemonEmitter } from './sync-daemon.js';
export { FileWatcher } from './file-watcher.js';
export type { FileWatcherCallbacks } from './file-watcher.js';
export { EventQueue } from './event-queue.js';
export { buildDaemonConfig, validateDaemonConfig } from './config.js';
export type {
  SyncDaemonConfig,
  DaemonState,
  FileEvent,
  FileEventType,
  SyncDaemonStats,
  SyncDaemonEvents,
  FileSyncResult,
} from './types.js';
export { DEFAULT_IGNORED_PATTERNS, DEFAULT_DAEMON_CONFIG } from './types.js';
