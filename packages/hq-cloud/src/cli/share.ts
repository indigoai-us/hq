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
  const { paths, company, message, onConflict, vaultConfig, hqRoot } = options;

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
  const shouldSync = createIgnoreFilter(hqRoot);
  const journal = readJournal(hqRoot);

  let filesUploaded = 0;
  let bytesUploaded = 0;
  let filesSkipped = 0;

  // Collect all files to share
  const filesToShare = collectFiles(paths, hqRoot, shouldSync);

  for (const { absolutePath, relativePath } of filesToShare) {
    if (!isWithinSizeLimit(absolutePath)) {
      console.error(`  Skipped (too large): ${relativePath}`);
      filesSkipped++;
      continue;
    }

    // Auto-refresh context if credentials expiring
    if (isExpiringSoon(ctx.expiresAt)) {
      ctx = await refreshEntityContext(companyRef, vaultConfig);
    }

    // Check for remote conflict — refuse to overwrite newer remote version
    const remoteMeta = await headRemoteFile(ctx, relativePath);
    if (remoteMeta) {
      const journalEntry = journal.files[relativePath];
      const localHash = hashFile(absolutePath);

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
      const hash = hashFile(absolutePath);

      await uploadFile(ctx, absolutePath, relativePath);

      // Update journal with optional message
      updateEntry(journal, relativePath, hash, stat.size, "up");
      if (message) {
        journal.files[relativePath] = {
          ...journal.files[relativePath],
          message,
        } as typeof journal.files[string] & { message: string };
      }

      filesUploaded++;
      bytesUploaded += stat.size;
      console.log(`  ✓ ${relativePath}`);
    } catch (err) {
      console.error(
        `  ✗ ${relativePath} — ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  writeJournal(hqRoot, journal);

  return { filesUploaded, bytesUploaded, filesSkipped, aborted: false };
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
 */
function collectFiles(
  paths: string[],
  hqRoot: string,
  filter: (p: string) => boolean,
): { absolutePath: string; relativePath: string }[] {
  const results: { absolutePath: string; relativePath: string }[] = [];

  for (const p of paths) {
    const absolutePath = path.isAbsolute(p) ? p : path.resolve(hqRoot, p);

    if (!fs.existsSync(absolutePath)) {
      console.error(`  Warning: ${p} does not exist, skipping.`);
      continue;
    }

    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      results.push(...walkDir(absolutePath, hqRoot, filter));
    } else if (stat.isFile()) {
      const relativePath = path.relative(hqRoot, absolutePath);
      if (filter(absolutePath)) {
        results.push({ absolutePath, relativePath });
      }
    }
  }

  return results;
}

function walkDir(
  dir: string,
  root: string,
  filter: (p: string) => boolean,
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
