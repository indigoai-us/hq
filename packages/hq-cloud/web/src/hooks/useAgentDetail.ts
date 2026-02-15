"use client";

import { useState, useEffect, useCallback } from "react";
import type { Agent, AgentMessage } from "@/types/agent";
import type { ServerEvent } from "@/types/websocket";
import type { AgentMessagePayload } from "@/types/websocket";
import {
  fetchAgent,
  fetchAgentMessages,
  answerQuestion,
  respondToPermission,
  sendMessage,
} from "@/services/agents";
import { useWebSocketEvent } from "./useWebSocketEvent";

interface UseAgentDetailReturn {
  agent: Agent | null;
  messages: AgentMessage[];
  loading: boolean;
  error: string | null;
  handlePermissionResponse: (permissionId: string, allowed: boolean) => void;
  permissionSending: boolean;
  handleSendMessage: (content: string) => void;
  messageSending: boolean;
  handleAnswerQuestion: (questionId: string, answer: string) => void;
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

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [agentData, messagesData] = await Promise.all([
          fetchAgent(agentId),
          fetchAgentMessages(agentId),
        ]);
        if (mounted) {
          setAgent(agentData);
          setMessages(messagesData);
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load agent");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => { mounted = false; };
  }, [agentId]);

  // Real-time agent updates
  useWebSocketEvent<Agent>(
    "agent:updated",
    useCallback(
      (event: ServerEvent<Agent>) => {
        if (event.payload.id === agentId) {
          setAgent((prev) => (prev ? { ...prev, ...event.payload } : null));
        }
      },
      [agentId],
    ),
    [agentId],
  );

  // Real-time messages
  useWebSocketEvent<AgentMessagePayload>(
    "agent:message",
    useCallback(
      (event: ServerEvent<AgentMessagePayload>) => {
        if (event.payload.agentId === agentId) {
          const msg: AgentMessage = {
            id: event.payload.messageId,
            role: event.payload.role,
            content: event.payload.content,
            timestamp: event.timestamp,
            toolName: event.payload.toolName,
            toolStatus: event.payload.toolStatus,
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      },
      [agentId],
    ),
    [agentId],
  );

  const handleAnswerQuestion = useCallback(
    (questionId: string, answer: string) => {
      setAnswerSending(true);

      // Optimistic: add user message
      const optimisticMsg: AgentMessage = {
        id: `opt-${Date.now()}`,
        role: "user",
        content: answer,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setAgent((prev) =>
        prev ? { ...prev, currentQuestion: undefined, status: "running" } : null,
      );

      answerQuestion(agentId, questionId, answer)
        .catch(() => {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        })
        .finally(() => setAnswerSending(false));
    },
    [agentId],
  );

  const handlePermissionResponse = useCallback(
    (permissionId: string, allowed: boolean) => {
      setPermissionSending(true);
      setAgent((prev) =>
        prev ? { ...prev, currentPermission: undefined, status: "running" } : null,
      );

      respondToPermission(agentId, permissionId, allowed)
        .catch(() => {
          // Revert handled by next WS update
        })
        .finally(() => setPermissionSending(false));
    },
    [agentId],
  );

  const handleSendMessage = useCallback(
    (content: string) => {
      setMessageSending(true);

      const optimisticMsg: AgentMessage = {
        id: `opt-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      sendMessage(agentId, content)
        .catch(() => {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        })
        .finally(() => setMessageSending(false));
    },
    [agentId],
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
