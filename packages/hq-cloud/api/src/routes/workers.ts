import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { getWorkerStore, WORKER_STATUSES, getSpawnQueue, validateWorkerExists } from '../workers/index.js';
import type {
  Worker,
  WorkerStatus,
  WorkerProgress,
  CreateWorkerInput,
  UpdateWorkerInput,
  SpawnRequest,
} from '../workers/index.js';

/** Worker ID validation pattern */
const WORKER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

interface WorkerParams {
  id: string;
}

interface ProgressBody {
  current: number;
  total: number;
  description?: string;
}

interface CreateWorkerBody {
  id: string;
  name: string;
  status?: WorkerStatus;
  containerId?: string | null;
  currentTask?: string | null;
  progress?: ProgressBody | null;
  metadata?: Record<string, unknown>;
}

interface UpdateWorkerBody {
  name?: string;
  status?: WorkerStatus;
  containerId?: string | null;
  currentTask?: string | null;
  progress?: ProgressBody | null;
  metadata?: Record<string, unknown>;
}

interface ListWorkersQuery {
  status?: string;
}

interface SpawnWorkerBody {
  workerId: string;
  skill: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface SpawnRequestResponse {
  trackingId: string;
  workerId: string;
  skill: string;
  parameters: Record<string, unknown>;
  status: string;
  queuedAt: string;
  metadata?: Record<string, unknown>;
}

interface ProgressResponse {
  current: number;
  total: number;
  description?: string;
}

interface WorkerResponse {
  id: string;
  name: string;
  status: WorkerStatus;
  containerId: string | null;
  registeredAt: string;
  lastHeartbeat: string | null;
  currentTask: string | null;
  progress: ProgressResponse | null;
  lastActivity: string;
  metadata?: Record<string, unknown>;
}

function progressToResponse(progress: WorkerProgress | null): ProgressResponse | null {
  if (!progress) return null;
  return {
    current: progress.current,
    total: progress.total,
    description: progress.description,
  };
}

function workerToResponse(worker: Worker): WorkerResponse {
  return {
    id: worker.id,
    name: worker.name,
    status: worker.status,
    containerId: worker.containerId,
    registeredAt: worker.registeredAt.toISOString(),
    lastHeartbeat: worker.lastHeartbeat?.toISOString() ?? null,
    currentTask: worker.currentTask,
    progress: progressToResponse(worker.progress),
    lastActivity: worker.lastActivity.toISOString(),
    metadata: worker.metadata,
  };
}

function isValidWorkerId(id: string): boolean {
  return WORKER_ID_PATTERN.test(id) && id.length >= 1 && id.length <= 128;
}

function isValidWorkerStatus(status: unknown): status is WorkerStatus {
  return typeof status === 'string' && WORKER_STATUSES.includes(status as WorkerStatus);
}

function spawnRequestToResponse(request: SpawnRequest): SpawnRequestResponse {
  return {
    trackingId: request.trackingId,
    workerId: request.workerId,
    skill: request.skill,
    parameters: request.parameters,
    status: request.status,
    queuedAt: request.queuedAt.toISOString(),
    metadata: request.metadata,
  };
}

export const workerRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  const store = getWorkerStore();

