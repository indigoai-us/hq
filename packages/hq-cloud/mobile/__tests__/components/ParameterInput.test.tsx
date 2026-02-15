/**
 * Tests for ParameterInput component.
 * MOB-011: Spawn worker from mobile
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ParameterInput } from "../../src/components/ParameterInput";
import type { WorkerSkillParameter } from "../../src/types";

const stringParam: WorkerSkillParameter = {
  name: "componentName",
  label: "Component Name",
  type: "string",
  required: true,
  placeholder: "e.g., UserCard",
};

const numberParam: WorkerSkillParameter = {
  name: "count",
  label: "Count",
  type: "number",
  required: false,
};

const selectParam: WorkerSkillParameter = {
  name: "tone",
  label: "Tone",
  type: "select",
  options: ["professional", "casual", "humorous"],
};

const boolParam: WorkerSkillParameter = {
  name: "verbose",
  label: "Verbose",
  type: "boolean",
};

describe("ParameterInput", () => {
  it("renders label", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ParameterInput parameter={stringParam} value="" onChange={onChange} />,
    );

    expect(getByText("Component Name")).toBeTruthy();
  });

  it("shows required indicator for required params", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ParameterInput parameter={stringParam} value="" onChange={onChange} />,
    );

    expect(getByText("Required")).toBeTruthy();
  });

  it("does not show required indicator for optional params", () => {
    const onChange = jest.fn();
    const { queryByText } = render(
      <ParameterInput parameter={numberParam} value="" onChange={onChange} />,
    );

    expect(queryByText("Required")).toBeNull();
  });

  it("renders text input for string type", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <ParameterInput
        parameter={stringParam}
        value=""
        onChange={onChange}
        testID="param"
      />,
    );

    expect(getByTestId("param-input")).toBeTruthy();
  });

  it("calls onChange when text input changes", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <ParameterInput
        parameter={stringParam}
        value=""
        onChange={onChange}
        testID="param"
      />,
    );

    fireEvent.changeText(getByTestId("param-input"), "UserCard");
    expect(onChange).toHaveBeenCalledWith("componentName", "UserCard");
  });

  it("renders select options for select type", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ParameterInput parameter={selectParam} value="" onChange={onChange} />,
    );

    expect(getByText("professional")).toBeTruthy();
    expect(getByText("casual")).toBeTruthy();
    expect(getByText("humorous")).toBeTruthy();
  });

  it("calls onChange when select option is tapped", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ParameterInput parameter={selectParam} value="" onChange={onChange} />,
    );

    fireEvent.press(getByText("casual"));
    expect(onChange).toHaveBeenCalledWith("tone", "casual");
  });

  it("renders Yes/No options for boolean type", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ParameterInput parameter={boolParam} value="" onChange={onChange} />,
    );

    expect(getByText("Yes")).toBeTruthy();
    expect(getByText("No")).toBeTruthy();
  });

  it("calls onChange with true/false for boolean options", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ParameterInput parameter={boolParam} value="" onChange={onChange} />,
    );

    fireEvent.press(getByText("Yes"));
    expect(onChange).toHaveBeenCalledWith("verbose", "true");
  });

  it("shows placeholder text for string input", () => {
    const onChange = jest.fn();
    const { getByPlaceholderText } = render(
      <ParameterInput parameter={stringParam} value="" onChange={onChange} />,
    );

    expect(getByPlaceholderText("e.g., UserCard")).toBeTruthy();
  });
});
