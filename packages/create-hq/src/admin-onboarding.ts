/**
 * Admin onboarding flow — for users creating a brand new HQ team.
 *
 * Steps:
 *   1. List user's GitHub orgs (only those where they can create repos)
 *   2. Let user pick an existing org or create a new one (browser hand-off)
 *   3. Verify the HQ App is installed on the chosen org (browser hand-off if not)
 *   4. Prompt for team name (default = org display name)
 *   5. Create the {org}/hq private repo
 *   6. Seed the repo locally with the company template + push
 *   7. Clone the repo into companies/{slug}/ as a nested git
 *   8. Return team metadata for the orientation summary
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { execSync } from "child_process";
import { createInterface } from "readline";
import chalk from "chalk";
import {
  type GitHubAuth,
  HQ_GITHUB_APP_SLUG,
  githubApi,
  openBrowser,
} from "./auth.js";
import { writeCompanyTemplate, type TeamMetadata } from "./company-template.js";
import { stepStatus, success, warn, info } from "./ui.js";
import {
  encodeInviteToken,
  printInviteSummary,
  openInviteEmail,
  type InvitePayload,
} from "./invite.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GitHubOrgMembership {
  state: string;
  role: string;
  organization: {
    login: string;
    id: number;
    avatar_url?: string;
  };
}

interface GitHubOrg {
  login: string;
  id: number;
  description?: string | null;
}

interface GitHubInstallation {
  id: number;
  app_slug: string;
  account: {
    login: string;
    id: number;
    type: string;
  };
}

interface CreateRepoResponse {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  default_branch: string;
}

export interface AdminOnboardingResult {
  team: TeamMetadata;
  /** Local path where the team repo was cloned. */
  companyDir: string;
  /** GitHub HTML URL for the new team repo. */
  repoHtmlUrl: string;
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
    rl.question(`  ${message} `, () => {
      rl.close();
      resolve();
    });
  });
}

// ─── GitHub helpers ─────────────────────────────────────────────────────────

/**
 * Fetch the orgs the user is an active admin of. Uses
 * /user/memberships/orgs which (unlike /user/orgs) tells us our role.
 *
 * Requires the App's "Organization > Members: Read" permission. If the App
 * isn't permitted, this returns an empty array (and we tell the user to
 * check their App permissions).
 */
async function fetchAdminOrgs(auth: GitHubAuth): Promise<GitHubOrg[]> {
  try {
    const memberships = await githubApi<GitHubOrgMembership[]>(
      "/user/memberships/orgs?state=active&per_page=100",
      auth
    );
    return memberships
      .filter((m) => m.role === "admin")
      .map((m) => ({
        login: m.organization.login,
        id: m.organization.id,
      }));
  } catch (err) {
    // Permission errors come back as 403/404 — surface as empty list, the
    // caller will guide the user to fix App permissions or create an org.
    return [];
  }
}

async function fetchInstallations(auth: GitHubAuth): Promise<GitHubInstallation[]> {
  const data = await githubApi<{ installations: GitHubInstallation[] }>(
    "/user/installations?per_page=100",
    auth
  );
  return data.installations ?? [];
}

function findHqInstallation(
  installations: GitHubInstallation[],
  orgLogin: string
): GitHubInstallation | null {
  return (
    installations.find(
      (i) =>
        i.app_slug === HQ_GITHUB_APP_SLUG &&
        i.account?.login?.toLowerCase() === orgLogin.toLowerCase()
    ) ?? null
  );
}

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

async function getExistingRepo(
  auth: GitHubAuth,
  orgLogin: string,
  repoName: string
): Promise<CreateRepoResponse | null> {
  try {
    return await githubApi<CreateRepoResponse>(`/repos/${orgLogin}/${repoName}`, auth);
  } catch {
    return null;
  }
}

// ─── Git helpers ────────────────────────────────────────────────────────────

/**
 * Run a git command, embedding the user's GitHub token via a one-shot
 * credential helper so the token never appears in argv or remote URLs.
 *
 * The token is passed via an environment variable to a tiny inline askpass
 * script written to a temp file, which git invokes via GIT_ASKPASS.
 */
