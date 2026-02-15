/**
 * Tests for useNavigator hook.
 * Verifies tree fetching, expand/collapse state, pull-to-refresh,
 * and real-time WebSocket updates.
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useNavigator } from "../../src/hooks/useNavigator";
import { fetchNavigatorTree } from "../../src/services/navigator";
import type { NavigatorTreeResponse } from "../../src/types";

// Mock the navigator service
jest.mock("../../src/services/navigator", () => ({
  fetchNavigatorTree: jest.fn(),
}));

// Mock the WebSocket event hook
const mockWebSocketCallbacks: Record<string, ((event: { payload: unknown }) => void)> = {};
jest.mock("../../src/hooks/useWebSocketEvent", () => ({
  useWebSocketEvent: jest.fn(
    (eventType: string, callback: (event: { payload: unknown }) => void) => {
      mockWebSocketCallbacks[eventType] = callback;
    },
  ),
}));

const mockFetchTree = fetchNavigatorTree as jest.MockedFunction<typeof fetchNavigatorTree>;

const sampleTree: NavigatorTreeResponse = {
  groups: [
    {
      id: "group-companies",
      name: "Companies",
      children: [
        {
          id: "company-stelo",
          name: "Stelo Labs Inc",
          type: "company",
          status: "healthy",
          children: [
            {
              id: "project-launch",
              name: "Product Launch",
              type: "project",
              status: "warning",
            },
          ],
        },
      ],
    },
    {
      id: "group-standalone",
      name: "Standalone Projects",
      children: [
        {
          id: "project-calendar",
          name: "Q1 Content Calendar",
          type: "project",
          status: "error",
        },
      ],
    },
  ],
};

const updatedTree: NavigatorTreeResponse = {
  groups: [
    {
      id: "group-companies",
      name: "Companies",
      children: [
        {
          id: "company-stelo",
          name: "Stelo Labs Inc",
          type: "company",
          status: "healthy",
          children: [
            {
              id: "project-launch",
              name: "Product Launch",
              type: "project",
              status: "healthy", // changed from warning
            },
          ],
        },
      ],
    },
  ],
};

describe("useNavigator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockWebSocketCallbacks).forEach((key) => {
      delete mockWebSocketCallbacks[key];
    });
  });

  it("starts with loading state", () => {
    mockFetchTree.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useNavigator());

    expect(result.current.loading).toBe(true);
    expect(result.current.groups).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("fetches tree on mount", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { result } = renderHook(() => useNavigator());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.groups).toEqual(sampleTree.groups);
    expect(result.current.error).toBeNull();
    expect(mockFetchTree).toHaveBeenCalledTimes(1);
  });

  it("handles fetch error", async () => {
    mockFetchTree.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useNavigator());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.groups).toEqual([]);
  });

  it("handles non-Error rejection", async () => {
    mockFetchTree.mockRejectedValue("string error");
    const { result } = renderHook(() => useNavigator());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load navigator");
  });

  it("refreshes tree on pull-to-refresh", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { result } = renderHook(() => useNavigator());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Trigger refresh
    act(() => {
      result.current.refresh();
    });

    expect(result.current.refreshing).toBe(true);

    await waitFor(() => {
      expect(result.current.refreshing).toBe(false);
    });

    expect(mockFetchTree).toHaveBeenCalledTimes(2);
  });

  it("toggles node expanded state", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { result } = renderHook(() => useNavigator());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Initially no nodes are expanded
    expect(result.current.expandedNodes.size).toBe(0);

    // Expand a node
    act(() => {
      result.current.toggleNode("group-companies");
    });

    expect(result.current.expandedNodes.has("group-companies")).toBe(true);
    expect(result.current.expandedNodes.size).toBe(1);

    // Expand another node
    act(() => {
      result.current.toggleNode("company-stelo");
    });

    expect(result.current.expandedNodes.has("group-companies")).toBe(true);
    expect(result.current.expandedNodes.has("company-stelo")).toBe(true);
    expect(result.current.expandedNodes.size).toBe(2);

    // Collapse the first node
    act(() => {
      result.current.toggleNode("group-companies");
    });

    expect(result.current.expandedNodes.has("group-companies")).toBe(false);
    expect(result.current.expandedNodes.has("company-stelo")).toBe(true);
    expect(result.current.expandedNodes.size).toBe(1);
  });

  it("updates tree from WebSocket event", async () => {
    mockFetchTree.mockResolvedValue(sampleTree);
    const { result } = renderHook(() => useNavigator());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.groups).toEqual(sampleTree.groups);

    // Simulate WebSocket update
    act(() => {
      mockWebSocketCallbacks["navigator:updated"]?.({
        payload: updatedTree,
      });
    });

    expect(result.current.groups).toEqual(updatedTree.groups);
  });
});
