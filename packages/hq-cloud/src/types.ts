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
}

export interface JournalEntry {
  hash: string;
  size: number;
  syncedAt: string;
  direction: "up" | "down";
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
