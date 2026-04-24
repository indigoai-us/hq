import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CognitoTokens } from "@indigoai-us/hq-cloud";

/**
 * Unit tests for auth.ts — Cognito version.
 *
 * Covers:
 *   - DEFAULT_COGNITO config (Google-only, port 8765, shared pool with installer + CLI)
 *   - readIdentity — decodes ID-token JWT payloads safely
 *   - signOut — clears the cached session
 *   - ensureCognitoToken — cache / refresh / interactive-login branches
 *
 * The hq-cloud module is mocked so tests never touch the filesystem or network.
 */

const mockLoadCachedTokens = vi.fn();
const mockClearCachedTokens = vi.fn();
const mockIsExpiring = vi.fn();
const mockRefreshTokens = vi.fn();
const mockBrowserLogin = vi.fn();

vi.mock("@indigoai-us/hq-cloud", () => ({
  loadCachedTokens: mockLoadCachedTokens,
  clearCachedTokens: mockClearCachedTokens,
  isExpiring: mockIsExpiring,
  refreshTokens: mockRefreshTokens,
  browserLogin: mockBrowserLogin,
}));

const {
  DEFAULT_COGNITO,
  ensureCognitoToken,
  readIdentity,
  signOut,
} = await import("../auth.js");

// ─── Fixtures ──────────────────────────────────────────────────────────────

