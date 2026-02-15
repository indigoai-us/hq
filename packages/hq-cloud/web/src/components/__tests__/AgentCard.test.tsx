import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentCard } from "../AgentCard";
import type { Agent } from "@/types/agent";

// Mock the services module
vi.mock("@/services/agents", () => ({
  answerQuestion: vi.fn(() => Promise.resolve()),
  respondToPermission: vi.fn(() => Promise.resolve()),
}));

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Test Agent",
    type: "code",
    status: "running",
    progress: { completed: 3, total: 10 },
    lastActivity: new Date().toISOString(),
    ...overrides,
  };
}

describe("AgentCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.vibrate
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  it("renders the agent name", () => {
    render(<AgentCard agent={makeAgent({ name: "My Worker" })} onClick={vi.fn()} />);
    expect(screen.getByText("My Worker")).toBeTruthy();
  });

  it("renders the agent progress bar", () => {
    render(<AgentCard agent={makeAgent({ progress: { completed: 5, total: 10 } })} onClick={vi.fn()} />);
    expect(screen.getByText("5/10")).toBeTruthy();
  });

  it("calls onClick when the card is clicked", () => {
    const handleClick = vi.fn();
    render(<AgentCard agent={makeAgent()} onClick={handleClick} />);
    // The Card renders as a button
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(handleClick).toHaveBeenCalled();
  });

  it("renders the agent type icon", () => {
    const { container } = render(<AgentCard agent={makeAgent({ type: "code" })} onClick={vi.fn()} />);
    // Code type icon should have laptop emoji
    expect(container.textContent).toContain("\uD83D\uDCBB");
  });

  it("renders a status dot for running status", () => {
    render(<AgentCard agent={makeAgent({ status: "running" })} onClick={vi.fn()} />);
    // running maps to "warning" status
    expect(screen.getByLabelText("Status: warning")).toBeTruthy();
  });

  it("maps completed status to healthy", () => {
    render(<AgentCard agent={makeAgent({ status: "completed" })} onClick={vi.fn()} />);
    expect(screen.getByLabelText("Status: healthy")).toBeTruthy();
  });

  it("maps error status to error", () => {
    render(<AgentCard agent={makeAgent({ status: "error" })} onClick={vi.fn()} />);
    expect(screen.getByLabelText("Status: error")).toBeTruthy();
  });

  it("maps idle status to idle", () => {
    render(<AgentCard agent={makeAgent({ status: "idle" })} onClick={vi.fn()} />);
    expect(screen.getByLabelText("Status: idle")).toBeTruthy();
  });

  it("shows the question prompt when agent has a currentQuestion", () => {
    render(
      <AgentCard
        agent={makeAgent({
          status: "waiting_input",
          currentQuestion: {
            id: "q-1",
            text: "Which framework?",
            options: ["React", "Vue"],
            askedAt: new Date().toISOString(),
          },
        })}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Which framework?")).toBeTruthy();
    expect(screen.getByText("React")).toBeTruthy();
    expect(screen.getByText("Vue")).toBeTruthy();
  });

  it("shows the permission prompt when agent has a currentPermission", () => {
    render(
      <AgentCard
        agent={makeAgent({
          currentPermission: {
            id: "perm-1",
            tool: "write_file",
            description: "Write to /src/index.ts",
            requestedAt: new Date().toISOString(),
          },
        })}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Permission requested")).toBeTruthy();
    expect(screen.getByText("write_file")).toBeTruthy();
  });

  it("shows permission prompt instead of question when both are present", () => {
    render(
      <AgentCard
        agent={makeAgent({
          currentQuestion: {
            id: "q-1",
            text: "Which framework?",
            askedAt: new Date().toISOString(),
          },
          currentPermission: {
            id: "perm-1",
            tool: "execute",
            description: "Run tests",
            requestedAt: new Date().toISOString(),
          },
        })}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Permission requested")).toBeTruthy();
    expect(screen.queryByText("Which framework?")).toBeNull();
  });

  it("has a freeform text input for questions", () => {
    render(
      <AgentCard
        agent={makeAgent({
          currentQuestion: {
            id: "q-1",
            text: "What name?",
            askedAt: new Date().toISOString(),
          },
        })}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("Type a response...")).toBeTruthy();
  });

  it("has a Send button for freeform answers", () => {
    render(
      <AgentCard
        agent={makeAgent({
          currentQuestion: {
            id: "q-1",
            text: "What name?",
            askedAt: new Date().toISOString(),
          },
        })}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Send")).toBeTruthy();
  });

  it("shows Allow and Deny buttons for permission prompt", () => {
    render(
      <AgentCard
        agent={makeAgent({
          currentPermission: {
            id: "perm-1",
            tool: "delete_file",
            description: "Delete /tmp/test",
            requestedAt: new Date().toISOString(),
          },
        })}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Allow")).toBeTruthy();
    expect(screen.getByText("Deny")).toBeTruthy();
  });

  it("calls answerQuestion when an option is clicked", async () => {
    const { answerQuestion } = await import("@/services/agents");
    const onUpdate = vi.fn();

    render(
      <AgentCard
        agent={makeAgent({
          currentQuestion: {
            id: "q-1",
            text: "Choose one",
            options: ["Alpha", "Beta"],
            askedAt: new Date().toISOString(),
          },
        })}
        onClick={vi.fn()}
        onAgentUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByText("Alpha"));

    await waitFor(() => {
      expect(answerQuestion).toHaveBeenCalledWith("agent-1", "q-1", "Alpha");
    });
  });

  it("calls respondToPermission when Allow is clicked", async () => {
    const { respondToPermission } = await import("@/services/agents");
    const onUpdate = vi.fn();

    render(
      <AgentCard
        agent={makeAgent({
          currentPermission: {
            id: "perm-1",
            tool: "write",
            description: "Write file",
            requestedAt: new Date().toISOString(),
          },
        })}
        onClick={vi.fn()}
        onAgentUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByText("Allow"));

    await waitFor(() => {
      expect(respondToPermission).toHaveBeenCalledWith("agent-1", "perm-1", true);
    });
  });

  it("shows 'Answered' text after successful answer", async () => {
    render(
      <AgentCard
        agent={makeAgent({
          currentQuestion: {
            id: "q-1",
            text: "Pick",
            options: ["A"],
            askedAt: new Date().toISOString(),
          },
        })}
        onClick={vi.fn()}
        onAgentUpdate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("A"));

    await waitFor(() => {
      expect(screen.getByText("Answered")).toBeTruthy();
    });
  });

  it("formats time ago as 'now' for recent activity", () => {
    render(
      <AgentCard
        agent={makeAgent({ lastActivity: new Date().toISOString() })}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("now")).toBeTruthy();
  });

  it("formats time ago in minutes", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    render(
      <AgentCard agent={makeAgent({ lastActivity: fiveMinAgo })} onClick={vi.fn()} />,
    );
    expect(screen.getByText("5m")).toBeTruthy();
  });

  it("formats time ago in hours", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(
      <AgentCard agent={makeAgent({ lastActivity: twoHoursAgo })} onClick={vi.fn()} />,
    );
    expect(screen.getByText("2h")).toBeTruthy();
  });

  it("formats time ago in days", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <AgentCard agent={makeAgent({ lastActivity: threeDaysAgo })} onClick={vi.fn()} />,
    );
    expect(screen.getByText("3d")).toBeTruthy();
  });
});
