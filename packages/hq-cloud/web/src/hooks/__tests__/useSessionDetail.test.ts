import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSessionDetail } from "../useSessionDetail";
import type { Session, SessionMessage } from "@/types/session";
import type { ServerEvent, ServerEventType, EventListener } from "@/types/websocket";
import { fetchSession, fetchSessionMessages } from "@/services/sessions";

// Mock services
vi.mock("@/services/sessions", () => ({
  fetchSession: vi.fn(),
  fetchSessionMessages: vi.fn(),
}));

// Mock WebSocket context
const mockListeners = new Map<string, Set<EventListener>>();

function mockSubscribe<T>(type: ServerEventType, listener: EventListener<T>): () => void {
  if (!mockListeners.has(type)) mockListeners.set(type, new Set());
  const typed = listener as EventListener;
  mockListeners.get(type)!.add(typed);
  return () => mockListeners.get(type)?.delete(typed);
}

function emitEvent<T>(type: ServerEventType, payload: T) {
  const event: ServerEvent<T> = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
  const listeners = mockListeners.get(type);
  if (listeners) {
    for (const listener of listeners) {
      listener(event as ServerEvent);
    }
  }
}

const mockSend = vi.fn();

vi.mock("@/contexts/WebSocketContext", () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    send: mockSend,
    isConnected: true,
  }),
}));

const mockFetchSession = fetchSession as ReturnType<typeof vi.fn>;
const mockFetchSessionMessages = fetchSessionMessages as ReturnType<typeof vi.fn>;

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: "sess-1",
    userId: "user-1",
    status: "active",
    ecsTaskArn: null,
    initialPrompt: "Help me build a feature",
    workerContext: null,
    messageCount: 0,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    stoppedAt: null,
    error: null,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<SessionMessage> = {}): SessionMessage {
  return {
    sessionId: "sess-1",
    sequence: 1,
    timestamp: new Date().toISOString(),
    type: "assistant",
    content: "Hello",
    metadata: {},
    ...overrides,
  };
}

