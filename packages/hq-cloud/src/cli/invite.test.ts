/**
 * invite CLI command tests (VLT-7 US-002).
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { invite, listInvites, revokeInvite } from "./invite.js";
import type { VaultServiceConfig } from "../types.js";

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
  authToken: "test-token",
};

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// invite()
// ---------------------------------------------------------------------------

describe("invite", () => {
  it("creates invite for email target and returns magic link", async () => {
    // First call: entity.findBySlug to resolve company
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_abc", slug: "acme", type: "company", status: "active" } }),
      )
      // Second call: createInvite
      .mockResolvedValueOnce(
        jsonResponse(200, {
          membership: { membershipKey: "psn_1#cmp_abc", role: "member", status: "pending" },
          inviteToken: "tok_secure123",
        }),
      );

    const result = await invite({
      target: "alice@example.com",
      role: "member",
      company: "acme",
      vaultConfig: VAULT_CONFIG,
      callerUid: "psn_admin",
    });

    expect(result.magicLink).toBe("hq://accept/tok_secure123");
    expect(result.inviteToken).toBe("tok_secure123");
    expect(result.membership.status).toBe("pending");
  });

  it("creates invite for person UID target", async () => {
    // Company is already a UID — no entity lookup needed
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        membership: { membershipKey: "psn_bob#cmp_abc", role: "admin", status: "pending" },
        inviteToken: "tok_456",
      }),
    );

    const result = await invite({
      target: "psn_bob",
      role: "admin",
      company: "cmp_abc",
      vaultConfig: VAULT_CONFIG,
      callerUid: "psn_admin",
    });

    expect(result.magicLink).toBe("hq://accept/tok_456");

    // Should have called createInvite with personUid, not inviteeEmail
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.personUid).toBe("psn_bob");
    expect(body.inviteeEmail).toBeUndefined();
  });

  it("rejects --paths without --role guest", async () => {
    await expect(
      invite({
        target: "alice@example.com",
        role: "member",
        paths: "docs/",
        company: "acme",
        vaultConfig: VAULT_CONFIG,
        callerUid: "psn_admin",
      }),
    ).rejects.toThrow("--paths is only valid with --role guest");
  });

  it("allows --paths with --role guest", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_abc", slug: "acme", type: "company", status: "active" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          membership: { membershipKey: "psn_1#cmp_abc", role: "guest", status: "pending", allowedPrefixes: ["docs/", "shared/"] },
          inviteToken: "tok_guest",
        }),
      );

    const result = await invite({
      target: "alice@example.com",
      role: "guest",
      paths: "docs/, shared/",
      company: "acme",
      vaultConfig: VAULT_CONFIG,
      callerUid: "psn_admin",
    });

    expect(result.membership.allowedPrefixes).toEqual(["docs/", "shared/"]);

    // Verify allowedPrefixes sent to API
    const body = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
    expect(body.allowedPrefixes).toEqual(["docs/", "shared/"]);
  });

  it("maps VaultPermissionDeniedError to human-readable message", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_abc", slug: "acme", type: "company", status: "active" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(403, { message: "Admin required" }),
      );

    await expect(
      invite({
        target: "alice@example.com",
        company: "acme",
        vaultConfig: VAULT_CONFIG,
        callerUid: "psn_member",
      }),
    ).rejects.toThrow("Permission denied — only admins and owners can invite members");
  });

  it("throws when no company specified", async () => {
    await expect(
      invite({
        target: "alice@example.com",
        vaultConfig: VAULT_CONFIG,
        callerUid: "psn_admin",
      }),
    ).rejects.toThrow("No company specified");
  });

  it("maps VaultConflictError to human-readable message", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_abc", slug: "acme", type: "company", status: "active" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(409, { message: "Already exists" }),
      );

    await expect(
      invite({
        target: "alice@example.com",
        company: "acme",
        vaultConfig: VAULT_CONFIG,
        callerUid: "psn_admin",
      }),
    ).rejects.toThrow("already has a membership or pending invite");
  });
});

// ---------------------------------------------------------------------------
// listInvites()
// ---------------------------------------------------------------------------

describe("listInvites", () => {
  it("returns pending invites for a company", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_abc", slug: "acme", type: "company", status: "active" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          invites: [
            { membershipKey: "psn_1#cmp_abc", status: "pending", role: "member" },
            { membershipKey: "psn_2#cmp_abc", status: "pending", role: "guest" },
          ],
        }),
      );

    const invites = await listInvites({
      company: "acme",
      vaultConfig: VAULT_CONFIG,
      callerUid: "psn_admin",
    });

    expect(invites).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// revokeInvite()
// ---------------------------------------------------------------------------

describe("revokeInvite", () => {
  it("revokes a pending invite", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_abc", slug: "acme", type: "company", status: "active" } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      revokeInvite({
        tokenOrKey: "psn_1#cmp_abc",
        company: "acme",
        vaultConfig: VAULT_CONFIG,
      }),
    ).resolves.toBeUndefined();
  });

  it("maps 404 to human-readable message", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, { entity: { uid: "cmp_abc", slug: "acme", type: "company", status: "active" } }),
      )
      .mockResolvedValueOnce(jsonResponse(404, { message: "Not found" }));

    await expect(
      revokeInvite({
        tokenOrKey: "psn_1#cmp_abc",
        company: "acme",
        vaultConfig: VAULT_CONFIG,
      }),
    ).rejects.toThrow("Invite not found");
  });
});
