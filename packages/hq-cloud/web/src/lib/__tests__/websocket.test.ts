import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocketService } from "../websocket";
import type { ServerEvent } from "@/types/websocket";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((this: WebSocket, ev: Event) => void) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => void) | null = null;
  onerror: ((this: WebSocket, ev: Event) => void) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => void) | null = null;

  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.call(this as unknown as WebSocket, new Event("open"));
  }

  simulateClose(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    // happy-dom's CloseEvent does not propagate code/reason from init options,
    // so we construct the event and set properties directly.
    const event = new CloseEvent("close");
    Object.defineProperty(event, "code", { value: code });
    Object.defineProperty(event, "reason", { value: reason });
    this.onclose?.call(this as unknown as WebSocket, event);
  }

  simulateMessage(data: unknown) {
    this.onmessage?.call(
      this as unknown as WebSocket,
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }

  simulateError() {
    this.onerror?.call(this as unknown as WebSocket, new Event("error"));
  }

  static instances: MockWebSocket[] = [];
  static clear() {
    MockWebSocket.instances = [];
  }
  static get latest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

describe("WebSocketService", () => {
  let service: WebSocketService;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.clear();
    vi.stubGlobal("WebSocket", MockWebSocket);

    service = new WebSocketService({
      url: "ws://localhost:3000",
      token: "test-key",
      reconnectDelay: 100,
      maxReconnectDelay: 1000,
      maxReconnectAttempts: 3,
      pingInterval: 5000,
    });
  });

  afterEach(() => {
    service.disconnect();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("connect", () => {
    it("creates WebSocket with correct URL including token", () => {
      service.connect();
      expect(MockWebSocket.latest).toBeDefined();
      expect(MockWebSocket.latest!.url).toBe(
        "ws://localhost:3000/ws?token=test-key",
      );
    });

    it("sets status to connecting", () => {
      const statusListener = vi.fn();
      service.onStatusChange(statusListener);

      service.connect();
      expect(statusListener).toHaveBeenCalledWith("connecting");
    });

    it("sets status to connected on open", () => {
      const statusListener = vi.fn();
      service.onStatusChange(statusListener);

      service.connect();
      MockWebSocket.latest!.simulateOpen();

      expect(statusListener).toHaveBeenCalledWith("connected");
      expect(service.getStatus()).toBe("connected");
    });

    it("does not create a new connection if already open", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();
      const firstWs = MockWebSocket.latest;

      service.connect();
      expect(MockWebSocket.latest).toBe(firstWs);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("does not create a new connection if already connecting", () => {
      service.connect();
      const firstWs = MockWebSocket.latest;

      service.connect();
      expect(MockWebSocket.latest).toBe(firstWs);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("encodes token in the URL", () => {
      const svc = new WebSocketService({
        url: "ws://localhost:3000",
        token: "key with spaces&special=chars",
      });
      svc.connect();
      expect(MockWebSocket.latest!.url).toContain(
        encodeURIComponent("key with spaces&special=chars"),
      );
      svc.disconnect();
    });
  });

  describe("disconnect", () => {
    it("closes the WebSocket with code 1000", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();
      const ws = MockWebSocket.latest!;

      service.disconnect();
      expect(ws.close).toHaveBeenCalledWith(1000, "Client disconnect");
    });

    it("sets status to disconnected", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();

      service.disconnect();
      expect(service.getStatus()).toBe("disconnected");
    });

    it("clears event handlers on the WebSocket", () => {
      service.connect();
      const ws = MockWebSocket.latest!;
      MockWebSocket.latest!.simulateOpen();

      service.disconnect();
      expect(ws.onopen).toBeNull();
      expect(ws.onclose).toBeNull();
      expect(ws.onerror).toBeNull();
      expect(ws.onmessage).toBeNull();
    });

    it("does not reconnect after intentional disconnect", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();
      service.disconnect();

      vi.advanceTimersByTime(10000);
      // Only the original connection should have been created
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe("send", () => {
    it("sends JSON-serialized event when connected", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();

      service.send({ type: "subscribe", payload: { channels: ["agents"] } });
      expect(MockWebSocket.latest!.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "subscribe", payload: { channels: ["agents"] } }),
      );
    });

    it("does not send when not connected", () => {
      service.connect();
      // Still in CONNECTING state
      service.send({ type: "ping", payload: {} });
      expect(MockWebSocket.latest!.send).not.toHaveBeenCalled();
    });
  });

  describe("on / event listeners", () => {
    it("dispatches events to listeners by type", () => {
      const listener = vi.fn();
      service.on("agent:updated", listener);

      service.connect();
      MockWebSocket.latest!.simulateOpen();

      const event: ServerEvent = {
        type: "agent:updated",
        payload: { agentId: "1", changes: {} },
        timestamp: "2025-01-01T00:00:00Z",
      };
      MockWebSocket.latest!.simulateMessage(event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it("does not dispatch events to listeners of other types", () => {
      const listener = vi.fn();
      service.on("agent:created", listener);

      service.connect();
      MockWebSocket.latest!.simulateOpen();

      const event: ServerEvent = {
        type: "agent:updated",
        payload: {},
        timestamp: "2025-01-01T00:00:00Z",
      };
      MockWebSocket.latest!.simulateMessage(event);

      expect(listener).not.toHaveBeenCalled();
    });

    it("returns an unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = service.on("agent:message", listener);

      service.connect();
      MockWebSocket.latest!.simulateOpen();

      unsubscribe();

      MockWebSocket.latest!.simulateMessage({
        type: "agent:message",
        payload: {},
        timestamp: "2025-01-01T00:00:00Z",
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it("supports multiple listeners for the same event type", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      service.on("error", listener1);
      service.on("error", listener2);

      service.connect();
      MockWebSocket.latest!.simulateOpen();

      const event: ServerEvent = {
        type: "error",
        payload: { code: "ERR", message: "fail" },
        timestamp: "2025-01-01T00:00:00Z",
      };
      MockWebSocket.latest!.simulateMessage(event);

      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
    });

    it("removeAllListeners clears all listeners", () => {
      const eventListener = vi.fn();
      const statusListener = vi.fn();
      service.on("agent:updated", eventListener);
      service.onStatusChange(statusListener);

      service.removeAllListeners();

      service.connect();
      MockWebSocket.latest!.simulateOpen();

      MockWebSocket.latest!.simulateMessage({
        type: "agent:updated",
        payload: {},
        timestamp: "2025-01-01T00:00:00Z",
      });

      // Only the "connecting" status before removeAllListeners was called should have fired
      // After removeAllListeners, no more callbacks
      expect(eventListener).not.toHaveBeenCalled();
    });
  });

  describe("onStatusChange", () => {
    it("notifies listeners of status transitions", () => {
      const listener = vi.fn();
      service.onStatusChange(listener);

      service.connect();
      MockWebSocket.latest!.simulateOpen();

      expect(listener).toHaveBeenCalledWith("connecting");
      expect(listener).toHaveBeenCalledWith("connected");
    });

    it("returns an unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = service.onStatusChange(listener);

      unsubscribe();
      service.connect();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("reconnection", () => {
    it("schedules reconnect after unexpected close", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();
      MockWebSocket.latest!.simulateClose(1006, "Abnormal");

      expect(service.getStatus()).toBe("reconnecting");

      vi.advanceTimersByTime(200);
      // Should have attempted to create a new WebSocket
      expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    });

    it("stops reconnecting after max attempts", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();

      // Exhaust all reconnect attempts
      for (let i = 0; i < 3; i++) {
        MockWebSocket.latest!.simulateClose(1006, "Abnormal");
        vi.advanceTimersByTime(60000); // advance well past any delay
      }

      // After max attempts, the last close should set to disconnected
      MockWebSocket.latest!.simulateClose(1006, "Abnormal");
      vi.advanceTimersByTime(60000);

      expect(service.getStatus()).toBe("disconnected");
    });

    it("does not reconnect on auth error (code 4001)", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();
      const instancesBefore = MockWebSocket.instances.length;

      MockWebSocket.latest!.simulateClose(4001, "Auth failed");

      vi.advanceTimersByTime(60000);
      expect(MockWebSocket.instances.length).toBe(instancesBefore);
      expect(service.getStatus()).toBe("disconnected");
    });

    it("does not reconnect on auth error (code 4003)", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();
      const instancesBefore = MockWebSocket.instances.length;

      MockWebSocket.latest!.simulateClose(4003, "Forbidden");

      vi.advanceTimersByTime(60000);
      expect(MockWebSocket.instances.length).toBe(instancesBefore);
      expect(service.getStatus()).toBe("disconnected");
    });

    it("emits error event on auth error close", () => {
      const errorListener = vi.fn();
      service.on("error", errorListener);

      service.connect();
      MockWebSocket.latest!.simulateOpen();
      MockWebSocket.latest!.simulateClose(4001, "Auth failed");

      expect(errorListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          payload: expect.objectContaining({
            code: "AUTH_ERROR",
            message: "Authentication failed",
          }),
        }),
      );
    });
  });

  describe("ping", () => {
    it("sends ping at configured interval when connected", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();

      vi.advanceTimersByTime(5000);
      expect(MockWebSocket.latest!.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "ping", payload: {} }),
      );
    });

    it("does not send ping when disconnected", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();
      service.disconnect();

      const ws = MockWebSocket.latest!;
      ws.send.mockClear();

      vi.advanceTimersByTime(15000);
      expect(ws.send).not.toHaveBeenCalled();
    });

    it("sends multiple pings over time", () => {
      service.connect();
      MockWebSocket.latest!.simulateOpen();

      vi.advanceTimersByTime(15000);
      const pingSends = MockWebSocket.latest!.send.mock.calls.filter(
        (call) => JSON.parse(call[0] as string).type === "ping",
      );
      expect(pingSends.length).toBe(3);
    });
  });

  describe("updateConfig", () => {
    it("merges partial config", () => {
      service.updateConfig({ token: "new-key" });
      service.connect();
      expect(MockWebSocket.latest!.url).toContain("new-key");
    });
  });
});
