/**
 * Conflict index — durable record of pending divergences awaiting resolution.
 *
 * Lives at `<hq_root>/.hq-conflicts/index.json` (inside HQ content, NOT in
 * `~/.hq/`). Two reasons it sits in HQ content rather than in the state dir:
 *   1. The `/resolve-conflicts` HQ skill discovers it relative to the user's
 *      HQ folder — that's the user's mental anchor for "where my files are."
 *   2. The conflict-side files themselves live in HQ content, so the index
 *      and the files it references stay co-located. If the user moves HQ,
 *      the index moves with it.
 *
 * Excluded from cross-machine sync via `.hqignore` — each machine resolves
 * its own queue. We never propagate conflict files (they'd just create more
 * conflicts on the other side).
 *
 * Writes are atomic (tmp + rename). The resolution skill mutates this file
 * mid-walk; a torn write would corrupt the only record of pending conflicts
 * and could lose track of files we'd written to disk. Higher stakes than the
 * journal, which the next sync can rebuild.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { ConflictIndex, ConflictIndexEntry } from "../types.js";

const CONFLICTS_DIR = ".hq-conflicts";
const INDEX_FILENAME = "index.json";

/**
 * Absolute path to the conflict index for a given HQ root.
 */
export function getConflictIndexPath(hqRoot: string): string {
  return path.join(hqRoot, CONFLICTS_DIR, INDEX_FILENAME);
}

/**
 * Read the conflict index. Returns an empty index if the file doesn't exist
 * yet (first-conflict-ever case).
 *
 * Throws on corrupt JSON — we deliberately don't auto-repair, since the only
 * record of pending conflicts is too important to silently overwrite. The
 * `/resolve-conflicts` skill surfaces this case to the user with a manual
 * inspection prompt.
 */
export function readConflictIndex(hqRoot: string): ConflictIndex {
  const indexPath = getConflictIndexPath(hqRoot);
  if (!fs.existsSync(indexPath)) {
    return { version: 1, conflicts: [] };
  }
  const raw = fs.readFileSync(indexPath, "utf-8");
  const parsed = JSON.parse(raw) as ConflictIndex;
  // Defensive: an empty file or wrong-shape JSON shouldn't crash callers.
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.conflicts)) {
    return { version: 1, conflicts: [] };
  }
  return parsed;
}

/**
 * Atomically write the conflict index. Writes to `<index>.tmp.<random>` then
 * renames into place — `rename(2)` is atomic on POSIX, so a crash mid-write
 * leaves either the old file or the new one, never a half-written one.
 *
 * Always sorts conflicts by `detectedAt` ascending before writing — keeps
 * the file diff-friendly across runs and makes "oldest-first walk" the
 * natural read order in the resolution skill.
 */
export function writeConflictIndex(
  hqRoot: string,
  index: ConflictIndex,
): void {
  const indexPath = getConflictIndexPath(hqRoot);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });

  const sorted: ConflictIndex = {
    version: index.version,
    conflicts: [...index.conflicts].sort((a, b) =>
      a.detectedAt.localeCompare(b.detectedAt),
    ),
  };

  // Random suffix in tmp name avoids collision if two sync runs ever overlap
  // (shouldn't happen — the runner serializes — but cheap insurance).
  const tmpPath = `${indexPath}.tmp.${crypto.randomBytes(6).toString("hex")}`;
  fs.writeFileSync(tmpPath, JSON.stringify(sorted, null, 2));
  fs.renameSync(tmpPath, indexPath);
}

/**
 * Idempotent append. If an entry with the same `id` already exists (same
 * original path, same detection timestamp), update it in place rather than
 * duplicating. This matters because re-running sync after a conflict but
 * before resolution will re-detect the same divergence — without dedup the
 * index would grow unboundedly.
 *
 * The "update in place" path also covers the case where the cloud advanced
 * again between detections: we want the latest `remoteVersionId` and
 * `remoteHash` so the resolution skill shows the user the *current* cloud
 * state, not stale data from the first detection.
 */
export function appendConflictEntry(
  hqRoot: string,
  entry: ConflictIndexEntry,
): void {
  const index = readConflictIndex(hqRoot);
  const existingIdx = index.conflicts.findIndex((c) => c.id === entry.id);
  if (existingIdx >= 0) {
    index.conflicts[existingIdx] = entry;
  } else {
    index.conflicts.push(entry);
  }
  writeConflictIndex(hqRoot, index);
}

/**
 * Remove an entry by id. Used by the `/resolve-conflicts` skill after the
 * user picks a resolution and the conflict file is cleaned up. No-op if the
 * id isn't present (e.g. user manually removed the file then re-ran the
 * skill — we want that to be a clean exit, not an error).
 */
export function removeConflictEntry(hqRoot: string, id: string): void {
  const index = readConflictIndex(hqRoot);
  const filtered = index.conflicts.filter((c) => c.id !== id);
  if (filtered.length === index.conflicts.length) return;
  writeConflictIndex(hqRoot, { version: index.version, conflicts: filtered });
}
