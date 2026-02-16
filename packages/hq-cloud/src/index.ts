/**
 * @indigoai/hq-cloud — public API
 * Used by @indigoai-us/hq-cli to manage cloud sync
 */

import * as fs from "fs";
import * as path from "path";
import { authenticate, hasCredentials, readCredentials } from "./auth.js";
import {
  startDaemon as _startDaemon,
  stopDaemon as _stopDaemon,
  isDaemonRunning,
} from "./daemon.js";
import { readJournal, writeJournal, hashFile, updateEntry } from "./journal.js";
import { uploadFile, downloadFile, listRemoteFiles } from "./s3.js";
import { createIgnoreFilter, isWithinSizeLimit } from "./ignore.js";
import type { SyncStatus, PushResult, PullResult } from "./types.js";

export type { SyncStatus, PushResult, PullResult } from "./types.js";

/**
 * Initialize cloud sync — authenticate and provision bucket
 */
export async function initSync(hqRoot: string): Promise<void> {
  if (hasCredentials()) {
    console.log("  Already authenticated. Use 'hq sync start' to begin syncing.");
    return;
  }

  console.log("  Setting up IndigoAI cloud sync...");
  const creds = await authenticate();
  console.log(`  ✓ Authenticated as ${creds.userId}`);
  console.log(`  ✓ Bucket: ${creds.bucket}`);
  console.log(`  ✓ Region: ${creds.region}`);
  console.log();
  console.log("  Run 'hq sync start' to begin syncing.");
}

/**
 * Start the background sync daemon
 */
export async function startDaemon(hqRoot: string): Promise<void> {
  if (!hasCredentials()) {
    throw new Error("Not authenticated. Run 'hq sync init' first.");
  }
  _startDaemon(hqRoot);
}

/**
 * Stop the background sync daemon
 */
export async function stopDaemon(hqRoot: string): Promise<void> {
  _stopDaemon(hqRoot);
}

/**
 * Get current sync status
 */
export async function getStatus(hqRoot: string): Promise<SyncStatus> {
  const journal = readJournal(hqRoot);
  const creds = readCredentials();
  const running = isDaemonRunning(hqRoot);
  const errors: string[] = [];

  if (!creds) {
    errors.push("Not authenticated — run 'hq sync init'");
  }

  return {
    running,
    lastSync: journal.lastSync || null,
    fileCount: Object.keys(journal.files).length,
    bucket: creds?.bucket || null,
    errors,
  };
}

/**
 * Force push all local files to S3
 */
export async function pushAll(hqRoot: string): Promise<PushResult> {
  const shouldSync = createIgnoreFilter(hqRoot);
  const journal = readJournal(hqRoot);
  let filesUploaded = 0;
  let bytesUploaded = 0;

  const files = walkDir(hqRoot, hqRoot, shouldSync);

  for (const { absolutePath, relativePath } of files) {
    if (!isWithinSizeLimit(absolutePath)) continue;

    try {
      const hash = hashFile(absolutePath);
      const stat = fs.statSync(absolutePath);

      await uploadFile(absolutePath, relativePath);
      updateEntry(journal, relativePath, hash, stat.size, "up");
      filesUploaded++;
      bytesUploaded += stat.size;
    } catch (err) {
      console.error(
        `  Failed: ${relativePath} — ${err instanceof Error ? err.message : err}`
      );
    }
  }

  writeJournal(hqRoot, journal);
  return { filesUploaded, bytesUploaded };
}

/**
 * Force pull all remote files to local
 */
export async function pullAll(hqRoot: string): Promise<PullResult> {
  const journal = readJournal(hqRoot);
  let filesDownloaded = 0;
  let bytesDownloaded = 0;

  const remoteFiles = await listRemoteFiles();

  for (const file of remoteFiles) {
    try {
      const localPath = path.join(hqRoot, file.relativePath);
      await downloadFile(file.relativePath, localPath);

      const hash = hashFile(localPath);
      updateEntry(journal, file.relativePath, hash, file.size, "down");
      filesDownloaded++;
      bytesDownloaded += file.size;
    } catch (err) {
      console.error(
        `  Failed: ${file.relativePath} — ${err instanceof Error ? err.message : err}`
      );
    }
  }

  writeJournal(hqRoot, journal);
  return { filesDownloaded, bytesDownloaded };
}

// Helper: recursively walk a directory
function walkDir(
  dir: string,
  root: string,
  filter: (p: string) => boolean
): { absolutePath: string; relativePath: string }[] {
  const results: { absolutePath: string; relativePath: string }[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (!filter(absolutePath)) continue;

    if (entry.isDirectory()) {
      results.push(...walkDir(absolutePath, root, filter));
    } else if (entry.isFile()) {
      results.push({
        absolutePath,
        relativePath: path.relative(root, absolutePath),
      });
    }
  }

  return results;
}
