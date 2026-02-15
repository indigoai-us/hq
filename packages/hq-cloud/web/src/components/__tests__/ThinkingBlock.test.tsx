import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThinkingBlock } from "../ThinkingBlock";

describe("ThinkingBlock", () => {
  it("renders collapsed by default with preview text", () => {
    render(<ThinkingBlock content="Let me think about this problem carefully." />);
    expect(screen.getByText("Let me think about this problem carefully.")).toBeTruthy();
  });

  it("shows truncated preview for long content", () => {
    const longContent = "A".repeat(100);
    render(<ThinkingBlock content={longContent} />);
    // Preview should be truncated to ~80 chars + "..."
    expect(screen.getByText("A".repeat(80) + "...")).toBeTruthy();
  });

  it("expands on click to show full content", () => {
    const content = "I need to analyze the user's request and determine the best approach.";
    render(<ThinkingBlock content={content} />);
    // When collapsed, the preview shows the content (it's short enough to not be truncated)
    const header = screen.getByText(content);
    fireEvent.click(header);
    // After expanding, the header shows "Thinking..." and the expanded section shows full content
    expect(screen.getByText("Thinking...")).toBeTruthy();
    // The full content is in the expanded section
    const expandedContent = document.querySelector(".border-t.border-border-subtle p");
    expect(expandedContent).toBeTruthy();
    expect(expandedContent!.textContent).toBe(content);
  });

  it("collapses on second click", () => {
    const content = "Thinking about the approach.";
    render(<ThinkingBlock content={content} />);

    // When collapsed, shows the content as preview
    fireEvent.click(screen.getByText(content));
    // Now expanded - header says "Thinking..."
    expect(screen.getByText("Thinking...")).toBeTruthy();

    // Click again to collapse
    fireEvent.click(screen.getByText("Thinking..."));
    // After collapsing, the expanded content div should be gone
    const expandedContent = document.querySelector(".border-t.border-border-subtle");
    expect(expandedContent).toBeNull();
    // Preview text shows again
    expect(screen.getByText(content)).toBeTruthy();
  });

  it("has dimmed opacity styling", () => {
    const { container } = render(<ThinkingBlock content="Some thought" />);
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.className).toContain("opacity-60");
  });

  it("shows full short content without truncation in preview", () => {
    render(<ThinkingBlock content="Short thought" />);
    expect(screen.getByText("Short thought")).toBeTruthy();
  });

  it("shows 'Thinking...' label when expanded", () => {
    render(<ThinkingBlock content="Some deep thought about architecture." />);
    fireEvent.click(screen.getByText("Some deep thought about architecture."));
    expect(screen.getByText("Thinking...")).toBeTruthy();
  });
});
