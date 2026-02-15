/**
 * useAgentDetail - Hook for managing agent detail state.
 * Fetches agent info and message history, subscribes to real-time
 * WebSocket events for new messages and agent updates.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { answerQuestion, fetchAgent, fetchAgentMessages, respondToPermission, sendMessage } from "../services/agents";
import { useWebSocketEvent } from "./useWebSocketEvent";
import type { Agent, AgentMessage } from "../types";
import type { AgentMessagePayload, AgentUpdatedPayload } from "../types/websocket";

interface UseAgentDetailReturn {
  /** The agent data */
  agent: Agent | null;
  /** Chat messages for this agent */
  messages: AgentMessage[];
  /** Whether the initial load is in progress */
  loading: boolean;
  /** Error message from last fetch attempt */
  error: string | null;
  /** Respond to a permission request (allow/deny) */
  handlePermissionResponse: (permissionId: string, allowed: boolean) => void;
  /** Whether a permission response is being sent */
  permissionSending: boolean;
  /** Send a custom text message to the agent (optimistic) */
  handleSendMessage: (content: string) => void;
  /** Whether a message send is in progress */
  messageSending: boolean;
  /** Answer a question (option or custom text) */
  handleAnswerQuestion: (questionId: string, answer: string) => void;
  /** Whether a question answer is being sent */
  answerSending: boolean;
}

export function useAgentDetail(agentId: string): UseAgentDetailReturn {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionSending, setPermissionSending] = useState(false);
  const [messageSending, setMessageSending] = useState(false);
  const [answerSending, setAnswerSending] = useState(false);
  const optimisticIdRef = useRef(0);
  const mountedRef = useRef(true);

  // Fetch agent and messages on mount
  useEffect(() => {
    mountedRef.current = true;

    async function loadDetail(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const [agentData, messagesData] = await Promise.all([
          fetchAgent(agentId),
          fetchAgentMessages(agentId),
        ]);

        if (mountedRef.current) {
          setAgent(agentData);
          setMessages(messagesData);
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          const message = err instanceof Error ? err.message : "Failed to load agent details";
          setError(message);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      mountedRef.current = false;
    };
  }, [agentId]);

  // Real-time: new message for this agent
  useWebSocketEvent<AgentMessagePayload>(
    "agent:message",
    useCallback(
      (event) => {
        const payload = event.payload;
        if (payload.agentId !== agentId) return;

        const newMessage: AgentMessage = {
          id: payload.messageId,
          role: payload.role,
          content: payload.content,
          timestamp: event.timestamp,
          toolName: payload.toolName,
          toolStatus: payload.toolStatus,
        };

        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some((m) => m.id === newMessage.id)) return prev;
          return [...prev, newMessage];
        });
      },
      [agentId],
    ),
  );

  // Real-time: agent updated (status changes, new questions, permissions)
  useWebSocketEvent<AgentUpdatedPayload>(
    "agent:updated",
    useCallback(
      (event) => {
        if (event.payload.agentId !== agentId) return;
        setAgent((prev) => {
          if (!prev) return prev;
          return { ...prev, ...event.payload.changes } as Agent;
        });
      },
      [agentId],
    ),
  );

  // Handle permission response
  const handlePermissionResponse = useCallback(
    (permissionId: string, allowed: boolean) => {
      setPermissionSending(true);
      void respondToPermission(agentId, permissionId, allowed)
        .then(() => {
          if (mountedRef.current) {
            // Optimistically clear the permission
            setAgent((prev) => {
              if (!prev) return prev;
              return { ...prev, currentPermission: undefined };
            });
          }
        })
        .catch(() => {
          // Permission send failed - ignore for now, server will retry
        })
        .finally(() => {
          if (mountedRef.current) {
            setPermissionSending(false);
          }
        });
    },
    [agentId],
  );

  // Send a custom text message (optimistic)
  const handleSendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || messageSending) return;

      optimisticIdRef.current += 1;
      const optimisticId = `optimistic-${optimisticIdRef.current}-${Date.now()}`;
      const optimisticMessage: AgentMessage = {
        id: optimisticId,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setMessageSending(true);

      void sendMessage(agentId, trimmed)
        .catch(() => {
          // Remove optimistic message on failure
          if (mountedRef.current) {
            setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          }
        })
        .finally(() => {
          if (mountedRef.current) {
            setMessageSending(false);
          }
        });
    },
    [agentId, messageSending],
  );

  // Answer a question (option or custom text) with optimistic message
  const handleAnswerQuestion = useCallback(
    (questionId: string, answer: string) => {
      if (answerSending) return;

      optimisticIdRef.current += 1;
      const optimisticId = `optimistic-answer-${optimisticIdRef.current}-${Date.now()}`;
      const optimisticMessage: AgentMessage = {
        id: optimisticId,
        role: "user",
        content: answer,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setAnswerSending(true);

      // Clear the current question optimistically
      setAgent((prev) => {
        if (!prev) return prev;
        return { ...prev, currentQuestion: undefined };
      });

      void answerQuestion(agentId, questionId, answer)
        .catch(() => {
          // Revert optimistic changes on failure
          if (mountedRef.current) {
            setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          }
        })
        .finally(() => {
          if (mountedRef.current) {
            setAnswerSending(false);
          }
        });
    },
    [agentId, answerSending],
  );

  return {
    agent,
    messages,
    loading,
    error,
    handlePermissionResponse,
    permissionSending,
    handleSendMessage,
    messageSending,
    handleAnswerQuestion,
    answerSending,
  };
}
