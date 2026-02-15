/**
 * useAgents - Hook for managing agent list state.
 * Fetches agents from API on mount and subscribes to WebSocket events
 * for real-time updates (agent:updated, agent:created, agent:deleted).
 */
import { useCallback, useEffect, useState } from "react";
import { fetchAgents } from "../services/agents";
import { useWebSocketEvent } from "./useWebSocketEvent";
import type { Agent } from "../types";
import type { AgentUpdatedPayload } from "../types/websocket";

interface UseAgentsReturn {
  /** Current list of agents */
  agents: Agent[];
  /** Whether the initial load is in progress */
  loading: boolean;
  /** Whether a refresh is in progress */
  refreshing: boolean;
  /** Error message from last fetch attempt */
  error: string | null;
  /** Trigger a manual refresh (pull-to-refresh) */
  refresh: () => void;
  /** Update a single agent in state (optimistic update) */
  updateAgent: (agentId: string, changes: Partial<Agent>) => void;
}

export function useAgents(): UseAgentsReturn {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch agents from API
  const loadAgents = useCallback(async (isRefresh: boolean) => {
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

  // Initial load
  useEffect(() => {
    void loadAgents(false);
  }, [loadAgents]);

  // Pull-to-refresh
  const refresh = useCallback(() => {
    void loadAgents(true);
  }, [loadAgents]);

  // Update a single agent in state
  const updateAgent = useCallback((agentId: string, changes: Partial<Agent>) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, ...changes } : a)),
    );
  }, []);

  // Real-time: agent updated
  useWebSocketEvent<AgentUpdatedPayload>(
    "agent:updated",
    useCallback(
      (event) => {
        const { agentId, changes } = event.payload;
        updateAgent(agentId, changes as Partial<Agent>);
      },
      [updateAgent],
    ),
  );

  // Real-time: agent created
  useWebSocketEvent<Agent>(
    "agent:created",
    useCallback((event) => {
      setAgents((prev) => {
        // Avoid duplicates
        if (prev.some((a) => a.id === event.payload.id)) return prev;
        return [event.payload, ...prev];
      });
    }, []),
  );

  // Real-time: agent deleted
  useWebSocketEvent<{ agentId: string }>(
    "agent:deleted",
    useCallback((event) => {
      setAgents((prev) => prev.filter((a) => a.id !== event.payload.agentId));
    }, []),
  );

  return {
    agents,
    loading,
    refreshing,
    error,
    refresh,
    updateAgent,
  };
}
