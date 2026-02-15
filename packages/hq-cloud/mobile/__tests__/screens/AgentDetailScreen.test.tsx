/**
 * Tests for AgentDetailScreen.
 * Covers: loading, error, empty, chat rendering, permission prompt, navigation header,
 * chat input, quick-reply options.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";
import { AgentDetailScreen } from "../../src/screens/AgentDetailScreen";
import type { Agent, AgentMessage } from "../../src/types";

// --- Mocks ---
const mockFetchAgent = jest.fn();
const mockFetchAgentMessages = jest.fn();
const mockRespondToPermission = jest.fn();
const mockSendMessage = jest.fn();
const mockAnswerQuestion = jest.fn();
const mockSubscribe = jest.fn(() => jest.fn());

jest.mock("../../src/services/agents", () => ({
  fetchAgent: (...args: unknown[]) => mockFetchAgent(...args),
  fetchAgentMessages: (...args: unknown[]) => mockFetchAgentMessages(...args),
  respondToPermission: (...args: unknown[]) => mockRespondToPermission(...args),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  answerQuestion: (...args: unknown[]) => mockAnswerQuestion(...args),
}));

jest.mock("../../src/contexts/WebSocketContext", () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    connectionStatus: "connected",
    isConnected: true,
    reconnect: jest.fn(),
  }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
  },
}));

// --- Test Data ---
const mockAgent: Agent = {
  id: "agent-1",
  name: "Social Writer",
  type: "content",
  status: "running",
  progress: { completed: 3, total: 6 },
  lastActivity: "2026-02-08T10:00:00Z",
};

const mockMessages: AgentMessage[] = [
  {
    id: "msg-1",
    role: "agent",
    content: "I'll help you build a comprehensive brand management system.",
    timestamp: "2026-02-08T10:00:00Z",
  },
  {
    id: "msg-2",
    role: "tool",
    content: "",
    toolName: "Explore HQ knowledge structure",
    toolStatus: "completed",
    timestamp: "2026-02-08T10:01:00Z",
  },
  {
    id: "msg-3",
    role: "user",
    content: "Sounds good, please proceed.",
    timestamp: "2026-02-08T10:02:00Z",
  },
];

// Mock navigation props
const mockSetOptions = jest.fn();
const createMockProps = (agentId = "agent-1") =>
  ({
    route: {
      params: { agentId },
      key: "AgentDetail-1",
      name: "AgentDetail" as const,
    },
    navigation: {
      setOptions: mockSetOptions,
      goBack: jest.fn(),
      navigate: jest.fn(),
      dispatch: jest.fn(),
      reset: jest.fn(),
      isFocused: jest.fn(),
      canGoBack: jest.fn(),
      getId: jest.fn(),
      getParent: jest.fn(),
      getState: jest.fn(),
      setParams: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      replace: jest.fn(),
      push: jest.fn(),
      pop: jest.fn(),
      popToTop: jest.fn(),
      popTo: jest.fn(),
    },
  }) as unknown as React.ComponentProps<typeof AgentDetailScreen>;

describe("AgentDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchAgent.mockResolvedValue(mockAgent);
    mockFetchAgentMessages.mockResolvedValue(mockMessages);
    mockRespondToPermission.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);
    mockAnswerQuestion.mockResolvedValue(undefined);
  });

  it("should show loading state initially", () => {
    // Make fetch hang to keep loading
    mockFetchAgent.mockReturnValue(new Promise(() => {}));
    mockFetchAgentMessages.mockReturnValue(new Promise(() => {}));

    render(<AgentDetailScreen {...createMockProps()} />);

    expect(screen.getByTestId("agent-detail-loading")).toBeTruthy();
    expect(screen.getByText("Loading conversation...")).toBeTruthy();
  });

  it("should show error state on fetch failure", async () => {
    mockFetchAgent.mockRejectedValue(new Error("Network error"));

    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("agent-detail-error")).toBeTruthy();
    });

    expect(screen.getByText("Network error")).toBeTruthy();
  });

  it("should render agent status bar after loading", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("agent-status-bar")).toBeTruthy();
    });

    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("3/6 tasks")).toBeTruthy();
  });

  it("should update navigation title to agent name", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(mockSetOptions).toHaveBeenCalledWith({ title: "Social Writer" });
    });
  });

  it("should render message list", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("message-list")).toBeTruthy();
    });

    expect(screen.getByTestId("message-msg-1")).toBeTruthy();
    expect(screen.getByTestId("message-msg-2")).toBeTruthy();
    expect(screen.getByTestId("message-msg-3")).toBeTruthy();
  });

  it("should render agent message content", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(
        screen.getByText("I'll help you build a comprehensive brand management system."),
      ).toBeTruthy();
    });
  });

  it("should render tool execution block", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByText("Explore HQ knowledge structure")).toBeTruthy();
    });

    expect(screen.getByText("Task")).toBeTruthy();
  });

  it("should render user message", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByText("Sounds good, please proceed.")).toBeTruthy();
    });
  });

  it("should show empty state when no messages", async () => {
    mockFetchAgentMessages.mockResolvedValue([]);

    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByText("No messages yet")).toBeTruthy();
    });

    expect(screen.getByText("Agent activity will appear here")).toBeTruthy();
  });

  it("should show permission prompt when agent has pending permission", async () => {
    const agentWithPerm: Agent = {
      ...mockAgent,
      currentPermission: {
        id: "perm-1",
        tool: "Run",
        description: "cd /Users/janecooper/Desktop/portfolio",
        requestedAt: "2026-02-08T10:03:00Z",
      },
    };
    mockFetchAgent.mockResolvedValue(agentWithPerm);

    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("permission-prompt")).toBeTruthy();
    });
  });

  it("should not show permission prompt when no pending permission", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("agent-detail-screen")).toBeTruthy();
    });

    expect(screen.queryByTestId("permission-prompt")).toBeNull();
  });

  it("should render the main container", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("agent-detail-screen")).toBeTruthy();
    });
  });

  it("should fetch agent data for the correct agentId", async () => {
    render(<AgentDetailScreen {...createMockProps("agent-42")} />);

    await waitFor(() => {
      expect(mockFetchAgent).toHaveBeenCalledWith("agent-42");
      expect(mockFetchAgentMessages).toHaveBeenCalledWith("agent-42");
    });
  });

  // --- Chat input (MOB-007) ---

  it("should render chat input after loading", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-input")).toBeTruthy();
    });
  });

  it("should render chat input with text field", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-input-input")).toBeTruthy();
    });
  });

  it("should render send button", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-input-send")).toBeTruthy();
    });
  });

  it("should show quick-reply options when agent has question with options", async () => {
    const agentWithQuestion: Agent = {
      ...mockAgent,
      status: "waiting_input",
      currentQuestion: {
        id: "q-1",
        text: "Which task do you want to work on?",
        options: ["Task A", "Task B"],
        askedAt: "2026-02-08T10:03:00Z",
      },
    };
    mockFetchAgent.mockResolvedValue(agentWithQuestion);

    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-input-options")).toBeTruthy();
    });

    expect(screen.getByTestId("chat-input-option-Task A")).toBeTruthy();
    expect(screen.getByTestId("chat-input-option-Task B")).toBeTruthy();
  });

  it("should not show quick-reply options when no question", async () => {
    render(<AgentDetailScreen {...createMockProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-input")).toBeTruthy();
    });

    expect(screen.queryByTestId("chat-input-options")).toBeNull();
  });
});
