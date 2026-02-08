/**
 * Worker status enum
 */
export type WorkerStatus = 'pending' | 'running' | 'waiting_input' | 'completed' | 'failed';

/**
 * All valid worker statuses
 */
export const WORKER_STATUSES: readonly WorkerStatus[] = [
  'pending',
  'running',
  'waiting_input',
  'completed',
  'failed',
] as const;

/**
 * Worker progress tracking
 */
export interface WorkerProgress {
  /** Current step (e.g., 4) */
  current: number;
  /** Total steps (e.g., 6) */
  total: number;
  /** Optional description of current step */
  description?: string;
}

/**
 * Worker record stored in the registry
 */
export interface Worker {
  /** Unique worker identifier */
  id: string;
  /** Human-readable worker name */
  name: string;
  /** Current worker status */
  status: WorkerStatus;
  /** Container ID if running in a container (optional) */
  containerId: string | null;
  /** When the worker was registered */
  registeredAt: Date;
  /** Last heartbeat received from the worker */
  lastHeartbeat: Date | null;
  /** Current task the worker is executing */
  currentTask: string | null;
  /** Progress through the current task */
  progress: WorkerProgress | null;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating a new worker
 */
export interface CreateWorkerInput {
  /** Worker ID (must be unique) */
  id: string;
  /** Human-readable worker name */
  name: string;
  /** Initial status (defaults to 'pending') */
  status?: WorkerStatus;
  /** Container ID if running in a container */
  containerId?: string | null;
  /** Current task the worker is executing */
  currentTask?: string | null;
  /** Progress through the current task */
  progress?: WorkerProgress | null;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for updating a worker
 */
export interface UpdateWorkerInput {
  /** Human-readable worker name */
  name?: string;
  /** Current worker status */
  status?: WorkerStatus;
  /** Container ID if running in a container */
  containerId?: string | null;
  /** Current task the worker is executing */
  currentTask?: string | null;
  /** Progress through the current task */
  progress?: WorkerProgress | null;
  /** Optional metadata (merged with existing) */
  metadata?: Record<string, unknown>;
}

/**
 * Worker registry interface (allows swapping implementations)
 */
export interface WorkerRegistry {
  /** Create a new worker */
  create(input: CreateWorkerInput): Worker;
  /** Get a worker by ID */
  get(id: string): Worker | undefined;
  /** Get all workers */
  getAll(): Worker[];
  /** Update a worker */
  update(id: string, input: UpdateWorkerInput): Worker | undefined;
  /** Delete a worker */
  delete(id: string): boolean;
  /** Update heartbeat for a worker */
  updateHeartbeat(id: string): Worker | undefined;
  /** Get workers by status */
  getByStatus(status: WorkerStatus): Worker[];
  /** Check if a worker exists */
  exists(id: string): boolean;
  /** Get total worker count */
  count: number;
  /** Clear all workers (for testing) */
  clear(): void;
}
