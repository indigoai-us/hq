/**
 * Unit tests for cognito-auth.ts — focus on the `expiresAt` shape contract.
 *
 * Canonical on-disk shape is epoch milliseconds (number). The reader also
 * tolerates ISO 8601 strings for backward compatibility with pre-migration
 * token files, and fails safe on anything unparseable.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sandbox HOME *before* importing the module — it reads os.homedir() at load
// time to compute the cache file path.
let originalHome: string | undefined;
let tmpHome: string;

beforeEach(() => {
  originalHome = process.env.HOME;
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "hq-cognito-auth-test-"));
  process.env.HOME = tmpHome;
  vi.resetModules();
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function importModule() {
  return await import("./cognito-auth.js");
}

const baseTokens = {
  accessToken: "access",
  idToken: "id",
  refreshToken: "refresh",
  tokenType: "Bearer" as const,
};

// ---------------------------------------------------------------------------
// Reader: isExpiring accepts both shapes and fails safe
// ---------------------------------------------------------------------------

describe("isExpiring — expiresAt shape tolerance", () => {
  it("returns false for ISO string far in the future", async () => {
    const { isExpiring } = await importModule();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(isExpiring({ ...baseTokens, expiresAt: future })).toBe(false);
  });

  it("returns true for ISO string within the buffer window", async () => {
    const { isExpiring } = await importModule();
    const soon = new Date(Date.now() + 10 * 1000).toISOString();
    expect(isExpiring({ ...baseTokens, expiresAt: soon }, 60)).toBe(true);
  });

  it("returns false for raw number (ms) far in the future", async () => {
    const { isExpiring } = await importModule();
    const future = Date.now() + 60 * 60 * 1000;
    // Cast because the type says string; the point is runtime tolerance.
    expect(
      isExpiring({ ...baseTokens, expiresAt: future as unknown as string }),
    ).toBe(false);
  });

  it("returns true for raw number (ms) within the buffer window", async () => {
    const { isExpiring } = await importModule();
    const soon = Date.now() + 10 * 1000;
    expect(
      isExpiring(
        { ...baseTokens, expiresAt: soon as unknown as string },
        60,
      ),
    ).toBe(true);
  });

  it("fails safe (returns true) for malformed expiresAt", async () => {
    const { isExpiring } = await importModule();
    expect(
      isExpiring({ ...baseTokens, expiresAt: "not a date" }),
    ).toBe(true);
    expect(
      isExpiring({
        ...baseTokens,
        expiresAt: undefined as unknown as string,
      }),
    ).toBe(true);
    expect(
      isExpiring({
        ...baseTokens,
        expiresAt: Number.NaN as unknown as string,
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stale-pool detection — decodeAccessTokenClientId + getValidAccessToken
// self-evicts cached tokens minted by a different App Client (e.g. dev pool
// tokens left over from before the 2026-04-25 cutover).
// ---------------------------------------------------------------------------

/** Build a minimal unsigned JWT carrying the given claims. Cognito's real */
/** tokens are RS256-signed; we don't verify here so the signature can be     */
/** anything — only the base64url-encoded payload matters.                    */
function makeAccessToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .toString("base64")
    .replace(/=+$/, "");
  const payload = Buffer.from(JSON.stringify(claims))
    .toString("base64")
    .replace(/=+$/, "");
  return `${header}.${payload}.signature`;
}

const DEV_CLIENT = "4mmujmjq3srakdueg656b9m0mp";
const PROD_CLIENT = "7acei2c8v870enheptb1j5foln";

const baseConfig = {
  region: "us-east-1",
  userPoolDomain: "vault-indigo-hq-prod",
  clientId: PROD_CLIENT,
};

