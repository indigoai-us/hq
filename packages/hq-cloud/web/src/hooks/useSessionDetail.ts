"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  Session,
  SessionMessage,
  SessionPermissionRequest,
  ToolProgress,
  ContentBlock,
} from "@/types/session";
import type {
  SessionStatusPayload,
  SessionMessagePayload,
  SessionPermissionRequestPayload,
  SessionPermissionResolvedPayload,
  SessionStreamPayload,
  SessionResultPayload,
  SessionToolProgressPayload,
} from "@/types/websocket";
import { fetchSession, fetchSessionMessages } from "@/services/sessions";
import { useWebSocket } from "@/contexts/WebSocketContext";

interface StreamingContent {
  /** Accumulated text from stream events */
  text: string;
  /** Whether streaming is currently active */
  active: boolean;
}

/**
 * Parse raw assistant message into content blocks.
 * The raw data from the Claude Code NDJSON protocol has message.content as an array of blocks.
 */
function parseContentBlocks(raw: Record<string, unknown> | undefined): ContentBlock[] | undefined {
  if (!raw) return undefined;

  // The raw assistant message has: { message: { role: 'assistant', content: [...blocks] } }
  const message = raw.message as Record<string, unknown> | undefined;
  if (!message) {
    // Maybe the raw itself has a content array
    const content = raw.content;
    if (Array.isArray(content)) {
      return parseBlockArray(content);
    }
    return undefined;
  }

  const content = message.content;
  if (!Array.isArray(content)) return undefined;

  return parseBlockArray(content);
}

function parseBlockArray(blocks: unknown[]): ContentBlock[] | undefined {
  const result: ContentBlock[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;

    switch (b.type) {
      case "text":
        if (typeof b.text === "string") {
          result.push({ type: "text", text: b.text });
        }
        break;
      case "tool_use":
        result.push({
          type: "tool_use",
          id: String(b.id ?? ""),
          name: String(b.name ?? "unknown"),
          input: (b.input as Record<string, unknown>) ?? {},
        });
        break;
      case "tool_result":
        result.push({
          type: "tool_result",
          tool_use_id: String(b.tool_use_id ?? ""),
          content: typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? ""),
          is_error: b.is_error === true,
        });
        break;
      case "thinking":
        if (typeof b.thinking === "string") {
          result.push({ type: "thinking", thinking: b.thinking });
        }
        break;
    }
  }

  return result.length > 0 ? result : undefined;
}

const STARTUP_TIMEOUT_MS = 210_000; // 3.5 min — longer than server's 3 min to let server errors propagate first
const THINKING_STALE_MS = 60_000; // 60s — after this, show "taking longer than expected"

export interface ThinkingState {
  /** Whether we're expecting a response from Claude */
  active: boolean;
  /** True if no events received for THINKING_STALE_MS — session may be stuck */
  stale: boolean;
}

