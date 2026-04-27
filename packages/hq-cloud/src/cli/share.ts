/**
 * `hq share` command — selective push to entity vault (VLT-5 US-002).
 *
 * Broadcasts local file(s) to the company's S3 vault bucket.
 * Refuses to overwrite a newer remote version without prompting.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { VaultServiceConfig } from "../types.js";
import { resolveEntityContext, isExpiringSoon, refreshEntityContext } from "../context.js";
import {
  uploadFile,
  headRemoteFile,
  downloadFileBytes,
  isPreconditionFailed,
} from "../s3.js";
import { readJournal, writeJournal, hashFile } from "../journal.js";
import { createIgnoreFilter, isWithinSizeLimit } from "../ignore.js";
import { resolveConflict } from "./conflict.js";
import type { ConflictStrategy } from "./conflict.js";
import type { SyncProgressEvent } from "./sync.js";
import {
  buildConflictPath,
  buildConflictId,
  readShortMachineId,
  writeConflictFile,
} from "../lib/conflict-file.js";
import { appendConflictEntry } from "../lib/conflict-index.js";

export interface ShareOptions {
  /** Path(s) to share (files or directories) */
  paths: string[];
  /** Company slug or UID (defaults to active company from config) */
  company?: string;
  /** Optional message attached to journal entries */
  message?: string;
  /** Non-interactive conflict strategy */
  onConflict?: ConflictStrategy;
  /** Vault service config */
  vaultConfig: VaultServiceConfig;
  /** HQ root directory */
  hqRoot: string;
  /**
   * Per-file event callback. When present, suppresses the default
   * `console.log`/`console.error` human output — same contract as `sync()`.
   * This is the seam `hq-sync-runner` uses to stream ndjson for push events.
   */
  onEvent?: (event: SyncProgressEvent) => void;
  /**
   * When true, files whose local hash matches the journal entry from the
   * last sync are skipped (no remote HEAD, no upload). This is the gate
   * that makes "push everything that changed" efficient — without it, a
   * bidirectional Sync Now would re-upload every file each tick.
   *
   * Default false to preserve `hq share <file>` semantics: when a user
   * explicitly names a file, they expect it to be sent even if the local
   * hash matches the last-sync state (e.g. to re-heal a bucket).
   */
  skipUnchanged?: boolean;
}

export interface ShareResult {
  filesUploaded: number;
  bytesUploaded: number;
  filesSkipped: number;
  aborted: boolean;
}

/**
 * Share local file(s) to the entity vault.
 */
