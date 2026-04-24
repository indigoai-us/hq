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

import { initSentry, Sentry } from "../sentry.js";
import { refreshCachedSession } from "../utils/cognito-session.js";

initSentry();

(async () => {
  let exitCode = 1;
  try {
    const result = await refreshCachedSession();
    if (result.refreshed) {
      exitCode = 0;
    } else {
      if (result.reason) {
        process.stderr.write(`hq-auth-refresh: ${result.reason}\n`);
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    process.stderr.write(
      `hq-auth-refresh: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  } finally {
    await Sentry.flush(2000);
    process.exit(exitCode);
  }
})();
