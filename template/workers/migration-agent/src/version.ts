/**
 * Version detection utilities for HQ migration.
 *
 * Extracted from skills/analyze.md Steps 1a-1c.
 * Detects current HQ version from .hq-version file or filesystem inference.
 */

export interface VersionResult {
  version: string;
  method: "file" | "inference";
  clues?: string[];
}

/**
 * Parse a .hq-version file content and return the semver string.
 * Returns null if the content is invalid.
 */
export function parseVersionFile(content: string): string | null {
  const trimmed = content.trim();
  // Must be a semver-like string: digits.digits.digits (optionally with pre-release)
  if (/^\d+\.\d+\.\d+/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Structural clues for version inference, ordered by priority.
 * Each clue has a check function and a version floor.
 */
export interface VersionClue {
  id: string;
  description: string;
  versionFloor: string;
  check: (fs: InferenceFilesystem) => boolean;
}

/**
 * Minimal filesystem interface for version inference.
 * Tests provide mock implementations.
 */
export interface InferenceFilesystem {
  fileExists(path: string): boolean;
  isSymlink(path: string): boolean;
  readFile(path: string): string | null;
  listDir(path: string): string[];
}

/**
 * Parse a CHANGELOG.md to extract the first version heading.
 * Returns null if no version heading found.
 */
export function parseChangelogVersion(content: string): string | null {
  const match = content.match(/^##\s+v?(\d+\.\d+\.\d+)/m);
  return match ? match[1] : null;
}

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b
 *   0 if a === b
 *   1 if a > b
 */
export function compareSemver(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * Define all structural clues for version inference.
 * Priority 2-16 from analyze.md (priority 1 is CHANGELOG, handled separately).
 */
export function getVersionClues(): VersionClue[] {
  return [
    {
      id: "setup-cli-checks",
      description: "/setup has CLI checks (gh, vercel)",
      versionFloor: "5.2.0",
      check: (fs) => {
        const content = fs.readFile(".claude/commands/setup.md");
        return content !== null && content.includes("vercel");
      },
    },
    {
      id: "knowledge-symlinks",
      description: "Knowledge dirs are symlinks to repos/",
      versionFloor: "5.2.0",
      check: (fs) => {
        const entries = fs.listDir("knowledge/");
        return entries.some((e) => fs.isSymlink(`knowledge/${e}`));
      },
    },
    {
      id: "context-diet",
      description: "Context Diet in CLAUDE.md",
      versionFloor: "5.1.0",
      check: (fs) => {
        const content = fs.readFile(".claude/CLAUDE.md");
        return content !== null && content.includes("Context Diet");
      },
    },
    {
      id: "sample-worker",
      description: "workers/sample-worker/ exists",
      versionFloor: "5.0.0",
      check: (fs) => fs.fileExists("workers/sample-worker"),
    },
    {
      id: "personal-interview",
      description: "/personal-interview command",
      versionFloor: "5.0.0",
      check: (fs) => fs.fileExists(".claude/commands/personal-interview.md"),
    },
    {
      id: "registry-version",
      description: "workers/registry.yaml version field",
      versionFloor: "5.0.0",
      check: (fs) => {
        const content = fs.readFile("workers/registry.yaml");
        return content !== null && /^version:/m.test(content);
      },
    },
    {
      id: "learn-command",
      description: ".claude/commands/learn.md exists",
      versionFloor: "4.0.0",
      check: (fs) => fs.fileExists(".claude/commands/learn.md"),
    },
    {
      id: "index-md-system",
      description: "INDEX.md system active",
      versionFloor: "4.0.0",
      check: (fs) => fs.fileExists("knowledge/hq-core/index-md-spec.md"),
    },
    {
      id: "auto-handoff",
      description: "Auto-Handoff in CLAUDE.md",
      versionFloor: "3.3.0",
      check: (fs) => {
        const content = fs.readFile(".claude/CLAUDE.md");
        return content !== null && content.includes("Auto-Handoff");
      },
    },
    {
      id: "remember-command",
      description: "/remember command exists",
      versionFloor: "3.2.0",
      check: (fs) => fs.fileExists(".claude/commands/remember.md"),
    },
    {
      id: "search-qmd",
      description: "/search uses qmd",
      versionFloor: "3.0.0",
      check: (fs) => {
        const content = fs.readFile(".claude/commands/search.md");
        return content !== null && content.includes("qmd");
      },
    },
    {
      id: "orchestrator",
      description: "workspace/orchestrator/ exists",
      versionFloor: "2.0.0",
      check: (fs) => fs.fileExists("workspace/orchestrator"),
    },
    {
      id: "threads",
      description: "workspace/threads/ exists",
      versionFloor: "2.0.0",
      check: (fs) => fs.fileExists("workspace/threads"),
    },
    {
      id: "dev-team-workers",
      description: "workers/dev-team/ has 10+ workers",
      versionFloor: "2.0.0",
      check: (fs) => {
        const entries = fs.listDir("workers/dev-team/");
        return entries.length >= 10;
      },
    },
    {
      id: "commands-dir",
      description: ".claude/commands/ exists",
      versionFloor: "1.0.0",
      check: (fs) => fs.fileExists(".claude/commands"),
    },
  ];
}

/**
 * Infer the HQ version from filesystem structure.
 * Returns the highest matching version floor, or "unknown" if nothing matches.
 */
export function inferVersion(fs: InferenceFilesystem): VersionResult {
  // Priority 1: Check CHANGELOG for exact version
  const changelog = fs.readFile("CHANGELOG.md");
  if (changelog) {
    const exactVersion = parseChangelogVersion(changelog);
    if (exactVersion) {
      return {
        version: exactVersion,
        method: "inference",
        clues: ["CHANGELOG.md exact version"],
      };
    }
  }

  // Priority 2-16: Structural checks
  const clues = getVersionClues();
  let highestVersion = "0.0.0";
  const matchedClues: string[] = [];

  for (const clue of clues) {
    try {
      if (clue.check(fs)) {
        matchedClues.push(clue.description);
        if (compareSemver(clue.versionFloor, highestVersion) > 0) {
          highestVersion = clue.versionFloor;
        }
      }
    } catch {
      // Skip clues that throw (e.g., missing directories)
    }
  }

  if (highestVersion === "0.0.0") {
    return {
      version: "unknown",
      method: "inference",
      clues: [],
    };
  }

  return {
    version: highestVersion,
    method: "inference",
    clues: matchedClues,
  };
}

/**
 * Detect the current HQ version using .hq-version file or filesystem inference.
 */
export function detectVersion(fs: InferenceFilesystem): VersionResult {
  // Step 1a: Direct detection from .hq-version
  const versionFileContent = fs.readFile(".hq-version");
  if (versionFileContent !== null) {
    const parsed = parseVersionFile(versionFileContent);
    if (parsed) {
      return { version: parsed, method: "file" };
    }
  }

  // Step 1b: Filesystem inference
  return inferVersion(fs);
}
