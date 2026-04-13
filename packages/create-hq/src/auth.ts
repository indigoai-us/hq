/**
 * GitHub App device flow auth for create-hq.
 *
 * Talks directly to github.com — no backend involved.
 *
 * Flow:
 *   1. POST github.com/login/device/code with our App's client_id
 *   2. Display user_code, open verification_uri in browser
 *   3. Poll github.com/login/oauth/access_token at the GitHub-specified interval
 *   4. On success: GET api.github.com/user → configure gh CLI with the token
 *
 * After authentication, the token is handed to `gh auth login --with-token`
 * so that subsequent sessions can use `gh` for all GitHub operations.
 * No credentials are persisted to disk by create-hq itself.
 *
 * Token values are NEVER written to stdout or logs.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec, execSync } from "child_process";
import chalk from "chalk";

// ─── Constants ──────────────────────────────────────────────────────────────

/** hq-team-sync GitHub App client ID (public — safe to commit). */
export const HQ_GITHUB_APP_CLIENT_ID = "Iv23liSdkCBQYhrNcRmI";
export const HQ_GITHUB_APP_SLUG = "hq-team-sync";

const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_USER_URL = "https://api.github.com/user";

const HQ_DIR = path.join(os.homedir(), ".hq");

// ─── Types ──────────────────────────────────────────────────────────────────

/** Authenticated GitHub user info. The access_token is held in-memory only. */
export interface GitHubAuth {
  /** ghu_ user-to-server token from GitHub App device flow (in-memory only). */
  access_token: string;
  /** GitHub login (username). */
  login: string;
  /** GitHub numeric user ID. */
  id: number;
  /** Display name (may be null on GitHub, fall back to login). */
  name: string | null;
  /** Public email (may be null if user has it private). */
  email: string | null;
  /** ISO timestamp the token was issued. */
  issued_at: string;
}

/**
 * Backwards-compat alias used by older modules. Will be removed once all
 * callers have migrated. New code should use GitHubAuth.
 */
export type AuthToken = GitHubAuth;

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  interval?: number;
}

interface GitHubUserResponse {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
}

// ─── gh CLI helpers ────────────────────────────────────────────────────────

