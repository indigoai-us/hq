/**
 * `hq invite` command — create pending membership + magic link (VLT-7 US-002).
 *
 * Thin UX layer over VaultClient.createInvite(). Handles arg parsing,
 * validation (paths only with guest role), and formats the magic link output.
 */

import type { VaultServiceConfig } from "../types.js";
import {
  VaultClient,
  VaultAuthError,
  VaultPermissionDeniedError,
  VaultNotFoundError,
  VaultConflictError,
} from "../vault-client.js";
import type { MembershipRole, Membership } from "../vault-client.js";

export interface InviteOptions {
  /** Target — email address or person slug/uid */
  target: string;
  /** Role for the invitee (default: member) */
  role?: MembershipRole;
  /** Comma-separated allowed prefixes (only valid with role=guest) */
  paths?: string;
  /** Company slug or UID (defaults to active company) */
  company?: string;
  /** Vault service config */
  vaultConfig: VaultServiceConfig;
  /** Caller's person UID */
  callerUid: string;
}

export interface InviteResult {
  inviteToken: string;
  magicLink: string;
  membership: Membership;
}

export interface InviteListOptions {
  company?: string;
  vaultConfig: VaultServiceConfig;
  callerUid: string;
}

export interface InviteRevokeOptions {
  tokenOrKey: string;
  vaultConfig: VaultServiceConfig;
}

/**
 * Create a pending membership invite and return a magic link.
 */
export async function invite(options: InviteOptions): Promise<InviteResult> {
  const { target, role = "member", paths, company, vaultConfig, callerUid } = options;

  // Validate: --paths only with --role guest
  if (paths && role !== "guest") {
    throw new Error("--paths is only valid with --role guest (allowedPrefixes are only meaningful for the guest role)");
  }

  const client = new VaultClient(vaultConfig);

  // Resolve company UID
  const companyUid = await resolveCompanyUid(client, company);

  // Parse paths
  const allowedPrefixes = paths
    ? paths.split(",").map((p) => p.trim()).filter(Boolean)
    : undefined;

  // Determine if target is email or person identifier
  const isEmail = target.includes("@");

  try {
    const result = await client.createInvite({
      ...(isEmail ? { inviteeEmail: target } : { personUid: target }),
      companyUid,
      role,
      allowedPrefixes,
      invitedBy: callerUid,
    });

    const magicLink = `hq://accept/${result.inviteToken}`;

    return {
      inviteToken: result.inviteToken,
      magicLink,
      membership: result.membership,
    };
  } catch (err) {
    if (err instanceof VaultAuthError) {
      throw new Error("Authentication failed — run `hq auth` to refresh your session");
    }
    if (err instanceof VaultPermissionDeniedError) {
      throw new Error("Permission denied — only admins and owners can invite members");
    }
    if (err instanceof VaultConflictError) {
      throw new Error("This person already has a membership or pending invite for this company");
    }
    throw err;
  }
}

/**
 * List pending invites for a company.
 */
export async function listInvites(options: InviteListOptions): Promise<Membership[]> {
  const { company, vaultConfig } = options;
  const client = new VaultClient(vaultConfig);
  const companyUid = await resolveCompanyUid(client, company);

  try {
    return await client.listPendingInvites(companyUid);
  } catch (err) {
    if (err instanceof VaultAuthError) {
      throw new Error("Authentication failed — run `hq auth` to refresh your session");
    }
    if (err instanceof VaultPermissionDeniedError) {
      throw new Error("Permission denied — only admins and owners can list invites");
    }
    throw err;
  }
}

/**
 * Revoke a pending invite.
 */
export async function revokeInvite(options: InviteRevokeOptions): Promise<void> {
  const { tokenOrKey, vaultConfig } = options;
  const client = new VaultClient(vaultConfig);

  try {
    await client.revokeMembership(tokenOrKey);
  } catch (err) {
    if (err instanceof VaultAuthError) {
      throw new Error("Authentication failed — run `hq auth` to refresh your session");
    }
    if (err instanceof VaultPermissionDeniedError) {
      throw new Error("Permission denied — only admins and owners can revoke invites");
    }
    if (err instanceof VaultNotFoundError) {
      throw new Error("Invite not found — it may have already been accepted or revoked");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveCompanyUid(
  client: VaultClient,
  companyRef?: string,
): Promise<string> {
  if (!companyRef) {
    throw new Error(
      "No company specified. Use --company <slug> or set up .hq/config.json",
    );
  }

  // If already a UID, return it
  if (companyRef.startsWith("cmp_")) {
    return companyRef;
  }

  // Resolve slug → UID via entity registry
  try {
    const entity = await client.entity.findBySlug("company", companyRef);
    return entity.uid;
  } catch (err) {
    if (err instanceof VaultNotFoundError) {
      throw new Error(`Company "${companyRef}" not found in the vault registry`);
    }
    throw err;
  }
}
