/**
 * `hq auth` — Cognito identity management for HQ.
 *
 * Subcommands:
 *   hq auth refresh   — refresh the cached Cognito session (non-interactive)
 *   hq auth status    — show whether a valid session is cached + expiry
 *
 * Sign-in / sign-up are owned by the onboarding web app at
 * https://onboarding.indigo-hq.com — this command only manages the local
 * token cache (~/.hq/cognito-tokens.json).
 */

import { Command } from "commander";
import chalk from "chalk";
import { loadCachedTokens, isExpiring } from "@indigoai-us/hq-cloud";
import { refreshCachedSession } from "../utils/cognito-session.js";

export function registerAuthCommands(program: Command): void {
  const authCmd = program
    .command("auth")
    .description("Manage the local HQ Cognito session");

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
        console.log(chalk.yellow("No cached HQ session"));
        process.exit(1);
      }
      const expiring = isExpiring(cached);
      console.log(
        expiring
          ? chalk.yellow(
              `HQ session cached but expiring (expiresAt=${cached.expiresAt})`,
            )
          : chalk.green(
              `HQ session valid (expiresAt=${cached.expiresAt})`,
            ),
      );
    });
}
