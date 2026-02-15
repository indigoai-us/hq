/**
 * Tests for OptionButton design system component.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { OptionButton } from "../../src/components/OptionButton";

describe("OptionButton", () => {
  it("renders the label text", () => {
    const { getByText } = render(
      <OptionButton label="HQ Desktop F10-12" onPress={jest.fn()} />,
    );
    expect(getByText("HQ Desktop F10-12")).toBeTruthy();
  });

  it("calls onPress when tapped", () => {
    const mockPress = jest.fn();
    const { getByText } = render(
      <OptionButton label="Ralph Bootcamp Deploy" onPress={mockPress} />,
    );
    fireEvent.press(getByText("Ralph Bootcamp Deploy"));
    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    const mockPress = jest.fn();
    const { getByText } = render(
      <OptionButton label="Disabled" onPress={mockPress} disabled />,
    );
    fireEvent.press(getByText("Disabled"));
    expect(mockPress).not.toHaveBeenCalled();
  });

  it("renders with testID", () => {
    const { getByTestId } = render(
      <OptionButton label="Test" onPress={jest.fn()} testID="option-btn" />,
    );
    expect(getByTestId("option-btn")).toBeTruthy();
  });
});
