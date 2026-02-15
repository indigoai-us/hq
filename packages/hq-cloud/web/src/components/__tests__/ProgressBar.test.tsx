import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("renders the fraction text by default", () => {
    render(<ProgressBar completed={3} total={10} />);
    expect(screen.getByText("3/10")).toBeTruthy();
  });

  it("hides fraction text when showFraction is false", () => {
    render(<ProgressBar completed={3} total={10} showFraction={false} />);
    expect(screen.queryByText("3/10")).toBeNull();
  });

  it("calculates percentage width correctly", () => {
    const { container } = render(<ProgressBar completed={5} total={10} />);
    const fill = container.querySelector("[style]") as HTMLElement;
    expect(fill.style.width).toBe("50%");
  });

  it("shows 0% when total is 0", () => {
    const { container } = render(<ProgressBar completed={0} total={0} />);
    const fill = container.querySelector("[style]") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("rounds percentage to nearest integer", () => {
    const { container } = render(<ProgressBar completed={1} total={3} />);
    const fill = container.querySelector("[style]") as HTMLElement;
    // 1/3 = 33.33... -> rounds to 33%
    expect(fill.style.width).toBe("33%");
  });

  it("shows 100% when completed equals total", () => {
    const { container } = render(<ProgressBar completed={10} total={10} />);
    const fill = container.querySelector("[style]") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("uses complete color when completed >= total", () => {
    const { container } = render(<ProgressBar completed={10} total={10} />);
    const fill = container.querySelector("[style]") as HTMLElement;
    expect(fill.className).toContain("bg-progress-complete");
    expect(fill.className).not.toContain("bg-progress-active");
  });

  it("uses active color when not complete", () => {
    const { container } = render(<ProgressBar completed={3} total={10} />);
    const fill = container.querySelector("[style]") as HTMLElement;
    expect(fill.className).toContain("bg-progress-active");
    expect(fill.className).not.toContain("bg-progress-complete");
  });

  it("uses active color when total is 0 even if completed is 0", () => {
    const { container } = render(<ProgressBar completed={0} total={0} />);
    const fill = container.querySelector("[style]") as HTMLElement;
    // isComplete = false when total is 0
    expect(fill.className).toContain("bg-progress-active");
  });

  it("handles completed exceeding total", () => {
    const { container } = render(<ProgressBar completed={15} total={10} />);
    const fill = container.querySelector("[style]") as HTMLElement;
    expect(fill.style.width).toBe("150%");
    expect(fill.className).toContain("bg-progress-complete");
  });

  it("renders the track with correct styles", () => {
    const { container } = render(<ProgressBar completed={5} total={10} />);
    const track = container.querySelector(".bg-progress-track");
    expect(track).toBeTruthy();
  });

  it("displays correct fraction for various values", () => {
    const { rerender } = render(<ProgressBar completed={0} total={5} />);
    expect(screen.getByText("0/5")).toBeTruthy();

    rerender(<ProgressBar completed={5} total={5} />);
    expect(screen.getByText("5/5")).toBeTruthy();

    rerender(<ProgressBar completed={42} total={100} />);
    expect(screen.getByText("42/100")).toBeTruthy();
  });
});
