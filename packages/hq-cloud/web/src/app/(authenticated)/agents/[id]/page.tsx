"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSessionDetail } from "@/hooks/useSessionDetail";
import { stopSession } from "@/services/sessions";
import { ChatInput } from "@/components/ChatInput";
import { StatusDot } from "@/components/StatusDot";
import { ActionButton } from "@/components/ActionButton";
import { SessionPermissionPrompt } from "@/components/SessionPermissionPrompt";
import { SessionMessageBubble } from "@/components/SessionMessageBubble";
import { ToolProgressIndicator } from "@/components/ToolProgressIndicator";
import { StartupProgress } from "@/components/StartupProgress";
import type { ContentBlock } from "@/types/session";

function formatElapsed(createdAt: string, stoppedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = stoppedAt ? new Date(stoppedAt).getTime() : Date.now();
  const diff = end - start;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

function sessionStatusDot(status: string) {
  switch (status) {
    case "active":
      return "healthy" as const;
    case "starting":
      return "warning" as const;
    case "errored":
      return "error" as const;
    case "stopping":
      return "warning" as const;
    default:
      return "idle" as const;
  }
}

function sessionStatusLabel(status: string, startupPhase?: string | null): string {
  if (status === "starting" && startupPhase) {
    switch (startupPhase) {
      case "launching":
        return "Launching...";
      case "connecting":
        return "Connecting...";
      case "initializing":
        return "Initializing...";
      default:
        return "Starting...";
    }
  }
  switch (status) {
    case "active":
      return "Active";
    case "starting":
      return "Starting...";
    case "stopping":
      return "Stopping...";
    case "stopped":
      return "Stopped";
    case "errored":
      return "Error";
    default:
      return status;
  }
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const {
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
  } = useSessionDetail(sessionId);

  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [elapsedTime, setElapsedTime] = useState("");

  // Update elapsed time for active sessions
  useEffect(() => {
    if (!session) return;
    const isActive = session.status === "active" || session.status === "starting";

    const update = () => {
      setElapsedTime(formatElapsed(session.createdAt, isActive ? null : session.stoppedAt));
    };
    update();

    if (isActive) {
      const timer = setInterval(update, 1000);
      return () => clearInterval(timer);
    }
  }, [session]);

  // Build tool result lookup map for content blocks
  const toolResultMap = useMemo(() => {
    const map = new Map<string, { content: string; isError: boolean }>();

    for (const msg of messages) {
      if (msg.contentBlocks) {
        for (const block of msg.contentBlocks) {
          if (block.type === "tool_result") {
            const tb = block as ContentBlock & { type: "tool_result" };
            map.set(tb.tool_use_id, {
              content: tb.content,
              isError: tb.is_error === true,
            });
          }
        }
      }
      // Also handle standalone tool_result messages
      if (msg.type === "tool_result" && msg.metadata?.tool_use_id) {
        map.set(String(msg.metadata.tool_use_id), {
          content: msg.content,
          isError: msg.metadata.is_error === true,
        });
      }
    }

    return map;
  }, [messages]);

  // Auto-scroll to bottom on new messages (only if user hasn't scrolled up)
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, streaming.text, thinking.active, autoScroll]);

  // Detect scroll position to manage auto-scroll behavior
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isNearBottom);

    // Load older messages when scrolled to top
    if (scrollTop < 50 && hasOlderMessages && !loadingOlder) {
      void loadOlderMessages();
    }
  }, [hasOlderMessages, loadingOlder, loadOlderMessages]);

  // Send a user message to the session
  const handleSend = useCallback(
    (content: string) => {
      if (!content.trim() || sending) return;
      setSending(true);

      addOptimisticMessage("user", content);
      startThinking();

      send({
        type: "session_user_message",
        sessionId,
        content,
      });

      setSending(false);
    },
    [sessionId, sending, addOptimisticMessage, startThinking, send],
  );

  // Handle permission response
  const handlePermissionResponse = useCallback(
    (requestId: string, behavior: "allow" | "deny") => {
      send({
        type: "session_permission_response",
        sessionId,
        requestId,
        behavior,
      });
      resolvePermission(requestId);
      if (behavior === "allow") {
        startThinking();
      }
    },
    [sessionId, resolvePermission, startThinking, send],
  );

  // Interrupt session (send interrupt command)
  const handleInterrupt = useCallback(() => {
    send({
      type: "session_interrupt",
      sessionId,
    });
  }, [sessionId, send]);

  // Stop session (terminate via API)
  const handleStop = useCallback(async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await stopSession(sessionId);
    } catch {
      // Error handled by status update
    } finally {
      setStopping(false);
    }
  }, [sessionId, stopping]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-accent-blue animate-spin"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="text-text-secondary text-sm">Loading session...</span>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-text-secondary text-sm">{error ?? "Session not found"}</span>
        <ActionButton label="Back to Sessions" variant="muted" onClick={() => router.push("/agents")} />
      </div>
    );
  }

  const isActive = session.status === "active" || session.status === "starting";
  const statusDot = sessionStatusDot(session.status);

  return (
    <div className="flex flex-col h-full">
      {/* Session Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-bg-secondary shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button */}
          <button
            type="button"
            onClick={() => router.push("/agents")}
            className="text-text-tertiary hover:text-text-primary transition-colors text-sm p-1"
            aria-label="Back to sessions"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          <StatusDot status={statusDot} size="md" />

          <div className="min-w-0">
            <span className="text-sm font-medium text-text-primary truncate block">
              {session.initialPrompt
                ? session.initialPrompt.slice(0, 60) + (session.initialPrompt.length > 60 ? "..." : "")
                : "Claude Code Session"}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs ${isActive ? "text-accent-green" : "text-text-tertiary"}`}>
                {sessionStatusLabel(session.status, session.startupPhase)}
              </span>
              {session.workerContext && (
                <span className="text-xs text-accent-purple font-mono">{session.workerContext}</span>
              )}
              {elapsedTime && (
                <span className="text-xs text-text-tertiary">{elapsedTime}</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {isActive && (
          <div className="flex items-center gap-2 shrink-0">
            <ActionButton
              label="Interrupt"
              variant="muted"
              size="sm"
              onClick={handleInterrupt}
            />
            <ActionButton
              label={stopping ? "Stopping..." : "Stop"}
              variant="destructive"
              size="sm"
              disabled={stopping}
              onClick={() => void handleStop()}
            />
          </div>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto px-4 py-4 space-y-3"
      >
        {/* Load older messages */}
        {hasOlderMessages && messages.length > 0 && (
          <div className="text-center py-2">
            {loadingOlder ? (
              <span className="text-xs text-text-tertiary">Loading older messages...</span>
            ) : (
              <button
                type="button"
                onClick={() => void loadOlderMessages()}
                className="text-xs text-accent-blue hover:underline"
              >
                Load older messages
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && !streaming.active && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            {session.status === "starting" ? (
              <StartupProgress
                phase={session.startupPhase}
                startupTimestamp={session.startupTimestamp}
                error={session.error}
                timedOut={startupTimedOut}
              />
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <span className="text-text-tertiary text-sm">
                  {session.status === "active"
                    ? "Session connected. Waiting for response..."
                    : "Session ended."}
                </span>
              </>
            )}
          </div>
        )}

        {/* Message list */}
        {messages.map((msg, i) => (
          <SessionMessageBubble
            key={`${msg.sequence}-${i}`}
            message={msg}
            toolResults={toolResultMap}
          />
        ))}

        {/* Active permission prompts */}
        {permissions.map((perm) => (
          <SessionPermissionPrompt
            key={perm.requestId}
            permission={perm}
            onRespond={handlePermissionResponse}
          />
        ))}

        {/* Tool progress indicator */}
        {toolProgress && !streaming.active && (
          <ToolProgressIndicator progress={toolProgress} />
        )}

        {/* Thinking indicator — shown when waiting for Claude to respond */}
        {thinking.active && !streaming.active && !toolProgress && permissions.length === 0 && (
          <div className="max-w-[90%] mr-auto">
            <div className="px-3 py-2.5 rounded-lg bg-bg-card border border-border-subtle flex items-center gap-2.5">
              {thinking.stale ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-accent-yellow" />
                  <span className="text-sm text-text-tertiary">
                    Taking longer than expected...
                  </span>
                </>
              ) : (
                <>
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span className="text-sm text-text-tertiary">Claude is working...</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Streaming indicator */}
        {streaming.active && (
          <div className="max-w-[90%] mr-auto" data-testid="streaming-indicator">
            <div className="px-3 py-2 rounded-lg bg-bg-card border border-border-subtle">
              <p className="text-sm whitespace-pre-wrap text-text-primary">
                {streaming.text}
                <span className="inline-block w-1.5 h-4 bg-accent-blue ml-0.5 animate-pulse" />
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {isActive ? (
        <ChatInput
          onSend={handleSend}
          sending={sending}
          placeholder="Send a message to Claude..."
        />
      ) : (
        <div className="border-t border-border-subtle bg-bg-secondary px-4 py-3 shrink-0">
          <p className="text-xs text-text-tertiary text-center">
            This session has ended.{" "}
            <button
              type="button"
              onClick={() => router.push("/agents")}
              className="text-accent-blue hover:underline"
            >
              Start a new session
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