describe("decodeAccessTokenClientId", () => {
  it("returns the client_id claim from a well-formed JWT", async () => {
    const { decodeAccessTokenClientId } = await importModule();
    const token = makeAccessToken({ client_id: DEV_CLIENT, sub: "abc" });
    expect(decodeAccessTokenClientId(token)).toBe(DEV_CLIENT);
  });

  it("returns null when client_id is absent", async () => {
    const { decodeAccessTokenClientId } = await importModule();
    const token = makeAccessToken({ sub: "abc" });
    expect(decodeAccessTokenClientId(token)).toBeNull();
  });

  it("returns null when the token has fewer than two segments", async () => {
    const { decodeAccessTokenClientId } = await importModule();
    expect(decodeAccessTokenClientId("not-a-jwt")).toBeNull();
  });

  it("returns null when the payload isn't valid JSON", async () => {
    const { decodeAccessTokenClientId } = await importModule();
    expect(decodeAccessTokenClientId("aaa.bbb.ccc")).toBeNull();
  });
});

describe("getValidAccessToken stale-pool detection", () => {
  it("evicts a cached token whose client_id mismatches the current config", async () => {
    const { saveCachedTokens, loadCachedTokens, getValidAccessToken } =
      await importModule();
    const devToken = makeAccessToken({ client_id: DEV_CLIENT, sub: "abc" });
    saveCachedTokens({
      ...baseTokens,
      accessToken: devToken,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    expect(loadCachedTokens()).not.toBeNull();

    await expect(
      getValidAccessToken(baseConfig, { interactive: false }),
    ).rejects.toThrow(/No valid HQ session/);

    expect(loadCachedTokens()).toBeNull();
  });

  it("keeps a cached token whose client_id matches", async () => {
    const { saveCachedTokens, getValidAccessToken } = await importModule();
    const prodToken = makeAccessToken({ client_id: PROD_CLIENT, sub: "abc" });
    saveCachedTokens({
      ...baseTokens,
      accessToken: prodToken,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const access = await getValidAccessToken(baseConfig, {
      interactive: false,
    });
    expect(access).toBe(prodToken);
  });

  it("keeps a cached token when client_id can't be decoded (back-compat)", async () => {
    const { saveCachedTokens, getValidAccessToken } = await importModule();
    saveCachedTokens({
      ...baseTokens,
      accessToken: "opaque-non-jwt",
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const access = await getValidAccessToken(baseConfig, {
      interactive: false,
    });
    expect(access).toBe("opaque-non-jwt");
  });
});

// ---------------------------------------------------------------------------
// Round-trip: writers emit epoch-ms, readers read epoch-ms
// ---------------------------------------------------------------------------

describe("expiresAt shape round-trip", () => {
  it("saveCachedTokens + loadCachedTokens preserves epoch-ms number shape", async () => {
    const { saveCachedTokens, loadCachedTokens } = await importModule();
    const epochMs = Date.now() + 3600 * 1000;
    saveCachedTokens({ ...baseTokens, expiresAt: epochMs });
    const loaded = loadCachedTokens();
    expect(loaded).not.toBeNull();
    expect(typeof loaded?.expiresAt).toBe("number");
    expect(loaded?.expiresAt).toBe(epochMs);
  });

  it("saveCachedTokens + loadCachedTokens tolerates legacy ISO string", async () => {
    const { saveCachedTokens, loadCachedTokens } = await importModule();
    const iso = new Date(Date.now() + 3600 * 1000).toISOString();
    saveCachedTokens({ ...baseTokens, expiresAt: iso });
    const loaded = loadCachedTokens();
    expect(loaded).not.toBeNull();
    expect(typeof loaded?.expiresAt).toBe("string");
    expect(loaded?.expiresAt).toBe(iso);
  });

  it("refreshTokens writes epoch milliseconds to cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            access_token: "new-access",
            id_token: "new-id",
            refresh_token: "new-refresh",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const { refreshTokens, loadCachedTokens } = await importModule();
    const before = Date.now();
    const result = await refreshTokens(
      {
        region: "us-east-1",
        userPoolDomain: "vault-indigo-hq-dev",
        clientId: "test-client",
      },
      "prior-refresh-token",
    );
    const after = Date.now();

    expect(typeof result.expiresAt).toBe("number");
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(result.expiresAt).toBeLessThanOrEqual(after + 3600 * 1000);

    const onDisk = loadCachedTokens();
    expect(onDisk?.expiresAt).toBe(result.expiresAt);
    expect(typeof onDisk?.expiresAt).toBe("number");
  });
});
