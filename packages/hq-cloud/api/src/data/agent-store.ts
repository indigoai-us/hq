/**
 * Agent Store
 *
 * Maps running worker instances (from InMemoryWorkerStore) to the
 * frontend's Agent type. Agents are running instances of workers.
 *
 * Note: The old question/chat stores have been removed (SM-008).
 * Agent questions and messages are now handled via the session system
 * (session-relay.ts, data/session-messages.ts).
 */

import { getWorkerStore } from '../workers/index.js';
import type { Worker } from '../workers/index.js';
import type { Agent, AgentType, AgentStatus } from './types.js';

/**
 * Map runtime worker type metadata to AgentType.
 */
function mapWorkerType(worker: Worker): AgentType {
  const typeHint = worker.metadata?.type as string | undefined;
  if (typeHint) {
    const mapping: Record<string, AgentType> = {
      code: 'code',
      CodeWorker: 'code',
      content: 'content',
      ContentWorker: 'content',
      social: 'social',
      SocialWorker: 'social',
      research: 'research',
      ResearchWorker: 'research',
      ops: 'ops',
      OpsWorker: 'ops',
    };
    if (mapping[typeHint]) return mapping[typeHint];
  }
  return 'code';
}

/**
 * Map runtime WorkerStatus to frontend AgentStatus.
 */
function mapStatus(status: string): AgentStatus {
  const mapping: Record<string, AgentStatus> = {
    pending: 'idle',
    running: 'running',
    waiting_input: 'waiting_input',
    completed: 'completed',
    failed: 'error',
  };
  return mapping[status] ?? 'idle';
}

/**
 * Convert a runtime Worker to the frontend Agent type.
 */
export function workerToAgent(worker: Worker): Agent {
  const agent: Agent = {
    id: worker.id,
    name: worker.name,
    type: mapWorkerType(worker),
    status: mapStatus(worker.status),
    progress: worker.progress
      ? { completed: worker.progress.current, total: worker.progress.total }
      : { completed: 0, total: 0 },
    lastActivity: worker.lastActivity.toISOString(),
  };

  return agent;
}

/**
 * Get all agents (running worker instances mapped to Agent type).
 */
export function getAllAgents(): Agent[] {
  const store = getWorkerStore();
  return store.getAll().map(workerToAgent);
}

/**
 * Get a specific agent by ID.
 */
export function getAgent(id: string): Agent | undefined {
  const store = getWorkerStore();
  const worker = store.get(id);
  if (!worker) return undefined;
  return workerToAgent(worker);
}
