/**
 * Admin onboarding flow — for users creating a brand new HQ team.
 *
 * Steps:
 *   1. Ensure a `gh` CLI token for org discovery (prompt login if needed)
 *   2. List ALL user's GitHub orgs via gh token (full visibility)
 *   3. Let user pick an existing org or create a new one (browser hand-off)
 *   4. Verify the HQ App is installed on the chosen org (browser hand-off if not)
 *   5. Prompt for team name (default = org display name)
 *   6. Create the {org}/hq private repo
 *   7. Seed the repo locally with the company template + push
 *   8. Clone the repo into companies/{slug}/ as a nested git
 *   9. Return team metadata for the orientation summary
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
  getGhCliToken,
  fetchAdminOrgsWithToken,
  startGitHubDeviceFlow,
} from "./auth.js";
import { writeCompanyTemplate, type TeamMetadata } from "./company-template.js";
import { promoteCompany, scanForSecrets } from "./promote.js";
import { stepStatus, success, warn, info } from "./ui.js";
import { linkTeamCommands, installTeamCommands } from "./team-setup.js";
import {
  encodeInviteToken,
  printInviteSummary,
  openInviteEmail,
  formatInviteMessage,
  copyToClipboard,
  sendOrgInviteByEmail,
  type InvitePayload,
} from "./invite.js";

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Folder discovery ───────────────────────────────────────────────────────

/**
 * Discover companies/ subfolders that are eligible for promotion — i.e.
 * they don't already have a team.json. Excludes _template and hidden dirs.
 */
function discoverEligibleFolders(companiesDir: string): string[] {
  if (!fs.existsSync(companiesDir)) return [];

  return fs
    .readdirSync(companiesDir, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isDirectory()) return false;
      if (entry.name === "_template" || entry.name.startsWith(".")) return false;
      const teamJsonPath = path.join(companiesDir, entry.name, "team.json");
      return !fs.existsSync(teamJsonPath);
    })
    .map((entry) => entry.name);
}

// ─── GitHub helpers ─────────────────────────────────────────────────────────

/**
 * Ensure we have a `gh` CLI token for org discovery.
 *
 * The GitHub App user-to-server token can only see orgs where the App is
 * already installed — a chicken-and-egg problem when the user wants to pick
 * an org to install the App on. The `gh` CLI token (OAuth with `read:org`)
 * sees ALL the user's orgs regardless of App installations.
 *
 * Flow:
 *   1. Try `gh auth token` — if it works, we're done
 *   2. If `gh` isn't installed or not logged in, prompt the user to log in
 *   3. Retry after they confirm — if still no token, return null (caller
 *      will guide user to create an org or abort)
 */
async function ensureGhToken(): Promise<string | null> {
  const existing = getGhCliToken();
  if (existing) return existing;

  // gh not available or not logged in — guide the user
  console.log();
  info("HQ needs access to your GitHub organizations to continue.");
  info("The fastest way is to sign into the GitHub CLI:");
  console.log();
  console.log(chalk.cyan("    gh auth login"));
  console.log();

  await pause("Run that command in another terminal, then press Enter...");

  // Retry after user says they logged in
  const token = getGhCliToken();
  if (token) return token;

  // Still no luck — one more attempt with installation help
  console.log();
  info("Still can't detect a GitHub CLI session.");
  info("If you don't have the GitHub CLI installed:");
  console.log(chalk.cyan("    https://cli.github.com"));
  console.log();

  const retry = await prompt("Try again after installing/logging in? (Y/n)", "y");
  if (!retry.toLowerCase().startsWith("y")) return null;

  await pause("Press Enter when ready...");
  return getGhCliToken();
}

/**
 * Fetch the orgs the user is an active admin of, using their `gh` CLI token.
 *
 * Always uses a user-scoped token (from `gh auth token`) so we see ALL
 * the user's orgs — not just orgs where the HQ App is installed.
 * Returns an empty array if the token is unavailable or the user has no orgs.
 */
