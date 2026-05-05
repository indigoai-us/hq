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
  // auto-generated tool index and policy digest — regenerated locally per-machine.
  "INDEX.md",
  "policies/_digest.md",

  // Claude Code worktrees — local-only working copies, never synced.
  "**/.claude/worktrees/",

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

/**
 * Compile a depth-anchored ancestor matcher from .hqinclude content.
 *
 * Git itself never asks "should I descend into this dir?" — it walks its
 * index and checks each file directly. Our walkers/watchers don't have an
 * index, so they have to make a descent decision per directory. To preserve
 * full gitignore semantics in allowlist mode, we must allow descent into
 * every ancestor of any include pattern. We can't reuse the `ignore` lib
 * for this because gitignore's `foo/*\/` would also match `foo/x/y/z/` —
 * recursing into the dir — which would defeat the privacy invariant.
 *
 * The matcher therefore checks an ancestor candidate against each include
 * pattern's prefix segments at the EXACT same depth, with `*` and `?`
 * resolved per-segment. `**` segments are treated as wildcards that match
 * any single segment here — sufficient for descent decisions, since the
 * include matcher itself still gates files.
 */
function compileAncestorMatcher(
  includeContent: string,
): ((relDir: string) => boolean) | null {
  const prefixes: RegExp[][] = [];
  for (const raw of includeContent.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const stripped = line.replace(/^\//, "").replace(/\/$/, "");
    if (!stripped.includes("/")) continue;
    const segs = stripped.split("/").map(segmentToRegex);
    for (let i = 1; i < segs.length; i++) {
      prefixes.push(segs.slice(0, i));
    }
  }
  if (!prefixes.length) return null;
  return (relDir: string): boolean => {
    const parts = relDir.split("/");
    for (const pat of prefixes) {
      if (pat.length !== parts.length) continue;
      let ok = true;
      for (let i = 0; i < pat.length; i++) {
        if (!pat[i].test(parts[i])) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  };
}

function segmentToRegex(seg: string): RegExp {
  // Translate a single gitignore path segment to an anchored regex. `*` and
  // `**` both match any single segment here (segments never contain `/`),
  // `?` matches one char. Everything else is escaped literal.
  let body = "";
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (ch === "*") {
      if (seg[i + 1] === "*") i++;
      body += "[^/]*";
    } else if (ch === "?") {
      body += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      body += "\\" + ch;
    } else {
      body += ch;
    }
  }
  return new RegExp(`^${body}$`);
}

export function createIgnoreFilter(
  hqRoot: string,
): (filePath: string, isDir?: boolean) => boolean {
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
  // Ancestor matcher: matches every directory that lies on the path to an
  // include pattern. Consulted ONLY for `isDir=true` queries so a walker can
  // descend through `companies/` and `companies/indigo/` to reach the leaf
  // `companies/*/knowledge/`. Files directly inside those intermediate dirs
  // remain excluded — this is the privacy invariant of allowlist mode.
  const ancestorMatcher = hqinclude ? compileAncestorMatcher(hqinclude) : null;

  return (filePath: string, isDir = false): boolean => {
    const relative = path.relative(hqRoot, filePath);
    if (!relative || relative.startsWith("..")) return true; // outside HQ root

    // Gitignore dir-only patterns (`foo/`) only match candidate paths that
    // end with `/`. The `ignore` lib has no stat awareness, so when the
    // caller knows the entry is a directory we hand the matcher the
    // canonical trailing-slash form. This mirrors how git itself decides:
    // it knows from the index whether each entry is a tree or a blob.
    // Applied symmetrically to BOTH layers — exclude and include — to
    // preserve full gitignore semantics on both sides.
    const probe = isDir && !relative.endsWith("/") ? relative + "/" : relative;

    if (ig.ignores(probe)) return false;
    if (!includeMatcher) return true;
    if (includeMatcher.ignores(probe)) return true;
    // Directory query that didn't match the include pattern itself — allow
    // if it's an ancestor of one (so the walker can descend to the leaf).
    if (isDir && ancestorMatcher) {
      // Ancestor matching is depth-anchored, so feed it the slashless form.
      const relDir = relative.replace(/\/$/, "");
      if (relDir && ancestorMatcher(relDir)) return true;
    }
    return false;
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
