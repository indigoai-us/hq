/**
 * Recommended-packages flow for create-hq.
 *
 * After the hq-core scaffold is in place, read `core.yaml:recommended_packages`
 * and install each via `hq install <source>` (the hq-cli subcommand). The
 * `source` field carries the transport-appropriate identifier — npm name, git
 * URL + optional subpath + ref, or local path — so this client stays thin:
 * it doesn't parse transports; it just hands each source verbatim to
 * `hq install`.
 *
 * Honors three policies:
 *   1. Conditional predicates. Each entry may declare `conditional: <bash>`.
 *      If the predicate exits non-zero the pack is SKIPPED (not failed). This
 *      lets a pack opt out when the host lacks a prerequisite (e.g. gemini CLI).
 *   2. Install failure = warning (not fatal). Pack install is best-effort;
 *      `/setup --resume` and `/update-hq` retry. Scaffolding proceeds even if
 *      every pack fails.
 *   3. Hooks prompt. Passes `--allow-hooks` when `--full` is set (non-
 *      interactive); omits it for interactive mode so hq-cli can prompt.
 */

import * as path from "path";
import { execFileSync, spawnSync } from "child_process";
import fs from "fs-extra";
import chalk from "chalk";

export interface RecommendedPackage {
  source: string;
  description?: string;
  conditional?: string;
}

export interface InstallMode {
  /** skip all packs (from --minimal or user decline) */
  skip: boolean;
  /** install all packs without prompting per-entry (from --full) */
  all: boolean;
}

export interface InstallOutcome {
  source: string;
  status: "installed" | "skipped" | "failed";
  reason?: string;
}

/**
 * Read `recommended_packages` from an hq-core-style core.yaml. Uses minimal
 * line-based parsing to avoid adding js-yaml as a dependency — matches
 * `packages.ts`'s approach for the same reason.
 *
 * Expected shape in core.yaml:
 *   recommended_packages:
 *     - source: '...'
 *       description: '...'
 *       conditional: '...'
 *     - source: '...'
 *       description: '...'
 */
export function readRecommendedPackages(hqRoot: string): RecommendedPackage[] {
  const coreYamlPath = path.join(hqRoot, "core.yaml");
  if (!fs.existsSync(coreYamlPath)) return [];

  const content = fs.readFileSync(coreYamlPath, "utf-8");
  const lines = content.split("\n");

  const entries: RecommendedPackage[] = [];
  let inBlock = false;
  let current: Partial<RecommendedPackage> | null = null;

  const headerRe = /^recommended_packages\s*:\s*$/;
  const entryStartRe = /^\s*-\s+source\s*:\s*(.+?)\s*$/;
  const fieldRe = /^\s{4,}(\w+)\s*:\s*(.+?)\s*$/;
  const topLevelRe = /^[A-Za-z_][\w-]*\s*:/;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    if (!inBlock) {
      if (headerRe.test(line)) inBlock = true;
      continue;
    }

    // Leaving the block: another top-level key at col 0.
    if (line.length > 0 && topLevelRe.test(line) && !line.startsWith(" ")) {
      if (current?.source) entries.push(current as RecommendedPackage);
      current = null;
      inBlock = false;
      break;
    }

    const startMatch = entryStartRe.exec(line);
    if (startMatch) {
      if (current?.source) entries.push(current as RecommendedPackage);
      current = { source: stripQuotes(startMatch[1]) };
      continue;
    }

    const fieldMatch = fieldRe.exec(line);
    if (fieldMatch && current) {
      const key = fieldMatch[1];
      const val = stripQuotes(fieldMatch[2]);
      if (key === "description") current.description = val;
      else if (key === "conditional") current.conditional = val;
    }
  }

  if (current?.source) entries.push(current as RecommendedPackage);
  return entries;
}

