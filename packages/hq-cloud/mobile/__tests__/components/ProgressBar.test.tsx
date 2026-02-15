/**
 * Tests for ProgressBar design system component.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../../src/components/ProgressBar";

describe("ProgressBar", () => {
  it("renders with fraction label by default", () => {
    const { getByText } = render(
      <ProgressBar completed={3} total={6} />,
    );
    expect(getByText("3/6")).toBeTruthy();
  });

  it("hides fraction when showFraction is false", () => {
    const { queryByText } = render(
      <ProgressBar completed={3} total={6} showFraction={false} />,
    );
    expect(queryByText("3/6")).toBeNull();
  });

  it("renders with testID", () => {
    const { getByTestId } = render(
      <ProgressBar completed={2} total={4} testID="progress" />,
    );
    expect(getByTestId("progress")).toBeTruthy();
  });

  it("clamps completed to valid range", () => {
    const { getByText } = render(
      <ProgressBar completed={10} total={6} />,
    );
    // Should clamp to 6/6
    expect(getByText("6/6")).toBeTruthy();
  });

  it("handles zero total gracefully", () => {
    const { getByText } = render(
      <ProgressBar completed={0} total={0} />,
    );
    // Should show 0/1 (safe minimum total)
    expect(getByText("0/1")).toBeTruthy();
  });

  it("handles negative completed gracefully", () => {
    const { getByText } = render(
      <ProgressBar completed={-5} total={10} />,
    );
    expect(getByText("0/10")).toBeTruthy();
  });
});
