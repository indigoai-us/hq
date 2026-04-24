/**
 * `hq share` command — selective push to entity vault (VLT-5 US-002).
 *
 * Broadcasts local file(s) to the company's S3 vault bucket.
 * Refuses to overwrite a newer remote version without prompting.
 */

import * as fs from "fs";
import * as path from "path";
import type { VaultServiceConfig } from "../types.js";
import { resolveEntityContext, isExpiringSoon, refreshEntityContext } from "../context.js";
import { uploadFile, headRemoteFile } from "../s3.js";
import { readJournal, writeJournal, hashFile, updateEntry } from "../journal.js";
import { createIgnoreFilter, isWithinSizeLimit } from "../ignore.js";
import { resolveConflict } from "./conflict.js";
import type { ConflictStrategy } from "./conflict.js";
import type { SyncProgressEvent } from "./sync.js";

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

    // Check for remote conflict — refuse to overwrite newer remote version
    const remoteMeta = await headRemoteFile(ctx, relativePath);
    if (remoteMeta) {
      const journalEntry = journal.files[relativePath];

      // If remote has changed since our last sync, it's a conflict
      if (journalEntry && journalEntry.hash !== localHash) {
        // Local has changes — check if remote also changed
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

    // Upload
    try {
      const stat = fs.statSync(absolutePath);

      await uploadFile(ctx, absolutePath, relativePath);

      // Update journal with optional message
      updateEntry(journal, relativePath, localHash, stat.size, "up");
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

  return { filesUploaded, bytesUploaded, filesSkipped, aborted: false };
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
