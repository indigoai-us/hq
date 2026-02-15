/**
 * WebSocket types for HQ Cloud Mobile.
 * Defines message formats, connection states, and event types.
 */

/** WebSocket connection states */
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

/** Inbound WebSocket event types from server */
export type ServerEventType =
  | "agent:updated"
  | "agent:created"
  | "agent:deleted"
  | "agent:question"
  | "agent:permission"
  | "agent:message"
  | "navigator:updated"
  | "connection:ack"
  | "error";

/** Outbound WebSocket event types to server */
export type ClientEventType =
  | "subscribe"
  | "unsubscribe"
  | "ping";

/** Base server event envelope */
export interface ServerEvent<T = unknown> {
  type: ServerEventType;
  payload: T;
  timestamp: string;
}

/** Base client event envelope */
export interface ClientEvent<T = unknown> {
  type: ClientEventType;
  payload: T;
}

/** Agent update payload from server */
export interface AgentUpdatedPayload {
  agentId: string;
  changes: Record<string, unknown>;
}

/** New question payload from server */
export interface AgentQuestionPayload {
  agentId: string;
  questionId: string;
  text: string;
  options?: string[];
}

/** New permission request payload from server */
export interface AgentPermissionPayload {
  agentId: string;
  permissionId: string;
  tool: string;
  description: string;
}

/** Agent message payload from server */
export interface AgentMessagePayload {
  agentId: string;
  messageId: string;
  role: "agent" | "user" | "system" | "tool";
  content: string;
  toolName?: string;
  toolStatus?: "running" | "completed" | "failed";
}

/** Connection acknowledgment payload */
export interface ConnectionAckPayload {
  sessionId: string;
}

/** Error payload from server */
export interface ErrorPayload {
  code: string;
  message: string;
}

/** Subscription payload sent to server */
export interface SubscribePayload {
  channels: string[];
}

/** WebSocket event listener callback */
export type EventListener<T = unknown> = (event: ServerEvent<T>) => void;

/** Configuration for the WebSocket service */
export interface WebSocketConfig {
  /** Base URL for the WebSocket server (ws:// or wss://) */
  url: string;
  /** API key for authentication */
  apiKey: string;
  /** Initial reconnection delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnection delay in ms (default: 30000) */
  maxReconnectDelay?: number;
  /** Maximum number of reconnection attempts (default: Infinity) */
  maxReconnectAttempts?: number;
  /** Ping interval in ms to keep connection alive (default: 30000) */
  pingInterval?: number;
}
