/**
 * Tests for WebSocketService.
 * Verifies connection lifecycle, reconnection, event dispatch, and cleanup.
 */
import { WebSocketService } from "../../src/services/websocket";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;

  url: string;
  sentMessages: string[] = [];
  closeCalled = false;
  closeCode?: number;
  closeReason?: string;

  constructor(url: string) {
    this.url = url;
    // Schedule onopen - we use advanceTimersByTime(1) to trigger it
    setTimeout(() => {
      if (this.onopen) {
        this.readyState = MockWebSocket.OPEN;
        this.onopen({});
      }
    }, 1);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalled = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  simulateClose(code = 1000, reason = ""): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror({ message: "Connection error" });
    }
  }
}

// Store reference to last created MockWebSocket
let lastMockWs: MockWebSocket | null = null;

// Install mock - use a factory function to track instances
function trackInstance(instance: MockWebSocket): void {
  lastMockWs = instance;
}

beforeAll(() => {
  (global as unknown as Record<string, unknown>).WebSocket = class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      trackInstance(this);
    }

    static override CONNECTING = 0;
    static override OPEN = 1;
    static override CLOSING = 2;
    static override CLOSED = 3;
  };
});

beforeEach(() => {
  jest.useFakeTimers();
  lastMockWs = null;
});

afterEach(() => {
  jest.useRealTimers();
});

const DEFAULT_CONFIG = {
  url: "ws://localhost:3000",
  apiKey: "test-api-key",
  reconnectDelay: 100,
  maxReconnectDelay: 1000,
  pingInterval: 60000, // Large enough to not interfere with tests
};

/** Helper: connect and trigger onopen without running all timers */
function connectAndOpen(service: WebSocketService): void {
  service.connect();
  // Advance just enough to trigger the setTimeout(onopen, 1)
  jest.advanceTimersByTime(2);
}

