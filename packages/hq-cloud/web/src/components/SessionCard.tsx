"use client";

import type { Session } from "@/types/session";
import { Card } from "./Card";
import { StatusDot } from "./StatusDot";

interface SessionCardProps {
  session: Session;
  onClick: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatElapsed(createdAt: string, stoppedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = stoppedAt ? new Date(stoppedAt).getTime() : Date.now();
  const diff = end - start;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

function sessionStatusDot(status: string) {
  switch (status) {
    case "active":
      return "healthy" as const;
    case "starting":
      return "warning" as const;
    case "errored":
      return "error" as const;
    case "stopping":
      return "warning" as const;
    default:
      return "idle" as const;
  }
}

function sessionStatusLabel(status: string, startupPhase?: string | null): string {
  if (status === "starting" && startupPhase) {
    switch (startupPhase) {
      case "launching":
        return "Launching...";
      case "connecting":
        return "Connecting...";
      case "initializing":
        return "Initializing...";
      default:
        return "Starting...";
    }
  }
  switch (status) {
    case "active":
      return "Active";
    case "starting":
      return "Starting...";
    case "stopping":
      return "Stopping...";
    case "stopped":
      return "Stopped";
    case "errored":
      return "Error";
    default:
      return status;
  }
}

function getPreviewText(session: Session): string {
  if (session.error) return session.error;
  if (session.lastMessage?.content) {
    const content = session.lastMessage.content;
    return content.length > 120 ? content.slice(0, 120) + "..." : content;
  }
  if (session.initialPrompt) {
    const prompt = session.initialPrompt;
    return prompt.length > 120 ? prompt.slice(0, 120) + "..." : prompt;
  }
  return "New session";
}

export function SessionCard({ session, onClick }: SessionCardProps) {
  const isActive = session.status === "active" || session.status === "starting";
  const pendingCount = session.pendingPermissions ?? 0;

  return (
    <Card onClick={onClick} className="p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={sessionStatusDot(session.status)} size="md" />
          <span className="text-sm font-medium text-text-primary truncate">
            {session.initialPrompt
              ? session.initialPrompt.slice(0, 50) + (session.initialPrompt.length > 50 ? "..." : "")
              : "Claude Code Session"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Pending permissions badge */}
          {pendingCount > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold rounded-full bg-accent-yellow text-bg-primary"
              title={`${pendingCount} pending permission${pendingCount !== 1 ? "s" : ""}`}
              data-testid="permission-badge"
            >
              {pendingCount}
            </span>
          )}
          <span className={`text-xs ${isActive ? "text-accent-green" : "text-text-tertiary"}`}>
            {sessionStatusLabel(session.status, session.startupPhase)}
          </span>
          <span className="text-xs text-text-tertiary">
            {formatTimeAgo(session.lastActivityAt)}
          </span>
        </div>
      </div>

      {/* Preview */}
      <p className="mt-2 text-sm text-text-secondary line-clamp-2">
        {getPreviewText(session)}
      </p>

      {/* Footer */}
      <div className="mt-2 flex items-center gap-3">
        {session.messageCount > 0 && (
          <span className="text-xs text-text-tertiary">
            {session.messageCount} message{session.messageCount !== 1 ? "s" : ""}
          </span>
        )}
        {isActive && (
          <span className="text-xs text-text-tertiary">
            {formatElapsed(session.createdAt, null)}
          </span>
        )}
        {!isActive && session.stoppedAt && (
          <span className="text-xs text-text-tertiary">
            {formatElapsed(session.createdAt, session.stoppedAt)}
          </span>
        )}
        {session.workerContext && (
          <span className="text-xs text-accent-purple font-mono">
            {session.workerContext}
          </span>
        )}
      </div>
    </Card>
  );
}
