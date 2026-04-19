/**
 * Invite → Accept → Promote integration test (VLT-7 US-003).
 *
 * Mocks the vault-service HTTP API to test the full lifecycle round-trip:
 * admin creates invite → invitee accepts → admin promotes to guest with paths.
 *
 * Uses mocked fetch (not a real vault-service) to keep the test self-contained
 * and runnable offline. Real E2E tests against dev stage are in the e2eTests
 * section of the PRD.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invite } from "../src/cli/invite.js";
import { accept, parseToken } from "../src/cli/accept.js";
import { promote } from "../src/cli/promote.js";
import type { VaultServiceConfig } from "../src/types.js";
import type { Membership } from "../src/vault-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VAULT_CONFIG: VaultServiceConfig = {
  apiUrl: "https://vault.test.example.com",
  authToken: "admin-jwt",
};

const INVITEE_CONFIG: VaultServiceConfig = {
  apiUrl: "https://vault.test.example.com",
  authToken: "invitee-jwt",
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Token parsing
// ---------------------------------------------------------------------------

describe("parseToken", () => {
  it("extracts token from hq:// magic link", () => {
    expect(parseToken("hq://accept/tok_abc123")).toBe("tok_abc123");
  });

  it("extracts token from https:// URL", () => {
    expect(parseToken("https://hq.indigoai.com/accept/tok_xyz")).toBe("tok_xyz");
  });

  it("returns raw token unchanged", () => {
    expect(parseToken("tok_raw_token")).toBe("tok_raw_token");
  });

  it("trims whitespace", () => {
    expect(parseToken("  hq://accept/tok_abc  ")).toBe("tok_abc");
  });
});

// ---------------------------------------------------------------------------
// Full round-trip
// ---------------------------------------------------------------------------

describe("invite → accept → promote lifecycle", () => {
  const pendingMembership: Membership = {
    membershipKey: "psn_invitee#cmp_acme",
    personUid: "psn_invitee",
    companyUid: "cmp_acme",
    role: "member",
    status: "pending",
    inviteToken: "tok_secure_random_32bytes",
    invitedBy: "psn_admin",
    invitedAt: "2026-04-15T00:00:00Z",
    createdAt: "2026-04-15T00:00:00Z",
    updatedAt: "2026-04-15T00:00:00Z",
  };

  const activeMembership: Membership = {
    ...pendingMembership,
    status: "active",
    inviteToken: undefined,
    acceptedAt: "2026-04-15T00:01:00Z",
    updatedAt: "2026-04-15T00:01:00Z",
  };

  it("admin invites → invitee accepts → admin promotes to guest with paths", async () => {
    // --- Step 1: Admin creates invite ---
    fetchSpy
      // entity.findBySlug("company", "acme")
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_acme", slug: "acme", type: "company", status: "active" } }),
      )
      // createInvite
      .mockResolvedValueOnce(
        jsonResponse(200, {
          membership: pendingMembership,
          inviteToken: "tok_secure_random_32bytes",
        }),
      );

    const inviteResult = await invite({
      target: "alice@example.com",
      role: "member",
      company: "acme",
      vaultConfig: VAULT_CONFIG,
      callerUid: "psn_admin",
    });

    expect(inviteResult.magicLink).toBe("hq://accept/tok_secure_random_32bytes");
    expect(inviteResult.membership.status).toBe("pending");

    // --- Step 2: Invitee accepts ---
    fetchSpy
      // acceptInvite
      .mockResolvedValueOnce(
        jsonResponse(200, { membership: activeMembership }),
      )
      // entity.get for company slug resolution
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_acme", slug: "acme", type: "company", status: "active" } }),
      );

    const acceptResult = await accept({
      tokenOrLink: inviteResult.magicLink,
      callerUid: "psn_invitee",
      vaultConfig: INVITEE_CONFIG,
    });

    expect(acceptResult.membership.status).toBe("active");
    expect(acceptResult.membership.role).toBe("member");
    expect(acceptResult.companySlug).toBe("acme");

    // --- Step 3: Admin promotes member → guest with paths ---
    fetchSpy
      // entity.findBySlug for company resolution
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_acme", slug: "acme", type: "company", status: "active" } }),
      )
      // updateRole
      .mockResolvedValueOnce(
        jsonResponse(200, {
          membership: {
            ...activeMembership,
            role: "guest",
            allowedPrefixes: ["docs/"],
            updatedAt: "2026-04-15T00:02:00Z",
          },
        }),
      );

    const promoteResult = await promote({
      target: "psn_invitee",
      newRole: "guest",
      paths: "docs/",
      company: "acme",
      callerUid: "psn_admin",
      vaultConfig: VAULT_CONFIG,
    });

    expect(promoteResult.membership.role).toBe("guest");
    expect(promoteResult.membership.allowedPrefixes).toEqual(["docs/"]);
  });

  it("double-accept returns conflict error", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(409, { message: "Already accepted" }),
    );

    await expect(
      accept({
        tokenOrLink: "tok_already_accepted",
        callerUid: "psn_invitee",
        vaultConfig: INVITEE_CONFIG,
      }),
    ).rejects.toThrow("This invite was already accepted");
  });

  it("demoting last owner returns conflict error", async () => {
    fetchSpy
      // entity.findBySlug
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_acme", slug: "acme", type: "company", status: "active" } }),
      )
      // updateRole — 409 because last owner
      .mockResolvedValueOnce(
        jsonResponse(409, { message: "Cannot remove last owner" }),
      );

    await expect(
      promote({
        target: "psn_owner",
        newRole: "member",
        company: "acme",
        callerUid: "psn_owner",
        vaultConfig: VAULT_CONFIG,
      }),
    ).rejects.toThrow("Cannot leave company without an owner");
  });

  it("non-admin invite returns permission error", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_acme", slug: "acme", type: "company", status: "active" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(403, { message: "Forbidden" }),
      );

    await expect(
      invite({
        target: "bob@example.com",
        company: "acme",
        vaultConfig: VAULT_CONFIG,
        callerUid: "psn_member",
      }),
    ).rejects.toThrow("Permission denied — only admins and owners can invite members");
  });

  it("accept with wrong person returns permission error", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(403, { message: "Identity mismatch" }),
    );

    await expect(
      accept({
        tokenOrLink: "tok_for_someone_else",
        callerUid: "psn_wrong",
        vaultConfig: INVITEE_CONFIG,
      }),
    ).rejects.toThrow("This invite was for a different person");
  });
});
