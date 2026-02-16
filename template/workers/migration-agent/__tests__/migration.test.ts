/**
 * Migration Agent Test Suite
 *
 * Tests cover the core migration logic extracted from skill instructions:
 * - Version detection from .hq-version file
 * - Version inference from filesystem clues
 * - Diff categorization (NEW, MODIFIED, DELETED, UNCHANGED, LOCAL_ONLY, RENAMED)
 * - Backup manifest generation and verification
 * - CLAUDE.md merge preserves Learned Rules while updating template sections
 * - Data integrity rules (user content never rewritten)
 * - Plan generation from diff results
 *
 * Uses fixture files in __tests__/fixtures/ (sample HQ structures, not real filesystem).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Source modules
import {
  parseVersionFile,
  parseChangelogVersion,
  compareSemver,
  inferVersion,
  detectVersion,
  getVersionClues,
  type InferenceFilesystem,
} from "../src/version.js";

import {
  isIgnored,
  isBinaryByExtension,
  hasBinaryContent,
  computeHash,
  entriesAreIdentical,
  isLikelyRename,
  categorizeFiles,
  isSpecialFile,
  getMergeStrategy,
  type FileEntry,
} from "../src/diff.js";

import {
  extractSection,
  mergeCLAUDEmd,
  extractYamlBlock,
  extractRootYamlKeys,
  mergeWorkerYaml,
  detectMarkdownSectionChanges,
} from "../src/merge.js";

import {
  humanSize,
  generateManifest,
  verifyBackup,
  verifyRestore,
  parseManifest,
  validateManifest,
} from "../src/backup.js";

import {
  describeNewFilePurpose,
  isHighImpact,
  getHighImpactWarning,
  generatePlanEntries,
  generatePlanSummary,
  sortByImpact,
  groupByDirectory,
  formatPlanMarkdown,
  type PlanEntry,
} from "../src/plan.js";

// Fixture helpers
const FIXTURES_DIR = join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

// ============================================================================
// 1. Version Detection from .hq-version File
// ============================================================================

describe("Version Detection: .hq-version file", () => {
  it("should parse a valid semver string", () => {
    expect(parseVersionFile("5.4.0")).toBe("5.4.0");
  });

  it("should parse with trailing newline", () => {
    expect(parseVersionFile("5.4.0\n")).toBe("5.4.0");
  });

  it("should parse with leading/trailing whitespace", () => {
    expect(parseVersionFile("  5.4.0  \n")).toBe("5.4.0");
  });

  it("should parse pre-release versions", () => {
    expect(parseVersionFile("5.4.0-beta.1")).toBe("5.4.0-beta.1");
  });

  it("should return null for empty content", () => {
    expect(parseVersionFile("")).toBeNull();
  });

  it("should return null for non-semver content", () => {
    expect(parseVersionFile("latest")).toBeNull();
    expect(parseVersionFile("v5.4")).toBeNull();
    expect(parseVersionFile("abc")).toBeNull();
  });

  it("should return null for content with only whitespace", () => {
    expect(parseVersionFile("   \n  ")).toBeNull();
  });

  it("should detect version via detectVersion when .hq-version exists", () => {
    const fs: InferenceFilesystem = {
      fileExists: () => false,
      isSymlink: () => false,
      readFile: (path) =>
        path === ".hq-version" ? "5.4.0\n" : null,
      listDir: () => [],
    };

    const result = detectVersion(fs);
    expect(result.version).toBe("5.4.0");
    expect(result.method).toBe("file");
  });
});

// ============================================================================
// 2. Version Inference from Filesystem Clues
// ============================================================================

describe("Version Inference: filesystem clues", () => {
  it("should infer version from CHANGELOG.md first heading", () => {
    const changelog = readFixture("changelog-v5.md");
    expect(parseChangelogVersion(changelog)).toBe("5.4.0");
  });

  it("should parse CHANGELOG with v prefix", () => {
    expect(parseChangelogVersion("## v3.2.0\n- stuff")).toBe("3.2.0");
  });

  it("should parse CHANGELOG without v prefix", () => {
    expect(parseChangelogVersion("## 3.2.0\n- stuff")).toBe("3.2.0");
  });

  it("should return null for CHANGELOG with no version heading", () => {
    expect(parseChangelogVersion("# Changelog\n\nSome notes")).toBeNull();
  });

  it("should infer v5.2.0 when knowledge symlinks exist", () => {
    const fs: InferenceFilesystem = {
      fileExists: (path) => {
        if (path === ".claude/commands") return true;
        if (path === "workspace/orchestrator") return true;
        if (path === "workspace/threads") return true;
        return false;
      },
      isSymlink: (path) => path.startsWith("knowledge/"),
      readFile: () => null,
      listDir: (path) => {
        if (path === "knowledge/") return ["hq-core", "testing"];
        if (path === "workers/dev-team/") return [];
        return [];
      },
    };

    const result = inferVersion(fs);
    expect(result.version).toBe("5.2.0");
    expect(result.clues).toContain(
      "Knowledge dirs are symlinks to repos/"
    );
  });

  it("should infer v4.0.0 when learn.md exists", () => {
    const fs: InferenceFilesystem = {
      fileExists: (path) => {
        if (path === ".claude/commands/learn.md") return true;
        if (path === ".claude/commands") return true;
        return false;
      },
      isSymlink: () => false,
      readFile: () => null,
      listDir: () => [],
    };

    const result = inferVersion(fs);
    expect(result.version).toBe("4.0.0");
    expect(result.clues).toContain(".claude/commands/learn.md exists");
  });

  it("should infer v2.0.0 when orchestrator exists", () => {
    const fs: InferenceFilesystem = {
      fileExists: (path) => {
        if (path === "workspace/orchestrator") return true;
        if (path === "workspace/threads") return true;
        if (path === ".claude/commands") return true;
        return false;
      },
      isSymlink: () => false,
      readFile: () => null,
      listDir: () => [],
    };

    const result = inferVersion(fs);
    expect(result.version).toBe("2.0.0");
  });

  it("should infer v1.0.0 when only .claude/commands exists", () => {
    const fs: InferenceFilesystem = {
      fileExists: (path) => path === ".claude/commands",
      isSymlink: () => false,
      readFile: () => null,
      listDir: () => [],
    };

    const result = inferVersion(fs);
    expect(result.version).toBe("1.0.0");
  });

  it('should return "unknown" when no clues match', () => {
    const fs: InferenceFilesystem = {
      fileExists: () => false,
      isSymlink: () => false,
      readFile: () => null,
      listDir: () => [],
    };

    const result = inferVersion(fs);
    expect(result.version).toBe("unknown");
    expect(result.clues).toHaveLength(0);
  });

  it("should prefer CHANGELOG exact version over structural clues", () => {
    const fs: InferenceFilesystem = {
      fileExists: (path) => {
        if (path === ".claude/commands") return true;
        if (path === ".claude/commands/learn.md") return true;
        return false;
      },
      isSymlink: () => false,
      readFile: (path) => {
        if (path === "CHANGELOG.md") return "## v5.4.0\n- stuff";
        return null;
      },
      listDir: () => [],
    };

    const result = inferVersion(fs);
    expect(result.version).toBe("5.4.0");
    expect(result.clues).toContain("CHANGELOG.md exact version");
  });

  it("should fall back to .hq-version before inference", () => {
    const fs: InferenceFilesystem = {
      fileExists: (path) => path === ".claude/commands",
      isSymlink: () => false,
      readFile: (path) => {
        if (path === ".hq-version") return "5.4.0";
        return null;
      },
      listDir: () => [],
    };

    const result = detectVersion(fs);
    expect(result.version).toBe("5.4.0");
    expect(result.method).toBe("file");
  });

  it("should use highest matching version floor", () => {
    const fs: InferenceFilesystem = {
      fileExists: (path) => {
        // v5.0 clues
        if (path === "workers/sample-worker") return true;
        if (path === ".claude/commands/personal-interview.md") return true;
        // v4.0 clues
        if (path === ".claude/commands/learn.md") return true;
        if (path === "knowledge/hq-core/index-md-spec.md") return true;
        // v2.0 clues
        if (path === "workspace/orchestrator") return true;
        if (path === "workspace/threads") return true;
        // v1.0 clues
        if (path === ".claude/commands") return true;
        return false;
      },
      isSymlink: () => false,
      readFile: () => null,
      listDir: (path) => {
        if (path === "knowledge/") return [];
        if (path === "workers/dev-team/") return [];
        return [];
      },
    };

    const result = inferVersion(fs);
    expect(result.version).toBe("5.0.0");
  });
});

describe("Semver Comparison", () => {
  it("should compare equal versions", () => {
    expect(compareSemver("5.4.0", "5.4.0")).toBe(0);
  });

  it("should compare major versions", () => {
    expect(compareSemver("4.0.0", "5.0.0")).toBe(-1);
    expect(compareSemver("5.0.0", "4.0.0")).toBe(1);
  });

  it("should compare minor versions", () => {
    expect(compareSemver("5.3.0", "5.4.0")).toBe(-1);
    expect(compareSemver("5.4.0", "5.3.0")).toBe(1);
  });

  it("should compare patch versions", () => {
    expect(compareSemver("5.4.0", "5.4.1")).toBe(-1);
    expect(compareSemver("5.4.1", "5.4.0")).toBe(1);
  });
});

// ============================================================================
// 3. Diff Categorization
// ============================================================================

describe("Diff: Ignore List", () => {
  it("should ignore user data directories", () => {
    expect(isIgnored("workspace/threads/session.json")).toBe(true);
    expect(isIgnored("workspace/learnings/learn-001.json")).toBe(true);
    expect(isIgnored("workspace/orchestrator/state.json")).toBe(true);
    expect(isIgnored("companies/acme/settings.yaml")).toBe(true);
    expect(isIgnored("projects/my-project/prd.json")).toBe(true);
    expect(isIgnored("repos/some-repo/src/index.ts")).toBe(true);
  });

  it("should ignore system directories", () => {
    expect(isIgnored(".git/objects/abc123")).toBe(true);
    expect(isIgnored(".hq-backup/20260214/manifest.json")).toBe(true);
    expect(isIgnored("node_modules/vitest/package.json")).toBe(true);
    expect(isIgnored("dist/bundle.js")).toBe(true);
  });

  it("should ignore files by extension", () => {
    expect(isIgnored("debug.log")).toBe(true);
    expect(isIgnored("pnpm-lock.lock")).toBe(true);
    expect(isIgnored("crash.stackdump")).toBe(true);
  });

  it("should ignore exact root-level files", () => {
    expect(isIgnored("agents.md")).toBe(true);
    expect(isIgnored(".DS_Store")).toBe(true);
    expect(isIgnored("Thumbs.db")).toBe(true);
  });

  it("should NOT ignore template files", () => {
    expect(isIgnored(".claude/CLAUDE.md")).toBe(false);
    expect(isIgnored("workers/registry.yaml")).toBe(false);
    expect(isIgnored("knowledge/hq-core/index-md-spec.md")).toBe(false);
    expect(isIgnored("MIGRATION.md")).toBe(false);
    expect(isIgnored(".hq-version")).toBe(false);
  });

  it("should NOT ignore agents.md in subdirectories", () => {
    // agents.md exact match is root-level only
    expect(isIgnored("workers/some-worker/agents.md")).toBe(false);
  });

  it("should normalize Windows paths", () => {
    expect(isIgnored("workspace\\threads\\session.json")).toBe(true);
  });
});

describe("Diff: Binary Detection", () => {
  it("should identify binary extensions", () => {
    expect(isBinaryByExtension("icon.png")).toBe(true);
    expect(isBinaryByExtension("photo.jpg")).toBe(true);
    expect(isBinaryByExtension("font.woff2")).toBe(true);
    expect(isBinaryByExtension("data.sqlite")).toBe(true);
    expect(isBinaryByExtension("app.exe")).toBe(true);
  });

  it("should not flag text extensions as binary", () => {
    expect(isBinaryByExtension("readme.md")).toBe(false);
    expect(isBinaryByExtension("config.yaml")).toBe(false);
    expect(isBinaryByExtension("index.ts")).toBe(false);
    expect(isBinaryByExtension("data.json")).toBe(false);
  });

  it("should detect binary content via null bytes", () => {
    const binaryBuffer = Buffer.from([
      0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x57, 0x6f,
    ]);
    expect(hasBinaryContent(binaryBuffer)).toBe(true);
  });

  it("should not flag text content as binary", () => {
    const textBuffer = Buffer.from("Hello, World!");
    expect(hasBinaryContent(textBuffer)).toBe(false);
  });
});

describe("Diff: Entry Comparison", () => {
  const makeEntry = (
    overrides: Partial<FileEntry> = {}
  ): FileEntry => ({
    relativePath: "test.md",
    type: "file",
    size: 100,
    hash: "abc123",
    symlinkTarget: null,
    isBinary: false,
    isGitkeep: false,
    ...overrides,
  });

  it("should identify identical files by hash", () => {
    const a = makeEntry({ hash: "sha256-abc" });
    const b = makeEntry({ hash: "sha256-abc" });
    expect(entriesAreIdentical(a, b)).toBe(true);
  });

  it("should detect different files by hash", () => {
    const a = makeEntry({ hash: "sha256-abc" });
    const b = makeEntry({ hash: "sha256-def" });
    expect(entriesAreIdentical(a, b)).toBe(false);
  });

  it("should detect type mismatch", () => {
    const a = makeEntry({ type: "file" });
    const b = makeEntry({ type: "symlink", symlinkTarget: "target" });
    expect(entriesAreIdentical(a, b)).toBe(false);
  });

  it("should compare symlinks by target", () => {
    const a = makeEntry({
      type: "symlink",
      symlinkTarget: "repos/knowledge-a",
      hash: null,
    });
    const b = makeEntry({
      type: "symlink",
      symlinkTarget: "repos/knowledge-a",
      hash: null,
    });
    expect(entriesAreIdentical(a, b)).toBe(true);
  });

  it("should detect different symlink targets", () => {
    const a = makeEntry({
      type: "symlink",
      symlinkTarget: "repos/knowledge-a",
      hash: null,
    });
    const b = makeEntry({
      type: "symlink",
      symlinkTarget: "repos/knowledge-b",
      hash: null,
    });
    expect(entriesAreIdentical(a, b)).toBe(false);
  });

  it("should treat .gitkeep files as always identical", () => {
    const a = makeEntry({ isGitkeep: true, hash: null, size: 0 });
    const b = makeEntry({ isGitkeep: true, hash: null, size: 0 });
    expect(entriesAreIdentical(a, b)).toBe(true);
  });

  it("should compare binary files by size AND hash", () => {
    const a = makeEntry({ isBinary: true, size: 1000, hash: "abc" });
    const b = makeEntry({ isBinary: true, size: 1000, hash: "abc" });
    expect(entriesAreIdentical(a, b)).toBe(true);

    const c = makeEntry({ isBinary: true, size: 1000, hash: "abc" });
    const d = makeEntry({ isBinary: true, size: 2000, hash: "def" });
    expect(entriesAreIdentical(c, d)).toBe(false);
  });
});

describe("Diff: File Categorization", () => {
  const makeEntry = (
    path: string,
    hash: string,
    overrides: Partial<FileEntry> = {}
  ): FileEntry => ({
    relativePath: path,
    type: "file",
    size: 100,
    hash,
    symlinkTarget: null,
    isBinary: false,
    isGitkeep: false,
    ...overrides,
  });

  it("should categorize NEW files (in template, not local)", () => {
    const template = new Map<string, FileEntry>([
      ["new-file.md", makeEntry("new-file.md", "aaa")],
      ["shared.md", makeEntry("shared.md", "bbb")],
    ]);
    const local = new Map<string, FileEntry>([
      ["shared.md", makeEntry("shared.md", "bbb")],
    ]);

    const result = categorizeFiles(template, local);
    expect(result.NEW).toHaveLength(1);
    expect(result.NEW[0].path).toBe("new-file.md");
  });

  it("should categorize MODIFIED files (both exist, different hash)", () => {
    const template = new Map<string, FileEntry>([
      ["shared.md", makeEntry("shared.md", "new-hash")],
    ]);
    const local = new Map<string, FileEntry>([
      ["shared.md", makeEntry("shared.md", "old-hash")],
    ]);

    const result = categorizeFiles(template, local);
    expect(result.MODIFIED).toHaveLength(1);
    expect(result.MODIFIED[0].path).toBe("shared.md");
  });

  it("should categorize UNCHANGED files (same hash)", () => {
    const template = new Map<string, FileEntry>([
      ["shared.md", makeEntry("shared.md", "same-hash")],
    ]);
    const local = new Map<string, FileEntry>([
      ["shared.md", makeEntry("shared.md", "same-hash")],
    ]);

    const result = categorizeFiles(template, local);
    expect(result.UNCHANGED).toHaveLength(1);
    expect(result.UNCHANGED[0].path).toBe("shared.md");
  });

  it("should categorize LOCAL_ONLY files (in local, not template)", () => {
    const template = new Map<string, FileEntry>();
    const local = new Map<string, FileEntry>([
      ["my-custom-file.md", makeEntry("my-custom-file.md", "ccc")],
    ]);

    const result = categorizeFiles(template, local);
    expect(result.LOCAL_ONLY).toHaveLength(1);
    expect(result.LOCAL_ONLY[0].path).toBe("my-custom-file.md");
  });

  it("should detect RENAMED files (same hash, different path)", () => {
    const hash = computeHash("This is a file with enough content to not be tiny for rename detection to work properly.");
    const template = new Map<string, FileEntry>([
      [
        "workers/new-location/worker.yaml",
        makeEntry("workers/new-location/worker.yaml", hash, { size: 100 }),
      ],
    ]);
    const local = new Map<string, FileEntry>([
      [
        "workers/old-location/worker.yaml",
        makeEntry("workers/old-location/worker.yaml", hash, { size: 100 }),
      ],
    ]);

    const result = categorizeFiles(template, local);
    expect(result.RENAMED).toHaveLength(1);
    expect(result.RENAMED[0].oldPath).toBe(
      "workers/old-location/worker.yaml"
    );
    expect(result.RENAMED[0].newPath).toBe(
      "workers/new-location/worker.yaml"
    );
    expect(result.NEW).toHaveLength(0);
    expect(result.LOCAL_ONLY).toHaveLength(0);
  });

  it("should NOT detect rename for very small files", () => {
    const hash = computeHash("tiny");
    const template = new Map<string, FileEntry>([
      ["new.md", makeEntry("new.md", hash, { size: 4 })],
    ]);
    const local = new Map<string, FileEntry>([
      ["old.md", makeEntry("old.md", hash, { size: 4 })],
    ]);

    const result = categorizeFiles(template, local);
    // Small files should NOT be detected as renames
    expect(result.RENAMED).toHaveLength(0);
    expect(result.NEW).toHaveLength(1);
    expect(result.LOCAL_ONLY).toHaveLength(1);
  });

  it("should NOT detect rename for .gitkeep files", () => {
    const template = new Map<string, FileEntry>([
      [
        "new-dir/.gitkeep",
        makeEntry("new-dir/.gitkeep", "empty", {
          size: 0,
          isGitkeep: true,
        }),
      ],
    ]);
    const local = new Map<string, FileEntry>([
      [
        "old-dir/.gitkeep",
        makeEntry("old-dir/.gitkeep", "empty", {
          size: 0,
          isGitkeep: true,
        }),
      ],
    ]);

    const result = categorizeFiles(template, local);
    expect(result.RENAMED).toHaveLength(0);
  });

  it("should handle mixed categories correctly", () => {
    const template = new Map<string, FileEntry>([
      ["unchanged.md", makeEntry("unchanged.md", "aaa")],
      ["modified.md", makeEntry("modified.md", "new-bbb")],
      ["brand-new.md", makeEntry("brand-new.md", "ccc")],
    ]);
    const local = new Map<string, FileEntry>([
      ["unchanged.md", makeEntry("unchanged.md", "aaa")],
      ["modified.md", makeEntry("modified.md", "old-bbb")],
      ["local-only.md", makeEntry("local-only.md", "ddd")],
    ]);

    const result = categorizeFiles(template, local);
    expect(result.UNCHANGED).toHaveLength(1);
    expect(result.MODIFIED).toHaveLength(1);
    expect(result.NEW).toHaveLength(1);
    expect(result.LOCAL_ONLY).toHaveLength(1);
  });
});

describe("Diff: Special Files", () => {
  it("should identify CLAUDE.md as special", () => {
    expect(isSpecialFile(".claude/CLAUDE.md")).toBe(true);
  });

  it("should identify worker.yaml files as special (glob)", () => {
    expect(isSpecialFile("workers/qa-tester/worker.yaml")).toBe(true);
    expect(isSpecialFile("workers/dev-team/worker.yaml")).toBe(true);
  });

  it("should identify command .md files as special (glob)", () => {
    expect(isSpecialFile(".claude/commands/learn.md")).toBe(true);
    expect(isSpecialFile(".claude/commands/setup.md")).toBe(true);
  });

  it("should identify registry.yaml as special", () => {
    expect(isSpecialFile("workers/registry.yaml")).toBe(true);
  });

  it("should NOT flag regular files as special", () => {
    expect(isSpecialFile("knowledge/hq-core/some-doc.md")).toBe(false);
    expect(isSpecialFile("workspace/something.yaml")).toBe(false);
  });

  it("should return correct merge strategies", () => {
    expect(getMergeStrategy(".claude/CLAUDE.md")).toBe("section_merge");
    expect(getMergeStrategy("workers/qa-tester/worker.yaml")).toBe(
      "yaml_merge"
    );
    expect(getMergeStrategy("agents.md")).toBe("never_overwrite");
    expect(getMergeStrategy("workers/registry.yaml")).toBe(
      "additive_merge"
    );
    expect(getMergeStrategy(".claude/commands/learn.md")).toBe(
      "preserve_rules_section"
    );
    expect(getMergeStrategy("CHANGELOG.md")).toBe("overwrite");
    expect(getMergeStrategy("some-random-file.md")).toBe("overwrite");
  });
});

// ============================================================================
// 4. Backup Manifest Generation and Verification
// ============================================================================

describe("Backup: Human-readable size", () => {
  it("should format bytes", () => {
    expect(humanSize(500)).toBe("500 B");
  });

  it("should format kilobytes", () => {
    expect(humanSize(2048)).toBe("2 KB");
  });

  it("should format megabytes", () => {
    expect(humanSize(4404019)).toBe("4.2 MB");
  });

  it("should format gigabytes", () => {
    expect(humanSize(1073741824)).toBe("1.0 GB");
  });

  it("should handle zero", () => {
    expect(humanSize(0)).toBe("0 B");
  });
});

describe("Backup: Manifest Generation", () => {
  it("should generate a valid manifest", () => {
    const manifest = generateManifest({
      timestamp: "2026-02-14T10:30:00Z",
      hqVersion: "5.4.0",
      hqPath: "/home/user/hq",
      fileCount: 325,
      symlinkCount: 12,
      totalSizeBytes: 4404019,
      platform: "linux",
      backupMethod: "rsync",
    });

    expect(manifest.version).toBe("1.0");
    expect(manifest.hqVersion).toBe("5.4.0");
    expect(manifest.fileCount).toBe(325);
    expect(manifest.symlinkCount).toBe(12);
    expect(manifest.totalSizeHuman).toBe("4.2 MB");
    expect(manifest.excludedDirs).toContain("node_modules");
    expect(manifest.excludedDirs).toContain(".git");
    expect(manifest.excludedDirs).toContain(".hq-backup");
    expect(manifest.excludedDirs).toContain("repos");
    expect(manifest.symlinkHandling).toBe("preserved-as-symlinks");
  });

  it("should include all required fields", () => {
    const manifest = generateManifest({
      timestamp: "2026-02-14T10:30:00Z",
      hqVersion: "5.4.0",
      hqPath: "C:\\hq",
      fileCount: 100,
      symlinkCount: 0,
      totalSizeBytes: 1000,
      platform: "windows-bash",
      backupMethod: "tar",
    });

    const validation = validateManifest(manifest);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});

describe("Backup: Manifest Parsing", () => {
  it("should parse a valid manifest JSON", () => {
    const json = readFixture("backup-manifest.json");
    const manifest = parseManifest(json);
    expect(manifest).not.toBeNull();
    expect(manifest!.hqVersion).toBe("5.4.0");
    expect(manifest!.fileCount).toBe(325);
    expect(manifest!.platform).toBe("linux");
  });

  it("should return null for invalid JSON", () => {
    expect(parseManifest("not json")).toBeNull();
  });

  it("should return null for missing required fields", () => {
    expect(parseManifest('{"foo": "bar"}')).toBeNull();
  });
});

describe("Backup: Verification", () => {
  it("should verify exact match", () => {
    const result = verifyBackup(325, 325);
    expect(result.status).toBe("VERIFIED");
    expect(result.difference).toBe(0);
  });

  it("should verify within tolerance of 2", () => {
    const result = verifyBackup(325, 323);
    expect(result.status).toContain("VERIFIED");
    expect(result.status).toContain("tolerance");
  });

  it("should detect mismatch beyond tolerance", () => {
    const result = verifyBackup(325, 300);
    expect(result.status).toBe("MISMATCH");
    expect(result.difference).toBe(25);
  });

  it("should verify restore with wider tolerance (5)", () => {
    const result = verifyRestore(325, 330);
    expect(result.status).toBe("MATCH");

    const mismatch = verifyRestore(325, 340);
    expect(mismatch.status).toBe("MISMATCH");
  });
});

describe("Backup: Manifest Validation", () => {
  it("should accept valid manifests", () => {
    const manifest = generateManifest({
      timestamp: "2026-02-14T10:30:00Z",
      hqVersion: "5.4.0",
      hqPath: "/home/user/hq",
      fileCount: 325,
      symlinkCount: 12,
      totalSizeBytes: 4404019,
      platform: "linux",
      backupMethod: "rsync",
    });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
  });

  it("should reject zero file count", () => {
    const manifest = generateManifest({
      timestamp: "2026-02-14T10:30:00Z",
      hqVersion: "5.4.0",
      hqPath: "/home/user/hq",
      fileCount: 0,
      symlinkCount: 0,
      totalSizeBytes: 0,
      platform: "linux",
      backupMethod: "rsync",
    });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("File count is zero (suspicious)");
  });

  it("should reject unknown platform", () => {
    const manifest = generateManifest({
      timestamp: "2026-02-14T10:30:00Z",
      hqVersion: "5.4.0",
      hqPath: "/home/user/hq",
      fileCount: 100,
      symlinkCount: 0,
      totalSizeBytes: 1000,
      platform: "invalid-platform" as any,
      backupMethod: "rsync",
    });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unknown platform"))).toBe(
      true
    );
  });
});

// ============================================================================
// 5. CLAUDE.md Merge: Preserve Learned Rules
// ============================================================================

describe("Merge: Section Extraction", () => {
  it("should extract Learned Rules section", () => {
    const content = readFixture("claude-md-local.md");
    const section = extractSection(content, "## Learned Rules");
    expect(section).not.toBeNull();
    expect(section).toContain("## Learned Rules");
    expect(section).toContain("NEVER work on a project");
    expect(section).toContain("All code contributions go to");
    expect(section).toContain("protofit3-form-analysis");
  });

  it("should extract section up to next same-level heading", () => {
    const content = readFixture("claude-md-local.md");
    const section = extractSection(content, "## Learned Rules");
    // Should NOT contain content from the next ## heading
    expect(section).not.toContain("## Learning System");
  });

  it("should preserve comments inside section", () => {
    const content = readFixture("claude-md-local.md");
    const section = extractSection(content, "## Learned Rules");
    expect(section).toContain("<!-- Max 20");
    expect(section).toContain("<!-- Auto-managed by /learn");
  });

  it("should return null for non-existent section", () => {
    const content = "# Title\n\n## Existing Section\n\nContent";
    const section = extractSection(content, "## Non-Existent");
    expect(section).toBeNull();
  });

  it("should handle section at end of file", () => {
    const content =
      "# Title\n\n## First\n\nContent\n\n## Last Section\n\nFinal content here";
    const section = extractSection(content, "## Last Section");
    expect(section).not.toBeNull();
    expect(section).toContain("Final content here");
  });
});

describe("Merge: CLAUDE.md Lossless Merge", () => {
  it("should preserve user Learned Rules while updating template", () => {
    const templateContent = readFixture("claude-md-template.md");
    const localContent = readFixture("claude-md-local.md");

    const result = mergeCLAUDEmd(templateContent, localContent);

    expect(result.success).toBe(true);
    expect(result.rulesPreserved).toBe(true);

    // User rules must appear verbatim in merged output
    expect(result.merged).toContain("NEVER work on a project");
    expect(result.merged).toContain("All code contributions go to");
    expect(result.merged).toContain("protofit3-form-analysis");

    // Comments must be preserved
    expect(result.merged).toContain("<!-- Max 20");
    expect(result.merged).toContain("<!-- Auto-managed by /learn");
  });

  it("should use template structure (updated headings, tables, etc.)", () => {
    const templateContent = readFixture("claude-md-template.md");
    const localContent = readFixture("claude-md-local.md");

    const result = mergeCLAUDEmd(templateContent, localContent);

    // Template has expanded Key Files section
    expect(result.merged).toContain("agents.md");
    expect(result.merged).toContain("workers/registry.yaml");

    // Template has expanded Commands table
    expect(result.merged).toContain("/reanchor");
    expect(result.merged).toContain("/nexttask");

    // Template has expanded Core Principles
    expect(result.merged).toContain("Context is precious");
    expect(result.merged).toContain("Ship, then iterate");
  });

  it("should handle missing user rules gracefully", () => {
    const templateContent = readFixture("claude-md-template.md");
    // Local content without Learned Rules section
    const localContent = "# HQ\n\n## Some Section\n\nContent only";

    const result = mergeCLAUDEmd(templateContent, localContent);

    expect(result.success).toBe(true);
    expect(result.rulesPreserved).toBe(false);
    expect(result.merged).toBe(templateContent);
  });

  it("should handle template without Learned Rules section", () => {
    const templateContent =
      "# HQ Template\n\n## Structure\n\nTemplate content";
    const localContent =
      "# HQ\n\n## Learned Rules\n\n1. My rule\n\n## Other\n\nContent";

    const result = mergeCLAUDEmd(templateContent, localContent);

    expect(result.success).toBe(true);
    expect(result.merged).toContain("## Learned Rules");
    expect(result.merged).toContain("1. My rule");
  });

  it("should verify every non-blank user rule line exists in merged output", () => {
    const templateContent = readFixture("claude-md-template.md");
    const localContent = readFixture("claude-md-local.md");

    const result = mergeCLAUDEmd(templateContent, localContent);
    expect(result.success).toBe(true);

    // Extract user rules from local
    const userRules = extractSection(localContent, "## Learned Rules");
    expect(userRules).not.toBeNull();

    // Every non-blank line from user rules must be in merged
    const ruleLines = userRules!
      .split("\n")
      .filter((line) => line.trim() !== "");
    for (const line of ruleLines) {
      expect(result.merged).toContain(line);
    }
  });
});

// ============================================================================
// 6. Worker YAML Merge
// ============================================================================

describe("Merge: YAML Block Extraction", () => {
  it("should extract instructions block", () => {
    const content = readFixture("worker-yaml-local.yaml");
    const block = extractYamlBlock(content, "instructions");
    expect(block).not.toBeNull();
    expect(block).toContain("You are the QA Tester worker");
    expect(block).toContain("Always use vitest, never jest");
    expect(block).toContain("Prefer integration tests");
  });

  it("should extract root-level keys", () => {
    const content = readFixture("worker-yaml-local.yaml");
    const keys = extractRootYamlKeys(content);
    expect(keys).toContain("worker");
    expect(keys).toContain("description");
    expect(keys).toContain("execution");
    expect(keys).toContain("skills");
    expect(keys).toContain("instructions");
    expect(keys).toContain("custom_field");
  });

  it("should detect custom keys (in local, not template)", () => {
    const localContent = readFixture("worker-yaml-local.yaml");
    const templateContent = readFixture("worker-yaml-template.yaml");

    const localKeys = extractRootYamlKeys(localContent);
    const templateKeys = extractRootYamlKeys(templateContent);

    const customKeys = localKeys.filter((k) => !templateKeys.includes(k));
    expect(customKeys).toContain("custom_field");
  });
});

describe("Merge: Worker YAML", () => {
  it("should preserve user instructions while updating template", () => {
    const templateContent = readFixture("worker-yaml-template.yaml");
    const localContent = readFixture("worker-yaml-local.yaml");

    const result = mergeWorkerYaml(templateContent, localContent);

    expect(result.success).toBe(true);
    expect(result.rulesPreserved).toBe(true);

    // User instructions preserved
    expect(result.merged).toContain("Always use vitest, never jest");
    expect(result.merged).toContain("Prefer integration tests");
    expect(result.merged).toContain("Mock external services");

    // Template structure updated
    expect(result.merged).toContain("version: \"2.0\"");
    expect(result.merged).toContain("test-plan");
    expect(result.merged).toContain("retry_attempts: 1");
  });

  it("should preserve custom YAML keys", () => {
    const templateContent = readFixture("worker-yaml-template.yaml");
    const localContent = readFixture("worker-yaml-local.yaml");

    const result = mergeWorkerYaml(templateContent, localContent);

    expect(result.merged).toContain("custom_field");
  });
});

// ============================================================================
// 7. Data Integrity Rules
// ============================================================================

describe("Data Integrity: User Content Never Rewritten", () => {
  it("agents.md should have never_overwrite strategy", () => {
    expect(getMergeStrategy("agents.md")).toBe("never_overwrite");
  });

  it("CLAUDE.md merge should never alter user rule text", () => {
    const templateContent = readFixture("claude-md-template.md");
    const localContent = readFixture("claude-md-local.md");
    const userRules = extractSection(localContent, "## Learned Rules");

    const result = mergeCLAUDEmd(templateContent, localContent);

    // The user rules text must appear EXACTLY as-is (line by line, to handle cross-platform line endings)
    expect(userRules).not.toBeNull();
    const ruleLines = userRules!.split("\n").filter((l) => l.trim() !== "");
    for (const line of ruleLines) {
      expect(result.merged).toContain(line.trimEnd());
    }
  });

  it("worker.yaml merge should never alter user instructions text", () => {
    const templateContent = readFixture("worker-yaml-template.yaml");
    const localContent = readFixture("worker-yaml-local.yaml");
    const userInstructions = extractYamlBlock(localContent, "instructions");

    const result = mergeWorkerYaml(templateContent, localContent);

    expect(userInstructions).not.toBeNull();
    // Verify every line from user instructions appears verbatim in merged output
    const instructionLines = userInstructions!.split("\n").filter((l) => l.trim() !== "");
    for (const line of instructionLines) {
      expect(result.merged).toContain(line.trimEnd());
    }
  });

  it("user data directories should be ignored in diff", () => {
    // Verify all user content paths are ignored
    const userPaths = [
      "companies/acme/knowledge/api.md",
      "workspace/threads/T-123.json",
      "workspace/learnings/learn-001.json",
      "workspace/orchestrator/state.json",
      "projects/my-project/prd.json",
      "repos/myapp/src/index.ts",
      "social-content/drafts/x/post.md",
    ];

    for (const path of userPaths) {
      expect(isIgnored(path)).toBe(true);
    }
  });

  it("merge should fall back to user version on any data loss", () => {
    // Simulate a scenario where merge would lose data
    const templateContent = "# Template\n\n## Learned Rules\n\nTemplate rules only";
    // Local has rules that can't be found after replacement (edge case)
    const localContent =
      "# Local\n\n## Learned Rules\n\n1. **Important rule** with special chars: `code` and [link](url)\n2. Another rule";

    const result = mergeCLAUDEmd(templateContent, localContent);

    // Regardless of outcome, user content must be preserved
    if (result.success) {
      expect(result.merged).toContain("Important rule");
      expect(result.merged).toContain("Another rule");
    } else {
      // If merge failed, should fall back to local content
      expect(result.merged).toBe(localContent);
    }
  });
});

// ============================================================================
// 8. Plan Generation
// ============================================================================

describe("Plan: File Purpose Description", () => {
  it("should describe worker files", () => {
    expect(
      describeNewFilePurpose("workers/my-worker/worker.yaml")
    ).toBe("New worker definition");
    expect(
      describeNewFilePurpose("workers/my-worker/skills/analyze.md")
    ).toBe("New worker skill");
  });

  it("should describe commands", () => {
    expect(
      describeNewFilePurpose(".claude/commands/my-command.md")
    ).toBe("New slash command");
  });

  it("should describe knowledge files", () => {
    expect(describeNewFilePurpose("knowledge/topic/guide.md")).toBe(
      "New knowledge base content"
    );
  });

  it("should describe .gitkeep files", () => {
    expect(describeNewFilePurpose("workspace/reports/.gitkeep")).toBe(
      "Directory placeholder"
    );
  });

  it("should describe version marker", () => {
    expect(describeNewFilePurpose(".hq-version")).toBe("Version marker");
  });

  it("should describe by extension as fallback", () => {
    expect(describeNewFilePurpose("some/path/file.md")).toBe(
      "Documentation"
    );
    expect(describeNewFilePurpose("some/path/config.yaml")).toBe(
      "Configuration"
    );
    expect(describeNewFilePurpose("some/path/data.json")).toBe(
      "Data/config file"
    );
    expect(describeNewFilePurpose("some/path/other.txt")).toBe(
      "Template file"
    );
  });
});

describe("Plan: High-Impact Detection", () => {
  it("should flag CLAUDE.md as high impact", () => {
    expect(isHighImpact(".claude/CLAUDE.md")).toBe(true);
    expect(getHighImpactWarning(".claude/CLAUDE.md")).toContain(
      "Learned Rules"
    );
  });

  it("should flag worker.yaml files as high impact", () => {
    expect(isHighImpact("workers/qa-tester/worker.yaml")).toBe(true);
  });

  it("should flag commands as high impact", () => {
    expect(isHighImpact(".claude/commands/learn.md")).toBe(true);
  });

  it("should flag agents.md as high impact", () => {
    expect(isHighImpact("agents.md")).toBe(true);
  });

  it("should NOT flag regular files as high impact", () => {
    expect(isHighImpact("MIGRATION.md")).toBe(false);
    expect(isHighImpact("knowledge/some-doc.md")).toBe(false);
  });
});

describe("Plan: Entry Generation", () => {
  it("should generate plan entries from diff results", () => {
    const diff: DiffResult = {
      NEW: [{ path: "new-file.md", category: "NEW" }],
      MODIFIED: [
        {
          path: ".claude/CLAUDE.md",
          category: "MODIFIED",
          mergeStrategy: "section_merge",
          impact: "HIGH",
        },
      ],
      DELETED: [{ path: "old-file.md", category: "DELETED" }],
      UNCHANGED: [{ path: "unchanged.md", category: "UNCHANGED" }],
      LOCAL_ONLY: [{ path: "my-file.md", category: "LOCAL_ONLY" }],
      RENAMED: [
        {
          path: "workers/new-loc/w.yaml",
          category: "RENAMED",
          oldPath: "workers/old-loc/w.yaml",
          newPath: "workers/new-loc/w.yaml",
        },
      ],
    };

    const entries = generatePlanEntries(diff);

    const addEntries = entries.filter((e) => e.action === "ADD");
    expect(addEntries).toHaveLength(1);
    expect(addEntries[0].path).toBe("new-file.md");

    const updateEntries = entries.filter((e) => e.action === "UPDATE");
    expect(updateEntries).toHaveLength(1);
    expect(updateEntries[0].path).toBe(".claude/CLAUDE.md");
    expect(updateEntries[0].isHighImpact).toBe(true);

    const removeEntries = entries.filter((e) => e.action === "REMOVE");
    expect(removeEntries).toHaveLength(1);

    const moveEntries = entries.filter((e) => e.action === "MOVE");
    expect(moveEntries).toHaveLength(1);
  });
});

describe("Plan: Summary Generation", () => {
  it("should compute correct counts", () => {
    const diff: DiffResult = {
      NEW: [
        { path: "a.md", category: "NEW" },
        { path: "b.md", category: "NEW" },
      ],
      MODIFIED: [
        {
          path: "c.md",
          category: "MODIFIED",
          isSpecial: true,
        },
      ],
      DELETED: [],
      UNCHANGED: [
        { path: "d.md", category: "UNCHANGED" },
        { path: "e.md", category: "UNCHANGED" },
        { path: "f.md", category: "UNCHANGED" },
      ],
      LOCAL_ONLY: [{ path: "g.md", category: "LOCAL_ONLY" }],
      RENAMED: [],
    };

    const summary = generatePlanSummary(diff);
    expect(summary.newCount).toBe(2);
    expect(summary.modifiedCount).toBe(1);
    expect(summary.deletedCount).toBe(0);
    expect(summary.renamedCount).toBe(0);
    expect(summary.unchangedCount).toBe(3);
    expect(summary.localOnlyCount).toBe(1);
    expect(summary.totalChanges).toBe(3); // 2 new + 1 modified
    expect(summary.specialFilesCount).toBe(1);
  });
});

describe("Plan: Sorting and Grouping", () => {
  it("should sort by impact level (HIGH first)", () => {
    const entries: PlanEntry[] = [
      {
        path: "low.md",
        action: "UPDATE",
        rationale: "",
        isHighImpact: false,
        impact: "LOW",
      },
      {
        path: "high.md",
        action: "UPDATE",
        rationale: "",
        isHighImpact: true,
        impact: "HIGH",
      },
      {
        path: "medium.md",
        action: "UPDATE",
        rationale: "",
        isHighImpact: false,
        impact: "MEDIUM",
      },
    ];

    const sorted = sortByImpact(entries);
    expect(sorted[0].path).toBe("high.md");
    expect(sorted[1].path).toBe("medium.md");
    expect(sorted[2].path).toBe("low.md");
  });

  it("should group by parent directory", () => {
    const entries: PlanEntry[] = [
      {
        path: "workers/qa/skill.md",
        action: "ADD",
        rationale: "",
        isHighImpact: false,
      },
      {
        path: "workers/qa/worker.yaml",
        action: "ADD",
        rationale: "",
        isHighImpact: false,
      },
      {
        path: "knowledge/topic.md",
        action: "ADD",
        rationale: "",
        isHighImpact: false,
      },
      {
        path: "root-file.md",
        action: "ADD",
        rationale: "",
        isHighImpact: false,
      },
    ];

    const groups = groupByDirectory(entries);
    expect(groups.has("workers/qa")).toBe(true);
    expect(groups.get("workers/qa")).toHaveLength(2);
    expect(groups.has("knowledge")).toBe(true);
    expect(groups.has("(root)")).toBe(true);
  });
});

describe("Plan: Markdown Formatting", () => {
  it("should produce valid markdown with all sections", () => {
    const plan = {
      currentVersion: "5.2.0",
      latestVersion: "5.4.0",
      timestamp: "2026-02-14T10:30:00Z",
      entries: [
        {
          path: "new-worker/worker.yaml",
          action: "ADD" as const,
          rationale: "New worker definition",
          isHighImpact: false,
        },
        {
          path: ".claude/CLAUDE.md",
          action: "UPDATE" as const,
          rationale: "Structure updated",
          isHighImpact: true,
          mergeStrategy: "section_merge",
          impact: "HIGH" as const,
        },
      ],
      summary: {
        newCount: 1,
        modifiedCount: 1,
        deletedCount: 0,
        renamedCount: 0,
        unchangedCount: 50,
        localOnlyCount: 10,
        totalChanges: 2,
        specialFilesCount: 1,
      },
      warnings: [],
    };

    const markdown = formatPlanMarkdown(plan);

    // Check heading
    expect(markdown).toContain(
      "# Migration Plan: v5.2.0 -> v5.4.0"
    );

    // Check summary table
    expect(markdown).toContain("| Files to add | 1 |");
    expect(markdown).toContain("| Files to update | 1 |");
    expect(markdown).toContain("| **Total changes** | **2** |");

    // Check sections
    expect(markdown).toContain("## [!] High-Impact Changes");
    expect(markdown).toContain("## Files to Update (1)");
    expect(markdown).toContain("## Files to Add (1)");
    expect(markdown).toContain("## Files to Remove (0)");
    expect(markdown).toContain("No files to remove.");

    // Check special files note
    expect(markdown).toContain("smart merge");
  });

  it("should include warnings section when warnings exist", () => {
    const plan = {
      currentVersion: "5.0.0",
      latestVersion: "5.4.0",
      timestamp: "2026-02-14T10:30:00Z",
      entries: [],
      summary: {
        newCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        renamedCount: 0,
        unchangedCount: 0,
        localOnlyCount: 0,
        totalChanges: 0,
        specialFilesCount: 0,
      },
      warnings: [
        "DELETED detection skipped (no previous template baseline)",
      ],
    };

    const markdown = formatPlanMarkdown(plan);
    expect(markdown).toContain("## Warnings");
    expect(markdown).toContain("DELETED detection skipped");
  });
});

// ============================================================================
// 9. Markdown Section Change Detection
// ============================================================================

describe("Merge: Markdown Section Changes", () => {
  it("should detect new sections in template", () => {
    const templateLines = [
      "# Title",
      "## Section A",
      "## Section B",
      "## Section C",
    ];
    const localLines = ["# Title", "## Section A", "## Section B"];

    const changes = detectMarkdownSectionChanges(
      templateLines,
      localLines
    );
    expect(changes.added).toContain("## Section C");
    expect(changes.removed).toHaveLength(0);
  });

  it("should detect removed sections", () => {
    const templateLines = ["# Title", "## Section A"];
    const localLines = [
      "# Title",
      "## Section A",
      "## Deprecated Section",
    ];

    const changes = detectMarkdownSectionChanges(
      templateLines,
      localLines
    );
    expect(changes.removed).toContain("## Deprecated Section");
    expect(changes.added).toHaveLength(0);
  });

  it("should detect both added and removed", () => {
    const templateLines = [
      "# Title",
      "## New Section",
      "## Shared",
    ];
    const localLines = [
      "# Title",
      "## Old Section",
      "## Shared",
    ];

    const changes = detectMarkdownSectionChanges(
      templateLines,
      localLines
    );
    expect(changes.added).toContain("## New Section");
    expect(changes.removed).toContain("## Old Section");
  });
});

// ============================================================================
// 10. Command Rules Section Preservation
// ============================================================================

describe("Merge: Command Rules Section", () => {
  it("should extract ## Rules section from command file", () => {
    const content = readFixture("command-with-rules.md");
    const rules = extractSection(content, "## Rules");
    expect(rules).not.toBeNull();
    expect(rules).toContain("Always check for duplicates");
    expect(rules).toContain("Tier 1 rules");
    expect(rules).toContain("Never exceed the max rule count");
  });

  it("should preserve rules in command with preserve_rules_section strategy", () => {
    expect(getMergeStrategy(".claude/commands/learn.md")).toBe(
      "preserve_rules_section"
    );
  });
});

// ============================================================================
// 11. Hash Computation
// ============================================================================

describe("Diff: Hash Computation", () => {
  it("should produce consistent hashes for same content", () => {
    const hash1 = computeHash("Hello, World!");
    const hash2 = computeHash("Hello, World!");
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different content", () => {
    const hash1 = computeHash("Hello");
    const hash2 = computeHash("World");
    expect(hash1).not.toBe(hash2);
  });

  it("should produce a hex string of expected length (SHA-256)", () => {
    const hash = computeHash("test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ============================================================================
// 12. Version Clue Completeness
// ============================================================================

describe("Version: Clue Registry Completeness", () => {
  it("should have 15 structural clues (priorities 2-16)", () => {
    const clues = getVersionClues();
    expect(clues.length).toBe(15);
  });

  it("should cover all major version ranges", () => {
    const clues = getVersionClues();
    const versions = clues.map((c) => c.versionFloor);
    expect(versions).toContain("1.0.0");
    expect(versions).toContain("2.0.0");
    expect(versions).toContain("3.0.0");
    expect(versions).toContain("3.2.0");
    expect(versions).toContain("3.3.0");
    expect(versions).toContain("4.0.0");
    expect(versions).toContain("5.0.0");
    expect(versions).toContain("5.1.0");
    expect(versions).toContain("5.2.0");
  });

  it("should have unique IDs for all clues", () => {
    const clues = getVersionClues();
    const ids = clues.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
