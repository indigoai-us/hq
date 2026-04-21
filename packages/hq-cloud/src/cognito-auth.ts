/**
 * Cognito browser-OAuth helper (VLT-9).
 *
 * Drives the Cognito Hosted UI authorization-code + PKCE flow for the
 * vault-service User Pool. Used by the CLI (`hq login`, `create-hq`) to
 * obtain a JWT that is then passed to the vault-service API as
 * `Authorization: Bearer <accessToken>`.
 *
 * Why PKCE: the CLI is a public client (no secret), so we use PKCE per
 * RFC 7636 to prove that the same process that started the auth request
 * is the one exchanging the code for tokens.
 *
 * Why a localhost callback: Cognito allows `http://localhost:*` as a
 * redirect URI specifically for native/CLI apps (RFC 8252 §7). We spin
 * up a one-shot HTTP server on the chosen port, capture exactly one
 * callback, then close it.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import * as os from "os";
import open from "open";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CognitoAuthConfig {
  /** AWS region the User Pool lives in (e.g. "us-east-1"). */
  region: string;
  /** Cognito User Pool Domain prefix (e.g. "vault-indigo-stefanjohnson"). */
  userPoolDomain: string;
  /** App Client ID (e.g. "4mmujmjq3srakdueg656b9m0mp"). */
  clientId: string;
  /** Loopback callback port. Defaults to 3000. */
  port?: number;
  /** OAuth scopes. Defaults to ["openid", "email", "profile"]. */
  scopes?: string[];
}

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the access token expires. Writers MUST emit a number. Readers accept ISO 8601 strings for backward compatibility with pre-migration token files. */
  expiresAt: string | number;
  tokenType: "Bearer";
}

/** Returned when an interactive login is needed but stdin/browser is unavailable. */
export class CognitoAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CognitoAuthError";
  }
}

// ---------------------------------------------------------------------------
// Token cache (~/.hq/cognito-tokens.json)
// ---------------------------------------------------------------------------

const HQ_DIR = path.join(os.homedir(), ".hq");
const TOKEN_FILE = path.join(HQ_DIR, "cognito-tokens.json");

export function loadCachedTokens(): CognitoTokens | null {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  try {
    const raw = fs.readFileSync(TOKEN_FILE, "utf-8");
    return JSON.parse(raw) as CognitoTokens;
  } catch {
    return null;
  }
}

export function saveCachedTokens(tokens: CognitoTokens): void {
  if (!fs.existsSync(HQ_DIR)) {
    fs.mkdirSync(HQ_DIR, { recursive: true, mode: 0o700 });
  }
  const tmpPath = path.join(HQ_DIR, `.cognito-tokens.json.tmp.${process.pid}`);
  fs.writeFileSync(tmpPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, TOKEN_FILE);
}

export function clearCachedTokens(): void {
  if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
}

/**
 * Parse `expiresAt` to epoch-ms. Canonical on-disk shape is epoch milliseconds
 * (number). Older token files may contain ISO 8601 strings. Accept both for
 * migration safety. Returns null for anything unparseable — callers should
 * treat that as "expired" and force a refresh.
 */
