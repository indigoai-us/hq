/**
 * Tests for BrandHeader design system component.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { BrandHeader } from "../../src/components/BrandHeader";

describe("BrandHeader", () => {
  it("renders the Indigo brand name", () => {
    const { getByText } = render(<BrandHeader />);
    expect(getByText("Indigo")).toBeTruthy();
  });

  it("renders with testID", () => {
    const { getByTestId } = render(<BrandHeader testID="brand-header" />);
    expect(getByTestId("brand-header")).toBeTruthy();
  });

  it("calls onMenuPress when menu is tapped", () => {
    const mockMenuPress = jest.fn();
    const { getByLabelText } = render(
      <BrandHeader onMenuPress={mockMenuPress} />,
    );
    fireEvent.press(getByLabelText("Menu"));
    expect(mockMenuPress).toHaveBeenCalledTimes(1);
  });

  it("calls onIconsPress when settings icon is tapped", () => {
    const mockIconsPress = jest.fn();
    const { getByLabelText } = render(
      <BrandHeader onIconsPress={mockIconsPress} />,
    );
    fireEvent.press(getByLabelText("Settings"));
    expect(mockIconsPress).toHaveBeenCalledTimes(1);
  });
});
