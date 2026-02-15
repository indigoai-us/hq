/**
 * Tests for useAgentDetail hook.
 * Covers: loading, error, real-time message updates, permission responses,
 * sending messages (optimistic), answering questions (optimistic).
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";

// --- Mocks ---
const mockFetchAgent = jest.fn();
const mockFetchAgentMessages = jest.fn();
const mockRespondToPermission = jest.fn();
const mockSendMessage = jest.fn();
const mockAnswerQuestion = jest.fn();
const mockSubscribe = jest.fn();

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

import { useAgentDetail } from "../../src/hooks/useAgentDetail";
import type { Agent, AgentMessage } from "../../src/types";

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

describe("useAgentDetail", () => {
  let wsListeners: Map<string, (event: unknown) => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    wsListeners = new Map();

    mockFetchAgent.mockResolvedValue(mockAgent);
    mockFetchAgentMessages.mockResolvedValue(mockMessages);
    mockRespondToPermission.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);
    mockAnswerQuestion.mockResolvedValue(undefined);

    // Capture WebSocket event listeners
    mockSubscribe.mockImplementation((eventType: string, listener: (event: unknown) => void) => {
      wsListeners.set(eventType, listener);
      return jest.fn(); // unsubscribe
    });
  });

  it("should load agent and messages on mount", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.agent).toBeNull();
    expect(result.current.messages).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent).toEqual(mockAgent);
    expect(result.current.messages).toEqual(mockMessages);
    expect(result.current.error).toBeNull();
    expect(mockFetchAgent).toHaveBeenCalledWith("agent-1");
    expect(mockFetchAgentMessages).toHaveBeenCalledWith("agent-1");
  });

  it("should handle fetch errors", async () => {
    mockFetchAgent.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.agent).toBeNull();
  });

  it("should handle non-Error fetch failures", async () => {
    mockFetchAgent.mockRejectedValue("Unknown failure");

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load agent details");
  });

  it("should add new messages from WebSocket", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Simulate new message via WebSocket
    const messageListener = wsListeners.get("agent:message");
    expect(messageListener).toBeDefined();

    act(() => {
      messageListener!({
        type: "agent:message",
        timestamp: "2026-02-08T10:05:00Z",
        payload: {
          agentId: "agent-1",
          messageId: "msg-4",
          role: "agent",
          content: "Now let me explore your website.",
        },
      });
    });

    expect(result.current.messages).toHaveLength(4);
    expect(result.current.messages[3].id).toBe("msg-4");
    expect(result.current.messages[3].content).toBe("Now let me explore your website.");
  });

  it("should ignore messages for other agents", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const messageListener = wsListeners.get("agent:message");

    act(() => {
      messageListener!({
        type: "agent:message",
        timestamp: "2026-02-08T10:05:00Z",
        payload: {
          agentId: "other-agent",
          messageId: "msg-other",
          role: "agent",
          content: "This is for another agent",
        },
      });
    });

    expect(result.current.messages).toHaveLength(3);
  });

  it("should not add duplicate messages", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const messageListener = wsListeners.get("agent:message");

    // Send same message ID twice
    act(() => {
      messageListener!({
        type: "agent:message",
        timestamp: "2026-02-08T10:05:00Z",
        payload: {
          agentId: "agent-1",
          messageId: "msg-1", // duplicate
          role: "agent",
          content: "Duplicate message",
        },
      });
    });

    expect(result.current.messages).toHaveLength(3);
  });

  it("should update agent from WebSocket events", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const updateListener = wsListeners.get("agent:updated");
    expect(updateListener).toBeDefined();

    act(() => {
      updateListener!({
        type: "agent:updated",
        timestamp: "2026-02-08T10:05:00Z",
        payload: {
          agentId: "agent-1",
          changes: { status: "waiting_input" },
        },
      });
    });

    expect(result.current.agent?.status).toBe("waiting_input");
  });

  it("should ignore updates for other agents", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const updateListener = wsListeners.get("agent:updated");

    act(() => {
      updateListener!({
        type: "agent:updated",
        timestamp: "2026-02-08T10:05:00Z",
        payload: {
          agentId: "other-agent",
          changes: { status: "error" },
        },
      });
    });

    expect(result.current.agent?.status).toBe("running");
  });

  it("should handle permission responses", async () => {
    const agentWithPermission: Agent = {
      ...mockAgent,
      currentPermission: {
        id: "perm-1",
        tool: "Run",
        description: "cd /Users/janecooper/Desktop/portfolio",
        requestedAt: "2026-02-08T10:03:00Z",
      },
    };
    mockFetchAgent.mockResolvedValue(agentWithPermission);

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent?.currentPermission).toBeDefined();

    // Allow the permission
    await act(async () => {
      result.current.handlePermissionResponse("perm-1", true);
    });

    await waitFor(() => {
      expect(result.current.permissionSending).toBe(false);
    });

    expect(mockRespondToPermission).toHaveBeenCalledWith("agent-1", "perm-1", true);
    expect(result.current.agent?.currentPermission).toBeUndefined();
  });

  it("should subscribe to WebSocket events", async () => {
    renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    const subscribedEvents = mockSubscribe.mock.calls.map((call: unknown[]) => call[0]);
    expect(subscribedEvents).toContain("agent:message");
    expect(subscribedEvents).toContain("agent:updated");
  });

  // --- Send message (MOB-007) ---

  it("should send a message optimistically", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.handleSendMessage("Hello agent");
    });

    // Message appears immediately (optimistic)
    expect(result.current.messages).toHaveLength(4);
    expect(result.current.messages[3].role).toBe("user");
    expect(result.current.messages[3].content).toBe("Hello agent");

    await waitFor(() => {
      expect(result.current.messageSending).toBe(false);
    });

    expect(mockSendMessage).toHaveBeenCalledWith("agent-1", "Hello agent");
  });

  it("should not send empty message", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.handleSendMessage("");
    });

    expect(result.current.messages).toHaveLength(3);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("should not send whitespace-only message", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.handleSendMessage("   ");
    });

    expect(result.current.messages).toHaveLength(3);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("should remove optimistic message on send failure", async () => {
    mockSendMessage.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.handleSendMessage("This will fail");
    });

    await waitFor(() => {
      expect(result.current.messageSending).toBe(false);
    });

    // Optimistic message should be removed
    expect(result.current.messages).toHaveLength(3);
  });

  it("should set messageSending during send", async () => {
    let resolvePromise: () => void;
    mockSendMessage.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.handleSendMessage("Hello");
    });

    expect(result.current.messageSending).toBe(true);

    await act(async () => {
      resolvePromise!();
    });

    await waitFor(() => {
      expect(result.current.messageSending).toBe(false);
    });
  });

  // --- Answer question (MOB-007) ---

  it("should answer a question optimistically", async () => {
    const agentWithQuestion: Agent = {
      ...mockAgent,
      status: "waiting_input",
      currentQuestion: {
        id: "q-1",
        text: "Which task?",
        options: ["Option A", "Option B"],
        askedAt: "2026-02-08T10:03:00Z",
      },
    };
    mockFetchAgent.mockResolvedValue(agentWithQuestion);

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent?.currentQuestion).toBeDefined();

    await act(async () => {
      result.current.handleAnswerQuestion("q-1", "Option A");
    });

    // Answer appears as user message immediately
    expect(result.current.messages).toHaveLength(4);
    expect(result.current.messages[3].role).toBe("user");
    expect(result.current.messages[3].content).toBe("Option A");

    // Question cleared optimistically
    expect(result.current.agent?.currentQuestion).toBeUndefined();

    await waitFor(() => {
      expect(result.current.answerSending).toBe(false);
    });

    expect(mockAnswerQuestion).toHaveBeenCalledWith("agent-1", "q-1", "Option A");
  });

  it("should remove optimistic answer on failure", async () => {
    mockAnswerQuestion.mockRejectedValue(new Error("Network error"));

    const agentWithQuestion: Agent = {
      ...mockAgent,
      status: "waiting_input",
      currentQuestion: {
        id: "q-1",
        text: "Which task?",
        options: ["Option A"],
        askedAt: "2026-02-08T10:03:00Z",
      },
    };
    mockFetchAgent.mockResolvedValue(agentWithQuestion);

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.handleAnswerQuestion("q-1", "Option A");
    });

    await waitFor(() => {
      expect(result.current.answerSending).toBe(false);
    });

    // Optimistic message removed
    expect(result.current.messages).toHaveLength(3);
  });

  it("should initialize messageSending as false", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    expect(result.current.messageSending).toBe(false);
    expect(result.current.answerSending).toBe(false);
  });
});
