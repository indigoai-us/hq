import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolProgressIndicator } from "../ToolProgressIndicator";
import type { ToolProgress } from "@/types/session";

function makeProgress(overrides: Partial<ToolProgress> = {}): ToolProgress {
  return {
    toolUseId: "tool-1",
    message: "Reading file...",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("ToolProgressIndicator", () => {
  it("renders the progress message", () => {
    render(<ToolProgressIndicator progress={makeProgress({ message: "Executing command..." })} />);
    expect(screen.getByText("Executing command...")).toBeTruthy();
  });

  it("renders with default message", () => {
    render(<ToolProgressIndicator progress={makeProgress()} />);
    expect(screen.getByText("Reading file...")).toBeTruthy();
  });

  it("contains a spinning animation class", () => {
    const { container } = render(<ToolProgressIndicator progress={makeProgress()} />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  it("is left-aligned (mr-auto)", () => {
    const { container } = render(<ToolProgressIndicator progress={makeProgress()} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("mr-auto");
  });
});
