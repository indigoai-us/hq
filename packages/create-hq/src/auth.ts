/**
 * Auth utilities for create-hq (US-008 + US-005)
 *
 * Two auth flows:
 * - OAuth PKCE (startAuthFlow) — used for package install during scaffold
 * - Device code flow (startDeviceCodeFlow) — used for team sign-in (US-005)
 *
 * Reuses the same patterns as hq-cli/src/utils/auth.ts and
 * hq-cli/src/utils/token-store.ts but bundled inline so create-hq
 * has no dependency on @indigoai-us/hq-cli.
 *
 * Token values are NEVER written to stdout or logs.
 */

import * as crypto from "crypto";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import chalk from "chalk";

// ─── Token types & paths ─────────────────────────────────────────────────────

export interface AuthToken {
  clerk_session_token: string;
  user_id: string;
  email: string;
  expires_at: string;
}

const HQ_DIR = path.join(os.homedir(), ".hq");
const AUTH_FILE = path.join(HQ_DIR, "auth.json");

// ─── Token store ─────────────────────────────────────────────────────────────

function ensureHqDir(): void {
  if (!fs.existsSync(HQ_DIR)) {
    fs.mkdirSync(HQ_DIR, { recursive: true, mode: 0o700 });
  }
}

/** Save auth token to ~/.hq/auth.json with 0600 permissions. */
export function saveToken(token: AuthToken): void {
  ensureHqDir();
  const content = JSON.stringify(token, null, 2);
  fs.writeFileSync(AUTH_FILE, content, { mode: 0o600 });
}

/** Load auth token from ~/.hq/auth.json. Returns null if missing/invalid. */
export function loadToken(): AuthToken | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      return null;
    }
    const content = fs.readFileSync(AUTH_FILE, "utf-8");
    const parsed = JSON.parse(content);

    if (
      typeof parsed.clerk_session_token !== "string" ||
      typeof parsed.user_id !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.expires_at !== "string"
    ) {
      return null;
    }

    return parsed as AuthToken;
  } catch {
    return null;
  }
}

/** Check if a token is expired or within 5 minutes of expiry. */
export function isTokenExpired(token: AuthToken): boolean {
  const expiresAt = new Date(token.expires_at).getTime();
  const bufferMs = 5 * 60 * 1000;
  return Date.now() >= expiresAt - bufferMs;
}

// ─── PKCE helpers ────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, (err) => {
    if (err) {
      console.error(
        `Could not open browser automatically. Please visit:\n  ${url}`
      );
    }
  });
}

// ─── Auth flow ───────────────────────────────────────────────────────────────

/**
 * Start the OAuth PKCE auth flow:
 * 1. Generate PKCE code_verifier + code_challenge
 * 2. Start local HTTP server on a random port for the callback
 * 3. Open browser to Clerk auth URL
 * 4. Wait for callback with auth code
 * 5. Exchange code for token via registry /auth/token endpoint
 * 6. Save token and return AuthToken
 */
export async function startAuthFlow(registryUrl: string): Promise<AuthToken> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  return new Promise<AuthToken>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>"
          );
          server.close();
          reject(new Error(`Auth failed: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Missing auth code</h2><p>You can close this window.</p></body></html>"
          );
          server.close();
          reject(new Error("No authorization code received"));
          return;
        }

        // Exchange code for token
        const tokenResponse = await fetch(`${registryUrl}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            code_verifier: codeVerifier,
            redirect_uri: `http://localhost:${(server.address() as { port: number }).port}/callback`,
          }),
        });

        if (!tokenResponse.ok) {
          const body = await tokenResponse.text();
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Token exchange failed</h2><p>You can close this window.</p></body></html>"
          );
          server.close();
          reject(
            new Error(
              `Token exchange failed (${tokenResponse.status}): ${body}`
            )
          );
          return;
        }

        const tokenData = (await tokenResponse.json()) as AuthToken;

        // Save token to ~/.hq/auth.json
        saveToken(tokenData);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authenticated!</h2><p>You can close this window and return to the terminal.</p></body></html>"
        );
        server.close();
        resolve(tokenData);
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    // Listen on random port
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      const redirectUri = `http://localhost:${addr.port}/callback`;
      const authUrl = `${registryUrl}/auth/login?redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

      console.log("  Opening browser for authentication...");
      openBrowser(authUrl);
      console.log(`\n  If the browser doesn't open, visit:\n  ${authUrl}\n`);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out after 2 minutes"));
    }, 120_000);
  });
}

