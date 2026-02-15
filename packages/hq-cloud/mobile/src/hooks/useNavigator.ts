/**
 * useNavigator - Hook for managing the Navigator tree state.
 *
 * Handles:
 * - Fetching the semantic tree from API on mount
 * - Tracking expanded/collapsed state per node
 * - Pull-to-refresh
 * - Real-time updates via WebSocket (navigator:updated)
 * - Loading/error/empty states
 */
import { useCallback, useEffect, useState } from "react";
import { fetchNavigatorTree } from "../services/navigator";
import { useWebSocketEvent } from "./useWebSocketEvent";
import type { NavigatorGroup, NavigatorTreeResponse } from "../types";

interface UseNavigatorReturn {
  /** Top-level groups (Companies, Standalone Projects) */
  groups: NavigatorGroup[];
  /** Whether the initial load is in progress */
  loading: boolean;
  /** Whether a refresh is in progress */
  refreshing: boolean;
  /** Error message from last fetch attempt */
  error: string | null;
  /** Trigger a manual refresh (pull-to-refresh) */
  refresh: () => void;
  /** Set of node IDs that are currently expanded */
  expandedNodes: Set<string>;
  /** Toggle a node's expanded/collapsed state */
  toggleNode: (nodeId: string) => void;
}

export function useNavigator(): UseNavigatorReturn {
  const [groups, setGroups] = useState<NavigatorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Fetch tree from API
  const loadTree = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await fetchNavigatorTree();
      setGroups(data.groups);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load navigator";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadTree(false);
  }, [loadTree]);

  // Pull-to-refresh
  const refresh = useCallback(() => {
    void loadTree(true);
  }, [loadTree]);

  // Toggle expanded/collapsed state for a node
  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Real-time: tree updated (full refresh for simplicity)
  useWebSocketEvent<NavigatorTreeResponse>(
    "navigator:updated",
    useCallback((event) => {
      setGroups(event.payload.groups);
    }, []),
  );

  return {
    groups,
    loading,
    refreshing,
    error,
    refresh,
    expandedNodes,
    toggleNode,
  };
}
