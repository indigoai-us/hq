/**
 * Join-via-invite flow for HQ Teams members.
 *
 * When a member has an invite token (from an admin), this flow:
 *   1. Decodes the token to get team coordinates
 *   2. Authenticates via GitHub device flow
 *   3. Checks org membership / repo access (waits if invite is pending)
 *   4. Clones the team repo into companies/{slug}/
 *
 * This is the primary path for non-technical users who received an invite.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { createInterface } from "readline";
import chalk from "chalk";
import { type GitHubAuth } from "./auth.js";
import { ensureCompanyStructure } from "./company-template.js";
import { stepStatus, success, warn, info, step } from "./ui.js";
import {
  decodeInviteToken,
  checkRepoAccess,
  type InvitePayload,
} from "./invite.js";
import { linkTeamCommands, installTeamCommands } from "./team-setup.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JoinByInviteResult {
  /** Team slug (companies/{slug}/ directory). */
  slug: string;
  /** Human-readable team name. */
  teamName: string;
  /** Local path where the team repo was cloned. */
  companyDir: string;
  /** GitHub HTML URL for the team repo. */
  repoUrl: string;
}

// ─── Prompt helpers ─────────────────────────────────────────────────────────

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

function pause(message: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${message}`, () => {
      rl.close();
      resolve();
    });
  });
}

// ─── Git helpers (same as team-setup.ts / admin-onboarding.ts) ──────────────

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

// ─── Main flow ──────────────────────────────────────────────────────────────

/**
 * Run the join-via-invite flow.
 *
 * @param auth    - Authenticated GitHub user (already signed in)
 * @param hqRoot  - Local HQ root directory (where companies/ lives)
 * @param token   - The invite token string (hq_...) or raw base64
 * @returns       - Result on success, null on failure/abort
 */
export async function runJoinByInvite(
  auth: GitHubAuth,
  hqRoot: string,
  token: string
): Promise<JoinByInviteResult | null> {
  // 1. Decode token
  const payload = decodeInviteToken(token);
  if (!payload) {
    warn("Invalid invite code. Check that you copied it correctly and try again.");
    return null;
  }

  console.log();
  console.log(chalk.bold("  Joining a team"));
  console.log();
  console.log(`  ${chalk.dim("Team:")}       ${chalk.cyan(payload.teamName)}`);
  console.log(`  ${chalk.dim("Org:")}        ${payload.org}`);
  console.log(`  ${chalk.dim("Invited by:")} @${payload.invitedBy}`);
  console.log();

  // 2. Check repo access (proves org membership + repo visibility)
  const accessLabel = `Checking access to ${payload.org}/${payload.repo}`;
  stepStatus(accessLabel, "running");

  let hasAccess = await checkRepoAccess(auth, payload.org, payload.repo);

  if (!hasAccess) {
    stepStatus(accessLabel, "failed");
    console.log();

    // Guide the user to accept the org invite
    info("You don't have access to this team's repository yet.");
    console.log();
    step("Check your email for a GitHub organization invite from " + chalk.cyan(payload.org));
    step("Accept the invite, then come back here.");
    console.log();

    // Give them up to 3 chances to retry
    for (let attempt = 1; attempt <= 3; attempt++) {
      await pause(`Press Enter after accepting the invite (attempt ${attempt}/3)... `);

      stepStatus(`Re-checking access (attempt ${attempt})`, "running");
      hasAccess = await checkRepoAccess(auth, payload.org, payload.repo);

      if (hasAccess) {
        stepStatus(`Re-checking access (attempt ${attempt})`, "done");
        break;
      } else {
        stepStatus(`Re-checking access (attempt ${attempt})`, "failed");

        if (attempt < 3) {
          console.log();
          info("Still no access. Make sure you:");
          step(`Accepted the org invite from ${payload.org} (check email from GitHub)`);
          step("Are signed in to GitHub with the same account you accepted the invite on");
          console.log();
        }
      }
    }

    if (!hasAccess) {
      console.log();
      warn("Could not access the team repository after 3 attempts.");
      info(`Your GitHub username is @${auth.login}`);
      info(`Ask @${payload.invitedBy} to add @${auth.login} to the ${payload.org} organization.`);
      info("Then run create-hq again with the same invite code.");
      return null;
    }
  } else {
    stepStatus(accessLabel, "done");
  }

  // 3. Clone the repo into companies/{slug}/
  const companiesDir = path.join(hqRoot, "companies");
  if (!fs.existsSync(companiesDir)) {
    fs.mkdirSync(companiesDir, { recursive: true });
  }

  const companyDir = path.join(companiesDir, payload.slug);

  if (fs.existsSync(companyDir) && fs.readdirSync(companyDir).length > 0) {
    // Company directory already exists — just ensure the git remote is set
    // so the user can sync later from within Claude. Don't clone over their files.
    const remoteLabel = `Configuring remote for existing companies/${payload.slug}`;
    stepStatus(remoteLabel, "running");
    try {
      ensureGitRemote(companyDir, payload.cloneUrl);
      stepStatus(remoteLabel, "done");
      info(`companies/${payload.slug}/ already exists — configured git remote (sync later with /team-sync)`);
    } catch {
      stepStatus(remoteLabel, "done");
      info(`companies/${payload.slug}/ already exists — remote already configured`);
    }
  } else {
    const cloneLabel = `Cloning ${payload.teamName} into companies/${payload.slug}`;
    stepStatus(cloneLabel, "running");

    try {
      const remoteUrl = tokenAuthUrl(payload.cloneUrl);
      runGitWithToken(
        ["clone", `"${remoteUrl}"`, `"${companyDir}"`],
        companiesDir,
        auth
      );

      // Strip the token from the stored remote URL
      execSync(`git remote set-url origin "${payload.cloneUrl}"`, {
        cwd: companyDir,
        stdio: "pipe",
      });

      // Ensure standard company subdirectories exist
      ensureCompanyStructure(companyDir);

      stepStatus(cloneLabel, "done");
    } catch (err) {
      stepStatus(cloneLabel, "failed");
      const message = err instanceof Error ? err.message : String(err);
      warn(`Could not clone team repo: ${message}`);

      // Provide actionable guidance
      console.log();
      info("This usually means the repository doesn't exist or your access isn't set up yet.");
      info(`Ask @${payload.invitedBy} to verify the repo exists at: https://github.com/${payload.org}/${payload.repo}`);
      return null;
    }
  }

  // Register the company in manifest.yaml so HQ routing (search, /startwork, workers) can find it
  registerInManifest(hqRoot, payload);

  // Install bundled team commands (invite, sync, promote)
  const installed = installTeamCommands(hqRoot);
  if (installed.length > 0) {
    info(`Installed ${installed.length} team command${installed.length === 1 ? "" : "s"}: ${installed.join(", ")}`);
  }
  // Link team-distributed commands as slash commands
  const symlinks = linkTeamCommands(hqRoot, payload.slug);
  if (symlinks.linked.length > 0) {
    info(`Linked ${symlinks.linked.length} team command${symlinks.linked.length === 1 ? "" : "s"}`);
  }

  const repoUrl = `https://github.com/${payload.org}/${payload.repo}`;

  console.log();
  success(`Joined ${payload.teamName}!`);
  info(`Team workspace: companies/${payload.slug}/`);

  return {
    slug: payload.slug,
    teamName: payload.teamName,
    companyDir,
    repoUrl,
  };
}

