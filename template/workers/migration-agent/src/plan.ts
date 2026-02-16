/**
 * Migration plan generation utilities.
 *
 * Extracted from skills/analyze.md Step 5.
 * Transforms raw diff results into a human-readable migration plan.
 */

import type { DiffResult, DiffEntry } from "./diff.js";

export interface PlanEntry {
  path: string;
  action: "ADD" | "UPDATE" | "REMOVE" | "MOVE";
  rationale: string;
  isHighImpact: boolean;
  mergeStrategy?: string;
  impact?: "HIGH" | "MEDIUM" | "LOW";
  oldPath?: string;
  newPath?: string;
}

export interface MigrationPlan {
  currentVersion: string;
  latestVersion: string;
  timestamp: string;
  entries: PlanEntry[];
  summary: PlanSummary;
  warnings: string[];
}

export interface PlanSummary {
  newCount: number;
  modifiedCount: number;
  deletedCount: number;
  renamedCount: number;
  unchangedCount: number;
  localOnlyCount: number;
  totalChanges: number;
  specialFilesCount: number;
}

/**
 * Describe the purpose of a new file based on its path.
 * From analyze.md section 5c describe_new_file_purpose.
 */
export function describeNewFilePurpose(path: string): string {
  if (path.includes("worker") && path.endsWith("worker.yaml")) {
    return "New worker definition";
  }
  if (path.includes("worker") && path.includes("skills/")) {
    return "New worker skill";
  }
  if (path.startsWith(".claude/commands/")) {
    return "New slash command";
  }
  if (path.startsWith("knowledge/")) {
    return "New knowledge base content";
  }
  if (path.endsWith(".gitkeep")) {
    return "Directory placeholder";
  }
  if (path.startsWith("workspace/")) {
    return "Workspace structure";
  }
  if (path === "MIGRATION.md" || path === "CHANGELOG.md") {
    return "Template documentation";
  }
  if (path === ".hq-version") {
    return "Version marker";
  }

  const ext = path.substring(path.lastIndexOf("."));
  if (ext === ".md") return "Documentation";
  if (ext === ".yaml" || ext === ".yml") return "Configuration";
  if (ext === ".json") return "Data/config file";
  return "Template file";
}

/**
 * High-impact file patterns and their warnings.
 * From analyze.md section 5a.
 */
const HIGH_IMPACT_PATTERNS: Array<{
  pattern: string;
  warning: string;
  isGlob: boolean;
}> = [
  {
    pattern: ".claude/CLAUDE.md",
    warning:
      "HEADS UP: This affects ALL Claude sessions. Your Learned Rules will be preserved.",
    isGlob: false,
  },
  {
    pattern: "workers/*/worker.yaml",
    warning:
      "Worker behavior may change. Your custom instructions will be preserved.",
    isGlob: true,
  },
  {
    pattern: "workers/registry.yaml",
    warning:
      "Worker discovery index updated. New workers added, your entries preserved.",
    isGlob: false,
  },
  {
    pattern: ".claude/commands/*.md",
    warning:
      "Command behavior may change. Your custom Rules section will be preserved.",
    isGlob: true,
  },
  {
    pattern: "agents.md",
    warning:
      "Personal profile -- NEVER overwritten. Structure-only comparison.",
    isGlob: false,
  },
];

/**
 * Simple glob match (same as in diff.ts).
 */
