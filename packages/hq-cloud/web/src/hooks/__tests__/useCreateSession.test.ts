import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { WorkerDefinition, WorkerSkill } from "@/types/worker";
import type { Session } from "@/types/session";

vi.mock("@/services/workers", () => ({
  fetchWorkers: vi.fn(),
}));

vi.mock("@/services/sessions", () => ({
  createSession: vi.fn(),
}));

function makeSkill(overrides: Partial<WorkerSkill> = {}): WorkerSkill {
  return {
    id: "skill-1",
    name: "Build Feature",
    description: "Build a feature end-to-end",
    ...overrides,
  };
}

function makeWorker(overrides: Partial<WorkerDefinition> = {}): WorkerDefinition {
  return {
    id: "frontend-dev",
    name: "Frontend Dev",
    category: "code",
    description: "A frontend developer",
    status: "active",
    skills: [makeSkill(), makeSkill({ id: "skill-2", name: "Write Tests" })],
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: "sess-123",
    userId: "user-1",
    status: "starting",
    ecsTaskArn: null,
    initialPrompt: "Test prompt",
    workerContext: null,
    messageCount: 0,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    stoppedAt: null,
    error: null,
    ...overrides,
  };
}

describe("useCreateSession", () => {
  let fetchWorkersMock: ReturnType<typeof vi.fn>;
  let createSessionMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const workersModule = await import("@/services/workers");
    const sessionsModule = await import("@/services/sessions");
    fetchWorkersMock = workersModule.fetchWorkers as ReturnType<typeof vi.fn>;
    createSessionMock = sessionsModule.createSession as ReturnType<typeof vi.fn>;
  });

  it("starts in choose mode", async () => {
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());
    expect(result.current.mode).toBe("choose");
    expect(result.current.creating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("setMode to free-form changes mode", async () => {
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("free-form"));
    expect(result.current.mode).toBe("free-form");
  });

  it("setMode to worker loads workers", async () => {
    fetchWorkersMock.mockResolvedValue([makeWorker()]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    expect(result.current.mode).toBe("worker");

    await waitFor(() => expect(result.current.workersLoading).toBe(false));
    expect(fetchWorkersMock).toHaveBeenCalled();
    expect(result.current.workers).toHaveLength(1);
  });

  it("setMode to worker sets error on fetch failure", async () => {
    fetchWorkersMock.mockRejectedValue(new Error("Network error"));
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));

    await waitFor(() => expect(result.current.workersLoading).toBe(false));
    expect(result.current.workersError).toBe("Network error");
  });

  it("selectWorker with multiple skills goes to pick-skill", async () => {
    fetchWorkersMock.mockResolvedValue([makeWorker()]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(result.current.workers[0]));
    expect(result.current.workerStep).toBe("pick-skill");
    expect(result.current.selectedWorker).not.toBeNull();
  });

  it("selectWorker with single skill without params goes to review", async () => {
    const worker = makeWorker({ skills: [makeSkill({ parameters: undefined })] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    expect(result.current.workerStep).toBe("review");
    expect(result.current.selectedSkill).not.toBeNull();
  });

  it("selectWorker with single skill with params goes to configure", async () => {
    const skill = makeSkill({
      parameters: [{ name: "branch", label: "Branch", type: "string", required: true }],
    });
    const worker = makeWorker({ skills: [skill] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    expect(result.current.workerStep).toBe("configure");
  });

  it("selectSkill without params goes to review", async () => {
    const worker = makeWorker();
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.selectSkill(worker.skills[0]));
    expect(result.current.workerStep).toBe("review");
  });

  it("selectSkill with params goes to configure", async () => {
    const skill = makeSkill({
      parameters: [{ name: "p", label: "P", type: "string" }],
    });
    const worker = makeWorker({ skills: [skill, makeSkill({ id: "s-2" })] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.selectSkill(skill));
    expect(result.current.workerStep).toBe("configure");
  });

  it("canProceedWorker is false when required params are missing", async () => {
    const skill = makeSkill({
      parameters: [{ name: "branch", label: "Branch", type: "string", required: true }],
    });
    const worker = makeWorker({ skills: [skill] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    expect(result.current.workerStep).toBe("configure");
    expect(result.current.canProceedWorker).toBe(false);
  });

  it("canProceedWorker is true when required params are filled", async () => {
    const skill = makeSkill({
      parameters: [{ name: "branch", label: "Branch", type: "string", required: true }],
    });
    const worker = makeWorker({ skills: [skill] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.setParameter("branch", "main"));
    expect(result.current.canProceedWorker).toBe(true);
  });

  it("free-form label is auto-generated from prompt (under 50 chars)", async () => {
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("free-form"));
    act(() => result.current.setFreeFormPrompt("Fix the login bug"));

    expect(result.current.label).toBe("Fix the login bug");
  });

  it("free-form label is truncated for long prompts", async () => {
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("free-form"));
    act(() =>
      result.current.setFreeFormPrompt(
        "This is a very long prompt that should be truncated because it exceeds fifty characters"
      ),
    );

    expect(result.current.label.length).toBeLessThanOrEqual(53); // 50 + "..."
    expect(result.current.label).toContain("...");
  });

  it("worker label is worker name + skill name", async () => {
    const worker = makeWorker({ name: "Backend Dev", skills: [makeSkill({ name: "Deploy" })] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    expect(result.current.label).toBe("Backend Dev - Deploy");
  });

  it("confirm in free-form mode creates session with prompt and label", async () => {
    const session = makeSession();
    createSessionMock.mockResolvedValue(session);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("free-form"));
    act(() => result.current.setFreeFormPrompt("Fix the login bug"));

    let returnedSession: unknown;
    await act(async () => {
      returnedSession = await result.current.confirm();
    });

    expect(createSessionMock).toHaveBeenCalledWith({
      prompt: "Fix the login bug",
      label: "Fix the login bug",
    });
    expect(returnedSession).toEqual(session);
  });

  it("confirm in worker mode creates session with worker context", async () => {
    const skill = makeSkill({ id: "deploy", name: "Deploy" });
    const worker = makeWorker({ id: "backend-dev", name: "Backend Dev", skills: [skill] });
    const session = makeSession();
    fetchWorkersMock.mockResolvedValue([worker]);
    createSessionMock.mockResolvedValue(session);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));

    let returnedSession: unknown;
    await act(async () => {
      returnedSession = await result.current.confirm();
    });

    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Backend Dev - Deploy",
        workerId: "backend-dev",
        skillId: "deploy",
        workerContext: "backend-dev/deploy",
      }),
    );
    expect(returnedSession).toEqual(session);
  });

  it("confirm returns null and sets error on empty free-form prompt", async () => {
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("free-form"));
    // Don't set a prompt

    let returnedSession: unknown;
    await act(async () => {
      returnedSession = await result.current.confirm();
    });

    expect(returnedSession).toBeNull();
    expect(result.current.error).toBe("Please provide a prompt or select a worker");
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("confirm sets rate-limit error on 429", async () => {
    createSessionMock.mockRejectedValue(new Error("API error 429: Too Many Requests"));
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("free-form"));
    act(() => result.current.setFreeFormPrompt("Hello"));

    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.error).toContain("maximum of 5 active sessions");
  });

  it("confirm sets generic error on API failure", async () => {
    createSessionMock.mockRejectedValue(new Error("API error 500: Internal Server Error"));
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("free-form"));
    act(() => result.current.setFreeFormPrompt("Hello"));

    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.error).toBe("API error 500: Internal Server Error");
  });

  it("confirm sets creating=true during creation", async () => {
    let resolveCreate!: (value: unknown) => void;
    createSessionMock.mockReturnValue(
      new Promise((res) => {
        resolveCreate = res;
      }),
    );
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("free-form"));
    act(() => result.current.setFreeFormPrompt("Hello"));

    let confirmPromise: Promise<unknown>;
    act(() => {
      confirmPromise = result.current.confirm();
    });

    expect(result.current.creating).toBe(true);

    await act(async () => {
      resolveCreate(makeSession());
      await confirmPromise!;
    });

    expect(result.current.creating).toBe(false);
  });

  it("goBack from free-form returns to choose", async () => {
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("free-form"));
    expect(result.current.mode).toBe("free-form");

    act(() => result.current.goBack());
    expect(result.current.mode).toBe("choose");
  });

  it("goBack from worker pick-worker returns to choose", async () => {
    fetchWorkersMock.mockResolvedValue([]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.goBack());
    expect(result.current.mode).toBe("choose");
  });

  it("goBack from worker pick-skill returns to pick-worker", async () => {
    const worker = makeWorker();
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    expect(result.current.workerStep).toBe("pick-skill");

    act(() => result.current.goBack());
    expect(result.current.workerStep).toBe("pick-worker");
    expect(result.current.selectedWorker).toBeNull();
  });

  it("goBack from configure with multi-skill worker goes to pick-skill", async () => {
    const skill = makeSkill({
      parameters: [{ name: "p", label: "P", type: "string" }],
    });
    const worker = makeWorker({ skills: [skill, makeSkill({ id: "s-2" })] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.selectSkill(skill));
    expect(result.current.workerStep).toBe("configure");

    act(() => result.current.goBack());
    expect(result.current.workerStep).toBe("pick-skill");
  });

  it("goBack from configure with single-skill worker goes to pick-worker", async () => {
    const skill = makeSkill({
      parameters: [{ name: "p", label: "P", type: "string" }],
    });
    const worker = makeWorker({ skills: [skill] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    expect(result.current.workerStep).toBe("configure");

    act(() => result.current.goBack());
    expect(result.current.workerStep).toBe("pick-worker");
    expect(result.current.selectedWorker).toBeNull();
  });

  it("goBack from review with params goes to configure", async () => {
    const skill = makeSkill({
      parameters: [{ name: "p", label: "P", type: "string" }],
    });
    const worker = makeWorker({ skills: [skill, makeSkill({ id: "s-2" })] });
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.selectSkill(skill));
    act(() => result.current.goToReview());
    expect(result.current.workerStep).toBe("review");

    act(() => result.current.goBack());
    expect(result.current.workerStep).toBe("configure");
  });

  it("goBack from review without params goes to pick-skill for multi-skill worker", async () => {
    const worker = makeWorker();
    fetchWorkersMock.mockResolvedValue([worker]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("worker"));
    await waitFor(() => expect(result.current.workersLoading).toBe(false));

    act(() => result.current.selectWorker(worker));
    act(() => result.current.selectSkill(worker.skills[0]));
    expect(result.current.workerStep).toBe("review");

    act(() => result.current.goBack());
    expect(result.current.workerStep).toBe("pick-skill");
  });

  it("reset returns everything to initial state", async () => {
    fetchWorkersMock.mockResolvedValue([makeWorker()]);
    const { useCreateSession } = await import("../useCreateSession");
    const { result } = renderHook(() => useCreateSession());

    act(() => result.current.setMode("free-form"));
    act(() => result.current.setFreeFormPrompt("Hello"));

    act(() => result.current.reset());

    expect(result.current.mode).toBe("choose");
    expect(result.current.freeFormPrompt).toBe("");
    expect(result.current.selectedWorker).toBeNull();
    expect(result.current.selectedSkill).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.creating).toBe(false);
  });
});

