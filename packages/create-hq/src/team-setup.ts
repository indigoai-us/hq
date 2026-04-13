/**
 * Member team discovery + clone flow.
 *
 * For users who already have access to one or more HQ team repos via the
 * hq-team-sync GitHub App, enumerate their installations, find the {org}/hq
 * repo for each, present a checklist, and clone the selected repos into
 * companies/{slug}/.
 *
 * No backend involved — all data comes from api.github.com using the user's
 * GitHub App user token.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { createInterface } from "readline";
import chalk from "chalk";
import {
  type GitHubAuth,
  HQ_GITHUB_APP_SLUG,
  githubApi,
} from "./auth.js";
import { ensureCompanyStructure } from "./company-template.js";
import { stepStatus, success, warn, info } from "./ui.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GitHubInstallation {
  id: number;
  app_slug: string;
  account: {
    login: string;
    id: number;
    type: string;
  };
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  default_branch: string;
  owner: {
    login: string;
    id: number;
  };
}

export interface DiscoveredTeam {
  /** Org login (used as companies/{slug}/ directory name) */
  slug: string;
  /** Display name (defaults to org login). */
  name: string;
  /** GitHub HTML URL for the team repo. */
  repoHtmlUrl: string;
  /** HTTPS clone URL. */
  cloneUrl: string;
  /** GitHub installation ID for the App on this org. */
  installationId: number;
}

export interface MemberJoinResult {
  joined: DiscoveredTeam[];
  skipped: DiscoveredTeam[];
  failed: { team: DiscoveredTeam; error: string }[];
}

// ─── Bundled Team Commands ──────────────────────────────────────────────────

/** Team-specific commands bundled with create-hq (not part of core HQ template). */
const TEAM_COMMANDS = ["invite.md", "team-sync.md", "promote.md"];

/**
 * Install the bundled team management commands into .claude/commands/.
 * These ship with the create-hq npm package (in commands/) and are only
 * installed when a user joins or creates a team.
 *
 * Returns the list of files installed (skips files that already exist).
 */
export function installTeamCommands(hqRoot: string): string[] {
  const hqCommandsDir = path.join(hqRoot, ".claude", "commands");
  if (!fs.existsSync(hqCommandsDir)) {
    fs.mkdirSync(hqCommandsDir, { recursive: true });
  }

  // Resolve the bundled commands directory relative to this module.
  // In the built package: dist/team-setup.js → ../commands/
  const bundledDir = path.resolve(__dirname, "..", "commands");
  if (!fs.existsSync(bundledDir)) {
    // Fallback: running from source (ts-node / vitest)
    // src/team-setup.ts → ../commands/
    return [];
  }

  const installed: string[] = [];
  for (const file of TEAM_COMMANDS) {
    const src = path.join(bundledDir, file);
    const dest = path.join(hqCommandsDir, file);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest)) continue; // don't overwrite — user may have customized
    fs.copyFileSync(src, dest);
    installed.push(file);
  }
  return installed;
}

// ─── Command Symlinks ───────────────────────────────────────────────────────

export interface SymlinkResult {
  linked: string[];
  alreadyLinked: string[];
  skipped: string[];
  unlinked: string[];
}

/**
 * Link team-distributed commands into .claude/commands/ so they're
 * discoverable as slash commands. Mirrors the logic in /sync (Section 5).
 *
 * Naming convention: {slug}--{command}.md (double-dash separates team from command).
 * Symlinks use relative paths so they work regardless of HQ's absolute location.
 *
 * @param hqRoot  - The HQ root directory
 * @param slug    - Team slug (companies/{slug}/)
 */
export function linkTeamCommands(hqRoot: string, slug: string): SymlinkResult {
  const result: SymlinkResult = { linked: [], alreadyLinked: [], skipped: [], unlinked: [] };

  const teamCommandsDir = path.join(hqRoot, "companies", slug, ".claude", "commands");
  const hqCommandsDir = path.join(hqRoot, ".claude", "commands");

  // Ensure .claude/commands/ exists
  if (!fs.existsSync(hqCommandsDir)) {
    fs.mkdirSync(hqCommandsDir, { recursive: true });
  }

  // Scan for team commands
  if (!fs.existsSync(teamCommandsDir)) {
    return result;
  }

  const teamFiles = fs.readdirSync(teamCommandsDir).filter((f) => f.endsWith(".md"));
  if (teamFiles.length === 0) {
    return result;
  }

  // Create symlinks for new commands
  for (const file of teamFiles) {
    const symlinkName = `${slug}--${file}`;
    const symlinkPath = path.join(hqCommandsDir, symlinkName);
    // Relative path from .claude/commands/ to companies/{slug}/.claude/commands/
    const relativeSrc = path.join("..", "..", "companies", slug, ".claude", "commands", file);

    if (fs.existsSync(symlinkPath)) {
      const stats = fs.lstatSync(symlinkPath);
      if (stats.isSymbolicLink()) {
        const target = fs.readlinkSync(symlinkPath);
        if (target === relativeSrc) {
          result.alreadyLinked.push(symlinkName);
          continue;
        }
      }
      // Exists but is not the right symlink — skip to avoid collision
      result.skipped.push(symlinkName);
      continue;
    }

    try {
      fs.symlinkSync(relativeSrc, symlinkPath);
      result.linked.push(symlinkName);
    } catch {
      result.skipped.push(symlinkName);
    }
  }

  // Remove stale symlinks for this team
  const teamPattern = `${slug}--`;
  const existing = fs.readdirSync(hqCommandsDir).filter((f) => f.startsWith(teamPattern));
  const expectedNames = new Set(teamFiles.map((f) => `${slug}--${f}`));

  for (const link of existing) {
    const linkPath = path.join(hqCommandsDir, link);
    const stats = fs.lstatSync(linkPath);
    if (stats.isSymbolicLink() && !expectedNames.has(link)) {
      fs.unlinkSync(linkPath);
      result.unlinked.push(link);
    }
  }

  return result;
}

