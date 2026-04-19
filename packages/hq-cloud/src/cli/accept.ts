/**
 * `hq accept` command — accept a membership invite (VLT-7 US-003).
 *
 * Parses magic links (hq://accept/<token> or raw tokens), resolves the
 * caller's identity from Cognito, and calls VaultClient.acceptInvite().
 */

import type { VaultServiceConfig } from "../types.js";
import {
  VaultClient,
  VaultAuthError,
  VaultNotFoundError,
  VaultConflictError,
  VaultPermissionDeniedError,
} from "../vault-client.js";
import type { Membership } from "../vault-client.js";

export interface AcceptOptions {
  /** Raw token or magic link (hq://accept/<token>) */
  tokenOrLink: string;
  /** Caller's person UID (from Cognito) */
  callerUid: string;
  /** Vault service config */
  vaultConfig: VaultServiceConfig;
}

export interface AcceptResult {
  membership: Membership;
  companySlug?: string;
}

/**
 * Parse a magic link or raw token into the raw invite token.
 */
export function parseToken(tokenOrLink: string): string {
  const trimmed = tokenOrLink.trim();

  // hq://accept/<token>
  if (trimmed.startsWith("hq://accept/")) {
    return trimmed.slice("hq://accept/".length);
  }

  // https://hq.indigoai.com/accept/<token> (future web route)
  const httpsPrefix = "https://hq.indigoai.com/accept/";
  if (trimmed.startsWith(httpsPrefix)) {
    return trimmed.slice(httpsPrefix.length);
  }

  // Raw token
  return trimmed;
}

/**
 * Accept a membership invite.
 */
export async function accept(options: AcceptOptions): Promise<AcceptResult> {
  const { tokenOrLink, callerUid, vaultConfig } = options;
  const token = parseToken(tokenOrLink);

  if (!token) {
    throw new Error("No invite token provided. Usage: /accept <token-or-magic-link>");
  }

  const client = new VaultClient(vaultConfig);

  try {
    const result = await client.acceptInvite(token, callerUid);
    const membership = result.membership;

    // Try to resolve company slug for display
    let companySlug: string | undefined;
    if (membership.companyUid) {
      try {
        const entity = await client.entity.get(membership.companyUid);
        companySlug = entity.slug;
      } catch {
        // Non-critical — just display UID instead
      }
    }

    return { membership, companySlug };
  } catch (err) {
    if (err instanceof VaultAuthError) {
      throw new Error("Authentication failed — run `hq auth` to refresh your session");
    }
    if (err instanceof VaultConflictError) {
      throw new Error("This invite was already accepted");
    }
    if (err instanceof VaultNotFoundError) {
      throw new Error("Invite not found or expired");
    }
    if (err instanceof VaultPermissionDeniedError) {
      throw new Error("This invite was for a different person");
    }
    throw err;
  }
}
