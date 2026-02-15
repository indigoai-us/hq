import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Agent } from "@/types/agent";

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

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    getToken: vi.fn().mockResolvedValue("mock-token"),
  }),
}));

vi.mock("@/services/agents", () => ({
  fetchAgents: vi.fn(),
}));

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Test Agent",
    type: "code",
    status: "running",
    progress: { completed: 3, total: 10 },
    lastActivity: new Date().toISOString(),
    ...overrides,
  };
}

describe("useAgents", () => {
  let fetchAgentsMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear listeners
    for (const key of Object.keys(wsListeners)) {
      wsListeners[key] = [];
    }
    const agentsModule = await import("@/services/agents");
    fetchAgentsMock = agentsModule.fetchAgents as ReturnType<typeof vi.fn>;
  });

  it("starts with loading=true and empty agents", async () => {
    fetchAgentsMock.mockResolvedValue([]);
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.agents).toEqual([]);
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("loads agents on mount", async () => {
    const agents = [makeAgent({ id: "a-1" }), makeAgent({ id: "a-2" })];
    fetchAgentsMock.mockResolvedValue(agents);
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toHaveLength(2);
    expect(result.current.agents[0].id).toBe("a-1");
    expect(result.current.agents[1].id).toBe("a-2");
    expect(result.current.error).toBeNull();
  });

  it("sets error on fetch failure", async () => {
    fetchAgentsMock.mockRejectedValue(new Error("Network error"));
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.agents).toEqual([]);
  });

  it("sets generic error message for non-Error throws", async () => {
    fetchAgentsMock.mockRejectedValue("string error");
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load agents");
  });

  it("refresh fetches agents again", async () => {
    fetchAgentsMock.mockResolvedValue([makeAgent()]);
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchAgentsMock).toHaveBeenCalledTimes(1);

    fetchAgentsMock.mockResolvedValue([makeAgent({ id: "a-2", name: "New Agent" })]);

    act(() => {
      result.current.refresh();
    });

    expect(result.current.refreshing).toBe(true);

    await waitFor(() => {
      expect(result.current.refreshing).toBe(false);
    });

    expect(fetchAgentsMock).toHaveBeenCalledTimes(2);
    expect(result.current.agents[0].name).toBe("New Agent");
  });

  it("refresh sets refreshing=true, not loading", async () => {
    fetchAgentsMock.mockResolvedValue([makeAgent()]);
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    fetchAgentsMock.mockResolvedValue([makeAgent()]);

    act(() => {
      result.current.refresh();
    });

    // refreshing should be true, loading should still be false
    expect(result.current.refreshing).toBe(true);

    await waitFor(() => {
      expect(result.current.refreshing).toBe(false);
    });
  });

  it("updateAgent modifies agent in state", async () => {
    fetchAgentsMock.mockResolvedValue([makeAgent({ id: "a-1", status: "running" })]);
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateAgent("a-1", { status: "completed" });
    });

    expect(result.current.agents[0].status).toBe("completed");
  });

  it("updateAgent does not modify other agents", async () => {
    fetchAgentsMock.mockResolvedValue([
      makeAgent({ id: "a-1", name: "First" }),
      makeAgent({ id: "a-2", name: "Second" }),
    ]);
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateAgent("a-1", { name: "Updated First" });
    });

    expect(result.current.agents[0].name).toBe("Updated First");
    expect(result.current.agents[1].name).toBe("Second");
  });

  it("handles agent:updated WebSocket event", async () => {
    fetchAgentsMock.mockResolvedValue([makeAgent({ id: "a-1", status: "running" })]);
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Simulate a WebSocket agent:updated event
    const listeners = wsListeners["agent:updated"] ?? [];
    expect(listeners.length).toBeGreaterThan(0);

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "agent:updated",
          payload: { id: "a-1", status: "completed" } as Partial<Agent>,
          timestamp: new Date().toISOString(),
        });
      }
    });

    expect(result.current.agents[0].status).toBe("completed");
  });

  it("handles agent:created WebSocket event", async () => {
    fetchAgentsMock.mockResolvedValue([makeAgent({ id: "a-1" })]);
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toHaveLength(1);

    const listeners = wsListeners["agent:created"] ?? [];
    expect(listeners.length).toBeGreaterThan(0);

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "agent:created",
          payload: makeAgent({ id: "a-new", name: "New Agent" }),
          timestamp: new Date().toISOString(),
        });
      }
    });

    expect(result.current.agents).toHaveLength(2);
    expect(result.current.agents[0].id).toBe("a-new");
  });

  it("handles agent:created without duplicating existing agent", async () => {
    fetchAgentsMock.mockResolvedValue([makeAgent({ id: "a-1" })]);
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const listeners = wsListeners["agent:created"] ?? [];

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "agent:created",
          payload: makeAgent({ id: "a-1" }),
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Should not duplicate
    expect(result.current.agents).toHaveLength(1);
  });

  it("handles agent:deleted WebSocket event", async () => {
    fetchAgentsMock.mockResolvedValue([
      makeAgent({ id: "a-1" }),
      makeAgent({ id: "a-2" }),
    ]);
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toHaveLength(2);

    const listeners = wsListeners["agent:deleted"] ?? [];
    expect(listeners.length).toBeGreaterThan(0);

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "agent:deleted",
          payload: { agentId: "a-1" },
          timestamp: new Date().toISOString(),
        });
      }
    });

    expect(result.current.agents).toHaveLength(1);
    expect(result.current.agents[0].id).toBe("a-2");
  });

  it("clears error on successful refresh", async () => {
    fetchAgentsMock.mockRejectedValue(new Error("Fail"));
    const { useAgents } = await import("../useAgents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.error).toBe("Fail");
    });

    fetchAgentsMock.mockResolvedValue([makeAgent()]);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.agents).toHaveLength(1);
    });
  });
});
