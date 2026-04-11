/**
 * Teams flow router.
 *
 * Called by scaffold.ts after the user opts into the HQ Teams path. Handles:
 *   - Reusing or refreshing GitHub auth
 *   - Routing to member auto-discovery vs admin onboarding
 *
 * The team setup happens *after* core HQ has been installed, so all paths
 * receive a fully scaffolded hqRoot to drop companies/{slug}/ into.
 */

import chalk from "chalk";
import { createInterface } from "readline";
import {
  type GitHubAuth,
  loadGitHubAuth,
  isGitHubAuthValid,
  startGitHubDeviceFlow,
  clearGitHubAuth,
  openBrowser,
} from "./auth.js";
import { runAdminOnboarding, type AdminOnboardingResult } from "./admin-onboarding.js";
import { runMemberJoin, type MemberJoinResult } from "./team-setup.js";
import { stepStatus, success, warn, info } from "./ui.js";

export type TeamsFlowMode = "existing" | "new";

export interface TeamsFlowResult {
  auth: GitHubAuth;
  member: MemberJoinResult | null;
  admin: AdminOnboardingResult | null;
}

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

async function confirm(question: string, defaultYes: boolean): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await prompt(`${question} (${hint})`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

/**
 * Authenticate the user, reusing a stored token if it's still valid.
 * If the user doesn't have a GitHub account yet, walk them through creating one.
 */
export async function authenticate(): Promise<GitHubAuth | null> {
  // Try existing token first
  const existing = loadGitHubAuth();
  if (existing) {
    const valid = await isGitHubAuthValid(existing);
    if (valid) {
      info(`Already signed in as ${chalk.cyan("@" + existing.login)}`);
      return existing;
    }
    info("Stored credentials expired — re-authenticating");
    clearGitHubAuth();
  }

  // Quick check: does the user have a GitHub account?
  console.log();
  const hasGithub = await confirm("Do you have a GitHub account?", true);
  if (!hasGithub) {
    console.log();
    info("HQ Teams uses GitHub for identity, repos, and access control.");
    const create = await confirm("Open github.com/signup in your browser to create one?", true);
    if (!create) {
      warn("A GitHub account is required for HQ Teams. Aborting team setup.");
      return null;
    }
    openBrowser("https://github.com/signup");
    console.log();
    info("Press Enter once your account is created and verified...");
    await prompt("");
  }

  try {
    return await startGitHubDeviceFlow();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`GitHub sign-in failed: ${message}`);
    return null;
  }
}

/**
 * Run the teams flow. The mode determines the entry point:
 *   - "existing": user said they have an HQ Teams account → look up their teams
 *   - "new":      user wants to create a new team → admin onboarding
 *
 * For "existing", if discovery finds zero teams, we offer to fall through to
 * admin onboarding so the user isn't dead-ended.
 */
export async function runTeamsFlow(
  mode: TeamsFlowMode,
  hqRoot: string,
  hqVersion: string,
  preAuth?: GitHubAuth
): Promise<TeamsFlowResult | null> {
  const auth = preAuth ?? await authenticate();
  if (!auth) return null;

  const result: TeamsFlowResult = { auth, member: null, admin: null };

  if (mode === "existing") {
    // Try discovery first
    result.member = await runMemberJoin(auth, hqRoot);

    if (result.member === null) {
      // No teams found at all
      console.log();
      info("No HQ teams are linked to your GitHub account yet.");
      const create = await confirm(
        "Would you like to create a new team now?",
        false
      );
      if (create) {
        result.admin = await runAdminOnboarding(auth, hqRoot, hqVersion);
      }
    }
    return result;
  }

  // mode === "new"
  result.admin = await runAdminOnboarding(auth, hqRoot, hqVersion);
  return result;
}
