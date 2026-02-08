import type {
  Worker,
  WorkerRegistry,
  CreateWorkerInput,
  UpdateWorkerInput,
  WorkerStatus,
} from './types.js';

/**
 * Callback invoked when a worker's status or progress changes
 */
export type WorkerChangeCallback = (worker: Worker, changeType: 'create' | 'update' | 'delete') => void;

// Array of registered change callbacks
const changeCallbacks: WorkerChangeCallback[] = [];

/**
 * Register a callback for worker changes
 */
export function onWorkerChange(callback: WorkerChangeCallback): () => void {
  changeCallbacks.push(callback);
  return () => {
    const index = changeCallbacks.indexOf(callback);
    if (index > -1) {
      changeCallbacks.splice(index, 1);
    }
  };
}

/**
 * Notify all callbacks of a worker change
 */
function notifyChange(worker: Worker, changeType: 'create' | 'update' | 'delete'): void {
  for (const callback of changeCallbacks) {
    try {
      callback(worker, changeType);
    } catch {
      // Ignore callback errors
    }
  }
}

/**
 * In-memory worker store.
 * Implements WorkerRegistry interface for easy swapping to DynamoDB/Postgres later.
 */
class InMemoryWorkerStore implements WorkerRegistry {
  private workers: Map<string, Worker> = new Map();

  /**
   * Create a new worker
   */
  create(input: CreateWorkerInput): Worker {
    if (this.workers.has(input.id)) {
      throw new Error(`Worker with ID '${input.id}' already exists`);
    }

    const now = new Date();
    const worker: Worker = {
      id: input.id,
      name: input.name,
      status: input.status ?? 'pending',
      containerId: input.containerId ?? null,
      registeredAt: now,
      lastHeartbeat: null,
      currentTask: input.currentTask ?? null,
      progress: input.progress ?? null,
      lastActivity: now,
      metadata: input.metadata,
    };

    this.workers.set(input.id, worker);
    notifyChange(worker, 'create');
    return worker;
  }

  /**
   * Get a worker by ID
   */
  get(id: string): Worker | undefined {
    return this.workers.get(id);
  }

  /**
   * Get all workers
   */
  getAll(): Worker[] {
    return Array.from(this.workers.values());
  }

  /**
   * Update a worker
   */
  update(id: string, input: UpdateWorkerInput): Worker | undefined {
    const worker = this.workers.get(id);
    if (!worker) {
      return undefined;
    }

    let hasChanges = false;

    if (input.name !== undefined) {
      worker.name = input.name;
      hasChanges = true;
    }

    if (input.status !== undefined) {
      worker.status = input.status;
      hasChanges = true;
    }

    if (input.containerId !== undefined) {
      worker.containerId = input.containerId;
      hasChanges = true;
    }

    if (input.currentTask !== undefined) {
      worker.currentTask = input.currentTask;
      hasChanges = true;
    }

    if (input.progress !== undefined) {
      worker.progress = input.progress;
      hasChanges = true;
    }

    if (input.metadata !== undefined) {
      worker.metadata = { ...worker.metadata, ...input.metadata };
      hasChanges = true;
    }

    if (hasChanges) {
      worker.lastActivity = new Date();
      notifyChange(worker, 'update');
    }

    return worker;
  }

  /**
   * Delete a worker
   */
  delete(id: string): boolean {
    const worker = this.workers.get(id);
    if (worker) {
      this.workers.delete(id);
      notifyChange(worker, 'delete');
      return true;
    }
    return false;
  }

  /**
   * Update heartbeat for a worker
   */
  updateHeartbeat(id: string): Worker | undefined {
    const worker = this.workers.get(id);
    if (!worker) {
      return undefined;
    }

    const now = new Date();
    worker.lastHeartbeat = now;
    worker.lastActivity = now;
    notifyChange(worker, 'update');
    return worker;
  }

  /**
   * Get workers by status
   */
  getByStatus(status: WorkerStatus): Worker[] {
    return Array.from(this.workers.values()).filter((w) => w.status === status);
  }

  /**
   * Check if a worker exists
   */
  exists(id: string): boolean {
    return this.workers.has(id);
  }

  /**
   * Get total worker count
   */
  get count(): number {
    return this.workers.size;
  }

  /**
   * Clear all workers (for testing)
   */
  clear(): void {
    this.workers.clear();
  }
}

// Singleton instance
let store: InMemoryWorkerStore | null = null;

/**
 * Get the worker store singleton
 */
export function getWorkerStore(): WorkerRegistry {
  if (!store) {
    store = new InMemoryWorkerStore();
  }
  return store;
}

/**
 * Reset the store (for testing)
 */
export function resetWorkerStore(): void {
  if (store) {
    store.clear();
  }
  store = null;
}
