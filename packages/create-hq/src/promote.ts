/**
 * Promote utility — push an existing companies/{slug}/ folder to a new
 * GitHub team repo.
 *
 * This is the "reverse" of admin-onboarding: instead of creating a fresh
 * repo then cloning it locally, it takes an existing local folder and
 * pushes it upstream. Both the /promote Claude command and the create-hq
 * admin onboarding flow ("seed from existing folder") reuse this module.
 *
 * Security: Git credentials are injected via GIT_ASKPASS with a one-shot
 * temp script — the token never appears in argv or remote URLs.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { execSync } from "child_process";
import {
  type GitHubAuth,
  githubApi,
} from "./auth.js";
import type { TeamMetadata } from "./company-template.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromoteOptions {
  /** Absolute path to the companies/{slug}/ folder to promote. */
  companyDir: string;
  /** GitHub org login to create the repo in. */
  orgLogin: string;
  /** GitHub org numeric ID. */
  orgId: number;
  /** Authenticated GitHub user. */
  auth: GitHubAuth;
  /** Override repo name (default: hq-{slug}). */
  repoName?: string;
  /** HQ version string for team.json metadata. */
  hqVersion?: string;
}

export interface PromoteResult {
  /** GitHub HTML URL for the new repo. */
  repoHtmlUrl: string;
  /** HTTPS clone URL. */
  cloneUrl: string;
  /** Absolute path to the team.json file written in the company folder. */
  teamJsonPath: string;
  /** Number of files pushed to the repo. */
  filesCount: number;
  /** The team metadata written to team.json. */
  team: TeamMetadata;
}

interface CreateRepoResponse {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  default_branch: string;
}

// ─── Secret scanning ────────────────────────────────────────────────────────

