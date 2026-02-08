/**
 * Persistent sync state for tracking which S3 objects have been downloaded.
 *
 * Stores LastModified timestamps, ETags, and sizes for each synced file.
 * Persisted to disk as JSON so state survives daemon restarts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SyncState, SyncStateEntry, S3ObjectInfo } from './types.js';

/**
 * Manages the persistent sync state that tracks which files have been
 * downloaded and their S3 metadata at the time of download.
 */
export class SyncStateManager {
  private state: SyncState;
  private readonly filePath: string;
  private dirty = false;

  constructor(filePath: string, userId: string, s3Prefix: string) {
    this.filePath = filePath;
    this.state = {
      version: 1,
      userId,
      s3Prefix,
      lastPollAt: null,
      entries: {},
    };
  }

  /** Number of tracked files */
  get size(): number {
    return Object.keys(this.state.entries).length;
  }

  /** Timestamp of last successful poll */
  get lastPollAt(): number | null {
    return this.state.lastPollAt;
  }

  /**
   * Load state from disk. If the file doesn't exist or is invalid,
   * starts with empty state.
   */
  load(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);

      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'version' in parsed &&
        (parsed as SyncState).version === 1 &&
        'entries' in parsed
      ) {
        const loaded = parsed as SyncState;
        this.state = {
          ...this.state,
          lastPollAt: loaded.lastPollAt,
          entries: loaded.entries,
        };
      }
    } catch {
      // Corrupt state file; start fresh
    }
  }

  /**
   * Save state to disk.
   */
  save(): void {
    if (!this.dirty) {
      return;
    }

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    this.dirty = false;
  }

  /**
   * Force save regardless of dirty flag.
   */
  forceSave(): void {
    this.dirty = true;
    this.save();
  }

  /**
   * Get the sync state entry for a relative path, or undefined if not tracked.
   */
  getEntry(relativePath: string): SyncStateEntry | undefined {
    return this.state.entries[relativePath];
  }

  /**
   * Check if a file has changed compared to the stored state.
   * Returns true if the file is new or has been modified.
   */
  hasChanged(s3Object: S3ObjectInfo): boolean {
    const entry = this.state.entries[s3Object.relativePath];

    if (!entry) {
      // New file, not previously tracked
      return true;
    }

    // Changed if LastModified differs or ETag differs
    return entry.lastModified !== s3Object.lastModified || entry.etag !== s3Object.etag;
  }

  /**
   * Update the state entry for a file after successful download.
   */
  updateEntry(s3Object: S3ObjectInfo): void {
    this.state.entries[s3Object.relativePath] = {
      relativePath: s3Object.relativePath,
      lastModified: s3Object.lastModified,
      etag: s3Object.etag,
      size: s3Object.size,
      syncedAt: Date.now(),
    };
    this.dirty = true;
  }

  /**
   * Remove a state entry (when a file is deleted locally).
   */
  removeEntry(relativePath: string): void {
    if (relativePath in this.state.entries) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.state.entries[relativePath];
      this.dirty = true;
    }
  }

  /**
   * Get all tracked relative paths.
   */
  getTrackedPaths(): string[] {
    return Object.keys(this.state.entries);
  }

  /**
   * Get all entries as an array.
   */
  getAllEntries(): SyncStateEntry[] {
    return Object.values(this.state.entries);
  }

  /**
   * Record a successful poll timestamp.
   */
  recordPoll(): void {
    this.state.lastPollAt = Date.now();
    this.dirty = true;
  }

  /**
   * Clear all state (for full re-sync).
   */
  clear(): void {
    this.state.entries = {};
    this.state.lastPollAt = null;
    this.dirty = true;
  }
}
