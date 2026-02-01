/**
 * Ignore file parser for .hqsyncignore
 * Uses gitignore-compatible syntax
 */

import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";

// Default patterns that should never sync
const DEFAULT_IGNORES = [
  ".git/",
  ".git",
  "node_modules/",
  "dist/",
  ".DS_Store",
  "Thumbs.db",
  "*.pid",
  ".hq-sync.pid",
  ".hq-sync-journal.json",
  ".hq-sync-state.json",
  "modules.lock",
  "repos/",
  ".env",
  ".env.*",
];

export function createIgnoreFilter(hqRoot: string): (filePath: string) => boolean {
  const ig = ignore();

  // Add defaults
  ig.add(DEFAULT_IGNORES);

  // Read .hqsyncignore if it exists
  const ignorePath = path.join(hqRoot, ".hqsyncignore");
  if (fs.existsSync(ignorePath)) {
    const content = fs.readFileSync(ignorePath, "utf-8");
    ig.add(content);
  }

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
