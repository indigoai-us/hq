/**
 * GitHub App device flow auth for create-hq.
 *
 * Talks directly to github.com — no backend involved.
 *
 * Flow:
 *   1. POST github.com/login/device/code with our App's client_id
 *   2. Display user_code, open verification_uri in browser
 *   3. Poll github.com/login/oauth/access_token at the GitHub-specified interval
 *   4. On success: GET api.github.com/user → save token to ~/.hq/app-token.json
 *
 * The HQ App token is stored in ~/.hq/app-token.json (mode 0600) and is
 * completely independent of the user's `gh` CLI auth. This means:
 *   - Running `gh auth login` / `gh auth logout` does not affect HQ auth
 *   - HQ auth does not overwrite the user's existing `gh` token
 *   - The App token is only used for HQ-specific API calls (installations, etc.)
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

/** Where the HQ App token is persisted. Exported for tests. */
export const HQ_APP_TOKEN_PATH = path.join(HQ_DIR, "app-token.json");

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

// ─── Token persistence (~/.hq/app-token.json) ────────────────────────────

/**
 * Save the HQ App auth to ~/.hq/app-token.json.
 *
 * The file is written with mode 0600 (owner read+write only). The user's
 * existing `gh` CLI auth is never touched.
 *
 * @param tokenPath — override for testing; defaults to HQ_APP_TOKEN_PATH
 */
export function saveGitHubAuth(auth: GitHubAuth, tokenPath = HQ_APP_TOKEN_PATH): void {
  const dir = path.dirname(tokenPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(tokenPath, JSON.stringify(auth, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/**
 * Load HQ App auth from ~/.hq/app-token.json.
 *
 * Returns null if the file doesn't exist, is corrupted, or is missing
 * required fields. Does NOT fall back to `gh` CLI — the HQ App token
 * is separate from the user's personal GitHub auth.
 *
 * @param tokenPath — override for testing; defaults to HQ_APP_TOKEN_PATH
 */
export function loadGitHubAuth(tokenPath = HQ_APP_TOKEN_PATH): GitHubAuth | null {
  try {
    if (!fs.existsSync(tokenPath)) return null;
    const raw = fs.readFileSync(tokenPath, "utf-8");
    const data = JSON.parse(raw);
    // Minimal validation — must have at least a token and login
    if (!data.access_token || !data.login) return null;
    return data as GitHubAuth;
  } catch {
    return null;
  }
}

/**
 * Remove stored HQ App credentials.
 *
 * Deletes ~/.hq/app-token.json. Does NOT touch `gh` CLI auth.
 *
 * @param tokenPath — override for testing; defaults to HQ_APP_TOKEN_PATH
 */
export function clearGitHubAuth(tokenPath = HQ_APP_TOKEN_PATH): void {
  try {
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
  } catch {
    // ignore — may already be gone
  }
}

/**
 * Quick liveness probe — does the stored token still work?
 * Validates the token by hitting GET /user on api.github.com.
 */
export async function isGitHubAuthValid(auth: GitHubAuth): Promise<boolean> {
  if (!auth.access_token) return false;
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

/** Result of the App scope probe. */
export type AppScopeResult = "yes" | "no" | "unknown";

/**
 * Probe whether a token has GitHub App scopes by hitting /user/installations.
 *
 * Returns:
 *   - `"yes"`     — 2xx, token has App scopes
 *   - `"no"`      — 403, token is definitively the wrong type
 *   - `"unknown"` — transient failure (network error, 5xx, timeout)
 *
 * Callers should only delete cached tokens on `"no"`, not on `"unknown"`.
 * This is a lightweight check — we request per_page=1 to minimise payload.
 */
export async function isAppScopedToken(auth: GitHubAuth): Promise<AppScopeResult> {
  if (!auth.access_token) return "no";
  try {
    const res = await fetch(
      "https://api.github.com/user/installations?per_page=1",
      {
        headers: {
          Authorization: `token ${auth.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "create-hq",
        },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (res.ok) return "yes";
    // 401/403 = definitive "wrong token type"
    if (res.status === 401 || res.status === 403) return "no";
    // Anything else (429, 5xx) = transient
    return "unknown";
  } catch {
    // Network error, timeout, DNS failure = transient
    return "unknown";
  }
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
 *   2. Persisted to ~/.hq/app-token.json for future sessions
 *
 * The user's existing `gh` CLI auth is never modified.
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

    // Persist for future sessions (does not touch gh CLI)
    saveGitHubAuth(auth);
    return auth;
  }

  throw new Error("GitHub device flow timed out — please try again");
}

// ─── gh CLI token (opportunistic) ──────────────────────────────────────────

/**
 * Try to get the user's `gh` CLI OAuth token.
 *
 * Returns the token string if `gh` is installed, the user is logged in, and
 * `gh auth token` succeeds. Returns null otherwise — this is purely
 * opportunistic and never throws.
 *
 * The gh CLI token typically has `read:org` scope, which lets us enumerate
 * ALL the user's org memberships — not just orgs where our GitHub App is
 * installed. This gives us a better org picker during admin onboarding.
 */
export function getGhCliToken(): string | null {
  try {
    const token = execSync("gh auth token", {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5_000,
    })
      .toString()
      .trim();
    // Sanity check — gh tokens start with gho_ or ghp_ (OAuth / PAT)
    if (token && token.length > 10) return token;
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch orgs where the user is an admin, using a raw bearer token.
 *
 * Works with both gh CLI tokens (PAT/OAuth) and GitHub App user tokens.
 * The difference: a gh CLI token with `read:org` scope sees ALL orgs,
 * while an App token only sees orgs where the App is installed.
 *
 * Returns an empty array on any error (permissions, network, etc.).
 */
export async function fetchAdminOrgsWithToken(
  token: string
): Promise<{ login: string; id: number }[]> {
  try {
    const res = await fetch(
      "https://api.github.com/user/memberships/orgs?state=active&per_page=100",
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "create-hq",
        },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) return [];
    const memberships = (await res.json()) as Array<{
      role: string;
      organization: { login: string; id: number };
    }>;
    return memberships
      .filter((m) => m.role === "admin")
      .map((m) => ({
        login: m.organization.login,
        id: m.organization.id,
      }));
  } catch {
    return [];
  }
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

    // Friendly error when a non-App token hits the App-only installations endpoint.
    if (
      res.status === 403 &&
      pathname.startsWith("/user/installations") &&
      body.includes("authorized to a GitHub App")
    ) {
      throw new Error(
        "You're signed in with a regular GitHub token that can't list App installations.\n" +
        "  HQ Teams requires authentication through the HQ GitHub App.\n\n" +
        "  To fix this, re-run the installer — it will prompt you to authorize the HQ App:\n" +
        "    npx create-hq"
      );
    }

    throw new Error(`GitHub API ${res.status} ${pathname}: ${body}`);
  }

  // Some endpoints return 204
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
