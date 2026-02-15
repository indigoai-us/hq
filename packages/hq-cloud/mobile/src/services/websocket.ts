/**
 * WebSocket service for HQ Cloud Mobile.
 * Manages WebSocket connection lifecycle with automatic reconnection,
 * event dispatching, and ping/pong keep-alive.
 */
import type {
  ConnectionStatus,
  ServerEvent,
  ServerEventType,
  ClientEvent,
  EventListener,
  WebSocketConfig,
} from "../types/websocket";

const DEFAULT_RECONNECT_DELAY = 1000;
const DEFAULT_MAX_RECONNECT_DELAY = 30000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = Infinity;
const DEFAULT_PING_INTERVAL = 30000;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private status: ConnectionStatus = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<string, Set<EventListener>>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private intentionalClose = false;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectDelay: DEFAULT_RECONNECT_DELAY,
      maxReconnectDelay: DEFAULT_MAX_RECONNECT_DELAY,
      maxReconnectAttempts: DEFAULT_MAX_RECONNECT_ATTEMPTS,
      pingInterval: DEFAULT_PING_INTERVAL,
      ...config,
    };
  }

  /** Current connection status */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Connect to the WebSocket server */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.intentionalClose = false;
    this.setStatus("connecting");

    try {
      // Build WebSocket URL with auth token as query parameter
      const wsUrl = `${this.config.url}/ws?token=${encodeURIComponent(this.config.apiKey)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = this.handleOpen;
      this.ws.onclose = this.handleClose;
      this.ws.onerror = this.handleError;
      this.ws.onmessage = this.handleMessage;
    } catch (_error: unknown) {
      this.setStatus("disconnected");
      this.scheduleReconnect();
    }
  }

  /** Disconnect from the WebSocket server */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearTimers();
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.setStatus("disconnected");
  }

  /** Send a typed event to the server */
  send<T>(event: ClientEvent<T>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.ws.send(JSON.stringify(event));
    } catch (_error: unknown) {
      // Send failed - connection might be closing
    }
  }

  /** Subscribe to a specific server event type */
  on<T = unknown>(eventType: ServerEventType, listener: EventListener<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    const typedListener = listener as EventListener;
    this.listeners.get(eventType)!.add(typedListener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(typedListener);
    };
  }

  /** Subscribe to connection status changes */
  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Remove all event listeners */
  removeAllListeners(): void {
    this.listeners.clear();
    this.statusListeners.clear();
  }

  /** Update the configuration (e.g., after re-auth). Requires reconnect. */
  updateConfig(partial: Partial<WebSocketConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  // --- Private handlers ---

  private handleOpen = (): void => {
    this.reconnectAttempts = 0;
    this.setStatus("connected");
    this.startPing();
  };

  private handleClose = (event: WebSocketCloseEvent): void => {
    this.clearTimers();
    this.ws = null;

    if (this.intentionalClose) {
      this.setStatus("disconnected");
      return;
    }

    // Unexpected close - attempt reconnection
    const isAuthError = event.code === 4001 || event.code === 4003;
    if (isAuthError) {
      // Don't reconnect on auth errors
      this.setStatus("disconnected");
      this.emit("error", {
        type: "error" as ServerEventType,
        payload: { code: "AUTH_ERROR", message: "Authentication failed" },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.scheduleReconnect();
  };

  private handleError = (): void => {
    // Error events are followed by close events, so reconnection is handled in handleClose
  };

  private handleMessage = (event: WebSocketMessageEvent): void => {
    try {
      const data = JSON.parse(event.data as string) as ServerEvent;
      this.emit(data.type, data);
    } catch (_error: unknown) {
      // Malformed message - ignore
    }
  };

  // --- Internal helpers ---

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (_error: unknown) {
        // Listener error - don't break iteration
      }
    }
  }

  private emit(eventType: string, event: ServerEvent): void {
    const eventListeners = this.listeners.get(eventType);
    if (!eventListeners) return;

    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch (_error: unknown) {
        // Listener error - don't break iteration
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("reconnecting");

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay,
    );
    const jitter = baseDelay * 0.2 * Math.random();
    const delay = baseDelay + jitter;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping", payload: {} });
    }, this.config.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// Type for React Native WebSocket close events
interface WebSocketCloseEvent {
  code: number;
  reason: string;
}

// Type for React Native WebSocket message events
interface WebSocketMessageEvent {
  data: string | ArrayBuffer | Blob;
}