/** Check if `gh` CLI is installed. */
function isGhInstalled(): boolean {
  try {
    execSync("gh --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Check if `gh` is authenticated with any GitHub host. */
function isGhAuthenticated(): boolean {
  try {
    execSync("gh auth status", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Configure `gh` CLI with a token and set up git credential helper.
 * This makes the token available for all future `gh` and `git` operations.
 */
function configureGhAuth(token: string): void {
  if (!isGhInstalled()) {
    console.error(
      chalk.dim(
        "  (gh CLI not found — install it from https://cli.github.com for team commands)"
      )
    );
    return;
  }

  try {
    // Pipe token to gh auth login (stdin, non-interactive)
    execSync("gh auth login --with-token", {
      input: token,
      stdio: ["pipe", "ignore", "ignore"],
    });

    // Configure git to use gh for HTTPS auth
    execSync("gh auth setup-git", { stdio: "ignore" });
  } catch (err) {
    console.error(
      chalk.dim("  (could not configure gh CLI — you can run `gh auth login` manually)")
    );
  }
}

/**
 * Save the GitHub auth to gh CLI. The token is handed to `gh auth login`
 * so it's stored in the OS keychain, not on disk as a plain file.
 */
export function saveGitHubAuth(auth: GitHubAuth): void {
  configureGhAuth(auth.access_token);
}

/**
 * Load GitHub auth from `gh` CLI. Returns null if gh is not installed
 * or not authenticated. Fetches user profile from GitHub API via gh.
 */
export function loadGitHubAuth(): GitHubAuth | null {
  if (!isGhInstalled() || !isGhAuthenticated()) return null;

  try {
    // Get the token from gh
    const token = execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    if (!token) return null;

    // Get user profile via gh api
    const userJson = execSync('gh api user --jq \'{"login":.login,"id":.id,"name":.name,"email":.email}\'', {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    const user = JSON.parse(userJson) as GitHubUserResponse;

    return {
      access_token: token,
      login: user.login,
      id: user.id,
      name: user.name,
      email: user.email,
      issued_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Remove stored credentials by logging out of gh. */
export function clearGitHubAuth(): void {
  if (!isGhInstalled()) return;
  try {
    execSync("gh auth logout --hostname github.com", {
      input: "Y\n",
      stdio: ["pipe", "ignore", "ignore"],
    });
  } catch {
    // ignore — may already be logged out
  }
}

/**
 * Quick liveness probe — does the stored token still work?
 * Uses `gh auth status` which validates the token against GitHub.
 */
export async function isGitHubAuthValid(auth: GitHubAuth): Promise<boolean> {
  // If we have a token in memory, verify it directly
  if (auth.access_token) {
    try {
      const res = await fetch(GITHUB_API_USER_URL, {
        headers: {
          Authorization: `token ${auth.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "create-hq",
        },
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Fall back to gh auth status
  return isGhAuthenticated();
}

// ─── Browser open (cross-platform) ──────────────────────────────────────────

/** Open a URL in the user's default browser. Best-effort, never throws. */
export function openBrowser(url: string): void {
  let command: string;
  if (process.platform === "darwin") {
    command = `open "${url}"`;
  } else if (process.platform === "win32") {
    // Windows: `start` is a cmd.exe builtin. The empty quotes are the
    // window title argument (start treats the first quoted arg as title).
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  exec(command, (err) => {
    if (err) {
      console.error(
        chalk.dim(`  (could not open browser automatically — visit ${url} manually)`)
      );
    }
  });
}

// ─── Device flow ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the GitHub App device authorization flow.
 *
 * On success, the token is:
 *   1. Returned in-memory as part of GitHubAuth (for the current session)
 *   2. Configured in `gh` CLI for future sessions (via gh auth login --with-token)
 *
 * Throws on:
 *   - Network errors talking to github.com
 *   - User-denied authorization (access_denied)
 *   - Device code expiration
 *   - Failure to fetch the user profile
 */
export async function startGitHubDeviceFlow(): Promise<GitHubAuth> {
  // 1. Request a device code
  const deviceRes = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "create-hq",
    },
    body: JSON.stringify({
      client_id: HQ_GITHUB_APP_CLIENT_ID,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!deviceRes.ok) {
    const body = await deviceRes.text().catch(() => "");
    throw new Error(`GitHub device code request failed (${deviceRes.status}): ${body}`);
  }

  const device = (await deviceRes.json()) as DeviceCodeResponse;

  // 2. Display the code and open the browser
  console.log();
  console.log(chalk.bold("  Sign in with GitHub"));
  console.log();
  console.log(`  Open this URL in your browser:`);
  console.log(`  ${chalk.cyan(device.verification_uri)}`);
  console.log();
  console.log(`  Enter this code: ${chalk.bold.white(device.user_code)}`);
  console.log();
  console.log(chalk.dim("  Waiting for authorization..."));

  openBrowser(device.verification_uri);

  // 3. Poll for token
  let pollInterval = Math.max((device.interval ?? 5) * 1000, 5000);
  const expiresAt = Date.now() + (device.expires_in ?? 900) * 1000;

  while (Date.now() < expiresAt) {
    await sleep(pollInterval);

    let tokenRes: Response;
    try {
      tokenRes = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "create-hq",
        },
        body: JSON.stringify({
          client_id: HQ_GITHUB_APP_CLIENT_ID,
          device_code: device.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Network blip — keep polling
      continue;
    }

    const data = (await tokenRes.json().catch(() => ({}))) as TokenResponse;

    if (data.error === "authorization_pending") continue;

    if (data.error === "slow_down") {
      // Per spec: increase polling interval by at least 5 seconds
      const bump = (data.interval ?? 5) * 1000;
      pollInterval = Math.max(pollInterval + bump, pollInterval + 5000);
      continue;
    }

    if (data.error === "expired_token") {
      throw new Error("GitHub device code expired — please run create-hq again");
    }
    if (data.error === "access_denied") {
      throw new Error("Authorization was denied");
    }
    if (data.error) {
      throw new Error(
        `GitHub auth error: ${data.error}${data.error_description ? ` — ${data.error_description}` : ""}`
      );
    }

    if (!data.access_token) {
      throw new Error("GitHub returned no access_token");
    }

    // 4. Fetch the authenticated user profile
    const userRes = await fetch(GITHUB_API_USER_URL, {
      headers: {
        Authorization: `token ${data.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "create-hq",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!userRes.ok) {
      const body = await userRes.text().catch(() => "");
      throw new Error(`Failed to fetch GitHub user (${userRes.status}): ${body}`);
    }

    const user = (await userRes.json()) as GitHubUserResponse;

    const auth: GitHubAuth = {
      access_token: data.access_token,
      login: user.login,
      id: user.id,
      name: user.name,
      email: user.email,
      issued_at: new Date().toISOString(),
    };

    // Configure gh CLI with the token for future sessions
    saveGitHubAuth(auth);
    return auth;
  }

  throw new Error("GitHub device flow timed out — please try again");
}

// ─── GitHub API helpers used by downstream flows ────────────────────────────

/**
 * Authenticated fetch against api.github.com. Throws on non-2xx with
 * the response body included for diagnostics.
 */
export async function githubApi<T>(
  pathname: string,
  auth: GitHubAuth,
  init: RequestInit = {}
): Promise<T> {
  const url = pathname.startsWith("https://")
    ? pathname
    : `https://api.github.com${pathname.startsWith("/") ? "" : "/"}${pathname}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `token ${auth.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "create-hq",
      ...(init.headers || {}),
    },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");

    // Friendly error when a regular gh CLI token hits the App-only installations endpoint.
    // This happens when the user ran `gh auth login` (default OAuth) instead of authenticating
    // through the HQ GitHub App device flow.
    if (
      res.status === 403 &&
      pathname.startsWith("/user/installations") &&
      body.includes("authorized to a GitHub App")
    ) {
      throw new Error(
        "You're signed in with a regular GitHub token that can't list App installations.\n" +
        "  HQ Teams requires authentication through the HQ GitHub App.\n\n" +
        "  To fix this, log out and re-run the installer:\n" +
        "    gh auth logout\n" +
        "    npx create-hq"
      );
    }

    throw new Error(`GitHub API ${res.status} ${pathname}: ${body}`);
  }

  // Some endpoints return 204
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
