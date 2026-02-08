import type { WebSocket } from 'ws';

export interface ClientConnection {
  deviceId: string;
  socket: WebSocket;
  connectedAt: Date;
  lastPing: Date;
  isAlive: boolean;
  /** Worker IDs this client is subscribed to (empty Set = all workers) */
  workerSubscriptions: Set<string>;
  /** Whether subscribed to all workers */
  subscribedToAll: boolean;
}

export interface ConnectionRegistry {
  add(deviceId: string, socket: WebSocket): void;
  remove(deviceId: string): void;
  get(deviceId: string): ClientConnection | undefined;
  getAll(): ClientConnection[];
  updatePing(deviceId: string): void;
  markDead(deviceId: string): void;
  size: number;
}

export interface WebSocketMessage {
  type: string;
  payload?: unknown;
}

export interface PingMessage extends WebSocketMessage {
  type: 'ping';
}

export interface PongMessage extends WebSocketMessage {
  type: 'pong';
  timestamp: number;
}

export interface ConnectedMessage extends WebSocketMessage {
  type: 'connected';
  payload: {
    deviceId: string;
    timestamp: number;
  };
}

export interface ErrorMessage extends WebSocketMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
  };
}

/**
 * Subscribe to worker status updates
 */
export interface SubscribeMessage extends WebSocketMessage {
  type: 'subscribe';
  payload: {
    /** Worker IDs to subscribe to. Empty array or omit for all workers */
    workerIds?: string[];
  };
}

/**
 * Unsubscribe from worker status updates
 */
export interface UnsubscribeMessage extends WebSocketMessage {
  type: 'unsubscribe';
  payload: {
    /** Worker IDs to unsubscribe from. Empty array or omit to unsubscribe from all */
    workerIds?: string[];
  };
}

/**
 * Subscription confirmation message
 */
export interface SubscribedMessage extends WebSocketMessage {
  type: 'subscribed';
  payload: {
    /** Worker IDs currently subscribed to. Empty if subscribed to all */
    workerIds: string[];
    /** Whether subscribed to all workers */
    all: boolean;
  };
}

/**
 * Worker progress info for status updates
 */
export interface WorkerProgressPayload {
  current: number;
  total: number;
  description?: string;
}

/**
 * Worker status update message sent to subscribed clients
 */
export interface WorkerStatusMessage extends WebSocketMessage {
  type: 'worker_status';
  payload: {
    /** Worker ID */
    workerId: string;
    /** Change type */
    changeType: 'create' | 'update' | 'delete';
    /** Worker status */
    status: string;
    /** Current task the worker is executing */
    currentTask: string | null;
    /** Progress through the current task */
    progress: WorkerProgressPayload | null;
    /** Last activity timestamp (ISO string) */
    lastActivity: string;
    /** Worker name */
    name: string;
    /** Timestamp of this update */
    timestamp: number;
  };
}

/**
 * Question option payload
 */
export interface QuestionOptionPayload {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 * New question message sent to subscribed clients
 */
export interface WorkerQuestionMessage extends WebSocketMessage {
  type: 'worker_question';
  payload: {
    /** Question ID */
    questionId: string;
    /** Worker ID that submitted the question */
    workerId: string;
    /** Question text */
    text: string;
    /** Answer options (empty if free-form) */
    options: QuestionOptionPayload[];
    /** Timestamp of this message */
    timestamp: number;
  };
}

/**
 * Question answered message sent to subscribed clients
 */
export interface QuestionAnsweredMessage extends WebSocketMessage {
  type: 'question_answered';
  payload: {
    /** Question ID */
    questionId: string;
    /** Worker ID */
    workerId: string;
    /** The answer provided */
    answer: string;
    /** When the question was answered (ISO string) */
    answeredAt: string;
    /** Timestamp of this message */
    timestamp: number;
  };
}

/**
 * Chat message role
 */
export type ChatMessageRole = 'worker' | 'user' | 'system';

/**
 * New chat message sent to subscribed clients
 */
export interface ChatMessageNotification extends WebSocketMessage {
  type: 'chat_message';
  payload: {
    /** Message ID */
    messageId: string;
    /** Worker ID */
    workerId: string;
    /** Message role */
    role: ChatMessageRole;
    /** Message content */
    content: string;
    /** When the message was created (ISO string) */
    timestamp: string;
    /** Optional metadata */
    metadata?: Record<string, unknown>;
  };
}
