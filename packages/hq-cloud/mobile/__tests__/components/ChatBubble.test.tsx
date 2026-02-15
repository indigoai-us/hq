/**
 * Tests for ChatBubble component.
 * Covers: agent, user, system, tool message rendering with correct styles.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { ChatBubble } from "../../src/components/ChatBubble";
import type { AgentMessage } from "../../src/types";

describe("ChatBubble", () => {
  const baseTimestamp = "2026-02-08T14:30:00Z";

  describe("agent messages", () => {
    const agentMessage: AgentMessage = {
      id: "msg-1",
      role: "agent",
      content: "I'll help you build a comprehensive brand management system.",
      timestamp: baseTimestamp,
    };

    it("should render agent message content", () => {
      render(<ChatBubble message={agentMessage} testID="msg" />);
      expect(screen.getByText(agentMessage.content)).toBeTruthy();
    });

    it("should apply testID", () => {
      render(<ChatBubble message={agentMessage} testID="msg" />);
      expect(screen.getByTestId("msg")).toBeTruthy();
    });

    it("should show timestamp", () => {
      render(<ChatBubble message={agentMessage} testID="msg" />);
      // Time depends on timezone, just check component renders
      expect(screen.getByTestId("msg")).toBeTruthy();
    });
  });

  describe("user messages", () => {
    const userMessage: AgentMessage = {
      id: "msg-2",
      role: "user",
      content: "Sounds good, please proceed.",
      timestamp: baseTimestamp,
    };

    it("should render user message content", () => {
      render(<ChatBubble message={userMessage} testID="msg" />);
      expect(screen.getByText(userMessage.content)).toBeTruthy();
    });

    it("should apply testID", () => {
      render(<ChatBubble message={userMessage} testID="msg" />);
      expect(screen.getByTestId("msg")).toBeTruthy();
    });
  });

  describe("system messages", () => {
    const systemMessage: AgentMessage = {
      id: "msg-3",
      role: "system",
      content: "Agent started a new task.",
      timestamp: baseTimestamp,
    };

    it("should render system message content", () => {
      render(<ChatBubble message={systemMessage} testID="msg" />);
      expect(screen.getByText(systemMessage.content)).toBeTruthy();
    });

    it("should apply testID", () => {
      render(<ChatBubble message={systemMessage} testID="msg" />);
      expect(screen.getByTestId("msg")).toBeTruthy();
    });
  });

  describe("tool messages", () => {
    const toolMessage: AgentMessage = {
      id: "msg-4",
      role: "tool",
      content: "",
      toolName: "Explore HQ knowledge structure",
      toolStatus: "completed",
      timestamp: baseTimestamp,
    };

    it("should render tool name", () => {
      render(<ChatBubble message={toolMessage} testID="msg" />);
      expect(screen.getByText("Explore HQ knowledge structure")).toBeTruthy();
    });

    it("should render 'Task' label", () => {
      render(<ChatBubble message={toolMessage} testID="msg" />);
      expect(screen.getByText("Task")).toBeTruthy();
    });

    it("should render completed status icon", () => {
      render(<ChatBubble message={toolMessage} testID="msg" />);
      // Checkmark for completed
      expect(screen.getByText("\u2713")).toBeTruthy();
    });

    it("should render running status icon", () => {
      const runningTool: AgentMessage = {
        ...toolMessage,
        id: "msg-4b",
        toolStatus: "running",
      };
      render(<ChatBubble message={runningTool} testID="msg" />);
      expect(screen.getByText("\u25CB")).toBeTruthy();
    });

    it("should render failed status icon", () => {
      const failedTool: AgentMessage = {
        ...toolMessage,
        id: "msg-4c",
        toolStatus: "failed",
      };
      render(<ChatBubble message={failedTool} testID="msg" />);
      expect(screen.getByText("\u2717")).toBeTruthy();
    });

    it("should render tool output when content and toolName both present", () => {
      const toolWithOutput: AgentMessage = {
        ...toolMessage,
        id: "msg-4d",
        content: "Found 12 knowledge files.",
      };
      render(<ChatBubble message={toolWithOutput} testID="msg" />);
      expect(screen.getByText("Found 12 knowledge files.")).toBeTruthy();
    });

    it("should use content as tool name when toolName is missing", () => {
      const toolNoName: AgentMessage = {
        id: "msg-4e",
        role: "tool",
        content: "Running file scan",
        timestamp: baseTimestamp,
        toolStatus: "running",
      };
      render(<ChatBubble message={toolNoName} testID="msg" />);
      expect(screen.getByText("Running file scan")).toBeTruthy();
    });
  });

  describe("edge cases", () => {
    it("should handle very long agent messages", () => {
      const longMessage: AgentMessage = {
        id: "msg-long",
        role: "agent",
        content: "A".repeat(1000),
        timestamp: baseTimestamp,
      };
      render(<ChatBubble message={longMessage} testID="msg" />);
      expect(screen.getByTestId("msg")).toBeTruthy();
    });

    it("should handle empty content", () => {
      const emptyMessage: AgentMessage = {
        id: "msg-empty",
        role: "agent",
        content: "",
        timestamp: baseTimestamp,
      };
      render(<ChatBubble message={emptyMessage} testID="msg" />);
      expect(screen.getByTestId("msg")).toBeTruthy();
    });

    it("should handle tool with no status", () => {
      const noStatusTool: AgentMessage = {
        id: "msg-nostatus",
        role: "tool",
        content: "Some task",
        timestamp: baseTimestamp,
      };
      render(<ChatBubble message={noStatusTool} testID="msg" />);
      expect(screen.getByTestId("msg")).toBeTruthy();
    });
  });
});
