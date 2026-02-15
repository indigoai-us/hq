/**
 * Tests for AgentCard component.
 * Includes MOB-005 tests: haptic feedback, answered state, double-tap prevention.
 * Includes MOB-012 tests: inline permission prompts on agent cards.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { AgentCard } from "../../src/components/AgentCard";
import type { Agent } from "../../src/types";

// Helper to create a test agent
function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Content Planner",
    type: "content",
    status: "running",
    progress: { completed: 3, total: 6 },
    lastActivity: new Date().toISOString(),
    ...overrides,
  };
}

describe("AgentCard", () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders agent name", () => {
    const agent = createAgent({ name: "Research Agent" });
    const { getByText } = render(
      <AgentCard agent={agent} onPress={mockOnPress} />,
    );
    expect(getByText("Research Agent")).toBeTruthy();
  });

  it("renders progress fraction", () => {
    const agent = createAgent({ progress: { completed: 4, total: 6 } });
    const { getByText } = render(
      <AgentCard agent={agent} onPress={mockOnPress} />,
    );
    expect(getByText("4/6")).toBeTruthy();
  });

  it("calls onPress when card is tapped", () => {
    const agent = createAgent();
    const { getByTestId } = render(
      <AgentCard agent={agent} onPress={mockOnPress} testID="card" />,
    );
    fireEvent.press(getByTestId("card"));
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it("renders agent type icon", () => {
    const agent = createAgent({ type: "research" });
    const { getByTestId } = render(
      <AgentCard agent={agent} onPress={mockOnPress} testID="card" />,
    );
    expect(getByTestId("card-icon")).toBeTruthy();
  });

  it("does not render question section when not waiting_input", () => {
    const agent = createAgent({ status: "running" });
    const { queryByText } = render(
      <AgentCard agent={agent} onPress={mockOnPress} />,
    );
    expect(queryByText("Type something else...")).toBeNull();
  });

  it("renders question when status is waiting_input with currentQuestion", () => {
    const agent = createAgent({
      status: "waiting_input",
      currentQuestion: {
        id: "q-1",
        text: "Which task do you want to work on?",
        options: ["Task A", "Task B"],
        askedAt: new Date().toISOString(),
      },
    });
    const { getByText } = render(
      <AgentCard agent={agent} onPress={mockOnPress} />,
    );
    expect(getByText("Which task do you want to work on?")).toBeTruthy();
    expect(getByText("Task A")).toBeTruthy();
    expect(getByText("Task B")).toBeTruthy();
  });

  it("calls onAnswerQuestion when option button is pressed", () => {
    const mockAnswer = jest.fn();
    const agent = createAgent({
      status: "waiting_input",
      currentQuestion: {
        id: "q-1",
        text: "Pick one",
        options: ["Alpha", "Beta"],
        askedAt: new Date().toISOString(),
      },
    });
    const { getByText } = render(
      <AgentCard
        agent={agent}
        onPress={mockOnPress}
        onAnswerQuestion={mockAnswer}
      />,
    );
    fireEvent.press(getByText("Alpha"));
    expect(mockAnswer).toHaveBeenCalledWith("q-1", "Alpha");
  });

  it("renders custom answer input when question is shown", () => {
    const agent = createAgent({
      status: "waiting_input",
      currentQuestion: {
        id: "q-1",
        text: "Question?",
        options: [],
        askedAt: new Date().toISOString(),
      },
    });
    const { getByPlaceholderText } = render(
      <AgentCard agent={agent} onPress={mockOnPress} />,
    );
    expect(getByPlaceholderText("Type something else...")).toBeTruthy();
  });

  it("calls onSubmitCustomAnswer when custom input is submitted", () => {
    const mockCustomAnswer = jest.fn();
    const agent = createAgent({
      status: "waiting_input",
      currentQuestion: {
        id: "q-2",
        text: "Question?",
        options: [],
        askedAt: new Date().toISOString(),
      },
    });
    const { getByTestId } = render(
      <AgentCard
        agent={agent}
        onPress={mockOnPress}
        onSubmitCustomAnswer={mockCustomAnswer}
        testID="card"
      />,
    );
    const input = getByTestId("card-custom-input");
    fireEvent.changeText(input, "My custom answer");
    fireEvent(input, "submitEditing");
    expect(mockCustomAnswer).toHaveBeenCalledWith("q-2", "My custom answer");
  });

  it("does not render question section when waiting_input but no currentQuestion", () => {
    const agent = createAgent({
      status: "waiting_input",
      currentQuestion: undefined,
    });
    const { queryByPlaceholderText } = render(
      <AgentCard agent={agent} onPress={mockOnPress} />,
    );
    expect(queryByPlaceholderText("Type something else...")).toBeNull();
  });

  // --- MOB-005: Quick answer from worker card ---

  describe("MOB-005: Quick answer", () => {
    it("triggers haptic feedback when option is pressed", () => {
      const mockAnswer = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentQuestion: {
          id: "q-1",
          text: "Pick one",
          options: ["Alpha", "Beta"],
          askedAt: new Date().toISOString(),
        },
      });
      render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onAnswerQuestion={mockAnswer}
        />,
      );
      fireEvent.press(
        // getByText returns the Text element; for OptionButton use the text
        render(
          <AgentCard
            agent={agent}
            onPress={mockOnPress}
            onAnswerQuestion={mockAnswer}
          />,
        ).getByText("Alpha"),
      );
      expect(Haptics.impactAsync).toHaveBeenCalledWith(
        Haptics.ImpactFeedbackStyle.Medium,
      );
    });

    it("triggers haptic feedback when custom answer is submitted", () => {
      const mockCustomAnswer = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentQuestion: {
          id: "q-2",
          text: "Question?",
          options: [],
          askedAt: new Date().toISOString(),
        },
      });
      const { getByTestId } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onSubmitCustomAnswer={mockCustomAnswer}
          testID="card"
        />,
      );
      const input = getByTestId("card-custom-input");
      fireEvent.changeText(input, "My answer");
      fireEvent(input, "submitEditing");
      expect(Haptics.impactAsync).toHaveBeenCalledWith(
        Haptics.ImpactFeedbackStyle.Medium,
      );
    });

    it("shows answered state after option is pressed", () => {
      const mockAnswer = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentQuestion: {
          id: "q-1",
          text: "Pick one",
          options: ["Alpha", "Beta"],
          askedAt: new Date().toISOString(),
        },
      });
      const { getByText, queryByText } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onAnswerQuestion={mockAnswer}
          testID="card"
        />,
      );
      fireEvent.press(getByText("Alpha"));

      // "Answered" confirmation should appear
      expect(getByText("Answered")).toBeTruthy();
      // Options should be hidden after answering
      expect(queryByText("Alpha")).toBeNull();
      expect(queryByText("Beta")).toBeNull();
    });

    it("shows answered state after custom answer is submitted", () => {
      const mockCustomAnswer = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentQuestion: {
          id: "q-2",
          text: "Question?",
          options: [],
          askedAt: new Date().toISOString(),
        },
      });
      const { getByTestId, getByText, queryByPlaceholderText } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onSubmitCustomAnswer={mockCustomAnswer}
          testID="card"
        />,
      );
      const input = getByTestId("card-custom-input");
      fireEvent.changeText(input, "My answer");
      fireEvent(input, "submitEditing");

      // "Answered" confirmation should appear
      expect(getByText("Answered")).toBeTruthy();
      // Custom input should be hidden
      expect(queryByPlaceholderText("Type something else...")).toBeNull();
    });

    it("prevents double-tap on option buttons", () => {
      const mockAnswer = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentQuestion: {
          id: "q-1",
          text: "Pick one",
          options: ["Alpha"],
          askedAt: new Date().toISOString(),
        },
      });
      const { getByText } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onAnswerQuestion={mockAnswer}
          testID="card"
        />,
      );
      fireEvent.press(getByText("Alpha"));
      // After first press, "Answered" replaces options so Alpha is gone
      // The handler should have been called only once
      expect(mockAnswer).toHaveBeenCalledTimes(1);
    });

    it("does not call onAnswerQuestion when sending is true (no handler without onAnswerQuestion)", () => {
      // Without onAnswerQuestion, pressing should do nothing
      const agent = createAgent({
        status: "waiting_input",
        currentQuestion: {
          id: "q-1",
          text: "Pick one",
          options: ["Alpha"],
          askedAt: new Date().toISOString(),
        },
      });
      const { getByText } = render(
        <AgentCard agent={agent} onPress={mockOnPress} />,
      );
      // Should not throw even without handler
      fireEvent.press(getByText("Alpha"));
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
    });

    it("renders answered testID when answered", () => {
      const mockAnswer = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentQuestion: {
          id: "q-1",
          text: "Pick one",
          options: ["Alpha"],
          askedAt: new Date().toISOString(),
        },
      });
      const { getByText, getByTestId } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onAnswerQuestion={mockAnswer}
          testID="card"
        />,
      );
      fireEvent.press(getByText("Alpha"));
      expect(getByTestId("card-answered")).toBeTruthy();
    });
  });

  // --- MOB-012: Inline permission prompts on agent cards ---

  describe("MOB-012: Inline permission prompts", () => {
    it("renders permission prompt when agent has currentPermission", () => {
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByText } = render(
        <AgentCard agent={agent} onPress={mockOnPress} testID="card" />,
      );
      expect(getByText(/Read Desktop/)).toBeTruthy();
      expect(getByText(/access your Desktop folder/)).toBeTruthy();
      expect(getByText("Allow")).toBeTruthy();
      expect(getByText("Deny")).toBeTruthy();
    });

    it("does not render permission section when status is not waiting_input", () => {
      const agent = createAgent({
        status: "running",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { queryByTestId } = render(
        <AgentCard agent={agent} onPress={mockOnPress} testID="card" />,
      );
      expect(queryByTestId("card-permission")).toBeNull();
    });

    it("does not render permission section when no currentPermission", () => {
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: undefined,
      });
      const { queryByTestId } = render(
        <AgentCard agent={agent} onPress={mockOnPress} testID="card" />,
      );
      expect(queryByTestId("card-permission")).toBeNull();
    });

    it("renders permission testID", () => {
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Run Command",
          description: "execute a shell command",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByTestId } = render(
        <AgentCard agent={agent} onPress={mockOnPress} testID="card" />,
      );
      expect(getByTestId("card-permission")).toBeTruthy();
      expect(getByTestId("card-permission-allow")).toBeTruthy();
      expect(getByTestId("card-permission-deny")).toBeTruthy();
    });

    it("calls onRespondPermission with true when Allow is pressed", () => {
      const mockRespond = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByTestId } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onRespondPermission={mockRespond}
          testID="card"
        />,
      );
      fireEvent.press(getByTestId("card-permission-allow"));
      expect(mockRespond).toHaveBeenCalledWith("perm-1", true);
    });

    it("calls onRespondPermission with false when Deny is pressed", () => {
      const mockRespond = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByTestId } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onRespondPermission={mockRespond}
          testID="card"
        />,
      );
      fireEvent.press(getByTestId("card-permission-deny"));
      expect(mockRespond).toHaveBeenCalledWith("perm-1", false);
    });

    it("triggers haptic feedback when Allow is pressed", () => {
      const mockRespond = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByTestId } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onRespondPermission={mockRespond}
          testID="card"
        />,
      );
      fireEvent.press(getByTestId("card-permission-allow"));
      expect(Haptics.impactAsync).toHaveBeenCalledWith(
        Haptics.ImpactFeedbackStyle.Medium,
      );
    });

    it("triggers haptic feedback when Deny is pressed", () => {
      const mockRespond = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByTestId } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onRespondPermission={mockRespond}
          testID="card"
        />,
      );
      fireEvent.press(getByTestId("card-permission-deny"));
      expect(Haptics.impactAsync).toHaveBeenCalledWith(
        Haptics.ImpactFeedbackStyle.Medium,
      );
    });

    it("shows 'Allowed' response after Allow is pressed", () => {
      const mockRespond = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByTestId, getByText, queryByText } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onRespondPermission={mockRespond}
          testID="card"
        />,
      );
      fireEvent.press(getByTestId("card-permission-allow"));

      // "Allowed: Read Desktop" should appear
      expect(getByText("Allowed: Read Desktop")).toBeTruthy();
      // Buttons should be gone
      expect(queryByText("Allow")).toBeNull();
      expect(queryByText("Deny")).toBeNull();
    });

    it("shows 'Denied' response after Deny is pressed", () => {
      const mockRespond = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByTestId, getByText, queryByText } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onRespondPermission={mockRespond}
          testID="card"
        />,
      );
      fireEvent.press(getByTestId("card-permission-deny"));

      // "Denied: Read Desktop" should appear
      expect(getByText("Denied: Read Desktop")).toBeTruthy();
      // Buttons should be gone
      expect(queryByText("Allow")).toBeNull();
      expect(queryByText("Deny")).toBeNull();
    });

    it("renders permission-responded testID after response", () => {
      const mockRespond = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByTestId } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onRespondPermission={mockRespond}
          testID="card"
        />,
      );
      fireEvent.press(getByTestId("card-permission-allow"));
      expect(getByTestId("card-permission-responded")).toBeTruthy();
    });

    it("prevents double-tap on Allow button", () => {
      const mockRespond = jest.fn();
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByTestId } = render(
        <AgentCard
          agent={agent}
          onPress={mockOnPress}
          onRespondPermission={mockRespond}
          testID="card"
        />,
      );
      fireEvent.press(getByTestId("card-permission-allow"));
      // After first press, responded state replaces buttons
      expect(mockRespond).toHaveBeenCalledTimes(1);
    });

    it("does not trigger haptic when no onRespondPermission handler", () => {
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByTestId } = render(
        <AgentCard agent={agent} onPress={mockOnPress} testID="card" />,
      );
      fireEvent.press(getByTestId("card-permission-allow"));
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
    });

    it("shows timestamp on permission request", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const agent = createAgent({
        status: "waiting_input",
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: fiveMinutesAgo,
        },
      });
      const { getByText } = render(
        <AgentCard agent={agent} onPress={mockOnPress} testID="card" />,
      );
      expect(getByText("5m")).toBeTruthy();
    });

    it("shows permission prompt instead of question when both exist", () => {
      const agent = createAgent({
        status: "waiting_input",
        currentQuestion: {
          id: "q-1",
          text: "Which task?",
          options: ["Task A"],
          askedAt: new Date().toISOString(),
        },
        currentPermission: {
          id: "perm-1",
          tool: "Read Desktop",
          description: "access your Desktop folder",
          requestedAt: new Date().toISOString(),
        },
      });
      const { getByText, queryByText, getByTestId } = render(
        <AgentCard agent={agent} onPress={mockOnPress} testID="card" />,
      );
      // Permission should be shown
      expect(getByTestId("card-permission")).toBeTruthy();
      expect(getByText("Allow")).toBeTruthy();
      // Question should NOT be shown (permission takes priority)
      expect(queryByText("Which task?")).toBeNull();
      expect(queryByText("Task A")).toBeNull();
    });
  });
});
