/**
 * Ignore-file parser for cloud sync.
 *
 * Two modes:
 *   - **Permissive (default)**: everything syncs except what ignore layers
 *     subtract. Three layers stack (later overrides earlier):
 *       1. Built-in defaults — VCS, node_modules, build artifacts, caches,
 *          env files. Covers the common stacks so a first-time sync over a
 *          random project folder doesn't push `target/` or `.next/` to S3.
 *       2. Repo `.gitignore` at hqRoot — reuses existing exclusions so we
 *          don't re-list every build directory. Root-level only.
 *       3. `.hqignore` (preferred) or `.hqsyncignore` (legacy) — sync-specific
 *          overrides. Use `!pattern` to re-include something earlier layers
 *          excluded.
 *
 *   - **Allowlist**: triggered when `.hqinclude` exists at hqRoot. Nothing
 *     syncs unless its path matches at least one pattern in `.hqinclude`. The
 *     three exclusion layers still subtract on top — so even allowlisted
 *     subtrees won't push `node_modules/` or `.env`. Privacy-by-default for
 *     HQ trees that contain mixed personal + shareable data.
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

  // HQ sync internal state (never round-trip these). The `.hq-*` wildcard
  // covers `.hq-sync.pid`, `.hq-sync-journal.json`, `.hq-sync-state.json`,
  // `.hq-embeddings-pending.json`, and any future internal-state file. The
  // `.hqignore` / `.hqsyncignore` / `.hqinclude` config files don't match
  // (no hyphen) and the `.hq/` directory is unaffected.
  "*.pid",
  ".hq-*",
  "modules.lock",
  // hq-root identity marker — discovered locally per-machine, never synced.
  "core.yaml",
  // hq modules manifest — local module-resolution state, never synced.
  "modules/modules.yaml",
  // per-company identity file — written locally on first sync, never round-tripped.
  "company.yaml",

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

  // Allowlist mode: when `.hqinclude` exists, sync is opt-in. The matcher
  // here treats include patterns as ignore patterns and inverts the verdict —
  // a path is "allowed" iff its relative path matches at least one entry.
  // Exclusion layers above still subtract, so build artifacts inside an
  // allowlisted subtree (e.g. node_modules/ inside companies/x/repos/y/) are
  // still skipped.
  const hqinclude = readIgnoreFile(path.join(hqRoot, ".hqinclude"));
  const includeMatcher = hqinclude ? ignore().add(hqinclude) : null;

  return (filePath: string): boolean => {
    const relative = path.relative(hqRoot, filePath);
    if (!relative || relative.startsWith("..")) return true; // outside HQ root
    if (ig.ignores(relative)) return false;
    if (includeMatcher && !includeMatcher.ignores(relative)) return false;
    return true;
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
