/**
 * `hq sync` command — pull everything allowed from entity vault (VLT-5 US-002).
 *
 * Pulls all files the caller's STS session policy permits.
 * Never auto-overwrites local changes — prompts on conflict.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { VaultServiceConfig } from "../types.js";
import { resolveEntityContext, isExpiringSoon, refreshEntityContext } from "../context.js";
import {
  downloadFile,
  downloadFileBytes,
  headRemoteFile,
  listRemoteFiles,
  listObjectVersions,
} from "../s3.js";
import { readJournal, writeJournal, hashFile, updateEntry, getEntry } from "../journal.js";
import { createIgnoreFilter } from "../ignore.js";
import { resolveConflict } from "./conflict.js";
import type { ConflictStrategy } from "./conflict.js";
import {
  buildConflictPath,
  buildConflictId,
  readShortMachineId,
  writeConflictFile,
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
 */
export type SyncProgressEvent =
  | { type: "progress"; path: string; bytes: number; message?: string }
  | { type: "error"; path: string; message: string }
  /**
   * Lineage detected divergence — the cloud's VersionId chain doesn't
   * include our last-known parent. Both versions are now on disk: the
   * original path holds the local (push) or pre-existing (pull) bytes,
   * and `conflictPath` holds the cloud bytes. The user resolves later
   * via the `/resolve-conflicts` HQ skill.
   */
  | {
      type: "conflict-detected";
      path: string;
      conflictPath: string;
      side: "push" | "pull";
      remoteVersionId: string;
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

    const journalEntry = getEntry(journal, remoteFile.key);
    const lineageActive =
      journalEntry !== undefined &&
      journalEntry.s3VersionId !== undefined &&
      journalEntry.s3VersionId !== null;

    // Fast path: brand-new file or no prior sync record. No conflict possible.
    if (!fs.existsSync(localPath) || !journalEntry) {
      const downloadOutcome = await tryDownload(remoteFile.key);
      if (downloadOutcome === "abort") {
        writeJournal(journalSlug, journal);
        return { filesDownloaded, bytesDownloaded, filesSkipped, conflicts, aborted: true };
      }
      continue;
    }

    const localHash = hashFile(localPath);

    if (lineageActive) {
      // Lineage path: cloud's VersionId chain is the source of truth for
      // divergence. We don't trust hashes alone (a 3-way edit cycle could
      // produce matching hashes on different lineages).
      const lastKnownVersionId = journalEntry.s3VersionId!;

      // Cheap pre-filter: if remote's lastModified is older than our last
      // sync AND local hash matches journal hash, nothing changed.
      const lastSyncTime = new Date(journalEntry.syncedAt).getTime();
      const remoteModTime = remoteFile.lastModified.getTime();
      if (
        journalEntry.hash === localHash &&
        remoteModTime <= lastSyncTime
      ) {
        filesSkipped++;
        continue;
      }

      // Need cloud's current VersionId to compare. ListObjectsV2 doesn't
      // include it, so HEAD here. Cost is one HEAD per file that *might*
      // have changed — files we already pre-filtered as unchanged skip it.
      let remoteHead: Awaited<ReturnType<typeof headRemoteFile>>;
      try {
        remoteHead = await headRemoteFile(ctx, remoteFile.key);
      } catch (err) {
        if (isAccessDenied(err)) {
          filesSkipped++;
          continue;
        }
        throw err;
      }
      if (!remoteHead) {
        // Remote file gone between LIST and HEAD (rare). Skip — delete
        // semantics are out of scope for this iteration.
        filesSkipped++;
        continue;
      }

      // Cloud hasn't actually moved — false alarm from the timestamp filter.
      // Stamp the no-op so future syncs short-circuit even quicker.
      if (remoteHead.versionId === lastKnownVersionId) {
        if (journalEntry.hash !== localHash) {
          // Local has uncommitted edits, cloud unchanged — pure pending-push,
          // not a pull-side conflict. Leave for share() to handle.
        }
        filesSkipped++;
        continue;
      }

      // Cloud advanced. Walk its version chain to determine fast-forward
      // vs divergence.
      let versionChain: string[];
      try {
        versionChain = await listObjectVersions(ctx, remoteFile.key, 100);
      } catch (err) {
        emit({
          type: "error",
          path: remoteFile.key,
          message: `version chain walk failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      const isFastForward = versionChain.includes(lastKnownVersionId);

      if (isFastForward && journalEntry.hash === localHash) {
        // Pure fast-forward, no local edits → safe to overwrite local with cloud.
        const downloadOutcome = await tryDownload(remoteFile.key);
        if (downloadOutcome === "abort") {
          writeJournal(journalSlug, journal);
          return { filesDownloaded, bytesDownloaded, filesSkipped, conflicts, aborted: true };
        }
        continue;
      }

      // Either (a) cloud diverged from our parent, or (b) cloud fast-forwarded
      // but local also has uncommitted edits. Both are conflicts — record
      // both sides, never overwrite.
      conflicts++;
      await recordPullConflict({
        ctx,
        hqRoot,
        remoteKey: remoteFile.key,
        companySlug: ctx.slug,
        personalMode: options.personalMode === true,
        localHash,
        remoteVersionId: remoteHead.versionId ?? "",
        lastKnownVersionId,
        emit,
      });
      filesSkipped++;
      continue;
    }

    // Degraded path: pre-lineage journal entry (no s3VersionId). Falls back
    // to the legacy timestamp + interactive-prompt flow. The first successful
    // download stamps s3VersionId and activates lineage from then on.
    if (journalEntry.hash !== localHash) {
      conflicts++;
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

      if (resolution === "abort") {
        writeJournal(journalSlug, journal);
        return { filesDownloaded, bytesDownloaded, filesSkipped, conflicts, aborted: true };
      }
      if (resolution === "keep" || resolution === "skip") {
        filesSkipped++;
        continue;
      }
      // "overwrite" falls through
    } else {
      // Local unchanged — only download if remote moved (legacy logic).
      const lastSyncTime = new Date(journalEntry.syncedAt).getTime();
      const remoteModTime = remoteFile.lastModified.getTime();
      if (remoteModTime <= lastSyncTime) {
        filesSkipped++;
        continue;
      }
    }

    const downloadOutcome = await tryDownload(remoteFile.key);
    if (downloadOutcome === "abort") {
      writeJournal(journalSlug, journal);
      return { filesDownloaded, bytesDownloaded, filesSkipped, conflicts, aborted: true };
    }
  }

  writeJournal(journalSlug, journal);

  return { filesDownloaded, bytesDownloaded, filesSkipped, conflicts, aborted: false };

  // Inner closure: download + journal stamp + emit. Closes over `ctx`,
  // `journal`, `companyRoot`, `journalSlug`, the counters, and `emit`. Keeps
  // the four call sites (new file, fast-forward, degraded overwrite, legacy
  // refresh) DRY without leaking journal-write details into the main loop.
  async function tryDownload(key: string): Promise<"ok" | "abort" | "error"> {
    const localPath = path.join(companyRoot, key);
    try {
      const result = await downloadFile(ctx, key, localPath);
      const hash = hashFile(localPath);
      const stat = fs.statSync(localPath);
      updateEntry(journal, key, hash, stat.size, "down", result.versionId);

      const journalMessage = (journal.files[key] as { message?: string } | undefined)?.message;
      emit({
        type: "progress",
        path: key,
        bytes: stat.size,
        ...(journalMessage ? { message: journalMessage } : {}),
      });

      filesDownloaded++;
      bytesDownloaded += stat.size;
      return "ok";
    } catch (err) {
      if (isAccessDenied(err)) {
        filesSkipped++;
        return "ok";
      }
      emit({
        type: "error",
        path: key,
        message: err instanceof Error ? err.message : String(err),
      });
      return "error";
    }
  }
}

/**
 * Pull detected divergence — the cloud's VersionId chain doesn't include
 * our last-known parent (or cloud is fast-forward but local has uncommitted
 * edits). Fetch cloud bytes, write to a `.conflict-` file next to the
 * original, append to the conflict index, emit event.
 *
 * Local file is NOT modified. The user resolves later via the
 * `/resolve-conflicts` skill.
 */
async function recordPullConflict(args: {
  ctx: import("../types.js").EntityContext;
  hqRoot: string;
  remoteKey: string;
  companySlug: string;
  personalMode: boolean;
  localHash: string;
  remoteVersionId: string;
  lastKnownVersionId: string;
  emit: (event: SyncProgressEvent) => void;
}): Promise<void> {
  const {
    ctx,
    hqRoot,
    remoteKey,
    companySlug,
    personalMode,
    localHash,
    remoteVersionId,
    lastKnownVersionId,
    emit,
  } = args;

  // Personal mode keys are HQ-relative; company keys live under
  // companies/<slug>/. Conflict files always sit next to the original on
  // disk — translate the S3 key to the HQ-relative path.
  const hqRelativeOriginal = personalMode
    ? remoteKey
    : path.join("companies", companySlug, remoteKey);
  const detectedAt = new Date().toISOString();
  const machineId = readShortMachineId();

  let cloudBytes: Buffer;
  let cloudVersionId: string | null;
  try {
    const fetched = await downloadFileBytes(ctx, remoteKey);
    cloudBytes = fetched.bytes;
    cloudVersionId = fetched.versionId;
  } catch (err) {
    emit({
      type: "error",
      path: remoteKey,
      message: `conflict detected but cloud fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  const conflictRelative = buildConflictPath(hqRelativeOriginal, detectedAt, machineId);
  writeConflictFile(hqRoot, conflictRelative, cloudBytes);

  const remoteHash = crypto.createHash("sha256").update(cloudBytes).digest("hex");

  appendConflictEntry(hqRoot, {
    id: buildConflictId(hqRelativeOriginal, detectedAt),
    originalPath: hqRelativeOriginal,
    conflictPath: conflictRelative,
    detectedAt,
    side: "pull",
    machineId,
    localHash,
    remoteHash,
    remoteVersionId: cloudVersionId ?? remoteVersionId,
    lastKnownVersionId,
  });

  emit({
    type: "conflict-detected",
    path: remoteKey,
    conflictPath: conflictRelative,
    side: "pull",
    remoteVersionId: cloudVersionId ?? remoteVersionId,
  });
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
  } else if (event.type === "conflict-detected") {
    console.error(
      `  ! conflict: ${event.path} — cloud version saved as ${event.conflictPath}`,
    );
  } else if (event.type === "error") {
    console.error(`  ✗ ${event.path} — ${event.message}`);
  }
}
