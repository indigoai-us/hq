import { Command } from "commander";
import chalk from "chalk";
import * as readline from "node:readline";
import { spawn } from "node:child_process";
import {
  ensureCognitoToken,
  DEFAULT_VAULT_API_URL,
} from "../utils/cognito-session.js";
import {
  readCache,
  writeCache,
  removeCacheEntry,
  clearAllCache,
} from "../utils/secrets-cache.js";

interface VaultApiOptions {
  token: string;
  path: string;
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

function shellSingleQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

// API Gateway v2 URL-decodes `%2F` before route matching, so a full-name
// `encodeURIComponent` would collapse structural `/` separators into a single
// segment the `/name/{proxy+}` route can't match.
function buildSecretNamePath(companyUid: string, name: string): string {
  const encodedName = name
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `/secrets/${encodeURIComponent(companyUid)}/name/${encodedName}`;
}

async function vaultApiFetch(opts: VaultApiOptions): Promise<Response> {
  const url = new URL(opts.path, DEFAULT_VAULT_API_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v);
    }
  }
  return fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function resolveCompanyUid(
  token: string,
  slug: string,
): Promise<string> {
  const res = await vaultApiFetch({
    token,
    path: `/entity/by-slug/company/${encodeURIComponent(slug)}`,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to resolve company slug '${slug}': ${(body as Record<string, string>).error ?? res.statusText}`,
    );
  }
  const data = (await res.json()) as { entity: { uid: string } };
  return data.entity.uid;
}

interface MembershipEntry {
  companyUid: string;
  role: string;
  status: string;
  membershipKey: string;
}

async function resolveCompanyFromMemberships(
  token: string,
): Promise<string> {
  const res = await vaultApiFetch({
    token,
    path: "/membership/me",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch memberships — run `hq login` and try again");
  }
  const data = (await res.json()) as { memberships: MembershipEntry[] };
  const active = data.memberships.filter((m) => m.status === "active");
  if (active.length === 0) {
    throw new Error("No active company memberships found. Use --company <slug> to specify.");
  }
  if (active.length === 1) {
    return active[0].companyUid;
  }
  const uids = active.map((m) => m.companyUid).join(", ");
  throw new Error(
    `Multiple companies found (${uids}). Use --company <slug> to specify which one.`,
  );
}

async function getCompanyUid(
  token: string,
  companySlug: string | undefined,
): Promise<string> {
  if (companySlug) {
    return resolveCompanyUid(token, companySlug);
  }
  return resolveCompanyFromMemberships(token);
}

function parseDuration(input: string): number | null {
  const match = input.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  if (unit === "d") return value * 24 * 60 * 60 * 1000;
  return null;
}

function confirmPrompt(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function readFromPipedStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data.replace(/\n$/, "")));
    process.stdin.on("error", reject);
  });
}

function promptSecretInteractively(): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write("Enter secret value: ");

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    let value = "";
    process.stdin.setEncoding("utf8");

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      process.stdin.pause();
    };

    const onEnd = () => {
      cleanup();
      process.stdout.write("\n");
      resolve(value);
    };

    const onData = (ch: string) => {
      for (const c of ch) {
        const code = c.codePointAt(0)!;
        if (c === "\n" || c === "\r" || code === 4) {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        } else if (code === 3) {
          cleanup();
          reject(new Error("Aborted"));
          return;
        } else if (code === 0x1b) {
          return;
        } else if (code === 127) {
          if (value.length > 0) {
            value = value.slice(0, -1);
          }
        } else if (code >= 0x20) {
          value += c;
        }
      }
    };

    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.resume();
  });
}

export function registerSecretsCommand(program: Command): void {
  const secrets = program
    .command("secrets")
    .description("Manage secrets in HQ vault (SSM Parameter Store)")
    .option("--company <slug>", "Company slug (resolves to companyUid)");

  secrets
    .command("set <name>")
    .description("Create or update a secret")
    .option("--from-stdin", "Read secret value from piped stdin")
    .action(async (name: string, opts: { fromStdin?: boolean }) => {
      try {
        if (!/^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]+)*$/.test(name)) {
          console.error(chalk.red(`Invalid secret name '${name}': must match ^[A-Z][A-Z0-9_]*(/[A-Z][A-Z0-9_]+)*$ (e.g. MY_API_KEY or DEV/MY_KEY)`));
          process.exit(1);
        }

        let value: string;
        if (opts.fromStdin) {
          if (process.stdin.isTTY) {
            console.error(chalk.red("Error: --from-stdin requires piped input (e.g. echo 'val' | hq secrets set NAME --from-stdin)"));
            process.exit(1);
          }
          value = await readFromPipedStdin();
        } else {
          if (!process.stdin.isTTY) {
            console.error(chalk.red("Error: stdin is not a terminal. Use --from-stdin for piped input."));
            process.exit(1);
          }
          value = await promptSecretInteractively();
        }

        if (!value) {
          console.error(chalk.red("Error: secret value cannot be empty."));
          process.exit(1);
        }

        if (Buffer.byteLength(value, "utf8") > 4096) {
          console.error(chalk.red(`Secret value exceeds 4096-byte SSM limit (got ${Buffer.byteLength(value, "utf8")} bytes).`));
          process.exit(1);
        }

        const token = await ensureCognitoToken();
        const companySlug = secrets.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: `/secrets/${encodeURIComponent(companyUid)}`,
          method: "POST",
          body: { name, value },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error(
            chalk.red(`Failed to set secret: ${(body as Record<string, string>).error ?? res.statusText}`),
          );
          process.exit(1);
        }

        removeCacheEntry(companyUid, name);
        console.log(chalk.green(`Secret '${name}' saved.`));
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  secrets
    .command("get <name>")
    .description("Get a secret's metadata (use --reveal for value)")
    .option("--reveal", "Include the decrypted secret value")
    .action(async (name: string, opts: { reveal?: boolean }) => {
      try {
        const token = await ensureCognitoToken();
        const companySlug = secrets.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const query: Record<string, string> = {};
        if (opts.reveal) {
          query.reveal = "true";
        }

        const res = await vaultApiFetch({
          token,
          path: buildSecretNamePath(companyUid, name),
          query: Object.keys(query).length > 0 ? query : undefined,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error(
            chalk.red(`Failed to get secret: ${(body as Record<string, string>).error ?? res.statusText}`),
          );
          process.exit(1);
        }

        const data = (await res.json()) as {
          secret: {
            name: string;
            companyUid: string;
            type?: string;
            lastModifiedDate?: string;
            version?: number;
            value?: string;
          };
        };

        const s = data.secret;
        console.log(chalk.bold(`Secret: ${s.name}`));
        if (s.lastModifiedDate) {
          console.log(`  Last Modified: ${s.lastModifiedDate}`);
        }
        if (s.version != null) {
          console.log(`  Version:       ${s.version}`);
        }
        if (opts.reveal && s.value != null) {
          console.log(`  Value:         ${s.value}`);
        } else {
          console.log(`  Value:         ${chalk.dim("[REDACTED]")}`);
        }
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  secrets
    .command("list")
    .description("List all secrets for the company")
    .action(async () => {
      try {
        const token = await ensureCognitoToken();
        const companySlug = secrets.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: `/secrets/${encodeURIComponent(companyUid)}`,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error(
            chalk.red(`Failed to list secrets: ${(body as Record<string, string>).error ?? res.statusText}`),
          );
          process.exit(1);
        }

        const data = (await res.json()) as {
          secrets: { name: string; lastModifiedDate?: string; version?: number }[];
        };

        if (data.secrets.length === 0) {
          console.log(chalk.dim("No secrets found."));
          return;
        }

        const nameWidth = Math.max(4, ...data.secrets.map((s) => s.name.length));
        const header = `${"NAME".padEnd(nameWidth)}  LAST MODIFIED`;
        console.log(chalk.bold(header));
        for (const s of data.secrets) {
          const modified = s.lastModifiedDate ?? "-";
          console.log(`${s.name.padEnd(nameWidth)}  ${modified}`);
        }
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  secrets
    .command("delete <name>")
    .description("Delete a secret")
    .option("--force", "Skip confirmation prompt")
    .action(async (name: string, opts: { force?: boolean }) => {
      try {
        if (!/^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]+)*$/.test(name)) {
          console.error(chalk.red(`Invalid secret name '${name}': must match ^[A-Z][A-Z0-9_]*(/[A-Z][A-Z0-9_]+)*$ (e.g. MY_API_KEY or DEV/MY_KEY)`));
          process.exit(1);
        }

        if (!opts.force) {
          const confirmed = await confirmPrompt(
            `Delete secret '${name}'? This cannot be undone.`,
          );
          if (!confirmed) {
            console.log(chalk.dim("Aborted."));
            return;
          }
        }

        const token = await ensureCognitoToken();
        const companySlug = secrets.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: buildSecretNamePath(companyUid, name),
          method: "DELETE",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error(
            chalk.red(`Failed to delete secret: ${(body as Record<string, string>).error ?? res.statusText}`),
          );
          process.exit(1);
        }

        removeCacheEntry(companyUid, name);
        console.log(chalk.green(`Secret '${name}' deleted.`));
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  secrets
    .command("exec")
    .description("Run a command with secrets injected as env vars")
    .requiredOption("--only <keys>", "Comma-separated list of secret names to inject (required)")
    .allowUnknownOption(true)
    .action(async (_opts: { only: string }, cmd: Command) => {
      try {
        const rawArgs = cmd.args;
        const dashIndex = process.argv.indexOf("--");
        let childArgs: string[];
        if (dashIndex !== -1) {
          childArgs = process.argv.slice(dashIndex + 1);
        } else {
          childArgs = rawArgs;
        }

        if (childArgs.length === 0) {
          console.error(chalk.red("Error: no command specified. Usage: hq secrets exec --only KEY1,KEY2 -- <command>"));
          process.exit(1);
        }

        const keys = _opts.only.split(",").map((k) => k.trim()).filter(Boolean);
        if (keys.length === 0) {
          console.error(chalk.red("Error: --only requires at least one secret name."));
          process.exit(1);
        }

        for (const key of keys) {
          if (!/^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]+)*$/.test(key)) {
            console.error(chalk.red(`Invalid secret name '${key}': must match ^[A-Z][A-Z0-9_]*(/[A-Z][A-Z0-9_]+)*$`));
            process.exit(1);
          }
        }

        const token = await ensureCognitoToken();
        const companySlug = secrets.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const revealed = await Promise.all(
          keys.map(async (key) => {
            const cached = readCache(companyUid, key);
            if (cached !== null) {
              return { key, value: cached };
            }
            const res = await vaultApiFetch({
              token,
              path: buildSecretNamePath(companyUid, key),
              query: { reveal: "true" },
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(
                `Failed to fetch secret '${key}': ${(body as Record<string, string>).error ?? res.statusText}`,
              );
            }
            const data = (await res.json()) as {
              secret: { name: string; value?: string };
            };
            if (data.secret.value == null) {
              throw new Error(`Secret '${key}' has no value (reveal may not be permitted).`);
            }
            writeCache(companyUid, key, data.secret.value);
            return { key, value: data.secret.value };
          }),
        );

        const secretEnv: Record<string, string> = {};
        for (const { key, value } of revealed) {
          secretEnv[key] = value;
        }

        const [childCmd, ...childCmdArgs] = childArgs;
        const child = spawn(childCmd, childCmdArgs, {
          stdio: "inherit",
          env: { ...process.env, ...secretEnv },
        });

        child.on("error", (err) => {
          console.error(chalk.red(`Failed to start command '${childCmd}': ${err.message}`));
          process.exit(1);
        });

        child.on("close", (code, signal) => {
          if (signal) {
            process.kill(process.pid, signal);
          }
          process.exit(code ?? 1);
        });
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  secrets
    .command("env")
    .description("Print 'export KEY=VALUE' lines suitable for: source <(hq secrets env --only K1,K2)")
    .requiredOption("--only <keys>", "Comma-separated list of secret names to print (required)")
    .action(async (opts: { only: string }) => {
      try {
        const redact = process.stdout.isTTY;
        if (redact) {
          console.error(
            chalk.yellow(
              "stdout is a terminal — values redacted. Use: source <(hq secrets env --only KEY1,KEY2)",
            ),
          );
        }

        const keys = opts.only.split(",").map((k) => k.trim()).filter(Boolean);
        if (keys.length === 0) {
          console.error(chalk.red("Error: --only requires at least one secret name."));
          process.exit(1);
        }

        for (const key of keys) {
          if (!/^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]+)*$/.test(key)) {
            console.error(chalk.red(`Invalid secret name '${key}': must match ^[A-Z][A-Z0-9_]*(/[A-Z][A-Z0-9_]+)*$`));
            process.exit(1);
          }
        }

        const token = await ensureCognitoToken();
        const companySlug = secrets.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const revealed = await Promise.all(
          keys.map(async (key) => {
            const cached = readCache(companyUid, key);
            if (cached !== null) {
              return { key, value: cached };
            }
            const res = await vaultApiFetch({
              token,
              path: buildSecretNamePath(companyUid, key),
              query: { reveal: "true" },
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(
                `Failed to fetch secret '${key}': ${(body as Record<string, string>).error ?? res.statusText}`,
              );
            }
            const data = (await res.json()) as {
              secret: { name: string; value?: string };
            };
            if (data.secret.value == null) {
              throw new Error(`Secret '${key}' has no value (reveal may not be permitted).`);
            }
            writeCache(companyUid, key, data.secret.value);
            return { key, value: data.secret.value };
          }),
        );

        for (const { key, value } of revealed) {
          const out = redact ? "[REDACTED]" : value;
          process.stdout.write(`export ${key}=${shellSingleQuote(out)}\n`);
        }
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  secrets
    .command("generate-link <name>")
    .description("Generate a one-time link for someone to submit a secret value")
    .option("--expires <duration>", "Token expiry duration (e.g. 24h, 2d, 30m)", "24h")
    .action(async (name: string, opts: { expires: string }) => {
      try {
        if (!/^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]+)*$/.test(name)) {
          console.error(chalk.red(`Invalid secret name '${name}': must match ^[A-Z][A-Z0-9_]*(/[A-Z][A-Z0-9_]+)*$ (e.g. MY_API_KEY or DEV/MY_KEY)`));
          process.exit(1);
        }

        const expiresInMs = parseDuration(opts.expires);
        if (expiresInMs === null) {
          console.error(chalk.red(`Invalid duration '${opts.expires}'. Use formats like 30m, 12h, 2d.`));
          process.exit(1);
        }

        const MAX_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
        if (expiresInMs > MAX_EXPIRY_MS) {
          console.error(chalk.red("Maximum expiry is 7 days (7d)."));
          process.exit(1);
        }

        const token = await ensureCognitoToken();
        const companySlug = secrets.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: buildSecretNamePath(companyUid, name),
          method: "POST",
          body: { expiresInMs },
          query: { action: "generate-token" },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error(
            chalk.red(`Failed to generate link: ${(body as Record<string, string>).error ?? res.statusText}`),
          );
          process.exit(1);
        }

        const data = (await res.json()) as {
          url: string;
          expiresAt: string;
          secretName: string;
        };

        console.log(chalk.green("Secret input link generated:"));
        console.log(`\n  ${data.url}\n`);
        console.log(chalk.dim(`  Secret:  ${data.secretName}`));
        console.log(chalk.dim(`  Expires: ${data.expiresAt}`));
        console.log(chalk.dim("  One-time use — link is invalidated after first submission."));
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  const cache = secrets
    .command("cache")
    .description("Manage the local secrets cache");

  cache
    .command("clear")
    .description("Clear all cached secrets")
    .action(async () => {
      clearAllCache();
      console.log(chalk.green("Secrets cache cleared."));
    });
}
