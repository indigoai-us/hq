/**
 * `hq sync` command — pull everything allowed from entity vault (VLT-5 US-002).
 *
 * Pulls all files the caller's STS session policy permits.
 * Never auto-overwrites local changes — prompts on conflict.
 */

import * as fs from "fs";
import * as path from "path";
import type { VaultServiceConfig, SyncJournal } from "../types.js";
import { resolveEntityContext, isExpiringSoon, refreshEntityContext } from "../context.js";
import { downloadFile, listRemoteFiles } from "../s3.js";
import type { RemoteFile } from "../s3.js";
import { readJournal, writeJournal, hashFile, updateEntry, getEntry, normalizeEtag } from "../journal.js";
import { createIgnoreFilter } from "../ignore.js";
import { resolveConflict } from "./conflict.js";
import type { ConflictStrategy, ConflictResolution } from "./conflict.js";
import {
  buildConflictId,
  buildConflictPath,
  readShortMachineId,
} from "../lib/conflict-file.js";
import { appendConflictEntry } from "../lib/conflict-index.js";

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
 *
 * A single `plan` event is emitted once at the start of every run, before
 * any `progress`/`conflict`/`error` events. It carries the totals derived
 * from a Stage-1 classification pass so consumers can render an accurate
 * progress denominator before transfers begin (the menubar's "Preparing
 * sync…" pre-pass becomes obsolete once the runner forwards this).
 */
export type SyncProgressEvent =
  | {
      type: "plan";
      /** Files this run intends to download (pull-only; 0 from share). */
      filesToDownload: number;
      bytesToDownload: number;
      /** Files this run intends to upload (push-only; 0 from sync). */
      filesToUpload: number;
      bytesToUpload: number;
      /** Files classified as no-op (ignored, unchanged, local-only on pull). */
      filesToSkip: number;
      /**
       * Files known up-front to be conflicts. Pull-side fills this from the
       * 3-way merge against the journal; push-side leaves it 0 because
       * conflict detection requires a remote HEAD that runs in Stage 2.
       */
      filesToConflict: number;
    }
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

  // Stage 1: classify every remote file against the journal + local disk.
  // Hashing happens here (not in the transfer loop) so the plan event below
  // carries an accurate denominator before any progress events fire.
  const plan = computePullPlan(
    remoteFiles,
    journal,
    companyRoot,
    shouldSync,
    options.personalMode === true,
  );

  emit({
    type: "plan",
    filesToDownload: plan.filesToDownload,
    bytesToDownload: plan.bytesToDownload,
    // sync() is pull-only; push counts are sourced from share()'s plan event.
    filesToUpload: 0,
    bytesToUpload: 0,
    filesToSkip: plan.filesToSkip,
    filesToConflict: plan.filesToConflict,
  });

  // Stage 2: execute the plan. Per-item branching mirrors the pre-refactor
  // inline loop; the only structural change is that classification has
  // already happened (so `localHash` is reused instead of re-hashing).
  for (const item of plan.items) {
    if (
      item.action === "skip-ignored" ||
      item.action === "skip-personal-mode" ||
      item.action === "skip-unchanged" ||
      item.action === "skip-local-only"
    ) {
      filesSkipped++;
      continue;
    }

    const { remoteFile, localPath } = item;

    // Auto-refresh context if credentials expiring (kept in execute phase
    // because Stage 1 is fast — no need to refresh just to classify).
    if (isExpiringSoon(ctx.expiresAt)) {
      ctx = await refreshEntityContext(companyRef, vaultConfig);
    }

    if (item.action === "conflict") {
      conflicts++;
      conflictPaths.push(remoteFile.key);

      const resolution = await resolveConflict(
        {
          path: remoteFile.key,
          localHash: item.localHash,
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

      // Write `<original>.conflict-<ts>-<machine>.<ext>` mirror + append to
      // `<hqRoot>/.hq-conflicts/index.json` so the user can later run
      // `/resolve-conflicts` to walk pending conflicts. Skipped for "abort"
      // (user gave up) and "overwrite" (cloud bytes are about to replace
      // local — mirror would be redundant). Best-effort: failure here only
      // emits an error, doesn't break the sync.
      if (resolution !== "abort" && resolution !== "overwrite") {
        try {
          const detectedAt = new Date().toISOString();
          const machineId = readShortMachineId();
          const originalRelative = path.relative(hqRoot, localPath);
          const conflictRelative = buildConflictPath(
            originalRelative,
            detectedAt,
            machineId,
          );
          const conflictAbs = path.join(hqRoot, conflictRelative);
          await downloadFile(ctx, remoteFile.key, conflictAbs);
          appendConflictEntry(hqRoot, {
            id: buildConflictId(originalRelative, detectedAt),
            originalPath: originalRelative,
            conflictPath: conflictRelative,
            detectedAt,
            side: "pull",
            machineId,
            localHash: item.localHash,
            remoteHash: remoteFile.etag ? normalizeEtag(remoteFile.etag) : "",
          });
        } catch (mirrorErr) {
          emit({
            type: "error",
            path: remoteFile.key,
            message: `conflict mirror write failed: ${
              mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr)
            }`,
          });
        }
      }

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
        // Stamp the journal with the new baseline so the same conflict
        // doesn't re-fire on every subsequent sync. After "keep", local
        // wins — the user has accepted that the cloud version we just
        // mirrored is what cloud is at this etag, and they don't want
        // it. Recording (current localHash + current remoteEtag) tells
        // the next sync "no change on either side" until something new
        // diverges. Without this, both `localChanged` and `remoteChanged`
        // stay true forever and the conflict is sticky.
        try {
          const stat = fs.statSync(localPath);
          updateEntry(
            journal,
            remoteFile.key,
            item.localHash,
            stat.size,
            "down",
            remoteFile.etag,
          );
        } catch {
          // best-effort — sync continues even if stat fails
        }
        continue;
      }
      // "overwrite" falls through to download
    }

    // Download (action === "download" or conflict resolved to "overwrite")
    try {
      await downloadFile(ctx, remoteFile.key, localPath);

      const hash = hashFile(localPath);
      const stat = fs.statSync(localPath);
      // Capture the listing's ETag so subsequent syncs can detect remote
      // drift independently of mtime drift.
      updateEntry(journal, remoteFile.key, hash, stat.size, "down", remoteFile.etag);

      // Attach message from the prior journal entry if present (set by a
      // previous `share` operation that included a --message).
      const priorEntry = getEntry(journal, remoteFile.key);
      const remoteJournalMessage = (priorEntry as { message?: string } | undefined)?.message;
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

  // Stamp lastSync on every successful run so the menubar's "Last sync · X ago"
  // ticks even when nothing transferred. updateEntry only fires on actual
  // downloads; without this, a no-op sync leaves lastSync at the time of the
  // last file change, which is misleading.
  journal.lastSync = new Date().toISOString();
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
 * Stage-1 classification for a single remote object. Each remote file falls
 * into exactly one bucket; the executor in `sync()` switches on `action` to
 * decide what to do. `localHash` is carried on `conflict` items so the
 * executor can hand it to `resolveConflict` without re-hashing.
 */
type PullPlanItem =
  | { action: "download"; remoteFile: RemoteFile; localPath: string }
  | { action: "skip-ignored"; remoteFile: RemoteFile; localPath: string }
  | { action: "skip-personal-mode"; remoteFile: RemoteFile; localPath: string }
  | { action: "skip-unchanged"; remoteFile: RemoteFile; localPath: string }
  | { action: "skip-local-only"; remoteFile: RemoteFile; localPath: string }
  | {
      action: "conflict";
      remoteFile: RemoteFile;
      localPath: string;
      localHash: string;
    };

interface PullPlan {
  items: PullPlanItem[];
  filesToDownload: number;
  bytesToDownload: number;
  filesToSkip: number;
  filesToConflict: number;
}

/**
 * Stage-1 planning pass: classify every remote file into download / skip /
 * conflict buckets without performing any S3 transfers. Local hashes are
 * computed here (not in the transfer loop) so the totals returned reflect
 * the real outcome of the upcoming Stage-2 execution rather than an
 * upper-bound guess.
 *
 * Pure function: no S3 calls, no journal writes, no event emission. The
 * caller (`sync()`) is responsible for emitting the resulting plan event
 * before iterating `items`.
 */
function computePullPlan(
  remoteFiles: RemoteFile[],
  journal: SyncJournal,
  companyRoot: string,
  shouldSync: (filePath: string) => boolean,
  personalMode: boolean,
): PullPlan {
  const items: PullPlanItem[] = [];

  for (const remoteFile of remoteFiles) {
    const localPath = path.join(companyRoot, remoteFile.key);

    if (personalMode && remoteFile.key.startsWith("companies/")) {
      items.push({ action: "skip-personal-mode", remoteFile, localPath });
      continue;
    }

    if (!shouldSync(localPath)) {
      items.push({ action: "skip-ignored", remoteFile, localPath });
      continue;
    }

    const journalEntry = getEntry(journal, remoteFile.key);

    if (fs.existsSync(localPath)) {
      const localHash = hashFile(localPath);
      const localChanged = !!journalEntry && journalEntry.hash !== localHash;
      const remoteChanged =
        !!journalEntry && hasRemoteChanged(remoteFile, journalEntry);

      // Mirror the original 3-way merge from the inline loop. Tested by
      // `does NOT flag a pull conflict when only local changed since last
      // sync` and `detects conflicts with local changes…`.
      if (localChanged && remoteChanged) {
        items.push({
          action: "conflict",
          remoteFile,
          localPath,
          localHash,
        });
        continue;
      }
      if (journalEntry && localChanged && !remoteChanged) {
        items.push({ action: "skip-local-only", remoteFile, localPath });
        continue;
      }
      if (journalEntry && !localChanged && !remoteChanged) {
        items.push({ action: "skip-unchanged", remoteFile, localPath });
        continue;
      }
      // No journal entry, or remote-only changed → fall through to download.
    }

    items.push({ action: "download", remoteFile, localPath });
  }

  let filesToDownload = 0;
  let bytesToDownload = 0;
  let filesToSkip = 0;
  let filesToConflict = 0;
  for (const item of items) {
    if (item.action === "download") {
      filesToDownload++;
      bytesToDownload += item.remoteFile.size;
    } else if (item.action === "conflict") {
      filesToConflict++;
    } else {
      filesToSkip++;
    }
  }

  return {
    items,
    filesToDownload,
    bytesToDownload,
    filesToSkip,
    filesToConflict,
  };
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
  if (event.type === "plan") {
    // Terse single line so humans see what's about to happen without
    // drowning the per-file output that follows. Skip when there's
    // nothing to do — no signal, no noise.
    const movement = event.filesToDownload + event.filesToUpload + event.filesToConflict;
    if (movement > 0) {
      const parts: string[] = [];
      if (event.filesToDownload > 0) {
        parts.push(`${event.filesToDownload} to download (${event.bytesToDownload} bytes)`);
      }
      if (event.filesToUpload > 0) {
        parts.push(`${event.filesToUpload} to upload (${event.bytesToUpload} bytes)`);
      }
      if (event.filesToConflict > 0) {
        parts.push(`${event.filesToConflict} conflict(s)`);
      }
      parts.push(`${event.filesToSkip} unchanged`);
      console.log(`Plan: ${parts.join(", ")}`);
    }
  } else if (event.type === "progress") {
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
