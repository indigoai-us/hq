/**
 * Tests for SkillPickerItem component.
 * MOB-011: Spawn worker from mobile
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SkillPickerItem } from "../../src/components/SkillPickerItem";
import type { WorkerSkill } from "../../src/types";

const skillWithParams: WorkerSkill = {
  id: "build-component",
  name: "Build Component",
  description: "Create a new React component from scratch",
  parameters: [
    { name: "componentName", label: "Component Name", type: "string", required: true },
    { name: "variant", label: "Variant", type: "select", options: ["functional", "class"] },
  ],
};

const skillWithoutParams: WorkerSkill = {
  id: "fix-bug",
  name: "Fix Bug",
  description: "Fix a bug in existing code",
};

describe("SkillPickerItem", () => {
  it("renders skill name and description", () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <SkillPickerItem skill={skillWithParams} onSelect={onSelect} />,
    );

    expect(getByText("Build Component")).toBeTruthy();
    expect(getByText("Create a new React component from scratch")).toBeTruthy();
  });

  it("renders parameter count when skill has parameters", () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <SkillPickerItem skill={skillWithParams} onSelect={onSelect} />,
    );

    expect(getByText("2 parameters")).toBeTruthy();
  });

  it("does not render parameter count when skill has no parameters", () => {
    const onSelect = jest.fn();
    const { queryByText } = render(
      <SkillPickerItem skill={skillWithoutParams} onSelect={onSelect} />,
    );

    expect(queryByText(/parameter/)).toBeNull();
  });

  it("calls onSelect when pressed", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <SkillPickerItem
        skill={skillWithParams}
        onSelect={onSelect}
        testID="skill-item"
      />,
    );

    fireEvent.press(getByTestId("skill-item"));
    expect(onSelect).toHaveBeenCalledWith(skillWithParams);
  });

  it("has correct accessibility label", () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <SkillPickerItem skill={skillWithParams} onSelect={onSelect} />,
    );

    expect(getByLabelText("Select Build Component skill")).toBeTruthy();
  });
});
