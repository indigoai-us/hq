import { Command } from "commander";
import chalk from "chalk";
import {
  ensureCognitoToken,
  DEFAULT_VAULT_API_URL,
} from "../utils/cognito-session.js";

interface VaultApiOptions {
  token: string;
  path: string;
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
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
        if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
          console.error(chalk.red(`Invalid secret name '${name}': must match ^[A-Z][A-Z0-9_]*$ (e.g. MY_API_KEY)`));
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
    .action(async (_name: string) => {
      console.log(chalk.yellow("Not implemented yet (Step 11)"));
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

        console.log(chalk.bold("Secrets:"));
        for (const s of data.secrets) {
          const modified = s.lastModifiedDate
            ? chalk.dim(` (modified: ${s.lastModifiedDate})`)
            : "";
          console.log(`  ${s.name}${modified}`);
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
    .action(async (_name: string) => {
      console.log(chalk.yellow("Not implemented yet (Step 12)"));
    });

  secrets
    .command("exec")
    .description("Run a command with secrets injected as env vars")
    .action(async () => {
      console.log(chalk.yellow("Not implemented yet (Step 13)"));
    });

  secrets
    .command("generate-link <name>")
    .description("Generate a one-time link for someone to submit a secret value")
    .action(async (_name: string) => {
      console.log(chalk.yellow("Not implemented yet (Step 16)"));
    });

  const cache = secrets
    .command("cache")
    .description("Manage the local secrets cache");

  cache
    .command("clear")
    .description("Clear all cached secrets")
    .action(async () => {
      console.log(chalk.yellow("Not implemented yet (Step 15)"));
    });
}
