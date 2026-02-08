/**
 * Spawn Queue - In-memory queue for worker spawn requests
 *
 * Queues spawn requests for processing by the orchestrator.
 * This is an in-memory implementation; replace with SQS/Redis for production.
 */

/**
 * Spawn request status
 */
export type SpawnRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * A spawn request in the queue
 */
export interface SpawnRequest {
  /** Unique tracking ID for this spawn request */
  trackingId: string;
  /** ID of the worker type to spawn (from HQ registry) */
  workerId: string;
  /** Skill to execute on the worker */
  skill: string;
  /** Parameters for the skill execution */
  parameters: Record<string, unknown>;
  /** Current status of the spawn request */
  status: SpawnRequestStatus;
  /** When the request was queued */
  queuedAt: Date;
  /** When the request started processing */
  startedAt: Date | null;
  /** When the request completed */
  completedAt: Date | null;
  /** Error message if failed */
  error: string | null;
  /** Metadata from the request */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating a spawn request
 */
export interface CreateSpawnRequestInput {
  /** ID of the worker type to spawn */
  workerId: string;
  /** Skill to execute */
  skill: string;
  /** Parameters for the skill */
  parameters?: Record<string, unknown>;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Callback for when a spawn request is added to the queue
 */
export type SpawnQueueCallback = (request: SpawnRequest) => void;

// Array of registered queue callbacks
const queueCallbacks: SpawnQueueCallback[] = [];

/**
 * Register a callback for new spawn requests
 */
export function onSpawnQueued(callback: SpawnQueueCallback): () => void {
  queueCallbacks.push(callback);
  return () => {
    const index = queueCallbacks.indexOf(callback);
    if (index > -1) {
      queueCallbacks.splice(index, 1);
    }
  };
}

/**
 * Notify all callbacks of a new spawn request
 */
function notifyQueued(request: SpawnRequest): void {
  for (const callback of queueCallbacks) {
    try {
      callback(request);
    } catch {
      // Ignore callback errors
    }
  }
}

/**
 * Generate a unique tracking ID
 */
function generateTrackingId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `spawn-${timestamp}-${random}`;
}

/**
 * In-memory spawn queue
 */
class InMemorySpawnQueue {
  private requests: Map<string, SpawnRequest> = new Map();
  private pendingQueue: string[] = [];

  /**
   * Add a spawn request to the queue
   */
  enqueue(input: CreateSpawnRequestInput): SpawnRequest {
    const trackingId = generateTrackingId();
    const now = new Date();

    const request: SpawnRequest = {
      trackingId,
      workerId: input.workerId,
      skill: input.skill,
      parameters: input.parameters ?? {},
      status: 'pending',
      queuedAt: now,
      startedAt: null,
      completedAt: null,
      error: null,
      metadata: input.metadata,
    };

    this.requests.set(trackingId, request);
    this.pendingQueue.push(trackingId);
    notifyQueued(request);

    return request;
  }

  /**
   * Get a spawn request by tracking ID
   */
  get(trackingId: string): SpawnRequest | undefined {
    return this.requests.get(trackingId);
  }

  /**
   * Dequeue the next pending request for processing
   */
  dequeue(): SpawnRequest | undefined {
    const trackingId = this.pendingQueue.shift();
    if (!trackingId) {
      return undefined;
    }

    const request = this.requests.get(trackingId);
    if (request) {
      request.status = 'processing';
      request.startedAt = new Date();
    }

    return request;
  }

  /**
   * Mark a request as completed
   */
  complete(trackingId: string): SpawnRequest | undefined {
    const request = this.requests.get(trackingId);
    if (!request) {
      return undefined;
    }

    request.status = 'completed';
    request.completedAt = new Date();
    return request;
  }

  /**
   * Mark a request as failed
   */
  fail(trackingId: string, error: string): SpawnRequest | undefined {
    const request = this.requests.get(trackingId);
    if (!request) {
      return undefined;
    }

    request.status = 'failed';
    request.completedAt = new Date();
    request.error = error;
    return request;
  }

  /**
   * Get all pending requests
   */
  getPending(): SpawnRequest[] {
    return this.pendingQueue
      .map((id) => this.requests.get(id))
      .filter((r): r is SpawnRequest => r !== undefined);
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.pendingQueue.length;
  }

  /**
   * Get total request count (including completed/failed)
   */
  get totalCount(): number {
    return this.requests.size;
  }

  /**
   * Clear the queue (for testing)
   */
  clear(): void {
    this.requests.clear();
    this.pendingQueue = [];
  }
}

// Singleton instance
let queue: InMemorySpawnQueue | null = null;

/**
 * Get the spawn queue singleton
 */
export function getSpawnQueue(): InMemorySpawnQueue {
  if (!queue) {
    queue = new InMemorySpawnQueue();
  }
  return queue;
}

/**
 * Reset the spawn queue (for testing)
 */
export function resetSpawnQueue(): void {
  if (queue) {
    queue.clear();
  }
  queue = null;
}

/**
 * Stub validator for worker existence in HQ registry.
 * In production, this would query the actual HQ worker registry.
 * For now, returns true for any alphanumeric worker ID.
 */
export function validateWorkerExists(workerId: string): boolean {
  // Stub: accept any valid-looking worker ID
  // TODO: Connect to actual HQ worker registry
  return /^[a-zA-Z0-9_-]+$/.test(workerId) && workerId.length >= 1 && workerId.length <= 128;
}
