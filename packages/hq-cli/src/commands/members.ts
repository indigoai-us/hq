import { Command } from "commander";
import chalk from "chalk";
import { ensureCognitoToken } from "../utils/cognito-session.js";
import { vaultApiFetch, getCompanyUid } from "../utils/vault-api.js";

const EMAIL_PATTERN = /^[^\s]+@[^\s]+$/;
const PERSON_UID_PATTERN = /^prs_[A-Za-z0-9_-]+$/;
export const VALID_ROLES = new Set(["owner", "admin", "member", "guest"]);

export type Role = "owner" | "admin" | "member" | "guest";

export interface PendingInvite {
  membershipKey: string;
  personUid?: string;
  inviteeEmail?: string;
  companyUid: string;
  role: string;
  status: string;
  inviteToken?: string;
  invitedBy: string;
  invitedAt: string;
}

interface MyMembership {
  membershipKey: string;
  personUid: string;
  companyUid: string;
  role: string;
  status: string;
}

export interface InviteOptions {
  target: string;
  role: string;
  paths?: string;
  companyUid: string;
  callerUid: string;
  token: string;
}

export interface InviteResult {
  inviteToken: string;
  magicLink: string;
  membership: { role: string; status: string };
}

export interface DetectedTarget {
  type: "email" | "person";
  value: string;
}

export function detectTarget(target: string): DetectedTarget | null {
  if (EMAIL_PATTERN.test(target)) {
    return { type: "email", value: target.trim().toLowerCase() };
  }
  if (PERSON_UID_PATTERN.test(target)) {
    return { type: "person", value: target };
  }
  return null;
}

export function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Resolve the caller's personUid by reading their own membership list.
 * The server infers the JWT identity, so this returns the canonical
 * personUid attached to the caller's active memberships.
 */
export async function getCallerPersonUid(token: string): Promise<string> {
  const res = await vaultApiFetch({ token, path: "/membership/me" });
  if (!res.ok) {
    throw new Error(
      "Failed to resolve caller identity — run `hq login` and try again",
    );
  }
  const data = (await res.json()) as { memberships: MyMembership[] };
  const personUid = data.memberships.find((m) => m.personUid)?.personUid;
  if (!personUid) {
    throw new Error(
      "Your account has no person entity yet. Run `hq onboard create-company` or accept an invite first.",
    );
  }
  return personUid;
}

/** Send a `/membership/invite` request and return the magic link. */
export async function inviteMember(
  options: InviteOptions,
): Promise<InviteResult> {
  if (!VALID_ROLES.has(options.role)) {
    throw new Error(
      `Invalid role '${options.role}': must be one of owner, admin, member, guest`,
    );
  }
  if (options.paths && options.role !== "guest") {
    throw new Error(
      "--paths is only valid with --role guest (allowedPrefixes are only meaningful for the guest role)",
    );
  }

  const detected = detectTarget(options.target);
  if (!detected) {
    throw new Error(
      `Invalid target '${options.target}': must be an email address or a personUid matching prs_<alphanumeric>`,
    );
  }

  const allowedPrefixes = options.paths
    ? options.paths.split(",").map((p) => p.trim()).filter(Boolean)
    : undefined;

  const body: Record<string, unknown> = {
    companyUid: options.companyUid,
    role: options.role,
    invitedBy: options.callerUid,
  };
  if (detected.type === "email") body.inviteeEmail = detected.value;
  else body.personUid = detected.value;
  if (allowedPrefixes) body.allowedPrefixes = allowedPrefixes;

  const res = await vaultApiFetch({
    token: options.token,
    path: "/membership/invite",
    method: "POST",
    body,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, string>;
    throw new InviteHttpError(
      res.status,
      err.message ?? err.error ?? res.statusText,
    );
  }

  const data = (await res.json()) as {
    membership: { role: string; status: string };
    inviteToken: string;
  };
  return {
    inviteToken: data.inviteToken,
    magicLink: `hq://accept/${data.inviteToken}`,
    membership: data.membership,
  };
}

export class InviteHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "InviteHttpError";
  }
}

export function formatInviteHttpError(status: number, fallback: string): string {
  if (status === 401) return "Not authenticated — please run `hq login`";
  if (status === 403) {
    return "Not authorized — only admins and owners can invite members";
  }
  if (status === 409) {
    return "This person already has a membership or pending invite for this company";
  }
  if (status >= 500) return `Server error: ${fallback}`;
  return fallback;
}