describe("WebSocketService", () => {
  describe("connect", () => {
    it("should create a WebSocket connection with auth token", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      service.connect();

      expect(lastMockWs).toBeTruthy();
      expect(lastMockWs!.url).toContain("ws://localhost:3000/ws?token=test-api-key");
    });

    it("should set status to connecting initially", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      const statusChanges: string[] = [];
      service.onStatusChange((status) => statusChanges.push(status));

      service.connect();

      expect(statusChanges).toContain("connecting");
    });

    it("should set status to connected on open", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      const statusChanges: string[] = [];
      service.onStatusChange((status) => statusChanges.push(status));

      connectAndOpen(service);

      expect(statusChanges).toContain("connected");
      expect(service.getStatus()).toBe("connected");
    });

    it("should not create duplicate connections", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      connectAndOpen(service);

      const firstWs = lastMockWs;
      service.connect(); // Should be a no-op

      expect(lastMockWs).toBe(firstWs);
    });
  });

  describe("disconnect", () => {
    it("should close the WebSocket connection", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      connectAndOpen(service);

      service.disconnect();

      expect(lastMockWs!.closeCalled).toBe(true);
      expect(service.getStatus()).toBe("disconnected");
    });

    it("should not attempt reconnection after intentional disconnect", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      connectAndOpen(service);

      service.disconnect();

      // Fast-forward past any reconnection timers
      jest.advanceTimersByTime(60000);

      expect(service.getStatus()).toBe("disconnected");
    });
  });

  describe("reconnection", () => {
    it("should attempt reconnection on unexpected close", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      connectAndOpen(service);

      const firstWs = lastMockWs!;
      firstWs.simulateClose(1006, "Abnormal closure");

      // Should schedule reconnection
      expect(service.getStatus()).toBe("reconnecting");

      // Advance past reconnect delay
      jest.advanceTimersByTime(200);

      // New WebSocket should be created
      expect(lastMockWs).not.toBe(firstWs);
    });

    it("should not reconnect on auth errors (4001, 4003)", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      connectAndOpen(service);

      lastMockWs!.simulateClose(4001, "Auth failed");

      expect(service.getStatus()).toBe("disconnected");

      // Advance way past any reconnect timer
      jest.advanceTimersByTime(60000);
      expect(service.getStatus()).toBe("disconnected");
    });

    it("should use exponential backoff", () => {
      const service = new WebSocketService({
        ...DEFAULT_CONFIG,
        reconnectDelay: 100,
        maxReconnectDelay: 10000,
      });
      connectAndOpen(service);

      // First disconnect
      lastMockWs!.simulateClose(1006);
      expect(service.getStatus()).toBe("reconnecting");

      // First reconnect after ~100ms (base delay) + trigger onopen
      jest.advanceTimersByTime(150);
      jest.advanceTimersByTime(2); // trigger onopen

      // Second disconnect
      lastMockWs!.simulateClose(1006);
      expect(service.getStatus()).toBe("reconnecting");

      // Should need more time for second reconnect (~200ms base)
      // Due to jitter, we advance enough to cover the max possible delay
      jest.advanceTimersByTime(300);
      expect(service.getStatus()).not.toBe("reconnecting");
    });
  });

  describe("event handling", () => {
    it("should dispatch events to listeners", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      connectAndOpen(service);

      const received: unknown[] = [];
      service.on("agent:updated", (event) => received.push(event));

      lastMockWs!.simulateMessage({
        type: "agent:updated",
        payload: { agentId: "a1", changes: { status: "running" } },
        timestamp: "2026-02-08T12:00:00Z",
      });

      expect(received).toHaveLength(1);
      expect((received[0] as { payload: { agentId: string } }).payload.agentId).toBe("a1");
    });

    it("should not dispatch to wrong event type listeners", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      connectAndOpen(service);

      const received: unknown[] = [];
      service.on("agent:created", (event) => received.push(event));

      lastMockWs!.simulateMessage({
        type: "agent:updated",
        payload: {},
        timestamp: "2026-02-08T12:00:00Z",
      });

      expect(received).toHaveLength(0);
    });

    it("should support unsubscribing from events", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      connectAndOpen(service);

      const received: unknown[] = [];
      const unsubscribe = service.on("agent:updated", (event) => received.push(event));

      // Send first message
      lastMockWs!.simulateMessage({
        type: "agent:updated",
        payload: {},
        timestamp: "2026-02-08T12:00:00Z",
      });

      expect(received).toHaveLength(1);

      // Unsubscribe
      unsubscribe();

      // Send second message
      lastMockWs!.simulateMessage({
        type: "agent:updated",
        payload: {},
        timestamp: "2026-02-08T12:00:00Z",
      });

      expect(received).toHaveLength(1); // Still 1
    });

    it("should handle malformed messages gracefully", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      connectAndOpen(service);

      // Should not throw
      expect(() => {
        if (lastMockWs!.onmessage) {
          lastMockWs!.onmessage({ data: "not json" });
        }
      }).not.toThrow();
    });
  });

  describe("ping/pong", () => {
    it("should send ping messages at configured interval", () => {
      const service = new WebSocketService({
        ...DEFAULT_CONFIG,
        pingInterval: 1000,
      });
      connectAndOpen(service);

      // Fast forward past ping interval
      jest.advanceTimersByTime(1100);

      const pings = lastMockWs!.sentMessages.filter((msg) => {
        const parsed = JSON.parse(msg);
        return parsed.type === "ping";
      });

      expect(pings.length).toBeGreaterThanOrEqual(1);
    });

    it("should stop pinging after disconnect", () => {
      const service = new WebSocketService({
        ...DEFAULT_CONFIG,
        pingInterval: 1000,
      });
      connectAndOpen(service);

      const ws = lastMockWs!;
      service.disconnect();

      const msgCountAtDisconnect = ws.sentMessages.length;

      // Advance past ping interval
      jest.advanceTimersByTime(5000);

      // No new messages should be sent
      expect(ws.sentMessages.length).toBe(msgCountAtDisconnect);
    });
  });

  describe("send", () => {
    it("should send JSON-encoded events when connected", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      connectAndOpen(service);

      service.send({
        type: "subscribe",
        payload: { channels: ["agents"] },
      });

      // Filter out any ping messages
      const nonPingMessages = lastMockWs!.sentMessages.filter((msg) => {
        const parsed = JSON.parse(msg);
        return parsed.type !== "ping";
      });

      expect(nonPingMessages).toHaveLength(1);
      const parsed = JSON.parse(nonPingMessages[0]);
      expect(parsed.type).toBe("subscribe");
      expect(parsed.payload.channels).toEqual(["agents"]);
    });

    it("should silently drop messages when not connected", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);

      // Not connected - should not throw
      expect(() => {
        service.send({ type: "ping", payload: {} });
      }).not.toThrow();
    });
  });

  describe("status listeners", () => {
    it("should notify all status listeners on change", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      const listener1: string[] = [];
      const listener2: string[] = [];

      service.onStatusChange((s) => listener1.push(s));
      service.onStatusChange((s) => listener2.push(s));

      service.connect();

      expect(listener1).toContain("connecting");
      expect(listener2).toContain("connecting");
    });

    it("should support unsubscribing from status changes", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      const statuses: string[] = [];

      const unsubscribe = service.onStatusChange((s) => statuses.push(s));
      service.connect();
      expect(statuses).toContain("connecting");

      unsubscribe();
      jest.advanceTimersByTime(2); // trigger onopen -> "connected" status change

      // Should not receive "connected" after unsubscribing
      expect(statuses).not.toContain("connected");
    });
  });

  describe("removeAllListeners", () => {
    it("should remove all event and status listeners", () => {
      const service = new WebSocketService(DEFAULT_CONFIG);
      const events: unknown[] = [];
      const statuses: string[] = [];

      service.on("agent:updated", (e) => events.push(e));
      service.onStatusChange((s) => statuses.push(s));

      service.removeAllListeners();

      connectAndOpen(service);

      lastMockWs!.simulateMessage({
        type: "agent:updated",
        payload: {},
        timestamp: "2026-02-08T12:00:00Z",
      });

      expect(events).toHaveLength(0);
      expect(statuses).toHaveLength(0);
    });
  });
});
