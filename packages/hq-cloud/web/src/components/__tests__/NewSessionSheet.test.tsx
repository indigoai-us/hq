import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewSessionSheet } from "../NewSessionSheet";
import type { Session } from "@/types/session";

vi.mock("@/services/workers", () => ({
  fetchWorkers: vi.fn(),
}));

vi.mock("@/services/sessions", () => ({
  createSession: vi.fn(),
}));

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

describe("NewSessionSheet", () => {
  let fetchWorkersMock: ReturnType<typeof vi.fn>;
  let createSessionMock: ReturnType<typeof vi.fn>;
  const onClose = vi.fn();
  const onCreated = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    const workersModule = await import("@/services/workers");
    const sessionsModule = await import("@/services/sessions");
    fetchWorkersMock = workersModule.fetchWorkers as ReturnType<typeof vi.fn>;
    createSessionMock = sessionsModule.createSession as ReturnType<typeof vi.fn>;
    fetchWorkersMock.mockResolvedValue([]);
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <NewSessionSheet open={false} onClose={onClose} onCreated={onCreated} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the sheet when open is true", () => {
    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    expect(screen.getByTestId("new-session-sheet")).toBeTruthy();
  });

  it("renders mode chooser with two options", () => {
    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    expect(screen.getByTestId("mode-chooser")).toBeTruthy();
    expect(screen.getByText("Free-form Prompt")).toBeTruthy();
    expect(screen.getByText("Select a Worker")).toBeTruthy();
  });

  it("header shows 'New Session' in choose mode", () => {
    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    expect(screen.getByText("New Session")).toBeTruthy();
  });

  it("clicking Free-form Prompt switches to free-form mode", () => {
    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Free-form Prompt"));
    expect(screen.getByTestId("free-form-mode")).toBeTruthy();
    expect(screen.getByTestId("free-form-input")).toBeTruthy();
  });

  it("clicking Select a Worker switches to worker mode", async () => {
    fetchWorkersMock.mockResolvedValue([
      {
        id: "w-1",
        name: "Dev Worker",
        category: "code",
        description: "Worker",
        status: "active",
        skills: [{ id: "s-1", name: "Build", description: "Build things" }],
      },
    ]);

    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Select a Worker"));
    expect(screen.getByTestId("worker-mode")).toBeTruthy();

    await waitFor(() => expect(screen.getByText("Dev Worker")).toBeTruthy());
  });

  it("close button calls onClose", () => {
    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByTestId("sheet-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click calls onClose", () => {
    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("free-form: Start Session button is disabled with empty prompt", () => {
    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Free-form Prompt"));

    const button = screen.getByText("Start Session");
    expect(button.closest("button")!.hasAttribute("disabled")).toBe(true);
  });

  it("free-form: Start Session button enabled with prompt text", () => {
    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Free-form Prompt"));

    const input = screen.getByTestId("free-form-input");
    fireEvent.change(input, { target: { value: "Fix the bug" } });

    const button = screen.getByText("Start Session");
    expect(button.closest("button")!.hasAttribute("disabled")).toBe(false);
  });

  it("free-form: confirm creates session and calls onCreated", async () => {
    const session = makeSession();
    createSessionMock.mockResolvedValue(session);

    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Free-form Prompt"));

    const input = screen.getByTestId("free-form-input");
    fireEvent.change(input, { target: { value: "Fix the bug" } });

    fireEvent.click(screen.getByText("Start Session"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(session));
    expect(createSessionMock).toHaveBeenCalledWith({
      prompt: "Fix the bug",
      label: "Fix the bug",
    });
  });

  it("free-form: shows error on API failure", async () => {
    createSessionMock.mockRejectedValue(new Error("Server error"));

    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Free-form Prompt"));

    const input = screen.getByTestId("free-form-input");
    fireEvent.change(input, { target: { value: "Fix the bug" } });
    fireEvent.click(screen.getByText("Start Session"));

    await waitFor(() =>
      expect(screen.getByTestId("sheet-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("sheet-error").textContent).toContain("Server error");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("free-form: shows rate limit error on 429", async () => {
    createSessionMock.mockRejectedValue(new Error("API error 429: Rate limited"));

    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Free-form Prompt"));

    const input = screen.getByTestId("free-form-input");
    fireEvent.change(input, { target: { value: "Fix the bug" } });
    fireEvent.click(screen.getByText("Start Session"));

    await waitFor(() =>
      expect(screen.getByTestId("sheet-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("sheet-error").textContent).toContain("maximum of 5 active sessions");
  });

  it("back button navigates from free-form to choose mode", () => {
    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Free-form Prompt"));
    expect(screen.getByTestId("free-form-mode")).toBeTruthy();

    fireEvent.click(screen.getByTestId("sheet-back"));
    expect(screen.getByTestId("mode-chooser")).toBeTruthy();
  });

  it("worker mode: shows loading state while fetching workers", async () => {
    let resolveWorkers!: (value: unknown) => void;
    fetchWorkersMock.mockReturnValue(
      new Promise((res) => {
        resolveWorkers = res;
      }),
    );

    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Select a Worker"));

    expect(screen.getByText("Loading workers...")).toBeTruthy();

    await act(async () => {
      resolveWorkers([]);
    });
  });

  it("worker mode: shows no workers message when empty", async () => {
    fetchWorkersMock.mockResolvedValue([]);
    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Select a Worker"));

    await waitFor(() =>
      expect(screen.getByText("No active workers available")).toBeTruthy(),
    );
  });

  it("worker mode: clicking worker with single skill shows review", async () => {
    fetchWorkersMock.mockResolvedValue([
      {
        id: "w-1",
        name: "Dev Worker",
        category: "code",
        description: "Worker",
        status: "active",
        skills: [{ id: "s-1", name: "Build", description: "Build things" }],
      },
    ]);
    createSessionMock.mockResolvedValue(makeSession());

    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Select a Worker"));

    await waitFor(() => expect(screen.getByText("Dev Worker")).toBeTruthy());
    fireEvent.click(screen.getByText("Dev Worker"));

    // Should show review with SpawnConfirmation
    expect(screen.getByText("Confirm Spawn")).toBeTruthy();
    expect(screen.getByText("Start Session")).toBeTruthy();
  });

  it("worker mode: confirm from review creates session and navigates", async () => {
    const session = makeSession();
    fetchWorkersMock.mockResolvedValue([
      {
        id: "w-1",
        name: "Dev Worker",
        category: "code",
        description: "Worker",
        status: "active",
        skills: [{ id: "s-1", name: "Build", description: "Build things" }],
      },
    ]);
    createSessionMock.mockResolvedValue(session);

    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Select a Worker"));

    await waitFor(() => expect(screen.getByText("Dev Worker")).toBeTruthy());
    fireEvent.click(screen.getByText("Dev Worker"));

    // Click Start Session from review
    fireEvent.click(screen.getByText("Start Session"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(session));
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "w-1",
        skillId: "s-1",
        label: "Dev Worker - Build",
        workerContext: "w-1/s-1",
      }),
    );
  });

  it("shows session label preview in review mode", async () => {
    fetchWorkersMock.mockResolvedValue([
      {
        id: "w-1",
        name: "Dev Worker",
        category: "code",
        description: "Worker",
        status: "active",
        skills: [{ id: "s-1", name: "Build", description: "Build things" }],
      },
    ]);

    render(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("Select a Worker"));

    await waitFor(() => expect(screen.getByText("Dev Worker")).toBeTruthy());
    fireEvent.click(screen.getByText("Dev Worker"));

    expect(screen.getByText("Dev Worker - Build")).toBeTruthy();
  });

  it("resets state when reopened", async () => {
    const { rerender } = render(
      <NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />,
    );
    // Switch to free-form and type something
    fireEvent.click(screen.getByText("Free-form Prompt"));
    const input = screen.getByTestId("free-form-input");
    fireEvent.change(input, { target: { value: "Hello" } });

    // Close and reopen
    rerender(<NewSessionSheet open={false} onClose={onClose} onCreated={onCreated} />);
    rerender(<NewSessionSheet open={true} onClose={onClose} onCreated={onCreated} />);

    // Should be back to mode chooser
    expect(screen.getByTestId("mode-chooser")).toBeTruthy();
  });
});

// Need this for the loading state test
const { act } = await import("@testing-library/react");
