/**
 * Tests for ChatInput component.
 * Covers: text input, send button, quick-reply options, haptic feedback,
 * sending state, placeholder text, accessibility.
 *
 * MOB-007: Answer input on detail screen
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { ChatInput } from "../../src/components/ChatInput";
import type { AgentQuestion } from "../../src/types";

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

const mockQuestion: AgentQuestion = {
  id: "q-1",
  text: "Which task do you want to work on?",
  options: ["Option A", "Option B", "Option C"],
  askedAt: "2026-02-08T10:00:00Z",
};

const mockQuestionNoOptions: AgentQuestion = {
  id: "q-2",
  text: "What should I do next?",
  askedAt: "2026-02-08T10:00:00Z",
};

describe("ChatInput", () => {
  const defaultProps = {
    onSendMessage: jest.fn(),
    onSelectOption: jest.fn(),
    testID: "chat-input",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Rendering ---

  it("should render the input field", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByTestId("chat-input-input")).toBeTruthy();
  });

  it("should render the send button", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByTestId("chat-input-send")).toBeTruthy();
  });

  it("should render the container", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByTestId("chat-input")).toBeTruthy();
  });

  it("should show default placeholder when no question", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeTruthy();
  });

  it("should show answer placeholder when question is pending", () => {
    render(<ChatInput {...defaultProps} currentQuestion={mockQuestion} />);
    expect(screen.getByPlaceholderText("Type your answer...")).toBeTruthy();
  });

  // --- Quick-reply options ---

  it("should render quick-reply options when question has options", () => {
    render(<ChatInput {...defaultProps} currentQuestion={mockQuestion} />);

    expect(screen.getByTestId("chat-input-options")).toBeTruthy();
    expect(screen.getByTestId("chat-input-option-Option A")).toBeTruthy();
    expect(screen.getByTestId("chat-input-option-Option B")).toBeTruthy();
    expect(screen.getByTestId("chat-input-option-Option C")).toBeTruthy();
  });

  it("should not render options row when no question", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.queryByTestId("chat-input-options")).toBeNull();
  });

  it("should not render options row when question has no options", () => {
    render(
      <ChatInput {...defaultProps} currentQuestion={mockQuestionNoOptions} />,
    );
    expect(screen.queryByTestId("chat-input-options")).toBeNull();
  });

  it("should call onSelectOption when option is pressed", () => {
    render(<ChatInput {...defaultProps} currentQuestion={mockQuestion} />);

    fireEvent.press(screen.getByTestId("chat-input-option-Option A"));

    expect(defaultProps.onSelectOption).toHaveBeenCalledWith("q-1", "Option A");
  });

  it("should trigger haptic feedback on option press", () => {
    render(<ChatInput {...defaultProps} currentQuestion={mockQuestion} />);

    fireEvent.press(screen.getByTestId("chat-input-option-Option B"));

    expect(mockImpactAsync).toHaveBeenCalledWith("medium");
  });

  it("should not call onSelectOption when sending", () => {
    render(
      <ChatInput
        {...defaultProps}
        currentQuestion={mockQuestion}
        sending={true}
      />,
    );

    fireEvent.press(screen.getByTestId("chat-input-option-Option A"));

    expect(defaultProps.onSelectOption).not.toHaveBeenCalled();
  });

  // --- Text input and send ---

  it("should update text when typing", () => {
    render(<ChatInput {...defaultProps} />);

    const input = screen.getByTestId("chat-input-input");
    fireEvent.changeText(input, "Hello agent");

    expect(input.props.value).toBe("Hello agent");
  });

  it("should call onSendMessage when send button pressed with text", () => {
    render(<ChatInput {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId("chat-input-input"), "Hello agent");
    fireEvent.press(screen.getByTestId("chat-input-send"));

    expect(defaultProps.onSendMessage).toHaveBeenCalledWith("Hello agent");
  });

  it("should clear text after sending", () => {
    render(<ChatInput {...defaultProps} />);

    const input = screen.getByTestId("chat-input-input");
    fireEvent.changeText(input, "Hello agent");
    fireEvent.press(screen.getByTestId("chat-input-send"));

    expect(input.props.value).toBe("");
  });

  it("should trigger haptic feedback on send", () => {
    render(<ChatInput {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId("chat-input-input"), "Hello");
    fireEvent.press(screen.getByTestId("chat-input-send"));

    expect(mockImpactAsync).toHaveBeenCalledWith("light");
  });

  it("should not send empty message", () => {
    render(<ChatInput {...defaultProps} />);

    fireEvent.press(screen.getByTestId("chat-input-send"));

    expect(defaultProps.onSendMessage).not.toHaveBeenCalled();
  });

  it("should not send whitespace-only message", () => {
    render(<ChatInput {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId("chat-input-input"), "   ");
    fireEvent.press(screen.getByTestId("chat-input-send"));

    expect(defaultProps.onSendMessage).not.toHaveBeenCalled();
  });

  it("should trim message before sending", () => {
    render(<ChatInput {...defaultProps} />);

    fireEvent.changeText(
      screen.getByTestId("chat-input-input"),
      "  Hello agent  ",
    );
    fireEvent.press(screen.getByTestId("chat-input-send"));

    expect(defaultProps.onSendMessage).toHaveBeenCalledWith("Hello agent");
  });

  it("should send on submit editing (return key)", () => {
    render(<ChatInput {...defaultProps} />);

    const input = screen.getByTestId("chat-input-input");
    fireEvent.changeText(input, "Hello via return");
    fireEvent(input, "submitEditing");

    expect(defaultProps.onSendMessage).toHaveBeenCalledWith("Hello via return");
  });

  // --- Sending state ---

  it("should disable input when sending", () => {
    render(<ChatInput {...defaultProps} sending={true} />);

    const input = screen.getByTestId("chat-input-input");
    expect(input.props.editable).toBe(false);
  });

  it("should not send when already sending", () => {
    render(<ChatInput {...defaultProps} sending={true} />);

    fireEvent.changeText(screen.getByTestId("chat-input-input"), "Hello");
    fireEvent.press(screen.getByTestId("chat-input-send"));

    expect(defaultProps.onSendMessage).not.toHaveBeenCalled();
  });

  // --- Accessibility ---

  it("should have accessibility label on input", () => {
    render(<ChatInput {...defaultProps} />);

    const input = screen.getByTestId("chat-input-input");
    expect(input.props.accessibilityLabel).toBe("Message input");
  });

  it("should have accessibility label on send button", () => {
    render(<ChatInput {...defaultProps} />);

    const send = screen.getByTestId("chat-input-send");
    expect(send.props.accessibilityLabel).toBe("Send message");
  });

  it("should have accessibility labels on option buttons", () => {
    render(<ChatInput {...defaultProps} currentQuestion={mockQuestion} />);

    const optA = screen.getByTestId("chat-input-option-Option A");
    expect(optA.props.accessibilityLabel).toBe("Option A");
  });

  it("should indicate disabled state on send button accessibility", () => {
    render(<ChatInput {...defaultProps} />);

    const send = screen.getByTestId("chat-input-send");
    expect(send.props.accessibilityState).toEqual({ disabled: true });
  });
});
