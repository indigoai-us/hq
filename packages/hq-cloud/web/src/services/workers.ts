import { apiRequest } from "@/lib/api-client";
import type { WorkerDefinition, SpawnWorkerRequest, SpawnWorkerResponse } from "@/types/worker";

export async function fetchWorkers(): Promise<WorkerDefinition[]> {
  const workers = await apiRequest<WorkerDefinition[]>("/api/workers");
  return workers.filter((w) => w.status === "active");
}

export async function spawnWorker(request: SpawnWorkerRequest): Promise<SpawnWorkerResponse> {
  return apiRequest<SpawnWorkerResponse>("/api/workers/spawn", {
    method: "POST",
    body: request,
  });
}
