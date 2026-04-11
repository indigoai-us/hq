/**
 * Invite system for HQ Teams.
 *
 * Tokens are self-contained (no server) — they encode the team coordinates
 * so a new member can join without discovery. Security comes from GitHub:
 * the member still needs org access to clone the private repo.
 *
 * Token format: "hq_" + base64url({ org, repo, slug, teamName, cloneUrl, invitedBy })
 *
 * Admin flow:
 *   1. Generate token from team metadata
 *   2. Optionally send GitHub org invite by email
 *   3. Share token + instructions with member
 *
 * Member flow:
 *   1. Decode token → get team coordinates
 *   2. Auth via GitHub device flow
 *   3. Verify org membership (wait for invite acceptance if needed)
 *   4. Clone repo into companies/{slug}/
 */

import chalk from "chalk";
import { execSync } from "child_process";
import { type GitHubAuth, githubApi, openBrowser } from "./auth.js";

// ─── Token types ────────────────────────────────────────────────────────────

export interface InvitePayload {
  /** GitHub org login (e.g. "indigoai-us") */
  org: string;
  /** Repo name (e.g. "hq-indigo") */
  repo: string;
  /** Team slug (e.g. "indigo") — maps to companies/{slug}/ */
  slug: string;
  /** Human-readable team name */
  teamName: string;
  /** HTTPS clone URL for the repo */
  cloneUrl: string;
  /** GitHub login of the admin who generated the invite */
  invitedBy: string;
}

// ─── Token encode / decode ──────────────────────────────────────────────────

const TOKEN_PREFIX = "hq_";

