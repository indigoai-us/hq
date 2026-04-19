/**
 * Sync journal — tracks per-file state (hash, size, last-synced direction) so
 * sync/share can detect local edits that would be clobbered by a blind pull.
 *
 * ADR-0001 Phase 5: the journal is sharded by company slug and lives in
 * `~/.hq/`, not inside the HQ content root. One monolithic journal per HQ
 * install conflates state across companies and forces every runner to
 * serialize through the same file — splitting it lets `hq-sync-runner
 * --companies` fan out without contention, and a corrupted shard only affects
 * one company.
 *
 * Path: `{stateDir}/sync-journal.{slug}.json`, where `stateDir` resolves to
 * `HQ_STATE_DIR` (if set) or `~/.hq`.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import type { SyncJournal, JournalEntry } from "./types.js";

const JOURNAL_FILE_PREFIX = "sync-journal.";
const JOURNAL_FILE_SUFFIX = ".json";

/**
 * Where per-company journals are stored. Honors `HQ_STATE_DIR` for tests and
 * non-standard installs; otherwise falls back to `~/.hq`.
 */
export function getStateDir(): string {
  return process.env.HQ_STATE_DIR ?? path.join(os.homedir(), ".hq");
}

/**
 * Filename-safe form of a slug. Slugs from vault-service are already
 * URL-safe, but this guards against paths, dots, or anything the filesystem
 * might interpret. Empty-or-invalid slugs throw rather than silently writing
 * to a shared "sync-journal..json" file.
 */
function sanitizeSlug(slug: string): string {
  if (!slug) {
    throw new Error("journal: slug is required (empty or undefined)");
  }
  const cleaned = slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!cleaned || /^[_-]+$/.test(cleaned)) {
    throw new Error(`journal: slug "${slug}" sanitizes to an empty identifier`);
  }
  return cleaned;
}

export function getJournalPath(slug: string): string {
  return path.join(
    getStateDir(),
    `${JOURNAL_FILE_PREFIX}${sanitizeSlug(slug)}${JOURNAL_FILE_SUFFIX}`,
  );
}

export function readJournal(slug: string): SyncJournal {
  const journalPath = getJournalPath(slug);
  if (fs.existsSync(journalPath)) {
    const content = fs.readFileSync(journalPath, "utf-8");
    return JSON.parse(content) as SyncJournal;
  }
  return { version: "1", lastSync: "", files: {} };
}

export function writeJournal(slug: string, journal: SyncJournal): void {
  const journalPath = getJournalPath(slug);
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
}

export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function updateEntry(
  journal: SyncJournal,
  relativePath: string,
  hash: string,
  size: number,
  direction: "up" | "down",
): void {
  journal.files[relativePath] = {
    hash,
    size,
    syncedAt: new Date().toISOString(),
    direction,
  };
  journal.lastSync = new Date().toISOString();
}

export function getEntry(
  journal: SyncJournal,
  relativePath: string,
): JournalEntry | undefined {
  return journal.files[relativePath];
}

export function removeEntry(
  journal: SyncJournal,
  relativePath: string,
): void {
  delete journal.files[relativePath];
}