/** Patterns that indicate accidental secret content. */
const SECRET_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "API key", pattern: /(?:api[_-]?key|apikey)["']?\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}/i },
  { label: "Bearer token", pattern: /bearer\s+[A-Za-z0-9_\-.]{20,}/i },
  { label: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { label: "Private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { label: "npm token", pattern: /npm_[A-Za-z0-9]{36,}/ },
  { label: "1Password reference", pattern: /op:\/\/[^\s"']+/ },
  { label: "Password field", pattern: /(?:password|passwd|secret)\s*[:=]\s*["'][^"']{8,}/i },
  { label: ".env value", pattern: /^[A-Z_]{3,}=["']?[A-Za-z0-9_\-/.]{20,}/m },
  { label: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9\-]{10,}/ },
];

/** Files to skip during secret scanning. */
const SCAN_SKIP_FILES = new Set([
  "team.json",
  ".gitignore",
  ".gitkeep",
]);

/** Extensions to skip (binary, media, etc.). */
const SCAN_SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".mp4", ".webm", ".mp3", ".wav",
  ".zip", ".tar", ".gz", ".bz2",
  ".pdf", ".woff", ".woff2", ".ttf", ".eot",
]);

export interface SecretScanResult {
  clean: boolean;
  findings: { file: string; pattern: string; line: number }[];
}

/**
 * Scan a directory for accidental secrets. Reads all text files and
 * checks for common secret patterns. Returns scan results — callers
 * decide how to handle flagged content.
 */
export function scanForSecrets(dir: string): SecretScanResult {
  const findings: SecretScanResult["findings"] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (SCAN_SKIP_FILES.has(entry.name)) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (SCAN_SKIP_EXTENSIONS.has(ext)) continue;

      // Read file — skip if too large (likely binary/generated)
      let content: string;
      try {
        const stats = fs.statSync(fullPath);
        if (stats.size > 512 * 1024) continue; // Skip files > 512KB
        content = fs.readFileSync(fullPath, "utf-8");
      } catch {
        continue;
      }

      const relativePath = path.relative(dir, fullPath);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        for (const { label, pattern } of SECRET_PATTERNS) {
          if (pattern.test(lines[i])) {
            findings.push({
              file: relativePath,
              pattern: label,
              line: i + 1,
            });
          }
        }
      }
    }
  }

  walk(dir);
  return { clean: findings.length === 0, findings };
}

// ─── Git helpers ────────────────────────────────────────────────────────────

/**
 * Run a git command with token injected via GIT_ASKPASS. The token never
 * appears in argv or remote URLs.
 */
function runGitWithToken(
  args: string[],
  cwd: string,
  auth: GitHubAuth,
  inputEnv: NodeJS.ProcessEnv = {}
): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-promote-git-"));
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

    const output = execSync(`git -c credential.helper= ${args.join(" ")}`, {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
      env: {
        ...process.env,
        ...inputEnv,
        GIT_TOKEN: auth.access_token,
        GIT_ASKPASS: askpassPath,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
    });
    return output;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Build an HTTPS URL with x-access-token as username so git's askpass
 * only needs to provide the password (the token).
 */
function tokenAuthUrl(cloneUrl: string): string {
  const u = new URL(cloneUrl);
  u.username = "x-access-token";
  return u.toString();
}

/**
 * Count files in a directory (excluding .git).
 */
function countFiles(dir: string): number {
  let count = 0;
  function walk(d: string): void {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        count++;
      }
    }
  }
  walk(dir);
  return count;
}

// ─── GitHub helpers ─────────────────────────────────────────────────────────

async function createOrgRepo(
  auth: GitHubAuth,
  orgLogin: string,
  repoName: string,
  description: string
): Promise<CreateRepoResponse> {
  return githubApi<CreateRepoResponse>(`/orgs/${orgLogin}/repos`, auth, {
    method: "POST",
    body: JSON.stringify({
      name: repoName,
      private: true,
      description,
      auto_init: false,
      has_issues: true,
      has_projects: false,
      has_wiki: false,
    }),
  });
}

async function repoExists(
  auth: GitHubAuth,
  orgLogin: string,
  repoName: string
): Promise<boolean> {
  try {
    await githubApi<unknown>(`/repos/${orgLogin}/${repoName}`, auth);
    return true;
  } catch {
    return false;
  }
}

// ─── Main promote flow ─────────────────────────────────────────────────────

/**
 * Promote an existing companies/{slug}/ folder to a new GitHub team repo.
 *
 * Steps:
 *   1. Validate the folder exists and check for existing .git
 *   2. Create the GitHub repo (abort if already exists)
 *   3. git init + add + commit all folder contents
 *   4. Push to the new repo via GIT_ASKPASS
 *   5. Write team.json with metadata
 *   6. Commit and push team.json
 *   7. Return result
 *
 * Throws on failure — callers should catch and handle errors.
 */
export async function promoteCompany(opts: PromoteOptions): Promise<PromoteResult> {
  const { companyDir, orgLogin, orgId, auth } = opts;
  const slug = path.basename(companyDir);
  const repoName = opts.repoName ?? `hq-${slug}`;

  // ── 1. Validate folder ──────────────────────────────────────────────────

  if (!fs.existsSync(companyDir)) {
    throw new Error(`Company folder does not exist: ${companyDir}`);
  }

  const stats = fs.statSync(companyDir);
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${companyDir}`);
  }

  // Check for existing .git with a remote (nested git for another purpose)
  const existingGitDir = path.join(companyDir, ".git");
  if (fs.existsSync(existingGitDir)) {
    try {
      const remoteOutput = execSync("git remote -v", {
        cwd: companyDir,
        stdio: "pipe",
        encoding: "utf-8",
      });
      if (remoteOutput.trim().length > 0) {
        throw new Error(
          `Folder ${slug}/ already has a .git directory with a remote configured.\n` +
          `  This folder appears to be an existing nested git repo.\n` +
          `  Remove the .git directory first if you want to promote it.`
        );
      }
      // Has .git but no remote — likely a knowledge repo without a remote.
      // We'll reinit below.
    } catch (err) {
      if (err instanceof Error && err.message.includes("already has a .git")) {
        throw err; // Re-throw our own error
      }
      // git remote -v failed for another reason — treat as no remote
    }
  }

  // ── 2. Create GitHub repo ───────────────────────────────────────────────

  const exists = await repoExists(auth, orgLogin, repoName);
  if (exists) {
    throw new Error(
      `Repository ${orgLogin}/${repoName} already exists.\n` +
      `  Choose a different repo name or remove the existing repo first.`
    );
  }

  const repo = await createOrgRepo(
    auth,
    orgLogin,
    repoName,
    `HQ Teams workspace for ${slug} — promoted from existing folder`
  );

  // ── 3. Initialize git ───────────────────────────────────────────────────

  const hasGitDir = fs.existsSync(existingGitDir);

  if (!hasGitDir) {
    execSync("git init -b main", { cwd: companyDir, stdio: "pipe" });
  }

  // Configure git user for this repo
  execSync(
    `git config user.email "${auth.email || `${auth.login}@users.noreply.github.com`}"`,
    { cwd: companyDir, stdio: "pipe" }
  );
  execSync(
    `git config user.name "${auth.name || auth.login}"`,
    { cwd: companyDir, stdio: "pipe" }
  );

  // Add remote
  const remoteUrl = tokenAuthUrl(repo.clone_url);
  execSync(`git remote add origin "${remoteUrl}"`, {
    cwd: companyDir,
    stdio: "pipe",
  });

  // Stage and commit all content
  execSync("git add -A", { cwd: companyDir, stdio: "pipe" });

  const filesCount = countFiles(companyDir);

  try {
    execSync('git commit -m "Initial team content from HQ promote"', {
      cwd: companyDir,
      stdio: "pipe",
    });
  } catch {
    // May fail if nothing to commit (empty dir with only .gitkeep)
    // Continue anyway — push will handle it
  }

  // ── 4. Push ─────────────────────────────────────────────────────────────

  runGitWithToken(["push", "-u", "origin", "main"], companyDir, auth);

  // ── 5. Write team.json ──────────────────────────────────────────────────

  const teamId = crypto.randomUUID();
  const team: TeamMetadata = {
    team_id: teamId,
    team_name: slug,
    team_slug: slug,
    org_login: orgLogin,
    org_id: orgId,
    created_by: auth.login,
    created_at: new Date().toISOString(),
    hq_version: opts.hqVersion ?? "unknown",
    repo_url: repo.html_url,
    clone_url: repo.clone_url,
  };

  const teamJsonPath = path.join(companyDir, "team.json");
  fs.writeFileSync(teamJsonPath, JSON.stringify(team, null, 2) + "\n", "utf-8");

  // ── 6. Commit and push team.json ────────────────────────────────────────

  execSync("git add team.json", { cwd: companyDir, stdio: "pipe" });
  execSync('git commit -m "Add team.json metadata from HQ promote"', {
    cwd: companyDir,
    stdio: "pipe",
  });
  runGitWithToken(["push", "origin", "main"], companyDir, auth);

  // ── 7. Clean up remote URL (strip token from stored remote) ─────────────

  execSync(`git remote set-url origin "${repo.clone_url}"`, {
    cwd: companyDir,
    stdio: "pipe",
  });

  return {
    repoHtmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    teamJsonPath,
    filesCount,
    team,
  };
}

// ─── Post-promote wiring ────────────────────────────────────────────────────

export interface PostPromoteOptions {
  /** Absolute path to the HQ root directory. */
  hqRoot: string;
  /** The company slug (basename of the companies/{slug}/ directory). */
  slug: string;
  /** The promote result with repo URLs and team metadata. */
  result: PromoteResult;
}

/**
 * Wire up a promoted company folder with the rest of HQ:
 *   1. Update companies/manifest.yaml to add the team repo reference
 *   2. Run qmd update for reindexing
 *
 * Best-effort — failures are logged but do not throw.
 */
export function postPromoteWiring(opts: PostPromoteOptions): {
  manifestUpdated: boolean;
  qmdReindexed: boolean;
} {
  const { hqRoot, slug } = opts;
  const status = { manifestUpdated: false, qmdReindexed: false };

  // 1. Update manifest.yaml
  try {
    const manifestPath = path.join(hqRoot, "companies", "manifest.yaml");
    if (fs.existsSync(manifestPath)) {
      let content = fs.readFileSync(manifestPath, "utf-8");
      const repoRef = `hq-${slug}`;

      // Check if the company already has an entry
      const slugPattern = new RegExp(`^(\\s*)${slug}:`, "m");
      if (slugPattern.test(content)) {
        // Company entry exists — add repo if not already listed
        if (!content.includes(repoRef)) {
          const reposPattern = new RegExp(
            `(${slug}:[\\s\\S]*?repos:\\s*\\n)((?:\\s+-[^\\n]*\\n)*)`,
            "m"
          );
          const reposMatch = content.match(reposPattern);
          if (reposMatch) {
            content = content.replace(
              reposMatch[0],
              reposMatch[0] + `      - ${repoRef}\n`
            );
          }
        }
      } else {
        // No entry — append a minimal one
        content += `\n  ${slug}:\n    repos:\n      - ${repoRef}\n`;
      }

      fs.writeFileSync(manifestPath, content, "utf-8");
      status.manifestUpdated = true;
    }
  } catch {
    // Best-effort
  }

  // 2. Run qmd update for reindexing
  try {
    execSync("qmd update 2>/dev/null", { stdio: "pipe", timeout: 30000 });
    status.qmdReindexed = true;
  } catch {
    // qmd may not be installed
  }

  return status;
}
