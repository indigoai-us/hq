/**
 * Shared types for HQ data layer.
 * These match the frontend types in web/src/types/.
 */

// --- Worker Definitions (from registry.yaml) ---

export type WorkerCategory = 'code' | 'content' | 'social' | 'research' | 'ops';

export interface WorkerSkill {
  id: string;
  name: string;
  description: string;
}

export interface WorkerDefinition {
  id: string;
  name: string;
  category: WorkerCategory;
  description: string;
  status: 'active' | 'inactive' | 'deprecated';
  skills: WorkerSkill[];
}

// --- Agents (running worker instances) ---

export type AgentStatus = 'running' | 'waiting_input' | 'completed' | 'error' | 'idle';

export type AgentType = 'research' | 'content' | 'ops' | 'code' | 'social';

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
  role: 'agent' | 'user' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolName?: string;
  toolStatus?: 'running' | 'completed' | 'failed';
}

// --- Navigator (HQ file tree) ---

export type NavigatorNodeType = 'company' | 'project' | 'worker' | 'knowledge' | 'file';

export type NavigatorNodeStatus = 'healthy' | 'warning' | 'error' | 'idle';

export interface NavigatorNode {
  id: string;
  name: string;
  type: NavigatorNodeType;
  status: NavigatorNodeStatus;
  children?: NavigatorNode[];
  filePath?: string;
}

export interface NavigatorGroup {
  id: string;
  name: string;
  children: NavigatorNode[];
}

export interface NavigatorTreeResponse {
  groups: NavigatorGroup[];
}