function stripQuotes(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Evaluate a `conditional` bash expression. Returns true when the predicate
 * exits 0 (pack applicable); false otherwise (pack should be skipped).
 * Never throws — a malformed predicate is treated as "skip".
 *
 * NOTE: This runs arbitrary bash from the fetched `core.yaml`. Call sites
 * MUST gate evaluation on user approval (interactive confirm, or explicit
 * `--full` / `--allow-hooks` trust escalation). See `installRecommendedPackage`.
 */
export function evaluateConditional(expr: string): boolean {
  try {
    const result = spawnSync("bash", ["-c", expr], { stdio: "ignore" });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Check whether a pack is already registered in modules.yaml with
 * `strategy: package`. Uses line parsing (no yaml dep). Matches by source
 * string — cheap but sufficient for the "don't re-prompt already-installed"
 * path. Returns the list of already-installed sources.
 */
export function readInstalledPackSources(hqRoot: string): Set<string> {
  const candidates = [
    path.join(hqRoot, "modules", "modules.yaml"),
    path.join(hqRoot, "modules.yaml"),
  ];
  const modulesPath = candidates.find((p) => fs.existsSync(p));
  if (!modulesPath) return new Set();

  const content = fs.readFileSync(modulesPath, "utf-8");
  const sourceRe = /^\s+source\s*:\s*["']?([^"'\r\n]+)["']?\s*$/gm;
  const sources = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = sourceRe.exec(content)) !== null) {
    sources.add(m[1]);
  }
  return sources;
}

/**
 * Install a single recommended package via `hq install <source>`. Runs the
 * hq-cli as a subprocess so we don't duplicate transport logic here. Returns
 * outcome as a discriminated union for the summary table.
 */
export function installRecommendedPackage(
  hqRoot: string,
  entry: RecommendedPackage,
  opts: { allowHooks: boolean },
): InstallOutcome {
  // Conditional evaluation is arbitrary bash — only run it under ambient
  // trust (i.e. the caller already escalated via `--full`, which passes
  // `allowHooks: true`). Otherwise we defer the check to hq-cli, which
  // prompts before evaluating. This keeps `create-hq` from silently
  // executing remote code against a user's shell.
  if (entry.conditional && opts.allowHooks) {
    if (!evaluateConditional(entry.conditional)) {
      return {
        source: entry.source,
        status: "skipped",
        reason: `conditional predicate returned non-zero: ${entry.conditional}`,
      };
    }
  }

  // Prefer `npx --yes @indigoai-us/hq-cli install <source>` so we don't require
  // a global install. When an older hq-cli is on PATH we still defer to npx —
  // the published hq-cli will self-bootstrap via `--yes`.
  //
  // Arguments are passed as an argv array — never interpolated into a shell
  // string — so a crafted `entry.source` cannot escape into the parent shell.
  const args = ["--yes", "@indigoai-us/hq-cli", "install", entry.source];
  if (opts.allowHooks) args.push("--allow-hooks");

  try {
    execFileSync("npx", args, { cwd: hqRoot, stdio: "inherit" });
    return { source: entry.source, status: "installed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source: entry.source, status: "failed", reason: msg };
  }
}

/**
 * Batch-install all recommended packages. `mode.skip` short-circuits (returns
 * empty array). `mode.all` installs every applicable pack; otherwise the
 * caller is expected to have already surfaced per-pack prompts and filtered
 * the list before calling.
 */
export function installRecommendedPackages(
  hqRoot: string,
  entries: RecommendedPackage[],
  opts: { allowHooks: boolean },
): InstallOutcome[] {
  const outcomes: InstallOutcome[] = [];
  for (const entry of entries) {
    const outcome = installRecommendedPackage(hqRoot, entry, opts);
    outcomes.push(outcome);
    printOutcome(outcome);
  }
  return outcomes;
}

function printOutcome(outcome: InstallOutcome): void {
  const src = chalk.cyan(outcome.source);
  switch (outcome.status) {
    case "installed":
      console.log(`  ${chalk.green("✓")} installed ${src}`);
      break;
    case "skipped":
      console.log(`  ${chalk.dim("•")} skipped  ${src} ${chalk.dim(`— ${outcome.reason ?? ""}`)}`);
      break;
    case "failed":
      console.log(`  ${chalk.yellow("!")} failed   ${src} ${chalk.dim(`— ${outcome.reason ?? ""}`)}`);
      console.log(`    ${chalk.dim("retry later:")} hq install "${outcome.source}"`);
      break;
  }
}

/**
 * Summarize a batch install for the end-of-scaffold report.
 */
export function summarizeOutcomes(outcomes: InstallOutcome[]): {
  installed: number;
  skipped: number;
  failed: number;
} {
  let installed = 0, skipped = 0, failed = 0;
  for (const o of outcomes) {
    if (o.status === "installed") installed++;
    else if (o.status === "skipped") skipped++;
    else failed++;
  }
  return { installed, skipped, failed };
}
