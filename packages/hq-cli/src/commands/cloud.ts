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
  loadCachedTokens,
  type ConflictStrategy,
  type EntityContext,
  type SyncProgressEvent,
  type UploadAuthor,
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
    .option(
      "--creds-from-stdin",
      "Read a pre-vended EntityContext as JSON from stdin instead of vending " +
        "via the cached Cognito session. Use when the caller (e.g. AppBar HQ " +
        "Sync) has its own STS pipeline (`/sts/vend-child` with task scope) " +
        "and just needs share()'s upload mechanics. The caller is responsible " +
        "for vending credentials with enough TTL for the run.",
    )
    .option(
      "--json",
      "Emit each share()-level event as a JSON Lines record on stderr (one " +
        "JSON object per line) instead of human-readable console output. A " +
        "synthetic `{type:\"complete\",...}` line is appended at the end with " +
        "the final ShareResult. Subprocess callers parse these to render their " +
        "own UI (e.g. AppBar Tauri events).",
    )
    .action(
      async (
        paths: string[],
        options: CommonSyncOptions & {
          message?: string;
          onConflict?: ConflictStrategy;
          credsFromStdin?: boolean;
          json?: boolean;
        },
      ) => {
        const jsonMode = options.json === true;
        // Suppress the human banner/result output in JSON mode — the parent
        // process renders its own UI from the stderr ndjson stream.
        const log = (msg: string): void => {
          if (!jsonMode) console.log(msg);
        };
        const emitJson = (event: Record<string, unknown>): void => {
          process.stderr.write(JSON.stringify(event) + "\n");
        };

        try {
          const targetPaths =
            paths && paths.length > 0 ? paths : [process.cwd()];

          log(chalk.bold("\nHQ Sync — Push"));
          log(`  HQ root:  ${options.hqRoot}`);
          log(
            `  Company:  ${options.company ?? "(from .hq/config.json or stdin)"}`,
          );
          log(`  Paths:    ${targetPaths.join(", ")}\n`);

          // Resolve credentials. Two paths:
          //   1. --creds-from-stdin: parse JSON EntityContext from stdin (the
          //      AppBar shell-out contract — vend-child upstream, pipe in here).
          //   2. default: vend via cached Cognito session (the human CLI path).
          let entityContext: EntityContext | undefined;
          let vaultConfig: ReturnType<typeof buildVaultConfig> | undefined;

          if (options.credsFromStdin) {
            if (process.stdin.isTTY) {
              throw new Error(
                "--creds-from-stdin requires JSON on stdin, but stdin is a " +
                  "TTY. Pipe the EntityContext JSON via subprocess stdin " +
                  "(e.g. `echo '{...}' | hq sync push --creds-from-stdin ...`).",
              );
            }
            const raw = await readAllStdin();
            try {
              entityContext = JSON.parse(raw) as EntityContext;
            } catch (e) {
              throw new Error(
                `--creds-from-stdin: failed to parse stdin as JSON: ${
                  e instanceof Error ? e.message : String(e)
                }`,
              );
            }
          } else {
            const accessToken = await ensureCognitoToken();
            vaultConfig = buildVaultConfig(accessToken);
          }

          // In JSON mode, forward every share() event verbatim to stderr as
          // ndjson. In human mode, share()'s defaultConsoleLogger handles the
          // rendering (no onEvent → falls through to stdout/stderr printing).
          const onEvent = jsonMode
            ? (event: SyncProgressEvent): void =>
                emitJson(event as unknown as Record<string, unknown>)
            : undefined;

          // Stamp every uploaded object's S3 user metadata with the syncing
          // user's Cognito identity (`Metadata['created-by']`). The hq-console
          // vault UI's CREATED BY column reads this back via HEAD; without it,
          // every row renders `—`. Resolved best-effort from the cached
          // idToken — pre-vended `--creds-from-stdin` paths still get author
          // attribution as long as the caller is logged in locally.
          const author = resolveUploadAuthorFromCache();

          const result = await share({
            paths: targetPaths,
            company: options.company,
            message: options.message,
            onConflict: options.onConflict,
            vaultConfig,
            entityContext,
            hqRoot: options.hqRoot,
            onEvent,
            ...(author ? { author } : {}),
          });

          if (jsonMode) {
            // Synthetic terminal event so subprocess consumers can read final
            // counts without summing per-file events. Distinguished from
            // SyncProgressEvent by `type:"complete"` (not in the share()
            // event schema — added at the CLI seam).
            emitJson({
              type: "complete",
              filesUploaded: result.filesUploaded,
              bytesUploaded: result.bytesUploaded,
              filesSkipped: result.filesSkipped,
              conflictPaths: result.conflictPaths,
              aborted: result.aborted,
            });
          }

          if (result.aborted) {
            log(
              chalk.yellow(
                `\n⚠ Push aborted (${result.filesUploaded} uploaded, ${result.filesSkipped} skipped)`,
              ),
            );
            process.exit(1);
          }

          log(
            chalk.green(
              `\n✓ Pushed ${result.filesUploaded} file(s) (${formatBytes(result.bytesUploaded)}, ${result.filesSkipped} skipped)`,
            ),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (jsonMode) {
            // In JSON mode, the parent process is parsing stderr for ndjson —
            // human-formatted error lines would corrupt the stream. Emit a
            // structured `fatal` event instead and let the parent surface it.
            emitJson({ type: "fatal", message });
          } else {
            console.error(chalk.red("\n✗ Push failed:"), message);
          }
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

/**
 * Read all of stdin as a UTF-8 string. Used by `--creds-from-stdin` to
 * receive a JSON-serialized EntityContext from the parent process (e.g.
 * AppBar HQ Sync). Returns the empty string when stdin closes immediately.
 *
 * Caller is expected to detect TTY first — this function will block forever
 * waiting for stdin to close if invoked interactively.
 */
async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Resolve the syncing user's `UploadAuthor` (sub + email) from the cached
 * Cognito idToken. Returns `undefined` when no tokens are cached or the
 * token is missing the required claims — share() then skips the metadata
 * stamp gracefully (not an error).
 *
 * We deliberately decode the JWT here instead of verifying it: Cognito
 * already verified at issuance, and we only use the public claims to
 * label the upload's S3 user metadata (no auth decision rides on it).
 */
function resolveUploadAuthorFromCache(): UploadAuthor | undefined {
  const tokens = loadCachedTokens();
  if (!tokens?.idToken) return undefined;
  const parts = tokens.idToken.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf-8");
    const claims = JSON.parse(json) as { sub?: string; email?: string };
    if (claims.sub && claims.email) {
      return { userSub: claims.sub, email: claims.email };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
