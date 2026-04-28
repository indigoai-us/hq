/**
 * `hq share` command — selective push to entity vault (VLT-5 US-002).
 *
 * Broadcasts local file(s) to the company's S3 vault bucket.
 * Refuses to overwrite a newer remote version without prompting.
 */

import * as fs from "fs";
import * as path from "path";
import type { VaultServiceConfig, SyncJournal } from "../types.js";
import { resolveEntityContext, isExpiringSoon, refreshEntityContext } from "../context.js";
import { uploadFile, headRemoteFile } from "../s3.js";
import { readJournal, writeJournal, hashFile, updateEntry, normalizeEtag } from "../journal.js";
import { createIgnoreFilter, isWithinSizeLimit } from "../ignore.js";
import { resolveConflict } from "./conflict.js";
import type { ConflictStrategy } from "./conflict.js";
import type { SyncProgressEvent } from "./sync.js";

/**
 * Stage-1 classification for a single local file in a push run. Pre-HEAD —
 * only inputs we can evaluate locally (size limit, journal hash, optional
 * skip-unchanged) determine the action. Files that pass classification as
 * `upload` are still subject to a per-file HEAD + 3-way conflict check in
 * Stage 2 before the actual PUT, so the `filesToUpload` count in the plan
 * event is an upper bound: it includes files that may turn out to be
 * conflicts. V1.5 follow-up: replace per-file HEAD with a single LIST so
 * conflicts can be classified up-front and reported in the plan.
 */
type PushPlanItem =
  | {
      action: "upload";
      absolutePath: string;
      relativePath: string;
      localHash: string;
      size: number;
    }
  | {
      action: "skip-size-limit";
      absolutePath: string;
      relativePath: string;
    }
  | {
      action: "skip-unchanged";
      absolutePath: string;
      relativePath: string;
    };

interface PushPlan {
  items: PushPlanItem[];
  filesToUpload: number;
  bytesToUpload: number;
  filesToSkip: number;
}

/**
 * Pure Stage-1 pass for push: walk the candidate file list, hash each one,
 * apply the size-limit and skip-unchanged gates, and return a classified
 * plan plus aggregate counts. No S3 calls, no journal writes, no event
 * emission.
 *
 * The conflict count is intentionally absent from the returned `PushPlan` —
 * detecting a push conflict requires a remote HEAD that we defer to Stage 2.
 * Consumers that want a conflict count get it from the `complete` event.
 */
