/**
 * Tests for useSpawnWorker hook.
 * MOB-011: Spawn worker from mobile
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useSpawnWorker } from "../../src/hooks/useSpawnWorker";
import { fetchWorkers, spawnWorker } from "../../src/services/workers";
import type { WorkerDefinition } from "../../src/types";

jest.mock("../../src/services/workers", () => ({
  fetchWorkers: jest.fn(),
  spawnWorker: jest.fn(),
}));

const mockFetchWorkers = fetchWorkers as jest.MockedFunction<typeof fetchWorkers>;
const mockSpawnWorker = spawnWorker as jest.MockedFunction<typeof spawnWorker>;

const workerWithMultipleSkills: WorkerDefinition = {
  id: "frontend-dev",
  name: "Frontend Developer",
  category: "code",
  description: "Builds React components",
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
    {
      id: "fix-bug",
      name: "Fix Bug",
      description: "Fix a bug in existing code",
      parameters: [],
    },
  ],
};

const workerWithSingleSkillNoParams: WorkerDefinition = {
  id: "analyst",
  name: "Analyst",
  category: "research",
  description: "Performs analysis",
  status: "active",
  skills: [
    {
      id: "analyze",
      name: "Analyze",
      description: "Run analysis",
    },
  ],
};

const workerWithSingleSkillWithParams: WorkerDefinition = {
  id: "content-brand",
  name: "Content Brand",
  category: "content",
  description: "Creates branded content",
  status: "active",
  skills: [
    {
      id: "draft",
      name: "Draft Post",
      description: "Draft a social post",
      parameters: [
        {
          name: "topic",
          label: "Topic",
          type: "string",
          required: true,
        },
        {
          name: "tone",
          label: "Tone",
          type: "select",
          options: ["professional", "casual", "humorous"],
        },
      ],
    },
  ],
};

const sampleWorkers: WorkerDefinition[] = [
  workerWithMultipleSkills,
  workerWithSingleSkillNoParams,
  workerWithSingleSkillWithParams,
];

describe("useSpawnWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts in loading state and loads workers", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    expect(result.current.loading).toBe(true);
    expect(result.current.step).toBe("pick-worker");

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.workers).toEqual(sampleWorkers);
    expect(result.current.error).toBeNull();
  });

  it("sets error state when fetch fails", async () => {
    mockFetchWorkers.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.workers).toEqual([]);
  });

  it("advances to pick-skill when selecting a worker with multiple skills", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });

    expect(result.current.step).toBe("pick-skill");
    expect(result.current.selectedWorker).toEqual(workerWithMultipleSkills);
  });

  it("auto-selects skill and skips to confirm when worker has single skill without params", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithSingleSkillNoParams);
    });

    expect(result.current.step).toBe("confirm");
    expect(result.current.selectedWorker).toEqual(workerWithSingleSkillNoParams);
    expect(result.current.selectedSkill).toEqual(workerWithSingleSkillNoParams.skills[0]);
  });

  it("auto-selects skill and goes to configure when worker has single skill with params", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithSingleSkillWithParams);
    });

    expect(result.current.step).toBe("configure");
    expect(result.current.selectedSkill).toEqual(workerWithSingleSkillWithParams.skills[0]);
  });

  it("advances to configure when selecting a skill with parameters", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });

    act(() => {
      result.current.selectSkill(workerWithMultipleSkills.skills[0]); // has params
    });

    expect(result.current.step).toBe("configure");
    expect(result.current.selectedSkill).toEqual(workerWithMultipleSkills.skills[0]);
  });

  it("advances to confirm when selecting a skill without parameters", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });

    act(() => {
      result.current.selectSkill(workerWithMultipleSkills.skills[1]); // no params
    });

    expect(result.current.step).toBe("confirm");
  });

  it("sets parameters correctly", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });

    act(() => {
      result.current.selectSkill(workerWithMultipleSkills.skills[0]);
    });

    act(() => {
      result.current.setParameter("componentName", "UserCard");
    });

    expect(result.current.parameters).toEqual({ componentName: "UserCard" });
  });

  it("canProceed is false when required parameters are missing", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });

    act(() => {
      result.current.selectSkill(workerWithMultipleSkills.skills[0]);
    });

    expect(result.current.canProceed).toBe(false);

    act(() => {
      result.current.setParameter("componentName", "UserCard");
    });

    expect(result.current.canProceed).toBe(true);
  });

  it("canProceed is true when no required parameters exist", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });

    act(() => {
      result.current.selectSkill(workerWithMultipleSkills.skills[1]); // no params
    });

    expect(result.current.canProceed).toBe(true);
  });

  it("goToConfirm advances to confirm step", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });

    act(() => {
      result.current.selectSkill(workerWithMultipleSkills.skills[0]);
    });

    act(() => {
      result.current.goToConfirm();
    });

    expect(result.current.step).toBe("confirm");
  });

  it("goBack navigates back through steps correctly", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // pick-worker -> pick-skill
    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });
    expect(result.current.step).toBe("pick-skill");

    // pick-skill -> pick-worker
    act(() => {
      result.current.goBack();
    });
    expect(result.current.step).toBe("pick-worker");
    expect(result.current.selectedWorker).toBeNull();

    // Again: pick-worker -> pick-skill -> configure
    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });
    act(() => {
      result.current.selectSkill(workerWithMultipleSkills.skills[0]);
    });
    expect(result.current.step).toBe("configure");

    // configure -> pick-skill
    act(() => {
      result.current.goBack();
    });
    expect(result.current.step).toBe("pick-skill");
  });

  it("confirmSpawn calls spawnWorker and returns result", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    mockSpawnWorker.mockResolvedValue({
      agentId: "agent-123",
      agentName: "Frontend Developer",
      status: "running",
    });

    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });

    act(() => {
      result.current.selectSkill(workerWithMultipleSkills.skills[1]);
    });

    let spawnResult: unknown;
    await act(async () => {
      spawnResult = await result.current.confirmSpawn();
    });

    expect(mockSpawnWorker).toHaveBeenCalledWith({
      workerId: "frontend-dev",
      skillId: "fix-bug",
      parameters: undefined,
    });
    expect(spawnResult).toEqual({
      agentId: "agent-123",
      agentName: "Frontend Developer",
      status: "running",
    });
  });

  it("confirmSpawn sets error on failure and returns null", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    mockSpawnWorker.mockRejectedValue(new Error("Spawn failed"));

    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithSingleSkillNoParams);
    });

    let spawnResult: unknown;
    await act(async () => {
      spawnResult = await result.current.confirmSpawn();
    });

    expect(spawnResult).toBeNull();
    expect(result.current.error).toBe("Spawn failed");
  });

  it("reset returns to initial state", async () => {
    mockFetchWorkers.mockResolvedValue(sampleWorkers);
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectWorker(workerWithMultipleSkills);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.step).toBe("pick-worker");
    expect(result.current.selectedWorker).toBeNull();
    expect(result.current.selectedSkill).toBeNull();
    expect(result.current.parameters).toEqual({});
  });
});
