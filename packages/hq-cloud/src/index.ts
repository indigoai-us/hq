/**
 * @indigoai-us/hq-cloud — public API
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

// Cognito identity helpers — used by `hq auth refresh` and any consumer
// that needs a valid HQ access token (deploy skill, onboarding, etc.).
export {
  browserLogin,
  refreshTokens,
  getValidAccessToken,
  loadCachedTokens,
  saveCachedTokens,
  clearCachedTokens,
  isExpiring,
  CognitoAuthError,
} from "./cognito-auth.js";
export type { CognitoAuthConfig, CognitoTokens } from "./cognito-auth.js";

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
 * Classify a sync error into a user-friendly top-line message.
 *
 * The common failure modes all surface through the AWS SDK or Node's fetch,
 * with messages that aren't self-explanatory in a CLI ("fetch failed" for a
 * push operation is especially confusing). This maps the raw error to a
 * single actionable hint.
 */
function classifySyncError(err: unknown): Error {
  const raw = err instanceof Error ? err : new Error(String(err));
  const msg = raw.message.toLowerCase();
  const name = (raw.name || "").toLowerCase();

  let hint: string;
  if (
    msg.includes("not authenticated") ||
    msg.includes("run 'hq sync init'") ||
    msg.includes("run `hq login`")
  ) {
    hint = "Not authenticated. Run `hq login` (or `hq sync init`) first.";
  } else if (
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("unrecognized name") ||
    msg.includes("network") ||
    name.includes("fetcherror")
  ) {
    hint =
      "Can't reach HQ cloud (network error). Check your connection, then run `hq login` to refresh credentials.";
  } else if (
    msg.includes("expiredtoken") ||
    msg.includes("invalidaccesskeyid") ||
    msg.includes("signaturedoesnotmatch") ||
    msg.includes("401")
  ) {
    hint =
      "HQ cloud credentials expired or invalid. Run `hq login` to sign in again.";
  } else if (
    msg.includes("nosuchbucket") ||
    msg.includes("bucket") && msg.includes("not")
  ) {
    hint = "Cloud storage bucket not configured. Run `hq sync init` to provision.";
  } else if (msg.includes("accessdenied") || msg.includes("403")) {
    hint = "Permission denied by HQ cloud. Check your account with `hq whoami`.";
  } else {
    hint = `Sync failed: ${raw.message}`;
  }

  const wrapped = new Error(hint);
  (wrapped as Error & { cause?: unknown }).cause = raw;
  return wrapped;
}

// Abort a push/pull loop after this many back-to-back identical failures.
// Prevents the "525 fetch failed lines" output when auth/network is dead.
const MAX_CONSECUTIVE_IDENTICAL_FAILURES = 3;

/**
 * Force push all local files to S3.
 *
 * Runs a pre-flight (`listRemoteFiles`) to surface auth/network errors once
 * instead of per-file, and aborts mid-loop if the same error repeats.
 */
export async function pushAll(hqRoot: string): Promise<PushResult> {
  const shouldSync = createIgnoreFilter(hqRoot);
  const journal = readJournal(hqRoot);
  let filesUploaded = 0;
  let bytesUploaded = 0;

  // Pre-flight: verify we can actually talk to S3 before walking the tree.
  try {
    await listRemoteFiles();
  } catch (err) {
    throw classifySyncError(err);
  }

  const files = walkDir(hqRoot, hqRoot, shouldSync);

  const failures: { path: string; message: string }[] = [];
  let lastErrorMessage: string | null = null;
  let consecutiveIdentical = 0;

  for (const { absolutePath, relativePath } of files) {
    if (!isWithinSizeLimit(absolutePath)) continue;

    try {
      const hash = hashFile(absolutePath);
      const stat = fs.statSync(absolutePath);

      await uploadFile(absolutePath, relativePath);
      updateEntry(journal, relativePath, hash, stat.size, "up");
      filesUploaded++;
      bytesUploaded += stat.size;
      consecutiveIdentical = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ path: relativePath, message });

      if (message === lastErrorMessage) {
        consecutiveIdentical++;
      } else {
        consecutiveIdentical = 1;
        lastErrorMessage = message;
      }

      if (consecutiveIdentical >= MAX_CONSECUTIVE_IDENTICAL_FAILURES) {
        writeJournal(hqRoot, journal);
        const classified = classifySyncError(err);
        throw new Error(
          `${classified.message} (${filesUploaded} uploaded, ${failures.length} failed before abort)`
        );
      }
    }
  }

  writeJournal(hqRoot, journal);

  if (failures.length > 0) {
    console.error(
      `  ${failures.length} file(s) failed to upload. First error: ${failures[0].message}`
    );
  }

  return { filesUploaded, bytesUploaded };
}

/**
 * Force pull all remote files to local.
 *
 * `listRemoteFiles` acts as its own pre-flight — if auth/network is dead, it
 * throws before we touch the local filesystem.
 */
export async function pullAll(hqRoot: string): Promise<PullResult> {
  const journal = readJournal(hqRoot);
  let filesDownloaded = 0;
  let bytesDownloaded = 0;

  let remoteFiles;
  try {
    remoteFiles = await listRemoteFiles();
  } catch (err) {
    throw classifySyncError(err);
  }

  const failures: { path: string; message: string }[] = [];
  let lastErrorMessage: string | null = null;
  let consecutiveIdentical = 0;

  for (const file of remoteFiles) {
    try {
      const localPath = path.join(hqRoot, file.relativePath);
      await downloadFile(file.relativePath, localPath);

      const hash = hashFile(localPath);
      updateEntry(journal, file.relativePath, hash, file.size, "down");
      filesDownloaded++;
      bytesDownloaded += file.size;
      consecutiveIdentical = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ path: file.relativePath, message });

      if (message === lastErrorMessage) {
        consecutiveIdentical++;
      } else {
        consecutiveIdentical = 1;
        lastErrorMessage = message;
      }

      if (consecutiveIdentical >= MAX_CONSECUTIVE_IDENTICAL_FAILURES) {
        writeJournal(hqRoot, journal);
        const classified = classifySyncError(err);
        throw new Error(
          `${classified.message} (${filesDownloaded} downloaded, ${failures.length} failed before abort)`
        );
      }
    }
  }

  writeJournal(hqRoot, journal);

  if (failures.length > 0) {
    console.error(
      `  ${failures.length} file(s) failed to download. First error: ${failures[0].message}`
    );
  }

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
