import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatBubble } from "../ChatBubble";
import type { AgentMessage } from "@/types/agent";

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: "msg-1",
    role: "agent",
    content: "Hello there",
    timestamp: "2025-01-15T10:30:00Z",
    ...overrides,
  };
}

describe("ChatBubble", () => {
  it("renders message content", () => {
    render(<ChatBubble message={makeMessage({ content: "Test message" })} />);
    expect(screen.getByText("Test message")).toBeTruthy();
  });

  it("renders a timestamp element", () => {
    const { container } = render(
      <ChatBubble message={makeMessage({ timestamp: "2025-01-15T10:30:00Z" })} />,
    );
    // The time display is in a span with specific class
    const timeEl = container.querySelector(".text-text-tertiary");
    expect(timeEl).toBeTruthy();
    expect(timeEl!.textContent!.length).toBeGreaterThan(0);
  });

  it("aligns user messages to the right", () => {
    const { container } = render(<ChatBubble message={makeMessage({ role: "user" })} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("ml-auto");
  });

  it("aligns agent messages to the left", () => {
    const { container } = render(<ChatBubble message={makeMessage({ role: "agent" })} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("mr-auto");
  });

  it("aligns system messages to center", () => {
    const { container } = render(<ChatBubble message={makeMessage({ role: "system" })} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("mx-auto");
  });

  it("aligns tool messages to the left", () => {
    const { container } = render(<ChatBubble message={makeMessage({ role: "tool" })} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("mr-auto");
  });

  it("applies user background color", () => {
    const { container } = render(<ChatBubble message={makeMessage({ role: "user" })} />);
    const bubble = container.querySelector(".border") as HTMLElement;
    expect(bubble.className).toContain("bg-accent-blue/20");
  });

  it("applies agent background color", () => {
    const { container } = render(<ChatBubble message={makeMessage({ role: "agent" })} />);
    const bubble = container.querySelector(".border") as HTMLElement;
    expect(bubble.className).toContain("bg-bg-card");
  });

  it("applies system background color", () => {
    const { container } = render(<ChatBubble message={makeMessage({ role: "system" })} />);
    const bubble = container.querySelector(".border") as HTMLElement;
    expect(bubble.className).toContain("bg-bg-secondary");
  });

  it("applies tool background color", () => {
    const { container } = render(<ChatBubble message={makeMessage({ role: "tool" })} />);
    const bubble = container.querySelector(".border") as HTMLElement;
    expect(bubble.className).toContain("bg-bg-secondary");
  });

  it("shows tool name for tool messages", () => {
    render(
      <ChatBubble
        message={makeMessage({
          role: "tool",
          toolName: "read_file",
          content: "File contents here",
        })}
      />,
    );
    expect(screen.getByText("read_file")).toBeTruthy();
  });

  it("does not show tool name for non-tool messages", () => {
    render(<ChatBubble message={makeMessage({ role: "agent", toolName: undefined })} />);
    expect(screen.queryByText("read_file")).toBeNull();
  });

  it("shows tool status completed", () => {
    render(
      <ChatBubble
        message={makeMessage({
          role: "tool",
          toolName: "write_file",
          toolStatus: "completed",
          content: "Done",
        })}
      />,
    );
    expect(screen.getByText("completed")).toBeTruthy();
  });

  it("shows tool status failed", () => {
    render(
      <ChatBubble
        message={makeMessage({
          role: "tool",
          toolName: "write_file",
          toolStatus: "failed",
          content: "Error occurred",
        })}
      />,
    );
    expect(screen.getByText("failed")).toBeTruthy();
  });

  it("shows tool status running", () => {
    render(
      <ChatBubble
        message={makeMessage({
          role: "tool",
          toolName: "execute",
          toolStatus: "running",
          content: "Working...",
        })}
      />,
    );
    expect(screen.getByText("running")).toBeTruthy();
  });

  it("applies green color for completed tool status", () => {
    render(
      <ChatBubble
        message={makeMessage({
          role: "tool",
          toolName: "test",
          toolStatus: "completed",
          content: "ok",
        })}
      />,
    );
    const statusEl = screen.getByText("completed");
    expect(statusEl.className).toContain("text-accent-green");
  });

  it("applies red color for failed tool status", () => {
    render(
      <ChatBubble
        message={makeMessage({
          role: "tool",
          toolName: "test",
          toolStatus: "failed",
          content: "err",
        })}
      />,
    );
    const statusEl = screen.getByText("failed");
    expect(statusEl.className).toContain("text-accent-red");
  });

  it("applies yellow color for running tool status", () => {
    render(
      <ChatBubble
        message={makeMessage({
          role: "tool",
          toolName: "test",
          toolStatus: "running",
          content: "...",
        })}
      />,
    );
    const statusEl = screen.getByText("running");
    expect(statusEl.className).toContain("text-accent-yellow");
  });

  it("preserves whitespace in content", () => {
    render(<ChatBubble message={makeMessage({ content: "line1\nline2" })} />);
    const content = screen.getByText((_content, element) => {
      return element?.textContent === "line1\nline2" && element.tagName === "P";
    });
    expect(content.className).toContain("whitespace-pre-wrap");
  });

  it("limits max width to 80%", () => {
    const { container } = render(<ChatBubble message={makeMessage()} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("max-w-[80%]");
  });
});
