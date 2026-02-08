/**
 * Types for the HQ sync daemon.
 *
 * The daemon watches a local HQ directory for changes and
 * coordinates syncing to S3 via the file-sync infrastructure.
 */

/** Daemon lifecycle states */
export type DaemonState = 'idle' | 'starting' | 'running' | 'paused' | 'stopping' | 'stopped';

/** Configuration for the sync daemon */
export interface SyncDaemonConfig {
  /** Absolute path to the local HQ directory to watch */
  hqDir: string;
  /** How often to flush pending changes to S3 (milliseconds, default: 30000) */
  syncIntervalMs: number;
  /** Glob patterns of files/dirs to ignore (merged with defaults) */
  ignoredPatterns: string[];
  /** Maximum number of file events to batch before forcing a sync */
  batchSize: number;
  /** Whether to persist a PID file for single-instance enforcement */
  usePidFile: boolean;
  /** Path to the PID file (default: {hqDir}/.hq-sync.pid) */
  pidFilePath: string;
  /** Debounce delay for file watcher events (ms, default: 300) */
  debounceMs: number;
  /** Maximum number of concurrent S3 upload operations */
  maxConcurrentUploads: number;
}

/** Default ignored patterns for the file watcher */
export const DEFAULT_IGNORED_PATTERNS: readonly string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/.hq-sync.pid',
  '**/.hq-sync.log',
  '**/nul',
  '**/*.swp',
  '**/*.swo',
  '**/*~',
] as const;

/** Default daemon configuration values */
export const DEFAULT_DAEMON_CONFIG: Omit<SyncDaemonConfig, 'hqDir' | 'pidFilePath'> = {
  syncIntervalMs: 30_000,
  ignoredPatterns: [...DEFAULT_IGNORED_PATTERNS],
  batchSize: 100,
  usePidFile: true,
  debounceMs: 300,
  maxConcurrentUploads: 5,
};

/** Type of file-system event detected by the watcher */
export type FileEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

/** A single file-system change detected by the watcher */
export interface FileEvent {
  /** Type of change */
  type: FileEventType;
  /** Absolute path to the affected file/directory */
  absolutePath: string;
  /** Path relative to the HQ root */
  relativePath: string;
  /** Timestamp when the event was captured */
  timestamp: number;
}

/** Stats emitted by the daemon */
export interface SyncDaemonStats {
  /** Current daemon state */
  state: DaemonState;
  /** Timestamp when the daemon started (or null if not started) */
  startedAt: number | null;
  /** Number of sync cycles completed */
  syncCyclesCompleted: number;
  /** Number of files synced since start */
  filesSynced: number;
  /** Number of sync errors since start */
  syncErrors: number;
  /** Number of pending events awaiting next sync */
  pendingEvents: number;
  /** Timestamp of last successful sync (or null) */
  lastSyncAt: number | null;
  /** Duration of the last sync cycle in ms (or null) */
  lastSyncDurationMs: number | null;
}

/** Events emitted by the SyncDaemon */
export interface SyncDaemonEvents {
  /** Daemon state changed */
  stateChange: (newState: DaemonState, oldState: DaemonState) => void;
  /** File event detected */
  fileEvent: (event: FileEvent) => void;
  /** Sync cycle started */
  syncStart: (pendingCount: number) => void;
  /** Sync cycle completed */
  syncComplete: (synced: number, errors: number, durationMs: number) => void;
  /** Error occurred */
  error: (error: Error) => void;
  /** Daemon has fully stopped */
  stopped: () => void;
}

/** Result of a single file sync operation */
export interface FileSyncResult {
  /** Relative path of the file */
  relativePath: string;
  /** Whether the sync was successful */
  success: boolean;
  /** Error message if sync failed */
  error?: string;
  /** Event type that triggered the sync */
  eventType: FileEventType;
}
