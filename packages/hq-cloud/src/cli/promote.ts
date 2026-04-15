/**
 * `hq promote` command — change an existing member's role (VLT-7 US-003).
 *
 * Admin+ only. Surfaces last-owner demotion errors as human messages.
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

export interface PromoteOptions {
  /** Person slug or UID of the member to promote */
  target: string;
  /** New role to assign */
  newRole: MembershipRole;
  /** Allowed prefixes (only valid with guest role) */
  paths?: string;
  /** Company slug or UID */
  company?: string;
  /** Caller's person UID */
  callerUid: string;
  /** Vault service config */
  vaultConfig: VaultServiceConfig;
}

export interface PromoteResult {
  membership: Membership;
  previousRole?: MembershipRole;
}

/**
 * Change a member's role.
 */
export async function promote(options: PromoteOptions): Promise<PromoteResult> {
  const { target, newRole, paths, company, callerUid, vaultConfig } = options;

  // Validate: --paths only with guest role
  if (paths && newRole !== "guest") {
    throw new Error("--paths is only valid with --role guest (allowedPrefixes are only meaningful for the guest role)");
  }

  const client = new VaultClient(vaultConfig);

  // Resolve company UID
  const companyUid = await resolveCompanyUid(client, company);

  // Build membership key from target + company
  const membershipKey = buildMembershipKey(target, companyUid);

  const allowedPrefixes = paths
    ? paths.split(",").map((p) => p.trim()).filter(Boolean)
    : undefined;

  try {
    const membership = await client.updateRole({
      membershipKey,
      newRole,
      allowedPrefixes,
      updaterUid: callerUid,
    });

    return { membership };
  } catch (err) {
    if (err instanceof VaultAuthError) {
      throw new Error("Authentication failed — run `hq auth` to refresh your session");
    }
    if (err instanceof VaultPermissionDeniedError) {
      throw new Error("Permission denied — only admins and owners can change member roles");
    }
    if (err instanceof VaultNotFoundError) {
      throw new Error(`Member "${target}" not found in this company`);
    }
    if (err instanceof VaultConflictError) {
      throw new Error("Cannot leave company without an owner — promote another member to owner first");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMembershipKey(personRef: string, companyUid: string): string {
  // If already a composite key, use as-is
  if (personRef.includes("#")) {
    return personRef;
  }
  // Build composite key: personUid#companyUid
  return `${personRef}#${companyUid}`;
}

async function resolveCompanyUid(
  client: VaultClient,
  companyRef?: string,
): Promise<string> {
  if (!companyRef) {
    throw new Error(
      "No company specified. Use --company <slug> or set up .hq/config.json",
    );
  }

  if (companyRef.startsWith("cmp_")) {
    return companyRef;
  }

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
