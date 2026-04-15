/**
 * Conflict resolution for hq share/sync (VLT-5 US-002).
 *
 * Interactive prompts in terminal mode; deterministic resolution via
 * --on-conflict flag for worker/skill callers.
 */

import * as fs from "fs";
import * as readline from "readline";

export type ConflictStrategy = "overwrite" | "keep" | "abort";

export interface ConflictInfo {
  path: string;
  localHash?: string;
  remoteHash?: string;
  localModified?: Date;
  remoteModified?: Date;
  direction: "push" | "pull";
}

export type ConflictResolution = "overwrite" | "keep" | "skip" | "diff" | "abort";

/**
 * Resolve a conflict interactively or via strategy flag.
 *
 * In non-interactive mode (strategy provided), returns deterministically:
 *   overwrite → "overwrite"
 *   keep → "keep"
 *   abort → "abort"
 *
 * In interactive mode (strategy undefined), prompts the user.
 */
export async function resolveConflict(
  conflict: ConflictInfo,
  strategy?: ConflictStrategy,
): Promise<ConflictResolution> {
  if (strategy) {
    return strategy === "abort" ? "abort" : strategy;
  }

  return promptConflict(conflict);
}

async function promptConflict(conflict: ConflictInfo): Promise<ConflictResolution> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  const direction = conflict.direction === "push"
    ? "Remote has a newer version"
    : "Local file has uncommitted edits";

  console.error(`\n  Conflict: ${conflict.path}`);
  console.error(`  ${direction}`);
  if (conflict.localModified) {
    console.error(`  Local modified:  ${conflict.localModified.toISOString()}`);
  }
  if (conflict.remoteModified) {
    console.error(`  Remote modified: ${conflict.remoteModified.toISOString()}`);
  }

  const options = conflict.direction === "push"
    ? "[o]verwrite remote / [k]eep remote / [d]iff / [a]bort"
    : "[o]verwrite local / [k]eep local / [d]iff / [s]kip";

  const answer = await new Promise<string>((resolve) => {
    rl.question(`  ${options}: `, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase());
    });
  });

  switch (answer) {
    case "o":
    case "overwrite":
      return "overwrite";
    case "k":
    case "keep":
      return "keep";
    case "d":
    case "diff":
      return "diff";
    case "s":
    case "skip":
      return "skip";
    case "a":
    case "abort":
      return "abort";
    default:
      // Default to keep (safe option)
      console.error("  Unrecognized choice, keeping current version.");
      return "keep";
  }
}

/**
 * Show a simple diff between local and remote content.
 * Returns the content strings for display.
 */
export function showDiff(
  localPath: string,
  remoteContent: Buffer,
): void {
  const localContent = fs.existsSync(localPath)
    ? fs.readFileSync(localPath, "utf-8")
    : "(file does not exist locally)";
  const remoteStr = remoteContent.toString("utf-8");

  console.error("\n--- LOCAL ---");
  console.error(localContent.slice(0, 2000));
  if (localContent.length > 2000) console.error("... (truncated)");

  console.error("\n--- REMOTE ---");
  console.error(remoteStr.slice(0, 2000));
  if (remoteStr.length > 2000) console.error("... (truncated)");
  console.error("");
}