function globMatch(pattern: string, path: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${regexStr}$`).test(path);
}

/**
 * Check if a file path matches a high-impact pattern.
 */
export function isHighImpact(path: string): boolean {
  return HIGH_IMPACT_PATTERNS.some((p) =>
    p.isGlob ? globMatch(p.pattern, path) : p.pattern === path
  );
}

/**
 * Get the high-impact warning for a file path.
 */
export function getHighImpactWarning(path: string): string | null {
  const match = HIGH_IMPACT_PATTERNS.find((p) =>
    p.isGlob ? globMatch(p.pattern, path) : p.pattern === path
  );
  return match?.warning ?? null;
}

/**
 * Generate plan entries from diff results.
 */
export function generatePlanEntries(diff: DiffResult): PlanEntry[] {
  const entries: PlanEntry[] = [];

  // NEW -> ADD
  for (const entry of diff.NEW) {
    entries.push({
      path: entry.path,
      action: "ADD",
      rationale: describeNewFilePurpose(entry.path),
      isHighImpact: isHighImpact(entry.path),
    });
  }

  // MODIFIED -> UPDATE
  for (const entry of diff.MODIFIED) {
    entries.push({
      path: entry.path,
      action: "UPDATE",
      rationale: entry.diffSummary ?? "Content differs from template",
      isHighImpact: isHighImpact(entry.path),
      mergeStrategy: entry.mergeStrategy,
      impact: entry.impact,
    });
  }

  // DELETED -> REMOVE
  for (const entry of diff.DELETED) {
    entries.push({
      path: entry.path,
      action: "REMOVE",
      rationale:
        "Removed from template (will be archived to backup, not hard-deleted)",
      isHighImpact: false,
    });
  }

  // RENAMED -> MOVE
  for (const entry of diff.RENAMED) {
    entries.push({
      path: entry.newPath ?? entry.path,
      action: "MOVE",
      rationale: `Moved from ${entry.oldPath} to ${entry.newPath}`,
      isHighImpact: false,
      oldPath: entry.oldPath,
      newPath: entry.newPath,
    });
  }

  return entries;
}

/**
 * Generate plan summary from diff results.
 */
export function generatePlanSummary(diff: DiffResult): PlanSummary {
  const specialCount = diff.MODIFIED.filter(
    (e) => e.isSpecial === true
  ).length;

  return {
    newCount: diff.NEW.length,
    modifiedCount: diff.MODIFIED.length,
    deletedCount: diff.DELETED.length,
    renamedCount: diff.RENAMED.length,
    unchangedCount: diff.UNCHANGED.length,
    localOnlyCount: diff.LOCAL_ONLY.length,
    totalChanges:
      diff.NEW.length +
      diff.MODIFIED.length +
      diff.DELETED.length +
      diff.RENAMED.length,
    specialFilesCount: specialCount,
  };
}

/**
 * Sort modified entries by impact level (HIGH first, then MEDIUM, then LOW).
 * From analyze.md section 5f.
 */
export function sortByImpact(entries: PlanEntry[]): PlanEntry[] {
  const impactOrder: Record<string, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };

  return [...entries].sort((a, b) => {
    const aOrder = impactOrder[a.impact ?? "LOW"] ?? 2;
    const bOrder = impactOrder[b.impact ?? "LOW"] ?? 2;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.path.localeCompare(b.path);
  });
}

/**
 * Group entries by parent directory.
 * From analyze.md section 5f.
 */
export function groupByDirectory(
  entries: PlanEntry[]
): Map<string, PlanEntry[]> {
  const groups = new Map<string, PlanEntry[]>();

  for (const entry of entries) {
    const lastSlash = entry.path.lastIndexOf("/");
    const dir = lastSlash >= 0 ? entry.path.substring(0, lastSlash) : "(root)";

    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    groups.get(dir)!.push(entry);
  }

  // Sort entries within each group alphabetically
  for (const [, groupEntries] of groups) {
    groupEntries.sort((a, b) => a.path.localeCompare(b.path));
  }

  return groups;
}

/**
 * Format a migration plan as markdown.
 * From analyze.md section 5d.
 */
export function formatPlanMarkdown(plan: MigrationPlan): string {
  const lines: string[] = [];

  lines.push(
    `# Migration Plan: v${plan.currentVersion} -> v${plan.latestVersion}`
  );
  lines.push("");
  lines.push(`Generated: ${plan.timestamp}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Files to add | ${plan.summary.newCount} |`);
  lines.push(`| Files to update | ${plan.summary.modifiedCount} |`);
  lines.push(`| Files to remove | ${plan.summary.deletedCount} |`);
  lines.push(
    `| Files to move/rename | ${plan.summary.renamedCount} |`
  );
  lines.push(`| **Total changes** | **${plan.summary.totalChanges}** |`);
  lines.push(`| Unchanged files | ${plan.summary.unchangedCount} |`);
  lines.push(
    `| Your custom files (untouched) | ${plan.summary.localOnlyCount} |`
  );

  if (plan.summary.specialFilesCount > 0) {
    lines.push("");
    lines.push(
      `**${plan.summary.specialFilesCount} file(s) require smart merge** (user data preserved, template structure updated)`
    );
  }

  // High-Impact Changes
  const highImpactEntries = plan.entries.filter((e) => e.isHighImpact);
  if (highImpactEntries.length > 0) {
    lines.push("");
    lines.push("## [!] High-Impact Changes");
    lines.push("");
    for (const entry of highImpactEntries) {
      const warning = getHighImpactWarning(entry.path) ?? "";
      lines.push(`- **${entry.path}** -- ${warning}`);
      lines.push(
        `  Action: ${entry.action} | Strategy: ${entry.mergeStrategy ?? "overwrite"}`
      );
    }
  }

  // Files to Update
  const updateEntries = plan.entries.filter((e) => e.action === "UPDATE");
  lines.push("");
  lines.push(`## Files to Update (${updateEntries.length})`);
  lines.push("");
  for (const entry of sortByImpact(updateEntries)) {
    if (entry.isHighImpact) {
      lines.push(`- [!] \`${entry.path}\` -- ${entry.rationale}`);
    } else {
      lines.push(`- \`${entry.path}\` -- ${entry.rationale}`);
    }
  }

  // Files to Add
  const addEntries = plan.entries.filter((e) => e.action === "ADD");
  lines.push("");
  lines.push(`## Files to Add (${addEntries.length})`);
  lines.push("");
  for (const entry of addEntries) {
    lines.push(`- \`${entry.path}\` -- ${entry.rationale}`);
  }

  // Files to Remove
  const removeEntries = plan.entries.filter((e) => e.action === "REMOVE");
  lines.push("");
  lines.push(`## Files to Remove (${removeEntries.length})`);
  lines.push("");
  if (removeEntries.length === 0) {
    lines.push("No files to remove.");
  } else {
    for (const entry of removeEntries) {
      lines.push(`- \`${entry.path}\` -- ${entry.rationale}`);
    }
  }

  // Structural Changes
  const moveEntries = plan.entries.filter((e) => e.action === "MOVE");
  lines.push("");
  lines.push(`## Structural Changes (${moveEntries.length})`);
  lines.push("");
  if (moveEntries.length === 0) {
    lines.push("No files moved or renamed.");
  } else {
    for (const entry of moveEntries) {
      lines.push(`- \`${entry.oldPath}\` -> \`${entry.newPath}\``);
    }
  }

  // Warnings
  if (plan.warnings.length > 0) {
    lines.push("");
    lines.push("## Warnings");
    lines.push("");
    for (const warning of plan.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}
