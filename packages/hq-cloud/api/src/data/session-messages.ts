/**
 * Session Messages Service
 *
 * Stores and retrieves messages for Claude Code sessions.
 * Messages are persisted as they flow through the WebSocket relay.
 */

import type { Collection, Db } from 'mongodb';
import { getDb } from '../db/mongo.js';

export type MessageType =
  | 'user'
  | 'assistant'
  | 'tool_use'
  | 'tool_result'
  | 'permission_request'
  | 'permission_response'
  | 'system'
  | 'error';

export interface SessionMessage {
  sessionId: string;
  sequence: number;
  timestamp: Date;
  type: MessageType;
  content: string;
  metadata: Record<string, unknown>;
}

export interface StoreMessageInput {
  sessionId: string;
  type: MessageType;
  content: string;
  metadata?: Record<string, unknown>;
}

const COLLECTION = 'hq_session_messages';

function getCollection(db?: Db): Collection<SessionMessage> {
  return (db ?? getDb()).collection<SessionMessage>(COLLECTION);
}

/**
 * Store a message, auto-assigning a sequence number.
 */
export async function storeMessage(input: StoreMessageInput): Promise<SessionMessage> {
  const col = getCollection();

  // Get next sequence number for this session
  // Retry loop to handle race conditions on sequence number
  for (let attempt = 0; attempt < 3; attempt++) {
    const lastMsg = await col
      .find({ sessionId: input.sessionId })
      .sort({ sequence: -1 })
      .limit(1)
      .toArray();

    const sequence = lastMsg.length > 0 && lastMsg[0] ? lastMsg[0].sequence + 1 : 1;

    const message: SessionMessage = {
      sessionId: input.sessionId,
      sequence,
      timestamp: new Date(),
      type: input.type,
      content: input.content,
      metadata: input.metadata ?? {},
    };

    try {
      await col.insertOne(message);
      return message;
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      if (code === 11000 && attempt < 2) {
        // Duplicate key — retry with fresh sequence
        continue;
      }
      throw err;
    }
  }

  // Fallback: should never reach here due to throw in loop
  throw new Error('Failed to store message after retries');
}

/**
 * Get messages for a session, paginated.
 */
export async function getSessionMessages(
  sessionId: string,
  options: { limit?: number; before?: number } = {}
): Promise<SessionMessage[]> {
  const col = getCollection();
  const { limit = 100, before } = options;

  const filter: Record<string, unknown> = { sessionId };
  if (before !== undefined) {
    filter.sequence = { $lt: before };
  }

  return col
    .find(filter)
    .sort({ sequence: 1 })
    .limit(limit)
    .toArray();
}

/**
 * Get the latest N messages for a session (for card preview).
 */
export async function getLatestMessages(
  sessionId: string,
  limit = 5
): Promise<SessionMessage[]> {
  const col = getCollection();

  const messages = await col
    .find({ sessionId })
    .sort({ sequence: -1 })
    .limit(limit)
    .toArray();

  // Return in chronological order
  return messages.reverse();
}

/**
 * Count messages in a session.
 */
export async function countSessionMessages(sessionId: string): Promise<number> {
  const col = getCollection();
  return col.countDocuments({ sessionId });
}

/**
 * Delete all messages for a session.
 */
export async function deleteSessionMessages(sessionId: string): Promise<number> {
  const col = getCollection();
  const result = await col.deleteMany({ sessionId });
  return result.deletedCount;
}

/**
 * Ensure indexes exist on the collection.
 */
export async function ensureSessionMessageIndexes(db?: Db): Promise<void> {
  const col = getCollection(db);
  await col.createIndex({ sessionId: 1, sequence: 1 }, { unique: true });
  await col.createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 day TTL
  );
}
