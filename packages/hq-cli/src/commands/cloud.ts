/**
 * `hq sync` commands — push/pull files between the local HQ tree and the
 * company's S3 vault bucket.
 *
 * VLT-5 model: each command resolves a Cognito access token, asks
 * vault-service for the company's bucket + STS-vended credentials, and
 * runs the operation. No daemon, no init step (handled by `hq onboard`),
 * no long-lived background process — every invocation is self-contained.
 *
 * Subcommands:
 *   hq sync push [paths...]   — broadcast local file(s) to the vault
 *   hq sync pull              — pull all permitted files from the vault
 *   hq sync status            — show local journal summary
 */

import { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";

import {
  share,
  sync,
  readJournal,
  getJournalPath,
  type ConflictStrategy,
} from "@indigoai-us/hq-cloud";

import {
  DEFAULT_HQ_ROOT,
  ensureCognitoToken,
  buildVaultConfig,
} from "../utils/cognito-session.js";

interface CommonSyncOptions {
  hqRoot: string;
  company?: string;
}

export function registerCloudCommands(program: Command): void {
  program
    .command("push")
    .description("Push local file(s) to the company vault on S3")
    .argument("[paths...]", "Paths to push (defaults to current directory)")
    .option(
      "--hq-root <path>",
      `Local HQ tree root (default: ${DEFAULT_HQ_ROOT})`,
      DEFAULT_HQ_ROOT,
    )
    .option(
      "--company <slug>",
      "Company slug or UID (defaults to active company in .hq/config.json)",
    )
    .option(
      "--message <msg>",
      "Optional message attached to journal entries for these uploads",
    )
    .option(
      "--on-conflict <strategy>",
      "Conflict strategy: overwrite | keep | abort (omit for interactive)",
    )
    .action(
      async (
        paths: string[],
        options: CommonSyncOptions & {
          message?: string;
          onConflict?: ConflictStrategy;
        },
      ) => {
        try {
          const targetPaths =
            paths && paths.length > 0 ? paths : [process.cwd()];

          console.log(chalk.bold("\nHQ Sync — Push"));
          console.log(`  HQ root:  ${options.hqRoot}`);
          console.log(`  Company:  ${options.company ?? "(from .hq/config.json)"}`);
          console.log(`  Paths:    ${targetPaths.join(", ")}\n`);

          const accessToken = await ensureCognitoToken();
          const result = await share({
            paths: targetPaths,
            company: options.company,
            message: options.message,
            onConflict: options.onConflict,
            vaultConfig: buildVaultConfig(accessToken),
            hqRoot: options.hqRoot,
          });

          if (result.aborted) {
            console.log(
              chalk.yellow(
                `\n⚠ Push aborted (${result.filesUploaded} uploaded, ${result.filesSkipped} skipped)`,
              ),
            );
            process.exit(1);
          }

          console.log(
            chalk.green(
              `\n✓ Pushed ${result.filesUploaded} file(s) (${formatBytes(result.bytesUploaded)}, ${result.filesSkipped} skipped)`,
            ),
          );
        } catch (err) {
          console.error(
            chalk.red("\n✗ Push failed:"),
            err instanceof Error ? err.message : String(err),
          );
          process.exit(1);
        }
      },
    );

  program
    .command("pull")
    .description("Pull permitted files from the company vault to local HQ")
    .option(
      "--hq-root <path>",
      `Local HQ tree root (default: ${DEFAULT_HQ_ROOT})`,
      DEFAULT_HQ_ROOT,
    )
    .option(
      "--company <slug>",
      "Company slug or UID (defaults to active company in .hq/config.json)",
    )
    .option(
      "--on-conflict <strategy>",
      "Conflict strategy: overwrite | keep | abort (omit for interactive)",
    )
    .action(
      async (
        options: CommonSyncOptions & {
          onConflict?: ConflictStrategy;
        },
      ) => {
        try {
          console.log(chalk.bold("\nHQ Sync — Pull"));
          console.log(`  HQ root:  ${options.hqRoot}`);
          console.log(`  Company:  ${options.company ?? "(from .hq/config.json)"}\n`);

          const accessToken = await ensureCognitoToken();
          const result = await sync({
            company: options.company,
            onConflict: options.onConflict,
            vaultConfig: buildVaultConfig(accessToken),
            hqRoot: options.hqRoot,
          });

          if (result.aborted) {
            console.log(
              chalk.yellow(
                `\n⚠ Pull aborted (${result.filesDownloaded} downloaded, ${result.filesSkipped} skipped, ${result.conflicts} conflicts)`,
              ),
            );
            process.exit(1);
          }

          console.log(
            chalk.green(
              `\n✓ Pulled ${result.filesDownloaded} file(s) (${formatBytes(result.bytesDownloaded)}, ${result.filesSkipped} skipped, ${result.conflicts} conflicts)`,
            ),
          );
        } catch (err) {
          console.error(
            chalk.red("\n✗ Pull failed:"),
            err instanceof Error ? err.message : String(err),
          );
          process.exit(1);
        }
      },
    );

  program
    .command("status")
    .description("Show local sync journal summary")
    .option(
      "--hq-root <path>",
      `Local HQ tree root (default: ${DEFAULT_HQ_ROOT})`,
      DEFAULT_HQ_ROOT,
    )
    .action((options: { hqRoot: string }) => {
      try {
        const journalPath = getJournalPath(options.hqRoot);
        if (!fs.existsSync(journalPath)) {
          console.log(chalk.dim("No sync journal yet — run `hq sync push` or `hq sync pull` to create one."));
          console.log(chalk.dim(`  Expected at: ${journalPath}`));
          return;
        }

        const journal = readJournal(options.hqRoot);
        const entries = Object.entries(journal.files ?? {});
        const lastSyncTimes = entries
          .map(([, entry]) => entry.syncedAt)
          .filter((t): t is string => typeof t === "string")
          .sort();
        const lastSync = lastSyncTimes.at(-1) ?? "never";
        const totalBytes = entries.reduce(
          (acc, [, entry]) => acc + (entry.size ?? 0),
          0,
        );

        const configPath = path.join(options.hqRoot, ".hq", "config.json");
        let activeCompany: string | undefined;
        if (fs.existsSync(configPath)) {
          try {
            const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            activeCompany = cfg.activeCompany;
          } catch {
            // ignore
          }
        }

        console.log(chalk.bold("\nHQ Sync — Status"));
        console.log(`  HQ root:        ${options.hqRoot}`);
        console.log(`  Active company: ${activeCompany ?? chalk.dim("(none)")}`);
        console.log(`  Tracked files:  ${entries.length}`);
        console.log(`  Total size:     ${formatBytes(totalBytes)}`);
        console.log(`  Last sync:      ${lastSync}`);
        console.log(`  Journal:        ${journalPath}`);
      } catch (err) {
        console.error(
          chalk.red("✗ Status failed:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
