/**
 * Tests for AgentTypeIcon component.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { AgentTypeIcon } from "../../src/components/AgentTypeIcon";

describe("AgentTypeIcon", () => {
  it("renders with testID", () => {
    const { getByTestId } = render(
      <AgentTypeIcon type="research" testID="icon-research" />,
    );
    expect(getByTestId("icon-research")).toBeTruthy();
  });

  it("renders all agent types without crashing", () => {
    const types = ["research", "content", "ops", "code", "social"] as const;
    for (const type of types) {
      const { unmount } = render(<AgentTypeIcon type={type} />);
      unmount();
    }
  });

  it("renders with custom size", () => {
    const { getByTestId } = render(
      <AgentTypeIcon type="code" size={60} testID="custom-size" />,
    );
    const icon = getByTestId("custom-size");
    expect(icon.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 60, height: 60 }),
      ]),
    );
  });

  it("uses default size of 40", () => {
    const { getByTestId } = render(
      <AgentTypeIcon type="ops" testID="default-size" />,
    );
    const icon = getByTestId("default-size");
    expect(icon.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 40, height: 40 }),
      ]),
    );
  });

  it("has accessibility label with agent type", () => {
    const { getByLabelText } = render(<AgentTypeIcon type="content" />);
    expect(getByLabelText("content agent")).toBeTruthy();
  });
});
