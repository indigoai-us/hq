/**
 * Shared Cognito session helpers for hq-cli commands.
 *
 * Consumed by:
 *   - `hq onboard` and `hq sync push|pull` (need token + VaultServiceConfig)
 *   - `hq auth refresh` and the standalone `hq-auth-refresh` bin invoked by
 *     the deploy skill (.claude/skills/deploy/SKILL.md step 4)
 *
 * Defaults point at the shared vault-indigo-hq-prod Cognito pool (canonical
 * post-2026-04-25 cutover; hq-dev remains the staging fallback via env
 * overrides). They mirror tools/vlt-e2e/e2e-create-company-smoke.ts so the
 * CLI and the in-tree demo script stay drift-free. Override any of them via
 * env:
 *
 *   AWS_REGION                 — e.g. us-east-1
 *   HQ_COGNITO_DOMAIN          — Cognito User Pool domain prefix
 *   HQ_COGNITO_CLIENT_ID       — App Client ID
 *   HQ_COGNITO_CALLBACK_PORT   — Loopback OAuth callback port
 *   HQ_VAULT_API_URL           — vault-service API Gateway URL
 */

import * as os from "os";
import * as path from "path";
import chalk from "chalk";
import {
  loadCachedTokens,
  isExpiring,
  refreshTokens,
  browserLogin,
  type CognitoAuthConfig,
  type VaultServiceConfig,
} from "@indigoai-us/hq-cloud";

export const DEFAULT_COGNITO: CognitoAuthConfig = {
  region: process.env.AWS_REGION ?? "us-east-1",
  userPoolDomain: process.env.HQ_COGNITO_DOMAIN ?? "vault-indigo-hq-prod",
  clientId: process.env.HQ_COGNITO_CLIENT_ID ?? "7acei2c8v870enheptb1j5foln",
  port: process.env.HQ_COGNITO_CALLBACK_PORT
    ? Number(process.env.HQ_COGNITO_CALLBACK_PORT)
    : 8765,
  // Skip Cognito's Hosted UI — go straight to Google OAuth. The Cognito
  // /oauth2/authorize endpoint honors `identity_provider` and performs an
  // internal redirect, so the user never sees the (un-styleable) Hosted UI.
  // Set HQ_COGNITO_IDENTITY_PROVIDER="" to fall back to the IdP picker for
  // accounts that use email+password (admin-created users without Google).
  identityProvider:
    process.env.HQ_COGNITO_IDENTITY_PROVIDER !== undefined
      ? process.env.HQ_COGNITO_IDENTITY_PROVIDER || undefined
      : "Google",
};

export const DEFAULT_VAULT_API_URL =
  process.env.HQ_VAULT_API_URL ?? "https://hqapi.getindigo.ai";

export const DEFAULT_HQ_ROOT = path.join(os.homedir(), "hq");

/**
 * Return a non-expired Cognito access token, refreshing or browser-logging-in
 * as needed. Cache lives at ~/.hq/cognito-tokens.json.
 *
 * Pass `interactive: false` from automated contexts (e.g. the `hq-auth-refresh`
 * bin invoked by the deploy skill) where failing fast is better than opening
 * a browser.
 */
export async function ensureCognitoToken(options: {
  interactive?: boolean;
} = {}): Promise<string> {
  const interactive = options.interactive ?? true;
  const cached = loadCachedTokens();

  if (cached && !isExpiring(cached, 120)) {
    return cached.accessToken;
  }

  if (cached) {
    try {
      if (interactive) {
        console.error(chalk.dim("  Refreshing expiring HQ session..."));
      }
      const refreshed = await refreshTokens(DEFAULT_COGNITO, cached.refreshToken);
      return refreshed.accessToken;
    } catch (err) {
      if (interactive) {
        console.error(
          chalk.dim(
            `  Refresh failed (${err instanceof Error ? err.message : err}), falling back to browser login`,
          ),
        );
      }
    }
  }

  if (!interactive) {
    throw new Error(
      "No valid HQ session and interactive login is disabled. Run `hq login` first.",
    );
  }

  console.error(chalk.cyan("  No cached HQ session — launching browser sign-in..."));
  const tokens = await browserLogin(DEFAULT_COGNITO);
  return tokens.accessToken;
}

/** Build a VaultServiceConfig with the given access token. */
export function buildVaultConfig(authToken: string): VaultServiceConfig {
  return {
    apiUrl: DEFAULT_VAULT_API_URL,
    authToken,
    region: DEFAULT_COGNITO.region,
  };
}

/**
 * Refresh the cached Cognito session once and return the result. Used by
 * `hq auth refresh` and the `hq-auth-refresh` bin. Never opens a browser —
 * if no cached tokens exist or the refresh fails, returns `refreshed: false`
 * with a reason string so the caller can decide what to do.
 */
export async function refreshCachedSession(): Promise<{
  refreshed: boolean;
  reason?: string;
}> {
  const cached = loadCachedTokens();
  if (!cached) {
    return { refreshed: false, reason: "no cached session" };
  }
  try {
    await refreshTokens(DEFAULT_COGNITO, cached.refreshToken);
    return { refreshed: true };
  } catch (err) {
    return {
      refreshed: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
