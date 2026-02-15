import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionButton } from "../ActionButton";

describe("ActionButton", () => {
  it("renders with the given label", () => {
    render(<ActionButton label="Click Me" onClick={vi.fn()} />);
    expect(screen.getByText("Click Me")).toBeTruthy();
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<ActionButton label="Click" onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders as a button element", () => {
    render(<ActionButton label="Test" onClick={vi.fn()} />);
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("has type=button attribute", () => {
    render(<ActionButton label="Test" onClick={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  // Variant tests
  it("applies primary variant styles by default", () => {
    render(<ActionButton label="Primary" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-btn-primary");
  });

  it("applies prominent variant styles", () => {
    render(<ActionButton label="Prominent" variant="prominent" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-btn-prominent");
    expect(btn.className).toContain("text-btn-prominent-text");
  });

  it("applies muted variant styles", () => {
    render(<ActionButton label="Muted" variant="muted" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-btn-muted");
  });

  it("applies destructive variant styles", () => {
    render(<ActionButton label="Delete" variant="destructive" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-accent-red");
  });

  // Size tests
  it("applies md size by default", () => {
    render(<ActionButton label="Medium" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("px-4");
    expect(btn.className).toContain("py-2");
    expect(btn.className).toContain("text-base");
  });

  it("applies sm size", () => {
    render(<ActionButton label="Small" size="sm" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("px-3");
    expect(btn.className).toContain("py-1.5");
    expect(btn.className).toContain("text-sm");
  });

  // Disabled tests
  it("is not disabled by default", () => {
    render(<ActionButton label="Enabled" onClick={vi.fn()} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("is disabled when disabled=true", () => {
    render(<ActionButton label="Disabled" disabled onClick={vi.fn()} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("applies disabled styles when disabled", () => {
    render(<ActionButton label="Disabled" disabled onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("opacity-50");
    expect(btn.className).toContain("cursor-not-allowed");
  });

  it("applies cursor-pointer when not disabled", () => {
    render(<ActionButton label="Enabled" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("cursor-pointer");
  });

  it("does not call onClick when disabled and clicked", () => {
    const handleClick = vi.fn();
    render(<ActionButton label="Disabled" disabled onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  // className
  it("applies custom className", () => {
    render(<ActionButton label="Custom" className="w-full" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("w-full");
  });

  it("always has font-semibold and rounded-md", () => {
    render(<ActionButton label="Base" onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("font-semibold");
    expect(btn.className).toContain("rounded-md");
  });
});
