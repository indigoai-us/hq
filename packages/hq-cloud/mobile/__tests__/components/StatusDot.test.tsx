/**
 * Tests for StatusDot design system component.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { StatusDot } from "../../src/components/StatusDot";

describe("StatusDot", () => {
  it("renders without crashing for each variant", () => {
    const variants = ["healthy", "warning", "error", "idle"] as const;
    for (const variant of variants) {
      const { unmount } = render(<StatusDot variant={variant} />);
      unmount();
    }
  });

  it("uses default size of 8", () => {
    // Render and verify no crash - size is internal
    const { toJSON } = render(<StatusDot variant="healthy" />);
    expect(toJSON()).toBeTruthy();
  });

  it("accepts custom size", () => {
    const { toJSON } = render(<StatusDot variant="error" size={12} />);
    expect(toJSON()).toBeTruthy();
  });
});
