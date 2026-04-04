/**
 * sync.ts — HQ git sync module.
 *
 * Clones the HQ repo on first startup, pulls on subsequent starts, and
 * exposes HTTP routes for status and on-demand sync triggering.
 *
 * Sensitive directories (settings/, .env*, credentials) are naturally
 * excluded from host mounts because only specific subdirs are mounted into
 * containers (see getSkillsDir / getKnowledgeDir). Git clone/pull pulls the
 * full repo but containers only see the explicitly mounted paths.
 *
 * Sync failures are logged but never throw — stale context beats no context.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { config } from './config.js';

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncStatus {
  enabled: boolean;
  syncDir: string;
  lastSyncAt: number | null;
  commitHash: string | null;
  dirty: boolean;
  error: string | null;
}

// ─── Module-level state ───────────────────────────────────────────────────────

let state: SyncStatus = {
  enabled: !!config.HQ_REPO_URL,
  syncDir: path.resolve(config.HQ_SYNC_DIR),
  lastSyncAt: null,
  commitHash: null,
  dirty: false,
  error: null,
};

// Serialization guard — prevents overlapping clone/pull operations.
let syncInProgress: Promise<void> | null = null;

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getCommitHash(syncDir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', syncDir, 'rev-parse', 'HEAD'], {
      timeout: 10_000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function isDirty(syncDir: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', syncDir, 'status', '--porcelain'], {
      timeout: 10_000,
    });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Clone HQ repo on first startup; pull on subsequent starts.
 * Non-blocking on error — logs and stores error state, never throws.
 * Serialized: concurrent calls wait for the in-flight operation rather than
 * launching a second clone/pull against the same directory.
 */
export function syncHq(): Promise<void> {
  if (syncInProgress) {
    // Re-use the in-flight promise — no need to queue a second operation.
    return syncInProgress;
  }
  syncInProgress = _doSync().finally(() => {
    syncInProgress = null;
  });
  return syncInProgress;
}

async function _doSync(): Promise<void> {
  if (!config.HQ_REPO_URL) {
    console.log('[sync] HQ_REPO_URL not set — skipping HQ sync');
    state = { ...state, enabled: false, error: 'HQ_REPO_URL not configured' };
    return;
  }

  const syncDir = path.resolve(config.HQ_SYNC_DIR);
  // Pre-compute redacted URL once for use in log + error messages.
  const safeUrl = config.HQ_REPO_URL.replace(/\/\/[^@]+@/, '//***@');

  try {
    const hasGit = fs.existsSync(path.join(syncDir, '.git'));

    if (!hasGit) {
      console.log(`[sync] Cloning ${safeUrl} → ${syncDir}`);
      // Shallow clone for speed
      await execFileAsync(
        'git',
        ['clone', '--depth', '1', config.HQ_REPO_URL, syncDir],
        { timeout: 120_000 }
      );
      console.log('[sync] Clone complete');
    } else {
      console.log(`[sync] Pulling ${syncDir}`);
      await execFileAsync(
        'git',
        ['-C', syncDir, 'pull', '--ff-only'],
        { timeout: 60_000 }
      );
      console.log('[sync] Pull complete');
    }

    const [commitHash, dirty] = await Promise.all([
      getCommitHash(syncDir),
      isDirty(syncDir),
    ]);

    state = {
      enabled: true,
      syncDir,
      lastSyncAt: Date.now(),
      commitHash,
      dirty,
      error: null,
    };

    console.log(`[sync] HQ sync OK — commit ${commitHash ?? 'unknown'}`);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    // Scrub the repo URL (which may contain embedded credentials) from the
    // error message before storing — it would otherwise be exposed via
    // GET /api/sync/status (unauthenticated) and in ECS/CloudWatch logs.
    const errMsg = rawMsg.replace(new RegExp(config.HQ_REPO_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), safeUrl);
    console.error('[sync] HQ sync failed (non-fatal):', errMsg);
    state = { ...state, lastSyncAt: Date.now(), error: errMsg };
    // Do NOT rethrow — stale context beats no context
  }
}

/** Return a snapshot of the current sync state. */
export function getSyncStatus(): SyncStatus {
  return { ...state };
}

/** Absolute path to `.claude/skills/` in the synced HQ repo. */
export function getSkillsDir(): string {
  return path.join(path.resolve(config.HQ_SYNC_DIR), '.claude', 'skills');
}

/** Absolute path to `knowledge/public/` in the synced HQ repo. */
export function getKnowledgeDir(): string {
  return path.join(path.resolve(config.HQ_SYNC_DIR), 'knowledge', 'public');
}

/** Absolute path to `companies/{company}/knowledge/` in the synced HQ repo. */
export function getCompanyKnowledgeDir(company: string): string {
  // Sanitize: reject slugs containing path separators or traversal sequences.
  if (!company || /[/\\.]/.test(company)) {
    throw new Error(`Invalid company slug: ${JSON.stringify(company)}`);
  }
  return path.join(path.resolve(config.HQ_SYNC_DIR), 'companies', company, 'knowledge');
}

// ─── HMAC helper ──────────────────────────────────────────────────────────────

function verifyHubSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expected = `sha256=${digest}`;
  // Both strings must be equal length for timingSafeEqual
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ─── Route registration ───────────────────────────────────────────────────────

/**
 * Register sync HTTP routes onto the shared express app.
 *
 * Routes:
 *   GET  /api/sync/status  — returns SyncStatus JSON
 *   POST /api/sync         — triggers an immediate git pull (GitHub push webhook)
 *
 * If HQ_WEBHOOK_SECRET is set, POST /api/sync validates the
 * `x-hub-signature-256` header (GitHub HMAC). If no secret is configured,
 * any POST is accepted.
 */
export function registerSyncRoutes(app: express.Application): void {
  // GET /api/sync/status
  app.get('/api/sync/status', (_req, res) => {
    res.json(getSyncStatus());
  });

  // POST /api/sync — use express.raw() to capture rawBody for HMAC verification.
  // GitHub push webhooks can exceed the default 100kb body-parser limit on large
  // pushes, so we raise it to 5mb here.
  app.post(
    '/api/sync',
    express.raw({ type: '*/*', limit: '5mb' }),
    (req: express.Request, res: express.Response) => {
      // HMAC verification (only when secret is configured)
      if (config.HQ_WEBHOOK_SECRET) {
        const signature = req.headers['x-hub-signature-256'];
        if (typeof signature !== 'string') {
          res.status(401).json({ error: 'Missing x-hub-signature-256 header' });
          return;
        }
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? '');
        if (!verifyHubSignature(rawBody, signature, config.HQ_WEBHOOK_SECRET)) {
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }

      // Respond immediately — fire and forget
      res.json({ triggered: true });

      // Background sync (non-blocking, errors are logged inside syncHq)
      void syncHq().catch((err) => {
        console.error('[sync] Background sync error:', err);
      });
    }
  );

  console.log('[sync] Registered GET /api/sync/status and POST /api/sync');
}
