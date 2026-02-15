export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export type ServerEventType =
  | "agent:updated"
  | "agent:created"
  | "agent:deleted"
  | "agent:question"
  | "agent:permission"
  | "agent:message"
  | "navigator:updated"
  | "connection:ack"
  | "error"
  | "session_status"
  | "session_status_changed"
  | "session_message"
  | "session_stream"
  | "session_permission_request"
  | "session_permission_resolved"
  | "session_result"
  | "session_tool_progress"
  | "session_control"
  | "session_raw";

export type ClientEventType = "subscribe" | "unsubscribe" | "ping";

export interface ServerEvent<T = unknown> {
  type: ServerEventType;
  payload: T;
  timestamp: string;
}

export interface ClientEvent<T = unknown> {
  type: ClientEventType;
  payload: T;
}

export interface AgentUpdatedPayload {
  agentId: string;
  changes: Record<string, unknown>;
}

export interface AgentQuestionPayload {
  agentId: string;
  questionId: string;
  text: string;
  options?: string[];
}

export interface AgentPermissionPayload {
  agentId: string;
  permissionId: string;
  tool: string;
  description: string;
}

export interface AgentMessagePayload {
  agentId: string;
  messageId: string;
  role: "agent" | "user" | "system" | "tool";
  content: string;
  toolName?: string;
  toolStatus?: "running" | "completed" | "failed";
}

export interface ConnectionAckPayload {
  sessionId: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface SubscribePayload {
  channels: string[];
}

// --- Session WebSocket Payloads ---

export type StartupPhase = "launching" | "connecting" | "initializing" | "ready" | "failed";

export interface SessionStatusPayload {
  sessionId: string;
  status: "starting" | "active" | "waiting" | "stopping" | "stopped" | "errored";
  initialized?: boolean;
  pendingPermissions?: Array<{
    requestId: string;
    toolName?: string;
    input?: Record<string, unknown>;
  }>;
  capabilities?: Record<string, unknown>;
  error?: string;
  lastActivityAt?: string;
  startupPhase?: StartupPhase;
  startupTimestamp?: number;
}

export interface SessionMessagePayload {
  sessionId: string;
  messageType: "user" | "assistant";
  content: string;
  raw?: Record<string, unknown>;
}

export interface SessionStreamPayload {
  sessionId: string;
  event: Record<string, unknown>;
}

export interface SessionPermissionRequestPayload {
  sessionId: string;
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface SessionPermissionResolvedPayload {
  sessionId: string;
  requestId: string;
  behavior: "allow" | "deny";
}

export interface SessionResultPayload {
  sessionId: string;
  result: Record<string, unknown>;
}

export interface SessionToolProgressPayload {
  sessionId: string;
  toolUseId?: string;
  progress: {
    type?: string;
    message?: string;
    [key: string]: unknown;
  };
}

export type EventListener<T = unknown> = (event: ServerEvent<T>) => void;

export interface WebSocketConfig {
  url: string;
  token: string;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
}
