import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

/**
 * Unit tests for auth.ts:
 *   - githubApi error handling (403 on /user/installations)
 *   - ~/.hq/app-token.json persistence (load / save / clear)
 *   - Token validation via /user/installations probe
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock child_process so module-level execSync calls in auth.ts don't run
vi.mock("child_process", () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
}));

// Import after mocks are in place
const {
  githubApi,
  loadGitHubAuth,
  saveGitHubAuth,
  clearGitHubAuth,
  isGitHubAuthValid,
  isAppScopedToken,
  HQ_APP_TOKEN_PATH,
} = await import("../auth.js");

// ─── Fixtures ──────────────────────────────────────────────────────────────

const fakeAuth = {
  access_token: "ghu_fake_app_token",
  login: "testuser",
  id: 12345,
  name: "Test User",
  email: "test@example.com",
  issued_at: new Date().toISOString(),
};

// Use a temp directory so tests don't touch the real ~/.hq/
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-hq-auth-test-"));
const tmpTokenPath = path.join(tmpDir, "app-token.json");

// ─── githubApi ─────────────────────────────────────────────────────────────

describe("githubApi", () => {
  beforeEach(() => mockFetch.mockReset());

  it("throws a user-friendly message on 403 for /user/installations", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          message:
            "You must authenticate with an access token authorized to a GitHub App in order to list installations",
          documentation_url:
            "https://docs.github.com/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token",
          status: "403",
        }),
    });

    await expect(
      githubApi("/user/installations?per_page=100", fakeAuth)
    ).rejects.toThrow(/signed in with a regular GitHub token/i);
  });

  it("includes the re-run hint in the 403 installations error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          message:
            "You must authenticate with an access token authorized to a GitHub App",
        }),
    });

    await expect(
      githubApi("/user/installations?per_page=100", fakeAuth)
    ).rejects.toThrow(/npx create-hq/);
  });

  it("preserves the raw error for non-installation 403s", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({ message: "Resource not accessible by integration" }),
    });

    await expect(
      githubApi("/orgs/acme/repos", fakeAuth)
    ).rejects.toThrow(/GitHub API 403 \/orgs\/acme\/repos/);
  });

  it("throws the raw error for non-403 failures", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ message: "Not Found" }),
    });

    await expect(
      githubApi("/user/installations?per_page=100", fakeAuth)
    ).rejects.toThrow(/GitHub API 404/);
  });

  it("returns parsed JSON on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ installations: [] }),
    });

    const result = await githubApi(
      "/user/installations?per_page=100",
      fakeAuth
    );
    expect(result).toEqual({ installations: [] });
  });
});

// ─── ~/.hq/app-token.json persistence ──────────────────────────────────────

describe("App token persistence", () => {
  afterEach(() => {
    // Clean up temp token file between tests
    try { fs.unlinkSync(tmpTokenPath); } catch {}
  });

  afterEach(() => {
    // Clean up the real path if any test accidentally wrote there
    // (shouldn't happen — we test with tmpTokenPath)
  });

  it("HQ_APP_TOKEN_PATH points to ~/.hq/app-token.json", () => {
    const expected = path.join(os.homedir(), ".hq", "app-token.json");
    expect(HQ_APP_TOKEN_PATH).toBe(expected);
  });

  it("saveGitHubAuth writes token file to disk", () => {
    saveGitHubAuth(fakeAuth, tmpTokenPath);

    // File was written
    expect(fs.existsSync(tmpTokenPath)).toBe(true);
    const stored = JSON.parse(fs.readFileSync(tmpTokenPath, "utf-8"));
    expect(stored.login).toBe("testuser");
    expect(stored.access_token).toBe("ghu_fake_app_token");
  });

  it("saveGitHubAuth creates ~/.hq/ directory if missing", () => {
    const nested = path.join(tmpDir, "sub", "app-token.json");
    saveGitHubAuth(fakeAuth, nested);
    expect(fs.existsSync(nested)).toBe(true);
  });

  it("saveGitHubAuth sets restrictive file permissions (0600)", () => {
    saveGitHubAuth(fakeAuth, tmpTokenPath);
    const stat = fs.statSync(tmpTokenPath);
    // Owner read+write only (0600 = 0o600 = 384 decimal)
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("loadGitHubAuth reads from token file when present", () => {
    // Write a valid token file
    fs.writeFileSync(tmpTokenPath, JSON.stringify(fakeAuth), "utf-8");

    const loaded = loadGitHubAuth(tmpTokenPath);
    expect(loaded).not.toBeNull();
    expect(loaded!.login).toBe("testuser");
    expect(loaded!.access_token).toBe("ghu_fake_app_token");
  });

  it("loadGitHubAuth returns null when token file does not exist", () => {
    const loaded = loadGitHubAuth(tmpTokenPath);
    expect(loaded).toBeNull();
  });

  it("loadGitHubAuth returns null for corrupted JSON", () => {
    fs.writeFileSync(tmpTokenPath, "NOT VALID JSON{{{", "utf-8");
    const loaded = loadGitHubAuth(tmpTokenPath);
    expect(loaded).toBeNull();
  });

  it("loadGitHubAuth returns null when token file is missing access_token", () => {
    fs.writeFileSync(
      tmpTokenPath,
      JSON.stringify({ login: "x", id: 1 }),
      "utf-8"
    );
    const loaded = loadGitHubAuth(tmpTokenPath);
    expect(loaded).toBeNull();
  });

  it("clearGitHubAuth removes the token file", () => {
    fs.writeFileSync(tmpTokenPath, JSON.stringify(fakeAuth), "utf-8");
    expect(fs.existsSync(tmpTokenPath)).toBe(true);

    clearGitHubAuth(tmpTokenPath);
    expect(fs.existsSync(tmpTokenPath)).toBe(false);
  });

  it("clearGitHubAuth is a no-op when file does not exist", () => {
    // Should not throw
    clearGitHubAuth(tmpTokenPath);
  });
});

// ─── isGitHubAuthValid ─────────────────────────────────────────────────────

describe("isGitHubAuthValid", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns true when /user responds 200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    expect(await isGitHubAuthValid(fakeAuth)).toBe(true);
  });

  it("returns false when /user responds non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await isGitHubAuthValid(fakeAuth)).toBe(false);
  });

  it("returns false on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await isGitHubAuthValid(fakeAuth)).toBe(false);
  });
});

// ─── isAppScopedToken ──────────────────────────────────────────────────────

describe("isAppScopedToken", () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns "yes" when /user/installations responds 200', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    expect(await isAppScopedToken(fakeAuth)).toBe("yes");
  });

  it('returns "no" on 403 (definitive — wrong token type)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    expect(await isAppScopedToken(fakeAuth)).toBe("no");
  });

  it('returns "unknown" on 5xx (transient server error)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await isAppScopedToken(fakeAuth)).toBe("unknown");
  });

  it('returns "unknown" on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await isAppScopedToken(fakeAuth)).toBe("unknown");
  });

  it('returns "no" when access_token is empty', async () => {
    expect(await isAppScopedToken({ ...fakeAuth, access_token: "" })).toBe("no");
    // fetch should not have been called
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── Cleanup ───────────────────────────────────────────────────────────────

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});