function toBase64Url(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(b64: string): string {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

export function encodeInviteToken(payload: InvitePayload): string {
  return TOKEN_PREFIX + toBase64Url(JSON.stringify(payload));
}

export function decodeInviteToken(token: string): InvitePayload | null {
  try {
    const raw = token.startsWith(TOKEN_PREFIX)
      ? token.slice(TOKEN_PREFIX.length)
      : token;
    const json = fromBase64Url(raw);
    const parsed = JSON.parse(json);

    // Validate required fields
    if (
      typeof parsed.org !== "string" ||
      typeof parsed.repo !== "string" ||
      typeof parsed.slug !== "string" ||
      typeof parsed.teamName !== "string" ||
      typeof parsed.cloneUrl !== "string" ||
      typeof parsed.invitedBy !== "string"
    ) {
      return null;
    }

    return parsed as InvitePayload;
  } catch {
    return null;
  }
}

// ─── GitHub org invitation ──────────────────────────────────────────────────

interface OrgInviteResponse {
  id: number;
  login?: string;
  email?: string;
  role: string;
}

/**
 * Send a GitHub org invitation by email.
 *
 * Requires the authenticated user to be an org admin, and the GitHub App
 * to have "Organization > Members: Write" permission.
 *
 * Returns the invitation on success, or an error message string on failure.
 */
export async function sendOrgInviteByEmail(
  auth: GitHubAuth,
  orgLogin: string,
  email: string,
  role: "direct_member" | "admin" = "direct_member"
): Promise<{ ok: true; invite: OrgInviteResponse } | { ok: false; error: string }> {
  try {
    const invite = await githubApi<OrgInviteResponse>(
      `/orgs/${orgLogin}/invitations`,
      auth,
      {
        method: "POST",
        body: JSON.stringify({
          email,
          role,
        }),
      }
    );
    return { ok: true, invite };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("404") || message.includes("403")) {
      return {
        ok: false,
        error:
          "The HQ App doesn't have permission to send org invites. " +
          `Please invite the member manually at: https://github.com/orgs/${orgLogin}/people`,
      };
    }
    if (message.includes("422") && /already/i.test(message)) {
      return {
        ok: false,
        error: "This email has already been invited or is already a member.",
      };
    }
    return { ok: false, error: message };
  }
}

/**
 * Check whether a GitHub user is a member of an org.
 */
export async function checkOrgMembership(
  auth: GitHubAuth,
  orgLogin: string,
  username: string
): Promise<"active" | "pending" | "none"> {
  // Check active membership first
  try {
    await githubApi<unknown>(`/orgs/${orgLogin}/members/${username}`, auth);
    return "active";
  } catch {
    // Not an active member — check pending invitations
  }

  // Check if there's a pending invitation for this user
  try {
    const memberships = await githubApi<Array<{ state: string; organization: { login: string } }>>(
      "/user/memberships/orgs?state=pending&per_page=100",
      auth
    );
    const pending = memberships.find(
      (m) => m.organization.login.toLowerCase() === orgLogin.toLowerCase()
    );
    if (pending) return "pending";
  } catch {
    // Can't check pending — fall through
  }

  return "none";
}

/**
 * Check whether the authenticated user can access a specific repo.
 */
export async function checkRepoAccess(
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

// ─── Invite message template ────────────────────────────────────────────────

/**
 * Generate a ready-to-share invite message for the admin to send to the
 * new member. Designed to be copy-pasted into Slack, email, or text.
 */
export function formatInviteMessage(
  payload: InvitePayload,
  token: string,
  memberEmail?: string
): string {
  const orgInviteUrl = `https://github.com/orgs/${payload.org}/invitation`;
  const lines: string[] = [
    `You've been invited to join ${payload.teamName} on HQ!`,
    "",
  ];

  // Step 1: Accept org invite (which handles GitHub account creation too)
  if (memberEmail) {
    lines.push(
      `Step 1: Accept the GitHub invitation sent to ${memberEmail}`,
      `        (if you don't have a GitHub account yet, you'll be guided to create one)`,
      `        Direct link: ${orgInviteUrl}`,
      ""
    );
  } else {
    lines.push(
      `Step 1: Accept your GitHub organization invite`,
      `        Direct link: ${orgInviteUrl}`,
      `        (if you haven't received one, ask @${payload.invitedBy} to send it)`,
      ""
    );
  }

  // Step 2: Install Node.js (platform-specific instructions)
  lines.push(
    `Step 2: Install Node.js (if you don't have it already)`,
    "",
    `   Windows (PowerShell, run as Administrator):`,
    `     winget install OpenJS.NodeJS.LTS`,
    "",
    `   Mac (Terminal):`,
    `     brew install node`,
    `     (if you don't have brew: https://brew.sh)`,
    "",
    `   Or download from: https://nodejs.org`,
    ""
  );

  // Step 3: Single command with token
  lines.push(
    `Step 3: Open your terminal and run this command:`,
    "",
    `   npx create-hq --invite ${token}`,
    "",
    `   Then follow the prompts to sign in with GitHub and complete setup.`,
    "",
    `---`,
    `Questions? Ask @${payload.invitedBy} or visit https://getindigo.ai/hq`,
  );

  return lines.join("\n");
}

/**
 * Print the invite details to the console for the admin.
 */
export function printInviteSummary(
  payload: InvitePayload,
  token: string,
  _emailSent?: boolean,
  memberEmail?: string
): void {
  console.log();
  console.log(chalk.bold("  Invite ready!"));
  console.log();
  console.log(`  ${chalk.dim("Team:")}     ${chalk.cyan(payload.teamName)}`);
  console.log(`  ${chalk.dim("Org:")}      ${payload.org}`);
  if (memberEmail) {
    console.log(`  ${chalk.dim("Email:")}    ${memberEmail}`);
  }
  console.log();
  console.log(chalk.bold("  Invite code (share with the new member):"));
  console.log();
  console.log(`  ${chalk.cyan(token)}`);
  console.log();
  console.log(chalk.dim("  Full invite message (copy-paste ready):"));
  console.log(chalk.dim("  ─".repeat(30)));
  const msg = formatInviteMessage(payload, token, memberEmail);
  for (const line of msg.split("\n")) {
    console.log(chalk.dim("  ") + line);
  }
  console.log(chalk.dim("  ─".repeat(30)));
  console.log();
}

// ─── Mailto helper ──────────────────────────────────────────────────────────

/**
 * Build a mailto: URL pre-populated with the invite message.
 * Opens in the admin's default email client — they just hit Send.
 */
export function buildMailtoUrl(
  payload: InvitePayload,
  token: string,
  recipientEmail: string
): string {
  const subject = `You're invited to join ${payload.teamName} on HQ`;
  const body = formatInviteMessage(payload, token, recipientEmail);
  return `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Open the admin's email client with a pre-populated invite email.
 */
export function openInviteEmail(
  payload: InvitePayload,
  token: string,
  recipientEmail: string
): void {
  const url = buildMailtoUrl(payload, token, recipientEmail);
  openBrowser(url);
}

/**
 * Copy text to the system clipboard. Cross-platform: pbcopy (macOS),
 * clip (Windows), xclip/xsel (Linux). Returns true on success.
 */
export function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;
    if (platform === "darwin") {
      execSync("pbcopy", { input: text });
    } else if (platform === "win32") {
      execSync("clip", { input: text });
    } else {
      // Try xclip first, fall back to xsel
      try {
        execSync("xclip -selection clipboard", { input: text });
      } catch {
        execSync("xsel --clipboard --input", { input: text });
      }
    }
    return true;
  } catch {
    return false;
  }
}
