/**
 * Agent/Worker types for HQ Cloud Mobile.
 */

export type AgentStatus = "running" | "waiting_input" | "completed" | "error" | "idle";

export type AgentType = "research" | "content" | "ops" | "code" | "social";

export interface AgentQuestion {
  id: string;
  text: string;
  options?: string[];
  askedAt: string;
}

export interface AgentPermissionRequest {
  id: string;
  tool: string;
  description: string;
  requestedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  progress: {
    completed: number;
    total: number;
  };
  currentQuestion?: AgentQuestion;
  currentPermission?: AgentPermissionRequest;
  lastActivity: string;
}

export interface AgentMessage {
  id: string;
  role: "agent" | "user" | "system" | "tool";
  content: string;
  timestamp: string;
  toolName?: string;
  toolStatus?: "running" | "completed" | "failed";
}
