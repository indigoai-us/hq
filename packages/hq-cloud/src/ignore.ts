/**
 * Ignore-file parser for cloud sync.
 *
 * Three layers, evaluated in order (later patterns override earlier ones):
 *   1. Built-in defaults — things that should *never* sync (VCS, node_modules,
 *      build artifacts, caches, env files). Cover the common stacks so that a
 *      first-time sync over a random project folder doesn't try to push
 *      `target/`, `node_modules/`, or `.next/` to S3.
 *   2. Repo `.gitignore` at hqRoot — reuses the user's existing exclusions so
 *      we don't re-list every build directory ourselves. Root-level only; we
 *      do not recurse like real git.
 *   3. `.hqignore` (preferred) or `.hqsyncignore` (legacy name) at hqRoot —
 *      sync-specific overrides. Use `!pattern` to re-include something an
 *      earlier layer excluded.
 */

import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";

// Patterns that must never sync regardless of project type.
// Grouped by ecosystem so new stacks are easy to add.
export const DEFAULT_IGNORES = [
  // VCS + OS
  ".git/",
  ".git",
  ".DS_Store",
  "Thumbs.db",

  // Node / JS
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".turbo/",
  ".parcel-cache/",
  ".vite/",
  "coverage/",

  // Rust / Tauri
  "target/",

  // Python
  "__pycache__/",
  "*.pyc",
  ".pytest_cache/",
  ".mypy_cache/",
  ".ruff_cache/",
  ".venv/",
  "venv/",

  // Go / JVM / other
  "vendor/",
  "out/",
  "*.class",

  // Generic caches / temp
  ".cache/",
  "tmp/",
  ".tmp/",

  // HQ sync internal state (never round-trip these)
  "*.pid",
  ".hq-sync.pid",
  ".hq-sync-journal.json",
  ".hq-sync-state.json",
  "modules.lock",

  // Conflict files — local-only by design. Each machine resolves its own
  // queue; uploading a `.conflict-` file to the cloud would just create
  // more conflicts on the other side. Pattern matches:
  //   knowledge/notes.md.conflict-2026-04-27T22-05-14Z-abc123.md
  //   projects/foo/prd.json.conflict-2026-04-27T22-05-14Z-abc123.json
  "*.conflict-*-*.*",
  // Files with no extension still get the suffix (no trailing `.<ext>`):
  //   secrets.conflict-2026-04-27T22-05-14Z-abc123
  "*.conflict-*-*",
  // The conflict index dir itself — pending-conflict metadata, not user content.
  ".hq-conflicts/",

  // HQ repos directory (managed separately, not synced)
  "repos/",

  // Secrets / env
  ".env",
  ".env.*",
];

function readIgnoreFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function createIgnoreFilter(hqRoot: string): (filePath: string) => boolean {
  const ig = ignore();

  // Layer 1: baseline defaults
  ig.add(DEFAULT_IGNORES);

  // Layer 2: repo's .gitignore (common case — covers most build dirs already)
  const gitignore = readIgnoreFile(path.join(hqRoot, ".gitignore"));
  if (gitignore) ig.add(gitignore);

  // Layer 3: sync-specific overrides. .hqignore is the documented name;
  // .hqsyncignore is the legacy name we still honor.
  const hqignore =
    readIgnoreFile(path.join(hqRoot, ".hqignore")) ??
    readIgnoreFile(path.join(hqRoot, ".hqsyncignore"));
  if (hqignore) ig.add(hqignore);

  return (filePath: string): boolean => {
    const relative = path.relative(hqRoot, filePath);
    if (!relative || relative.startsWith("..")) return true; // outside HQ root
    return !ig.ignores(relative);
  };
}

/**
 * Check if a file exceeds the max sync size (50MB default)
 */
export function isWithinSizeLimit(
  filePath: string,
  maxBytes = 50 * 1024 * 1024
): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.size <= maxBytes;
  } catch {
    return false;
  }
}