export async function share(options: ShareOptions): Promise<ShareResult> {
  const { paths, company, message, onConflict, vaultConfig, hqRoot, skipUnchanged } = options;
  const emit = options.onEvent ?? defaultConsoleLogger;

  // Resolve company — slug, UID, or from active config
  const companyRef = company ?? resolveActiveCompany(hqRoot);
  if (!companyRef) {
    throw new Error(
      "No company specified and no active company found. " +
      "Use --company <slug> or set up .hq/config.json.",
    );
  }

  // Resolve entity context (handles STS vending + caching)
  let ctx = await resolveEntityContext(companyRef, vaultConfig);
  // Remote keys are company-relative; the on-disk scoping prefix is
  // companies/{slug}/. Anything outside this folder gets skipped to avoid
  // leaking cross-company state into the vault.
  const syncRoot = path.join(hqRoot, "companies", ctx.slug);
  const shouldSync = createIgnoreFilter(hqRoot);
  const journal = readJournal(ctx.slug);

  let filesUploaded = 0;
  let bytesUploaded = 0;
  let filesSkipped = 0;

  // Collect all files to share
  const filesToShare = collectFiles(paths, hqRoot, syncRoot, shouldSync);

  for (const { absolutePath, relativePath } of filesToShare) {
    if (!isWithinSizeLimit(absolutePath)) {
      emit({
        type: "error",
        path: relativePath,
        message: "file exceeds size limit",
      });
      filesSkipped++;
      continue;
    }

    // Skip-if-unchanged gate: the hot path for bidirectional Sync Now. When
    // walking an entire company folder, this is what keeps us from re-uploading
    // every file every tick. Off by default so `hq share <file>` keeps its
    // explicit-intent semantics (user named it, user wants it sent).
    const localHash = hashFile(absolutePath);
    if (skipUnchanged) {
      const existing = journal.files[relativePath];
      if (existing && existing.hash === localHash) {
        filesSkipped++;
        continue;
      }
    }

    // Auto-refresh context if credentials expiring
    if (isExpiringSoon(ctx.expiresAt)) {
      ctx = await refreshEntityContext(companyRef, vaultConfig);
    }

    const journalEntry = journal.files[relativePath];
    const lineageActive =
      journalEntry !== undefined &&
      journalEntry.s3VersionId !== undefined &&
      journalEntry.s3VersionId !== null;

    // Lineage-active path: optimistic concurrency via If-Match. The bucket's
    // VersionId chain is the parent pointer; if S3 rejects with 412, someone
    // else's push landed between our last sync and now. We never overwrite —
    // we record both versions and surface them to the user.
    if (lineageActive) {
      try {
        const stat = fs.statSync(absolutePath);
        const result = await uploadFile(ctx, absolutePath, relativePath, {
          ifMatch: journalEntry!.s3VersionId!,
        });

        // Successful push — stamp the new VersionId as our parent pointer.
        journal.files[relativePath] = {
          hash: localHash,
          size: stat.size,
          syncedAt: new Date().toISOString(),
          direction: "up",
          s3VersionId: result.versionId,
          ...(message ? { message } : {}),
        } as typeof journal.files[string];
        journal.lastSync = new Date().toISOString();

        filesUploaded++;
        bytesUploaded += stat.size;
        emit({
          type: "progress",
          path: relativePath,
          bytes: stat.size,
          ...(message ? { message } : {}),
        });
      } catch (err) {
        if (isPreconditionFailed(err)) {
          // Cloud has advanced past our last-known parent. Don't overwrite —
          // fetch the cloud version and write it as a `.conflict-` file
          // alongside the original. The user resolves later via the
          // /resolve-conflicts skill; the next sync re-tries with the
          // resolved hash.
          await recordPushConflict({
            ctx,
            hqRoot,
            relativePath,
            localHash,
            companySlug: ctx.slug,
            lastKnownVersionId: journalEntry!.s3VersionId!,
            emit,
          });
          filesSkipped++;
          continue;
        }
        emit({
          type: "error",
          path: relativePath,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    // Degraded / first-push path: no parent pointer yet (pre-lineage journal,
    // or the file was never synced). Falls back to the legacy "HEAD then
    // prompt" flow for hash-based conflict detection — same behavior as
    // before. The first successful push stamps s3VersionId, and every
    // subsequent push goes through the lineage-active branch above.
    const remoteMeta = await headRemoteFile(ctx, relativePath);
    if (remoteMeta) {
      // If remote has changed since our last sync, it's a conflict
      if (journalEntry && journalEntry.hash !== localHash) {
        const resolution = await resolveConflict(
          {
            path: relativePath,
            localHash,
            remoteModified: remoteMeta.lastModified,
            direction: "push",
          },
          onConflict,
        );

        if (resolution === "abort") {
          return { filesUploaded, bytesUploaded, filesSkipped, aborted: true };
        }
        if (resolution === "keep" || resolution === "skip") {
          filesSkipped++;
          continue;
        }
        // "overwrite" falls through to upload
      }
    }

    try {
      const stat = fs.statSync(absolutePath);

      const result = await uploadFile(ctx, absolutePath, relativePath);

      // Stamp s3VersionId on first sync — activates lineage from now on.
      journal.files[relativePath] = {
        hash: localHash,
        size: stat.size,
        syncedAt: new Date().toISOString(),
        direction: "up",
        s3VersionId: result.versionId,
        ...(message ? { message } : {}),
      } as typeof journal.files[string];
      journal.lastSync = new Date().toISOString();

      filesUploaded++;
      bytesUploaded += stat.size;
      emit({
        type: "progress",
        path: relativePath,
        bytes: stat.size,
        ...(message ? { message } : {}),
      });
    } catch (err) {
      emit({
        type: "error",
        path: relativePath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  writeJournal(ctx.slug, journal);

  return { filesUploaded, bytesUploaded, filesSkipped, aborted: false };
}

/**
 * Push detected divergence (412 from If-Match). Fetch the cloud's current
 * bytes, write them to a `.conflict-` file next to the original, append an
 * entry to the conflict index, and emit the event so the runner can update
 * its UI counter.
 *
 * Local file is left untouched. The user's edits are still safely on disk
 * at the original path; the cloud's version is what landed in the conflict
 * file.
 */
async function recordPushConflict(args: {
  ctx: import("../types.js").EntityContext;
  hqRoot: string;
  relativePath: string;
  localHash: string;
  companySlug: string;
  lastKnownVersionId: string;
  emit: (event: SyncProgressEvent) => void;
}): Promise<void> {
  const { ctx, hqRoot, relativePath, localHash, companySlug, lastKnownVersionId, emit } = args;

  // S3 keys are company-relative; the on-disk path is HQ-relative under
  // companies/<slug>/. Conflict files always live next to the original.
  const hqRelativeOriginal = path.join("companies", companySlug, relativePath);
  const detectedAt = new Date().toISOString();
  const machineId = readShortMachineId();

  let cloudBytes: Buffer;
  let cloudVersionId: string | null;
  try {
    const fetched = await downloadFileBytes(ctx, relativePath);
    cloudBytes = fetched.bytes;
    cloudVersionId = fetched.versionId;
  } catch (err) {
    // Couldn't fetch cloud bytes — emit error and bail. The journal entry
    // is left untouched so next sync re-tries (and re-conflicts cleanly).
    emit({
      type: "error",
      path: relativePath,
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
    side: "push",
    machineId,
    localHash,
    remoteHash,
    remoteVersionId: cloudVersionId ?? "",
    lastKnownVersionId,
  });

  emit({
    type: "conflict-detected",
    path: relativePath,
    conflictPath: conflictRelative,
    side: "push",
    remoteVersionId: cloudVersionId ?? "",
  });
}

/**
 * Default human-readable share output. Preserves the exact format the CLI
 * emitted before `onEvent` was added — tty users see no change.
 */
function defaultConsoleLogger(event: SyncProgressEvent): void {
  if (event.type === "progress") {
    if (event.message) {
      console.log(`  ✓ ${event.path} — "${event.message}"`);
    } else {
      console.log(`  ✓ ${event.path}`);
    }
  } else if (event.type === "conflict-detected") {
    // Surface conflicts visibly in tty output too — same pattern as the
    // runner's UI badge, but for direct CLI users.
    console.error(
      `  ! conflict: ${event.path} — cloud version saved as ${event.conflictPath}`,
    );
  } else {
    console.error(`  ✗ ${event.path} — ${event.message}`);
  }
}

/**
 * Resolve active company from .hq/config.json or parent directory chain.
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
 * Collect files from paths (expanding directories recursively).
 *
 * Remote S3 keys are computed relative to `syncRoot` (companies/{slug}/), not
 * `hqRoot`. Files outside `syncRoot` are skipped with a warning — sharing
 * anything outside a company's folder would leak state into the wrong vault.
 */
function collectFiles(
  paths: string[],
  hqRoot: string,
  syncRoot: string,
  filter: (p: string) => boolean,
): { absolutePath: string; relativePath: string }[] {
  const results: { absolutePath: string; relativePath: string }[] = [];

  for (const p of paths) {
    const absolutePath = path.isAbsolute(p) ? p : path.resolve(hqRoot, p);

    if (!fs.existsSync(absolutePath)) {
      console.error(`  Warning: ${p} does not exist, skipping.`);
      continue;
    }

    if (!isWithin(syncRoot, absolutePath)) {
      console.error(`  Warning: ${p} is outside company folder, skipping.`);
      continue;
    }

    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      results.push(...walkDir(absolutePath, syncRoot, filter));
    } else if (stat.isFile()) {
      const relativePath = path.relative(syncRoot, absolutePath);
      if (filter(absolutePath)) {
        results.push({ absolutePath, relativePath });
      }
    }
  }

  return results;
}

function walkDir(
  dir: string,
  syncRoot: string,
  filter: (p: string) => boolean,
): { absolutePath: string; relativePath: string }[] {
  const results: { absolutePath: string; relativePath: string }[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (!filter(absolutePath)) continue;

    if (entry.isDirectory()) {
      results.push(...walkDir(absolutePath, syncRoot, filter));
    } else if (entry.isFile()) {
      results.push({
        absolutePath,
        relativePath: path.relative(syncRoot, absolutePath),
      });
    }
  }

  return results;
}

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
