import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionMessageBubble } from "../SessionMessageBubble";
import type { SessionMessage, ContentBlock } from "@/types/session";

// Mock MarkdownView to avoid pulling in react-markdown in tests
vi.mock("../MarkdownView", () => ({
  MarkdownView: ({ content }: { content: string }) => <span data-testid="markdown">{content}</span>,
}));

function makeMessage(overrides: Partial<SessionMessage> = {}): SessionMessage {
  return {
    sessionId: "sess-1",
    sequence: 1,
    timestamp: "2026-02-11T10:30:00Z",
    type: "assistant",
    content: "Hello there",
    metadata: {},
    ...overrides,
  };
}

describe("SessionMessageBubble", () => {
  // User messages
  it("renders user messages right-aligned", () => {
    const { container } = render(
      <SessionMessageBubble message={makeMessage({ type: "user", content: "Hi" })} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("ml-auto");
  });

  it("renders user message content", () => {
    render(
      <SessionMessageBubble message={makeMessage({ type: "user", content: "Help me build a feature" })} />,
    );
    expect(screen.getByText("Help me build a feature")).toBeTruthy();
  });

  it("renders user messages with blue background", () => {
    const { container } = render(
      <SessionMessageBubble message={makeMessage({ type: "user", content: "test" })} />,
    );
    const bubble = container.querySelector(".bg-accent-blue\\/20");
    expect(bubble).toBeTruthy();
  });

  it("has user message test id", () => {
    render(
      <SessionMessageBubble message={makeMessage({ type: "user", content: "test" })} />,
    );
    expect(screen.getByTestId("session-message-user")).toBeTruthy();
  });

  // Assistant messages (plain text)
  it("renders assistant messages left-aligned", () => {
    const { container } = render(
      <SessionMessageBubble message={makeMessage({ type: "assistant", content: "I can help." })} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("mr-auto");
  });

  it("renders assistant text content with markdown", () => {
    render(
      <SessionMessageBubble message={makeMessage({ type: "assistant", content: "Here is the answer." })} />,
    );
    expect(screen.getByTestId("markdown")).toBeTruthy();
    expect(screen.getByText("Here is the answer.")).toBeTruthy();
  });

  it("has assistant message test id", () => {
    render(
      <SessionMessageBubble message={makeMessage({ type: "assistant", content: "test" })} />,
    );
    expect(screen.getByTestId("session-message-assistant")).toBeTruthy();
  });

  // Assistant messages with content blocks
  it("renders content blocks for assistant messages", () => {
    const contentBlocks: ContentBlock[] = [
      { type: "text", text: "Let me read that file." },
      { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "/test.ts" } },
    ];

    render(
      <SessionMessageBubble
        message={makeMessage({ type: "assistant", contentBlocks })}
      />,
    );

    expect(screen.getByText("Let me read that file.")).toBeTruthy();
    expect(screen.getByText("Read")).toBeTruthy();
  });

  it("renders thinking blocks within content blocks", () => {
    const contentBlocks: ContentBlock[] = [
      { type: "thinking", thinking: "I need to analyze this carefully." },
      { type: "text", text: "Here is my analysis." },
    ];

    render(
      <SessionMessageBubble
        message={makeMessage({ type: "assistant", contentBlocks })}
      />,
    );

    expect(screen.getByText(/I need to analyze this carefully/)).toBeTruthy();
    expect(screen.getByText("Here is my analysis.")).toBeTruthy();
  });

  it("pairs tool results with tool use blocks", () => {
    const contentBlocks: ContentBlock[] = [
      { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "/test.ts" } },
    ];

    const toolResults = new Map([
      ["tool-1", { content: "file contents here", isError: false }],
    ]);

    render(
      <SessionMessageBubble
        message={makeMessage({ type: "assistant", contentBlocks })}
        toolResults={toolResults}
      />,
    );

    expect(screen.getByText("Read")).toBeTruthy();
  });

  // Tool use messages (standalone)
  it("renders standalone tool_use messages", () => {
    render(
      <SessionMessageBubble
        message={makeMessage({
          type: "tool_use",
          content: "output data",
          metadata: { toolName: "Bash", input: { command: "ls" } },
        })}
      />,
    );
    expect(screen.getByTestId("session-message-tool")).toBeTruthy();
    expect(screen.getByText("Bash")).toBeTruthy();
  });

  // Permission messages
  it("renders permission_request messages with label", () => {
    render(
      <SessionMessageBubble
        message={makeMessage({ type: "permission_request", content: "Allow Read tool?" })}
      />,
    );
    expect(screen.getByText("Permission Requested")).toBeTruthy();
    expect(screen.getByText("Allow Read tool?")).toBeTruthy();
  });

  it("renders permission_response messages with label", () => {
    render(
      <SessionMessageBubble
        message={makeMessage({ type: "permission_response", content: "Allowed Read" })}
      />,
    );
    expect(screen.getByText("Permission Responded")).toBeTruthy();
  });

  it("has permission message test id", () => {
    render(
      <SessionMessageBubble
        message={makeMessage({ type: "permission_request", content: "test" })}
      />,
    );
    expect(screen.getByTestId("session-message-permission")).toBeTruthy();
  });

  // System messages
  it("renders system messages centered", () => {
    const { container } = render(
      <SessionMessageBubble message={makeMessage({ type: "system", content: "Session started" })} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("mx-auto");
  });

  // Error messages
  it("renders error messages with error label", () => {
    render(
      <SessionMessageBubble message={makeMessage({ type: "error", content: "Connection lost" })} />,
    );
    expect(screen.getByText("Error")).toBeTruthy();
    expect(screen.getByText("Connection lost")).toBeTruthy();
  });

  // Timestamps
  it("displays a timestamp", () => {
    const { container } = render(
      <SessionMessageBubble message={makeMessage({ timestamp: "2026-02-11T10:30:00Z" })} />,
    );
    const timeEl = container.querySelector(".text-text-tertiary");
    expect(timeEl).toBeTruthy();
    expect(timeEl!.textContent!.length).toBeGreaterThan(0);
  });

  it("right-aligns timestamp for user messages", () => {
    const { container } = render(
      <SessionMessageBubble message={makeMessage({ type: "user", content: "Hi" })} />,
    );
    const timeEl = container.querySelector(".text-right");
    expect(timeEl).toBeTruthy();
  });
});
