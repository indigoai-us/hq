/**
 * GitHub App device flow auth for create-hq.
 *
 * Talks directly to github.com — no backend involved.
 *
 * Flow:
 *   1. POST github.com/login/device/code with our App's client_id
 *   2. Display user_code, open verification_uri in browser
 *   3. Poll github.com/login/oauth/access_token at the GitHub-specified interval
 *   4. On success: GET api.github.com/user → store { access_token, login, id, name, email }
 *
 * Token is stored at ~/.hq/credentials.json (mode 0600). Tokens are
 * GitHub App user-to-server tokens (ghu_…), so they ignore OAuth scopes —
 * permissions are configured on the App settings page.
 *
 * Token values are NEVER written to stdout or logs.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import chalk from "chalk";

// ─── Constants ──────────────────────────────────────────────────────────────

/** hq-team-sync GitHub App client ID (public — safe to commit). */
export const HQ_GITHUB_APP_CLIENT_ID = "Iv23liSdkCBQYhrNcRmI";
export const HQ_GITHUB_APP_SLUG = "hq-team-sync";

const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_USER_URL = "https://api.github.com/user";

const HQ_DIR = path.join(os.homedir(), ".hq");
const CREDENTIALS_FILE = path.join(HQ_DIR, "credentials.json");

// ─── Types ──────────────────────────────────────────────────────────────────

/** Stored credentials for the authenticated GitHub user. */
export interface GitHubAuth {
  /** ghu_ user-to-server token from GitHub App device flow. */
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

// ─── Token store ────────────────────────────────────────────────────────────

function ensureHqDir(): void {
  if (!fs.existsSync(HQ_DIR)) {
    fs.mkdirSync(HQ_DIR, { recursive: true, mode: 0o700 });
  }
}

/** Save credentials to ~/.hq/credentials.json with 0600 perms. */
export function saveGitHubAuth(auth: GitHubAuth): void {
  ensureHqDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(auth, null, 2), {
    mode: 0o600,
  });
}

/** Load credentials, or null if missing/invalid. */
export function loadGitHubAuth(): GitHubAuth | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
    if (
      typeof parsed.access_token !== "string" ||
      typeof parsed.login !== "string" ||
      typeof parsed.id !== "number"
    ) {
      return null;
    }
    return parsed as GitHubAuth;
  } catch {
    return null;
  }
}

/** Remove stored credentials. */
export function clearGitHubAuth(): void {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
  } catch {
    // ignore
  }
}

/**
 * Quick liveness probe — does the stored token still work?
 * Calls api.github.com/user with the token; returns true on 200.
 */
export async function isGitHubAuthValid(auth: GitHubAuth): Promise<boolean> {
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
    throw new Error(`GitHub API ${res.status} ${pathname}: ${body}`);
  }

  // Some endpoints return 204
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