// ─── Manifest registration ─────────────────────────────────────────────────

/**
 * Register a joined team in companies/manifest.yaml so HQ's routing system
 * (search scoping, /startwork, workers, /run-project) can discover it.
 *
 * Appends a minimal entry if the slug isn't already present. Uses string
 * manipulation to avoid adding a YAML parser dependency to create-hq.
 */
function registerInManifest(hqRoot: string, payload: InvitePayload): void {
  const manifestPath = path.join(hqRoot, "companies", "manifest.yaml");

  // If manifest doesn't exist yet (fresh HQ), create a minimal one
  if (!fs.existsSync(manifestPath)) {
    const initial = [
      "# Companies Manifest",
      '# Maps each company to its repos, workers, knowledge, deploy targets, and infrastructure.',
      "",
      'version: "1.1"',
      `updated: "${new Date().toISOString().slice(0, 10)}"`,
      "",
      "companies:",
      ...formatManifestEntry(payload),
      "",
    ].join("\n");
    fs.writeFileSync(manifestPath, initial, "utf-8");
    return;
  }

  // Check if slug is already registered
  const existing = fs.readFileSync(manifestPath, "utf-8");
  const slugPattern = new RegExp(`^  ${escapeRegex(payload.slug)}:`, "m");
  if (slugPattern.test(existing)) {
    return; // Already in manifest
  }

  // Append the new entry at the end of the companies block
  const entry = formatManifestEntry(payload).join("\n");
  const updated = existing.trimEnd() + "\n\n" + entry + "\n";
  fs.writeFileSync(updated.includes("updated:") ? manifestPath : manifestPath, updated, "utf-8");

  // Update the "updated" date
  const dateUpdated = updated.replace(
    /^updated: ".*"$/m,
    `updated: "${new Date().toISOString().slice(0, 10)}"`
  );
  fs.writeFileSync(manifestPath, dateUpdated, "utf-8");
}

function formatManifestEntry(payload: InvitePayload): string[] {
  return [
    `  ${payload.slug}:`,
    `    github_org: ${payload.org}`,
    `    repos: []`,
    `    settings: []`,
    `    workers: []`,
    `    knowledge: companies/${payload.slug}/knowledge/`,
    `    deploy: []`,
    `    vercel_projects: []`,
    `    qmd_collections:`,
    `      - ${payload.slug}`,
    `    services: []`,
  ];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Git remote helper ─────────────────────────────────────────────────────

/**
 * Ensure an existing directory has a git remote pointing to the team repo.
 * If it's not a git repo, initializes one. If 'origin' exists with a different
 * URL, adds 'team' as the remote name instead.
 */
function ensureGitRemote(dir: string, cloneUrl: string): void {
  // Initialize git if not already a repo
  const gitDir = path.join(dir, ".git");
  if (!fs.existsSync(gitDir)) {
    execSync("git init", { cwd: dir, stdio: "pipe" });
  }

  // Check existing remotes
  let existingOrigin: string | null = null;
  try {
    existingOrigin = execSync("git remote get-url origin", { cwd: dir, stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    // No origin remote
  }

  if (!existingOrigin) {
    // No origin — add it
    execSync(`git remote add origin "${cloneUrl}"`, { cwd: dir, stdio: "pipe" });
  } else if (existingOrigin !== cloneUrl) {
    // Origin exists but points elsewhere — add as 'team' remote
    try {
      execSync(`git remote add team "${cloneUrl}"`, { cwd: dir, stdio: "pipe" });
    } catch {
      // 'team' remote might already exist
      execSync(`git remote set-url team "${cloneUrl}"`, { cwd: dir, stdio: "pipe" });
    }
  }
  // If origin already matches cloneUrl, nothing to do
}
