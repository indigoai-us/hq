/**
 * Shared Cognito session helpers for hq-cli commands.
 *
 * Consumed by `hq auth refresh` and the standalone `hq-auth-refresh` bin
 * invoked by the deploy skill (.claude/skills/deploy/SKILL.md step 4).
 *
 * Defaults point at the shared hq-vault-dev Cognito pool. Override via env:
 *
 *   AWS_REGION                 — e.g. us-east-1
 *   HQ_COGNITO_DOMAIN          — Cognito User Pool domain prefix
 *   HQ_COGNITO_CLIENT_ID       — App Client ID
 *   HQ_COGNITO_CALLBACK_PORT   — Loopback OAuth callback port
 */

import {
  loadCachedTokens,
  isExpiring,
  refreshTokens,
  browserLogin,
  type CognitoAuthConfig,
} from "@indigoai-us/hq-cloud";

export const DEFAULT_COGNITO: CognitoAuthConfig = {
  region: process.env.AWS_REGION ?? "us-east-1",
  userPoolDomain: process.env.HQ_COGNITO_DOMAIN ?? "hq-vault-dev",
  clientId:
    process.env.HQ_COGNITO_CLIENT_ID ?? "4mmujmjq3srakdueg656b9m0mp",
  port: process.env.HQ_COGNITO_CALLBACK_PORT
    ? Number(process.env.HQ_COGNITO_CALLBACK_PORT)
    : 8765,
};

/**
 * Return a non-expired Cognito access token, refreshing or browser-logging-in
 * as needed. Cache lives at ~/.hq/cognito-tokens.json.
 *
 * Pass `interactive: false` from automated contexts where failing fast is
 * better than opening a browser.
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
      const refreshed = await refreshTokens(
        DEFAULT_COGNITO,
        cached.refreshToken,
      );
      return refreshed.accessToken;
    } catch {
      // fall through to browser login
    }
  }

  if (!interactive) {
    throw new Error(
      "No valid HQ session and interactive login is disabled. Run `hq login` first.",
    );
  }

  const tokens = await browserLogin(DEFAULT_COGNITO);
  return tokens.accessToken;
}

/**
 * Refresh the cached Cognito session once and return the result. Used by
 * `hq auth refresh` and the `hq-auth-refresh` bin. Never opens a browser —
 * if no cached tokens exist or the refresh fails, throws.
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
