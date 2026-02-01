/**
 * Sync journal — tracks file state for conflict detection
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { SyncJournal, JournalEntry } from "./types.js";

const JOURNAL_FILE = ".hq-sync-journal.json";

export function getJournalPath(hqRoot: string): string {
  return path.join(hqRoot, JOURNAL_FILE);
}

export function readJournal(hqRoot: string): SyncJournal {
  const journalPath = getJournalPath(hqRoot);
  if (fs.existsSync(journalPath)) {
    const content = fs.readFileSync(journalPath, "utf-8");
    return JSON.parse(content) as SyncJournal;
  }
  return { version: "1", lastSync: "", files: {} };
}

export function writeJournal(hqRoot: string, journal: SyncJournal): void {
  const journalPath = getJournalPath(hqRoot);
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
  direction: "up" | "down"
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
  relativePath: string
): JournalEntry | undefined {
  return journal.files[relativePath];
}

export function removeEntry(
  journal: SyncJournal,
  relativePath: string
): void {
  delete journal.files[relativePath];
}
