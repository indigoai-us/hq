/**
 * Tests for AttachmentMenu component.
 * Covers: rendering, option selection, haptic feedback, overlay close, accessibility.
 *
 * MOB-013: Global input bar with voice and attachments
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { AttachmentMenu } from "../../src/components/AttachmentMenu";

// Mock expo-haptics
const mockImpactAsync = jest.fn();
jest.mock("expo-haptics", () => ({
  impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
  },
}));

describe("AttachmentMenu", () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onSelect: jest.fn(),
    testID: "attachment-menu",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Rendering ---

  it("should render the menu when visible", () => {
    render(<AttachmentMenu {...defaultProps} />);
    expect(screen.getByTestId("attachment-menu-panel")).toBeTruthy();
  });

  it("should render the menu title", () => {
    render(<AttachmentMenu {...defaultProps} />);
    expect(screen.getByText("Attach")).toBeTruthy();
  });

  it("should render all attachment options", () => {
    render(<AttachmentMenu {...defaultProps} />);

    expect(screen.getByTestId("attachment-menu-photos")).toBeTruthy();
    expect(screen.getByTestId("attachment-menu-camera")).toBeTruthy();
    expect(screen.getByTestId("attachment-menu-files")).toBeTruthy();
    expect(screen.getByTestId("attachment-menu-agent")).toBeTruthy();
    expect(screen.getByTestId("attachment-menu-project")).toBeTruthy();
  });

  it("should render option labels", () => {
    render(<AttachmentMenu {...defaultProps} />);

    expect(screen.getByText("Photos")).toBeTruthy();
    expect(screen.getByText("Camera")).toBeTruthy();
    expect(screen.getByText("Files")).toBeTruthy();
    expect(screen.getByText("+ Agent")).toBeTruthy();
    expect(screen.getByText("+ Project")).toBeTruthy();
  });

  // --- Selection ---

  it("should call onSelect with 'photos' when Photos is pressed", () => {
    render(<AttachmentMenu {...defaultProps} />);

    fireEvent.press(screen.getByTestId("attachment-menu-photos"));

    expect(defaultProps.onSelect).toHaveBeenCalledWith("photos");
  });

  it("should call onSelect with 'camera' when Camera is pressed", () => {
    render(<AttachmentMenu {...defaultProps} />);

    fireEvent.press(screen.getByTestId("attachment-menu-camera"));

    expect(defaultProps.onSelect).toHaveBeenCalledWith("camera");
  });

  it("should call onSelect with 'files' when Files is pressed", () => {
    render(<AttachmentMenu {...defaultProps} />);

    fireEvent.press(screen.getByTestId("attachment-menu-files"));

    expect(defaultProps.onSelect).toHaveBeenCalledWith("files");
  });

  it("should call onSelect with 'agent' when + Agent is pressed", () => {
    render(<AttachmentMenu {...defaultProps} />);

    fireEvent.press(screen.getByTestId("attachment-menu-agent"));

    expect(defaultProps.onSelect).toHaveBeenCalledWith("agent");
  });

  it("should call onSelect with 'project' when + Project is pressed", () => {
    render(<AttachmentMenu {...defaultProps} />);

    fireEvent.press(screen.getByTestId("attachment-menu-project"));

    expect(defaultProps.onSelect).toHaveBeenCalledWith("project");
  });

  it("should call onClose after selection", () => {
    render(<AttachmentMenu {...defaultProps} />);

    fireEvent.press(screen.getByTestId("attachment-menu-photos"));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // --- Haptic feedback ---

  it("should trigger haptic feedback on option press", () => {
    render(<AttachmentMenu {...defaultProps} />);

    fireEvent.press(screen.getByTestId("attachment-menu-camera"));

    expect(mockImpactAsync).toHaveBeenCalledWith("light");
  });

  // --- Overlay close ---

  it("should call onClose when overlay is pressed", () => {
    render(<AttachmentMenu {...defaultProps} />);

    fireEvent.press(screen.getByTestId("attachment-menu-overlay"));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // --- Accessibility ---

  it("should have accessibility labels on all options", () => {
    render(<AttachmentMenu {...defaultProps} />);

    expect(screen.getByTestId("attachment-menu-photos").props.accessibilityLabel).toBe("Photos");
    expect(screen.getByTestId("attachment-menu-camera").props.accessibilityLabel).toBe("Camera");
    expect(screen.getByTestId("attachment-menu-files").props.accessibilityLabel).toBe("Files");
    expect(screen.getByTestId("attachment-menu-agent").props.accessibilityLabel).toBe("+ Agent");
    expect(screen.getByTestId("attachment-menu-project").props.accessibilityLabel).toBe("+ Project");
  });

  it("should have accessibility label on overlay", () => {
    render(<AttachmentMenu {...defaultProps} />);

    expect(
      screen.getByTestId("attachment-menu-overlay").props.accessibilityLabel,
    ).toBe("Close attachment menu");
  });
});