export async function listPendingInvites(
  token: string,
  companyUid: string,
): Promise<PendingInvite[]> {
  const res = await vaultApiFetch({
    token,
    path: `/membership/company/${encodeURIComponent(companyUid)}/pending`,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, string>;
    throw new InviteHttpError(
      res.status,
      err.message ?? err.error ?? res.statusText,
    );
  }
  const data = (await res.json()) as { invites: PendingInvite[] };
  return data.invites;
}

export async function revokeInvite(
  token: string,
  tokenOrKey: string,
  companyUid: string,
): Promise<void> {
  const res = await vaultApiFetch({
    token,
    path: "/membership/revoke",
    method: "POST",
    body: { membershipKey: tokenOrKey, companyUid },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, string>;
    throw new InviteHttpError(
      res.status,
      err.message ?? err.error ?? res.statusText,
    );
  }
}

export function registerMembersCommand(program: Command): void {
  const members = program
    .command("members")
    .description("Manage company memberships and invites")
    .option("--company <slug>", "Company slug (resolves to companyUid)");

  members
    .command("invite <target>")
    .description(
      "Invite a person to the company by email or personUid (prints a magic link)",
    )
    .option(
      "--role <role>",
      "Role for the invitee: owner, admin, member, or guest",
      "member",
    )
    .option(
      "--paths <prefixes>",
      "Comma-separated allowed prefixes (only valid with --role guest)",
    )
    .action(
      async (
        target: string,
        opts: { role: string; paths?: string },
      ) => {
        try {
          const token = await ensureCognitoToken();
          const companySlug = members.opts().company as string | undefined;
          const companyUid = await getCompanyUid(token, companySlug);
          const callerUid = await getCallerPersonUid(token);

          const result = await inviteMember({
            target,
            role: opts.role,
            paths: opts.paths,
            companyUid,
            callerUid,
            token,
          });

          console.log(
            chalk.green(
              `Invited ${target} as ${result.membership.role} (status: ${result.membership.status})`,
            ),
          );
          console.log();
          console.log(chalk.bold("Magic link:"));
          console.log(`  ${result.magicLink}`);
          console.log();
          console.log(
            chalk.dim(
              "Share this link with the invitee. They can run `hq onboard join --invite-token <token>` to accept.",
            ),
          );
        } catch (err) {
          if (err instanceof InviteHttpError) {
            console.error(chalk.red(formatInviteHttpError(err.status, err.message)));
            process.exit(1);
          }
          console.error(
            chalk.red("Error:"),
            err instanceof Error ? err.message : String(err),
          );
          process.exit(1);
        }
      },
    );

  members
    .command("list")
    .description("List pending invites for the company")
    .action(async () => {
      try {
        const token = await ensureCognitoToken();
        const companySlug = members.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        const invites = await listPendingInvites(token, companyUid);

        if (invites.length === 0) {
          console.log(chalk.gray("No pending invites for this company."));
          return;
        }

        const targetW = Math.max(
          6,
          ...invites.map((i) => (i.inviteeEmail ?? i.personUid ?? "").length),
        );
        const roleW = Math.max(4, ...invites.map((i) => i.role.length));
        const byW = Math.max(10, ...invites.map((i) => i.invitedBy.length));
        const keyW = Math.max(14, ...invites.map((i) => i.membershipKey.length));
        console.log(
          chalk.bold(
            [
              "TARGET".padEnd(targetW),
              "ROLE".padEnd(roleW),
              "INVITED_BY".padEnd(byW),
              "INVITED_AT",
              "MEMBERSHIP_KEY".padEnd(keyW),
            ].join("  "),
          ),
        );
        for (const inv of invites) {
          const target = inv.inviteeEmail ?? inv.personUid ?? "";
          console.log(
            [
              target.padEnd(targetW),
              inv.role.padEnd(roleW),
              inv.invitedBy.padEnd(byW),
              shortDate(inv.invitedAt),
              inv.membershipKey.padEnd(keyW),
            ].join("  "),
          );
        }
      } catch (err) {
        if (err instanceof InviteHttpError) {
          const msg =
            err.status === 403
              ? "Not authorized — only admins and owners can list invites"
              : formatInviteHttpError(err.status, err.message);
          console.error(chalk.red(msg));
          process.exit(1);
        }
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });

  members
    .command("revoke <tokenOrKey>")
    .description("Revoke a pending invite (accepts the inviteToken or membershipKey)")
    .action(async (tokenOrKey: string) => {
      try {
        const token = await ensureCognitoToken();
        const companySlug = members.opts().company as string | undefined;
        const companyUid = await getCompanyUid(token, companySlug);

        await revokeInvite(token, tokenOrKey, companyUid);
        console.log(chalk.green(`Revoked invite '${tokenOrKey}'`));
      } catch (err) {
        if (err instanceof InviteHttpError) {
          const msg =
            err.status === 403
              ? "Not authorized — only admins and owners can revoke invites"
              : err.status === 404
                ? "Invite not found — it may have already been accepted or revoked"
                : formatInviteHttpError(err.status, err.message);
          console.error(chalk.red(msg));
          process.exit(1);
        }
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });
}
