/**
 * Mock Container
 *
 * Simulates a Claude Code container that connects to the API's
 * /ws/relay/:sessionId WebSocket endpoint. Used in E2E tests
 * instead of deploying a real ECS task.
 *
 * Protocol:
 * 1. Connect to /ws/relay/:sessionId with Bearer token
 * 2. Send system/init message (Claude Code initialized)
 * 3. Wait for user messages
 * 4. Send assistant message with a response
 * 5. Send result message (success)
 */

import { WebSocket } from "ws";

export interface MockContainerOptions {
  apiUrl: string;
  sessionId: string;
  accessToken: string;
  /** Response to send when user sends a message. Defaults to "The answer is 4." */
  responseText?: string;
  /** Delay (ms) before sending assistant response. Defaults to 200. */
  responseDelay?: number;
  /** Whether to auto-respond to user messages. Defaults to true. */
  autoRespond?: boolean;
}

export interface MockContainer {
  /** Promise that resolves when connected and system/init sent */
  ready: Promise<void>;
  /** Close the mock container connection */
  close: () => void;
  /** Last user message received */
  lastUserMessage: string | null;
  /** Number of user messages received */
  userMessageCount: number;
  /** Whether the connection is open */
  isConnected: () => boolean;
  /** Manually send an assistant message */
  sendAssistantMessage: (text: string) => void;
  /** Manually send a result message */
  sendResult: (type?: string) => void;
  /** Manually send a permission request */
  sendPermissionRequest: (toolName: string, input: Record<string, unknown>) => void;
  /** Wait for the next user message */
  waitForUserMessage: (timeoutMs?: number) => Promise<string>;
}

/**
 * Create a mock container that connects to the API WebSocket relay.
 */
export function createMockContainer(options: MockContainerOptions): MockContainer {
  const {
    apiUrl,
    sessionId,
    accessToken,
    responseText = "The answer is 4.",
    responseDelay = 200,
    autoRespond = true,
  } = options;

  let ws: WebSocket | null = null;
  let lastUserMessage: string | null = null;
  let userMessageCount = 0;
  const userMessageListeners: Array<(content: string) => void> = [];

  const wsUrl = apiUrl.replace(/^http/, "ws");
  const url = `${wsUrl}/ws/relay/${sessionId}`;

  const ready = new Promise<void>((resolve, reject) => {
    ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const timeout = setTimeout(() => {
      reject(new Error("Mock container connection timeout"));
    }, 10_000);

    ws.on("open", () => {
      clearTimeout(timeout);

      // Send system/init message (Claude Code initialized)
      const initMsg = JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/hq",
        session_id: sessionId,
        model: "claude-sonnet-4-20250514",
        tools: [
          { name: "Read", type: "tool" },
          { name: "Write", type: "tool" },
          { name: "Bash", type: "tool" },
        ],
        mcp_servers: [],
        permission_mode: "default",
        claude_code_version: "1.0.0-mock",
      });

      ws!.send(initMsg + "\n");
      resolve();
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on("message", (data) => {
      const str = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      const lines = str.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          handleMessage(msg);
        } catch {
          // Ignore unparseable messages
        }
      }
    });

    ws.on("close", () => {
      ws = null;
    });
  });

  function handleMessage(msg: Record<string, unknown>): void {
    if (msg.type === "user") {
      const message = msg.message as Record<string, unknown> | undefined;
      const content =
        typeof message?.content === "string"
          ? message.content
          : typeof msg.content === "string"
            ? (msg.content as string)
            : "";

      lastUserMessage = content;
      userMessageCount++;

      // Notify listeners
      for (const listener of userMessageListeners) {
        listener(content);
      }
      userMessageListeners.length = 0;

      if (autoRespond && ws?.readyState === WebSocket.OPEN) {
        setTimeout(() => {
          sendAssistantMessage(responseText);
          setTimeout(() => {
            sendResult("success");
          }, 100);
        }, responseDelay);
      }
    }

    if (msg.type === "keep_alive") {
      // Respond to keep-alive
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "keep_alive" }) + "\n");
      }
    }
  }

  function sendAssistantMessage(text: string): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const assistantMsg = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text }],
      },
      content: text,
      session_id: sessionId,
    });

    ws.send(assistantMsg + "\n");
  }

  function sendResult(type = "success"): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const resultMsg = JSON.stringify({
      type: "result",
      result: "Task completed",
      result_type: type,
      subtype: type,
      duration_ms: 500,
      duration_api_ms: 400,
      cost_usd: 0.001,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      },
    });

    ws.send(resultMsg + "\n");
  }

  function sendPermissionRequest(
    toolName: string,
    input: Record<string, unknown>,
  ): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const requestId = `perm-${Date.now()}`;
    const permMsg = JSON.stringify({
      type: "control_request",
      request_id: requestId,
      request: {
        subtype: "can_use_tool",
        tool_name: toolName,
        tool_use_id: `tool-${Date.now()}`,
        input,
        decision_reason: "Tool requires permission",
      },
    });

    ws.send(permMsg + "\n");
  }

  function waitForUserMessage(timeoutMs = 30_000): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timeout waiting for user message"));
      }, timeoutMs);

      userMessageListeners.push((content) => {
        clearTimeout(timer);
        resolve(content);
      });
    });
  }

  return {
    ready,
    close: () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Mock container shutdown");
      }
      ws = null;
    },
    get lastUserMessage() {
      return lastUserMessage;
    },
    get userMessageCount() {
      return userMessageCount;
    },
    isConnected: () => ws?.readyState === WebSocket.OPEN,
    sendAssistantMessage,
    sendResult,
    sendPermissionRequest,
    waitForUserMessage,
  };
}
