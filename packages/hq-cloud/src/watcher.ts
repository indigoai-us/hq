/**
 * File watcher — monitors HQ directory for changes
 * Uses chokidar with debounced batching
 */

import * as fs from "fs";
import * as path from "path";
import { watch } from "chokidar";
import type { FSWatcher } from "chokidar";
import { createIgnoreFilter, isWithinSizeLimit } from "./ignore.js";
import { readJournal, writeJournal, hashFile, updateEntry } from "./journal.js";
import { uploadFile, deleteRemoteFile } from "./s3.js";

const DEBOUNCE_MS = 2000;

interface PendingChange {
  type: "add" | "change" | "unlink";
  absolutePath: string;
  relativePath: string;
}

export class SyncWatcher {
  private watcher: FSWatcher | null = null;
  private hqRoot: string;
  private shouldSync: (filePath: string) => boolean;
  private pendingChanges = new Map<string, PendingChange>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;

  constructor(hqRoot: string) {
    this.hqRoot = hqRoot;
    this.shouldSync = createIgnoreFilter(hqRoot);
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = watch(this.hqRoot, {
      ignored: (filePath: string) => !this.shouldSync(filePath),
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher
      .on("add", (p) => this.queueChange("add", p))
      .on("change", (p) => this.queueChange("change", p))
      .on("unlink", (p) => this.queueChange("unlink", p))
      .on("error", (err) => console.error("Watcher error:", err));
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private queueChange(type: "add" | "change" | "unlink", absolutePath: string): void {
    const relativePath = path.relative(this.hqRoot, absolutePath);

    // Skip files that exceed size limit
    if (type !== "unlink" && !isWithinSizeLimit(absolutePath)) {
      return;
    }

    this.pendingChanges.set(relativePath, {
      type,
      absolutePath,
      relativePath,
    });

    // Debounce: wait for DEBOUNCE_MS of quiet before processing
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    if (this.processing || this.pendingChanges.size === 0) return;
    this.processing = true;

    const batch = new Map(this.pendingChanges);
    this.pendingChanges.clear();

    const journal = readJournal(this.hqRoot);

    for (const [relativePath, change] of batch) {
      try {
        if (change.type === "unlink") {
          await deleteRemoteFile(relativePath);
          delete journal.files[relativePath];
        } else {
          const hash = hashFile(change.absolutePath);
          const stat = fs.statSync(change.absolutePath);

          // Skip if unchanged from last sync
          const existing = journal.files[relativePath];
          if (existing && existing.hash === hash) continue;

          await uploadFile(change.absolutePath, relativePath);
          updateEntry(journal, relativePath, hash, stat.size, "up");
        }
      } catch (err) {
        console.error(
          `Sync error [${relativePath}]:`,
          err instanceof Error ? err.message : err
        );
        // Re-queue failed changes
        this.pendingChanges.set(relativePath, change);
      }
    }

    writeJournal(this.hqRoot, journal);
    this.processing = false;

    // Process any changes that came in while we were flushing
    if (this.pendingChanges.size > 0) {
      this.debounceTimer = setTimeout(() => this.flush(), DEBOUNCE_MS);
    }
  }
}
