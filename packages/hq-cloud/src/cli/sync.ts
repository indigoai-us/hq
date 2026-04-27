/**
 * `hq sync` command — pull everything allowed from entity vault (VLT-5 US-002).
 *
 * Pulls all files the caller's STS session policy permits.
 * Never auto-overwrites local changes — prompts on conflict.
 */

import * as fs from "fs";
import * as path from "path";
import type { VaultServiceConfig } from "../types.js";
import { resolveEntityContext, isExpiringSoon, refreshEntityContext } from "../context.js";
import { downloadFile, listRemoteFiles } from "../s3.js";
import { readJournal, writeJournal, hashFile, updateEntry, getEntry, normalizeEtag } from "../journal.js";
import { createIgnoreFilter } from "../ignore.js";
import { resolveConflict } from "./conflict.js";
import type { ConflictStrategy, ConflictResolution } from "./conflict.js";

/**
 * Per-file events emitted by `sync()` as it progresses.
 *
 * When `SyncOptions.onEvent` is set, these events are delivered to the caller
 * in place of the default human-readable `console.log` / `console.error`
 * output. This is the seam that lets `hq-sync-runner` stream ndjson to the
 * AppBar menubar without the engine knowing anything about ndjson (ADR-0001).
 *
 * The human CLI (`hq sync`) leaves `onEvent` undefined and falls through to
 * `defaultConsoleLogger` below, which preserves the existing tty output.
 */
export type SyncProgressEvent =
  | { type: "progress"; path: string; bytes: number; message?: string }
  | { type: "error"; path: string; message: string }
  | {
      type: "conflict";
      path: string;
      direction: "pull" | "push";
      resolution: ConflictResolution;
    };

export interface SyncOptions {
  /** Company slug or UID (defaults to active company from config) */
  company?: string;
  /** Non-interactive conflict strategy */
  onConflict?: ConflictStrategy;
  /** Vault service config */
  vaultConfig: VaultServiceConfig;
  /** HQ root directory */
  hqRoot: string;
  /**
   * Per-file event callback. When present, suppresses the default
   * `console.log`/`console.error` human output — the caller is expected to
   * render events themselves (e.g. emit ndjson to stdout). When absent, the
   * default human logger is used. See `SyncProgressEvent`.
   */
  onEvent?: (event: SyncProgressEvent) => void;
  /**
   * When true, the caller is syncing against the caller's person-entity
   * bucket. Pulled keys whose path starts with `companies/` are dropped
   * (belt-and-braces — the person bucket should never contain those,
   * but the runner must not write them into the user's company folders).
   */
  personalMode?: boolean;
  /**
   * Override for the per-slug journal file name. Defaults to `ctx.slug`.
   * sync-runner passes `journalSlug: "personal"` for the personal slot so
   * TS runner and Rust first-push share idempotency state.
   */
  journalSlug?: string;
}

export interface SyncResult {
  filesDownloaded: number;
  bytesDownloaded: number;
  filesSkipped: number;
  conflicts: number;
  /**
   * Paths (remote keys) that were detected as conflicts during this run.
   * Always populated when `conflicts > 0` so callers can surface them in UI
   * or logs without re-streaming the per-file events.
   */
  conflictPaths: string[];
  aborted: boolean;
}

/**
 * Sync (pull) all allowed files from the entity vault.
 */
