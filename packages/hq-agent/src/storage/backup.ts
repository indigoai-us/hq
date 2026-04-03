/**
 * backup.ts — Backup manager for hq-cloud.
 *
 * Handles three backup targets:
 *   1. Session transcripts (JSONL files) → S3 after each container completes
 *   2. SQLite database snapshot → S3 every BACKUP_INTERVAL_MS
 *   3. Group memory files (*.md) → S3 on change
 *
 * When S3_BUCKET is empty, all operations are no-ops. Errors are logged but
 * never rethrown — backup failures must not crash the host process.
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import express from 'express';
import { config } from '../config.js';
import { put, list } from './s3.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackupStatus {
  enabled: boolean;
  lastBackupAt: number | null;
  lastSessionBackupAt: number | null;
  lastDbBackupAt: number | null;
  lastGroupBackupAt: number | null;
  s3Prefix: string;
  totalObjectsLastScan: number;
  error: string | null;
}

// ─── Module-level state ───────────────────────────────────────────────────────

let state: BackupStatus = {
  enabled: !!config.S3_BUCKET,
  lastBackupAt: null,
  lastSessionBackupAt: null,
  lastDbBackupAt: null,
  lastGroupBackupAt: null,
  s3Prefix: config.S3_PREFIX,
  totalObjectsLastScan: 0,
  error: null,
};

let backupTimer: NodeJS.Timeout | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function s3Key(...parts: string[]): string {
  return [config.S3_PREFIX, ...parts].join('/');
}

function isEnabled(): boolean {
  return !!config.S3_BUCKET;
}

function touch(field: keyof Pick<BackupStatus, 'lastSessionBackupAt' | 'lastDbBackupAt' | 'lastGroupBackupAt'>): void {
  const now = Date.now();
  state = { ...state, [field]: now, lastBackupAt: now, error: null };
}

function setError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  state = { ...state, error: msg };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload all *.jsonl files from sessionDir to S3 under sessions/{sessionId}/.
 * Fire-and-forget — caller should void + .catch() if needed.
 */
export async function backupSession(sessionId: string, sessionDir: string): Promise<void> {
  if (!isEnabled()) {
    console.log('[backup] S3_BUCKET not set — skipping session backup');
    return;
  }

  try {
    const entries = await fsPromises.readdir(sessionDir).catch(() => [] as string[]);
    const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'));

    for (const file of jsonlFiles) {
      const localPath = path.join(sessionDir, file);
      const content = await fsPromises.readFile(localPath);
      const key = s3Key('sessions', sessionId, file);
      await put(key, content, 'application/x-ndjson');
      console.log(`[backup] Session file uploaded: s3://${config.S3_BUCKET}/${key}`);
    }

    touch('lastSessionBackupAt');
    console.log(`[backup] Session ${sessionId} backup complete (${jsonlFiles.length} files)`);
  } catch (err) {
    setError(err);
    console.error('[backup] Session backup failed (non-fatal):', err);
  }
}

/**
 * Upload the SQLite database file to S3 at db/messages-{timestamp}.db.
 */
export async function backupDatabase(dbPath: string): Promise<void> {
  if (!isEnabled()) {
    console.log('[backup] S3_BUCKET not set — skipping database backup');
    return;
  }

  try {
    const content = await fsPromises.readFile(dbPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = s3Key('db', `messages-${timestamp}.db`);
    await put(key, content, 'application/octet-stream');
    touch('lastDbBackupAt');
    console.log(`[backup] Database backup uploaded: s3://${config.S3_BUCKET}/${key}`);
  } catch (err) {
    setError(err);
    console.error('[backup] Database backup failed (non-fatal):', err);
  }
}

/**
 * Upload all *.md files from groupDir to S3 under groups/{groupId}/.
 */
export async function backupGroupMemory(groupId: string, groupDir: string): Promise<void> {
  if (!isEnabled()) {
    console.log('[backup] S3_BUCKET not set — skipping group memory backup');
    return;
  }

  try {
    const entries = await fsPromises.readdir(groupDir).catch(() => [] as string[]);
    const mdFiles = entries.filter((f) => f.endsWith('.md'));

    for (const file of mdFiles) {
      const localPath = path.join(groupDir, file);
      const content = await fsPromises.readFile(localPath);
      const key = s3Key('groups', groupId, file);
      await put(key, content, 'text/markdown');
    }

    touch('lastGroupBackupAt');
    console.log(`[backup] Group ${groupId} memory backup complete (${mdFiles.length} files)`);
  } catch (err) {
    setError(err);
    console.error('[backup] Group memory backup failed (non-fatal):', err);
  }
}

/**
 * Start a repeating interval that backs up the SQLite database.
 * Uses BACKUP_INTERVAL_MS from config (default: 30 minutes).
 */
export function startBackupInterval(): void {
  if (!isEnabled()) {
    console.log('[backup] S3_BUCKET not set — backup interval not started');
    return;
  }

  if (backupTimer) {
    console.log('[backup] Backup interval already running');
    return;
  }

  const dbPath = path.resolve(config.DATA_DIR, 'messages.db');

  console.log(`[backup] Starting backup interval every ${config.BACKUP_INTERVAL_MS}ms`);
  backupTimer = setInterval(() => {
    if (fs.existsSync(dbPath)) {
      void backupDatabase(dbPath).catch((err) => {
        console.error('[backup] Interval backup error:', err);
      });
    } else {
      console.log(`[backup] DB not found at ${dbPath} — skipping interval backup`);
    }
  }, config.BACKUP_INTERVAL_MS);
}

/**
 * Register GET /api/backup/status route on the express app.
 */
export function registerBackupRoutes(app: express.Application): void {
  app.get('/api/backup/status', (_req, res) => {
    // Optionally refresh totalObjectsLastScan in the background
    if (isEnabled()) {
      void refreshTotalObjects().catch((err) => {
        console.error('[backup] Status scan error:', err);
      });
    }
    res.json(getBackupStatus());
  });

  console.log('[backup] Registered GET /api/backup/status');
}

/** Return a snapshot of the current backup state. */
export function getBackupStatus(): BackupStatus {
  return { ...state };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function refreshTotalObjects(): Promise<void> {
  try {
    const objects = await list(`${config.S3_PREFIX}/`);
    state = { ...state, totalObjectsLastScan: objects.length };
  } catch {
    // Non-fatal — best effort
  }
}
