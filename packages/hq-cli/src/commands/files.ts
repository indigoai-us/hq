import { Command } from "commander";
import chalk from "chalk";
import { ensureCognitoToken } from "../utils/cognito-session.js";
import { vaultApiFetch, getCompanyUid } from "./secrets.js";
import { GROUP_ID_PATTERN, EMAIL_PATTERN, normalizeFilePrefix } from "./_patterns.js";

export function registerFilesCommand(program: Command): void {
  const files = program
    .command("files")
    .description("Manage file access controls in HQ vault")
    .option("--company <slug>", "Company slug (resolves to companyUid)");

  files
    .command("share <prefix>")
    .description("Share a file prefix with a person or group")
    .requiredOption("--with <principal>", "Email address or group id to share with")
    .requiredOption("--permission <level>", "Permission level: read | write")
    .action(async (prefix: string, opts: { with: string; permission: string }) => {
      try {
        const canonicalPrefix = normalizeFilePrefix(prefix);

        if (!["read", "write"].includes(opts.permission)) {
          console.error(chalk.red(`Invalid permission '${opts.permission}': must be one of read, write`));
          process.exit(1);
        }

        const principal = opts.with;
        const isEmail = EMAIL_PATTERN.test(principal);
        const isGroup = GROUP_ID_PATTERN.test(principal);
        if (!isEmail && !isGroup) {
          console.error(chalk.red(`Invalid principal '${principal}': must be an email address or a group id matching grp_<alphanumeric>`));
          process.exit(1);
        }
        const granteeType = isEmail ? "email" : "group";
        const granteeId = isEmail ? principal.trim().toLowerCase() : principal;

        const token = await ensureCognitoToken();
        const companySlug = files.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        let res = await vaultApiFetch({
          token,
          path: `/files/${encodeURIComponent(companyUid)}/acl/grant`,
          method: "POST",
          body: { prefix: canonicalPrefix, granteeType, granteeId, permission: opts.permission },
        });

        // No ACL row exists yet for this prefix. Auto-create one with this
        // grant as its first entry, then report success — saves the caller
        // from needing a separate "create" step.
        let autoCreated = false;
        if (res.status === 404) {
          res = await vaultApiFetch({
            token,
            path: `/files/${encodeURIComponent(companyUid)}/acl`,
            method: "POST",
            body: {
              prefix: canonicalPrefix,
              entries: [{ granteeType, granteeId, permission: opts.permission }],
            },
          });
          autoCreated = res.ok;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, string>;
          if (res.status === 401) {
            console.error(chalk.red("Not authenticated — please run `hq login`"));
          } else if (res.status === 403) {
            console.error(chalk.red("Not authorized to share this file prefix"));
          } else if (res.status === 404) {
            console.error(chalk.red("ACL record not found — the prefix may not have an ACL yet"));
          } else if (res.status === 409) {
            console.error(chalk.red("Concurrent modification — please retry"));
          } else if (res.status >= 500) {
            console.error(chalk.red(`Server error: ${body.error ?? res.statusText}`));
          } else {
            console.error(chalk.red(body.message ?? body.error ?? "Invalid request"));
          }
          process.exit(1);
        }

        const data = await res.json() as { acl?: { path?: string; prefix?: string } };
        const printedPrefix = data.acl?.path ?? data.acl?.prefix ?? canonicalPrefix;
        const verb = autoCreated ? "Created ACL and granted" : "Granted";
        console.log(chalk.green(`${verb} ${opts.permission} on ${printedPrefix} to ${granteeId}`));
      } catch (err) {
        console.error(chalk.red("Error:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  files
    .command("unshare <prefix>")
    .description("Remove a file access grant")
    .requiredOption("--with <principal>", "Email address or group id to remove")
    .action(async (prefix: string, opts: { with: string }) => {
      try {
        const canonicalPrefix = normalizeFilePrefix(prefix);

        const principal = opts.with;
        const isEmail = EMAIL_PATTERN.test(principal);
        const isGroup = GROUP_ID_PATTERN.test(principal);
        if (!isEmail && !isGroup) {
          console.error(chalk.red(`Invalid principal '${principal}': must be an email address or a group id matching grp_<alphanumeric>`));
          process.exit(1);
        }
        const granteeType = isEmail ? "email" : "group";
        const granteeId = isEmail ? principal.trim().toLowerCase() : principal;

        const token = await ensureCognitoToken();
        const companySlug = files.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: `/files/${encodeURIComponent(companyUid)}/acl/revoke`,
          method: "POST",
          body: { prefix: canonicalPrefix, granteeType, granteeId },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, string>;
          if (res.status === 401) {
            console.error(chalk.red("Not authenticated — please run `hq login`"));
          } else if (res.status === 403) {
            console.error(chalk.red("Not authorized to modify this file prefix's ACL"));
          } else if (res.status === 404) {
            console.log(chalk.green(`Grant already absent for '${canonicalPrefix}' / ${granteeId}`));
            return;
          } else if (res.status >= 500) {
            console.error(chalk.red(`Server error: ${body.error ?? res.statusText}`));
          } else {
            console.error(chalk.red(body.message ?? body.error ?? "Invalid request"));
          }
          process.exit(1);
        }

        console.log(chalk.green(`Removed grant for ${granteeId} on '${canonicalPrefix}'`));
      } catch (err) {
        console.error(chalk.red("Error:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  files
    .command("acl <prefix>")
    .description("Show the ACL (access control list) for a file prefix")
    .action(async (prefix: string) => {
      try {
        const canonicalPrefix = normalizeFilePrefix(prefix);

        const token = await ensureCognitoToken();
        const companySlug = files.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: `/files/${encodeURIComponent(companyUid)}/acl`,
          query: { prefix: canonicalPrefix },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, string>;
          if (res.status === 401) {
            console.error(chalk.red("Not authenticated — please run `hq login`"));
          } else if (res.status === 403) {
            console.error(chalk.red("Not authorized to view this file prefix's ACL"));
          } else if (res.status === 404) {
            console.error(chalk.red(`No ACL record exists for '${canonicalPrefix}'`));
          } else if (res.status >= 500) {
            console.error(chalk.red(`Server error: ${body.error ?? res.statusText}`));
          } else {
            console.error(chalk.red(body.message ?? body.error ?? "Invalid request"));
          }
          process.exit(1);
        }

        const data = await res.json() as {
          acl: {
            itemType: string;
            companyUid: string;
            // Server returns `path` (the FileAcl field name); older builds
            // used `prefix`. Read both so the CLI works against either.
            path?: string;
            prefix?: string;
            creatorUid: string;
            open?: boolean;
            entries: Array<{
              granteeType: string;
              granteeId: string;
              permission: string;
              grantedBy: string;
              grantedAt: string;
            }>;
            effectivePermission?: string | null;
            createdAt: string;
            updatedAt: string;
          };
        };

        const acl = data.acl;
        const aclStatus = acl.open ? "open" : "restricted";
        const aclPrefix = acl.path ?? acl.prefix ?? canonicalPrefix;

        console.log(chalk.green(`ACL for ${aclPrefix} (${aclStatus})`));
        console.log(`Creator: ${acl.creatorUid}`);
        if (acl.effectivePermission) {
          console.log(`Your effective permission: ${acl.effectivePermission}`);
        }

        if (acl.entries.length === 0) {
          if (acl.open) {
            console.log(chalk.gray("Open ACL — all active members have read access."));
          } else {
            console.log(chalk.gray("No explicit grants — only creator has access."));
          }
          return;
        }

        console.log("Entries:");
        const TYPE_W = Math.max(4, ...acl.entries.map((e) => e.granteeType.length));
        const GRANTEE_W = Math.max(7, ...acl.entries.map((e) => e.granteeId.length));
        const PERM_W = Math.max(10, ...acl.entries.map((e) => e.permission.length));
        const BY_W = Math.max(10, ...acl.entries.map((e) => e.grantedBy.length));
        const tableHeader = [
          "TYPE".padEnd(TYPE_W),
          "GRANTEE".padEnd(GRANTEE_W),
          "PERMISSION".padEnd(PERM_W),
          "GRANTED_BY".padEnd(BY_W),
          "GRANTED_AT",
        ].join("  ");
        console.log(chalk.bold(tableHeader));
        for (const e of acl.entries) {
          const grantedAt = e.grantedAt.slice(0, 10);
          console.log([
            e.granteeType.padEnd(TYPE_W),
            e.granteeId.padEnd(GRANTEE_W),
            e.permission.padEnd(PERM_W),
            e.grantedBy.padEnd(BY_W),
            grantedAt,
          ].join("  "));
        }
      } catch (err) {
        console.error(chalk.red("Error:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
