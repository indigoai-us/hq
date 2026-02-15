/**
 * Worker service - API calls for worker registry and spawning.
 * MOB-011: Spawn worker from mobile
 */
import { apiRequest } from "./api";
import type {
  WorkerDefinition,
  SpawnWorkerRequest,
  SpawnWorkerResponse,
} from "../types";

/**
 * Fetch available workers from the registry.
 * Returns only active workers with their skills.
 */
export async function fetchWorkers(): Promise<WorkerDefinition[]> {
  return apiRequest<WorkerDefinition[]>("/api/workers");
}

/**
 * Spawn a new worker instance with the specified skill and parameters.
 * Returns the newly created agent details.
 */
export async function spawnWorker(
  request: SpawnWorkerRequest,
): Promise<SpawnWorkerResponse> {
  return apiRequest<SpawnWorkerResponse>("/api/workers/spawn", {
    method: "POST",
    body: request,
  });
}
