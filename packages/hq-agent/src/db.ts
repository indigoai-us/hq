import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import type { Message, Chat, Session, ScheduledTask, MessageStatus } from './types.js';

const DEFAULT_TEAM_ID = 'default';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _db;
}

export function initDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? path.join(config.DATA_DIR, 'messages.db');
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);

  // Enable WAL for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createSchema(db);
  migrateTeamId(db);

  _db = db;
  return db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL DEFAULT 'default',
      group_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      processed_at INTEGER,
      container_id TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
    CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_team_id_status ON messages(team_id, status);

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL DEFAULT 'default',
      channel TEXT NOT NULL,
      group_id TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL,
      last_message_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL DEFAULT 'default',
      group_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      container_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      message_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_group_id ON sessions(group_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_team_id ON sessions(team_id);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL DEFAULT 'default',
      group_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_at INTEGER NOT NULL,
      run_at INTEGER,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status ON scheduled_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_group_id ON scheduled_tasks(group_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_team_id ON scheduled_tasks(team_id);
  `);
}

/**
 * Backward-compatible migration: add team_id column to existing databases
 * that were created before multi-tenancy. SQLite ALTER TABLE ADD COLUMN
 * with DEFAULT is safe — existing rows get 'default' automatically.
 */
function migrateTeamId(db: Database.Database): void {
  const tables = ['messages', 'chats', 'sessions', 'scheduled_tasks'];
  for (const table of tables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    const hasTeamId = cols.some((c) => c.name === 'team_id');
    if (!hasTeamId) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN team_id TEXT NOT NULL DEFAULT 'default'`);
    }
  }
}

// --- Message operations ---

export async function insertMessage(
  data: Omit<Message, 'id' | 'created_at' | 'processed_at' | 'container_id' | 'error'>
): Promise<number> {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO messages (team_id, group_id, chat_id, channel, sender_id, sender_name, content, status, created_at)
    VALUES (@team_id, @group_id, @chat_id, @channel, @sender_id, @sender_name, @content, @status, @created_at)
  `);
  const result = stmt.run({
    ...data,
    team_id: data.team_id ?? DEFAULT_TEAM_ID,
    created_at: Date.now(),
  });
  return result.lastInsertRowid as number;
}

export async function getPendingMessages(teamId?: string, limit = 10): Promise<Message[]> {
  const db = getDb();
  if (teamId) {
    return db
      .prepare(
        `SELECT * FROM messages WHERE team_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT ?`
      )
      .all(teamId, limit) as Message[];
  }
  return db
    .prepare(
      `SELECT * FROM messages WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`
    )
    .all(limit) as Message[];
}

export async function updateMessageStatus(
  id: number,
  status: MessageStatus,
  extra?: { container_id?: string; error?: string }
): Promise<void> {
  const db = getDb();
  db.prepare(
    `UPDATE messages SET status = ?, processed_at = ?, container_id = COALESCE(?, container_id), error = COALESCE(?, error) WHERE id = ?`
  ).run(status, Date.now(), extra?.container_id ?? null, extra?.error ?? null, id);
}

/**
 * Reset messages stuck in 'processing' state back to 'pending'.
 * Called on startup to recover from crashes that orphaned in-flight messages.
 */
export function resetOrphanedMessages(): number {
  const db = getDb();
  const result = db.prepare(
    `UPDATE messages SET status = 'pending', processed_at = NULL, container_id = NULL WHERE status = 'processing'`
  ).run();
  return result.changes;
}

export async function getMessageById(id: number): Promise<Message | null> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Message | undefined;
  return row ?? null;
}

// --- Chat operations ---

export async function upsertChat(data: Chat): Promise<void> {
  const db = getDb();
  db.prepare(`
    INSERT INTO chats (id, team_id, channel, group_id, title, created_at, last_message_at)
    VALUES (@id, @team_id, @channel, @group_id, @title, @created_at, @last_message_at)
    ON CONFLICT(id) DO UPDATE SET
      last_message_at = excluded.last_message_at,
      title = COALESCE(excluded.title, chats.title)
  `).run({ ...data, team_id: data.team_id ?? DEFAULT_TEAM_ID });
}

export async function getChatById(id: string): Promise<Chat | null> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM chats WHERE id = ?`).get(id) as Chat | undefined;
  return row ?? null;
}

// --- Session operations ---

export async function insertSession(data: Omit<Session, 'ended_at' | 'message_count'>): Promise<void> {
  const db = getDb();
  db.prepare(`
    INSERT INTO sessions (id, team_id, group_id, chat_id, container_id, status, started_at, message_count)
    VALUES (@id, @team_id, @group_id, @chat_id, @container_id, @status, @started_at, 0)
  `).run({ ...data, team_id: data.team_id ?? DEFAULT_TEAM_ID });
}

export async function updateSession(
  id: string,
  updates: Partial<Pick<Session, 'status' | 'container_id' | 'ended_at' | 'message_count'>>
): Promise<void> {
  const db = getDb();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    values.push(updates.status);
  }
  if (updates.container_id !== undefined) {
    setClauses.push('container_id = ?');
    values.push(updates.container_id);
  }
  if (updates.ended_at !== undefined) {
    setClauses.push('ended_at = ?');
    values.push(updates.ended_at);
  }
  if (updates.message_count !== undefined) {
    setClauses.push('message_count = ?');
    values.push(updates.message_count);
  }

  if (setClauses.length === 0) return;
  values.push(id);

  db.prepare(`UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
}

export async function getSessionById(id: string): Promise<Session | null> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Session | undefined;
  return row ?? null;
}

// --- Scheduled task operations ---

export async function insertScheduledTask(
  data: Omit<ScheduledTask, 'id' | 'run_at' | 'error'>
): Promise<number> {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO scheduled_tasks (team_id, group_id, task_type, payload, status, scheduled_at)
    VALUES (@team_id, @group_id, @task_type, @payload, @status, @scheduled_at)
  `).run({ ...data, team_id: data.team_id ?? DEFAULT_TEAM_ID });
  return result.lastInsertRowid as number;
}

export async function getPendingScheduledTasks(teamId?: string, limit = 10): Promise<ScheduledTask[]> {
  const db = getDb();
  const now = Date.now();
  if (teamId) {
    return db.prepare(`
      SELECT * FROM scheduled_tasks
      WHERE team_id = ? AND status = 'pending' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC LIMIT ?
    `).all(teamId, now, limit) as ScheduledTask[];
  }
  return db.prepare(`
    SELECT * FROM scheduled_tasks
    WHERE status = 'pending' AND scheduled_at <= ?
    ORDER BY scheduled_at ASC LIMIT ?
  `).all(now, limit) as ScheduledTask[];
}

// --- Stats ---

export function getQueueDepth(teamId?: string): number {
  const db = getDb();
  if (teamId) {
    const row = db
      .prepare(`SELECT COUNT(*) as count FROM messages WHERE team_id = ? AND (status = 'pending' OR status = 'processing')`)
      .get(teamId) as { count: number };
    return row.count;
  }
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM messages WHERE status = 'pending' OR status = 'processing'`)
    .get() as { count: number };
  return row.count;
}
