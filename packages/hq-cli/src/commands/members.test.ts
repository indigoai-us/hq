/**
 * Unit tests for `hq members invite|list|revoke` (members.ts).
 *
 * Coverage:
 *   - detectTarget — pure validation for email vs personUid vs invalid
 *   - getCallerPersonUid — happy path + missing-person-entity branch
 *   - inviteMember — email + personUid targets, --paths gating, HTTP errors
 *   - listPendingInvites — happy path + 403
 *   - revokeInvite — happy path + 404
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  InviteHttpError,
  detectTarget,
  formatInviteHttpError,
  getCallerPersonUid,
  inviteMember,
  listPendingInvites,
  revokeInvite,
} from "./members.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// detectTarget
// ---------------------------------------------------------------------------

describe("detectTarget", () => {
  it("recognizes plain emails and lowercases them", () => {
    expect(detectTarget("Alice@Example.com")).toEqual({
      type: "email",
      value: "alice@example.com",
    });
  });

  it("recognizes person UIDs", () => {
    expect(detectTarget("prs_bob123")).toEqual({
      type: "person",
      value: "prs_bob123",
    });
  });

  it("returns null for invalid targets", () => {
    expect(detectTarget("not-a-target")).toBeNull();
    expect(detectTarget("cmp_company")).toBeNull();
    expect(detectTarget("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCallerPersonUid
// ---------------------------------------------------------------------------

describe("getCallerPersonUid", () => {
  it("returns the personUid from the first membership", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        memberships: [
          { membershipKey: "k1", personUid: "prs_admin", companyUid: "cmp_a", role: "owner", status: "active" },
        ],
      }),
    );

    const uid = await getCallerPersonUid("test-token");
    expect(uid).toBe("prs_admin");
  });

  it("throws if the caller has no person entity yet", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { memberships: [] }));
    await expect(getCallerPersonUid("test-token")).rejects.toThrow(/no person entity/);
  });

  it("throws on auth failure", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));
    await expect(getCallerPersonUid("test-token")).rejects.toThrow(/run `hq login`/);
  });
});

// ---------------------------------------------------------------------------
// inviteMember
// ---------------------------------------------------------------------------

describe("inviteMember", () => {
  it("creates an invite for an email target and returns a magic link", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        membership: { role: "member", status: "pending" },
        inviteToken: "tok_abc",
      }),
    );

    const result = await inviteMember({
      target: "alice@example.com",
      role: "member",
      companyUid: "cmp_acme",
      callerUid: "prs_admin",
      token: "test-token",
    });

    expect(result.magicLink).toBe("hq://accept/tok_abc");
    expect(result.membership.role).toBe("member");

    const call = fetchSpy.mock.calls[0];
    const body = JSON.parse((call[1]?.body as string) ?? "{}");
    expect(body).toEqual({
      companyUid: "cmp_acme",
      role: "member",
      invitedBy: "prs_admin",
      inviteeEmail: "alice@example.com",
    });
  });

  it("creates an invite for a personUid target", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        membership: { role: "admin", status: "pending" },
        inviteToken: "tok_456",
      }),
    );

    await inviteMember({
      target: "prs_bob",
      role: "admin",
      companyUid: "cmp_acme",
      callerUid: "prs_admin",
      token: "test-token",
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1]?.body as string) ?? "{}");
    expect(body.personUid).toBe("prs_bob");
    expect(body.inviteeEmail).toBeUndefined();
  });

  it("forwards allowedPrefixes when --paths is set with --role guest", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        membership: { role: "guest", status: "pending" },
        inviteToken: "tok_guest",
      }),
    );

    await inviteMember({
      target: "alice@example.com",
      role: "guest",
      paths: "docs/, shared/",
      companyUid: "cmp_acme",
      callerUid: "prs_admin",
      token: "test-token",
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1]?.body as string) ?? "{}");
    expect(body.allowedPrefixes).toEqual(["docs/", "shared/"]);
  });

  it("rejects --paths with a non-guest role", async () => {
    await expect(
      inviteMember({
        target: "alice@example.com",
        role: "member",
        paths: "docs/",
        companyUid: "cmp_acme",
        callerUid: "prs_admin",
        token: "test-token",
      }),
    ).rejects.toThrow(/--paths is only valid with --role guest/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an invalid target", async () => {
    await expect(
      inviteMember({
        target: "not-a-target",
        role: "member",
        companyUid: "cmp_acme",
        callerUid: "prs_admin",
        token: "test-token",
      }),
    ).rejects.toThrow(/Invalid target/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an unknown role", async () => {
    await expect(
      inviteMember({
        target: "alice@example.com",
        role: "superuser",
        companyUid: "cmp_acme",
        callerUid: "prs_admin",
        token: "test-token",
      }),
    ).rejects.toThrow(/Invalid role/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("wraps non-2xx responses in InviteHttpError", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(409, { error: "duplicate" }));

    await expect(
      inviteMember({
        target: "alice@example.com",
        role: "member",
        companyUid: "cmp_acme",
        callerUid: "prs_admin",
        token: "test-token",
      }),
    ).rejects.toBeInstanceOf(InviteHttpError);
  });
});

// ---------------------------------------------------------------------------
// listPendingInvites
// ---------------------------------------------------------------------------

describe("listPendingInvites", () => {
  it("returns the parsed invites array", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        invites: [
          {
            membershipKey: "k1",
            inviteeEmail: "alice@example.com",
            companyUid: "cmp_acme",
            role: "member",
            status: "pending",
            invitedBy: "prs_admin",
            invitedAt: "2026-05-04T12:00:00Z",
          },
        ],
      }),
    );

    const invites = await listPendingInvites("test-token", "cmp_acme");
    expect(invites).toHaveLength(1);
    expect(invites[0].inviteeEmail).toBe("alice@example.com");
  });

  it("throws InviteHttpError on 403", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(403, { error: "forbidden" }));
    await expect(listPendingInvites("test-token", "cmp_acme")).rejects.toBeInstanceOf(
      InviteHttpError,
    );
  });
});

// ---------------------------------------------------------------------------
// revokeInvite
// ---------------------------------------------------------------------------

describe("revokeInvite", () => {
  it("posts membershipKey + companyUid", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {}));

    await revokeInvite("test-token", "k1", "cmp_acme");

    const body = JSON.parse((fetchSpy.mock.calls[0][1]?.body as string) ?? "{}");
    expect(body).toEqual({ membershipKey: "k1", companyUid: "cmp_acme" });
  });

  it("throws InviteHttpError on 404", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(404, { error: "not found" }));
    await expect(revokeInvite("test-token", "k1", "cmp_acme")).rejects.toBeInstanceOf(
      InviteHttpError,
    );
  });
});

// ---------------------------------------------------------------------------
// formatInviteHttpError
// ---------------------------------------------------------------------------

describe("formatInviteHttpError", () => {
  it("maps 401 to a login hint", () => {
    expect(formatInviteHttpError(401, "ignored")).toMatch(/run `hq login`/);
  });
  it("maps 403 to admin/owner hint", () => {
    expect(formatInviteHttpError(403, "ignored")).toMatch(/admins and owners/);
  });
  it("maps 409 to duplicate-invite hint", () => {
    expect(formatInviteHttpError(409, "ignored")).toMatch(/already has a membership/);
  });
  it("prefixes 5xx with 'Server error:'", () => {
    expect(formatInviteHttpError(500, "boom")).toBe("Server error: boom");
  });
  it("falls through to the message for unmapped statuses", () => {
    expect(formatInviteHttpError(400, "bad input")).toBe("bad input");
  });
});
