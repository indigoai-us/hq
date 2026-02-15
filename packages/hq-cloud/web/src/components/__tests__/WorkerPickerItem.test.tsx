import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkerPickerItem } from "../WorkerPickerItem";
import type { WorkerDefinition } from "@/types/worker";

function makeWorker(overrides: Partial<WorkerDefinition> = {}): WorkerDefinition {
  return {
    id: "worker-1",
    name: "Frontend Dev",
    category: "code",
    description: "Builds React components",
    status: "active",
    skills: [
      { id: "s-1", name: "Build Component", description: "Create a React component" },
      { id: "s-2", name: "Write Tests", description: "Write unit tests" },
    ],
    ...overrides,
  };
}

describe("WorkerPickerItem", () => {
  it("renders the worker name", () => {
    render(<WorkerPickerItem worker={makeWorker()} onSelect={vi.fn()} />);
    expect(screen.getByText("Frontend Dev")).toBeTruthy();
  });

  it("renders the worker description", () => {
    render(<WorkerPickerItem worker={makeWorker()} onSelect={vi.fn()} />);
    expect(screen.getByText("Builds React components")).toBeTruthy();
  });

  it("renders the category badge", () => {
    render(<WorkerPickerItem worker={makeWorker({ category: "code" })} onSelect={vi.fn()} />);
    expect(screen.getByText("code")).toBeTruthy();
  });

  it("renders skill count (plural)", () => {
    render(<WorkerPickerItem worker={makeWorker()} onSelect={vi.fn()} />);
    expect(screen.getByText("2 skills")).toBeTruthy();
  });

  it("renders skill count (singular)", () => {
    const worker = makeWorker({
      skills: [{ id: "s-1", name: "Build", description: "Build things" }],
    });
    render(<WorkerPickerItem worker={worker} onSelect={vi.fn()} />);
    expect(screen.getByText("1 skill")).toBeTruthy();
  });

  it("calls onSelect with the worker when clicked", () => {
    const handleSelect = vi.fn();
    const worker = makeWorker();
    render(<WorkerPickerItem worker={worker} onSelect={handleSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleSelect).toHaveBeenCalledWith(worker);
  });

  it("applies correct color for code category", () => {
    render(<WorkerPickerItem worker={makeWorker({ category: "code" })} onSelect={vi.fn()} />);
    const badge = screen.getByText("code");
    expect(badge.className).toContain("bg-accent-green/20");
    expect(badge.className).toContain("text-accent-green");
  });

  it("applies correct color for content category", () => {
    render(
      <WorkerPickerItem worker={makeWorker({ category: "content" })} onSelect={vi.fn()} />,
    );
    const badge = screen.getByText("content");
    expect(badge.className).toContain("bg-accent-blue/20");
    expect(badge.className).toContain("text-accent-blue");
  });

  it("applies correct color for social category", () => {
    render(
      <WorkerPickerItem worker={makeWorker({ category: "social" })} onSelect={vi.fn()} />,
    );
    const badge = screen.getByText("social");
    expect(badge.className).toContain("bg-accent-red/20");
    expect(badge.className).toContain("text-accent-red");
  });

  it("applies correct color for research category", () => {
    render(
      <WorkerPickerItem worker={makeWorker({ category: "research" })} onSelect={vi.fn()} />,
    );
    const badge = screen.getByText("research");
    expect(badge.className).toContain("bg-accent-purple/20");
    expect(badge.className).toContain("text-accent-purple");
  });

  it("applies correct color for ops category", () => {
    render(
      <WorkerPickerItem worker={makeWorker({ category: "ops" })} onSelect={vi.fn()} />,
    );
    const badge = screen.getByText("ops");
    expect(badge.className).toContain("bg-accent-yellow/20");
    expect(badge.className).toContain("text-accent-yellow");
  });

  it("renders zero skills correctly", () => {
    render(
      <WorkerPickerItem worker={makeWorker({ skills: [] })} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("0 skills")).toBeTruthy();
  });
});
