"use client";

import { useState, useEffect, useCallback } from "react";
import type { NavigatorGroup } from "@/types/navigator";
import type { ServerEvent } from "@/types/websocket";
import { fetchNavigatorTree } from "@/services/navigator";
import { useWebSocketEvent } from "./useWebSocketEvent";

interface UseNavigatorReturn {
  groups: NavigatorGroup[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
  expandedNodes: Set<string>;
  toggleNode: (nodeId: string) => void;
}

export function useNavigator(): UseNavigatorReturn {
  const [groups, setGroups] = useState<NavigatorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const loadTree = useCallback(async (isRefresh = false) => {
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
      setError(err instanceof Error ? err.message : "Failed to load navigator");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const refresh = useCallback(() => {
    void loadTree(true);
  }, [loadTree]);

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

  // Real-time tree updates
  useWebSocketEvent(
    "navigator:updated",
    useCallback(
      (_event: ServerEvent) => {
        void loadTree(true);
      },
      [loadTree],
    ),
  );

  return { groups, loading, refreshing, error, refresh, expandedNodes, toggleNode };
}
