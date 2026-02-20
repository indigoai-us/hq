import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAuth } from "@/contexts/AuthContext";
import { checkSetupStatus } from "@/services/settings";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    isLoading: false,
    getToken: vi.fn().mockResolvedValue("mock-token"),
  })),
}));

vi.mock("@/services/settings", () => ({
  checkSetupStatus: vi.fn(),
}));

// Import the hook AFTER vi.mock declarations
import { useSetupStatus } from "../useSetupStatus";

const mockCheckSetupStatus = vi.mocked(checkSetupStatus);
const mockUseAuth = vi.mocked(useAuth);

describe("useSetupStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default authenticated state
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      getToken: vi.fn().mockResolvedValue("mock-token"),
      user: null,
      logout: vi.fn(),
    });
  });

  it("starts with isLoading=true", async () => {
    mockCheckSetupStatus.mockResolvedValue({
      setupComplete: true,
      s3Prefix: "user_123/hq/",
      fileCount: 100,
    });
    const { result } = renderHook(() => useSetupStatus());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.setupComplete).toBe(false);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("returns setupComplete=true when API says setup is complete", async () => {
    mockCheckSetupStatus.mockResolvedValue({
      setupComplete: true,
      s3Prefix: "user_123/hq/",
      fileCount: 1132,
    });
    const { result } = renderHook(() => useSetupStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.setupComplete).toBe(true);
    expect(result.current.s3Prefix).toBe("user_123/hq/");
    expect(result.current.fileCount).toBe(1132);
  });

  it("returns setupComplete=false when API says setup is not complete", async () => {
    mockCheckSetupStatus.mockResolvedValue({
      setupComplete: false,
      s3Prefix: null,
      fileCount: 0,
    });
    const { result } = renderHook(() => useSetupStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.setupComplete).toBe(false);
    expect(result.current.s3Prefix).toBeNull();
    expect(result.current.fileCount).toBe(0);
  });

  it("assumes setupComplete=true on non-auth API errors", async () => {
    mockCheckSetupStatus.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useSetupStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Non-auth error: assume setup complete to avoid blocking users
    expect(result.current.setupComplete).toBe(true);
  });

  it("keeps setupComplete=false on auth errors", async () => {
    mockCheckSetupStatus.mockRejectedValue(
      new Error("Not authenticated. Please sign in.")
    );
    const { result } = renderHook(() => useSetupStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.setupComplete).toBe(false);
  });

  it("does not fetch when not authenticated", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      getToken: vi.fn(),
      user: null,
      logout: vi.fn(),
    });
    mockCheckSetupStatus.mockResolvedValue({
      setupComplete: true,
      s3Prefix: "user_123/hq/",
      fileCount: 100,
    });
    const { result } = renderHook(() => useSetupStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockCheckSetupStatus).not.toHaveBeenCalled();
  });

  it("does not fetch while auth is loading", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      getToken: vi.fn(),
      user: null,
      logout: vi.fn(),
    });
    mockCheckSetupStatus.mockResolvedValue({
      setupComplete: true,
      s3Prefix: "user_123/hq/",
      fileCount: 100,
    });
    const { result } = renderHook(() => useSetupStatus());

    // Should still be loading (waiting for auth to complete)
    expect(result.current.isLoading).toBe(true);
    expect(mockCheckSetupStatus).not.toHaveBeenCalled();
  });

  it("only calls the API once across re-renders (caches result)", async () => {
    mockCheckSetupStatus.mockResolvedValue({
      setupComplete: true,
      s3Prefix: "user_123/hq/",
      fileCount: 100,
    });
    const { result, rerender } = renderHook(() => useSetupStatus());

    await waitFor(() => {
      expect(result.current.setupComplete).toBe(true);
    });

    // Re-renders should not trigger another API call
    rerender();
    rerender();

    // Wait a tick for any effects to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(mockCheckSetupStatus).toHaveBeenCalledTimes(1);
  });
});