// ─── Prompt helper ──────────────────────────────────────────────────────────

function prompt(question: string, defaultVal?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultVal ? ` (${defaultVal})` : "";
  return new Promise((resolve) => {
    rl.question(`  ? ${question}${suffix} `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

// ─── Git with embedded token (mirrors admin-onboarding.ts) ──────────────────

function runGitWithToken(args: string[], cwd: string, auth: GitHubAuth): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-hq-git-"));
  const isWindows = process.platform === "win32";
  const askpassPath = path.join(tmpDir, isWindows ? "askpass.cmd" : "askpass.sh");

  try {
    if (isWindows) {
      fs.writeFileSync(
        askpassPath,
        `@echo off\nif "%~1"=="" (echo %GIT_TOKEN%) else (echo %GIT_TOKEN%)\n`,
        "utf-8"
      );
    } else {
      fs.writeFileSync(askpassPath, `#!/bin/sh\necho "$GIT_TOKEN"\n`, "utf-8");
      fs.chmodSync(askpassPath, 0o700);
    }

    execSync(`git -c credential.helper= ${args.join(" ")}`, {
      cwd,
      stdio: "pipe",
      env: {
        ...process.env,
        GIT_TOKEN: auth.access_token,
        GIT_ASKPASS: askpassPath,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
    });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function tokenAuthUrl(cloneUrl: string): string {
  const u = new URL(cloneUrl);
  u.username = "x-access-token";
  return u.toString();
}

// ─── Discovery ──────────────────────────────────────────────────────────────

async function fetchHqInstallations(auth: GitHubAuth): Promise<GitHubInstallation[]> {
  const data = await githubApi<{ installations: GitHubInstallation[] }>(
    "/user/installations?per_page=100",
    auth
  );
  return (data.installations ?? []).filter((i) => i.app_slug === HQ_GITHUB_APP_SLUG);
}

async function findHqReposInInstallation(
  auth: GitHubAuth,
  installation: GitHubInstallation
): Promise<GitHubRepo[]> {
  // GitHub App user token can list repos accessible through this installation
  const data = await githubApi<{ repositories: GitHubRepo[] }>(
    `/user/installations/${installation.id}/repositories?per_page=100`,
    auth
  );
  const repos = data.repositories ?? [];
  // Match repos named hq-* (e.g. hq-indigo, hq-frogbear)
  return repos.filter((r) => /^hq-.+$/i.test(r.name));
}

/**
 * Derive a team slug from the repo name. Repo naming convention: hq-{teamSlug}.
 * e.g. "hq-indigo" → "indigo", "hq-frogbear" → "frogbear"
 */
function teamSlugFromRepoName(repoName: string): string {
  return repoName.replace(/^hq-/i, "").toLowerCase();
}

/**
 * Enumerate the user's HQ team memberships by walking their App installations.
 * Returns one DiscoveredTeam per hq-* repo found across all installed orgs.
 */
export async function discoverTeams(auth: GitHubAuth): Promise<DiscoveredTeam[]> {
  const installations = await fetchHqInstallations(auth);
  const teams: DiscoveredTeam[] = [];

  for (const inst of installations) {
    try {
      const repos = await findHqReposInInstallation(auth, inst);
      for (const repo of repos) {
        const slug = teamSlugFromRepoName(repo.name);
        teams.push({
          slug,
          name: `${inst.account.login}/${slug}`,
          repoHtmlUrl: repo.html_url,
          cloneUrl: repo.clone_url,
          installationId: inst.id,
        });
      }
    } catch {
      // Per-installation errors should not abort the whole discovery
      continue;
    }
  }

  return teams;
}

// ─── Selection UI ───────────────────────────────────────────────────────────

/**
 * Present discovered teams as a numbered list with all pre-selected, and
 * let the user deselect any they want to skip.
 *
 * Input format:
 *   - empty / "all"  → keep all
 *   - "none"         → skip all
 *   - "1,3"          → deselect entries 1 and 3
 */
export async function selectTeams(
  teams: DiscoveredTeam[]
): Promise<{ selected: DiscoveredTeam[]; skipped: DiscoveredTeam[] }> {
  if (teams.length === 0) {
    return { selected: [], skipped: [] };
  }

  if (teams.length === 1) {
    console.log();
    console.log(chalk.bold("  Found 1 HQ team:"));
    console.log(chalk.green("  [✓] ") + chalk.white(teams[0].name));
    console.log();
    const answer = await prompt(`Set up ${chalk.cyan(teams[0].name)}? (Y/n)`, "y");
    if (answer.toLowerCase().startsWith("y")) {
      return { selected: [teams[0]], skipped: [] };
    }
    return { selected: [], skipped: [teams[0]] };
  }

  console.log();
  console.log(chalk.bold(`  Found ${teams.length} HQ teams (all pre-selected):`));
  for (let i = 0; i < teams.length; i++) {
    console.log(
      chalk.green("  [✓] ") + chalk.cyan(`${i + 1}. `) + chalk.white(teams[i].name)
    );
  }
  console.log();
  console.log(chalk.dim("  Press Enter to set up all, or type numbers to skip (e.g. 2,3)"));
  const answer = await prompt("Skip");

  if (!answer || answer.toLowerCase() === "all") {
    return { selected: [...teams], skipped: [] };
  }
  if (answer.toLowerCase() === "none") {
    return { selected: [], skipped: [...teams] };
  }

  const skipIdx = new Set(
    answer
      .split(",")
      .map((s) => parseInt(s.trim(), 10) - 1)
      .filter((n) => Number.isInteger(n) && n >= 0 && n < teams.length)
  );

  const selected = teams.filter((_, i) => !skipIdx.has(i));
  const skipped = teams.filter((_, i) => skipIdx.has(i));

  return { selected, skipped };
}

// ─── Clone ──────────────────────────────────────────────────────────────────

function cloneTeam(team: DiscoveredTeam, hqRoot: string, auth: GitHubAuth): string {
  const companiesDir = path.join(hqRoot, "companies");
  if (!fs.existsSync(companiesDir)) {
    fs.mkdirSync(companiesDir, { recursive: true });
  }

  const companyDir = path.join(companiesDir, team.slug);
  if (fs.existsSync(companyDir) && fs.readdirSync(companyDir).length > 0) {
    throw new Error(`companies/${team.slug}/ already exists and is not empty`);
  }

  const remoteUrl = tokenAuthUrl(team.cloneUrl);
  runGitWithToken(
    ["clone", `"${remoteUrl}"`, `"${companyDir}"`],
    companiesDir,
    auth
  );

  // Strip token from stored remote URL
  execSync(`git remote set-url origin "${team.cloneUrl}"`, {
    cwd: companyDir,
    stdio: "pipe",
  });

  // Make sure all standard subdirs exist
  ensureCompanyStructure(companyDir);

  return companyDir;
}

// ─── Main flow ──────────────────────────────────────────────────────────────

/**
 * Discover, select, and clone team repos for an authenticated member.
 *
 * Returns a result with joined / skipped / failed lists. Returns null if
 * the user has no HQ teams at all (caller can route to admin onboarding).
 */
export async function runMemberJoin(
  auth: GitHubAuth,
  hqRoot: string
): Promise<MemberJoinResult | null> {
  const discoveryLabel = "Looking up your HQ teams";
  stepStatus(discoveryLabel, "running");

  let teams: DiscoveredTeam[];
  try {
    teams = await discoverTeams(auth);
    stepStatus(discoveryLabel, "done");
  } catch (err) {
    stepStatus(discoveryLabel, "failed");
    const message = err instanceof Error ? err.message : String(err);
    warn(`Could not look up your teams: ${message}`);
    return null;
  }

  if (teams.length === 0) {
    return null;
  }

  const { selected, skipped } = await selectTeams(teams);
  if (selected.length === 0) {
    info("No teams selected — continuing.");
    return { joined: [], skipped, failed: [] };
  }

  const joined: DiscoveredTeam[] = [];
  const failed: { team: DiscoveredTeam; error: string }[] = [];

  for (const team of selected) {
    const label = `Cloning ${team.name} → companies/${team.slug}`;
    stepStatus(label, "running");
    try {
      cloneTeam(team, hqRoot, auth);
      stepStatus(label, "done");
      // Install bundled team commands (invite, sync, promote)
      const installed = installTeamCommands(hqRoot);
      if (installed.length > 0) {
        info(`Installed ${installed.length} team command${installed.length === 1 ? "" : "s"}: ${installed.join(", ")}`);
      }
      // Link team-distributed commands as slash commands
      const symlinks = linkTeamCommands(hqRoot, team.slug);
      if (symlinks.linked.length > 0) {
        info(`Linked ${symlinks.linked.length} team command${symlinks.linked.length === 1 ? "" : "s"} from ${team.name}`);
      }
      joined.push(team);
    } catch (err) {
      stepStatus(label, "failed");
      const message = err instanceof Error ? err.message : String(err);
      warn(`Could not set up ${team.name}: ${message}`);
      failed.push({ team, error: message });
    }
  }

  if (joined.length > 0) {
    success(
      `${joined.length} team${joined.length === 1 ? "" : "s"} ready`
    );
  }

  return { joined, skipped, failed };
}
