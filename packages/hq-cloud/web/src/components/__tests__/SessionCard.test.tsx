import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionCard } from "../SessionCard";
import type { Session } from "@/types/session";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: "sess-1",
    userId: "user-1",
    status: "active",
    ecsTaskArn: null,
    initialPrompt: "Help me build a feature",
    workerContext: null,
    messageCount: 5,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    stoppedAt: null,
    error: null,
    pendingPermissions: 0,
    ...overrides,
  };
}

describe("SessionCard", () => {
  it("renders the session name from initialPrompt", () => {
    render(<SessionCard session={makeSession({ initialPrompt: "Build the login page" })} onClick={vi.fn()} />);
    // Text appears in both title and preview
    const elements = screen.getAllByText("Build the login page");
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'Claude Code Session' when no initialPrompt", () => {
    render(<SessionCard session={makeSession({ initialPrompt: null })} onClick={vi.fn()} />);
    expect(screen.getByText("Claude Code Session")).toBeTruthy();
  });

  it("truncates long prompts to 50 chars", () => {
    const longPrompt = "A".repeat(60);
    render(<SessionCard session={makeSession({ initialPrompt: longPrompt })} onClick={vi.fn()} />);
    expect(screen.getByText("A".repeat(50) + "...")).toBeTruthy();
  });

  it("calls onClick when the card is clicked", () => {
    const handleClick = vi.fn();
    render(<SessionCard session={makeSession()} onClick={handleClick} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(handleClick).toHaveBeenCalled();
  });

  it("shows green status dot for active sessions", () => {
    render(<SessionCard session={makeSession({ status: "active" })} onClick={vi.fn()} />);
    expect(screen.getByLabelText("Status: healthy")).toBeTruthy();
  });

  it("shows yellow status dot for starting sessions", () => {
    render(<SessionCard session={makeSession({ status: "starting" })} onClick={vi.fn()} />);
    expect(screen.getByLabelText("Status: warning")).toBeTruthy();
  });

  it("shows red status dot for errored sessions", () => {
    render(<SessionCard session={makeSession({ status: "errored" })} onClick={vi.fn()} />);
    expect(screen.getByLabelText("Status: error")).toBeTruthy();
  });

  it("shows gray status dot for stopped sessions", () => {
    render(<SessionCard session={makeSession({ status: "stopped" })} onClick={vi.fn()} />);
    expect(screen.getByLabelText("Status: idle")).toBeTruthy();
  });

  it("shows yellow status dot for stopping sessions", () => {
    render(<SessionCard session={makeSession({ status: "stopping" })} onClick={vi.fn()} />);
    expect(screen.getByLabelText("Status: warning")).toBeTruthy();
  });

  it("displays status label for active session", () => {
    render(<SessionCard session={makeSession({ status: "active" })} onClick={vi.fn()} />);
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("displays status label for starting session", () => {
    render(<SessionCard session={makeSession({ status: "starting" })} onClick={vi.fn()} />);
    expect(screen.getByText("Starting...")).toBeTruthy();
  });

  it("displays status label for stopped session", () => {
    render(<SessionCard session={makeSession({ status: "stopped" })} onClick={vi.fn()} />);
    expect(screen.getByText("Stopped")).toBeTruthy();
  });

  it("displays status label for errored session", () => {
    render(<SessionCard session={makeSession({ status: "errored" })} onClick={vi.fn()} />);
    expect(screen.getByText("Error")).toBeTruthy();
  });

  it("shows message count", () => {
    render(<SessionCard session={makeSession({ messageCount: 12 })} onClick={vi.fn()} />);
    expect(screen.getByText("12 messages")).toBeTruthy();
  });

  it("shows singular 'message' for count of 1", () => {
    render(<SessionCard session={makeSession({ messageCount: 1 })} onClick={vi.fn()} />);
    expect(screen.getByText("1 message")).toBeTruthy();
  });

  it("does not show message count when 0", () => {
    render(<SessionCard session={makeSession({ messageCount: 0 })} onClick={vi.fn()} />);
    expect(screen.queryByText(/message/)).toBeNull();
  });

  it("shows worker context when present", () => {
    render(<SessionCard session={makeSession({ workerContext: "frontend-dev" })} onClick={vi.fn()} />);
    expect(screen.getByText("frontend-dev")).toBeTruthy();
  });

  it("shows error message as preview text", () => {
    render(<SessionCard session={makeSession({ error: "Connection timeout", status: "errored" })} onClick={vi.fn()} />);
    expect(screen.getByText("Connection timeout")).toBeTruthy();
  });

  it("shows lastMessage content as preview when available", () => {
    render(
      <SessionCard
        session={makeSession({
          lastMessage: {
            sessionId: "sess-1",
            sequence: 1,
            timestamp: new Date().toISOString(),
            type: "assistant",
            content: "I have finished implementing the feature.",
            metadata: {},
          },
        })}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("I have finished implementing the feature.")).toBeTruthy();
  });

  it("shows pending permission badge when count > 0", () => {
    render(<SessionCard session={makeSession({ pendingPermissions: 3 })} onClick={vi.fn()} />);
    const badge = screen.getByTestId("permission-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("3");
  });

  it("does not show permission badge when count is 0", () => {
    render(<SessionCard session={makeSession({ pendingPermissions: 0 })} onClick={vi.fn()} />);
    expect(screen.queryByTestId("permission-badge")).toBeNull();
  });

  it("does not show permission badge when undefined", () => {
    const session = makeSession();
    delete (session as Record<string, unknown>).pendingPermissions;
    render(<SessionCard session={session} onClick={vi.fn()} />);
    expect(screen.queryByTestId("permission-badge")).toBeNull();
  });

  it("shows 'now' for recent activity", () => {
    render(
      <SessionCard session={makeSession({ lastActivityAt: new Date().toISOString() })} onClick={vi.fn()} />,
    );
    expect(screen.getByText("now")).toBeTruthy();
  });

  it("shows time ago in minutes", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    render(<SessionCard session={makeSession({ lastActivityAt: fiveMinAgo })} onClick={vi.fn()} />);
    expect(screen.getByText("5m ago")).toBeTruthy();
  });

  it("shows time ago in hours", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(<SessionCard session={makeSession({ lastActivityAt: twoHoursAgo })} onClick={vi.fn()} />);
    expect(screen.getByText("2h ago")).toBeTruthy();
  });

  it("shows time ago in days", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    render(<SessionCard session={makeSession({ lastActivityAt: threeDaysAgo })} onClick={vi.fn()} />);
    expect(screen.getByText("3d ago")).toBeTruthy();
  });
});
