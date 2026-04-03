// Shared types for hq-cloud host process

export type MessageStatus = 'pending' | 'processing' | 'done' | 'failed';
export type SessionStatus = 'active' | 'idle' | 'terminated';
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Message {
  id: number;
  group_id: string;
  chat_id: string;
  channel: string;
  sender_id: string;
  sender_name: string;
  content: string;
  status: MessageStatus;
  created_at: number;
  processed_at: number | null;
  container_id: string | null;
  error: string | null;
}

export interface Chat {
  id: string;
  channel: string;
  group_id: string;
  title: string | null;
  created_at: number;
  last_message_at: number;
}

export interface Session {
  id: string;
  group_id: string;
  chat_id: string;
  container_id: string | null;
  status: SessionStatus;
  started_at: number;
  ended_at: number | null;
  message_count: number;
}

export interface ScheduledTask {
  id: number;
  group_id: string;
  task_type: string;
  payload: string; // JSON string
  status: TaskStatus;
  scheduled_at: number;
  run_at: number | null;
  error: string | null;
}

export interface ContainerMount {
  src: string;
  dst: string;
  readOnly: boolean;
}

export interface ContainerRunOptions {
  image: string;
  groupId: string;
  sessionId: string;
  messageId: number;
  mounts: ContainerMount[];
  env: Record<string, string>;
  timeoutMs: number;
}

export interface ContainerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface IpcRequest {
  messageId: number;
  groupId: string;
  chatId: string;
  sessionId: string;
  content: string;
  senderName: string;
  channel: string;
  timestamp: number;
}

export interface IpcResponse {
  messageId: number;
  success: boolean;
  reply: string | null;
  error: string | null;
  timestamp: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  uptime: number;
  queueDepth: number;
  activeContainers: number;
  timestamp: number;
}
