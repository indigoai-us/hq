"use client";

import { useEffect } from "react";
import { useWebSocket } from "@/contexts/WebSocketContext";
import type { ServerEventType, EventListener } from "@/types/websocket";

export function useWebSocketEvent<T = unknown>(
  eventType: ServerEventType,
  listener: EventListener<T>,
  deps: unknown[] = [],
): void {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe(eventType, listener);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, subscribe, ...deps]);
}
