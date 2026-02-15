"use client";

import { useState, useEffect, useCallback } from "react";
import type { Session, SessionStatus } from "@/types/session";
import type {
  ServerEvent,
  SessionStatusPayload,
  SessionPermissionRequestPayload,
  SessionPermissionResolvedPayload,
} from "@/types/websocket";
import { fetchSessions } from "@/services/sessions";
import { useWebSocketEvent } from "./useWebSocketEvent";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchSessions()
      .then((data) => {
        if (mounted) setSessions(data);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load sessions");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const refresh = useCallback(() => void load(true), [load]);

  const updateSession = useCallback((sessionId: string, changes: Partial<Session>) => {
    setSessions((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, ...changes } : s)),
    );
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
  }, []);

  const addSession = useCallback((session: Session) => {
    setSessions((prev) => {
      if (prev.some((s) => s.sessionId === session.sessionId)) return prev;
      return [session, ...prev];
    });
  }, []);

  // Real-time: session status changed (session_status event)
  useWebSocketEvent<SessionStatusPayload>(
    "session_status",
    useCallback(
      (event: ServerEvent<SessionStatusPayload>) => {
        const { sessionId, status, pendingPermissions, error: sessionError, lastActivityAt, startupPhase, startupTimestamp } = event.payload;
        setSessions((prev) => {
          // Map WebSocket status to SessionStatus
          const mappedStatus: SessionStatus =
            status === "waiting" ? "active" : (status as SessionStatus);

          return prev.map((s) => {
            if (s.sessionId !== sessionId) return s;
            return {
              ...s,
              status: mappedStatus,
              pendingPermissions: pendingPermissions?.length ?? s.pendingPermissions ?? 0,
              ...(sessionError !== undefined ? { error: sessionError } : {}),
              ...(lastActivityAt ? { lastActivityAt } : { lastActivityAt: new Date().toISOString() }),
              ...(startupPhase !== undefined ? { startupPhase } : {}),
              ...(startupTimestamp !== undefined ? { startupTimestamp } : {}),
            };
          });
        });
      },
      [],
    ),
  );

  // Real-time: session_status_changed (alternate event name from API)
  useWebSocketEvent<SessionStatusPayload>(
    "session_status_changed",
    useCallback(
      (event: ServerEvent<SessionStatusPayload>) => {
        const { sessionId, status, pendingPermissions, error: sessionError, lastActivityAt, startupPhase, startupTimestamp } = event.payload;
        setSessions((prev) => {
          const mappedStatus: SessionStatus =
            status === "waiting" ? "active" : (status as SessionStatus);

          return prev.map((s) => {
            if (s.sessionId !== sessionId) return s;
            return {
              ...s,
              status: mappedStatus,
              pendingPermissions: pendingPermissions?.length ?? s.pendingPermissions ?? 0,
              ...(sessionError !== undefined ? { error: sessionError } : {}),
              ...(lastActivityAt ? { lastActivityAt } : { lastActivityAt: new Date().toISOString() }),
              ...(startupPhase !== undefined ? { startupPhase } : {}),
              ...(startupTimestamp !== undefined ? { startupTimestamp } : {}),
            };
          });
        });
      },
      [],
    ),
  );

  // Real-time: new permission request — increment pending count
  useWebSocketEvent<SessionPermissionRequestPayload>(
    "session_permission_request",
    useCallback(
      (event: ServerEvent<SessionPermissionRequestPayload>) => {
        const { sessionId } = event.payload;
        setSessions((prev) =>
          prev.map((s) => {
            if (s.sessionId !== sessionId) return s;
            return {
              ...s,
              pendingPermissions: (s.pendingPermissions ?? 0) + 1,
              lastActivityAt: new Date().toISOString(),
            };
          }),
        );
      },
      [],
    ),
  );

  // Real-time: permission resolved — decrement pending count
  useWebSocketEvent<SessionPermissionResolvedPayload>(
    "session_permission_resolved",
    useCallback(
      (event: ServerEvent<SessionPermissionResolvedPayload>) => {
        const { sessionId } = event.payload;
        setSessions((prev) =>
          prev.map((s) => {
            if (s.sessionId !== sessionId) return s;
            return {
              ...s,
              pendingPermissions: Math.max(0, (s.pendingPermissions ?? 0) - 1),
            };
          }),
        );
      },
      [],
    ),
  );

  return {
    sessions,
    loading,
    refreshing,
    error,
    refresh,
    updateSession,
    removeSession,
    addSession,
  };
}
