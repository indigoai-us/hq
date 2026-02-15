import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpawnConfirmation } from "../SpawnConfirmation";
import type { WorkerDefinition, WorkerSkill } from "@/types/worker";

function makeWorker(overrides: Partial<WorkerDefinition> = {}): WorkerDefinition {
  return {
    id: "worker-1",
    name: "Test Worker",
    category: "code",
    description: "A test worker",
    status: "active",
    skills: [],
    ...overrides,
  };
}

function makeSkill(overrides: Partial<WorkerSkill> = {}): WorkerSkill {
  return {
    id: "skill-1",
    name: "Build Feature",
    description: "Builds a feature",
    ...overrides,
  };
}

describe("SpawnConfirmation", () => {
  it("renders 'Confirm Spawn' heading", () => {
    render(
      <SpawnConfirmation worker={makeWorker()} skill={makeSkill()} parameters={{}} />,
    );
    expect(screen.getByText("Confirm Spawn")).toBeTruthy();
  });

  it("renders the worker name", () => {
    render(
      <SpawnConfirmation
        worker={makeWorker({ name: "Frontend Dev" })}
        skill={makeSkill()}
        parameters={{}}
      />,
    );
    expect(screen.getByText("Frontend Dev")).toBeTruthy();
  });

  it("renders the skill name", () => {
    render(
      <SpawnConfirmation
        worker={makeWorker()}
        skill={makeSkill({ name: "Write Tests" })}
        parameters={{}}
      />,
    );
    expect(screen.getByText("Write Tests")).toBeTruthy();
  });

  it("renders 'Worker' and 'Skill' labels", () => {
    render(
      <SpawnConfirmation worker={makeWorker()} skill={makeSkill()} parameters={{}} />,
    );
    expect(screen.getByText("Worker")).toBeTruthy();
    expect(screen.getByText("Skill")).toBeTruthy();
  });

  it("renders parameters when provided", () => {
    render(
      <SpawnConfirmation
        worker={makeWorker()}
        skill={makeSkill()}
        parameters={{ branch: "main", target: "production" }}
      />,
    );
    expect(screen.getByText("Parameters")).toBeTruthy();
    expect(screen.getByText("branch")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
    expect(screen.getByText("target")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();
  });

  it("does not render Parameters section when parameters are empty", () => {
    render(
      <SpawnConfirmation worker={makeWorker()} skill={makeSkill()} parameters={{}} />,
    );
    expect(screen.queryByText("Parameters")).toBeNull();
  });

  it("filters out empty parameter values", () => {
    render(
      <SpawnConfirmation
        worker={makeWorker()}
        skill={makeSkill()}
        parameters={{ branch: "main", empty: "" }}
      />,
    );
    expect(screen.getByText("branch")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
    expect(screen.queryByText("empty")).toBeNull();
  });

  it("renders inside a Card component", () => {
    const { container } = render(
      <SpawnConfirmation worker={makeWorker()} skill={makeSkill()} parameters={{}} />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-bg-card");
  });

  it("shows multiple parameters in order", () => {
    render(
      <SpawnConfirmation
        worker={makeWorker()}
        skill={makeSkill()}
        parameters={{ alpha: "1", beta: "2", gamma: "3" }}
      />,
    );
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("gamma")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });
});
