"use client";

import { useState, useEffect, useCallback } from "react";
import type { Agent } from "@/types/agent";
import type { ServerEvent } from "@/types/websocket";
import { fetchAgents } from "@/services/agents";
import { useWebSocketEvent } from "./useWebSocketEvent";
import { useAuth } from "@/contexts/AuthContext";

interface UseAgentsReturn {
  agents: Agent[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
  updateAgent: (agentId: string, changes: Partial<Agent>) => void;
}

export function useAgents(): UseAgentsReturn {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await fetchAgents();
      setAgents(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load agents";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    void loadAgents();
  }, [loadAgents, authLoading, isAuthenticated]);

  const refresh = useCallback(() => {
    void loadAgents(true);
  }, [loadAgents]);

  const updateAgent = useCallback((agentId: string, changes: Partial<Agent>) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, ...changes } : a)),
    );
  }, []);

  // Real-time: agent updated
  useWebSocketEvent<Agent>(
    "agent:updated",
    useCallback(
      (event: ServerEvent<Agent>) => {
        const updated = event.payload;
        setAgents((prev) =>
          prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
        );
      },
      [],
    ),
  );

  // Real-time: agent created
  useWebSocketEvent<Agent>(
    "agent:created",
    useCallback(
      (event: ServerEvent<Agent>) => {
        const newAgent = event.payload;
        setAgents((prev) => {
          if (prev.some((a) => a.id === newAgent.id)) return prev;
          return [newAgent, ...prev];
        });
      },
      [],
    ),
  );

  // Real-time: agent deleted
  useWebSocketEvent<{ agentId: string }>(
    "agent:deleted",
    useCallback(
      (event: ServerEvent<{ agentId: string }>) => {
        setAgents((prev) => prev.filter((a) => a.id !== event.payload.agentId));
      },
      [],
    ),
  );

  return { agents, loading, refreshing, error, refresh, updateAgent };
}
