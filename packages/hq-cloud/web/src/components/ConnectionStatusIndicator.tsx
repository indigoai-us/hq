"use client";

import { useWebSocket } from "@/contexts/WebSocketContext";
import { StatusDot } from "./StatusDot";

const statusLabels: Record<string, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  reconnecting: "Reconnecting...",
  disconnected: "Disconnected",
};

export function ConnectionStatusIndicator() {
  const { connectionStatus } = useWebSocket();

  if (connectionStatus === "connected") return null;

  return (
    <div className="flex items-center gap-1.5">
      <StatusDot status={connectionStatus} />
      <span className="text-xs text-text-tertiary">
        {statusLabels[connectionStatus] ?? "Unknown"}
      </span>
    </div>
  );
}
