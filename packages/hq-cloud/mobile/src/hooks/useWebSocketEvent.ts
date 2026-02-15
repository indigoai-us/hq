/**
 * useWebSocketEvent - convenience hook for subscribing to WebSocket events.
 * Automatically unsubscribes on unmount or when dependencies change.
 */
import { useEffect } from "react";
import { useWebSocket } from "../contexts/WebSocketContext";
import type { ServerEventType, EventListener } from "../types/websocket";

/**
 * Subscribe to a specific WebSocket event type.
 * The listener is automatically unsubscribed on unmount.
 *
 * @param eventType - The server event type to listen for
 * @param listener - Callback invoked when the event is received
 * @param deps - Additional dependencies that should trigger re-subscription
 */
export function useWebSocketEvent<T = unknown>(
  eventType: ServerEventType,
  listener: EventListener<T>,
  deps: readonly unknown[] = [],
): void {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe(eventType, listener);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, subscribe, ...deps]);
}
