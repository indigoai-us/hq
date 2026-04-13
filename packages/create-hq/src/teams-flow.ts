/**
 * Teams flow router.
 *
 * Called by scaffold.ts after the user opts into the HQ Teams path. Handles:
 *   - Reusing or refreshing GitHub auth
 *   - Routing: invite code → join-by-invite, discovery → auto-discovery, new → admin onboarding
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
  isAppScopedToken,
  startGitHubDeviceFlow,
  clearGitHubAuth,
  openBrowser,
} from "./auth.js";
import { runAdminOnboarding, type AdminOnboardingResult } from "./admin-onboarding.js";
import { runMemberJoin, type MemberJoinResult } from "./team-setup.js";
import { runJoinByInvite, type JoinByInviteResult } from "./join-flow.js";
import { decodeInviteToken } from "./invite.js";
import { stepStatus, success, warn, info } from "./ui.js";

export type TeamsFlowMode = "existing" | "new";

export interface TeamsFlowResult {
  auth: GitHubAuth;
  member: MemberJoinResult | null;
  admin: AdminOnboardingResult | null;
  /** Set when the member joined via an invite token. */
  joinedByInvite: JoinByInviteResult | null;
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
 * Authenticate the user, reusing a stored HQ App token if it's still valid.
 *
 * Priority:
 *   1. ~/.hq/app-token.json — cached HQ App token from a previous session
 *   2. Device flow — browser-based OAuth through the hq-team-sync GitHub App
 *
 * The user's existing `gh` CLI auth is never read or modified.
 */
export async function authenticate(): Promise<GitHubAuth | null> {
  // 1. Try the cached HQ App token
  const existing = loadGitHubAuth();
  if (existing) {
    const valid = await isGitHubAuthValid(existing);
    if (valid) {
      // Double-check it actually has App scopes (not a leftover from the old
      // gh-based flow where a regular OAuth token could end up in the file)
      const appScoped = await isAppScopedToken(existing);
      if (appScoped === "yes") {
        info(`Already signed in as ${chalk.cyan("@" + existing.login)}`);
        return existing;
      }
      if (appScoped === "unknown") {
        // Transient failure (network, 5xx) — keep the cached token and
        // optimistically reuse it. If it truly lacks scopes, the downstream
        // /user/installations call will fail with a clear error.
        info(`Already signed in as ${chalk.cyan("@" + existing.login)} (scope check skipped — GitHub unreachable)`);
        return existing;
      }
      // appScoped === "no" — definitively wrong token type (403)
      info(`Signed in as ${chalk.cyan("@" + existing.login)} but token lacks HQ App permissions`);
      clearGitHubAuth();
    } else {
      info("HQ App token expired — re-authenticating");
      clearGitHubAuth();
    }
  }

  // 2. No valid App token — run the device flow
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
    info("After creating your account, come back here and press Enter...");
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
 *   - "existing": user said they have an HQ Teams account → prompt for invite code, then discovery
 *   - "new":      user wants to create a new team → admin onboarding
 *
 * @param joinToken - Pre-supplied invite token (from --join flag). Skips the invite code prompt.
 */
export async function runTeamsFlow(
  mode: TeamsFlowMode,
  hqRoot: string,
  hqVersion: string,
  preAuth?: GitHubAuth,
  joinToken?: string
): Promise<TeamsFlowResult | null> {
  const auth = preAuth ?? await authenticate();
  if (!auth) return null;

  const result: TeamsFlowResult = { auth, member: null, admin: null, joinedByInvite: null };

  if (mode === "existing") {
    // Check for a pre-supplied token (--join flag) or prompt for one
    let token = joinToken;

    if (!token) {
      console.log();
      token = await prompt(
        "Enter your invite code (or press Enter to auto-discover)"
      );
    }

    // If the user provided a token, use the invite flow
    if (token) {
      // Validate the token before proceeding
      const decoded = decodeInviteToken(token);
      if (!decoded) {
        warn("That doesn't look like a valid invite code.");
        info("Check that you copied the full code starting with hq_");
        console.log();
        // Fall through to discovery as a courtesy
        info("Trying auto-discovery instead...");
      } else {
        result.joinedByInvite = await runJoinByInvite(auth, hqRoot, token);
        if (result.joinedByInvite) {
          return result;
        }
        // Join failed — don't fall through to discovery, the user needs to
        // fix the access issue first
        return result;
      }
    }

    // Auto-discovery: find teams via GitHub App installations
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