describe("generateLabel", () => {
  it("returns prompt as-is for short prompts", async () => {
    const { generateLabel } = await import("../useCreateSession");
    expect(generateLabel("Fix bug")).toBe("Fix bug");
  });

  it("truncates long prompts at 50 chars", async () => {
    const { generateLabel } = await import("../useCreateSession");
    const long = "a".repeat(60);
    const label = generateLabel(long);
    expect(label).toBe("a".repeat(50) + "...");
  });

  it("returns 'New Session' for empty prompt", async () => {
    const { generateLabel } = await import("../useCreateSession");
    expect(generateLabel("")).toBe("New Session");
    expect(generateLabel("   ")).toBe("New Session");
  });
});

describe("buildWorkerPrompt", () => {
  it("includes worker name, skill name, and description", async () => {
    const { buildWorkerPrompt } = await import("../useCreateSession");
    const worker = makeWorker({ name: "Frontend Dev" });
    const skill = makeSkill({ name: "Deploy", description: "Deploy to production" });
    const prompt = buildWorkerPrompt(worker, skill, {});
    expect(prompt).toContain("Deploy");
    expect(prompt).toContain("Frontend Dev");
    expect(prompt).toContain("Deploy to production");
  });

  it("includes parameters when provided", async () => {
    const { buildWorkerPrompt } = await import("../useCreateSession");
    const worker = makeWorker();
    const skill = makeSkill();
    const prompt = buildWorkerPrompt(worker, skill, { branch: "main", env: "prod" });
    expect(prompt).toContain("Parameters:");
    expect(prompt).toContain("branch: main");
    expect(prompt).toContain("env: prod");
  });

  it("excludes empty parameters", async () => {
    const { buildWorkerPrompt } = await import("../useCreateSession");
    const worker = makeWorker();
    const skill = makeSkill();
    const prompt = buildWorkerPrompt(worker, skill, { branch: "main", empty: "" });
    expect(prompt).toContain("branch: main");
    expect(prompt).not.toContain("empty");
  });
});

describe("buildWorkerLabel", () => {
  it("returns worker name - skill name", async () => {
    const { buildWorkerLabel } = await import("../useCreateSession");
    const worker = makeWorker({ name: "Backend Dev" });
    const skill = makeSkill({ name: "Deploy" });
    expect(buildWorkerLabel(worker, skill)).toBe("Backend Dev - Deploy");
  });
});
