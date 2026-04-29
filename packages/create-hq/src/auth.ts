/**
 * Cognito-based authentication for create-hq.
 *
 * Uses the shared OSS `@indigoai-us/hq-cloud` helper to drive Cognito Hosted UI
 * through a PKCE + loopback OAuth flow. Forces Google as the identity provider
 * so the experience matches hq-installer (the Tauri desktop app) and the rest
 * of the HQ by Indigo suite.
 *
 * Token cache: `~/.hq/cognito-tokens.json` — canonical shared session file used
 * by hq-cloud, hq-cli, hq-installer, and the deploy skill. All four agree on
 * this path, so any of them can refresh or invalidate the session.
 *
 * Exports follow the pattern in hq-cli's `utils/cognito-session.ts`:
 *   - DEFAULT_COGNITO  — config matching hq-installer's .env.local
 *   - ensureCognitoToken({ interactive }) — top-level helper used by the
 *     teams flow. Returns `CognitoTokens` or null if sign-in failed.
 *   - readIdentity(tokens) — decodes the ID token payload (email, name).
 */

import {
  browserLogin,
  refreshTokens,
  loadCachedTokens,
  clearCachedTokens,
  isExpiring,
  type CognitoAuthConfig,
  type CognitoTokens,
} from "@indigoai-us/hq-cloud";

/**
 * Default Cognito pool for HQ by Indigo. Mirrors hq-installer's `.env.local`
 * and hq-cli's `DEFAULT_COGNITO`. All three tools share the same pool so a
 * single sign-in works across installer, CLI, and create-hq.
 *
 * Defaults point at the shared `vault-indigo-hq-prod` Cognito pool (canonical
 * post-2026-04-25 cutover). The legacy `hq-vault-dev` pool is no longer the
 * fallback — it remains reachable only via explicit `HQ_COGNITO_DOMAIN` env
 * override for staging tests. Mirrors `packages/hq-cli/src/utils/cognito-session.ts`
 * and `packages/hq-cloud/src/bin/sync-runner.ts` so all three callers stay
 * drift-free.
 *
 * Port 8765 matches hq-cli (not hq-installer's 53682) — Cognito App Client
 * callback URLs must list every port we use, and we're standardizing on 8765
 * for all Node-based callers.
 */
export const DEFAULT_COGNITO: CognitoAuthConfig = {
  region: process.env.AWS_REGION ?? "us-east-1",
  userPoolDomain: process.env.HQ_COGNITO_DOMAIN ?? "vault-indigo-hq-prod",
  clientId: process.env.HQ_COGNITO_CLIENT_ID ?? "7acei2c8v870enheptb1j5foln",
  port: process.env.HQ_COGNITO_CALLBACK_PORT
    ? Number(process.env.HQ_COGNITO_CALLBACK_PORT)
    : 8765,
  identityProvider: "Google",
  prompt: "select_account",
};

export interface HqIdentity {
  /** Cognito `sub` — stable user ID. */
  sub: string;
  email?: string;
  name?: string;
  /** Raw decoded JWT payload, for callers that need extra claims. */
  claims: Record<string, unknown>;
}

/**
 * Return a valid set of Cognito tokens, refreshing or launching the browser
 * flow as needed. Returns null when interactive login fails (user closed the
 * tab, timeout, network error) — caller should treat that as "user declined".
 *
 * When `interactive: false`, this function will never open a browser — it
 * returns null if no valid cached token is available. Useful for CI / non-TTY
 * environments where we want a hard fail instead of a hung browser prompt.
 */
export async function ensureCognitoToken(
  opts: { interactive?: boolean; config?: CognitoAuthConfig } = {},
): Promise<CognitoTokens | null> {
  const interactive = opts.interactive ?? true;
  const config = opts.config ?? DEFAULT_COGNITO;

  const cached = loadCachedTokens();
  if (cached && !isExpiring(cached)) return cached;

  if (cached) {
    try {
      return await refreshTokens(config, cached.refreshToken);
    } catch {
      // Refresh failed — fall through to interactive login (or return null
      // if interactive is disabled).
    }
  }

  if (!interactive) return null;

  try {
    return await browserLogin(config);
  } catch {
    return null;
  }
}

/**
 * Decode the ID token payload. No signature verification — we only read
 * display fields (email, name) for the UI. Never trust these claims for
 * authorization; the server re-verifies the JWT on every API call.
 */
export function readIdentity(tokens: CognitoTokens): HqIdentity | null {
  try {
    const [, payloadB64] = tokens.idToken.split(".");
    if (!payloadB64) return null;
    const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, "base64").toString("utf-8");
    const claims = JSON.parse(json) as Record<string, unknown>;
    return {
      sub: String(claims.sub ?? ""),
      email: typeof claims.email === "string" ? claims.email : undefined,
      name: typeof claims.name === "string" ? claims.name : undefined,
      claims,
    };
  } catch {
    return null;
  }
}

/** Delete the cached Cognito session. */
export function signOut(): void {
  clearCachedTokens();
}

export type { CognitoAuthConfig, CognitoTokens };
