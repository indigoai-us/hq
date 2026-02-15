import type {
  ConnectionStatus,
  ServerEvent,
  ServerEventType,
  ClientEvent,
  EventListener,
  WebSocketConfig,
} from "@/types/websocket";

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

  getStatus(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.intentionalClose = false;
    this.setStatus("connecting");

    try {
      const wsUrl = `${this.config.url}/ws?token=${encodeURIComponent(this.config.token)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = this.handleOpen;
      this.ws.onclose = this.handleClose;
      this.ws.onerror = this.handleError;
      this.ws.onmessage = this.handleMessage;
    } catch {
      this.setStatus("disconnected");
      this.scheduleReconnect();
    }
  }

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

  send<T>(event: ClientEvent<T>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.ws.send(JSON.stringify(event));
    } catch {
      // Send failed - connection might be closing
    }
  }

  on<T = unknown>(eventType: ServerEventType, listener: EventListener<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    const typedListener = listener as EventListener;
    this.listeners.get(eventType)!.add(typedListener);

    return () => {
      this.listeners.get(eventType)?.delete(typedListener);
    };
  }

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  removeAllListeners(): void {
    this.listeners.clear();
    this.statusListeners.clear();
  }

  updateConfig(partial: Partial<WebSocketConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  private handleOpen = (): void => {
    this.reconnectAttempts = 0;
    this.setStatus("connected");
    this.startPing();
  };

  private handleClose = (event: CloseEvent): void => {
    this.clearTimers();
    this.ws = null;

    if (this.intentionalClose) {
      this.setStatus("disconnected");
      return;
    }

    const isAuthError = event.code === 4001 || event.code === 4003;
    if (isAuthError) {
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
    // Error events are followed by close events
  };

  private handleMessage = (event: MessageEvent): void => {
    try {
      const data = JSON.parse(event.data as string) as ServerEvent;
      this.emit(data.type, data);
    } catch {
      // Malformed message - ignore
    }
  };

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // Listener error
      }
    }
  }

  private emit(eventType: string, event: ServerEvent): void {
    const eventListeners = this.listeners.get(eventType);
    if (!eventListeners) return;

    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch {
        // Listener error
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("reconnecting");

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
