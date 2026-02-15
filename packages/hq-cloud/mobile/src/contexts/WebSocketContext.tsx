/**
 * WebSocketContext - Provides WebSocket connection state and controls to the app.
 * Automatically connects when authenticated and app is foregrounded,
 * disconnects when backgrounded to save battery.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { WebSocketService } from "../services/websocket";
import { getApiKey, getApiUrl } from "../services/api";
import { useAuth } from "./AuthContext";
import type {
  ConnectionStatus,
  ServerEventType,
  EventListener,
} from "../types/websocket";

interface WebSocketContextValue {
  /** Current connection status */
  connectionStatus: ConnectionStatus;
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Manually trigger a reconnect */
  reconnect: () => void;
  /** Subscribe to a server event type. Returns unsubscribe function. */
  subscribe: <T = unknown>(
    eventType: ServerEventType,
    listener: EventListener<T>,
  ) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocketService | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Initialize and manage WebSocket lifecycle
  useEffect(() => {
    if (!isAuthenticated) {
      // Not authenticated - ensure disconnected
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current.removeAllListeners();
        wsRef.current = null;
      }
      setConnectionStatus("disconnected");
      return;
    }

    let mounted = true;

    async function initWebSocket(): Promise<void> {
      const [apiKey, apiUrl] = await Promise.all([getApiKey(), getApiUrl()]);

      if (!mounted || !apiKey) return;

      // Convert http(s) URL to ws(s) URL
      const wsUrl = apiUrl.replace(/^http/, "ws");

      // Create service if it doesn't exist
      if (!wsRef.current) {
        wsRef.current = new WebSocketService({
          url: wsUrl,
          apiKey,
        });
      } else {
        wsRef.current.updateConfig({ url: wsUrl, apiKey });
      }

      // Listen for status changes
      // Note: cleanup is handled by removeAllListeners in the outer effect cleanup
      wsRef.current.onStatusChange((status) => {
        if (mounted) {
          setConnectionStatus(status);
        }
      });

      // Connect only if app is in foreground
      if (appStateRef.current === "active") {
        wsRef.current.connect();
      }
    }

    void initWebSocket();

    return () => {
      mounted = false;
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current.removeAllListeners();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated]);

  // Handle app state changes (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (!wsRef.current || !isAuthenticated) return;

      // App came to foreground
      if (previousState !== "active" && nextAppState === "active") {
        wsRef.current.connect();
      }

      // App went to background
      if (previousState === "active" && nextAppState !== "active") {
        wsRef.current.disconnect();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  const reconnect = useCallback(() => {
    if (wsRef.current && isAuthenticated) {
      wsRef.current.disconnect();
      wsRef.current.connect();
    }
  }, [isAuthenticated]);

  const subscribe = useCallback(<T = unknown>(
    eventType: ServerEventType,
    listener: EventListener<T>,
  ): (() => void) => {
    if (!wsRef.current) {
      // Return no-op unsubscribe if not initialized
      return () => {};
    }
    return wsRef.current.on(eventType, listener);
  }, []);

  const isConnected = connectionStatus === "connected";

  const value = useMemo<WebSocketContextValue>(
    () => ({
      connectionStatus,
      isConnected,
      reconnect,
      subscribe,
    }),
    [connectionStatus, isConnected, reconnect, subscribe],
  );

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Hook to access WebSocket context. Must be used within WebSocketProvider.
 */
export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
}
