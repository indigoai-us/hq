/**
 * Auth utilities for create-hq — OAuth PKCE flow for Clerk (US-008)
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