// ─── Device code flow (US-005) ──────────────────────────────────────────────

/**
 * Response from the device authorization endpoint.
 * The user visits verification_uri_complete (or verification_uri + enters
 * user_code) in their browser, while the CLI polls the token endpoint.
 */
interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

/**
 * Token response from polling the device code token endpoint.
 * When authorization is still pending, the endpoint returns
 * { error: "authorization_pending" } — we keep polling until
 * we get a real token or timeout.
 */
interface DeviceTokenResponse {
  clerk_session_token?: string;
  user_id?: string;
  email?: string;
  expires_at?: string;
  error?: string;
  error_description?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start the Cognito device code auth flow:
 * 1. POST to /auth/device to get device_code + user_code + verification URL
 * 2. Display the code and open browser to the verification URL
 * 3. Poll /auth/device/token until the user completes auth or timeout
 * 4. Save token and return AuthToken
 *
 * This flow avoids needing a local HTTP server or redirect URI,
 * making it ideal for CLI sign-in during team onboarding.
 */
export async function startDeviceCodeFlow(
  apiBase: string
): Promise<AuthToken> {
  // 1. Request device authorization
  const deviceRes = await fetch(`${apiBase}/auth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "create-hq" }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!deviceRes.ok) {
    const body = await deviceRes.text().catch(() => "");
    throw new Error(`Device authorization failed (${deviceRes.status}): ${body}`);
  }

  const device = (await deviceRes.json()) as DeviceAuthResponse;
  const pollInterval = Math.max((device.interval ?? 5) * 1000, 5000);
  const expiresAt = Date.now() + (device.expires_in ?? 600) * 1000;

  // 2. Display code and open browser
  console.log();
  console.log(chalk.bold("  Sign in to HQ"));
  console.log();
  console.log(
    `  Open this URL in your browser:\n  ${chalk.cyan(device.verification_uri_complete || device.verification_uri)}`
  );
  console.log();
  console.log(
    `  Your code: ${chalk.bold.white(device.user_code)}`
  );
  console.log();

  // Try to open the browser automatically
  openBrowser(device.verification_uri_complete || device.verification_uri);

  // 3. Poll for token
  while (Date.now() < expiresAt) {
    await sleep(pollInterval);

    let tokenRes: Response;
    try {
      tokenRes = await fetch(`${apiBase}/auth/device/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_code: device.device_code,
          client_id: "create-hq",
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Network error — keep polling
      continue;
    }

    if (!tokenRes.ok && tokenRes.status !== 400 && tokenRes.status !== 428) {
      const body = await tokenRes.text().catch(() => "");
      throw new Error(`Token polling failed (${tokenRes.status}): ${body}`);
    }

    const data = (await tokenRes.json()) as DeviceTokenResponse;

    if (data.error === "authorization_pending" || data.error === "slow_down") {
      // Keep polling — user hasn't completed auth yet
      continue;
    }

    if (data.error === "expired_token") {
      throw new Error("Device code expired — please try again");
    }

    if (data.error === "access_denied") {
      throw new Error("Authentication was denied");
    }

    if (data.error) {
      throw new Error(
        `Authentication error: ${data.error}${data.error_description ? ` — ${data.error_description}` : ""}`
      );
    }

    // Success — we have a token
    if (
      data.clerk_session_token &&
      data.user_id &&
      data.email &&
      data.expires_at
    ) {
      const token: AuthToken = {
        clerk_session_token: data.clerk_session_token,
        user_id: data.user_id,
        email: data.email,
        expires_at: data.expires_at,
      };

      saveToken(token);
      return token;
    }

    throw new Error("Unexpected token response — missing required fields");
  }

  throw new Error("Authentication timed out — please try again");
}
