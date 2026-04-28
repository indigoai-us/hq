/**
 * Conflict file naming + writing.
 *
 * When share/sync detects divergence, the cloud's version of the file is
 * written next to the original with a name encoding the timestamp and the
 * machine that detected the conflict. Lets multiple machines independently
 * surface their own conflicts without name collisions, and lets the user
 * (or the `/resolve-conflicts` HQ skill) see local + cloud side-by-side
 * in their file browser.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Path to `~/.hq/menubar.json`. Evaluated lazily at call time (not module
 * load) so that tests overriding `HOME` after import — and any future code
 * that changes the user's effective home dir at runtime — see the right
 * file. Going through `os.homedir()` rather than `process.env.HOME` keeps
 * the Windows USERPROFILE fallback intact.
 */
function menubarJsonPath(): string {
  return path.join(os.homedir(), ".hq", "menubar.json");
}

/**
 * Read the short machine ID (first 6 chars) from `~/.hq/menubar.json`.
 * Falls back to "unknown" if the file is missing/unreadable — conflict
 * files should still be written even when machine identity is unclear.
 */
export function readShortMachineId(): string {
  try {
    const raw = fs.readFileSync(menubarJsonPath(), "utf-8");
    const parsed = JSON.parse(raw);
    const id = typeof parsed.machineId === "string" ? parsed.machineId : "";
    return id.slice(0, 6) || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Build the conflict file path for an original. ISO uses `-` instead of
 * `:` so the result is filesystem-safe on every OS, and the original
 * extension is preserved at the end so editors syntax-highlight correctly.
 *
 *   knowledge/notes.md, 2026-04-27T22:05:14Z, abc123
 *     → knowledge/notes.md.conflict-2026-04-27T22-05-14Z-abc123.md
 *
 *   projects/foo/prd.json, ..., abc123
 *     → projects/foo/prd.json.conflict-...-abc123.json
 *
 * Files without an extension get the `.conflict-...` suffix appended verbatim.
 */
export function buildConflictPath(
  originalRelative: string,
  detectedAt: string,
  shortMachineId: string,
): string {
  const safeTs = detectedAt.replace(/:/g, "-").replace(/\.\d+/, "");
  const ext = path.extname(originalRelative); // ".md" or "" if none
  // The full original path is preserved (extension and all) so users can
  // visually pair `notes.md` with `notes.md.conflict-…md` in their file
  // browser. The trailing `<ext>` after the timestamp keeps the file
  // syntax-highlighted in editors that key off the final extension.
  const suffix = `.conflict-${safeTs}-${shortMachineId}${ext}`;
  return `${originalRelative}${suffix}`;
}

/**
 * Write the cloud-side bytes to the conflict path. Creates parent dirs as
 * needed (the conflict file always lives next to the original, so the
 * parent already exists in the steady-state — but defense-in-depth).
 */
export function writeConflictFile(
  hqRoot: string,
  conflictRelative: string,
  contents: Buffer,
): void {
  const abs = path.join(hqRoot, conflictRelative);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

/**
 * Stable conflict ID — used to dedupe re-detections of the same conflict.
 * Re-running sync after a conflict but before the user has resolved should
 * NOT pile up duplicate entries. The id is derived from the original path
 * and the detection timestamp; if the same original conflicts twice with
 * the user resolving in between, that's a new id (different timestamp),
 * which is correct.
 */
export function buildConflictId(
  originalRelative: string,
  detectedAt: string,
): string {
  const safeTs = detectedAt.replace(/:/g, "-").replace(/\.\d+/, "");
  const safePath = originalRelative.replace(/[\/\\.]/g, "-");
  return `${safePath}-${safeTs}`;
}
