import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OptionButton } from "../OptionButton";

describe("OptionButton", () => {
  it("renders with the given label", () => {
    render(<OptionButton label="Option A" onClick={vi.fn()} />);
    expect(screen.getByText("Option A")).toBeTruthy();
  });

  it("renders as a button element", () => {
    render(<OptionButton label="Test" onClick={vi.fn()} />);
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("has type=button attribute", () => {
    render(<OptionButton label="Test" onClick={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<OptionButton label="Click" onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("applies selected styles when selected=true", () => {
    render(<OptionButton label="Selected" selected onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-accent-blue");
    expect(btn.className).toContain("border-accent-blue");
  });

  it("applies unselected styles when selected is false/undefined", () => {
    render(<OptionButton label="Unselected" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-bg-elevated");
    expect(btn.className).toContain("text-text-secondary");
    expect(btn.className).toContain("border-border-subtle");
  });

  it("is disabled when disabled=true", () => {
    render(<OptionButton label="Disabled" disabled onClick={vi.fn()} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("applies disabled styles when disabled", () => {
    render(<OptionButton label="Disabled" disabled onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("opacity-50");
    expect(btn.className).toContain("cursor-not-allowed");
  });

  it("does not call onClick when disabled and clicked", () => {
    const handleClick = vi.fn();
    render(<OptionButton label="Disabled" disabled onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("applies cursor-pointer when not disabled", () => {
    render(<OptionButton label="Enabled" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("cursor-pointer");
  });

  it("has rounded-md and border classes", () => {
    render(<OptionButton label="Styled" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("rounded-md");
    expect(btn.className).toContain("border");
  });

  it("can toggle between selected and unselected states", () => {
    const { rerender } = render(<OptionButton label="Toggle" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-bg-elevated");

    rerender(<OptionButton label="Toggle" selected onClick={vi.fn()} />);
    expect(btn.className).toContain("bg-accent-blue");
  });
});
