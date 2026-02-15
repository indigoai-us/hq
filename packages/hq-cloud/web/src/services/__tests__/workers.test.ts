import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchWorkers, spawnWorker } from "../workers";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/api-client";

const mockApiRequest = vi.mocked(apiRequest);

describe("workers service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchWorkers", () => {
    it("calls apiRequest with /api/workers", async () => {
      mockApiRequest.mockResolvedValue([
        { id: "w1", name: "Worker 1", category: "code", status: "active", skills: [] },
      ]);

      await fetchWorkers();
      expect(mockApiRequest).toHaveBeenCalledWith("/api/workers");
    });

    it("returns only active workers", async () => {
      mockApiRequest.mockResolvedValue([
        { id: "w1", name: "Active Worker", category: "code", status: "active", skills: [] },
        { id: "w2", name: "Inactive Worker", category: "ops", status: "inactive", skills: [] },
        { id: "w3", name: "Deprecated Worker", category: "research", status: "deprecated", skills: [] },
      ]);

      const result = await fetchWorkers();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("w1");
    });

    it("returns empty array when all workers are inactive", async () => {
      mockApiRequest.mockResolvedValue([
        { id: "w1", name: "Inactive", category: "code", status: "inactive", skills: [] },
        { id: "w2", name: "Deprecated", category: "ops", status: "deprecated", skills: [] },
      ]);

      const result = await fetchWorkers();
      expect(result).toEqual([]);
    });

    it("returns empty array when no workers exist", async () => {
      mockApiRequest.mockResolvedValue([]);

      const result = await fetchWorkers();
      expect(result).toEqual([]);
    });

    it("returns all workers when all are active", async () => {
      const workers = [
        { id: "w1", name: "Worker 1", category: "code", status: "active", skills: [] },
        { id: "w2", name: "Worker 2", category: "content", status: "active", skills: [] },
        { id: "w3", name: "Worker 3", category: "social", status: "active", skills: [] },
      ];
      mockApiRequest.mockResolvedValue(workers);

      const result = await fetchWorkers();
      expect(result).toHaveLength(3);
    });

    it("propagates errors from apiRequest", async () => {
      mockApiRequest.mockRejectedValue(new Error("Not authenticated. Please log in."));
      await expect(fetchWorkers()).rejects.toThrow("Not authenticated");
    });
  });

  describe("spawnWorker", () => {
    it("sends POST to /api/workers/spawn with request body", async () => {
      const response = { agentId: "agent-123", agentName: "CodeWorker", status: "running" };
      mockApiRequest.mockResolvedValue(response);

      const request = { workerId: "w1", skillId: "implement-feature" };
      const result = await spawnWorker(request);

      expect(mockApiRequest).toHaveBeenCalledWith("/api/workers/spawn", {
        method: "POST",
        body: request,
      });
      expect(result).toEqual(response);
    });

    it("includes parameters in the spawn request", async () => {
      mockApiRequest.mockResolvedValue({
        agentId: "agent-456",
        agentName: "Analyst",
        status: "running",
      });

      const request = {
        workerId: "analyst",
        skillId: "market-research",
        parameters: { topic: "AI trends", depth: "comprehensive" },
      };
      await spawnWorker(request);

      expect(mockApiRequest).toHaveBeenCalledWith("/api/workers/spawn", {
        method: "POST",
        body: request,
      });
    });

    it("propagates errors from apiRequest", async () => {
      mockApiRequest.mockRejectedValue(new Error("API error 500: Internal Server Error"));
      await expect(
        spawnWorker({ workerId: "w1", skillId: "s1" }),
      ).rejects.toThrow("500");
    });

    it("returns spawn response with agent details", async () => {
      const expectedResponse = {
        agentId: "new-agent-789",
        agentName: "ContentWriter",
        status: "initializing",
      };
      mockApiRequest.mockResolvedValue(expectedResponse);

      const result = await spawnWorker({ workerId: "content-writer", skillId: "draft" });
      expect(result.agentId).toBe("new-agent-789");
      expect(result.agentName).toBe("ContentWriter");
      expect(result.status).toBe("initializing");
    });
  });
});
