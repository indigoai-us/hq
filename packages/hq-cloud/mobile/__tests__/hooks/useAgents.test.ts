/**
 * Tests for useAgents hook.
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useAgents } from "../../src/hooks/useAgents";
import { fetchAgents } from "../../src/services/agents";
import type { Agent } from "../../src/types";

// Mock the agents service
jest.mock("../../src/services/agents", () => ({
  fetchAgents: jest.fn(),
  answerQuestion: jest.fn(),
}));

// Mock the WebSocket event hook (no-op by default)
jest.mock("../../src/hooks/useWebSocketEvent", () => ({
  useWebSocketEvent: jest.fn(),
}));

// Mock the WebSocket context
jest.mock("../../src/contexts/WebSocketContext", () => ({
  useWebSocket: jest.fn(() => ({
    connectionStatus: "connected",
    isConnected: true,
    reconnect: jest.fn(),
    subscribe: jest.fn(() => jest.fn()),
  })),
}));

const mockFetchAgents = fetchAgents as jest.MockedFunction<typeof fetchAgents>;

const sampleAgents: Agent[] = [
  {
    id: "a-1",
    name: "Content Planner",
    type: "content",
    status: "running",
    progress: { completed: 3, total: 4 },
    lastActivity: "2026-02-08T10:00:00Z",
  },
  {
    id: "a-2",
    name: "Research Agent",
    type: "research",
    status: "waiting_input",
    progress: { completed: 4, total: 6 },
    currentQuestion: {
      id: "q-1",
      text: "Which approach?",
      options: ["A", "B"],
      askedAt: "2026-02-08T10:05:00Z",
    },
    lastActivity: "2026-02-08T10:05:00Z",
  },
];

describe("useAgents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts with loading state", () => {
    mockFetchAgents.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useAgents());
    expect(result.current.loading).toBe(true);
    expect(result.current.agents).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("loads agents from API on mount", async () => {
    mockFetchAgents.mockResolvedValue(sampleAgents);
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toEqual(sampleAgents);
    expect(result.current.error).toBeNull();
    expect(mockFetchAgents).toHaveBeenCalledTimes(1);
  });

  it("sets error state when fetch fails", async () => {
    mockFetchAgents.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toEqual([]);
    expect(result.current.error).toBe("Network error");
  });

  it("handles refresh (pull-to-refresh)", async () => {
    mockFetchAgents.mockResolvedValue(sampleAgents);
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Trigger refresh
    mockFetchAgents.mockResolvedValue([sampleAgents[0]]);
    act(() => {
      result.current.refresh();
    });

    expect(result.current.refreshing).toBe(true);

    await waitFor(() => {
      expect(result.current.refreshing).toBe(false);
    });

    expect(result.current.agents).toEqual([sampleAgents[0]]);
  });

  it("updateAgent modifies a single agent in state", async () => {
    mockFetchAgents.mockResolvedValue(sampleAgents);
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateAgent("a-1", { status: "completed" });
    });

    expect(result.current.agents[0].status).toBe("completed");
    // Other agent unchanged
    expect(result.current.agents[1].status).toBe("waiting_input");
  });
});
