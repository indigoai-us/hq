import * as Sentry from "@sentry/node";
import { BUNDLED_DSN } from "./sentry-dsn.generated.js";
import { beforeSend } from "./sentry-before-send.js";

export function initSentry(): void {
  const dsn = BUNDLED_DSN || process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    release: `hq-cli@${process.env.npm_package_version ?? "0.0.0"}`,
    environment: process.env.HQ_CLI_ENV ?? "production",
    initialScope: {
      tags: { repo: "hq-cli" },
    },
    beforeSend,
  });
}

export { Sentry };