function parseExpiresAtMs(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** True when the token expires within the given buffer (default 60s). */
export function isExpiring(tokens: CognitoTokens, bufferSeconds = 60): boolean {
  const expiresAt = parseExpiresAtMs(tokens.expiresAt);
  if (expiresAt === null) return true;
  return expiresAt - Date.now() < bufferSeconds * 1000;
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(
    crypto.createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge };
}

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

function authBaseUrl(config: CognitoAuthConfig): string {
  return `https://${config.userPoolDomain}.auth.${config.region}.amazoncognito.com`;
}

function redirectUri(port: number): string {
  return `http://localhost:${port}/callback`;
}

// ---------------------------------------------------------------------------
// Browser login
// ---------------------------------------------------------------------------

/**
 * Open the Cognito Hosted UI in the user's browser, wait for the redirect
 * back to localhost, and exchange the auth code for tokens.
 *
 * Times out after 5 minutes if the user doesn't complete the flow.
 */
export async function browserLogin(
  config: CognitoAuthConfig,
): Promise<CognitoTokens> {
  const port = config.port ?? 3000;
  const scopes = (config.scopes ?? ["openid", "email", "profile"]).join(" ");
  const { verifier, challenge } = generatePkce();
  const state = base64UrlEncode(crypto.randomBytes(16));

  const authUrl = new URL(`${authBaseUrl(config)}/login`);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("redirect_uri", redirectUri(port));
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  const code = await waitForAuthCode(port, state);
  const tokens = await exchangeCodeForTokens(config, code, verifier, port);
  saveCachedTokens(tokens);
  return tokens;

  // -- inner: spin up loopback server and open browser ---------------------
  function waitForAuthCode(port: number, expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // cleanup() is a function declaration so it can be referenced from the
      // server callbacks and the timeout closure below before its source
      // position. It clears the 15-min login timer + closes the loopback
      // server — without this both keep Node's event loop alive after the
      // calling script "completes", making it look hung.
      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);
        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h1>Authentication failed</h1><p>${escapeHtml(error)}</p>`);
          cleanup();
          reject(new CognitoAuthError(`Cognito returned error: ${error}`));
          return;
        }
        if (state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h1>State mismatch</h1><p>Possible CSRF — try again.</p>");
          cleanup();
          reject(new CognitoAuthError("Cognito state parameter mismatch"));
          return;
        }
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h1>Missing code</h1>");
          cleanup();
          reject(new CognitoAuthError("Cognito callback missing code"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<!doctype html><html><body style="font-family:system-ui;text-align:center;padding:48px;">
            <h1>Signed in to HQ by Indigo</h1>
            <p>You can close this tab and return to your terminal.</p>
            <script>setTimeout(()=>window.close(),1500)</script>
          </body></html>`,
        );
        cleanup();
        resolve(code);
      });

      server.on("error", (err) => {
        cleanup();
        reject(err);
      });
      server.listen(port, "127.0.0.1", () => {
        console.log(`\n  Opening browser for HQ sign-in...`);
        console.log(`  If your browser doesn't open, visit:\n  ${authUrl.toString()}\n`);
        open(authUrl.toString()).catch(() => {
          /* user can paste the URL manually */
        });
      });

      const loginTimer = setTimeout(
        () => {
          cleanup();
          reject(new CognitoAuthError("Login timed out after 15 minutes"));
        },
        15 * 60 * 1000,
      );

      function cleanup() {
        clearTimeout(loginTimer);
        server.close();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Token exchange + refresh
// ---------------------------------------------------------------------------

interface CognitoTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

async function exchangeCodeForTokens(
  config: CognitoAuthConfig,
  code: string,
  verifier: string,
  port: number,
): Promise<CognitoTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri(port),
  });

  const res = await fetch(`${authBaseUrl(config)}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new CognitoAuthError(
      `Token exchange failed (${res.status}): ${text}`,
    );
  }
  const data = (await res.json()) as CognitoTokenResponse;
  if (!data.refresh_token) {
    throw new CognitoAuthError(
      "Cognito did not return a refresh token — check OAuth scopes include offline_access semantics",
    );
  }
  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: "Bearer",
  };
}

/**
 * Use the refresh token to obtain a fresh access token without user interaction.
 * The refresh token itself is NOT rotated by Cognito on the refresh grant, so
 * we preserve the existing one in the result.
 */
export async function refreshTokens(
  config: CognitoAuthConfig,
  currentRefreshToken: string,
): Promise<CognitoTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: currentRefreshToken,
  });

  const res = await fetch(`${authBaseUrl(config)}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new CognitoAuthError(
      `Refresh failed (${res.status}): ${text}`,
    );
  }
  const data = (await res.json()) as CognitoTokenResponse;
  const tokens: CognitoTokens = {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token ?? currentRefreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: "Bearer",
  };
  saveCachedTokens(tokens);
  return tokens;
}

/**
 * High-level helper: return a non-expired access token, refreshing or
 * launching browser login as needed.
 *
 * Pass `interactive: false` from automated contexts where you would rather
 * fail fast than open a browser.
 */
export async function getValidAccessToken(
  config: CognitoAuthConfig,
  options: { interactive?: boolean } = {},
): Promise<string> {
  const interactive = options.interactive ?? true;
  const cached = loadCachedTokens();

  if (cached && !isExpiring(cached)) return cached.accessToken;

  if (cached) {
    try {
      const refreshed = await refreshTokens(config, cached.refreshToken);
      return refreshed.accessToken;
    } catch {
      // fall through to interactive login
    }
  }

  if (!interactive) {
    throw new CognitoAuthError(
      "No valid HQ session and interactive login is disabled. Run `hq login` first.",
    );
  }

  const fresh = await browserLogin(config);
  return fresh.accessToken;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
