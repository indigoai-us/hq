import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests for githubApi error handling — specifically the 403 on
 * /user/installations when the token lacks GitHub App scopes.
 */

// We need to mock fetch globally since githubApi uses it
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock child_process so module-level execSync calls in auth.ts don't run
vi.mock("child_process", () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
}));

// Import after mocks are in place
const { githubApi } = await import("../auth.js");

const fakeAuth = {
  access_token: "gho_fake_token",
  login: "testuser",
  id: 12345,
  name: "Test User",
  email: "test@example.com",
  issued_at: new Date().toISOString(),
};

describe("githubApi", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

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

  it("includes the re-auth hint in the 403 installations error", async () => {
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
      text: async () => JSON.stringify({ message: "Resource not accessible by integration" }),
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

    const result = await githubApi("/user/installations?per_page=100", fakeAuth);
    expect(result).toEqual({ installations: [] });
  });
});
