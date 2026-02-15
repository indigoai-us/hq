/**
 * Tests for AgentsListScreen.
 * Includes MOB-005 tests: answer sent to API, delayed optimistic update.
 * Includes MOB-012 tests: permission response sent to API, delayed optimistic update.
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { AgentsListScreen } from "../../src/screens/AgentsListScreen";
import { fetchAgents, answerQuestion, respondToPermission } from "../../src/services/agents";
import type { Agent } from "../../src/types";

// Mock the agents service
jest.mock("../../src/services/agents", () => ({
  fetchAgents: jest.fn(),
  answerQuestion: jest.fn(),
  respondToPermission: jest.fn(),
}));

// Mock the WebSocket event hook (no-op for screen tests)
jest.mock("../../src/hooks/useWebSocketEvent", () => ({
  useWebSocketEvent: jest.fn(),
}));

// Mock WebSocket context
jest.mock("../../src/contexts/WebSocketContext", () => ({
  useWebSocket: jest.fn(() => ({
    connectionStatus: "connected",
    isConnected: true,
    reconnect: jest.fn(),
    subscribe: jest.fn(() => jest.fn()),
  })),
}));

const mockFetchAgents = fetchAgents as jest.MockedFunction<typeof fetchAgents>;
const mockAnswerQuestion = answerQuestion as jest.MockedFunction<typeof answerQuestion>;
const mockRespondToPermission = respondToPermission as jest.MockedFunction<typeof respondToPermission>;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(),
} as unknown as Props["navigation"];

// Re-import Props type for the navigation mock
type Props = Parameters<typeof AgentsListScreen>[0];

const mockRoute = { key: "test", name: "AgentsList" as const, params: undefined };

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
      options: ["Approach A", "Approach B"],
      askedAt: new Date().toISOString(),
    },
    lastActivity: "2026-02-08T10:05:00Z",
  },
];

const sampleAgentsWithPermission: Agent[] = [
  ...sampleAgents,
  {
    id: "a-3",
    name: "Code Agent",
    type: "code",
    status: "waiting_input",
    progress: { completed: 2, total: 5 },
    currentPermission: {
      id: "perm-1",
      tool: "Read Desktop",
      description: "access your Desktop folder",
      requestedAt: new Date().toISOString(),
    },
    lastActivity: "2026-02-08T10:10:00Z",
  },
];

describe("AgentsListScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockFetchAgents.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(
      <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    expect(getByTestId("agents-loading")).toBeTruthy();
  });

  it("shows empty state when no agents", async () => {
    mockFetchAgents.mockResolvedValue([]);
    const { getByTestId, getByText } = render(
      <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("agents-empty")).toBeTruthy();
    });
    expect(getByText("No Agents Running")).toBeTruthy();
    expect(getByText("Spawn a worker to get started")).toBeTruthy();
  });

  it("shows error state with retry button", async () => {
    mockFetchAgents.mockRejectedValue(new Error("Network error"));
    const { getByTestId, getByText } = render(
      <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("agents-error")).toBeTruthy();
    });
    expect(getByText("Could not load agents")).toBeTruthy();
    expect(getByText("Network error")).toBeTruthy();
    expect(getByTestId("agents-retry-button")).toBeTruthy();
  });

  it("renders agent cards when agents are loaded", async () => {
    mockFetchAgents.mockResolvedValue(sampleAgents);
    const { getByText, getByTestId } = render(
      <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("agents-list-screen")).toBeTruthy();
    });

    expect(getByText("Content Planner")).toBeTruthy();
    expect(getByText("Research Agent")).toBeTruthy();
  });

  it("renders the AGENTS section header", async () => {
    mockFetchAgents.mockResolvedValue(sampleAgents);
    const { getByText } = render(
      <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByText("Agents")).toBeTruthy();
    });
  });

  it("navigates to AgentDetail on card press", async () => {
    mockFetchAgents.mockResolvedValue(sampleAgents);
    const { getByTestId } = render(
      <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("agent-card-a-1")).toBeTruthy();
    });

    fireEvent.press(getByTestId("agent-card-a-1"));
    expect(mockNavigation.navigate).toHaveBeenCalledWith("AgentDetail", {
      agentId: "a-1",
    });
  });

  it("shows question with options on waiting_input agent", async () => {
    mockFetchAgents.mockResolvedValue(sampleAgents);
    const { getByText } = render(
      <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByText("Which approach?")).toBeTruthy();
    });

    expect(getByText("Approach A")).toBeTruthy();
    expect(getByText("Approach B")).toBeTruthy();
  });

  it("sends answer when option is tapped", async () => {
    mockFetchAgents.mockResolvedValue(sampleAgents);
    mockAnswerQuestion.mockResolvedValue(undefined);
    const { getByText } = render(
      <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByText("Approach A")).toBeTruthy();
    });

    fireEvent.press(getByText("Approach A"));
    expect(mockAnswerQuestion).toHaveBeenCalledWith("a-2", "q-1", "Approach A");
  });

  it("retries fetch on retry button press", async () => {
    mockFetchAgents.mockRejectedValueOnce(new Error("Network error"));
    const { getByTestId } = render(
      <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
    );

    await waitFor(() => {
      expect(getByTestId("agents-error")).toBeTruthy();
    });

    mockFetchAgents.mockResolvedValue(sampleAgents);
    fireEvent.press(getByTestId("agents-retry-button"));

    // fetchAgents called again on retry
    expect(mockFetchAgents).toHaveBeenCalledTimes(2);
  });

  // --- MOB-005: Quick answer integration tests ---

  describe("MOB-005: Answer flow", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("sends answer to API and clears question after delay", async () => {
      mockFetchAgents.mockResolvedValue(sampleAgents);
      mockAnswerQuestion.mockResolvedValue(undefined);

      const { getByText, queryByText } = render(
        <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByText("Approach A")).toBeTruthy();
      });

      // Tap an option
      fireEvent.press(getByText("Approach A"));

      // API should be called
      expect(mockAnswerQuestion).toHaveBeenCalledWith("a-2", "q-1", "Approach A");

      // Resolve the API call
      await act(async () => {
        await Promise.resolve();
      });

      // Question should still show (for the "Answered" confirmation) before timeout
      expect(getByText("Which approach?")).toBeTruthy();

      // Advance timer to trigger the delayed clear
      act(() => {
        jest.advanceTimersByTime(800);
      });

      // After the delay, the question should be cleared
      await waitFor(() => {
        expect(queryByText("Which approach?")).toBeNull();
      });
    });

    it("re-fetches agents on API failure", async () => {
      mockFetchAgents.mockResolvedValue(sampleAgents);
      mockAnswerQuestion.mockRejectedValue(new Error("Server error"));

      const { getByText } = render(
        <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByText("Approach A")).toBeTruthy();
      });

      fireEvent.press(getByText("Approach A"));

      // Wait for the rejected promise to trigger refresh
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve(); // extra tick for catch handler
      });

      // fetchAgents should have been called again (initial + refresh)
      expect(mockFetchAgents).toHaveBeenCalledTimes(2);
    });
  });

  // --- MOB-012: Permission response integration tests ---

  describe("MOB-012: Permission response flow", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("renders permission prompt on agent card", async () => {
      mockFetchAgents.mockResolvedValue(sampleAgentsWithPermission);
      const { getByText, getByTestId } = render(
        <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByTestId("agent-card-a-3")).toBeTruthy();
      });

      expect(getByText(/Read Desktop/)).toBeTruthy();
      expect(getByText("Allow")).toBeTruthy();
      expect(getByText("Deny")).toBeTruthy();
    });

    it("sends permission response to API when Allow is tapped", async () => {
      mockFetchAgents.mockResolvedValue(sampleAgentsWithPermission);
      mockRespondToPermission.mockResolvedValue(undefined);
      const { getByTestId } = render(
        <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByTestId("agent-card-a-3-permission-allow")).toBeTruthy();
      });

      fireEvent.press(getByTestId("agent-card-a-3-permission-allow"));
      expect(mockRespondToPermission).toHaveBeenCalledWith("a-3", "perm-1", true);
    });

    it("sends permission response to API when Deny is tapped", async () => {
      mockFetchAgents.mockResolvedValue(sampleAgentsWithPermission);
      mockRespondToPermission.mockResolvedValue(undefined);
      const { getByTestId } = render(
        <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByTestId("agent-card-a-3-permission-deny")).toBeTruthy();
      });

      fireEvent.press(getByTestId("agent-card-a-3-permission-deny"));
      expect(mockRespondToPermission).toHaveBeenCalledWith("a-3", "perm-1", false);
    });

    it("clears permission after delay on successful API response", async () => {
      mockFetchAgents.mockResolvedValue(sampleAgentsWithPermission);
      mockRespondToPermission.mockResolvedValue(undefined);

      const { getByTestId, queryByTestId } = render(
        <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByTestId("agent-card-a-3-permission-allow")).toBeTruthy();
      });

      fireEvent.press(getByTestId("agent-card-a-3-permission-allow"));

      // Resolve the API call
      await act(async () => {
        await Promise.resolve();
      });

      // Permission section should still show (for "Allowed" confirmation)
      expect(getByTestId("agent-card-a-3-permission")).toBeTruthy();

      // Advance timer to trigger the delayed clear
      act(() => {
        jest.advanceTimersByTime(800);
      });

      // After the delay, the permission section should be cleared
      await waitFor(() => {
        expect(queryByTestId("agent-card-a-3-permission")).toBeNull();
      });
    });

    it("re-fetches agents on API failure for permission response", async () => {
      mockFetchAgents.mockResolvedValue(sampleAgentsWithPermission);
      mockRespondToPermission.mockRejectedValue(new Error("Server error"));

      const { getByTestId } = render(
        <AgentsListScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByTestId("agent-card-a-3-permission-allow")).toBeTruthy();
      });

      fireEvent.press(getByTestId("agent-card-a-3-permission-allow"));

      // Wait for the rejected promise to trigger refresh
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve(); // extra tick for catch handler
      });

      // fetchAgents should have been called again (initial + refresh)
      expect(mockFetchAgents).toHaveBeenCalledTimes(2);
    });
  });
});
