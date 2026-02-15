/**
 * Tests for PermissionPrompt component.
 * Covers: rendering, Allow/Deny actions, haptic feedback, responded state.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { PermissionPrompt } from "../../src/components/PermissionPrompt";
import type { AgentPermissionRequest } from "../../src/types";

describe("PermissionPrompt", () => {
  const mockPermission: AgentPermissionRequest = {
    id: "perm-1",
    tool: "Run",
    description: "cd /Users/janecooper/Desktop/portfolio && rm -rf .next && npm run dev &",
    requestedAt: "2026-02-08T10:03:00Z",
  };

  const mockOnRespond = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render permission description", () => {
    render(
      <PermissionPrompt
        permission={mockPermission}
        onRespond={mockOnRespond}
        testID="perm"
      />,
    );

    expect(screen.getByText("Run")).toBeTruthy();
    expect(
      screen.getByText(mockPermission.description + "?", { exact: false }),
    ).toBeTruthy();
  });

  it("should render Allow and Deny buttons", () => {
    render(
      <PermissionPrompt
        permission={mockPermission}
        onRespond={mockOnRespond}
        testID="perm"
      />,
    );

    expect(screen.getByTestId("perm-allow")).toBeTruthy();
    expect(screen.getByTestId("perm-deny")).toBeTruthy();
  });

  it("should call onRespond with true when Allow is pressed", () => {
    render(
      <PermissionPrompt
        permission={mockPermission}
        onRespond={mockOnRespond}
        testID="perm"
      />,
    );

    fireEvent.press(screen.getByTestId("perm-allow"));

    expect(mockOnRespond).toHaveBeenCalledWith("perm-1", true);
  });

  it("should call onRespond with false when Deny is pressed", () => {
    render(
      <PermissionPrompt
        permission={mockPermission}
        onRespond={mockOnRespond}
        testID="perm"
      />,
    );

    fireEvent.press(screen.getByTestId("perm-deny"));

    expect(mockOnRespond).toHaveBeenCalledWith("perm-1", false);
  });

  it("should trigger haptic feedback on Allow", () => {
    render(
      <PermissionPrompt
        permission={mockPermission}
        onRespond={mockOnRespond}
        testID="perm"
      />,
    );

    fireEvent.press(screen.getByTestId("perm-allow"));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Medium,
    );
  });

  it("should trigger haptic feedback on Deny", () => {
    render(
      <PermissionPrompt
        permission={mockPermission}
        onRespond={mockOnRespond}
        testID="perm"
      />,
    );

    fireEvent.press(screen.getByTestId("perm-deny"));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Medium,
    );
  });

  it("should show 'Allowed' confirmation after Allow is pressed", () => {
    render(
      <PermissionPrompt
        permission={mockPermission}
        onRespond={mockOnRespond}
        testID="perm"
      />,
    );

    fireEvent.press(screen.getByTestId("perm-allow"));

    expect(screen.getByText(/Allowed.*Run/)).toBeTruthy();
    // Buttons should be gone
    expect(screen.queryByTestId("perm-allow")).toBeNull();
    expect(screen.queryByTestId("perm-deny")).toBeNull();
  });

  it("should show 'Denied' confirmation after Deny is pressed", () => {
    render(
      <PermissionPrompt
        permission={mockPermission}
        onRespond={mockOnRespond}
        testID="perm"
      />,
    );

    fireEvent.press(screen.getByTestId("perm-deny"));

    expect(screen.getByText(/Denied.*Run/)).toBeTruthy();
  });

  it("should prevent double-tap after responding", () => {
    render(
      <PermissionPrompt
        permission={mockPermission}
        onRespond={mockOnRespond}
        testID="perm"
      />,
    );

    fireEvent.press(screen.getByTestId("perm-allow"));
    // After response, buttons are gone so can't double-tap
    expect(mockOnRespond).toHaveBeenCalledTimes(1);
  });

  it("should apply testID to container", () => {
    render(
      <PermissionPrompt
        permission={mockPermission}
        onRespond={mockOnRespond}
        testID="perm"
      />,
    );

    expect(screen.getByTestId("perm")).toBeTruthy();
  });
});
