import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { WorkerDefinition, WorkerSkill } from "@/types/worker";

vi.mock("@/services/workers", () => ({
  fetchWorkers: vi.fn(),
  spawnWorker: vi.fn(),
}));

function makeSkill(overrides: Partial<WorkerSkill> = {}): WorkerSkill {
  return {
    id: "skill-1",
    name: "Build Feature",
    description: "Build a feature",
    ...overrides,
  };
}

function makeWorker(overrides: Partial<WorkerDefinition> = {}): WorkerDefinition {
  return {
    id: "worker-1",
    name: "Dev Worker",
    category: "code",
    description: "A dev worker",
    status: "active",
    skills: [makeSkill(), makeSkill({ id: "skill-2", name: "Write Tests" })],
    ...overrides,
  };
}

describe("useSpawnWorker", () => {
  let fetchWorkersMock: ReturnType<typeof vi.fn>;
  let spawnWorkerMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const workersModule = await import("@/services/workers");
    fetchWorkersMock = workersModule.fetchWorkers as ReturnType<typeof vi.fn>;
    spawnWorkerMock = workersModule.spawnWorker as ReturnType<typeof vi.fn>;
  });

  it("starts with loading=true and pick-worker step", async () => {
    fetchWorkersMock.mockResolvedValue([]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    expect(result.current.loading).toBe(true);
    expect(result.current.step).toBe("pick-worker");

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("loads workers on mount", async () => {
    const workers = [makeWorker({ id: "w-1" }), makeWorker({ id: "w-2" })];
    fetchWorkersMock.mockResolvedValue(workers);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workers).toHaveLength(2);
  });

  it("sets error on fetch failure", async () => {
    fetchWorkersMock.mockRejectedValue(new Error("Network error"));
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Network error");
  });

  it("sets generic error for non-Error throws", async () => {
    fetchWorkersMock.mockRejectedValue("something");
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load workers");
  });

  it("selectWorker with multiple skills goes to pick-skill step", async () => {
    fetchWorkersMock.mockResolvedValue([makeWorker()]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectWorker(result.current.workers[0]);
    });

    expect(result.current.step).toBe("pick-skill");
    expect(result.current.selectedWorker).not.toBeNull();
    expect(result.current.selectedSkill).toBeNull();
  });

  it("selectWorker with single skill without params goes to confirm step", async () => {
    const worker = makeWorker({
      skills: [makeSkill({ parameters: undefined })],
    });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectWorker(result.current.workers[0]);
    });

    expect(result.current.step).toBe("confirm");
    expect(result.current.selectedSkill).not.toBeNull();
  });

  it("selectWorker with single skill with params goes to configure step", async () => {
    const worker = makeWorker({
      skills: [
        makeSkill({
          parameters: [
            { name: "branch", label: "Branch", type: "string", required: true },
          ],
        }),
      ],
    });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectWorker(result.current.workers[0]);
    });

    expect(result.current.step).toBe("configure");
  });

  it("selectSkill without params goes to confirm step", async () => {
    fetchWorkersMock.mockResolvedValue([makeWorker()]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectWorker(result.current.workers[0]);
    });

    act(() => {
      result.current.selectSkill(result.current.workers[0].skills[0]);
    });

    expect(result.current.step).toBe("confirm");
    expect(result.current.selectedSkill).not.toBeNull();
  });

  it("selectSkill with params goes to configure step", async () => {
    const skill = makeSkill({
      parameters: [
        { name: "target", label: "Target", type: "string", required: true },
      ],
    });
    const worker = makeWorker({ skills: [skill, makeSkill({ id: "s-2" })] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectWorker(result.current.workers[0]);
    });

    act(() => {
      result.current.selectSkill(skill);
    });

    expect(result.current.step).toBe("configure");
  });

  it("setParameter updates parameters", async () => {
    fetchWorkersMock.mockResolvedValue([makeWorker()]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setParameter("branch", "main");
    });

    expect(result.current.parameters.branch).toBe("main");
  });

  it("goBack from pick-skill goes to pick-worker", async () => {
    fetchWorkersMock.mockResolvedValue([makeWorker()]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectWorker(result.current.workers[0]);
    });

    expect(result.current.step).toBe("pick-skill");

    act(() => {
      result.current.goBack();
    });

    expect(result.current.step).toBe("pick-worker");
    expect(result.current.selectedWorker).toBeNull();
  });

  it("goBack from configure goes to pick-skill when multi-skill worker", async () => {
    const skill = makeSkill({
      parameters: [{ name: "p", label: "P", type: "string" }],
    });
    const worker = makeWorker({ skills: [skill, makeSkill({ id: "s-2" })] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.selectSkill(skill));
    expect(result.current.step).toBe("configure");

    act(() => result.current.goBack());

    expect(result.current.step).toBe("pick-skill");
    expect(result.current.selectedSkill).toBeNull();
  });

  it("goBack from configure goes to pick-worker when single-skill worker", async () => {
    const skill = makeSkill({
      parameters: [{ name: "p", label: "P", type: "string" }],
    });
    const worker = makeWorker({ skills: [skill] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));
    expect(result.current.step).toBe("configure");

    act(() => result.current.goBack());

    expect(result.current.step).toBe("pick-worker");
    expect(result.current.selectedWorker).toBeNull();
    expect(result.current.selectedSkill).toBeNull();
  });

  it("goToConfirm sets step to confirm", async () => {
    fetchWorkersMock.mockResolvedValue([makeWorker()]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goToConfirm());

    expect(result.current.step).toBe("confirm");
  });

  it("confirmSpawn calls spawnWorker and returns result", async () => {
    const worker = makeWorker({ skills: [makeSkill()] });
    fetchWorkersMock.mockResolvedValue([worker]);
    spawnWorkerMock.mockResolvedValue({
      agentId: "agent-1",
      agentName: "Agent 1",
      status: "running",
    });

    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));

    let response: unknown;
    await act(async () => {
      response = await result.current.confirmSpawn();
    });

    expect(spawnWorkerMock).toHaveBeenCalledWith({
      workerId: "worker-1",
      skillId: "skill-1",
      parameters: undefined,
    });
    expect(response).toEqual({
      agentId: "agent-1",
      agentName: "Agent 1",
      status: "running",
    });
  });

  it("confirmSpawn returns null if no worker/skill selected", async () => {
    fetchWorkersMock.mockResolvedValue([]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let response: unknown;
    await act(async () => {
      response = await result.current.confirmSpawn();
    });

    expect(response).toBeNull();
    expect(spawnWorkerMock).not.toHaveBeenCalled();
  });

  it("confirmSpawn sets error on failure", async () => {
    const worker = makeWorker({ skills: [makeSkill()] });
    fetchWorkersMock.mockResolvedValue([worker]);
    spawnWorkerMock.mockRejectedValue(new Error("Spawn failed"));

    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));

    await act(async () => {
      await result.current.confirmSpawn();
    });

    expect(result.current.error).toBe("Spawn failed");
  });

  it("confirmSpawn sets spawning=true during spawn", async () => {
    const worker = makeWorker({ skills: [makeSkill()] });
    fetchWorkersMock.mockResolvedValue([worker]);

    let resolveSpawn!: (value: unknown) => void;
    spawnWorkerMock.mockReturnValue(
      new Promise((res) => {
        resolveSpawn = res;
      }),
    );

    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));

    let spawnPromise: Promise<unknown>;
    act(() => {
      spawnPromise = result.current.confirmSpawn();
    });

    expect(result.current.spawning).toBe(true);

    await act(async () => {
      resolveSpawn({ agentId: "a-1", agentName: "A1", status: "running" });
      await spawnPromise!;
    });

    expect(result.current.spawning).toBe(false);
  });

  it("reset returns to initial state", async () => {
    const worker = makeWorker({ skills: [makeSkill()] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.setParameter("key", "val"));

    act(() => result.current.reset());

    expect(result.current.step).toBe("pick-worker");
    expect(result.current.selectedWorker).toBeNull();
    expect(result.current.selectedSkill).toBeNull();
    expect(result.current.parameters).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it("canProceed is true on non-configure steps", async () => {
    fetchWorkersMock.mockResolvedValue([makeWorker()]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canProceed).toBe(true); // pick-worker
  });

  it("canProceed is false when required params are missing", async () => {
    const skill = makeSkill({
      parameters: [
        { name: "branch", label: "Branch", type: "string", required: true },
      ],
    });
    const worker = makeWorker({ skills: [skill] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));

    expect(result.current.step).toBe("configure");
    expect(result.current.canProceed).toBe(false);
  });

  it("canProceed is true when required params are filled", async () => {
    const skill = makeSkill({
      parameters: [
        { name: "branch", label: "Branch", type: "string", required: true },
      ],
    });
    const worker = makeWorker({ skills: [skill] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));

    act(() => result.current.setParameter("branch", "main"));

    expect(result.current.canProceed).toBe(true);
  });

  it("selectSkill populates default parameter values", async () => {
    const skill = makeSkill({
      parameters: [
        { name: "env", label: "Env", type: "string", defaultValue: "production" },
        { name: "branch", label: "Branch", type: "string" },
      ],
    });
    const worker = makeWorker({ skills: [skill, makeSkill({ id: "s-2" })] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.selectSkill(skill));

    expect(result.current.parameters.env).toBe("production");
    expect(result.current.parameters.branch).toBeUndefined();
  });

  it("goBack from confirm with params goes to configure", async () => {
    const skill = makeSkill({
      parameters: [{ name: "p", label: "P", type: "string" }],
    });
    const worker = makeWorker({ skills: [skill, makeSkill({ id: "s-2" })] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.selectSkill(skill));
    expect(result.current.step).toBe("configure");

    act(() => result.current.goToConfirm());
    expect(result.current.step).toBe("confirm");

    act(() => result.current.goBack());
    expect(result.current.step).toBe("configure");
  });

  it("goBack from confirm without params goes to pick-skill for multi-skill worker", async () => {
    const skill = makeSkill({ parameters: undefined });
    const worker = makeWorker({ skills: [skill, makeSkill({ id: "s-2" })] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useSpawnWorker } = await import("../useSpawnWorker");
    const { result } = renderHook(() => useSpawnWorker());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.selectSkill(skill));
    expect(result.current.step).toBe("confirm");

    act(() => result.current.goBack());
    expect(result.current.step).toBe("pick-skill");
  });
});
