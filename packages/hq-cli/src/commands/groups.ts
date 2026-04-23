import { Command } from "commander";
import chalk from "chalk";
import { ensureCognitoToken } from "../utils/cognito-session.js";
import { vaultApiFetch, getCompanyUid } from "./secrets.js";
import { GROUP_ID_PATTERN } from "./_patterns.js";

const EMAIL_PATTERN = /^[^\s]+@[^\s]+$/;
const PERSON_UID_PATTERN = /^prs_[A-Za-z0-9_-]+$/;

function detectPrincipalType(
  principal: string,
): { granteeType: "email" | "person"; granteeId: string } | null {
  if (EMAIL_PATTERN.test(principal)) {
    // Server normalizes email again; we normalize here so local validation /
    // cache keys agree with the server-side canonicalization.
    return { granteeType: "email", granteeId: principal.trim().toLowerCase() };
  }
  if (PERSON_UID_PATTERN.test(principal)) {
    return { granteeType: "person", granteeId: principal };
  }
  return null;
}

function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

export function registerGroupsCommand(program: Command): void {
  const groups = program
    .command("groups")
    .description("Manage groups in HQ vault")
    .option("--company <slug>", "Company slug (resolves to companyUid)");

  groups
    .command("create <groupId>")
    .description("Create a new group")
    .requiredOption("--name <name>", "Human-readable group name")
    .option("--description <desc>", "Optional description")
    .action(async (groupId: string, opts: { name: string; description?: string }) => {
      try {
        if (!GROUP_ID_PATTERN.test(groupId)) {
          console.error(chalk.red(`Invalid group id '${groupId}': must match grp_<alphanumeric>`));
          process.exit(1);
        }

        const token = await ensureCognitoToken();
        const companySlug = groups.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const body: Record<string, unknown> = { groupId, name: opts.name };
        if (opts.description) body.description = opts.description;

        const res = await vaultApiFetch({
          token,
          path: `/secrets/${encodeURIComponent(companyUid)}/groups`,
          method: "POST",
          body,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as Record<string, string>;
          if (res.status === 401) {
            console.error(chalk.red("Not authenticated — please run `hq login`"));
          } else if (res.status === 403) {
            console.error(chalk.red("Not authorized — owner or admin role required"));
          } else if (res.status === 409) {
            console.error(chalk.red(`Group already exists: ${groupId}`));
          } else if (res.status >= 500) {
            console.error(chalk.red(`Server error: ${err.error ?? res.statusText}`));
          } else {
            console.error(chalk.red(err.message ?? err.error ?? "Invalid request"));
          }
          process.exit(1);
        }

        console.log(chalk.green(`Group '${groupId}' (${opts.name}) created`));
      } catch (err) {
        console.error(chalk.red("Error:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  groups
    .command("delete <groupId>")
    .description("Delete a group")
    .action(async (groupId: string) => {
      try {
        if (!GROUP_ID_PATTERN.test(groupId)) {
          console.error(chalk.red(`Invalid group id '${groupId}': must match grp_<alphanumeric>`));
          process.exit(1);
        }

        const token = await ensureCognitoToken();
        const companySlug = groups.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: `/secrets/${encodeURIComponent(companyUid)}/groups`,
          method: "DELETE",
          query: { groupId },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as Record<string, string>;
          if (res.status === 401) {
            console.error(chalk.red("Not authenticated — please run `hq login`"));
          } else if (res.status === 403) {
            console.error(chalk.red("Not authorized — owner or admin role required"));
          } else if (res.status === 404) {
            console.error(chalk.red(`Group not found: ${groupId}`));
          } else if (res.status >= 500) {
            console.error(chalk.red(`Server error: ${err.error ?? res.statusText}`));
          } else {
            console.error(chalk.red(err.message ?? err.error ?? "Invalid request"));
          }
          process.exit(1);
        }

        console.log(chalk.green(`Group '${groupId}' deleted`));
      } catch (err) {
        console.error(chalk.red("Error:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  groups
    .command("add <groupId> <principal>")
    .description("Add a person to a group (principal: email or personUid)")
    .action(async (groupId: string, principal: string) => {
      try {
        if (!GROUP_ID_PATTERN.test(groupId)) {
          console.error(chalk.red(`Invalid group id '${groupId}': must match grp_<alphanumeric>`));
          process.exit(1);
        }

        const detected = detectPrincipalType(principal);
        if (!detected) {
          console.error(chalk.red(`Invalid principal '${principal}': must be an email address or a personUid matching prs_<alphanumeric>`));
          process.exit(1);
        }

        const token = await ensureCognitoToken();
        const companySlug = groups.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: `/secrets/${encodeURIComponent(companyUid)}/groups/members`,
          method: "POST",
          body: { groupId, granteeType: detected.granteeType, granteeId: detected.granteeId },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as Record<string, string>;
          if (res.status === 401) {
            console.error(chalk.red("Not authenticated — please run `hq login`"));
          } else if (res.status === 403) {
            console.error(chalk.red("Not authorized — owner/admin role or group creator required"));
          } else if (res.status === 404) {
            // Server provides a helpful message (email not found vs group not found)
            console.error(chalk.red(err.error ?? `Not found`));
          } else if (res.status >= 500) {
            console.error(chalk.red(`Server error: ${err.error ?? res.statusText}`));
          } else {
            console.error(chalk.red(err.message ?? err.error ?? "Invalid request"));
          }
          process.exit(1);
        }

        console.log(chalk.green(`Added ${principal} to group '${groupId}'`));
      } catch (err) {
        console.error(chalk.red("Error:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  groups
    .command("remove <groupId> <principal>")
    .description("Remove a person from a group (principal: email or personUid)")
    .action(async (groupId: string, principal: string) => {
      try {
        if (!GROUP_ID_PATTERN.test(groupId)) {
          console.error(chalk.red(`Invalid group id '${groupId}': must match grp_<alphanumeric>`));
          process.exit(1);
        }

        const detected = detectPrincipalType(principal);
        if (!detected) {
          console.error(chalk.red(`Invalid principal '${principal}': must be an email address or a personUid matching prs_<alphanumeric>`));
          process.exit(1);
        }

        const token = await ensureCognitoToken();
        const companySlug = groups.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: `/secrets/${encodeURIComponent(companyUid)}/groups/members`,
          method: "DELETE",
          query: {
            groupId,
            granteeType: detected.granteeType,
            granteeId: detected.granteeId,
          },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as Record<string, string>;
          if (res.status === 401) {
            console.error(chalk.red("Not authenticated — please run `hq login`"));
          } else if (res.status === 403) {
            console.error(chalk.red("Not authorized — owner/admin role or group creator required"));
          } else if (res.status === 404) {
            console.error(chalk.red(err.error ?? `Not found`));
          } else if (res.status >= 500) {
            console.error(chalk.red(`Server error: ${err.error ?? res.statusText}`));
          } else {
            console.error(chalk.red(err.message ?? err.error ?? "Invalid request"));
          }
          process.exit(1);
        }

        console.log(chalk.green(`Removed ${principal} from group '${groupId}'`));
      } catch (err) {
        console.error(chalk.red("Error:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  groups
    .command("list")
    .description("List all groups in the company")
    .action(async () => {
      try {
        const token = await ensureCognitoToken();
        const companySlug = groups.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: `/secrets/${encodeURIComponent(companyUid)}/groups`,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as Record<string, string>;
          if (res.status === 401) {
            console.error(chalk.red("Not authenticated — please run `hq login`"));
          } else if (res.status === 403) {
            console.error(chalk.red("Not authorized to list groups"));
          } else if (res.status >= 500) {
            console.error(chalk.red(`Server error: ${err.error ?? res.statusText}`));
          } else {
            console.error(chalk.red(err.message ?? err.error ?? "Invalid request"));
          }
          process.exit(1);
        }

        const data = await res.json() as {
          groups: Array<{ groupId: string; name: string; description?: string; createdAt: string }>;
        };

        if (data.groups.length === 0) {
          console.log(chalk.gray("No groups in this company yet."));
          return;
        }

        const idW = Math.max(8, ...data.groups.map((g) => g.groupId.length));
        const nameW = Math.max(4, ...data.groups.map((g) => g.name.length));
        const descW = Math.max(11, ...data.groups.map((g) => (g.description ?? "").length));
        console.log(chalk.bold([
          "GROUP_ID".padEnd(idW),
          "NAME".padEnd(nameW),
          "DESCRIPTION".padEnd(descW),
          "CREATED_AT",
        ].join("  ")));
        for (const g of data.groups) {
          console.log([
            g.groupId.padEnd(idW),
            g.name.padEnd(nameW),
            (g.description ?? "").padEnd(descW),
            shortDate(g.createdAt),
          ].join("  "));
        }
      } catch (err) {
        console.error(chalk.red("Error:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  groups
    .command("members <groupId>")
    .description("List members of a group")
    .action(async (groupId: string) => {
      try {
        if (!GROUP_ID_PATTERN.test(groupId)) {
          console.error(chalk.red(`Invalid group id '${groupId}': must match grp_<alphanumeric>`));
          process.exit(1);
        }

        const token = await ensureCognitoToken();
        const companySlug = groups.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const res = await vaultApiFetch({
          token,
          path: `/secrets/${encodeURIComponent(companyUid)}/groups/members`,
          query: { groupId },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as Record<string, string>;
          if (res.status === 401) {
            console.error(chalk.red("Not authenticated — please run `hq login`"));
          } else if (res.status === 403) {
            console.error(chalk.red("Not authorized to view group members"));
          } else if (res.status === 404) {
            console.error(chalk.red(`Group not found: ${groupId}`));
          } else if (res.status >= 500) {
            console.error(chalk.red(`Server error: ${err.error ?? res.statusText}`));
          } else {
            console.error(chalk.red(err.message ?? err.error ?? "Invalid request"));
          }
          process.exit(1);
        }

        const data = await res.json() as {
          members: Array<{ personUid: string; addedBy: string; addedAt: string }>;
        };

        console.log(`Members of '${groupId}':`);
        if (data.members.length === 0) {
          console.log(chalk.gray("No members yet — use 'hq groups add' to add."));
          return;
        }

        const uidW = Math.max(10, ...data.members.map((m) => m.personUid.length));
        const byW = Math.max(8, ...data.members.map((m) => m.addedBy.length));
        console.log(chalk.bold([
          "PERSON_UID".padEnd(uidW),
          "ADDED_BY".padEnd(byW),
          "ADDED_AT",
        ].join("  ")));
        for (const m of data.members) {
          console.log([
            m.personUid.padEnd(uidW),
            m.addedBy.padEnd(byW),
            shortDate(m.addedAt),
          ].join("  "));
        }
      } catch (err) {
        console.error(chalk.red("Error:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