export function useSessionDetail(sessionId: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [permissions, setPermissions] = useState<SessionPermissionRequest[]>([]);
  const [streaming, setStreaming] = useState<StreamingContent>({ text: "", active: false });
  const [toolProgress, setToolProgress] = useState<ToolProgress | null>(null);
  const [thinking, setThinking] = useState<ThinkingState>({ active: false, stale: false });
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startupTimedOut, setStartupTimedOut] = useState(false);
  const { subscribe, send, isConnected } = useWebSocket();
  const wsRef = useRef(subscribe);
  wsRef.current = subscribe;
  const lastEventRef = useRef<number>(Date.now());
  const PAGE_SIZE = 50;

  // Track activity from container — any event resets staleness
  const touchActivity = useCallback(() => {
    lastEventRef.current = Date.now();
    setThinking((prev) => prev.stale ? { active: true, stale: false } : prev);
  }, []);

  // Start thinking — called when we send a message or grant a permission
  const startThinking = useCallback(() => {
    lastEventRef.current = Date.now();
    setThinking({ active: true, stale: false });
  }, []);

  // Stop thinking — called when we get a response signal
  const stopThinking = useCallback(() => {
    setThinking({ active: false, stale: false });
  }, []);

  // Staleness timer — check every 10s if thinking has gone stale
  useEffect(() => {
    if (!thinking.active || thinking.stale) return;

    const timer = setInterval(() => {
      if (Date.now() - lastEventRef.current > THINKING_STALE_MS) {
        setThinking({ active: true, stale: true });
      }
    }, 10_000);

    return () => clearInterval(timer);
  }, [thinking.active, thinking.stale]);

  // Load session and messages
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [s, msgs] = await Promise.all([
          fetchSession(sessionId),
          fetchSessionMessages(sessionId, { limit: PAGE_SIZE }),
        ]);
        if (!mounted) return;
        setSession(s);

        // Parse content blocks from raw metadata for assistant messages
        const enriched = msgs.map((msg) => ({
          ...msg,
          contentBlocks: msg.type === "assistant" ? parseContentBlocks(msg.metadata?.raw as Record<string, unknown>) : undefined,
        }));

        setMessages(enriched);
        setHasOlderMessages(msgs.length >= PAGE_SIZE);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load session");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  // Load older messages (pagination)
  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasOlderMessages || messages.length === 0) return;
    setLoadingOlder(true);

    try {
      const oldestSequence = messages[0]?.sequence;
      const older = await fetchSessionMessages(sessionId, {
        limit: PAGE_SIZE,
        before: oldestSequence,
      });

      if (older.length < PAGE_SIZE) {
        setHasOlderMessages(false);
      }

      const enriched = older.map((msg) => ({
        ...msg,
        contentBlocks: msg.type === "assistant" ? parseContentBlocks(msg.metadata?.raw as Record<string, unknown>) : undefined,
      }));

      setMessages((prev) => [...enriched, ...prev]);
    } catch {
      // Silent failure for pagination
    } finally {
      setLoadingOlder(false);
    }
  }, [sessionId, loadingOlder, hasOlderMessages, messages]);

  // Startup safety timeout — if session stays in 'starting' too long, flag it
  useEffect(() => {
    if (!session || session.status !== "starting") {
      setStartupTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setStartupTimedOut(true);
    }, STARTUP_TIMEOUT_MS);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, session?.sessionId]);

  // Subscribe to session via WebSocket
  useEffect(() => {
    if (!isConnected) return;

    // Subscribe to this session's relay via the global WebSocket
    send({ type: "session_subscribe", payload: { sessionId } });

    const unsubs: (() => void)[] = [];

    // Session status changes
    unsubs.push(
      wsRef.current<SessionStatusPayload>("session_status", (event) => {
        if (event.payload.sessionId !== sessionId) return;
        setSession((prev) => {
          if (!prev) return prev;
          const { status, error: sessionError, lastActivityAt, startupPhase, startupTimestamp } = event.payload;

          // Map WebSocket status to SessionStatus
          const mappedStatus = status === "waiting" ? "active" as const : status as Session["status"];

          return {
            ...prev,
            status: mappedStatus,
            ...(sessionError !== undefined ? { error: sessionError } : {}),
            ...(lastActivityAt ? { lastActivityAt } : {}),
            ...(startupPhase !== undefined ? { startupPhase } : {}),
            ...(startupTimestamp !== undefined ? { startupTimestamp } : {}),
          };
        });

        // Load pending permissions from status
        if (event.payload.pendingPermissions) {
          setPermissions(
            event.payload.pendingPermissions
              .filter((p): p is { requestId: string; toolName: string; input: Record<string, unknown> } => !!p.toolName)
              .map((p) => ({
                requestId: p.requestId,
                toolName: p.toolName,
                input: p.input ?? {},
              })),
          );
        }
      }),
    );

    // Session messages (user + assistant full messages)
    unsubs.push(
      wsRef.current<SessionMessagePayload>("session_message", (event) => {
        if (event.payload.sessionId !== sessionId) return;

        // Clear streaming/thinking when we get the full assistant message
        if (event.payload.messageType === "assistant") {
          setStreaming({ text: "", active: false });
          setToolProgress(null);
          stopThinking();
        }
        touchActivity();

        const contentBlocks = event.payload.messageType === "assistant"
          ? parseContentBlocks(event.payload.raw)
          : undefined;

        const msg: SessionMessage = {
          sessionId,
          sequence: Date.now(), // Temporary sequence
          timestamp: new Date().toISOString(),
          type: event.payload.messageType,
          content: event.payload.content,
          metadata: event.payload.raw ? { raw: event.payload.raw } : {},
          contentBlocks,
        };

        setMessages((prev) => [...prev, msg]);
        setSession((prev) => prev ? { ...prev, lastActivityAt: new Date().toISOString() } : prev);
      }),
    );

    // Streaming tokens
    unsubs.push(
      wsRef.current<SessionStreamPayload>("session_stream", (event) => {
        if (event.payload.sessionId !== sessionId) return;
        const streamEvent = event.payload.event;

        // Handle content_block_delta from Claude Code stream
        if (streamEvent.type === "content_block_delta") {
          const delta = streamEvent.delta as Record<string, unknown> | undefined;
          const deltaText = delta?.text;
          if (delta && delta.type === "text_delta" && typeof deltaText === "string") {
            setStreaming((prev) => ({
              text: prev.text + deltaText,
              active: true,
            }));
          }
        }

        // Handle content_block_start — reset streaming for new block
        if (streamEvent.type === "content_block_start") {
          setStreaming({ text: "", active: true });
          stopThinking(); // streaming takes over as the visible indicator
        }
        touchActivity();

        // Handle content_block_stop — finalize block
        if (streamEvent.type === "content_block_stop") {
          // Keep streaming text visible until the full message arrives
        }
      }),
    );

    // Tool progress
    unsubs.push(
      wsRef.current<SessionToolProgressPayload>("session_tool_progress", (event) => {
        if (event.payload.sessionId !== sessionId) return;
        setToolProgress({
          toolUseId: event.payload.toolUseId ?? "",
          message: event.payload.progress?.message ?? "Working...",
          timestamp: new Date().toISOString(),
        });
        stopThinking(); // tool progress indicator takes over
        touchActivity();
      }),
    );

    // Permission requests
    unsubs.push(
      wsRef.current<SessionPermissionRequestPayload>("session_permission_request", (event) => {
        if (event.payload.sessionId !== sessionId) return;
        setPermissions((prev) => [
          ...prev,
          {
            requestId: event.payload.requestId,
            toolName: event.payload.toolName,
            input: event.payload.input,
          },
        ]);
        stopThinking(); // permission prompt is now the visible state
        touchActivity();
      }),
    );

    // Permission resolved
    unsubs.push(
      wsRef.current<SessionPermissionResolvedPayload>("session_permission_resolved", (event) => {
        if (event.payload.sessionId !== sessionId) return;
        setPermissions((prev) => prev.filter((p) => p.requestId !== event.payload.requestId));
      }),
    );

    // Result (turn complete)
    unsubs.push(
      wsRef.current<SessionResultPayload>("session_result", (event) => {
        if (event.payload.sessionId !== sessionId) return;
        setStreaming({ text: "", active: false });
        setToolProgress(null);
        stopThinking();

        // Update session with result stats
        const result = event.payload.result;
        if (result) {
          setSession((prev) => {
            if (!prev) return prev;
            const updates: Partial<Session> = {};
            if (result.type === "success" || result.type === "error") {
              updates.status = result.type === "error" ? "errored" : prev.status;
            }
            return { ...prev, ...updates };
          });
        }
      }),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isConnected]);

  const addOptimisticMessage = useCallback((type: SessionMessage["type"], content: string) => {
    const msg: SessionMessage = {
      sessionId,
      sequence: Date.now(),
      timestamp: new Date().toISOString(),
      type,
      content,
      metadata: {},
    };
    setMessages((prev) => [...prev, msg]);
  }, [sessionId]);

  const resolvePermission = useCallback((requestId: string) => {
    setPermissions((prev) => prev.filter((p) => p.requestId !== requestId));
  }, []);

  return {
    session,
    messages,
    permissions,
    streaming,
    toolProgress,
    thinking,
    loading,
    loadingOlder,
    hasOlderMessages,
    error,
    startupTimedOut,
    addOptimisticMessage,
    resolvePermission,
    startThinking,
    loadOlderMessages,
    send,
  };
}