async function fetchAdminOrgs(ghToken: string): Promise<GitHubOrg[]> {
  return fetchAdminOrgsWithToken(ghToken);
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

    execSync(`git -c credential.helper= ${args.join(" ")}`, {
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
 * @param preAuth       - Pre-existing App auth (from "existing" path), or null
 *                        if coming from the "new" path (auth deferred until after org selection)
 * @param hqRoot        - Local HQ root directory (where companies/ lives)
 * @param hqVersion     - HQ template version (for team metadata)
 */
export async function runAdminOnboarding(
  preAuth: GitHubAuth | null,
  hqRoot: string,
  hqVersion: string
): Promise<AdminOnboardingResult | null> {
  console.log();
  console.log(chalk.bold("  Create a new HQ team"));
  console.log();

  // 1. Get a gh CLI token for org discovery (sees ALL user's orgs)
  const ghToken = await ensureGhToken();
  if (!ghToken) {
    warn("GitHub CLI is needed to list your organizations.");
    info("Install it from " + chalk.cyan("https://cli.github.com") + " then run " + chalk.cyan("gh auth login"));
    info("After that, run create-hq again.");
    return null;
  }

  // 2. Fetch admin orgs using the gh token
  const orgsLabel = "Looking up your GitHub organizations";
  stepStatus(orgsLabel, "running");
  let orgs = await fetchAdminOrgs(ghToken);
  stepStatus(orgsLabel, "done");

  // 3. Pick or create org
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
      orgs = await fetchAdminOrgs(ghToken);
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
      orgs = await fetchAdminOrgs(ghToken);
      stepStatus("Re-checking organizations", "done");
      continue;
    }

    if (idx < 0 || idx >= orgs.length) {
      warn("Invalid selection. Try again.");
      continue;
    }

    chosenOrg = orgs[idx];
  }

  // 4. Authenticate with the HQ App (deferred until after org selection)
  //    The App token is needed for installation checks and repo management.
  //    By deferring, we avoid the chicken-and-egg: user sees all orgs first
  //    (via gh token), picks one, THEN authorizes the App for that org.
  let auth = preAuth;
  if (!auth) {
    console.log();
    info(`Now authorize the HQ App to manage repos in ${chalk.cyan(chosenOrg.login)}.`);
    try {
      auth = await startGitHubDeviceFlow();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warn(`GitHub App authorization failed: ${message}`);
      return null;
    }
  }

  // 5. Verify HQ App is installed on the chosen org
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

    console.log();
    info("We'll open the HQ App install page.");
    info(chalk.bold(`Select "${chosenOrg.login}" from the list of organizations.`));
    console.log();

    const openIt = await prompt("Open the install page now? (Y/n)", "y");
    if (openIt.toLowerCase().startsWith("y")) {
      // /installations/select_target always shows the org picker, even when
      // the App is already installed on a different org (unlike /installations/new
      // which redirects to the existing installation's config page).
      openBrowser(`https://github.com/apps/${HQ_GITHUB_APP_SLUG}/installations/select_target`);
    }
    await pause("Press Enter when the App has been installed...");
  }

  // 6. Prompt for team name
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

  // 7a. Offer seed-from-existing-folder option (before repo creation)
  const companiesDir = path.join(hqRoot, "companies");
  const eligibleFolders = discoverEligibleFolders(companiesDir);
  const repoName = `hq-${teamSlug}`;

  let seedFromExisting: string | null = null;

  if (eligibleFolders.length > 0) {
    console.log();
    console.log(chalk.bold("  Seed team repo from:"));
    console.log(chalk.cyan("  [1] ") + chalk.white("Fresh template") + chalk.dim(" — clean starting point"));
    console.log(chalk.cyan("  [2] ") + chalk.white("Existing companies/ folder") + chalk.dim(` — ${eligibleFolders.length} available`));
    console.log();

    const seedChoice = await prompt("Select (1-2)", "1");
    if (seedChoice === "2") {
      if (eligibleFolders.length === 1) {
        const slug = eligibleFolders[0];
        info(`Using companies/${slug}/`);
        seedFromExisting = slug;
      } else {
        console.log();
        console.log(chalk.bold("  Choose a folder:"));
        for (let i = 0; i < eligibleFolders.length; i++) {
          console.log(chalk.cyan(`  [${i + 1}] `) + chalk.white(`companies/${eligibleFolders[i]}/`));
        }
        console.log();
        const folderChoice = await prompt(`Select (1-${eligibleFolders.length})`, "1");
        const idx = parseInt(folderChoice, 10) - 1;
        if (idx >= 0 && idx < eligibleFolders.length) {
          seedFromExisting = eligibleFolders[idx];
        } else {
          warn("Invalid selection — using fresh template.");
        }
      }

      // Run pre-push secrets scan on the selected folder
      if (seedFromExisting) {
        const folderPath = path.join(companiesDir, seedFromExisting);
        const scanResult = scanForSecrets(folderPath);
        if (!scanResult.clean) {
          console.log();
          warn("Potential secrets detected in the folder:");
          for (const finding of scanResult.findings.slice(0, 10)) {
            console.log(chalk.yellow(`    ${finding.file}:${finding.line}`) + chalk.dim(` — ${finding.pattern}`));
          }
          if (scanResult.findings.length > 10) {
            info(`  ...and ${scanResult.findings.length - 10} more`);
          }
          console.log();
          const proceed = await prompt("Proceed anyway? (y/N)", "n");
          if (!proceed.toLowerCase().startsWith("y")) {
            info("Remove the flagged content and retry. Falling back to fresh template.");
            seedFromExisting = null;
          }
        }
      }
    }
  }

  // 5b. Promote existing folder (skips repo creation — promoteCompany handles it)
  if (seedFromExisting) {
    const promoteLabel = `Promoting companies/${seedFromExisting} → ${chosenOrg.login}/${repoName}`;
    stepStatus(promoteLabel, "running");

    try {
      const folderPath = path.join(companiesDir, seedFromExisting);
      const promoteResult = await promoteCompany({
        companyDir: folderPath,
        orgLogin: chosenOrg.login,
        orgId: chosenOrg.id,
        auth,
        repoName,
        hqVersion,
      });

      stepStatus(promoteLabel, "done");

      // Install bundled team commands
      const installed = installTeamCommands(hqRoot);
      if (installed.length > 0) {
        info(`Installed ${installed.length} team command${installed.length === 1 ? "" : "s"}: ${installed.join(", ")}`);
      }
      const symlinks = linkTeamCommands(hqRoot, teamSlug);
      if (symlinks.linked.length > 0) {
        info(`Linked ${symlinks.linked.length} team command${symlinks.linked.length === 1 ? "" : "s"}`);
      }

      console.log();
      success(`Team "${teamName}" created from companies/${seedFromExisting}/ — ${promoteResult.repoHtmlUrl}`);

      await inviteLoop(auth, meta, promoteResult.cloneUrl);

      return {
        team: promoteResult.team,
        companyDir: folderPath,
        repoHtmlUrl: promoteResult.repoHtmlUrl,
      };
    } catch (err) {
      stepStatus(promoteLabel, "failed");
      const message = err instanceof Error ? err.message : String(err);
      warn(`Promote failed: ${message}`);
      info("Falling back to fresh template...");
      // Fall through to the normal create-repo + seed flow below
    }
  }

  // 5c. Create the {org}/hq-{teamSlug} repo (fresh template path)
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

  // 8. Seed locally and push
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

  // 9. Clone into companies/{slug}/
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

  // Install bundled team commands (invite, sync, promote)
  const installed = installTeamCommands(hqRoot);
  if (installed.length > 0) {
    info(`Installed ${installed.length} team command${installed.length === 1 ? "" : "s"}: ${installed.join(", ")}`);
  }
  // Link team-distributed commands as slash commands
  const symlinks = linkTeamCommands(hqRoot, teamSlug);
  if (symlinks.linked.length > 0) {
    info(`Linked ${symlinks.linked.length} team command${symlinks.linked.length === 1 ? "" : "s"}`);
  }

  console.log();
  success(`Team "${teamName}" created — ${repo.html_url}`);

  // 10. Offer to generate member invites
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

  // Copy invite message to clipboard
  const msg = formatInviteMessage(payload, token, email || undefined);
  const copied = copyToClipboard(msg);

  // Try to open mailto: with pre-populated email (works well on macOS/first use)
  if (email) {
    openInviteEmail(payload, token, email);
  }

  // Always show clipboard status — mailto: is unreliable on Windows after first use
  if (copied) {
    success("Invite message copied to clipboard — if your email client didn't open, just paste into a new email and send.");
  } else if (!email) {
    info("No email provided — share the invite message above via email, Slack, or text.");
  }

  // Send the GitHub org invite via API (required for the member to accept)
  if (email) {
    const result = await sendOrgInviteByEmail(auth, meta.org_login, email);
    if (result.ok) {
      success(`GitHub org invite sent to ${email}`);
    } else {
      warn(`Could not send org invite automatically: ${result.error}`);
      console.log();
      info(`Send the invite manually (required for access):`);
      info(`  https://github.com/orgs/${meta.org_login}/people`);
      info(`  Click "Invite member" and enter: ${email}`);
    }
  } else {
    console.log();
    info(`Send them a GitHub org invite (required for access):`);
    info(`  https://github.com/orgs/${meta.org_login}/people`);
    info(`  Click "Invite member" and enter their email or GitHub username`);
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
