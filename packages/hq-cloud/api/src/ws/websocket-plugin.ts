import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import type { WebSocket, RawData } from 'ws';
import websocket from '@fastify/websocket';
import { getConnectionRegistry } from './connection-registry.js';
import type {
  WebSocketMessage,
  ConnectedMessage,
  PongMessage,
  ErrorMessage,
  SubscribeMessage,
  SubscribedMessage,
  WorkerStatusMessage,
  WorkerQuestionMessage,
  QuestionAnsweredMessage,
  ChatMessageNotification,
} from './types.js';
import type { Worker } from '../workers/types.js';
import type { Question } from '../questions/types.js';
import type { ChatMessage } from '../chat/types.js';
import { onWorkerChange } from '../workers/worker-store.js';
import { onQuestionAnswered } from '../questions/question-store.js';

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
 * Extract deviceId from query string.
 */
function getDeviceId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const urlObj = new URL(url, 'http://localhost');
    return urlObj.searchParams.get('deviceId');
  } catch {
    return null;
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

/**
 * Broadcast a new worker question to all subscribed clients.
 */
export function broadcastWorkerQuestion(question: Question): void {
  const registry = getConnectionRegistry();
  const subscribers = registry.getSubscribersForWorker(question.workerId);

  if (subscribers.length === 0) return;

  const message: WorkerQuestionMessage = {
    type: 'worker_question',
    payload: {
      questionId: question.id,
      workerId: question.workerId,
      text: question.text,
      options: question.options.map((o) => ({
        id: o.id,
        text: o.text,
        metadata: o.metadata,
      })),
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

/**
 * Broadcast a question answered event to all subscribed clients.
 */
export function broadcastQuestionAnswered(question: Question): void {
  const registry = getConnectionRegistry();
  const subscribers = registry.getSubscribersForWorker(question.workerId);

  if (subscribers.length === 0) return;

  const message: QuestionAnsweredMessage = {
    type: 'question_answered',
    payload: {
      questionId: question.id,
      workerId: question.workerId,
      answer: question.answer ?? '',
      answeredAt: question.answeredAt?.toISOString() ?? new Date().toISOString(),
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

/**
 * Broadcast a new chat message to all subscribed clients.
 */
export function broadcastChatMessage(chatMessage: ChatMessage): void {
  const registry = getConnectionRegistry();
  const subscribers = registry.getSubscribersForWorker(chatMessage.workerId);

  if (subscribers.length === 0) return;

  const message: ChatMessageNotification = {
    type: 'chat_message',
    payload: {
      messageId: chatMessage.id,
      workerId: chatMessage.workerId,
      role: chatMessage.role,
      content: chatMessage.content,
      timestamp: chatMessage.timestamp.toISOString(),
      metadata: chatMessage.metadata,
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
  let unsubscribeQuestionAnswered: (() => void) | null = null;

  // Register the underlying websocket plugin
  void fastify.register(websocket);

  // Register callback for worker status changes
  unsubscribeWorkerChange = onWorkerChange((worker, changeType) => {
    broadcastWorkerStatus(worker, changeType);
  });

  // Register callback for question answered events
  // This routes the answer back to worker containers via WebSocket
  unsubscribeQuestionAnswered = onQuestionAnswered((question) => {
    broadcastQuestionAnswered(question);
    fastify.log.info(
      { questionId: question.id, workerId: question.workerId },
      'Question answered, broadcasted to subscribers'
    );
  });

  // Wait for websocket plugin to be ready
  fastify.after(() => {
    // WebSocket route at /ws
    fastify.get('/ws', { websocket: true }, (connection: SocketStream, request) => {
      const socket = connection.socket;
      const deviceId = getDeviceId(request.url);

      if (!deviceId) {
        const errorMsg: ErrorMessage = {
          type: 'error',
          payload: {
            code: 'MISSING_DEVICE_ID',
            message: 'deviceId query parameter is required',
          },
        };
        sendMessage(socket, errorMsg);
        socket.close(4000, 'Missing deviceId');
        return;
      }

      // Add to registry
      registry.add(deviceId, socket);
      fastify.log.info({ deviceId }, 'WebSocket client connected');

      // Send connected confirmation
      const connectedMsg: ConnectedMessage = {
        type: 'connected',
        payload: {
          deviceId,
          timestamp: Date.now(),
        },
      };
      sendMessage(socket, connectedMsg);

      // Handle incoming messages
      socket.on('message', (data: RawData) => {
        const message = parseMessage(data);
        if (!message) {
          fastify.log.warn({ deviceId }, 'Received invalid message format');
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
            registry.updatePing(deviceId);
            break;
          }
          case 'pong': {
            // Response to server ping
            registry.updatePing(deviceId);
            break;
          }
          case 'subscribe': {
            // Subscribe to worker status updates
            const subscribeMsg = message as SubscribeMessage;
            const workerIds = subscribeMsg.payload?.workerIds ?? [];
            registry.subscribe(deviceId, workerIds);

            const subscription = registry.getSubscription(deviceId);
            const subscribedMsg: SubscribedMessage = {
              type: 'subscribed',
              payload: {
                workerIds: subscription?.workerIds ?? [],
                all: subscription?.all ?? false,
              },
            };
            sendMessage(socket, subscribedMsg);
            fastify.log.info(
              { deviceId, workerIds, all: subscription?.all },
              'Client subscribed to worker updates'
            );
            break;
          }
          case 'unsubscribe': {
            // Unsubscribe from worker status updates
            const unsubscribeMsg = message as SubscribeMessage;
            const workerIds = unsubscribeMsg.payload?.workerIds ?? [];
            registry.unsubscribe(deviceId, workerIds);

            const subscription = registry.getSubscription(deviceId);
            const subscribedMsg: SubscribedMessage = {
              type: 'subscribed',
              payload: {
                workerIds: subscription?.workerIds ?? [],
                all: subscription?.all ?? false,
              },
            };
            sendMessage(socket, subscribedMsg);
            fastify.log.info(
              { deviceId, workerIds },
              'Client unsubscribed from worker updates'
            );
            break;
          }
          default:
            fastify.log.debug({ deviceId, type: message.type }, 'Received message');
        }
      });

      // Handle WebSocket native pong (response to ws.ping())
      socket.on('pong', () => {
        registry.updatePing(deviceId);
      });

      // Handle close
      socket.on('close', (code: number, reason: Buffer) => {
        fastify.log.info(
          { deviceId, code, reason: reason.toString() },
          'WebSocket client disconnected'
        );
        registry.remove(deviceId);
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        fastify.log.error({ deviceId, error: error.message }, 'WebSocket error');
        registry.remove(deviceId);
      });
    });

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

    // Unsubscribe from question answered events
    if (unsubscribeQuestionAnswered) {
      unsubscribeQuestionAnswered();
      unsubscribeQuestionAnswered = null;
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