function runGitWithToken(
  args: string[],
  cwd: string,
  auth: GitHubAuth,
  inputEnv: NodeJS.ProcessEnv = {}
): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-hq-git-"));
  const isWindows = process.platform === "win32";
  const askpassPath = path.join(tmpDir, isWindows ? "askpass.cmd" : "askpass.sh");

  try {
    if (isWindows) {
      // Windows batch script: stdout the token (for Password) or username
      fs.writeFileSync(
        askpassPath,
        `@echo off\nif "%~1"=="" (echo %GIT_TOKEN%) else (echo %GIT_TOKEN%)\n`,
        "utf-8"
      );
    } else {
      fs.writeFileSync(askpassPath, `#!/bin/sh\necho "$GIT_TOKEN"\n`, "utf-8");
      fs.chmodSync(askpassPath, 0o700);
    }

    execSync(`git ${args.join(" ")}`, {
      cwd,
      stdio: "pipe",
      env: {
        ...process.env,
        ...inputEnv,
        GIT_TOKEN: auth.access_token,
        GIT_ASKPASS: askpassPath,
        GIT_TERMINAL_PROMPT: "0",
        // Prevent any system credential helper from caching the token
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

/**
 * Build an HTTPS URL with the username embedded so git's askpass only
 * needs to provide the password (the token). We use "x-access-token" as
 * the username — GitHub's recommended convention for token auth.
 */
function tokenAuthUrl(cloneUrl: string): string {
  const u = new URL(cloneUrl);
  u.username = "x-access-token";
  // Don't put the token in the URL — askpass handles it
  return u.toString();
}

// ─── Slug helper ────────────────────────────────────────────────────────────

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "team";
}

// ─── Main flow ──────────────────────────────────────────────────────────────

/**
 * Run the admin onboarding flow.
 *
 * @param auth          - Authenticated GitHub user
 * @param hqRoot        - Local HQ root directory (where companies/ lives)
 * @param hqVersion     - HQ template version (for team metadata)
 */
export async function runAdminOnboarding(
  auth: GitHubAuth,
  hqRoot: string,
  hqVersion: string
): Promise<AdminOnboardingResult | null> {
  console.log();
  console.log(chalk.bold("  Create a new HQ team"));
  console.log();

  // 1. Fetch admin orgs
  const orgsLabel = "Looking up your GitHub organizations";
  stepStatus(orgsLabel, "running");
  let orgs = await fetchAdminOrgs(auth);
  stepStatus(orgsLabel, "done");

  // 2. Pick or create org
  let chosenOrg: GitHubOrg | null = null;
  while (!chosenOrg) {
    if (orgs.length === 0) {
      console.log();
      info("You aren't an admin of any GitHub organization yet.");
      info("HQ Teams need a GitHub org to host the shared workspace repo.");
      console.log();
      const create = await prompt("Open browser to create one now? (Y/n)", "y");
      if (!create.toLowerCase().startsWith("y")) {
        warn("Skipping team creation — you can run create-hq again after creating an org.");
        return null;
      }
      openBrowser("https://github.com/organizations/new");
      await pause("Press Enter when you have finished creating the org...");

      stepStatus("Re-checking organizations", "running");
      orgs = await fetchAdminOrgs(auth);
      stepStatus("Re-checking organizations", "done");
      continue;
    }

    console.log();
    console.log(chalk.bold("  Choose an organization:"));
    for (let i = 0; i < orgs.length; i++) {
      console.log(
        chalk.cyan(`  [${i + 1}] `) + chalk.white(orgs[i].login)
      );
    }
    console.log(chalk.cyan(`  [${orgs.length + 1}] `) + chalk.dim("Create a new GitHub organization"));
    console.log();

    const answer = await prompt(
      `Select (1-${orgs.length + 1})`,
      "1"
    );
    const idx = parseInt(answer, 10) - 1;

    if (idx === orgs.length) {
      // Create new org
      openBrowser("https://github.com/organizations/new");
      await pause("Press Enter when you have finished creating the org...");
      stepStatus("Re-checking organizations", "running");
      orgs = await fetchAdminOrgs(auth);
      stepStatus("Re-checking organizations", "done");
      continue;
    }

    if (idx < 0 || idx >= orgs.length) {
      warn("Invalid selection. Try again.");
      continue;
    }

    chosenOrg = orgs[idx];
  }

  // 3. Verify HQ App is installed on the org
  let installation: GitHubInstallation | null = null;
  while (!installation) {
    const installLabel = `Checking HQ App on ${chosenOrg.login}`;
    stepStatus(installLabel, "running");
    const installations = await fetchInstallations(auth);
    installation = findHqInstallation(installations, chosenOrg.login);

    if (installation) {
      stepStatus(installLabel, "done");
      break;
    }

    stepStatus(installLabel, "failed");
    console.log();
    info(`The HQ GitHub App isn't installed on ${chalk.cyan(chosenOrg.login)} yet.`);
    info("Installing it gives HQ permission to manage the team workspace repo.");
    console.log();

    const installUrl = `https://github.com/apps/${HQ_GITHUB_APP_SLUG}/installations/new/permissions?target_id=${chosenOrg.id}`;
    const proceed = await prompt("Open the install page in your browser? (Y/n)", "y");
    if (!proceed.toLowerCase().startsWith("y")) {
      warn("HQ App is required to create a team. Aborting team creation.");
      return null;
    }
    openBrowser(installUrl);
    await pause("Press Enter when the App has been installed...");
  }

  // 4. Prompt for team name
  console.log();
  const defaultName = chosenOrg.login;
  const teamName = (await prompt("Team name", defaultName)) || defaultName;
  const teamSlug = slugify(teamName);
  const teamId = crypto.randomUUID();

  const meta: TeamMetadata = {
    team_id: teamId,
    team_name: teamName,
    team_slug: teamSlug,
    org_login: chosenOrg.login,
    org_id: chosenOrg.id,
    created_by: auth.login,
    created_at: new Date().toISOString(),
    hq_version: hqVersion,
  };

  // 5. Create the {org}/hq-{teamSlug} repo
  const repoName = `hq-${teamSlug}`;
  const repoLabel = `Creating ${chosenOrg.login}/${repoName} private repo`;
  stepStatus(repoLabel, "running");

  let repo: CreateRepoResponse | null = null;
  try {
    repo = await createOrgRepo(
      auth,
      chosenOrg.login,
      repoName,
      `HQ Teams workspace for ${teamName}`
    );
    stepStatus(repoLabel, "done");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("422") && /already exists/i.test(message)) {
      // Repo already exists — could be from a prior run. Confirm before reusing.
      stepStatus(repoLabel, "done");
      console.log();
      info(`${chosenOrg.login}/${repoName} already exists.`);
      const reuse = await prompt("Reuse this repo? (Y/n)", "y");
      if (!reuse.toLowerCase().startsWith("y")) {
        warn("Aborting — choose a different team name next time to avoid the conflict.");
        return null;
      }
      repo = await getExistingRepo(auth, chosenOrg.login, repoName);
      if (!repo) {
        stepStatus(repoLabel, "failed");
        warn(`Could not load existing ${chosenOrg.login}/${repoName}: ${message}`);
        return null;
      }
    } else {
      stepStatus(repoLabel, "failed");
      warn(`Could not create repo: ${message}`);
      return null;
    }
  }

  // 6. Seed locally and push
  const seedLabel = "Seeding team workspace";
  stepStatus(seedLabel, "running");

  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-hq-seed-"));
  try {
    // git init in seed dir
    execSync(`git init -b main`, { cwd: seedDir, stdio: "pipe" });
    execSync(`git config user.email "${auth.email || `${auth.login}@users.noreply.github.com`}"`, {
      cwd: seedDir,
      stdio: "pipe",
    });
    execSync(`git config user.name "${auth.name || auth.login}"`, {
      cwd: seedDir,
      stdio: "pipe",
    });

    writeCompanyTemplate(seedDir, meta);

    execSync(`git add -A`, { cwd: seedDir, stdio: "pipe" });
    execSync(
      `git commit -m "chore: bootstrap HQ team workspace"`,
      { cwd: seedDir, stdio: "pipe" }
    );

    const remoteUrl = tokenAuthUrl(repo.clone_url);
    execSync(`git remote add origin "${remoteUrl}"`, { cwd: seedDir, stdio: "pipe" });
    runGitWithToken(["push", "-u", "origin", "main"], seedDir, auth);

    stepStatus(seedLabel, "done");
  } catch (err) {
    stepStatus(seedLabel, "failed");
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to seed team repo: ${message}`);
    return null;
  } finally {
    try {
      fs.rmSync(seedDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  // 7. Clone into companies/{slug}/
  const companiesDir = path.join(hqRoot, "companies");
  if (!fs.existsSync(companiesDir)) {
    fs.mkdirSync(companiesDir, { recursive: true });
  }
  const companyDir = path.join(companiesDir, teamSlug);

  if (fs.existsSync(companyDir) && fs.readdirSync(companyDir).length > 0) {
    warn(`companies/${teamSlug}/ already exists and is not empty — skipping clone.`);
  } else {
    const cloneLabel = `Cloning into companies/${teamSlug}`;
    stepStatus(cloneLabel, "running");
    try {
      const remoteUrl = tokenAuthUrl(repo.clone_url);
      runGitWithToken(
        ["clone", `"${remoteUrl}"`, `"${companyDir}"`],
        companiesDir,
        auth
      );
      // Strip token from the stored remote URL
      execSync(`git remote set-url origin "${repo.clone_url}"`, {
        cwd: companyDir,
        stdio: "pipe",
      });
      stepStatus(cloneLabel, "done");
    } catch (err) {
      stepStatus(cloneLabel, "failed");
      const message = err instanceof Error ? err.message : String(err);
      warn(`Could not clone into companies/${teamSlug}/: ${message}`);
      // Team repo was created on GitHub — still return success so the user
      // gets the admin orientation (with repo URL) instead of generic next steps.
      // They can clone manually later.
      console.log();
      success(`Team "${teamName}" created at ${repo.html_url}`);
      info("Local clone failed — clone manually with:");
      info(`  git clone ${repo.clone_url} companies/${teamSlug}`);

      // Still offer invite generation
      await inviteLoop(auth, meta, repo.clone_url);

      return {
        team: meta,
        companyDir,
        repoHtmlUrl: repo.html_url,
      };
    }
  }

  console.log();
  success(`Team "${teamName}" created — ${repo.html_url}`);

  // 8. Offer to generate member invites
  await inviteLoop(auth, meta, repo.clone_url);

  return {
    team: meta,
    companyDir,
    repoHtmlUrl: repo.html_url,
  };
}

// ─── Invite generation (used by admin onboarding + standalone) ──────────────

/**
 * Interactive invite generation for a single member. Prompts for email,
 * sends org invite, generates token, and prints instructions.
 */
export async function generateInviteInteractive(
  auth: GitHubAuth,
  meta: TeamMetadata,
  cloneUrl: string
): Promise<void> {
  const payload: InvitePayload = {
    org: meta.org_login,
    repo: `hq-${meta.team_slug}`,
    slug: meta.team_slug,
    teamName: meta.team_name,
    cloneUrl,
    invitedBy: auth.login,
  };

  const token = encodeInviteToken(payload);

  // Ask for email — used for the mailto invite, not for API calls
  const email = await prompt(
    "New member's email (or press Enter to skip)"
  );

  printInviteSummary(payload, token, false, email || undefined);

  // Open the admin's email client with the invite message pre-populated
  if (email) {
    openInviteEmail(payload, token, email);
    info("Email opened in your default mail app — review and hit Send.");
    console.log();
    info(`Don't forget to add them to the ${meta.org_login} GitHub org:`);
    info(`  https://github.com/orgs/${meta.org_login}/people`);
  }
}

/**
 * Invite loop — asks "Invite a team member?" and repeats until the admin
 * says no. Used after team creation and from the standalone invite command.
 */
export async function inviteLoop(
  auth: GitHubAuth,
  meta: TeamMetadata,
  cloneUrl: string
): Promise<void> {
  let first = true;
  while (true) {
    console.log();
    const question = first
      ? "Invite a team member now? (Y/n)"
      : "Invite another team member? (y/N)";
    const defaultAnswer = first ? "y" : "n";
    const answer = await prompt(question, defaultAnswer);
    if (!answer.toLowerCase().startsWith("y")) break;
    await generateInviteInteractive(auth, meta, cloneUrl);
    first = false;
  }
}