/** Encode a JSON payload as a base64url JWT middle segment. */
function encodeJwtPayload(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeTokens(idPayload: Record<string, unknown>): CognitoTokens {
  return {
    accessToken: "access-" + Math.random().toString(36).slice(2),
    idToken: `header.${encodeJwtPayload(idPayload)}.signature`,
    refreshToken: "refresh-" + Math.random().toString(36).slice(2),
    expiresAt: Date.now() + 60 * 60 * 1000,
    tokenType: "Bearer",
  };
}

// ─── DEFAULT_COGNITO ───────────────────────────────────────────────────────

describe("DEFAULT_COGNITO", () => {
  it("matches hq-installer and hq-cli pool (hq-vault-dev, us-east-1)", () => {
    expect(DEFAULT_COGNITO.region).toBe("us-east-1");
    expect(DEFAULT_COGNITO.userPoolDomain).toBe("hq-vault-dev");
    expect(DEFAULT_COGNITO.clientId).toBe("4mmujmjq3srakdueg656b9m0mp");
  });

  it("forces Google as the identity provider", () => {
    expect(DEFAULT_COGNITO.identityProvider).toBe("Google");
  });

  it("prompts Google to re-select the account", () => {
    expect(DEFAULT_COGNITO.prompt).toBe("select_account");
  });

  it("uses port 8765 to match hq-cli", () => {
    expect(DEFAULT_COGNITO.port).toBe(8765);
  });
});

// ─── readIdentity ──────────────────────────────────────────────────────────

describe("readIdentity", () => {
  it("decodes sub, email, name from the ID token", () => {
    const tokens = makeTokens({
      sub: "abc-123",
      email: "stefan@example.com",
      name: "Stefan Johnson",
    });
    const id = readIdentity(tokens);
    expect(id).not.toBeNull();
    expect(id!.sub).toBe("abc-123");
    expect(id!.email).toBe("stefan@example.com");
    expect(id!.name).toBe("Stefan Johnson");
  });

  it("exposes the full decoded claims bag", () => {
    const tokens = makeTokens({
      sub: "abc",
      email: "x@y.com",
      "custom:org": "indigo",
    });
    const id = readIdentity(tokens);
    expect(id!.claims["custom:org"]).toBe("indigo");
  });

  it("returns undefined for missing email/name fields", () => {
    const tokens = makeTokens({ sub: "abc" });
    const id = readIdentity(tokens);
    expect(id!.sub).toBe("abc");
    expect(id!.email).toBeUndefined();
    expect(id!.name).toBeUndefined();
  });

  it("returns null when the ID token is malformed", () => {
    const tokens: CognitoTokens = {
      accessToken: "x",
      idToken: "not-a-jwt",
      refreshToken: "r",
      expiresAt: Date.now() + 60000,
      tokenType: "Bearer",
    };
    expect(readIdentity(tokens)).toBeNull();
  });

  it("returns null when the payload segment is invalid JSON", () => {
    const tokens: CognitoTokens = {
      accessToken: "x",
      idToken: "header.!!!notbase64valid!!!.sig",
      refreshToken: "r",
      expiresAt: Date.now() + 60000,
      tokenType: "Bearer",
    };
    expect(readIdentity(tokens)).toBeNull();
  });
});

// ─── signOut ───────────────────────────────────────────────────────────────

describe("signOut", () => {
  it("delegates to hq-cloud.clearCachedTokens", () => {
    mockClearCachedTokens.mockReset();
    signOut();
    expect(mockClearCachedTokens).toHaveBeenCalledOnce();
  });
});

// ─── ensureCognitoToken ────────────────────────────────────────────────────

describe("ensureCognitoToken", () => {
  beforeEach(() => {
    mockLoadCachedTokens.mockReset();
    mockIsExpiring.mockReset();
    mockRefreshTokens.mockReset();
    mockBrowserLogin.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns cached tokens when they are not expiring", async () => {
    const cached = makeTokens({ sub: "abc" });
    mockLoadCachedTokens.mockReturnValue(cached);
    mockIsExpiring.mockReturnValue(false);

    const result = await ensureCognitoToken();
    expect(result).toBe(cached);
    expect(mockRefreshTokens).not.toHaveBeenCalled();
    expect(mockBrowserLogin).not.toHaveBeenCalled();
  });

  it("refreshes expiring tokens using the cached refresh token", async () => {
    const cached = makeTokens({ sub: "abc" });
    const refreshed = makeTokens({ sub: "abc" });
    mockLoadCachedTokens.mockReturnValue(cached);
    mockIsExpiring.mockReturnValue(true);
    mockRefreshTokens.mockResolvedValue(refreshed);

    const result = await ensureCognitoToken();
    expect(result).toBe(refreshed);
    expect(mockRefreshTokens).toHaveBeenCalledWith(
      DEFAULT_COGNITO,
      cached.refreshToken,
    );
    expect(mockBrowserLogin).not.toHaveBeenCalled();
  });

  it("falls back to browser login when refresh fails", async () => {
    const cached = makeTokens({ sub: "abc" });
    const fresh = makeTokens({ sub: "abc" });
    mockLoadCachedTokens.mockReturnValue(cached);
    mockIsExpiring.mockReturnValue(true);
    mockRefreshTokens.mockRejectedValue(new Error("invalid_grant"));
    mockBrowserLogin.mockResolvedValue(fresh);

    const result = await ensureCognitoToken();
    expect(result).toBe(fresh);
    expect(mockBrowserLogin).toHaveBeenCalledWith(DEFAULT_COGNITO);
  });

  it("launches browser login when no cached tokens exist", async () => {
    const fresh = makeTokens({ sub: "abc" });
    mockLoadCachedTokens.mockReturnValue(null);
    mockBrowserLogin.mockResolvedValue(fresh);

    const result = await ensureCognitoToken();
    expect(result).toBe(fresh);
    expect(mockRefreshTokens).not.toHaveBeenCalled();
    expect(mockBrowserLogin).toHaveBeenCalledWith(DEFAULT_COGNITO);
  });

  it("returns null in non-interactive mode when no cached token", async () => {
    mockLoadCachedTokens.mockReturnValue(null);

    const result = await ensureCognitoToken({ interactive: false });
    expect(result).toBeNull();
    expect(mockBrowserLogin).not.toHaveBeenCalled();
  });

  it("returns null in non-interactive mode when refresh fails", async () => {
    const cached = makeTokens({ sub: "abc" });
    mockLoadCachedTokens.mockReturnValue(cached);
    mockIsExpiring.mockReturnValue(true);
    mockRefreshTokens.mockRejectedValue(new Error("invalid_grant"));

    const result = await ensureCognitoToken({ interactive: false });
    expect(result).toBeNull();
    expect(mockBrowserLogin).not.toHaveBeenCalled();
  });

  it("returns null when browser login throws", async () => {
    mockLoadCachedTokens.mockReturnValue(null);
    mockBrowserLogin.mockRejectedValue(new Error("user closed tab"));

    const result = await ensureCognitoToken();
    expect(result).toBeNull();
  });
});
