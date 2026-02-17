"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WebSocketService } from "@/lib/websocket";
import { getApiUrl } from "@/lib/storage";
import type { ConnectionStatus, ServerEventType, EventListener } from "@/types/websocket";
import { useAuth } from "./AuthContext";

interface WebSocketContextValue {
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  reconnect: () => void;
  subscribe: <T = unknown>(eventType: ServerEventType, listener: EventListener<T>) => () => void;
  send: <T = unknown>(event: { type: string; payload?: T; [key: string]: unknown }) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, getToken } = useAuth();
  const wsRef = useRef<WebSocketService | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");

  useEffect(() => {
    if (!isAuthenticated) {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current.removeAllListeners();
        wsRef.current = null;
      }
      setConnectionStatus("disconnected");
      return;
    }

    let cancelled = false;

    async function connectWithToken() {
      const token = await getToken();
      if (cancelled || !token) return;

      const baseUrl = getApiUrl();
      const wsUrl = baseUrl.replace(/^http/, "ws");

      const ws = new WebSocketService({ url: wsUrl, token });
      wsRef.current = ws;

      const unsubStatus = ws.onStatusChange((status) => {
        setConnectionStatus(status);
      });

      ws.connect();

      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          if (ws.getStatus() === "disconnected") {
            // Get a fresh token on reconnect
            void getToken().then((freshToken) => {
              if (freshToken) {
                ws.updateConfig({ token: freshToken });
                ws.connect();
              }
            });
          }
        } else {
          ws.disconnect();
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        unsubStatus();
        ws.disconnect();
        ws.removeAllListeners();
        wsRef.current = null;
      };
    }

    let cleanup: (() => void) | undefined;
    void connectWithToken().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [isAuthenticated, getToken]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.disconnect();
      // Get fresh token for reconnect
      void getToken().then((token) => {
        if (token && wsRef.current) {
          wsRef.current.updateConfig({ token });
          wsRef.current.connect();
        }
      });
    }
  }, [getToken]);

  const subscribe = useCallback(
    <T = unknown,>(eventType: ServerEventType, listener: EventListener<T>): (() => void) => {
      if (!wsRef.current) return () => {};
      return wsRef.current.on(eventType, listener);
    },
    [],
  );

  const send = useCallback(
    <T = unknown,>(event: { type: string; payload?: T; [key: string]: unknown }): void => {
      wsRef.current?.send(event as import("@/types/websocket").ClientEvent<T>);
    },
    [],
  );

  const value = useMemo<WebSocketContextValue>(
    () => ({
      connectionStatus,
      isConnected: connectionStatus === "connected",
      reconnect,
      subscribe,
      send,
    }),
    [connectionStatus, reconnect, subscribe, send],
  );

  return (
    <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
}
