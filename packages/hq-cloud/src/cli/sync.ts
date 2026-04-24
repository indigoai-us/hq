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
import { readJournal, writeJournal, hashFile, updateEntry, getEntry } from "../journal.js";
import { createIgnoreFilter } from "../ignore.js";
import { resolveConflict } from "./conflict.js";
import type { ConflictStrategy } from "./conflict.js";

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
  | { type: "error"; path: string; message: string };

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
  const companyRoot = path.join(hqRoot, "companies", ctx.slug);
  const shouldSync = createIgnoreFilter(hqRoot);
  const journal = readJournal(ctx.slug);

  let filesDownloaded = 0;
  let bytesDownloaded = 0;
  let filesSkipped = 0;
  let conflicts = 0;

  // List all remote files (IAM session policy filters at the AWS layer)
  const remoteFiles = await listRemoteFiles(ctx);

  for (const remoteFile of remoteFiles) {
    const localPath = path.join(companyRoot, remoteFile.key);

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

      // If local file has changed since last sync, it's a conflict
      if (journalEntry && journalEntry.hash !== localHash) {
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
          writeJournal(ctx.slug, journal);
          return { filesDownloaded, bytesDownloaded, filesSkipped, conflicts, aborted: true };
        }
        if (resolution === "keep" || resolution === "skip") {
          filesSkipped++;
          continue;
        }
        // "overwrite" falls through to download
      } else if (journalEntry && journalEntry.hash === localHash) {
        // Local unchanged since last sync — check if remote changed
        // by comparing etag/timestamp
        const lastSyncTime = new Date(journalEntry.syncedAt).getTime();
        const remoteModTime = remoteFile.lastModified.getTime();
        if (remoteModTime <= lastSyncTime) {
          // Remote hasn't changed either — skip
          filesSkipped++;
          continue;
        }
      }
    }

    // Download
    try {
      await downloadFile(ctx, remoteFile.key, localPath);

      const hash = hashFile(localPath);
      const stat = fs.statSync(localPath);
      updateEntry(journal, remoteFile.key, hash, stat.size, "down");

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

  writeJournal(ctx.slug, journal);

  return { filesDownloaded, bytesDownloaded, filesSkipped, conflicts, aborted: false };
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
  } else if (event.type === "error") {
    console.error(`  ✗ ${event.path} — ${event.message}`);
  }
}
