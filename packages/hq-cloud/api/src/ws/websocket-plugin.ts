import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import type { WebSocket, RawData } from 'ws';
import websocket from '@fastify/websocket';
import { getConnectionRegistry } from './connection-registry.js';
import { verifyClerkToken } from '../auth/clerk.js';
import {
  handleClaudeCodeConnection,
  addBrowserToSession,
  handleBrowserMessage,
  setRelayLogger,
} from './session-relay.js';
import { validateSessionAccessToken } from '../data/sessions.js';
import type {
  WebSocketMessage,
  ConnectedMessage,
  PongMessage,
  ErrorMessage,
  SubscribeMessage,
  SubscribedMessage,
  WorkerStatusMessage,
} from './types.js';
import type { Worker } from '../workers/types.js';
import { onWorkerChange } from '../workers/worker-store.js';

interface WebSocketPluginOptions {
  /** Interval in ms between heartbeat checks (default: 30000) */
  heartbeatInterval?: number;
  /** Timeout in ms for ping response before marking dead (default: 10000) */
  pingTimeout?: number;
}

/**
 * Parse incoming WebSocket message safely.
 */
function parseMessage(data: RawData): WebSocketMessage | null {
  try {
    const str = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    const parsed = JSON.parse(str) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'type' in parsed &&
      typeof (parsed as WebSocketMessage).type === 'string'
    ) {
      return parsed as WebSocketMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Send a JSON message to a WebSocket client.
 */
function sendMessage(socket: WebSocket, message: WebSocketMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/**
 * Extract query params from WebSocket URL.
 */
function getQueryParams(url: string | undefined): { deviceId: string | null; token: string | null } {
  if (!url) return { deviceId: null, token: null };
  try {
    const urlObj = new URL(url, 'http://localhost');
    return {
      deviceId: urlObj.searchParams.get('deviceId'),
      token: urlObj.searchParams.get('token'),
    };
  } catch {
    return { deviceId: null, token: null };
  }
}

/**
 * Broadcast a worker status update to all subscribed clients.
 */
export function broadcastWorkerStatus(
  worker: Worker,
  changeType: 'create' | 'update' | 'delete'
): void {
  const registry = getConnectionRegistry();
  const subscribers = registry.getSubscribersForWorker(worker.id);

  if (subscribers.length === 0) return;

  const message: WorkerStatusMessage = {
    type: 'worker_status',
    payload: {
      workerId: worker.id,
      changeType,
      status: worker.status,
      currentTask: worker.currentTask,
      progress: worker.progress,
      lastActivity: worker.lastActivity.toISOString(),
      name: worker.name,
      timestamp: Date.now(),
    },
  };

  const messageStr = JSON.stringify(message);

  for (const subscriber of subscribers) {
    if (subscriber.socket.readyState === subscriber.socket.OPEN) {
      subscriber.socket.send(messageStr);
    }
  }
}

export const websocketPlugin: FastifyPluginCallback<WebSocketPluginOptions> = (
  fastify: FastifyInstance,
  opts,
  done
): void => {
  const heartbeatInterval = opts.heartbeatInterval ?? 30000;
  const pingTimeout = opts.pingTimeout ?? 10000;
  const registry = getConnectionRegistry();

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribeWorkerChange: (() => void) | null = null;

  // Register the underlying websocket plugin
  void fastify.register(websocket);

  // Register callback for worker status changes
  unsubscribeWorkerChange = onWorkerChange((worker, changeType) => {
    broadcastWorkerStatus(worker, changeType);
  });

  // Wait for websocket plugin to be ready
  fastify.after(() => {
    // WebSocket route at /ws
    fastify.get('/ws', { websocket: true }, async (connection: SocketStream, request) => {
      const socket = connection.socket;
      const { deviceId, token } = getQueryParams(request.url);

      // Verify JWT token on connect
      if (!token) {
        const errorMsg: ErrorMessage = {
          type: 'error',
          payload: {
            code: 'AUTH_REQUIRED',
            message: 'token query parameter is required',
          },
        };
        sendMessage(socket, errorMsg);
        socket.close(4001, 'Authentication required');
        return;
      }

      let userId: string;
      try {
        const payload = await verifyClerkToken(token);
        userId = payload.userId;
      } catch {
        const errorMsg: ErrorMessage = {
          type: 'error',
          payload: {
            code: 'AUTH_FAILED',
            message: 'Invalid or expired token',
          },
        };
        sendMessage(socket, errorMsg);
        socket.close(4001, 'Authentication failed');
        return;
      }

      // Use deviceId if provided, otherwise use userId as connection key
      const connectionId = deviceId ?? userId;

      // Add to registry
      registry.add(connectionId, socket);
      fastify.log.debug({ connectionId, userId }, 'WebSocket client connected');

      // Send connected confirmation
      const connectedMsg: ConnectedMessage = {
        type: 'connected',
        payload: {
          deviceId: connectionId,
          timestamp: Date.now(),
        },
      };
      sendMessage(socket, connectedMsg);

      // Handle incoming messages
      socket.on('message', (data: RawData) => {
        const message = parseMessage(data);
        if (!message) {
          fastify.log.warn({ connectionId }, 'Received invalid message format');
          return;
        }

        switch (message.type) {
          case 'ping': {
            // Client-initiated ping, respond with pong
            const pongMsg: PongMessage = {
              type: 'pong',
              timestamp: Date.now(),
            };
            sendMessage(socket, pongMsg);
            registry.updatePing(connectionId);
            break;
          }
          case 'pong': {
            // Response to server ping
            registry.updatePing(connectionId);
            break;
          }
          case 'subscribe': {
            // Subscribe to worker status updates
            const subscribeMsg = message as SubscribeMessage;
            const workerIds = subscribeMsg.payload?.workerIds ?? [];
            registry.subscribe(connectionId, workerIds);

            const subscription = registry.getSubscription(connectionId);
            const subscribedMsg: SubscribedMessage = {
              type: 'subscribed',
              payload: {
                workerIds: subscription?.workerIds ?? [],
                all: subscription?.all ?? false,
              },
            };
            sendMessage(socket, subscribedMsg);
            fastify.log.debug(
              { connectionId, workerIds, all: subscription?.all },
              'Client subscribed to worker updates'
            );
            break;
          }
          case 'unsubscribe': {
            // Unsubscribe from worker status updates
            const unsubscribeMsg = message as SubscribeMessage;
            const workerIds = unsubscribeMsg.payload?.workerIds ?? [];
            registry.unsubscribe(connectionId, workerIds);

            const subscription = registry.getSubscription(connectionId);
            const subscribedMsg: SubscribedMessage = {
              type: 'subscribed',
              payload: {
                workerIds: subscription?.workerIds ?? [],
                all: subscription?.all ?? false,
              },
            };
            sendMessage(socket, subscribedMsg);
            fastify.log.debug(
              { connectionId, workerIds },
              'Client unsubscribed from worker updates'
            );
            break;
          }
          case 'session_subscribe': {
            // Browser subscribing to a session's real-time updates
            const payload = (message as { payload?: { sessionId?: string; lastMessageId?: string } }).payload;
            const sessionId = payload?.sessionId;
            const lastMessageId = payload?.lastMessageId;
            if (sessionId) {
              setRelayLogger(fastify.log);
              const added = addBrowserToSession(sessionId, socket, lastMessageId);
              if (!added) {
                sendMessage(socket, {
                  type: 'error',
                  payload: { code: 'SESSION_NOT_FOUND', message: `Session ${sessionId} not found` },
                } as ErrorMessage);
              }
            }
            break;
          }
          case 'session_user_message':
          case 'session_permission_response':
          case 'session_interrupt':
          case 'session_set_permission_mode':
          case 'session_set_model':
          case 'session_update_env': {
            // Forward session-related messages to the relay
            // Pass userId for session ownership validation
            const sessionId = (message as { sessionId?: string }).sessionId;
            if (sessionId) {
              setRelayLogger(fastify.log);
              void handleBrowserMessage(sessionId, socket, data, userId);
            }
            break;
          }
          default:
            fastify.log.debug({ connectionId, type: message.type }, 'Received message');
        }
      });

      // Handle WebSocket native pong (response to ws.ping())
      socket.on('pong', () => {
        registry.updatePing(connectionId);
      });

      // Handle close
      socket.on('close', (code: number, reason: Buffer) => {
        fastify.log.debug(
          { connectionId, code, reason: reason.toString() },
          'WebSocket client disconnected'
        );
        registry.remove(connectionId);
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        fastify.log.error({ connectionId, error: error.message }, 'WebSocket error');
        registry.remove(connectionId);
      });
    });

    // --- Session Relay: Claude Code container connects here ---
    // Container starts with: claude --sdk-url ws://api-host/ws/relay/{sessionId}
    // Container authenticates via Authorization: Bearer <session-access-token>
    fastify.get('/ws/relay/:sessionId', { websocket: true }, async (connection: SocketStream, request) => {
      const socket = connection.socket;
      const sessionId = (request.params as { sessionId: string }).sessionId;

      if (!sessionId) {
        socket.close(4000, 'sessionId required');
        return;
      }

      // Validate session access token from Authorization header
      const authHeader = request.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

      if (!token) {
        fastify.log.warn({ sessionId }, 'Container connection rejected: missing access token');
        socket.close(4001, 'Authorization required');
        return;
      }

      // Verify token against stored session record
      const session = await validateSessionAccessToken(sessionId, token);
      if (!session) {
        fastify.log.warn({ sessionId }, 'Container connection rejected: invalid access token');
        socket.close(4003, 'Invalid access token');
        return;
      }

      setRelayLogger(fastify.log);
      handleClaudeCodeConnection(sessionId, socket);
    });

    // --- Session Relay: Browser subscribes to session via existing /ws ---
    // Browser messages of type 'session_subscribe' and 'session_*' are handled
    // in the main /ws message handler above. We add session-specific message
    // types to the switch statement by extending the message handler.
    // (Already handled via the existing socket.on('message') handler's default case)

    // Start heartbeat interval
    heartbeatTimer = setInterval(() => {
      const connections = registry.getAll();
      const now = Date.now();

      for (const connection of connections) {
        const timeSinceLastPing = now - connection.lastPing.getTime();

        if (!connection.isAlive && timeSinceLastPing > pingTimeout) {
          // Connection didn't respond to ping, terminate it
          fastify.log.warn(
            { deviceId: connection.deviceId },
            'Terminating unresponsive connection'
          );
          connection.socket.terminate();
          registry.remove(connection.deviceId);
          continue;
        }

        // Mark as dead and send ping
        registry.markDead(connection.deviceId);

        // Use WebSocket-level ping (not JSON message)
        if (connection.socket.readyState === connection.socket.OPEN) {
          connection.socket.ping();
        }
      }
    }, heartbeatInterval);
  });

  // Cleanup on server close
  fastify.addHook('onClose', (_instance, closeCallback) => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    // Unsubscribe from worker changes
    if (unsubscribeWorkerChange) {
      unsubscribeWorkerChange();
      unsubscribeWorkerChange = null;
    }

    // Close all connections gracefully
    const connections = registry.getAll();
    for (const connection of connections) {
      try {
        connection.socket.close(1001, 'Server shutting down');
      } catch {
        // Socket may already be closed
      }
    }

    closeCallback();
  });

  done();
};

export { getConnectionRegistry };
