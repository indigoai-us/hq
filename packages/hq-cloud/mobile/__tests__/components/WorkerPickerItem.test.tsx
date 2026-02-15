/**
 * Tests for WorkerPickerItem component.
 * MOB-011: Spawn worker from mobile
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { WorkerPickerItem } from "../../src/components/WorkerPickerItem";
import type { WorkerDefinition } from "../../src/types";

const sampleWorker: WorkerDefinition = {
  id: "frontend-dev",
  name: "Frontend Developer",
  category: "code",
  description: "Builds React components and UI features",
  status: "active",
  skills: [
    { id: "s1", name: "Build Component", description: "Create a component" },
    { id: "s2", name: "Fix Bug", description: "Fix a bug" },
  ],
};

const singleSkillWorker: WorkerDefinition = {
  id: "analyst",
  name: "Analyst",
  category: "research",
  description: "Performs market analysis",
  status: "active",
  skills: [{ id: "s1", name: "Analyze", description: "Run analysis" }],
};

describe("WorkerPickerItem", () => {
  it("renders worker name and description", () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <WorkerPickerItem worker={sampleWorker} onSelect={onSelect} />,
    );

    expect(getByText("Frontend Developer")).toBeTruthy();
    expect(getByText("Builds React components and UI features")).toBeTruthy();
  });

  it("renders skill count for multiple skills", () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <WorkerPickerItem worker={sampleWorker} onSelect={onSelect} />,
    );

    expect(getByText("2 skills")).toBeTruthy();
  });

  it("renders singular skill count for one skill", () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <WorkerPickerItem worker={singleSkillWorker} onSelect={onSelect} />,
    );

    expect(getByText("1 skill")).toBeTruthy();
  });

  it("renders category badge", () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <WorkerPickerItem worker={sampleWorker} onSelect={onSelect} />,
    );

    expect(getByText("Code")).toBeTruthy();
  });

  it("calls onSelect when pressed", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <WorkerPickerItem
        worker={sampleWorker}
        onSelect={onSelect}
        testID="worker-item"
      />,
    );

    fireEvent.press(getByTestId("worker-item"));
    expect(onSelect).toHaveBeenCalledWith(sampleWorker);
  });

  it("has correct accessibility label", () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <WorkerPickerItem worker={sampleWorker} onSelect={onSelect} />,
    );

    expect(getByLabelText("Select Frontend Developer worker")).toBeTruthy();
  });
});
