/**
 * Team setup for create-hq — team discovery, clone, sparse checkout (US-005)
 *
 * After a user authenticates via device code flow, this module:
 * 1. Fetches available teams from /api/teams
 * 2. Presents team selection UI
 * 3. For each selected team: fetches entitlements + repo config
 * 4. Clones the team repo with sparse checkout (entitled paths only)
 * 5. Sets up companies/{team-slug}/ directory structure
 */

import * as fs from "fs";
import * as path from "path";
import { createInterface } from "readline";
import { execSync } from "child_process";
import chalk from "chalk";
import type { AuthToken } from "./auth.js";
import { stepStatus, success, warn, info } from "./ui.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  member_count?: number;
  role?: string;
}

interface TeamEntitlement {
  pack_slug: string;
  paths: string[];
}

interface RepoConfig {
  repo_url: string;
  git_credentials: {
    username: string;
    password: string;
  };
  default_branch: string;
}

// ─── API helpers ────────────────────────────────────────────────────────────

const API_BASE = "https://hq.indigoai.com/api";

async function apiGet<T>(urlPath: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${urlPath}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${urlPath} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as T;
}

// ─── Team discovery ─────────────────────────────────────────────────────────

/** Fetch teams the authenticated user belongs to. */
export async function fetchTeams(token: string): Promise<Team[]> {
  const data = await apiGet<{ teams: Team[] }>("/teams", token);
  return data.teams ?? [];
}

/** Fetch entitlements (entitled content paths) for a specific team. */
async function fetchTeamEntitlements(
  teamId: string,
  token: string
): Promise<TeamEntitlement[]> {
  const data = await apiGet<{ entitlements: TeamEntitlement[] }>(
    `/teams/${encodeURIComponent(teamId)}/entitlements`,
    token
  );
  return data.entitlements ?? [];
}

/** Fetch repo config (clone URL + credentials) for a specific team. */
async function fetchRepoConfig(
  teamId: string,
  token: string
): Promise<RepoConfig> {
  return apiGet<RepoConfig>(
    `/teams/${encodeURIComponent(teamId)}/repo-config`,
    token
  );
}

// ─── Team selection TUI ─────────────────────────────────────────────────────

function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ? ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Display teams and let user select which to join.
 * Returns the selected teams.
 */
export async function selectTeams(teams: Team[]): Promise<Team[]> {
  if (teams.length === 0) {
    return [];
  }

  if (teams.length === 1) {
    console.log();
    console.log(chalk.bold("  Your team:"));
    console.log(
      chalk.green("  [1] ") +
        chalk.white(teams[0].name) +
        (teams[0].description ? chalk.dim(` — ${teams[0].description}`) : "")
    );
    console.log();

    const answer = await promptLine(
      `Join ${chalk.cyan(teams[0].name)}? (Y/n)`
    );
    if (answer && !answer.toLowerCase().startsWith("y")) {
      return [];
    }
    return [teams[0]];
  }

  // Multiple teams — show numbered list
  console.log();
  console.log(chalk.bold("  Your teams:"));
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const roleTag = team.role ? chalk.dim(` [${team.role}]`) : "";
    console.log(
      chalk.cyan(`  [${i + 1}] `) +
        chalk.white(team.name) +
        roleTag +
        (team.description ? chalk.dim(` — ${team.description}`) : "")
    );
  }
  console.log();

  const answer = await promptLine(
    `Select teams to join (e.g. ${chalk.dim("1,2")} or ${chalk.dim("all")})`
  );

  if (!answer || answer.toLowerCase() === "all") {
    return [...teams];
  }

  const indices = answer
    .split(",")
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((i) => i >= 0 && i < teams.length);

  if (indices.length === 0) {
    warn("No valid selection — skipping team setup");
    return [];
  }

  return indices.map((i) => teams[i]);
}

// ─── Git clone with sparse checkout ─────────────────────────────────────────

/**
 * Clone a team repo into companies/{team-slug}/ with sparse checkout
 * configured to only check out entitled paths.
 */
