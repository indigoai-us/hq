/**
 * Diff categorization utilities for HQ migration.
 *
 * Extracted from skills/analyze.md Step 4.
 * Compares template and local file trees, categorizing each file.
 */

import { createHash } from "crypto";

export type DiffCategory =
  | "NEW"
  | "MODIFIED"
  | "DELETED"
  | "UNCHANGED"
  | "LOCAL_ONLY"
  | "RENAMED";

export interface FileEntry {
  relativePath: string;
  type: "file" | "symlink" | "directory";
  size: number;
  hash: string | null;
  symlinkTarget: string | null;
  isBinary: boolean;
  isGitkeep: boolean;
}

export interface DiffEntry {
  path: string;
  category: DiffCategory;
  oldPath?: string; // For RENAMED
  newPath?: string; // For RENAMED
  diffSummary?: string;
  isSpecial?: boolean;
  mergeStrategy?: string;
  impact?: "HIGH" | "MEDIUM" | "LOW";
  description?: string;
}

export interface DiffResult {
  NEW: DiffEntry[];
  MODIFIED: DiffEntry[];
  DELETED: DiffEntry[];
  UNCHANGED: DiffEntry[];
  LOCAL_ONLY: DiffEntry[];
  RENAMED: DiffEntry[];
}

/**
 * Ignore patterns from analyze.md section 4a.
 * These paths are invisible to the diff engine.
 */
const IGNORE_DIR_PATTERNS = [
  "workspace/threads/",
  "workspace/learnings/",
  "workspace/orchestrator/",
  "workspace/checkpoints/",
  "workspace/reports/",
  "workspace/content-ideas/",
  "companies/",
  "projects/",
  "repos/",
  "social-content/drafts/",
  ".git/",
  ".hq-backup/",
  "node_modules/",
  "dist/",
  ".beads/",
];

const IGNORE_EXTENSION_PATTERNS = [
  ".log",
  ".lock",
  ".stackdump",
];

const IGNORE_EXACT_FILES = [
  "agents.md",
  ".DS_Store",
  "Thumbs.db",
  "nul",
];

/**
 * Check if a relative path should be ignored by the diff engine.
 */
export function isIgnored(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");

  // Directory patterns (trailing /)
  for (const pattern of IGNORE_DIR_PATTERNS) {
    if (normalized.startsWith(pattern) || normalized === pattern.replace(/\/$/, "")) {
      return true;
    }
  }

  // Extension patterns
  for (const ext of IGNORE_EXTENSION_PATTERNS) {
    if (normalized.endsWith(ext)) {
      return true;
    }
  }

  // Exact match at root level only
  for (const exact of IGNORE_EXACT_FILES) {
    if (normalized === exact) {
      return true;
    }
  }

  return false;
}

/**
 * Known binary file extensions (skip null-byte check).
 */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot",
  ".pdf", ".zip", ".tar", ".gz", ".bz2",
  ".exe", ".dll", ".so", ".dylib",
  ".db", ".sqlite", ".sqlite3",
]);

/**
 * Check if a file is binary based on its extension.
 */
