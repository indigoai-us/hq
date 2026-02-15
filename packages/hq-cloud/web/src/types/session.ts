import type { StartupPhase } from "./websocket";

export type SessionStatus = "starting" | "active" | "stopping" | "stopped" | "errored";

export interface Session {
  sessionId: string;
  userId: string;
  status: SessionStatus;
  ecsTaskArn: string | null;
  initialPrompt: string | null;
  workerContext: string | null;
  messageCount: number;
  createdAt: string;
  lastActivityAt: string;
  stoppedAt: string | null;
  error: string | null;
  lastMessage?: SessionMessage | null;
  /** Number of pending tool permission requests awaiting user approval */
  pendingPermissions?: number;
  /** Current startup phase (ephemeral, from WebSocket) */
  startupPhase?: StartupPhase | null;
  /** Timestamp when the current startup phase began */
  startupTimestamp?: number | null;
}

export type SessionMessageType =
  | "user"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "permission_request"
  | "permission_response"
  | "system"
  | "error";

/** A content block within an assistant message (from Claude Code NDJSON protocol) */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "thinking"; thinking: string };

export interface SessionMessage {
  sessionId: string;
  sequence: number;
  timestamp: string;
  type: SessionMessageType;
  content: string;
  metadata: Record<string, unknown>;
  /** Parsed content blocks from raw assistant messages */
  contentBlocks?: ContentBlock[];
}

/** Tool progress heartbeat during tool execution */
export interface ToolProgress {
  toolUseId: string;
  message: string;
  timestamp: string;
}

export interface CreateSessionInput {
  prompt?: string;
  label?: string;
  workerId?: string;
  skillId?: string;
  workerContext?: string;
}

export interface SessionPermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
}
