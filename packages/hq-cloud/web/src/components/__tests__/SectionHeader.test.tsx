import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "../SectionHeader";

describe("SectionHeader", () => {
  it("renders the title text", () => {
    render(<SectionHeader title="Active Agents" />);
    expect(screen.getByText("Active Agents")).toBeTruthy();
  });

  it("renders as an h2 element", () => {
    render(<SectionHeader title="Section" />);
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  });

  it("applies uppercase styling", () => {
    render(<SectionHeader title="Test" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.className).toContain("uppercase");
  });

  it("applies font-semibold", () => {
    render(<SectionHeader title="Test" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.className).toContain("font-semibold");
  });

  it("applies text-text-secondary color", () => {
    render(<SectionHeader title="Test" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.className).toContain("text-text-secondary");
  });

  it("applies custom className", () => {
    render(<SectionHeader title="Custom" className="mb-4" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.className).toContain("mb-4");
  });

  it("defaults className to empty string without errors", () => {
    render(<SectionHeader title="Default" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.className).not.toContain("undefined");
  });

  it("applies tracking/letter-spacing class", () => {
    render(<SectionHeader title="Tracked" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.className).toContain("tracking-[1.2px]");
  });
});