describe("useSessionDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListeners.clear();
    mockSend.mockClear();
    mockFetchSession.mockResolvedValue(makeSession());
    mockFetchSessionMessages.mockResolvedValue([]);
  });

  it("loads session and messages on mount", async () => {
    const msgs = [makeMessage({ content: "Hello" }), makeMessage({ sequence: 2, content: "World" })];
    mockFetchSession.mockResolvedValue(makeSession());
    mockFetchSessionMessages.mockResolvedValue(msgs);

    const { result } = renderHook(() => useSessionDetail("sess-1"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.session?.sessionId).toBe("sess-1");
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("sets error when fetch fails", async () => {
    mockFetchSession.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
  });

  it("adds optimistic message", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addOptimisticMessage("user", "Test message");
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].type).toBe("user");
    expect(result.current.messages[0].content).toBe("Test message");
  });

  it("handles session_message event for assistant", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      emitEvent("session_message", {
        sessionId: "sess-1",
        messageType: "assistant",
        content: "Here is the answer",
        raw: undefined,
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].type).toBe("assistant");
    expect(result.current.messages[0].content).toBe("Here is the answer");
    // Streaming should be cleared
    expect(result.current.streaming.active).toBe(false);
  });

  it("ignores session_message events for other sessions", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      emitEvent("session_message", {
        sessionId: "sess-other",
        messageType: "assistant",
        content: "Not for me",
      });
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it("accumulates streaming text from stream events", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      emitEvent("session_stream", {
        sessionId: "sess-1",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello " },
        },
      });
    });

    expect(result.current.streaming.active).toBe(true);
    expect(result.current.streaming.text).toBe("Hello ");

    act(() => {
      emitEvent("session_stream", {
        sessionId: "sess-1",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "world" },
        },
      });
    });

    expect(result.current.streaming.text).toBe("Hello world");
  });

  it("resets streaming on content_block_start", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // First, add some streaming text
    act(() => {
      emitEvent("session_stream", {
        sessionId: "sess-1",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "old text" },
        },
      });
    });

    expect(result.current.streaming.text).toBe("old text");

    // Reset via content_block_start
    act(() => {
      emitEvent("session_stream", {
        sessionId: "sess-1",
        event: { type: "content_block_start" },
      });
    });

    expect(result.current.streaming.text).toBe("");
    expect(result.current.streaming.active).toBe(true);
  });

  it("handles permission request events", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      emitEvent("session_permission_request", {
        sessionId: "sess-1",
        requestId: "req-1",
        toolName: "Read",
        input: { file_path: "/test.ts" },
      });
    });

    expect(result.current.permissions).toHaveLength(1);
    expect(result.current.permissions[0].toolName).toBe("Read");
    expect(result.current.permissions[0].requestId).toBe("req-1");
  });

  it("resolves permissions on permission_resolved event", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Add a permission
    act(() => {
      emitEvent("session_permission_request", {
        sessionId: "sess-1",
        requestId: "req-1",
        toolName: "Read",
        input: {},
      });
    });

    expect(result.current.permissions).toHaveLength(1);

    // Resolve it
    act(() => {
      emitEvent("session_permission_resolved", {
        sessionId: "sess-1",
        requestId: "req-1",
        behavior: "allow",
      });
    });

    expect(result.current.permissions).toHaveLength(0);
  });

  it("resolves permissions via resolvePermission callback", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      emitEvent("session_permission_request", {
        sessionId: "sess-1",
        requestId: "req-1",
        toolName: "Bash",
        input: {},
      });
    });

    expect(result.current.permissions).toHaveLength(1);

    act(() => {
      result.current.resolvePermission("req-1");
    });

    expect(result.current.permissions).toHaveLength(0);
  });

  it("handles tool_progress events", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      emitEvent("session_tool_progress", {
        sessionId: "sess-1",
        toolUseId: "tool-1",
        progress: { message: "Reading file..." },
      });
    });

    expect(result.current.toolProgress).toBeTruthy();
    expect(result.current.toolProgress?.message).toBe("Reading file...");
  });

  it("clears streaming and tool progress on session_result", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Set streaming and progress
    act(() => {
      emitEvent("session_stream", {
        sessionId: "sess-1",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "partial" },
        },
      });
      emitEvent("session_tool_progress", {
        sessionId: "sess-1",
        progress: { message: "Working..." },
      });
    });

    expect(result.current.streaming.active).toBe(true);
    expect(result.current.toolProgress).toBeTruthy();

    // Session result clears both
    act(() => {
      emitEvent("session_result", {
        sessionId: "sess-1",
        result: { type: "success", duration_ms: 1000 },
      });
    });

    expect(result.current.streaming.active).toBe(false);
    expect(result.current.streaming.text).toBe("");
    expect(result.current.toolProgress).toBeNull();
  });

  it("updates session status from session_status event", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      emitEvent("session_status", {
        sessionId: "sess-1",
        status: "stopped",
      });
    });

    expect(result.current.session?.status).toBe("stopped");
  });

  it("maps waiting status to active", async () => {
    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      emitEvent("session_status", {
        sessionId: "sess-1",
        status: "waiting",
      });
    });

    expect(result.current.session?.status).toBe("active");
  });

  it("parses content blocks from raw assistant messages", async () => {
    const rawMessage: SessionMessage = {
      sessionId: "sess-1",
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: "assistant",
      content: "Let me read that file.",
      metadata: {
        raw: {
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Let me read that file." },
              { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/test.ts" } },
            ],
          },
        },
      },
    };

    mockFetchSessionMessages.mockResolvedValue([rawMessage]);

    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.messages[0].contentBlocks).toBeTruthy();
    expect(result.current.messages[0].contentBlocks).toHaveLength(2);
    expect(result.current.messages[0].contentBlocks![0].type).toBe("text");
    expect(result.current.messages[0].contentBlocks![1].type).toBe("tool_use");
  });

  it("determines hasOlderMessages based on page size", async () => {
    // Return less than PAGE_SIZE (50) messages
    const msgs = Array.from({ length: 10 }, (_, i) => makeMessage({ sequence: i + 1 }));
    mockFetchSessionMessages.mockResolvedValue(msgs);

    const { result } = renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasOlderMessages).toBe(false);
  });
});
