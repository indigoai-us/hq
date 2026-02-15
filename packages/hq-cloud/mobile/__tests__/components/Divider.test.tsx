/**
 * Tests for Divider design system component.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { Divider } from "../../src/components/Divider";

describe("Divider", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(<Divider />);
    expect(toJSON()).toBeTruthy();
  });

  it("accepts style overrides", () => {
    const { toJSON } = render(<Divider style={{ marginVertical: 20 }} />);
    expect(toJSON()).toBeTruthy();
  });
});
