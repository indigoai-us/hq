/**
 * Session Service
 *
 * Manages Claude Code session lifecycle in MongoDB.
 * Each session represents a running Claude Code instance in a container.
 */

import type { Collection, Db } from 'mongodb';
import { getDb } from '../db/mongo.js';

export type SessionStatus = 'starting' | 'active' | 'syncing' | 'stopping' | 'stopped' | 'errored';

export interface SessionCapabilities {
  cwd: string;
  model: string;
  tools: Array<{ name: string; type?: string }>;
  mcpServers: Array<{ name: string }>;
  permissionMode: string;
  claudeCodeVersion: string;
}

export interface SessionResultStats {
  duration: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  resultType: string;
}

export interface Session {
  sessionId: string;
  userId: string;
  status: SessionStatus;
  ecsTaskArn: string | null;
  accessToken: string | null;
  initialPrompt: string | null;
  workerContext: string | null;
  messageCount: number;
  capabilities: SessionCapabilities | null;
  resultStats: SessionResultStats | null;
  createdAt: Date;
  lastActivityAt: Date;
  stoppedAt: Date | null;
  error: string | null;
}

export interface CreateSessionInput {
  sessionId: string;
  userId: string;
  accessToken?: string;
  initialPrompt?: string;
  workerContext?: string;
}

const COLLECTION = 'hq_sessions';
const MAX_CONCURRENT_SESSIONS = 5;

function getCollection(db?: Db): Collection<Session> {
  return (db ?? getDb()).collection<Session>(COLLECTION);
}

/**
 * Create a new session.
 */
export async function createSession(input: CreateSessionInput): Promise<Session> {
  const col = getCollection();
  const now = new Date();

  const session: Session = {
    sessionId: input.sessionId,
    userId: input.userId,
    status: 'starting',
    ecsTaskArn: null,
    accessToken: input.accessToken ?? null,
    initialPrompt: input.initialPrompt ?? null,
    workerContext: input.workerContext ?? null,
    messageCount: 0,
    capabilities: null,
    resultStats: null,
    createdAt: now,
    lastActivityAt: now,
    stoppedAt: null,
    error: null,
  };

  await col.insertOne(session);
  return session;
}

/**
 * Get a session by ID.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const col = getCollection();
  return col.findOne({ sessionId });
}

/**
 * Validate a session access token.
 * Returns the session if the token matches, null otherwise.
 */
export async function validateSessionAccessToken(
  sessionId: string,
  accessToken: string
): Promise<Session | null> {
  const col = getCollection();
  return col.findOne({ sessionId, accessToken });
}

/**
 * List all sessions for a user, ordered by most recent first.
 */
export async function listUserSessions(
  userId: string,
  options: { limit?: number; includeStoped?: boolean } = {}
): Promise<Session[]> {
  const col = getCollection();
  const { limit = 50, includeStoped = true } = options;

  const filter: Record<string, unknown> = { userId };
  if (!includeStoped) {
    filter.status = { $nin: ['stopped'] };
  }

  return col
    .find(filter)
    .sort({ lastActivityAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Count active sessions for a user (for rate limiting).
 */
export async function countActiveSessions(userId: string): Promise<number> {
  const col = getCollection();
  return col.countDocuments({
    userId,
    status: { $in: ['starting', 'active', 'syncing'] },
  });
}

/**
 * Check if user can create a new session.
 */
export async function canCreateSession(userId: string): Promise<boolean> {
  const count = await countActiveSessions(userId);
  return count < MAX_CONCURRENT_SESSIONS;
}

/**
 * Update session status.
 */
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus,
  extra?: {
    ecsTaskArn?: string;
    error?: string;
    capabilities?: SessionCapabilities;
    resultStats?: SessionResultStats;
  }
): Promise<Session | null> {
  const col = getCollection();
  const now = new Date();

  const setFields: Record<string, unknown> = {
    status,
    lastActivityAt: now,
  };

  if (extra?.ecsTaskArn !== undefined) {
    setFields.ecsTaskArn = extra.ecsTaskArn;
  }
  if (extra?.error !== undefined) {
    setFields.error = extra.error;
  }
  if (extra?.capabilities !== undefined) {
    setFields.capabilities = extra.capabilities;
  }
  if (extra?.resultStats !== undefined) {
    setFields.resultStats = extra.resultStats;
  }
  if (status === 'stopped' || status === 'errored') {
    setFields.stoppedAt = now;
  }

  const result = await col.findOneAndUpdate(
    { sessionId },
    { $set: setFields },
    { returnDocument: 'after' }
  );

  return result ?? null;
}

/**
 * Increment message count and update last activity.
 */
export async function recordSessionActivity(sessionId: string): Promise<void> {
  const col = getCollection();
  await col.updateOne(
    { sessionId },
    {
      $inc: { messageCount: 1 },
      $set: { lastActivityAt: new Date() },
    }
  );
}

/**
 * Find sessions that have been idle for too long.
 */
export async function findIdleSessions(maxIdleMs: number): Promise<Session[]> {
  const col = getCollection();
  const cutoff = new Date(Date.now() - maxIdleMs);

  return col
    .find({
      status: { $in: ['starting', 'active', 'syncing'] },
      lastActivityAt: { $lt: cutoff },
    })
    .toArray();
}

/**
 * Ensure indexes exist on the collection.
 */
export async function ensureSessionIndexes(db?: Db): Promise<void> {
  const col = getCollection(db);
  await col.createIndex({ sessionId: 1 }, { unique: true });
  await col.createIndex({ userId: 1, status: 1 });
  await col.createIndex({ lastActivityAt: 1 });
}