  // List all workers (optionally filter by status)
  fastify.get<{ Querystring: ListWorkersQuery }>('/workers', (request, reply) => {
    const { status } = request.query;

    let workers: Worker[];
    if (status) {
      if (!isValidWorkerStatus(status)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Invalid status. Must be one of: ${WORKER_STATUSES.join(', ')}`,
        });
      }
      workers = store.getByStatus(status);
    } else {
      workers = store.getAll();
    }

    return reply.send({
      count: workers.length,
      workers: workers.map(workerToResponse),
    });
  });

  // Get a specific worker
  fastify.get<{ Params: WorkerParams }>('/workers/:id', (request, reply) => {
    const { id } = request.params;
    const worker = store.get(id);

    if (!worker) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Worker '${id}' not found`,
      });
    }

    return reply.send(workerToResponse(worker));
  });

  // Create a new worker
  fastify.post<{ Body: CreateWorkerBody }>('/workers', (request, reply) => {
    const { id, name, status, containerId, metadata } = request.body;

    // Validate required fields
    if (!id || typeof id !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Worker ID is required',
      });
    }

    if (!name || typeof name !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Worker name is required',
      });
    }

    // Validate ID format
    if (!isValidWorkerId(id)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Worker ID must be 1-128 characters and contain only alphanumeric, underscore, or hyphen',
      });
    }

    // Validate name length
    if (name.length < 1 || name.length > 256) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Worker name must be 1-256 characters',
      });
    }

    // Validate status if provided
    if (status !== undefined && !isValidWorkerStatus(status)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Invalid status. Must be one of: ${WORKER_STATUSES.join(', ')}`,
      });
    }

    // Check if worker already exists
    if (store.exists(id)) {
      return reply.status(409).send({
        error: 'Conflict',
        message: `Worker '${id}' already exists`,
      });
    }

    const input: CreateWorkerInput = {
      id,
      name,
      status,
      containerId,
      currentTask: request.body.currentTask,
      progress: request.body.progress,
      metadata,
    };

    const worker = store.create(input);
    return reply.status(201).send(workerToResponse(worker));
  });

  // Update a worker
  fastify.patch<{ Params: WorkerParams; Body: UpdateWorkerBody }>('/workers/:id', (request, reply) => {
    const { id } = request.params;
    const { name, status, containerId, metadata } = request.body;

    // Check if worker exists
    if (!store.exists(id)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Worker '${id}' not found`,
      });
    }

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.length < 1 || name.length > 256) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Worker name must be 1-256 characters',
        });
      }
    }

    // Validate status if provided
    if (status !== undefined && !isValidWorkerStatus(status)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Invalid status. Must be one of: ${WORKER_STATUSES.join(', ')}`,
      });
    }

    const input: UpdateWorkerInput = {
      name,
      status,
      containerId,
      currentTask: request.body.currentTask,
      progress: request.body.progress,
      metadata,
    };

    const worker = store.update(id, input);
    if (!worker) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Worker '${id}' not found`,
      });
    }

    return reply.send(workerToResponse(worker));
  });

  // Delete a worker
  fastify.delete<{ Params: WorkerParams }>('/workers/:id', (request, reply) => {
    const { id } = request.params;

    if (!store.delete(id)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Worker '${id}' not found`,
      });
    }

    return reply.status(204).send();
  });

  // Update worker heartbeat
  fastify.post<{ Params: WorkerParams }>('/workers/:id/heartbeat', (request, reply) => {
    const { id } = request.params;
    const worker = store.updateHeartbeat(id);

    if (!worker) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Worker '${id}' not found`,
      });
    }

    return reply.send(workerToResponse(worker));
  });

  // Request a new worker spawn
  fastify.post<{ Body: SpawnWorkerBody }>('/workers/spawn', (request, reply) => {
    const { workerId, skill, parameters, metadata } = request.body;

    // Validate required fields
    if (!workerId || typeof workerId !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'workerId is required',
      });
    }

    if (!skill || typeof skill !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'skill is required',
      });
    }

    // Validate workerId format
    if (!isValidWorkerId(workerId)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'workerId must be 1-128 characters and contain only alphanumeric, underscore, or hyphen',
      });
    }

    // Validate skill format (same rules as workerId)
    if (!/^[a-zA-Z0-9_-]+$/.test(skill) || skill.length < 1 || skill.length > 128) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'skill must be 1-128 characters and contain only alphanumeric, underscore, or hyphen',
      });
    }

    // Validate worker exists in HQ registry (stub for now)
    if (!validateWorkerExists(workerId)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Worker '${workerId}' not found in registry`,
      });
    }

    // Validate parameters if provided
    if (parameters !== undefined && (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters))) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'parameters must be an object',
      });
    }

    // Queue the spawn request
    const spawnQueue = getSpawnQueue();
    const spawnRequest = spawnQueue.enqueue({
      workerId,
      skill,
      parameters,
      metadata,
    });

    return reply.status(202).send(spawnRequestToResponse(spawnRequest));
  });

  // Get spawn request status by tracking ID
  fastify.get<{ Params: { trackingId: string } }>('/workers/spawn/:trackingId', (request, reply) => {
    const { trackingId } = request.params;
    const spawnQueue = getSpawnQueue();
    const spawnRequest = spawnQueue.get(trackingId);

    if (!spawnRequest) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Spawn request '${trackingId}' not found`,
      });
    }

    return reply.send(spawnRequestToResponse(spawnRequest));
  });

  done();
};
