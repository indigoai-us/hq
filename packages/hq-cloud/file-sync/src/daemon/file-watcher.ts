/**
 * File watcher wrapping chokidar for HQ directory monitoring.
 *
 * Watches the HQ directory, debounces events, and emits FileEvent objects.
 * Handles ignored patterns and translates raw FS events into typed events.
 */

import * as path from 'node:path';
import chokidar from 'chokidar';
import type { FileEvent, FileEventType, SyncDaemonConfig } from './types.js';

export interface FileWatcherCallbacks {
  onEvent: (event: FileEvent) => void;
  onError: (error: Error) => void;
  onReady: () => void;
}

/**
 * Watches an HQ directory for file-system changes using chokidar.
 *
 * Events are debounced per-file: rapid changes to the same file within
 * `debounceMs` are collapsed into a single event.
 */
export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private readonly config: SyncDaemonConfig;
  private readonly callbacks: FileWatcherCallbacks;
  private readonly debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private _isWatching = false;

  constructor(config: SyncDaemonConfig, callbacks: FileWatcherCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /** Whether the watcher is currently active */
  get isWatching(): boolean {
    return this._isWatching;
  }

  /**
   * Start watching the HQ directory.
   * Resolves when chokidar has finished the initial scan.
   */
  async start(): Promise<void> {
    if (this._isWatching) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        this.watcher = chokidar.watch(this.config.hqDir, {
          ignored: this.config.ignoredPatterns,
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: this.config.debounceMs,
            pollInterval: 100,
          },
          // Do not follow symlinks into external repos
          followSymlinks: false,
        });

        this.watcher.on('ready', () => {
          this._isWatching = true;
          this.callbacks.onReady();
          resolve();
        });

        this.watcher.on('error', (error: Error) => {
          this.callbacks.onError(error);
        });

        // Bind all event types
        const eventTypes: FileEventType[] = ['add', 'change', 'unlink', 'addDir', 'unlinkDir'];
        for (const eventType of eventTypes) {
          this.watcher.on(eventType, (filePath: string) => {
            this.handleEvent(eventType, filePath);
          });
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Stop watching and clean up resources.
   */
  async stop(): Promise<void> {
    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this._isWatching = false;
  }

  /**
   * Handle a raw file-system event, applying per-file debounce.
   */
  private handleEvent(type: FileEventType, absolutePath: string): void {
    const relativePath = path.relative(this.config.hqDir, absolutePath).replace(/\\/g, '/');
    const key = `${type}:${relativePath}`;

    // Clear existing debounce for this file+event
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      const event: FileEvent = {
        type,
        absolutePath,
        relativePath,
        timestamp: Date.now(),
      };
      this.callbacks.onEvent(event);
    }, this.config.debounceMs);

    this.debounceTimers.set(key, timer);
  }
}
