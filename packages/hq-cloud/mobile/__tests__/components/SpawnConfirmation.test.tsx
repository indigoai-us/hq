/**
 * Tests for SpawnConfirmation component.
 * MOB-011: Spawn worker from mobile
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { SpawnConfirmation } from "../../src/components/SpawnConfirmation";
import type { WorkerDefinition, WorkerSkill } from "../../src/types";

const sampleWorker: WorkerDefinition = {
  id: "frontend-dev",
  name: "Frontend Developer",
  category: "code",
  description: "Builds React components and UI",
  status: "active",
  skills: [],
};

const sampleSkill: WorkerSkill = {
  id: "build-component",
  name: "Build Component",
  description: "Create a new React component from scratch",
  parameters: [
    { name: "componentName", label: "Component Name", type: "string", required: true },
    { name: "variant", label: "Variant", type: "select", options: ["functional", "class"] },
  ],
};

describe("SpawnConfirmation", () => {
  it("renders heading", () => {
    const { getByText } = render(
      <SpawnConfirmation
        worker={sampleWorker}
        skill={sampleSkill}
        parameters={{}}
      />,
    );

    expect(getByText("Confirm Spawn")).toBeTruthy();
  });

  it("renders worker name and description", () => {
    const { getByText } = render(
      <SpawnConfirmation
        worker={sampleWorker}
        skill={sampleSkill}
        parameters={{}}
      />,
    );

    expect(getByText("Frontend Developer")).toBeTruthy();
    expect(getByText("Builds React components and UI")).toBeTruthy();
  });

  it("renders skill name and description", () => {
    const { getByText } = render(
      <SpawnConfirmation
        worker={sampleWorker}
        skill={sampleSkill}
        parameters={{}}
      />,
    );

    expect(getByText("Build Component")).toBeTruthy();
    expect(getByText("Create a new React component from scratch")).toBeTruthy();
  });

  it("renders parameters when provided", () => {
    const { getByText } = render(
      <SpawnConfirmation
        worker={sampleWorker}
        skill={sampleSkill}
        parameters={{ componentName: "UserCard", variant: "functional" }}
      />,
    );

    expect(getByText("Component Name")).toBeTruthy();
    expect(getByText("UserCard")).toBeTruthy();
    expect(getByText("Variant")).toBeTruthy();
    expect(getByText("functional")).toBeTruthy();
  });

  it("does not render parameters section when no parameters", () => {
    const { queryByText } = render(
      <SpawnConfirmation
        worker={sampleWorker}
        skill={sampleSkill}
        parameters={{}}
      />,
    );

    expect(queryByText("Parameters")).toBeNull();
  });

  it("does not render parameters section when all values are empty", () => {
    const { queryByText } = render(
      <SpawnConfirmation
        worker={sampleWorker}
        skill={sampleSkill}
        parameters={{ componentName: "" }}
      />,
    );

    expect(queryByText("Parameters")).toBeNull();
  });

  it("renders section labels", () => {
    const { getByText } = render(
      <SpawnConfirmation
        worker={sampleWorker}
        skill={sampleSkill}
        parameters={{}}
      />,
    );

    expect(getByText("Worker")).toBeTruthy();
    expect(getByText("Skill")).toBeTruthy();
  });
});
