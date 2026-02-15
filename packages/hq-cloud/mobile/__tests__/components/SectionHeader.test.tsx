/**
 * Tests for SectionHeader design system component.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { SectionHeader } from "../../src/components/SectionHeader";

describe("SectionHeader", () => {
  it("renders the title text", () => {
    const { getByText } = render(
      <SectionHeader title="AGENTS" />,
    );
    expect(getByText("AGENTS")).toBeTruthy();
  });

  it("renders with testID", () => {
    const { getByTestId } = render(
      <SectionHeader title="NAVIGATOR" testID="section-header" />,
    );
    expect(getByTestId("section-header")).toBeTruthy();
  });
});
