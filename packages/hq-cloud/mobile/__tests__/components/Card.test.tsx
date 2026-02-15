/**
 * Tests for Card design system component.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { Card } from "../../src/components/Card";

describe("Card", () => {
  it("renders children correctly", () => {
    const { getByText } = render(
      <Card>
        <Text>Card content</Text>
      </Card>,
    );
    expect(getByText("Card content")).toBeTruthy();
  });

  it("renders with testID", () => {
    const { getByTestId } = render(
      <Card testID="test-card">
        <Text>Content</Text>
      </Card>,
    );
    expect(getByTestId("test-card")).toBeTruthy();
  });

  it("renders as Pressable when onPress is provided", () => {
    const mockPress = jest.fn();
    const { getByTestId } = render(
      <Card testID="pressable-card" onPress={mockPress}>
        <Text>Tappable</Text>
      </Card>,
    );
    fireEvent.press(getByTestId("pressable-card"));
    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it("renders as static View when onPress is not provided", () => {
    const { getByText } = render(
      <Card>
        <Text>Static card</Text>
      </Card>,
    );
    expect(getByText("Static card")).toBeTruthy();
  });
});
