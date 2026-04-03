/**
 * hydrate.ts — Startup hydration from S3.
 *
 * On first boot (or after a fresh ECS task launch), the local data/ directory
 * may be empty. This module restores state from S3:
 *   - Latest DB snapshot from s3://{BUCKET}/{PREFIX}/db/
 *   - All session JSONL files from s3://{BUCKET}/{PREFIX}/sessions/
 *   - All group memory files from s3://{BUCKET}/{PREFIX}/groups/
 *
 * All operations are non-fatal — errors are logged and the process continues
 * with whatever state is available locally. An empty data dir is a valid state
 * (first-ever deployment).
 */

import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { get, list } from './s3.js';

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Called during startup. Hydrates local data/ from S3 if the directory
 * appears empty (no sessions/ dir and no messages.db).
 * Non-fatal: errors are logged, startup continues.
 */
export async function hydrateIfNeeded(): Promise<void> {
  if (!config.S3_BUCKET) {
    console.log('[hydrate] S3_BUCKET not set — skipping hydration');
    return;
  }

  const dataDir = path.resolve(config.DATA_DIR);
  const sessionsDir = path.join(dataDir, 'sessions');
  const dbPath = path.join(dataDir, 'messages.db');

  const hasSessions = fs.existsSync(sessionsDir);
  const hasDb = fs.existsSync(dbPath);

  if (hasSessions || hasDb) {
    console.log('[hydrate] Local data/ not empty — skipping S3 hydration');
    return;
  }

  console.log('[hydrate] data/ looks empty — restoring from S3...');

  await Promise.all([
    hydrateDatabase(dbPath).catch((err) => {
      console.error('[hydrate] DB hydration failed (non-fatal):', err);
    }),
    hydrateSessions(sessionsDir).catch((err) => {
      console.error('[hydrate] Sessions hydration failed (non-fatal):', err);
    }),
    hydrateGroups(dataDir).catch((err) => {
      console.error('[hydrate] Groups hydration failed (non-fatal):', err);
    }),
  ]);

  console.log('[hydrate] Hydration complete');
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function hydrateDatabase(dbPath: string): Promise<void> {
  const prefix = `${config.S3_PREFIX}/db/`;
  const objects = await list(prefix);

  if (objects.length === 0) {
    console.log('[hydrate] No DB snapshots found in S3 — starting fresh');
    return;
  }

  // Pick the most recent by LastModified (or lexicographic key for timestamps)
  const latest = objects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())[0];

  console.log(`[hydrate] Restoring DB from ${latest.key}`);

  const content = await get(latest.key);
  await fsPromises.mkdir(path.dirname(dbPath), { recursive: true });
  await fsPromises.writeFile(dbPath, content);

  console.log(`[hydrate] DB restored (${content.length} bytes)`);
}

async function hydrateSessions(sessionsDir: string): Promise<void> {
  const prefix = `${config.S3_PREFIX}/sessions/`;
  const objects = await list(prefix);

  if (objects.length === 0) {
    console.log('[hydrate] No session files found in S3');
    return;
  }

  console.log(`[hydrate] Restoring ${objects.length} session file(s) from S3`);

  for (const obj of objects) {
    // Key format: {PREFIX}/sessions/{sessionId}/{file}.jsonl
    // Strip prefix to get relative path: sessions/{sessionId}/{file}.jsonl
    const relativePath = obj.key.slice(`${config.S3_PREFIX}/sessions/`.length);
    const localPath = path.join(sessionsDir, relativePath);
    await fsPromises.mkdir(path.dirname(localPath), { recursive: true });
    const content = await get(obj.key);
    await fsPromises.writeFile(localPath, content);
  }

  console.log('[hydrate] Sessions restored');
}

async function hydrateGroups(dataDir: string): Promise<void> {
  const prefix = `${config.S3_PREFIX}/groups/`;
  const objects = await list(prefix);

  if (objects.length === 0) {
    console.log('[hydrate] No group memory files found in S3');
    return;
  }

  console.log(`[hydrate] Restoring ${objects.length} group file(s) from S3`);

  const groupsDir = path.join(dataDir, 'groups');

  for (const obj of objects) {
    // Key format: {PREFIX}/groups/{groupId}/{file}.md
    const relativePath = obj.key.slice(`${config.S3_PREFIX}/groups/`.length);
    const localPath = path.join(groupsDir, relativePath);
    await fsPromises.mkdir(path.dirname(localPath), { recursive: true });
    const content = await get(obj.key);
    await fsPromises.writeFile(localPath, content);
  }

  console.log('[hydrate] Group memory restored');
}
