/**
 * VaultClient unit tests (VLT-7 US-001).
 *
 * Uses mocked fetch to assert retry behavior, error mapping, and auth header injection.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import {
  VaultClient,
  VaultAuthError,
  VaultPermissionDeniedError,
  VaultNotFoundError,
  VaultConflictError,
  VaultClientError,
} from "./vault-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

const TEST_CONFIG = {
  apiUrl: "https://vault.test.example.com",
  authToken: "test-jwt-token-123",
};

let client: VaultClient;
let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  client = new VaultClient(TEST_CONFIG);
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Auth header injection
// ---------------------------------------------------------------------------

describe("auth header injection", () => {
  it("sends Bearer token on every request", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { members: [] }),
    );

    await client.listMembersOfCompany("cmp_abc");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-jwt-token-123");
  });

  it("sets Content-Type on POST requests", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { membership: {}, inviteToken: "tok" }),
    );

    await client.createInvite({
      companyUid: "cmp_abc",
      role: "member",
      invitedBy: "psn_xyz",
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe("error mapping", () => {
  it("maps 401 to VaultAuthError", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(401, { message: "Token expired" }),
    );

    await expect(client.listMembersOfCompany("cmp_abc")).rejects.toThrow(VaultAuthError);
  });

  it("maps 403 to VaultPermissionDeniedError", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(403, { message: "Admin required" }),
    );

    await expect(client.listMembersOfCompany("cmp_abc")).rejects.toThrow(VaultPermissionDeniedError);
  });

  it("maps 404 to VaultNotFoundError", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(404, { message: "Not found" }),
    );

    await expect(client.entity.get("cmp_missing")).rejects.toThrow(VaultNotFoundError);
  });

  it("maps 409 to VaultConflictError", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(409, { message: "Already accepted" }),
    );

    await expect(client.acceptInvite("tok", "psn_abc")).rejects.toThrow(VaultConflictError);
  });

  it("preserves error message from response body", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(403, { message: "Only admins can invite" }),
    );

    try {
      await client.createInvite({
        companyUid: "cmp_abc",
        role: "member",
        invitedBy: "psn_xyz",
      });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VaultPermissionDeniedError);
      expect((err as VaultPermissionDeniedError).message).toBe("Only admins can invite");
    }
  });

  it("handles non-JSON error bodies gracefully", async () => {
    fetchSpy.mockResolvedValueOnce(
      textResponse(404, "Not Found"),
    );

    try {
      await client.entity.findBySlug("company", "test");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VaultNotFoundError);
      expect((err as VaultNotFoundError).message).toBe("Not Found");
    }
  });
});

// ---------------------------------------------------------------------------
// Retry behavior
// ---------------------------------------------------------------------------

describe("retry behavior", () => {
  it("retries on 429 and succeeds on second attempt", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(429, { message: "Rate limited" }))
      .mockResolvedValueOnce(jsonResponse(200, { members: [{ personUid: "psn_1" }] }));

    const result = await client.listMembersOfCompany("cmp_abc");
    expect(result).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries on 500 and succeeds on third attempt", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(500, { message: "Internal error" }))
      .mockResolvedValueOnce(jsonResponse(502, { message: "Bad gateway" }))
      .mockResolvedValueOnce(jsonResponse(200, { membership: { role: "admin" } }));

    const result = await client.updateRole({
      membershipKey: "psn_1#cmp_abc",
      newRole: "admin",
      updaterUid: "psn_owner",
      companyUid: "cmp_abc",
    });
    expect(result.role).toBe("admin");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all retries on persistent 500", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(jsonResponse(500, { message: "Down" })),
    );

    await expect(client.listMembersOfCompany("cmp_abc")).rejects.toThrow(VaultClientError);
    // 1 initial + 3 retries = 4
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it("does not retry on 401 (non-transient)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(401, { message: "Expired" }));

    await expect(client.listMembersOfCompany("cmp_abc")).rejects.toThrow(VaultAuthError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 403 (non-transient)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(403, { message: "Forbidden" }));

    await expect(client.createInvite({
      companyUid: "cmp_abc",
      role: "member",
      invitedBy: "psn_xyz",
    })).rejects.toThrow(VaultPermissionDeniedError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on network errors (fetch throws)", async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse(200, { members: [] }));

    const result = await client.listMembersOfCompany("cmp_abc");
    expect(result).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

describe("API surface", () => {
  it("createInvite sends correct body and URL", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        membership: { membershipKey: "psn_1#cmp_abc", role: "member", status: "pending" },
        inviteToken: "tok_secure_random",
      }),
    );

    const result = await client.createInvite({
      companyUid: "cmp_abc",
      role: "member",
      invitedBy: "psn_owner",
      inviteeEmail: "alice@example.com",
    });

    expect(result.inviteToken).toBe("tok_secure_random");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vault.test.example.com/membership/invite");
    expect(JSON.parse(init.body as string)).toEqual({
      companyUid: "cmp_abc",
      role: "member",
      invitedBy: "psn_owner",
      inviteeEmail: "alice@example.com",
    });
  });

  it("acceptInvite sends token and personUid", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        membership: { status: "active", role: "member" },
      }),
    );

    const result = await client.acceptInvite("tok_abc", "psn_invitee");
    expect(result.membership.status).toBe("active");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vault.test.example.com/membership/accept");
    expect(JSON.parse(init.body as string)).toEqual({
      token: "tok_abc",
      personUid: "psn_invitee",
    });
  });

  it("updateRole sends correct payload", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        membership: { role: "guest", allowedPrefixes: ["docs/"] },
      }),
    );

    const result = await client.updateRole({
      membershipKey: "psn_1#cmp_abc",
      newRole: "guest",
      allowedPrefixes: ["docs/"],
      updaterUid: "psn_admin",
      companyUid: "cmp_abc",
    });

    expect(result.role).toBe("guest");
    expect(result.allowedPrefixes).toEqual(["docs/"]);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vault.test.example.com/membership/role");
    expect(JSON.parse(init.body as string)).toEqual({
      membershipKey: "psn_1#cmp_abc",
      newRole: "guest",
      allowedPrefixes: ["docs/"],
      updaterUid: "psn_admin",
      companyUid: "cmp_abc",
    });
  });

  it("entity.get calls correct URL", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        entity: { uid: "cmp_abc", slug: "acme", type: "company", status: "active" },
      }),
    );

    const entity = await client.entity.get("cmp_abc");
    expect(entity.slug).toBe("acme");

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe("https://vault.test.example.com/entity/cmp_abc");
  });

  it("entity.findBySlug calls correct URL", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        entity: { uid: "cmp_abc", slug: "acme", type: "company", status: "active" },
      }),
    );

    const entity = await client.entity.findBySlug("company", "acme");
    expect(entity.uid).toBe("cmp_abc");

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe("https://vault.test.example.com/entity/by-slug/company/acme");
  });

  it("revokeMembership calls POST /membership/revoke with companyUid", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.revokeMembership("psn_1#cmp_abc", "cmp_abc");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vault.test.example.com/membership/revoke");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      membershipKey: "psn_1#cmp_abc",
      companyUid: "cmp_abc",
    });
  });

  it("listPendingInvites calls correct URL", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { invites: [{ status: "pending" }] }),
    );

    const invites = await client.listPendingInvites("cmp_abc");
    expect(invites).toHaveLength(1);

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe("https://vault.test.example.com/membership/company/cmp_abc/pending");
  });

  it("listMyMemberships hits GET /membership/me and unwraps memberships[]", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        memberships: [
          { membershipKey: "psn_1#cmp_a", role: "owner", status: "active" },
          { membershipKey: "psn_1#cmp_b", role: "member", status: "active" },
        ],
      }),
    );

    const memberships = await client.listMyMemberships();
    expect(memberships).toHaveLength(2);
    expect(memberships[0].membershipKey).toBe("psn_1#cmp_a");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vault.test.example.com/membership/me");
    expect(init.method).toBe("GET");
    // No body on GET.
    expect(init.body).toBeUndefined();
  });

  it("listMyMemberships returns [] for callers with no person entity (bootstrap case)", async () => {
    // Server returns 200 + { memberships: [] } rather than 404 when the
    // caller is signed in but hasn't been provisioned yet. The SDK must
    // surface an empty array, NOT throw — hq-sync-runner relies on this
    // to emit `setup-needed` without catching HTTP errors.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { memberships: [] }),
    );

    const memberships = await client.listMyMemberships();
    expect(memberships).toEqual([]);
  });

  it("listMyPendingInvitesByEmail hits GET /membership/pending-by-email", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        invites: [
          {
            membershipKey: "email:stefan@getindigo.ai#cmp_abc",
            companyUid: "cmp_abc",
            role: "owner",
            invitedBy: "sub-admin",
            invitedAt: "2026-04-20T00:00:00Z",
          },
        ],
      }),
    );

    const invites = await client.listMyPendingInvitesByEmail();
    expect(invites).toHaveLength(1);
    expect(invites[0].companyUid).toBe("cmp_abc");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://vault.test.example.com/membership/pending-by-email",
    );
    expect(init.method).toBe("GET");
  });

  it("listMyPendingInvitesByEmail returns [] when server omits the key", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {}));
    const invites = await client.listMyPendingInvitesByEmail();
    expect(invites).toEqual([]);
  });

  it("claimPendingInvitesByEmail POSTs personUid to /membership/claim-by-email", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {}));

    await client.claimPendingInvitesByEmail("ent_person_stefan");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://vault.test.example.com/membership/claim-by-email",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      personUid: "ent_person_stefan",
    });
  });
});

describe("VaultClient identity bootstrap", () => {
  let client: VaultClient;
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue(jsonResponse(200, {}));
    client = new VaultClient({
      apiUrl: "https://vault.test.example.com",
      authToken: "test-token",
      region: "us-east-1",
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("entity.listByType GETs /entity/by-type/{type}", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        entities: [
          {
            uid: "ent_person_stefan",
            slug: "stefan-johnson",
            type: "person",
            status: "active",
          },
        ],
      }),
    );

    const entities = await client.entity.listByType("person");
    expect(entities).toHaveLength(1);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe(
      "https://vault.test.example.com/entity/by-type/person",
    );
  });

  it("entity.listByType returns [] when server omits the key", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {}));
    const entities = await client.entity.listByType("person");
    expect(entities).toEqual([]);
  });

  it("ensureMyPersonEntity short-circuits when a person entity already exists", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        entities: [
          {
            uid: "ent_person_existing",
            slug: "already-there",
            type: "person",
            status: "active",
          },
        ],
      }),
    );

    const person = await client.ensureMyPersonEntity({
      ownerSub: "sub-abc",
      displayName: "Stefan Johnson",
    });

    expect(person.uid).toBe("ent_person_existing");
    // Only one HTTP call — list. No POST /entity.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("ensureMyPersonEntity POSTs /entity with a slug derived from displayName when none exist", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(200, { entities: [] }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          entity: {
            uid: "ent_person_new",
            slug: "stefan-johnson",
            type: "person",
            status: "active",
          },
        }),
      );

    const person = await client.ensureMyPersonEntity({
      ownerSub: "sub-abc",
      displayName: "Stefan Johnson",
    });

    expect(person.uid).toBe("ent_person_new");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, init] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://vault.test.example.com/entity");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      type: "person",
      name: "Stefan Johnson",
      slug: "stefan-johnson",
    });
  });

  it("ensureMyPersonEntity falls back to user-<sub-suffix> when displayName slugifies to empty", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(200, { entities: [] }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          entity: {
            uid: "ent_person_new",
            slug: "user-12345678",
            type: "person",
            status: "active",
          },
        }),
      );

    await client.ensureMyPersonEntity({
      ownerSub: "sub-abcdef12345678",
      displayName: "!!!",
    });

    const [, init] = fetchSpy.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.slug).toBe("user-12345678");
  });

  it("listByType_roundtrips_createdAt", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        entities: [
          {
            uid: "prs_x",
            slug: "alice",
            type: "person",
            status: "active",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );

    const entities = await client.entity.listByType("person");
    expect(entities).toHaveLength(1);
    expect(entities[0].createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("ensureMyPersonEntity_picks_oldest_when_multiple", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        entities: [
          { uid: "prs_b", slug: "b", type: "person", status: "active", createdAt: "2026-03-01T00:00:00Z" },
          { uid: "prs_a", slug: "a", type: "person", status: "active", createdAt: "2026-01-01T00:00:00Z" },
          { uid: "prs_c", slug: "c", type: "person", status: "active", createdAt: "2026-06-01T00:00:00Z" },
        ],
      }),
    );

    const person = await client.ensureMyPersonEntity({
      ownerSub: "sub-multi",
      displayName: "Multi User",
    });

    expect(person.uid).toBe("prs_a");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("ensureMyPersonEntity_handles_missing_createdAt_deterministically", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        entities: [
          { uid: "prs_z", slug: "z", type: "person", status: "active" },
          { uid: "prs_a", slug: "a", type: "person", status: "active" },
        ],
      }),
    );

    const person = await client.ensureMyPersonEntity({
      ownerSub: "sub-nodates",
      displayName: "No Dates User",
    });

    // Both missing createdAt → "" tie, uid tiebreak selects prs_a
    expect(person.uid).toBe("prs_a");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("vendSelf_roundtrip", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        credentials: {
          accessKeyId: "AKIAIOSFODNN7EXAMPLE",
          secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          sessionToken: "FwoGZXIvYXdzEBY...",
        },
        expiresAt: "2026-01-01T01:00:00.000Z",
      }),
    );

    const result = await client.sts.vendSelf({ personUid: "prs_x" });

    expect(result.credentials.accessKeyId).toBe("AKIAIOSFODNN7EXAMPLE");
    expect(result.credentials.secretAccessKey).toBe("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    expect(result.credentials.sessionToken).toBe("FwoGZXIvYXdzEBY...");
    expect(typeof result.expiresAt).toBe("string");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vault.test.example.com/sts/vend-self");
    expect((init.method as string).toUpperCase()).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ personUid: "prs_x" });
  });
});
