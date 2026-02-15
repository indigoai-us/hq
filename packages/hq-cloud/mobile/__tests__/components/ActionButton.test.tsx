/**
 * Tests for ActionButton design system component.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ActionButton } from "../../src/components/ActionButton";

describe("ActionButton", () => {
  it("renders the label text", () => {
    const { getByText } = render(
      <ActionButton label="Allow" onPress={jest.fn()} />,
    );
    expect(getByText("Allow")).toBeTruthy();
  });

  it("calls onPress when tapped", () => {
    const mockPress = jest.fn();
    const { getByText } = render(
      <ActionButton label="Allow" onPress={mockPress} />,
    );
    fireEvent.press(getByText("Allow"));
    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    const mockPress = jest.fn();
    const { getByText } = render(
      <ActionButton label="Allow" onPress={mockPress} disabled />,
    );
    fireEvent.press(getByText("Allow"));
    expect(mockPress).not.toHaveBeenCalled();
  });

  it("renders with testID", () => {
    const { getByTestId } = render(
      <ActionButton label="Test" onPress={jest.fn()} testID="action-btn" />,
    );
    expect(getByTestId("action-btn")).toBeTruthy();
  });

  it("shows loading spinner when loading", () => {
    const { queryByText } = render(
      <ActionButton label="Allow" onPress={jest.fn()} loading />,
    );
    // Label should not be visible when loading
    expect(queryByText("Allow")).toBeNull();
  });
});
