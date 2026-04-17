#!/usr/bin/env node

/**
 * Standalone `hq-auth-refresh` entry point.
 *
 * Exists so the deploy skill (.claude/skills/deploy/SKILL.md step 4) can
 * shell out to a plain binary instead of a subcommand. Equivalent to
 * `hq auth refresh`.
 *
 * Exit 0 on refresh, exit 1 if no cached session or refresh failed.
 * Writes the refreshed tokens to ~/.hq/cognito-tokens.json.
 */

import { refreshCachedSession } from "../utils/cognito-session.js";

async function main(): Promise<void> {
  const result = await refreshCachedSession();
  if (result.refreshed) {
    process.exit(0);
  }
  if (result.reason) {
    process.stderr.write(`hq-auth-refresh: ${result.reason}\n`);
  }
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(
    `hq-auth-refresh: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
