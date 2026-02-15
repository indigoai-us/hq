import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolUseBlock } from "../ToolUseBlock";

describe("ToolUseBlock", () => {
  it("renders the tool name", () => {
    render(<ToolUseBlock toolName="Read" input={{ file_path: "/tmp/test.ts" }} />);
    expect(screen.getByText("Read")).toBeTruthy();
  });

  it("starts collapsed", () => {
    render(<ToolUseBlock toolName="Bash" input={{ command: "ls -la" }} />);
    // The input should not be visible initially
    expect(screen.queryByText("Input")).toBeNull();
  });

  it("expands on click to show input", () => {
    render(<ToolUseBlock toolName="Bash" input={{ command: "ls -la" }} />);
    fireEvent.click(screen.getByText("Bash"));
    expect(screen.getByText("Input")).toBeTruthy();
    expect(screen.getByText("ls -la")).toBeTruthy();
  });

  it("shows file_path as input display", () => {
    render(<ToolUseBlock toolName="Read" input={{ file_path: "/src/index.ts" }} />);
    fireEvent.click(screen.getByText("Read"));
    expect(screen.getByText("/src/index.ts")).toBeTruthy();
  });

  it("shows output when provided", () => {
    render(
      <ToolUseBlock
        toolName="Bash"
        input={{ command: "echo hello" }}
        output="hello"
      />,
    );
    fireEvent.click(screen.getByText("Bash"));
    expect(screen.getByText("Output")).toBeTruthy();
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("shows error indicator when isError is true", () => {
    render(
      <ToolUseBlock
        toolName="Bash"
        input={{ command: "exit 1" }}
        output="command failed"
        isError={true}
      />,
    );
    expect(screen.getByText("error")).toBeTruthy();
  });

  it("does not show error indicator when isError is false", () => {
    render(
      <ToolUseBlock
        toolName="Read"
        input={{ file_path: "/test.ts" }}
        output="file contents"
        isError={false}
      />,
    );
    expect(screen.queryByText("error")).toBeNull();
  });

  it("collapses on second click", () => {
    render(<ToolUseBlock toolName="Grep" input={{ pattern: "TODO" }} />);
    const btn = screen.getByText("Grep");
    fireEvent.click(btn);
    expect(screen.getByText("Input")).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByText("Input")).toBeNull();
  });

  it("shows JSON for complex input with no special keys", () => {
    render(<ToolUseBlock toolName="CustomTool" input={{ foo: "bar", baz: 42 }} />);
    fireEvent.click(screen.getByText("CustomTool"));
    // Should show JSON stringified
    const pre = screen.getByText(/foo/);
    expect(pre).toBeTruthy();
  });

  it("truncates long output", () => {
    const longOutput = "x".repeat(1200);
    render(
      <ToolUseBlock
        toolName="Read"
        input={{ file_path: "/big.txt" }}
        output={longOutput}
      />,
    );
    fireEvent.click(screen.getByText("Read"));
    // The output should contain the truncation indicator
    expect(screen.getByText(/truncated/)).toBeTruthy();
  });

  it("does not show output section when no output", () => {
    render(<ToolUseBlock toolName="Write" input={{ file_path: "/test.ts" }} />);
    fireEvent.click(screen.getByText("Write"));
    expect(screen.queryByText("Output")).toBeNull();
  });
});