export async function sync(options: SyncOptions): Promise<SyncResult> {
  const { company, onConflict, vaultConfig, hqRoot } = options;
  const emit = options.onEvent ?? defaultConsoleLogger;

  // Resolve company
  const companyRef = company ?? resolveActiveCompany(hqRoot);
  if (!companyRef) {
    throw new Error(
      "No company specified and no active company found. " +
      "Use --company <slug> or set up .hq/config.json.",
    );
  }

  // Resolve entity context
  let ctx = await resolveEntityContext(companyRef, vaultConfig);
  // Every company's files land under companies/{slug}/ so fanning out multiple
  // companies into the same hqRoot doesn't cross-clobber files with overlapping
  // S3 keys (e.g. every company has a .hq/manifest.json). Remote keys stay
  // company-relative; the prefix lives only on disk.
  // In personalMode the journal slug + S3 keys are person-relative (e.g. "docs/foo.md");
  // the local target is `hqRoot` directly, NOT `<hqRoot>/companies/<personSlug>/`. This
  // keeps round-trip parity with the Rust personal first-push (Step 7) which sources
  // `<hqRoot>/docs/foo.md`.
  const companyRoot = options.personalMode === true
    ? hqRoot
    : path.join(hqRoot, "companies", ctx.slug);
  const shouldSync = createIgnoreFilter(hqRoot);
  const journalSlug = options.journalSlug ?? ctx.slug;
  const journal = readJournal(journalSlug);

  let filesDownloaded = 0;
  let bytesDownloaded = 0;
  let filesSkipped = 0;
  let conflicts = 0;
  const conflictPaths: string[] = [];

  // List all remote files (IAM session policy filters at the AWS layer)
  const remoteFiles = await listRemoteFiles(ctx);

  for (const remoteFile of remoteFiles) {
    const localPath = path.join(companyRoot, remoteFile.key);

    if (options.personalMode === true && remoteFile.key.startsWith("companies/")) {
      filesSkipped++;
      continue;
    }

    // Apply ignore rules
    if (!shouldSync(localPath)) {
      filesSkipped++;
      continue;
    }

    // Auto-refresh context if credentials expiring
    if (isExpiringSoon(ctx.expiresAt)) {
      ctx = await refreshEntityContext(companyRef, vaultConfig);
    }

    // Check for local conflict
    const journalEntry = getEntry(journal, remoteFile.key);

    if (fs.existsSync(localPath)) {
      const localHash = hashFile(localPath);
      const localChanged = !!journalEntry && journalEntry.hash !== localHash;
      const remoteChanged = !!journalEntry && hasRemoteChanged(remoteFile, journalEntry);

      // A real conflict requires BOTH sides to have moved since the last
      // sync. If only local changed, push will handle it; pulling here would
      // clobber the local edit. If only remote changed, fall through to
      // download. If neither moved, skip.
      if (localChanged && remoteChanged) {
        conflicts++;
        conflictPaths.push(remoteFile.key);

        const resolution = await resolveConflict(
          {
            path: remoteFile.key,
            localHash,
            remoteModified: remoteFile.lastModified,
            localModified: fs.statSync(localPath).mtime,
            direction: "pull",
          },
          onConflict,
        );

        emit({
          type: "conflict",
          path: remoteFile.key,
          direction: "pull",
          resolution,
        });

        if (resolution === "abort") {
          writeJournal(journalSlug, journal);
          return {
            filesDownloaded,
            bytesDownloaded,
            filesSkipped,
            conflicts,
            conflictPaths,
            aborted: true,
          };
        }
        if (resolution === "keep" || resolution === "skip") {
          filesSkipped++;
          continue;
        }
        // "overwrite" falls through to download
      } else if (journalEntry && localChanged && !remoteChanged) {
        // Local-only edit: leave it for the push phase to upload. Pulling
        // would silently overwrite the user's work.
        filesSkipped++;
        continue;
      } else if (journalEntry && !localChanged && !remoteChanged) {
        // Neither side moved — nothing to do.
        filesSkipped++;
        continue;
      }
      // Otherwise (no journal entry, or remote-only changed) fall through
      // to download.
    }

    // Download
    try {
      await downloadFile(ctx, remoteFile.key, localPath);

      const hash = hashFile(localPath);
      const stat = fs.statSync(localPath);
      // Capture the listing's ETag so subsequent syncs can detect remote
      // drift independently of mtime drift.
      updateEntry(journal, remoteFile.key, hash, stat.size, "down", remoteFile.etag);

      // Attach message from journal entry if present
      const remoteJournalMessage = (journalEntry as { message?: string } | undefined)?.message;
      emit({
        type: "progress",
        path: remoteFile.key,
        bytes: stat.size,
        ...(remoteJournalMessage ? { message: remoteJournalMessage } : {}),
      });

      filesDownloaded++;
      bytesDownloaded += stat.size;
    } catch (err) {
      // STS session policy may deny access to some paths — this is expected
      // for guest members with allowedPrefixes
      if (isAccessDenied(err)) {
        filesSkipped++;
      } else {
        emit({
          type: "error",
          path: remoteFile.key,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  writeJournal(journalSlug, journal);

  return {
    filesDownloaded,
    bytesDownloaded,
    filesSkipped,
    conflicts,
    conflictPaths,
    aborted: false,
  };
}

/**
 * Resolve active company from .hq/config.json.
 */
function resolveActiveCompany(hqRoot: string): string | undefined {
  const configPath = path.join(hqRoot, ".hq", "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return config.activeCompany ?? config.companySlug;
    } catch {
      // Ignore parse errors
    }
  }
  return undefined;
}

/**
 * Returns true when the remote object appears to have moved since the
 * journal entry's last-recorded sync. Prefers ETag equality; falls back to
 * `lastModified > syncedAt` for legacy entries written before remoteEtag
 * was tracked. Conservative on tie (`<=` skews "remote unchanged").
 */
function hasRemoteChanged(
  remote: { lastModified: Date; etag: string },
  entry: { syncedAt: string; remoteEtag?: string },
): boolean {
  if (entry.remoteEtag) {
    return normalizeEtag(remote.etag) !== entry.remoteEtag;
  }
  const syncedAt = new Date(entry.syncedAt).getTime();
  return remote.lastModified.getTime() > syncedAt;
}

/**
 * Check if an error is an S3 access denied (expected for filtered guests).
 */
function isAccessDenied(err: unknown): boolean {
  if (err && typeof err === "object" && "name" in err) {
    return err.name === "AccessDenied" || err.name === "Forbidden";
  }
  return false;
}

/**
 * Default human-readable event rendering. Preserves the exact output format
 * that `hq sync` emitted before SyncProgressEvent was introduced, so callers
 * without an `onEvent` see no behavioral change.
 */
function defaultConsoleLogger(event: SyncProgressEvent): void {
  if (event.type === "progress") {
    if (event.message) {
      console.log(`  ✓ ${event.path} — "${event.message}"`);
    } else {
      console.log(`  ✓ ${event.path}`);
    }
  } else if (event.type === "error") {
    console.error(`  ✗ ${event.path} — ${event.message}`);
  } else if (event.type === "conflict") {
    console.error(
      `  ⚠ conflict (${event.direction}): ${event.path} — ${event.resolution}`,
    );
  }
}