export function isBinaryByExtension(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Check if a buffer contains null bytes (binary detection heuristic).
 */
export function hasBinaryContent(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Compute SHA-256 hash of file contents.
 */
export function computeHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Compare two file entries to determine if they are identical.
 * Follows the algorithm from analyze.md section 4d.
 */
export function entriesAreIdentical(
  templateEntry: FileEntry,
  localEntry: FileEntry
): boolean {
  // Type mismatch
  if (templateEntry.type !== localEntry.type) {
    return false;
  }

  // Symlinks: compare targets
  if (templateEntry.type === "symlink") {
    return templateEntry.symlinkTarget === localEntry.symlinkTarget;
  }

  // .gitkeep files: always identical
  if (templateEntry.isGitkeep && localEntry.isGitkeep) {
    return true;
  }

  // Binary files: compare by size AND hash
  if (templateEntry.isBinary || localEntry.isBinary) {
    return (
      templateEntry.size === localEntry.size &&
      templateEntry.hash === localEntry.hash
    );
  }

  // Text files: compare by hash
  return templateEntry.hash === localEntry.hash;
}

/**
 * Check if two entries are likely a rename (same content, different path).
 * From analyze.md section 4e.
 */
export function isLikelyRename(
  newEntry: FileEntry,
  localEntry: FileEntry
): boolean {
  // Both must have hashes
  if (!newEntry.hash || !localEntry.hash) return false;

  // Hashes must match
  if (newEntry.hash !== localEntry.hash) return false;

  // Skip very small files (< 50 bytes) to avoid false positives
  if (newEntry.size < 50) return false;

  // Skip .gitkeep files (all identical)
  if (newEntry.isGitkeep || localEntry.isGitkeep) return false;

  const newName = newEntry.relativePath.split("/").pop() || "";
  const localName = localEntry.relativePath.split("/").pop() || "";
  const newExt = newName.substring(newName.lastIndexOf("."));
  const localExt = localName.substring(localName.lastIndexOf("."));

  // Must have same extension
  if (newExt !== localExt) return false;

  return true;
}

/**
 * Categorize files by comparing template and local file inventories.
 * Core diff algorithm from analyze.md section 4d.
 */
export function categorizeFiles(
  templateFiles: Map<string, FileEntry>,
  localFiles: Map<string, FileEntry>
): DiffResult {
  const result: DiffResult = {
    NEW: [],
    MODIFIED: [],
    DELETED: [],
    UNCHANGED: [],
    LOCAL_ONLY: [],
    RENAMED: [],
  };

  // Pass 1: Classify template files against local
  for (const [path, templateEntry] of templateFiles) {
    const localEntry = localFiles.get(path);

    if (!localEntry) {
      result.NEW.push({
        path,
        category: "NEW",
      });
    } else if (entriesAreIdentical(templateEntry, localEntry)) {
      result.UNCHANGED.push({
        path,
        category: "UNCHANGED",
      });
    } else {
      result.MODIFIED.push({
        path,
        category: "MODIFIED",
      });
    }
  }

  // Pass 2: Find LOCAL_ONLY files
  for (const [path] of localFiles) {
    if (!templateFiles.has(path)) {
      result.LOCAL_ONLY.push({
        path,
        category: "LOCAL_ONLY",
      });
    }
  }

  // Pass 3: Rename detection
  detectRenames(result, templateFiles, localFiles);

  return result;
}

/**
 * Detect renames: same content at different paths.
 * Reclassifies entries from NEW + LOCAL_ONLY to RENAMED.
 */
function detectRenames(
  result: DiffResult,
  templateFiles: Map<string, FileEntry>,
  localFiles: Map<string, FileEntry>
): void {
  // Build hash maps for NEW and LOCAL_ONLY entries
  const newByHash = new Map<string, DiffEntry>();
  for (const entry of result.NEW) {
    const templateEntry = templateFiles.get(entry.path);
    if (templateEntry?.hash && !newByHash.has(templateEntry.hash)) {
      newByHash.set(templateEntry.hash, entry);
    }
  }

  const localOnlyByHash = new Map<string, DiffEntry>();
  for (const entry of result.LOCAL_ONLY) {
    const localEntry = localFiles.get(entry.path);
    if (localEntry?.hash && !localOnlyByHash.has(localEntry.hash)) {
      localOnlyByHash.set(localEntry.hash, entry);
    }
  }

  // Find matches
  const renames: Array<{ newEntry: DiffEntry; localEntry: DiffEntry; hash: string }> = [];

  for (const [hash, newEntry] of newByHash) {
    const localEntry = localOnlyByHash.get(hash);
    if (localEntry) {
      const templateFileEntry = templateFiles.get(newEntry.path);
      const localFileEntry = localFiles.get(localEntry.path);

      if (
        templateFileEntry &&
        localFileEntry &&
        isLikelyRename(templateFileEntry, localFileEntry)
      ) {
        renames.push({ newEntry, localEntry, hash });
      }
    }
  }

  // Reclassify
  for (const { newEntry, localEntry } of renames) {
    result.NEW = result.NEW.filter((e) => e.path !== newEntry.path);
    result.LOCAL_ONLY = result.LOCAL_ONLY.filter((e) => e.path !== localEntry.path);
    result.RENAMED.push({
      path: newEntry.path,
      category: "RENAMED",
      oldPath: localEntry.path,
      newPath: newEntry.path,
      description: `Moved from ${localEntry.path} to ${newEntry.path}`,
    });
  }
}

/**
 * Special files registry from analyze.md section 4g.
 */
interface SpecialFileConfig {
  mergeStrategy: string;
  preserveSections?: string[];
  description: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  patternMatch?: boolean;
}

const SPECIAL_FILES: Record<string, SpecialFileConfig> = {
  ".claude/CLAUDE.md": {
    mergeStrategy: "section_merge",
    preserveSections: ["## Learned Rules"],
    description:
      "Template structure updated; user Learned Rules will be preserved",
    impact: "HIGH",
  },
  "workers/*/worker.yaml": {
    mergeStrategy: "yaml_merge",
    preserveSections: ["instructions"],
    description:
      "Worker definition updated; user instructions will be preserved",
    impact: "MEDIUM",
    patternMatch: true,
  },
  "agents.md": {
    mergeStrategy: "never_overwrite",
    description: "User profile -- content never modified, structure-only comparison",
    impact: "HIGH",
  },
  "workers/registry.yaml": {
    mergeStrategy: "additive_merge",
    description:
      "Worker registry updated; new workers added, existing entries preserved",
    impact: "MEDIUM",
  },
  ".claude/commands/*.md": {
    mergeStrategy: "preserve_rules_section",
    preserveSections: ["## Rules"],
    description: "Command updated; user-added rules will be preserved",
    impact: "MEDIUM",
    patternMatch: true,
  },
  ".hq-version": {
    mergeStrategy: "overwrite",
    description: "Version marker updated by migration tool",
    impact: "LOW",
  },
  "CHANGELOG.md": {
    mergeStrategy: "overwrite",
    description: "Changelog replaced with latest version",
    impact: "LOW",
  },
  "MIGRATION.md": {
    mergeStrategy: "overwrite",
    description: "Migration guide updated",
    impact: "LOW",
  },
};

/**
 * Simple glob match for patterns like "workers/* /worker.yaml" and ".claude/commands/*.md".
 */
function globMatch(pattern: string, path: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars (except *)
    .replace(/\*/g, "[^/]*"); // * matches anything except /
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(path);
}

/**
 * Check if a file is in the special files registry.
 */
export function isSpecialFile(relativePath: string): boolean {
  for (const [pattern, config] of Object.entries(SPECIAL_FILES)) {
    if (config.patternMatch) {
      if (globMatch(pattern, relativePath)) return true;
    } else {
      if (pattern === relativePath) return true;
    }
  }
  return false;
}

/**
 * Get the merge strategy for a file.
 */
export function getMergeStrategy(relativePath: string): string {
  for (const [pattern, config] of Object.entries(SPECIAL_FILES)) {
    if (config.patternMatch) {
      if (globMatch(pattern, relativePath)) return config.mergeStrategy;
    } else {
      if (pattern === relativePath) return config.mergeStrategy;
    }
  }
  return "overwrite";
}
