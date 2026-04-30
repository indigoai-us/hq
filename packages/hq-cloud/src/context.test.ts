/**
 * Unit tests for context.ts — entity context resolution (VLT-5 US-001).
 *
 * Uses a mock fetch to simulate vault-service API responses.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resolveEntityContext,
  refreshEntityContext,
  clearContextCache,
  isExpiringSoon,
} from "./context.js";
import type { VaultServiceConfig } from "./types.js";

const mockConfig: VaultServiceConfig = {
  apiUrl: "https://vault-api.test",
  authToken: "test-jwt-token",
  region: "us-east-1",
};

const mockEntity = {
  uid: "cmp_01ABCDEF",
  slug: "acme",
  bucketName: "hq-vault-acme-123",
  status: "active",
};

const mockVendResponse = {
  credentials: {
    accessKeyId: "ASIA_TEST_KEY",
    secretAccessKey: "test-secret",
    sessionToken: "test-session-token",
    expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  },
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
};

function setupFetchMock(overrides?: {
  entityStatus?: number;
  entityBody?: unknown;
  vendStatus?: number;
  vendBody?: unknown;
}) {
  const fetchMock = vi.fn();

  fetchMock.mockImplementation(async (url: string) => {
    const urlStr = String(url);

    if (urlStr.includes("/entity/by-slug/")) {
      return {
        ok: (overrides?.entityStatus ?? 200) < 400,
        status: overrides?.entityStatus ?? 200,
        json: async () => overrides?.entityBody ?? { entity: mockEntity },
        text: async () => JSON.stringify(overrides?.entityBody ?? { entity: mockEntity }),
      };
    }

    if (urlStr.includes("/entity/cmp_")) {
      return {
        ok: (overrides?.entityStatus ?? 200) < 400,
        status: overrides?.entityStatus ?? 200,
        json: async () => overrides?.entityBody ?? { entity: mockEntity },
        text: async () => JSON.stringify(overrides?.entityBody ?? { entity: mockEntity }),
      };
    }

    if (urlStr.includes("/sts/vend")) {
      return {
        ok: (overrides?.vendStatus ?? 200) < 400,
        status: overrides?.vendStatus ?? 200,
        json: async () => overrides?.vendBody ?? mockVendResponse,
        text: async () => JSON.stringify(overrides?.vendBody ?? mockVendResponse),
      };
    }

    return { ok: false, status: 404, text: async () => "Not found" };
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("resolveEntityContext", () => {
  beforeEach(() => {
    clearContextCache();
    vi.restoreAllMocks();
  });

  it("resolves context by slug", async () => {
    const fetchMock = setupFetchMock();

    const ctx = await resolveEntityContext("acme", mockConfig);

    expect(ctx.uid).toBe("cmp_01ABCDEF");
    expect(ctx.bucketName).toBe("hq-vault-acme-123");
    expect(ctx.credentials.accessKeyId).toBe("ASIA_TEST_KEY");
    expect(ctx.region).toBe("us-east-1");

    // Verify entity lookup used by-slug endpoint
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/entity/by-slug/company/acme");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/sts/vend");
  });

  it("resolves context by UID directly", async () => {
    const fetchMock = setupFetchMock();

    const ctx = await resolveEntityContext("cmp_01ABCDEF", mockConfig);

    expect(ctx.uid).toBe("cmp_01ABCDEF");
    // Verify entity lookup used direct UID endpoint
    expect(String(fetchMock.mock.calls[0][0])).toContain("/entity/cmp_01ABCDEF");
  });

  it("returns cached context when credentials are fresh", async () => {
    const fetchMock = setupFetchMock();

    const ctx1 = await resolveEntityContext("acme", mockConfig);
    const ctx2 = await resolveEntityContext("acme", mockConfig);

    expect(ctx1).toBe(ctx2); // Same reference
    expect(fetchMock).toHaveBeenCalledTimes(2); // Only 1 entity + 1 vend call
  });

  it("auto-refreshes when credentials expire soon", async () => {
    const almostExpired = new Date(Date.now() + 60 * 1000).toISOString(); // 1 min left
    const fetchMock = setupFetchMock({
      vendBody: {
        credentials: mockVendResponse.credentials,
        expiresAt: almostExpired,
      },
    });

    const ctx1 = await resolveEntityContext("acme", mockConfig);

    // Second call should refresh because <2 min remaining
    const ctx2 = await resolveEntityContext("acme", mockConfig);
    expect(ctx2).not.toBe(ctx1);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 2 entity + 2 vend calls
  });

  it("throws when entity has no bucket", async () => {
    setupFetchMock({
      entityBody: { entity: { ...mockEntity, bucketName: undefined } },
    });

    await expect(resolveEntityContext("acme", mockConfig)).rejects.toThrow(
      /no bucket provisioned/,
    );
  });

  it("throws on entity lookup failure", async () => {
    setupFetchMock({ entityStatus: 404 });

    await expect(resolveEntityContext("nonexistent", mockConfig)).rejects.toThrow(
      /Failed to find entity/,
    );
  });

  it("throws on STS vend failure", async () => {
    setupFetchMock({ vendStatus: 403 });

    await expect(resolveEntityContext("acme", mockConfig)).rejects.toThrow(
      /STS.*vend.*failed/,
    );
  });
});

describe("routing by UID prefix and vend-self dispatch", () => {
  beforeEach(() => {
    clearContextCache();
    vi.restoreAllMocks();
  });

  it("prs_* UID: entity resolved via /entity/{uid} and credentials via /sts/vend-self", async () => {
    const prsEntity = {
      uid: "prs_01PERSON",
      slug: "test-person",
      bucketName: "hq-vault-prs-01person",
      status: "active",
    };
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/entity/prs_")) {
        return { ok: true, status: 200, json: async () => ({ entity: prsEntity }), text: async () => "" };
      }
      if (u.includes("/sts/vend-self")) {
        return { ok: true, status: 200, json: async () => mockVendResponse, text: async () => "" };
      }
      return { ok: false, status: 404, text: async () => "Not found" };
    }));

    await resolveEntityContext("prs_01PERSON", mockConfig);

    expect(calls.some((u) => u.includes("/entity/prs_01PERSON"))).toBe(true);
    const vendCalls = calls.filter((u) => u.includes("/sts/vend"));
    expect(vendCalls).toHaveLength(1);
    expect(vendCalls[0]).toContain("/sts/vend-self");
  });

  it("foo_bar slug: entity resolved via /entity/by-slug/company/foo_bar and credentials via /sts/vend", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/entity/by-slug/")) {
        return { ok: true, status: 200, json: async () => ({ entity: mockEntity }), text: async () => "" };
      }
      if (u.includes("/sts/vend")) {
        return { ok: true, status: 200, json: async () => mockVendResponse, text: async () => "" };
      }
      return { ok: false, status: 404, text: async () => "Not found" };
    }));

    await resolveEntityContext("foo_bar", mockConfig);

    expect(calls.some((u) => u.includes("/entity/by-slug/company/foo_bar"))).toBe(true);
    const vendCalls = calls.filter((u) => u.includes("/sts/vend"));
    expect(vendCalls).toHaveLength(1);
    expect(vendCalls[0]).not.toContain("/sts/vend-self");
    expect(vendCalls[0]).toContain("/sts/vend");
  });

  it("team_alpha slug: entity resolved via /entity/by-slug/company/team_alpha and credentials via /sts/vend", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/entity/by-slug/")) {
        return { ok: true, status: 200, json: async () => ({ entity: mockEntity }), text: async () => "" };
      }
      if (u.includes("/sts/vend")) {
        return { ok: true, status: 200, json: async () => mockVendResponse, text: async () => "" };
      }
      return { ok: false, status: 404, text: async () => "Not found" };
    }));

    await resolveEntityContext("team_alpha", mockConfig);

    expect(calls.some((u) => u.includes("/entity/by-slug/company/team_alpha"))).toBe(true);
    const vendCalls = calls.filter((u) => u.includes("/sts/vend"));
    expect(vendCalls).toHaveLength(1);
    expect(vendCalls[0]).not.toContain("/sts/vend-self");
  });

  it("cmp_* UID: entity resolved via /entity/{uid} and credentials via /sts/vend", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/entity/cmp_")) {
        return { ok: true, status: 200, json: async () => ({ entity: mockEntity }), text: async () => "" };
      }
      if (u.includes("/sts/vend")) {
        return { ok: true, status: 200, json: async () => mockVendResponse, text: async () => "" };
      }
      return { ok: false, status: 404, text: async () => "Not found" };
    }));

    await resolveEntityContext("cmp_01ABCDEF", mockConfig);

    expect(calls.some((u) => u.includes("/entity/cmp_01ABCDEF"))).toBe(true);
    const vendCalls = calls.filter((u) => u.includes("/sts/vend"));
    expect(vendCalls).toHaveLength(1);
    expect(vendCalls[0]).not.toContain("/sts/vend-self");
    expect(vendCalls[0]).toContain("/sts/vend");
  });
});

describe("refreshEntityContext", () => {
  beforeEach(() => {
    clearContextCache();
    vi.restoreAllMocks();
  });

  it("evicts cache and fetches fresh credentials", async () => {
    const fetchMock = setupFetchMock();

    const ctx1 = await resolveEntityContext("acme", mockConfig);
    const ctx2 = await refreshEntityContext("acme", mockConfig);

    expect(ctx2).not.toBe(ctx1);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 2 initial + 2 refresh
  });
});

describe("isExpiringSoon", () => {
  it("returns false when well within TTL", () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(isExpiringSoon(future)).toBe(false);
  });

  it("returns true when within 2 minutes", () => {
    const soon = new Date(Date.now() + 90 * 1000).toISOString();
    expect(isExpiringSoon(soon)).toBe(true);
  });

  it("returns true when already expired", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isExpiringSoon(past)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Refreshable authToken getter
//
// Regression for the personal-sync 401: a long-running `hq-sync-runner` run
// captures vaultConfig.authToken as a string at startup, then `refreshEntityContext`
// fires ~13 min into the personal-company sync (STS expiry) and uses that
// stale string against API Gateway's JWT authorizer → 401. The getter form
// lets every fetchEntity / postVend call resolve the latest token from disk.
// ---------------------------------------------------------------------------

describe("authToken getter is invoked per-request (regression: personal-sync 401)", () => {
  beforeEach(() => {
    clearContextCache();
    vi.restoreAllMocks();
  });

  it("calls the getter on entity fetch AND on vend (every request)", async () => {
    setupFetchMock();
    const getter = vi.fn(async () => "fresh-token");

    await resolveEntityContext("cmp_01ABCDEF", {
      apiUrl: "https://vault-api.test",
      authToken: getter,
    });

    // Two upstream requests: fetchEntity (UID looks like a UID) + postVend.
    expect(getter).toHaveBeenCalledTimes(2);
  });

  it("picks up a rotated token between resolveEntityContext and refreshEntityContext", async () => {
    const fetchMock = setupFetchMock();
    let current = "stale-token";
    const cfg = {
      apiUrl: "https://vault-api.test",
      authToken: async () => current,
    };

    await resolveEntityContext("cmp_01ABCDEF", cfg);

    // fetchEntity + vend during initial resolution — both used "stale-token"
    const initialAuth = (fetchMock.mock.calls as [string, RequestInit][]).map(
      ([, init]) =>
        (init.headers as Record<string, string>).Authorization,
    );
    expect(initialAuth.every((a) => a === "Bearer stale-token")).toBe(true);

    // Simulate the on-disk token rotating mid-flight.
    current = "fresh-token";

    await refreshEntityContext("cmp_01ABCDEF", cfg);

    // The post-refresh calls must use the new token. Without the per-request
    // getter, refreshEntityContext would still send "Bearer stale-token" and
    // 401 against the gateway.
    const allCalls = fetchMock.mock.calls as [string, RequestInit][];
    const postRefreshCalls = allCalls.slice(initialAuth.length);
    expect(postRefreshCalls.length).toBeGreaterThan(0);
    for (const [, init] of postRefreshCalls) {
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer fresh-token",
      );
    }
  });

  it("static-string authToken still works (back-compat)", async () => {
    const fetchMock = setupFetchMock();
    await resolveEntityContext("cmp_01ABCDEF", {
      apiUrl: "https://vault-api.test",
      authToken: "static-token",
    });

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls.length).toBeGreaterThan(0);
    for (const [, init] of calls) {
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer static-token",
      );
    }
  });
});
