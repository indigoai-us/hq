import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isGitHubActions = process.env.GITHUB_ACTIONS === "true";
const isPublishJob = process.env.GITHUB_JOB === "publish";
const dsn = process.env.HQ_CLI_PUBLISH_SENTRY_DSN ?? "";

if (isGitHubActions && isPublishJob && !dsn) {
  process.stderr.write(
    "[generate-dsn] FATAL: GITHUB_ACTIONS=true, GITHUB_JOB=publish, " +
      "but HQ_CLI_PUBLISH_SENTRY_DSN is not set. " +
      "Add the repo secret HQ_CLI_PUBLISH_SENTRY_DSN before publishing.\n",
  );
  process.exit(1);
}

const outPath = join(__dirname, "../src/sentry-dsn.generated.ts");
const content = `export const BUNDLED_DSN = "${dsn}";\n`;

writeFileSync(outPath, content, "utf8");
process.stdout.write(
  `[generate-dsn] Wrote BUNDLED_DSN="${dsn ? "[DSN set]" : ""}" to ${outPath}\n`,
);
