import { describe, it, expect, beforeEach, vi } from "vitest";
import { apiRequest, setTokenGetter } from "../api-client";

vi.mock("../storage", () => ({
  getApiUrl: vi.fn(),
}));

import { getApiUrl } from "../storage";

const mockGetApiUrl = vi.mocked(getApiUrl);

describe("apiRequest", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
    mockGetApiUrl.mockReturnValue("http://localhost:3000");
    // Set up a mock token getter
    setTokenGetter(() => Promise.resolve("test-clerk-jwt"));
  });

  it("throws when no token getter is set", async () => {
    setTokenGetter(null);
    await expect(apiRequest("/api/test")).rejects.toThrow(
      "Not authenticated. Please sign in.",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when token getter returns null", async () => {
    setTokenGetter(() => Promise.resolve(null));
    await expect(apiRequest("/api/test")).rejects.toThrow(
      "Not authenticated. Please sign in.",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends GET request to the correct URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: "ok" }),
    });

    await apiRequest("/api/agents");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/agents",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("includes Bearer authorization header with token", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await apiRequest("/api/test");
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers.Authorization).toBe("Bearer test-clerk-jwt");
  });

  it("includes Content-Type JSON header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await apiRequest("/api/test");
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers["Content-Type"]).toBe("application/json");
  });

  it("serializes body as JSON for POST requests", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const body = { name: "test", value: 42 };
    await apiRequest("/api/test", { method: "POST", body });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].method).toBe("POST");
    expect(callArgs[1].body).toBe(JSON.stringify(body));
  });

  it("does not include body for GET requests", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await apiRequest("/api/test");
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].body).toBeUndefined();
  });

  it("returns parsed JSON response", async () => {
    const responseData = { agents: [{ id: "1", name: "Agent A" }] };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(responseData),
    });

    const result = await apiRequest("/api/agents");
    expect(result).toEqual(responseData);
  });

  it("throws on non-ok response with status and error text", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not Found"),
    });

    // Plain text errors are shown directly (not wrapped in "API error NNN:")
    await expect(apiRequest("/api/missing")).rejects.toThrow("Not Found");
  });

  it("throws with parsed message from JSON error response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            error: "Unauthorized",
            message: "Bearer token is required.",
          }),
        ),
    });

    // Should extract the 'message' field from the JSON error body
    await expect(apiRequest("/api/protected")).rejects.toThrow(
      "Bearer token is required.",
    );
  });

  it("merges custom headers with defaults", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await apiRequest("/api/test", {
      headers: { "X-Custom": "header-value" },
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers["X-Custom"]).toBe("header-value");
    expect(callArgs[1].headers.Authorization).toBe("Bearer test-clerk-jwt");
  });

  it("uses the base URL from storage", async () => {
    mockGetApiUrl.mockReturnValue("https://prod.example.com");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await apiRequest("/api/test");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://prod.example.com/api/test",
      expect.any(Object),
    );
  });
});
