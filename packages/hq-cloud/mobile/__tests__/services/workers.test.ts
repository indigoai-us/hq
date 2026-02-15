/**
 * Tests for workers service.
 * MOB-011: Spawn worker from mobile
 */
import { fetchWorkers, spawnWorker } from "../../src/services/workers";
import { apiRequest } from "../../src/services/api";
import type { WorkerDefinition, SpawnWorkerResponse } from "../../src/types";

jest.mock("../../src/services/api", () => ({
  apiRequest: jest.fn(),
}));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const sampleWorkers: WorkerDefinition[] = [
  {
    id: "frontend-dev",
    name: "Frontend Developer",
    category: "code",
    description: "Builds React components and UI",
    status: "active",
    skills: [
      {
        id: "build-component",
        name: "Build Component",
        description: "Create a new React component",
        parameters: [
          {
            name: "componentName",
            label: "Component Name",
            type: "string",
            required: true,
            placeholder: "e.g., UserCard",
          },
        ],
      },
    ],
  },
];

const sampleSpawnResponse: SpawnWorkerResponse = {
  agentId: "agent-123",
  agentName: "Frontend Developer",
  status: "running",
};

describe("workers service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchWorkers", () => {
    it("calls API with correct path", async () => {
      mockApiRequest.mockResolvedValue(sampleWorkers);
      const result = await fetchWorkers();

      expect(mockApiRequest).toHaveBeenCalledWith("/api/workers");
      expect(result).toEqual(sampleWorkers);
    });

    it("propagates API errors", async () => {
      mockApiRequest.mockRejectedValue(new Error("Network error"));
      await expect(fetchWorkers()).rejects.toThrow("Network error");
    });
  });

  describe("spawnWorker", () => {
    it("calls API with correct path and body", async () => {
      mockApiRequest.mockResolvedValue(sampleSpawnResponse);
      const request = {
        workerId: "frontend-dev",
        skillId: "build-component",
        parameters: { componentName: "UserCard" },
      };

      const result = await spawnWorker(request);

      expect(mockApiRequest).toHaveBeenCalledWith("/api/workers/spawn", {
        method: "POST",
        body: request,
      });
      expect(result).toEqual(sampleSpawnResponse);
    });

    it("calls API without parameters when none provided", async () => {
      mockApiRequest.mockResolvedValue(sampleSpawnResponse);
      const request = {
        workerId: "frontend-dev",
        skillId: "build-component",
      };

      await spawnWorker(request);

      expect(mockApiRequest).toHaveBeenCalledWith("/api/workers/spawn", {
        method: "POST",
        body: request,
      });
    });

    it("propagates API errors", async () => {
      mockApiRequest.mockRejectedValue(new Error("Server error"));
      await expect(
        spawnWorker({ workerId: "x", skillId: "y" }),
      ).rejects.toThrow("Server error");
    });
  });
});
