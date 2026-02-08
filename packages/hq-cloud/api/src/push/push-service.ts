import type { Question } from '../questions/types.js';
import type { Worker } from '../workers/types.js';
import type { PushPayload, QuestionNotificationPayload } from './types.js';
import { getDeviceTokenStore } from './device-store.js';
import { getPushProvider } from './push-provider.js';
import { getConnectionRegistry } from '../ws/connection-registry.js';
import { getWorkerStore } from '../workers/worker-store.js';

/**
 * Maximum length for question preview in push notification
 */
const MAX_QUESTION_PREVIEW_LENGTH = 100;

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Build push payload for a worker question
 */
export function buildQuestionPushPayload(
  question: Question,
  worker: Worker
): PushPayload {
  const questionPreview = truncate(question.text, MAX_QUESTION_PREVIEW_LENGTH);
  const hasOptions = question.options.length > 0;

  const data: QuestionNotificationPayload = {
    questionId: question.id,
    workerId: question.workerId,
    workerName: worker.name,
    questionPreview,
    hasOptions,
  };

  return {
    title: `${worker.name} needs input`,
    body: questionPreview,
    data: data as unknown as Record<string, unknown>,
    sound: 'default',
  };
}

/**
 * Check if a device has an active WebSocket connection
 */
export function hasActiveWebSocketConnection(deviceId: string): boolean {
  const registry = getConnectionRegistry();
  const connection = registry.get(deviceId);

  if (!connection) {
    return false;
  }

  // Check if socket is actually open
  return connection.socket.readyState === connection.socket.OPEN;
}

/**
 * Get all device IDs subscribed to a worker
 */
export function getSubscribedDeviceIds(workerId: string): string[] {
  const registry = getConnectionRegistry();
  const subscribers = registry.getSubscribersForWorker(workerId);
  return subscribers.map((s) => s.deviceId);
}

/**
 * Send push notification for a new worker question.
 * Only sends to devices that:
 * 1. Have registered push tokens
 * 2. Are subscribed to the worker (or all workers)
 * 3. Do NOT have an active WebSocket connection
 *
 * @param question The question that was posted
 * @returns Number of push notifications sent
 */
export async function sendQuestionPushNotification(
  question: Question
): Promise<{ sent: number; skipped: number; failed: number }> {
  const workerStore = getWorkerStore();
  const deviceTokenStore = getDeviceTokenStore();
  const pushProvider = getPushProvider();

  // Get worker info for the notification
  const worker = workerStore.get(question.workerId);
  if (!worker) {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  // Build the push payload
  const payload = buildQuestionPushPayload(question, worker);

  // Get all devices subscribed to this worker
  const subscribedDeviceIds = getSubscribedDeviceIds(question.workerId);

  // Also get devices subscribed to all workers
  const registry = getConnectionRegistry();
  const allConnections = registry.getAll();
  const allSubscribedDeviceIds = new Set([
    ...subscribedDeviceIds,
    ...allConnections
      .filter((c) => c.subscribedToAll)
      .map((c) => c.deviceId),
  ]);

  // Filter to devices that:
  // 1. Have push tokens
  // 2. Don't have active WebSocket
  const targetsForPush: Array<{
    deviceId: string;
    token: string;
    platform: 'ios' | 'android' | 'web';
  }> = [];

  let skipped = 0;

  for (const deviceId of allSubscribedDeviceIds) {
    // Check for active WebSocket
    if (hasActiveWebSocketConnection(deviceId)) {
      skipped++;
      continue;
    }

    // Check for push token
    const deviceToken = deviceTokenStore.getActive(deviceId);
    if (!deviceToken) {
      skipped++;
      continue;
    }

    targetsForPush.push({
      deviceId,
      token: deviceToken.token,
      platform: deviceToken.platform,
    });
  }

  // Send push notifications
  if (targetsForPush.length === 0) {
    return { sent: 0, skipped, failed: 0 };
  }

  const results = await pushProvider.sendBatch(targetsForPush, payload);

  // Update last push timestamps for successful sends
  let sent = 0;
  let failed = 0;
  for (const result of results) {
    if (result.success) {
      deviceTokenStore.updateLastPush(result.deviceId);
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, skipped, failed };
}

/**
 * Callback type for push notification events
 */
export type PushNotificationCallback = (stats: {
  questionId: string;
  sent: number;
  skipped: number;
  failed: number;
}) => void;

// Array of push notification callbacks
const pushCallbacks: PushNotificationCallback[] = [];

/**
 * Register a callback for push notification events
 */
export function onPushNotification(callback: PushNotificationCallback): () => void {
  pushCallbacks.push(callback);
  return () => {
    const index = pushCallbacks.indexOf(callback);
    if (index > -1) {
      pushCallbacks.splice(index, 1);
    }
  };
}

/**
 * Notify all callbacks about a push notification
 */
export function notifyPushSent(stats: {
  questionId: string;
  sent: number;
  skipped: number;
  failed: number;
}): void {
  for (const callback of pushCallbacks) {
    try {
      callback(stats);
    } catch {
      // Ignore callback errors
    }
  }
}

/**
 * Reset push callbacks (for testing)
 */
export function resetPushCallbacks(): void {
  pushCallbacks.length = 0;
}
