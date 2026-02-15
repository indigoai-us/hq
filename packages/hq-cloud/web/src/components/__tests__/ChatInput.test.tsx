import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatInput } from "../ChatInput";

describe("ChatInput", () => {
  it("renders the textarea with default placeholder", () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeTruthy();
  });

  it("renders with a custom placeholder", () => {
    render(<ChatInput onSend={vi.fn()} placeholder="Ask anything..." />);
    expect(screen.getByPlaceholderText("Ask anything...")).toBeTruthy();
  });

  it("renders the Send button", () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByText("Send")).toBeTruthy();
  });

  it("updates textarea value on typing", () => {
    render(<ChatInput onSend={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Type a message...") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello" } });
    expect(textarea.value).toBe("Hello");
  });

  it("calls onSend with trimmed text when Send is clicked", () => {
    const handleSend = vi.fn();
    render(<ChatInput onSend={handleSend} />);
    const textarea = screen.getByPlaceholderText("Type a message...") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "  Hello  " } });
    fireEvent.click(screen.getByText("Send"));
    expect(handleSend).toHaveBeenCalledWith("Hello");
  });

  it("clears textarea after sending", () => {
    render(<ChatInput onSend={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Type a message...") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send"));
    expect(textarea.value).toBe("");
  });

  it("calls onSend on Enter key press", () => {
    const handleSend = vi.fn();
    render(<ChatInput onSend={handleSend} />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(handleSend).toHaveBeenCalledWith("Hello");
  });

  it("does not send on Shift+Enter (allows newline)", () => {
    const handleSend = vi.fn();
    render(<ChatInput onSend={handleSend} />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(handleSend).not.toHaveBeenCalled();
  });

  it("does not send when text is empty", () => {
    const handleSend = vi.fn();
    render(<ChatInput onSend={handleSend} />);
    fireEvent.click(screen.getByText("Send"));
    expect(handleSend).not.toHaveBeenCalled();
  });

  it("does not send when text is only whitespace", () => {
    const handleSend = vi.fn();
    render(<ChatInput onSend={handleSend} />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.click(screen.getByText("Send"));
    expect(handleSend).not.toHaveBeenCalled();
  });

  it("shows '...' when sending is true", () => {
    render(<ChatInput onSend={vi.fn()} sending />);
    expect(screen.getByText("...")).toBeTruthy();
    expect(screen.queryByText("Send")).toBeNull();
  });

  it("disables textarea when sending", () => {
    render(<ChatInput onSend={vi.fn()} sending />);
    const textarea = screen.getByPlaceholderText("Type a message...") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it("disables send button when sending", () => {
    render(<ChatInput onSend={vi.fn()} sending />);
    const sendButton = screen.getByText("...") as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);
  });

  it("does not send when sending is true", () => {
    const handleSend = vi.fn();
    render(<ChatInput onSend={handleSend} sending />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(handleSend).not.toHaveBeenCalled();
  });

  it("renders option chips when options are provided", () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        options={["Yes", "No", "Maybe"]}
        onOptionSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
    expect(screen.getByText("Maybe")).toBeTruthy();
  });

  it("calls onOptionSelect when an option chip is clicked", () => {
    const handleOptionSelect = vi.fn();
    render(
      <ChatInput
        onSend={vi.fn()}
        options={["Approve", "Reject"]}
        onOptionSelect={handleOptionSelect}
      />,
    );
    fireEvent.click(screen.getByText("Approve"));
    expect(handleOptionSelect).toHaveBeenCalledWith("Approve");
  });

  it("does not render options when options array is empty", () => {
    const { container } = render(
      <ChatInput onSend={vi.fn()} options={[]} onOptionSelect={vi.fn()} />,
    );
    // No option buttons should exist
    const buttons = container.querySelectorAll("button");
    // Only the Send button should be present
    expect(buttons.length).toBe(1);
  });

  it("disables option chips when sending", () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        sending
        options={["Go"]}
        onOptionSelect={vi.fn()}
      />,
    );
    const optionButton = screen.getByText("Go") as HTMLButtonElement;
    expect(optionButton.disabled).toBe(true);
  });

  it("send button is disabled when textarea is empty", () => {
    render(<ChatInput onSend={vi.fn()} />);
    const sendButton = screen.getByText("Send") as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);
  });

  it("send button is enabled when textarea has content", () => {
    render(<ChatInput onSend={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    const sendButton = screen.getByText("Send") as HTMLButtonElement;
    expect(sendButton.disabled).toBe(false);
  });
});