function computePushPlan(
  filesToShare: { absolutePath: string; relativePath: string }[],
  journal: SyncJournal,
  skipUnchanged: boolean,
): PushPlan {
  const items: PushPlanItem[] = [];

  for (const { absolutePath, relativePath } of filesToShare) {
    if (!isWithinSizeLimit(absolutePath)) {
      items.push({ action: "skip-size-limit", absolutePath, relativePath });
      continue;
    }

    const localHash = hashFile(absolutePath);

    if (skipUnchanged) {
      const existing = journal.files[relativePath];
      if (existing && existing.hash === localHash) {
        items.push({ action: "skip-unchanged", absolutePath, relativePath });
        continue;
      }
    }

    const size = fs.statSync(absolutePath).size;
    items.push({
      action: "upload",
      absolutePath,
      relativePath,
      localHash,
      size,
    });
  }

  let filesToUpload = 0;
  let bytesToUpload = 0;
  let filesToSkip = 0;
  for (const item of items) {
    if (item.action === "upload") {
      filesToUpload++;
      bytesToUpload += item.size;
    } else {
      filesToSkip++;
    }
  }

  return { items, filesToUpload, bytesToUpload, filesToSkip };
}

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
  /**
   * Paths (company-relative) that were detected as push conflicts. Mirrors
   * `SyncResult.conflictPaths` so push and pull surface conflicts the same
   * way to runner/UI consumers.
   */
  conflictPaths: string[];
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
  const conflictPaths: string[] = [];

  // Collect all files to share
  const filesToShare = collectFiles(paths, hqRoot, syncRoot, shouldSync);

  // Stage 1: classify each file. Pre-HEAD — only inputs we can evaluate
  // locally (size limit, journal hash, optional skip-unchanged) are
  // considered. The plan event below carries an upper-bound `filesToUpload`
  // (true conflicts emerge from the per-file HEAD in Stage 2 and aren't
  // knowable here). The final `complete` event reports authoritative counts.
  const plan = computePushPlan(filesToShare, journal, skipUnchanged === true);

  emit({
    type: "plan",
    // share() is push-only; pull counts are sourced from sync()'s plan event.
    filesToDownload: 0,
    bytesToDownload: 0,
    filesToUpload: plan.filesToUpload,
    bytesToUpload: plan.bytesToUpload,
    filesToSkip: plan.filesToSkip,
    // Push conflicts require a remote HEAD; we don't yet do that in Stage 1,
    // so this stays 0. V1.5 (single LIST) will let us classify them up-front.
    filesToConflict: 0,
  });

  // Stage 2: execute. Skip items pre-classified as no-ops, then for each
  // upload candidate run the HEAD + 3-way conflict check + actual PUT.
  for (const item of plan.items) {
    if (item.action === "skip-size-limit") {
      emit({
        type: "error",
        path: item.relativePath,
        message: "file exceeds size limit",
      });
      filesSkipped++;
      continue;
    }
    if (item.action === "skip-unchanged") {
      filesSkipped++;
      continue;
    }

    const { absolutePath, relativePath, localHash } = item;

    // Auto-refresh context if credentials expiring
    if (isExpiringSoon(ctx.expiresAt)) {
      ctx = await refreshEntityContext(companyRef, vaultConfig);
    }

    // Check for remote conflict — refuse to overwrite newer remote version.
    //
    // A real conflict requires BOTH sides to have moved since the last sync.
    // The previous predicate only checked `journalEntry.hash !== localHash`,
    // which mislabelled every local edit as a conflict and (combined with
    // `--on-conflict keep`) silently dropped the user's edit. We now compare
    // the current remote ETag against the one captured at last sync; when
    // missing (legacy entries), we fall back to the same `lastModified >
    // syncedAt` heuristic the pull side uses.
    const remoteMeta = await headRemoteFile(ctx, relativePath);
    if (remoteMeta) {
      const journalEntry = journal.files[relativePath];
      const localChanged = !!journalEntry && journalEntry.hash !== localHash;
      const remoteChanged = !!journalEntry && hasRemoteChanged(remoteMeta, journalEntry);

      if (localChanged && remoteChanged) {
        conflictPaths.push(relativePath);

        const resolution = await resolveConflict(
          {
            path: relativePath,
            localHash,
            remoteModified: remoteMeta.lastModified,
            direction: "push",
          },
          onConflict,
        );

        emit({
          type: "conflict",
          path: relativePath,
          direction: "push",
          resolution,
        });

        if (resolution === "abort") {
          return {
            filesUploaded,
            bytesUploaded,
            filesSkipped,
            conflictPaths,
            aborted: true,
          };
        }
        if (resolution === "keep" || resolution === "skip") {
          filesSkipped++;
          continue;
        }
        // "overwrite" falls through to upload
      }
    }

    // Upload
    try {
      const stat = fs.statSync(absolutePath);

      const { etag } = await uploadFile(ctx, absolutePath, relativePath);

      // Update journal with optional message; capture the post-upload ETag
      // so the next sync can distinguish "remote moved since we last wrote"
      // from "user edited locally" without conflating the two.
      updateEntry(journal, relativePath, localHash, stat.size, "up", etag);
      if (message) {
        journal.files[relativePath] = {
          ...journal.files[relativePath],
          message,
        } as typeof journal.files[string] & { message: string };
      }

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

  return {
    filesUploaded,
    bytesUploaded,
    filesSkipped,
    conflictPaths,
    aborted: false,
  };
}

/**
 * Default human-readable share output. Preserves the exact format the CLI
 * emitted before `onEvent` was added — tty users see no change.
 */
function defaultConsoleLogger(event: SyncProgressEvent): void {
  if (event.type === "plan") {
    if (event.filesToUpload > 0) {
      console.log(
        `Plan: ${event.filesToUpload} to upload (${event.bytesToUpload} bytes), ${event.filesToSkip} unchanged`,
      );
    }
  } else if (event.type === "progress") {
    if (event.message) {
      console.log(`  ✓ ${event.path} — "${event.message}"`);
    } else {
      console.log(`  ✓ ${event.path}`);
    }
  } else if (event.type === "conflict") {
    console.error(
      `  ⚠ conflict (${event.direction}): ${event.path} — ${event.resolution}`,
    );
  } else if (event.type === "error") {
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

/**
 * Returns true when the remote object appears to have moved since the
 * journal entry's last-recorded sync. Prefers ETag equality; falls back to
 * `lastModified > syncedAt` for legacy entries written before remoteEtag
 * was tracked. Conservative on tie (`<=` skews "remote unchanged") so an
 * S3-side mtime that exactly equals our syncedAt is not treated as drift.
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
