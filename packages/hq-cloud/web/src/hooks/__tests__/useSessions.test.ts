import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Session } from "@/types/session";

// Track the registered listeners for WebSocket events
const wsListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

vi.mock("@/contexts/WebSocketContext", () => ({
  useWebSocket: () => ({
    subscribe: vi.fn((eventType: string, listener: (...args: unknown[]) => void) => {
      if (!wsListeners[eventType]) wsListeners[eventType] = [];
      wsListeners[eventType].push(listener);
      return () => {
        const idx = wsListeners[eventType].indexOf(listener);
        if (idx >= 0) wsListeners[eventType].splice(idx, 1);
      };
    }),
    connectionStatus: "connected",
    isConnected: true,
    reconnect: vi.fn(),
  }),
}));

vi.mock("@/services/sessions", () => ({
  fetchSessions: vi.fn(),
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: "sess-1",
    userId: "user-1",
    status: "active",
    ecsTaskArn: null,
    initialPrompt: "Help me build a feature",
    workerContext: null,
    messageCount: 5,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    stoppedAt: null,
    error: null,
    pendingPermissions: 0,
    ...overrides,
  };
}

describe("useSessions", () => {
  let fetchSessionsMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear listeners
    for (const key of Object.keys(wsListeners)) {
      wsListeners[key] = [];
    }
    const sessionsModule = await import("@/services/sessions");
    fetchSessionsMock = sessionsModule.fetchSessions as ReturnType<typeof vi.fn>;
  });

  it("starts with loading=true and empty sessions", async () => {
    fetchSessionsMock.mockResolvedValue([]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    expect(result.current.loading).toBe(true);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("loads sessions on mount", async () => {
    const sessions = [makeSession({ sessionId: "s-1" }), makeSession({ sessionId: "s-2" })];
    fetchSessionsMock.mockResolvedValue(sessions);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[0].sessionId).toBe("s-1");
    expect(result.current.sessions[1].sessionId).toBe("s-2");
    expect(result.current.error).toBeNull();
  });

  it("sets error on fetch failure", async () => {
    fetchSessionsMock.mockRejectedValue(new Error("Network error"));
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.sessions).toEqual([]);
  });

  it("sets generic error message for non-Error throws", async () => {
    fetchSessionsMock.mockRejectedValue("string error");
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load sessions");
  });

  it("refresh fetches sessions again", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession()]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchSessionsMock).toHaveBeenCalledTimes(1);

    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-2", initialPrompt: "New prompt" })]);

    act(() => {
      result.current.refresh();
    });

    expect(result.current.refreshing).toBe(true);

    await waitFor(() => {
      expect(result.current.refreshing).toBe(false);
    });

    expect(fetchSessionsMock).toHaveBeenCalledTimes(2);
    expect(result.current.sessions[0].initialPrompt).toBe("New prompt");
  });

  it("refresh sets refreshing=true, not loading", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession()]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    fetchSessionsMock.mockResolvedValue([makeSession()]);

    act(() => {
      result.current.refresh();
    });

    expect(result.current.refreshing).toBe(true);

    await waitFor(() => {
      expect(result.current.refreshing).toBe(false);
    });
  });

  it("updateSession modifies session in state", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1", status: "active" })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateSession("s-1", { status: "stopped" });
    });

    expect(result.current.sessions[0].status).toBe("stopped");
  });

  it("removeSession removes session from state", async () => {
    fetchSessionsMock.mockResolvedValue([
      makeSession({ sessionId: "s-1" }),
      makeSession({ sessionId: "s-2" }),
    ]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.removeSession("s-1");
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].sessionId).toBe("s-2");
  });

  it("addSession prepends session to list", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1" })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.addSession(makeSession({ sessionId: "s-new" }));
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[0].sessionId).toBe("s-new");
  });

  it("addSession does not duplicate existing session", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1" })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.addSession(makeSession({ sessionId: "s-1" }));
    });

    expect(result.current.sessions).toHaveLength(1);
  });

  it("handles session_status WebSocket event", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1", status: "starting" })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const listeners = wsListeners["session_status"] ?? [];
    expect(listeners.length).toBeGreaterThan(0);

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "session_status",
          payload: { sessionId: "s-1", status: "active" },
          timestamp: new Date().toISOString(),
        });
      }
    });

    expect(result.current.sessions[0].status).toBe("active");
  });

  it("handles session_status_changed WebSocket event", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1", status: "active" })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const listeners = wsListeners["session_status_changed"] ?? [];
    expect(listeners.length).toBeGreaterThan(0);

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "session_status_changed",
          payload: { sessionId: "s-1", status: "stopped" },
          timestamp: new Date().toISOString(),
        });
      }
    });

    expect(result.current.sessions[0].status).toBe("stopped");
  });

  it("maps 'waiting' status to 'active'", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1", status: "starting" })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const listeners = wsListeners["session_status"] ?? [];

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "session_status",
          payload: { sessionId: "s-1", status: "waiting" },
          timestamp: new Date().toISOString(),
        });
      }
    });

    // "waiting" should map to "active"
    expect(result.current.sessions[0].status).toBe("active");
  });

  it("updates pendingPermissions count from status event", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1", pendingPermissions: 0 })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const listeners = wsListeners["session_status"] ?? [];

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "session_status",
          payload: {
            sessionId: "s-1",
            status: "active",
            pendingPermissions: [
              { requestId: "r-1", toolName: "Bash" },
              { requestId: "r-2", toolName: "Read" },
            ],
          },
          timestamp: new Date().toISOString(),
        });
      }
    });

    expect(result.current.sessions[0].pendingPermissions).toBe(2);
  });

  it("increments pendingPermissions on session_permission_request", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1", pendingPermissions: 1 })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const listeners = wsListeners["session_permission_request"] ?? [];
    expect(listeners.length).toBeGreaterThan(0);

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "session_permission_request",
          payload: {
            sessionId: "s-1",
            requestId: "r-new",
            toolName: "Write",
            input: { file_path: "/test.ts" },
          },
          timestamp: new Date().toISOString(),
        });
      }
    });

    expect(result.current.sessions[0].pendingPermissions).toBe(2);
  });

  it("decrements pendingPermissions on session_permission_resolved", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1", pendingPermissions: 2 })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const listeners = wsListeners["session_permission_resolved"] ?? [];
    expect(listeners.length).toBeGreaterThan(0);

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "session_permission_resolved",
          payload: {
            sessionId: "s-1",
            requestId: "r-1",
            behavior: "allow",
          },
          timestamp: new Date().toISOString(),
        });
      }
    });

    expect(result.current.sessions[0].pendingPermissions).toBe(1);
  });

  it("pendingPermissions does not go below 0", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1", pendingPermissions: 0 })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const listeners = wsListeners["session_permission_resolved"] ?? [];

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "session_permission_resolved",
          payload: {
            sessionId: "s-1",
            requestId: "r-1",
            behavior: "deny",
          },
          timestamp: new Date().toISOString(),
        });
      }
    });

    expect(result.current.sessions[0].pendingPermissions).toBe(0);
  });

  it("does not update sessions for mismatched sessionId", async () => {
    fetchSessionsMock.mockResolvedValue([makeSession({ sessionId: "s-1", status: "active" })]);
    const { useSessions } = await import("../useSessions");
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const listeners = wsListeners["session_status"] ?? [];

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "session_status",
          payload: { sessionId: "s-other", status: "stopped" },
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Should remain unchanged
    expect(result.current.sessions[0].status).toBe("active");
  });
});
