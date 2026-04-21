/**
 * `hq auth` — Cognito identity management for HQ.
 *
 * Subcommands:
 *   hq auth login     — open the Cognito Hosted UI in the browser and cache tokens
 *   hq auth logout    — clear the cached HQ session
 *   hq auth refresh   — refresh the cached Cognito session (non-interactive)
 *   hq auth status    — show whether a valid session is cached + expiry
 *
 * Sign-up is owned by the onboarding web app at
 * https://onboarding.indigo-hq.com. `hq auth login` signs an existing account
 * into this machine by writing ~/.hq/cognito-tokens.json; once cached, the
 * session is kept fresh by `hq auth refresh` / `hq-auth-refresh` and consumed
 * by the deploy + sync skills.
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  browserLogin,
  clearCachedTokens,
  loadCachedTokens,
  isExpiring,
  CognitoAuthError,
} from "@indigoai-us/hq-cloud";
import {
  DEFAULT_COGNITO,
  refreshCachedSession,
} from "../utils/cognito-session.js";

/**
 * Decode the (unverified) ID token payload for display purposes only.
 * The token was just returned by Cognito's token endpoint, so its contents
 * are trusted enough to print — we never use these claims for authorization.
 */
function peekIdToken(
  idToken: string,
): { email?: string; sub?: string } {
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return {};
    const pad =
      payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const normalized =
      payload.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const decoded = JSON.parse(
      Buffer.from(normalized, "base64").toString("utf-8"),
    );
    return { email: decoded.email, sub: decoded.sub };
  } catch {
    return {};
  }
}

export function registerAuthCommands(program: Command): void {
  const authCmd = program
    .command("auth")
    .description("Manage the local HQ Cognito session");

  authCmd
    .command("login")
    .description(
      "Sign in to HQ — opens the Cognito Hosted UI and caches tokens locally",
    )
    .action(async () => {
      const existing = loadCachedTokens();
      if (existing && !isExpiring(existing, 120)) {
        const who = peekIdToken(existing.idToken).email ?? "cached session";
        console.log(
          chalk.green(`Already signed in (${who}). Run \`hq auth logout\` to switch accounts.`),
        );
        return;
      }
      try {
        const tokens = await browserLogin(DEFAULT_COGNITO);
        const who = peekIdToken(tokens.idToken).email ?? "HQ";
        console.log(chalk.green(`Signed in as ${who}`));
        console.log(
          chalk.dim(`  Token cached at ~/.hq/cognito-tokens.json (expires ${tokens.expiresAt})`),
        );
      } catch (err) {
        const msg =
          err instanceof CognitoAuthError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        console.error(chalk.red(`Login failed: ${msg}`));
        console.error(
          chalk.dim(
            "  If you do not have an account, sign up at https://onboarding.indigo-hq.com",
          ),
        );
        process.exit(1);
      }
    });

  authCmd
    .command("logout")
    .description("Clear the cached HQ Cognito session")
    .action(() => {
      const existing = loadCachedTokens();
      if (!existing) {
        console.log(chalk.yellow("No cached HQ session"));
        return;
      }
      clearCachedTokens();
      console.log(chalk.green("Signed out — removed ~/.hq/cognito-tokens.json"));
    });

  authCmd
    .command("refresh")
    .description(
      "Refresh the cached Cognito session using the stored refresh token",
    )
    .action(async () => {
      const result = await refreshCachedSession();
      if (result.refreshed) {
        console.log(chalk.green("HQ session refreshed"));
        return;
      }
      console.error(
        chalk.yellow(`No refresh: ${result.reason ?? "unknown"}`),
      );
      process.exit(1);
    });

  authCmd
    .command("status")
    .description("Show whether a valid HQ session is cached")
    .action(() => {
      const cached = loadCachedTokens();
      if (!cached) {
        console.log(chalk.yellow("No cached HQ session — run `hq auth login`"));
        process.exit(1);
      }
      const who = peekIdToken(cached.idToken).email;
      const expiring = isExpiring(cached);
      const label = who ? `${who} — ` : "";
      console.log(
        expiring
          ? chalk.yellow(
              `${label}HQ session cached but expiring (expiresAt=${cached.expiresAt})`,
            )
          : chalk.green(
              `${label}HQ session valid (expiresAt=${cached.expiresAt})`,
            ),
      );
    });
}