function cloneWithSparseCheckout(
  repoConfig: RepoConfig,
  entitledPaths: string[],
  targetDir: string
): void {
  // Build authenticated URL
  const repoUrl = new URL(repoConfig.repo_url);
  repoUrl.username = repoConfig.git_credentials.username;
  repoUrl.password = repoConfig.git_credentials.password;

  // Clone with no checkout first
  execSync(
    `git clone --no-checkout --filter=blob:none "${repoUrl.toString()}" "${targetDir}"`,
    { stdio: "pipe" }
  );

  // Enable sparse checkout
  execSync("git sparse-checkout init --cone", {
    cwd: targetDir,
    stdio: "pipe",
  });

  // Configure sparse checkout paths
  if (entitledPaths.length > 0) {
    const pathList = entitledPaths.join(" ");
    execSync(`git sparse-checkout set ${pathList}`, {
      cwd: targetDir,
      stdio: "pipe",
    });
  }

  // Checkout default branch
  execSync(`git checkout ${repoConfig.default_branch}`, {
    cwd: targetDir,
    stdio: "pipe",
  });

  // Strip credentials from the remote URL (store clean URL only)
  execSync(`git remote set-url origin "${repoConfig.repo_url}"`, {
    cwd: targetDir,
    stdio: "pipe",
  });
}

// ─── Company directory structure ────────────────────────────────────────────

/**
 * Ensure the standard company directory structure exists inside
 * companies/{team-slug}/.
 */
function ensureCompanyStructure(companyDir: string, team: Team): void {
  const dirs = [
    "knowledge",
    "settings",
    "data",
    "workers",
    "repos",
    "projects",
    "policies",
  ];

  for (const dir of dirs) {
    const fullPath = path.join(companyDir, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // Write a minimal team metadata file
  const metadataPath = path.join(companyDir, "team.json");
  if (!fs.existsSync(metadataPath)) {
    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          team_id: team.id,
          team_name: team.name,
          team_slug: team.slug,
          joined_at: new Date().toISOString(),
        },
        null,
        2
      ) + "\n",
      "utf-8"
    );
  }
}

// ─── Main team setup flow ───────────────────────────────────────────────────

export interface TeamSetupResult {
  teams: Team[];
  companySlugs: string[];
}

/**
 * Run the full team setup flow:
 * 1. Fetch teams → 2. Select → 3. For each: entitlements + clone + structure
 *
 * Returns the list of set-up teams and their company slugs.
 */
export async function setupTeams(
  authToken: AuthToken,
  hqRoot: string
): Promise<TeamSetupResult> {
  const result: TeamSetupResult = { teams: [], companySlugs: [] };

  // 1. Fetch available teams
  const teamsLabel = "Discovering your teams";
  stepStatus(teamsLabel, "running");

  let teams: Team[];
  try {
    teams = await fetchTeams(authToken.clerk_session_token);
    stepStatus(teamsLabel, "done");
  } catch (err) {
    stepStatus(teamsLabel, "failed");
    warn(
      `Could not fetch teams: ${err instanceof Error ? err.message : "Unknown error"}`
    );
    info("You can join a team later with: hq team join");
    return result;
  }

  if (teams.length === 0) {
    info("No teams found for your account");
    info("You can join a team later with: hq team join");
    return result;
  }

  // 2. Let user select teams
  const selected = await selectTeams(teams);
  if (selected.length === 0) {
    info("No teams selected — continuing with personal setup");
    return result;
  }

  // 3. Set up each selected team
  const companiesDir = path.join(hqRoot, "companies");
  if (!fs.existsSync(companiesDir)) {
    fs.mkdirSync(companiesDir, { recursive: true });
  }

  for (const team of selected) {
    const teamLabel = `Setting up ${team.name}`;
    stepStatus(teamLabel, "running");

    const companyDir = path.join(companiesDir, team.slug);

    try {
      // Fetch entitlements for this team
      const entitlements = await fetchTeamEntitlements(
        team.id,
        authToken.clerk_session_token
      );
      const entitledPaths = entitlements.flatMap((e) => e.paths);

      // Fetch repo config (clone URL + credentials)
      const repoConfig = await fetchRepoConfig(
        team.id,
        authToken.clerk_session_token
      );

      // Clone with sparse checkout
      cloneWithSparseCheckout(repoConfig, entitledPaths, companyDir);

      // Ensure standard company directory structure
      ensureCompanyStructure(companyDir, team);

      stepStatus(teamLabel, "done");
      success(
        `${team.name} — ${entitlements.length} pack${entitlements.length === 1 ? "" : "s"}, ` +
          `${entitledPaths.length} path${entitledPaths.length === 1 ? "" : "s"}`
      );

      result.teams.push(team);
      result.companySlugs.push(team.slug);
    } catch (err) {
      stepStatus(teamLabel, "failed");
      warn(
        `Failed to set up ${team.name}: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      warn("You can retry later with: hq team join");
    }
  }

  return result;
}
