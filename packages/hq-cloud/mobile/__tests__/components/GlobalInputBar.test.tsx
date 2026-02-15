/**
 * Tests for GlobalInputBar component.
 * Covers: text input, send button, voice mic, attachment button, attachment menu integration,
 * haptic feedback, sending state, placeholder text, accessibility.
 *
 * MOB-013: Global input bar with voice and attachments
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { GlobalInputBar } from "../../src/components/GlobalInputBar";

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

describe("GlobalInputBar", () => {
  const defaultProps = {
    onSendMessage: jest.fn(),
    onVoiceInput: jest.fn(),
    onAttachment: jest.fn(),
    onSpawnAgent: jest.fn(),
    onCreateProject: jest.fn(),
    testID: "global-input",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Rendering ---

  it("should render the container", () => {
    render(<GlobalInputBar {...defaultProps} />);
    expect(screen.getByTestId("global-input")).toBeTruthy();
  });

  it("should render the text input", () => {
    render(<GlobalInputBar {...defaultProps} />);
    expect(screen.getByTestId("global-input-input")).toBeTruthy();
  });

  it("should show 'Ask anything...' placeholder", () => {
    render(<GlobalInputBar {...defaultProps} />);
    expect(screen.getByPlaceholderText("Ask anything...")).toBeTruthy();
  });

  it("should render the attachment button", () => {
    render(<GlobalInputBar {...defaultProps} />);
    expect(screen.getByTestId("global-input-attach")).toBeTruthy();
  });

  it("should render mic button when no text", () => {
    render(<GlobalInputBar {...defaultProps} />);
    expect(screen.getByTestId("global-input-mic")).toBeTruthy();
  });

  it("should show send button instead of mic when text is entered", () => {
    render(<GlobalInputBar {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId("global-input-input"), "Hello");

    expect(screen.getByTestId("global-input-send")).toBeTruthy();
    expect(screen.queryByTestId("global-input-mic")).toBeNull();
  });

  it("should show mic button when text is cleared", () => {
    render(<GlobalInputBar {...defaultProps} />);

    const input = screen.getByTestId("global-input-input");
    fireEvent.changeText(input, "Hello");
    expect(screen.queryByTestId("global-input-mic")).toBeNull();

    fireEvent.changeText(input, "");
    expect(screen.getByTestId("global-input-mic")).toBeTruthy();
  });

  // --- Send message ---

  it("should call onSendMessage when send button pressed with text", () => {
    render(<GlobalInputBar {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId("global-input-input"), "Hello world");
    fireEvent.press(screen.getByTestId("global-input-send"));

    expect(defaultProps.onSendMessage).toHaveBeenCalledWith("Hello world");
  });

  it("should clear text after sending", () => {
    render(<GlobalInputBar {...defaultProps} />);

    const input = screen.getByTestId("global-input-input");
    fireEvent.changeText(input, "Hello");
    fireEvent.press(screen.getByTestId("global-input-send"));

    expect(input.props.value).toBe("");
  });

  it("should trigger haptic feedback on send", () => {
    render(<GlobalInputBar {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId("global-input-input"), "Hello");
    fireEvent.press(screen.getByTestId("global-input-send"));

    expect(mockImpactAsync).toHaveBeenCalledWith("light");
  });

  it("should trim message before sending", () => {
    render(<GlobalInputBar {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId("global-input-input"), "  Hello  ");
    fireEvent.press(screen.getByTestId("global-input-send"));

    expect(defaultProps.onSendMessage).toHaveBeenCalledWith("Hello");
  });

  it("should not send whitespace-only message", () => {
    render(<GlobalInputBar {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId("global-input-input"), "   ");

    // Whitespace-only should still show mic, not send
    expect(screen.getByTestId("global-input-mic")).toBeTruthy();
  });

  it("should send on submit editing (return key)", () => {
    render(<GlobalInputBar {...defaultProps} />);

    const input = screen.getByTestId("global-input-input");
    fireEvent.changeText(input, "Hello via return");
    fireEvent(input, "submitEditing");

    expect(defaultProps.onSendMessage).toHaveBeenCalledWith("Hello via return");
  });

  // --- Voice input ---

  it("should call onVoiceInput when mic button is pressed", () => {
    render(<GlobalInputBar {...defaultProps} />);

    fireEvent.press(screen.getByTestId("global-input-mic"));

    expect(defaultProps.onVoiceInput).toHaveBeenCalled();
  });

  it("should trigger haptic feedback on mic press", () => {
    render(<GlobalInputBar {...defaultProps} />);

    fireEvent.press(screen.getByTestId("global-input-mic"));

    expect(mockImpactAsync).toHaveBeenCalledWith("medium");
  });

  it("should show recording state on mic button", () => {
    render(<GlobalInputBar {...defaultProps} recording={true} />);

    const micButton = screen.getByTestId("global-input-mic");
    expect(micButton.props.accessibilityLabel).toBe("Stop recording");
  });

  it("should show default mic label when not recording", () => {
    render(<GlobalInputBar {...defaultProps} recording={false} />);

    const micButton = screen.getByTestId("global-input-mic");
    expect(micButton.props.accessibilityLabel).toBe("Voice input");
  });

  // --- Attachment menu ---

  it("should trigger haptic feedback on attachment press", () => {
    render(<GlobalInputBar {...defaultProps} />);

    fireEvent.press(screen.getByTestId("global-input-attach"));

    expect(mockImpactAsync).toHaveBeenCalledWith("light");
  });

  // --- Sending state ---

  it("should disable input when sending", () => {
    render(<GlobalInputBar {...defaultProps} sending={true} />);

    const input = screen.getByTestId("global-input-input");
    expect(input.props.editable).toBe(false);
  });

  it("should not trigger voice input when sending", () => {
    render(<GlobalInputBar {...defaultProps} sending={true} />);

    fireEvent.press(screen.getByTestId("global-input-mic"));

    expect(defaultProps.onVoiceInput).not.toHaveBeenCalled();
  });

  it("should not open attachment menu when sending", () => {
    render(<GlobalInputBar {...defaultProps} sending={true} />);

    fireEvent.press(screen.getByTestId("global-input-attach"));

    // The attachment menu modal should not become visible
    // (haptic not called because sending check happens before)
    expect(mockImpactAsync).not.toHaveBeenCalled();
  });

  // --- Accessibility ---

  it("should have accessibility label on input", () => {
    render(<GlobalInputBar {...defaultProps} />);

    const input = screen.getByTestId("global-input-input");
    expect(input.props.accessibilityLabel).toBe("Ask anything input");
  });

  it("should have accessibility label on attachment button", () => {
    render(<GlobalInputBar {...defaultProps} />);

    const attach = screen.getByTestId("global-input-attach");
    expect(attach.props.accessibilityLabel).toBe("Attach file");
  });

  it("should have accessibility label on send button", () => {
    render(<GlobalInputBar {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId("global-input-input"), "Hi");

    const send = screen.getByTestId("global-input-send");
    expect(send.props.accessibilityLabel).toBe("Send message");
  });

  it("should have accessibility label on mic button", () => {
    render(<GlobalInputBar {...defaultProps} />);

    const mic = screen.getByTestId("global-input-mic");
    expect(mic.props.accessibilityLabel).toBe("Voice input");
  });

  it("should indicate disabled state on attachment button when sending", () => {
    render(<GlobalInputBar {...defaultProps} sending={true} />);

    const attach = screen.getByTestId("global-input-attach");
    expect(attach.props.accessibilityState).toEqual({ disabled: true });
  });
});
