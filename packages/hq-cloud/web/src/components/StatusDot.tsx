import type { NavigatorNodeStatus } from "@/types/navigator";

interface StatusDotProps {
  status: NavigatorNodeStatus | "connecting" | "connected" | "disconnected" | "reconnecting";
  size?: "sm" | "md";
}

const statusColors: Record<string, string> = {
  healthy: "bg-status-healthy",
  connected: "bg-status-healthy",
  warning: "bg-status-warning",
  connecting: "bg-status-warning",
  reconnecting: "bg-status-warning",
  error: "bg-status-error",
  idle: "bg-status-idle",
  disconnected: "bg-status-idle",
};

export function StatusDot({ status, size = "sm" }: StatusDotProps) {
  const sizeClass = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";

  return (
    <span
      className={`inline-block rounded-full ${sizeClass} ${statusColors[status] ?? "bg-status-idle"}`}
      aria-label={`Status: ${status}`}
    />
  );
}
