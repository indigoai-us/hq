/**
 * Lock file utility — ported from modules/cli/src/commands/modules-sync.ts
 * Provides richer lock file format with per-module timestamps.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface LockEntry {
  /** Git commit SHA */
  commit: string;
  /** ISO timestamp when locked */
  lockedAt: string;
}

export interface RichModuleLock {
  version: '1';
  /** Module locks keyed by module name */
  modules: Record<string, LockEntry>;
}

const LOCK_HEADER = `# HQ Modules Lock File
# This file tracks pinned module versions for reproducible installs.
# Do not edit manually — use 'hq modules update <name>' to update.

`;

export function getLockFilePath(hqRoot: string): string {
  return path.join(hqRoot, 'modules.lock');
}

export function readRichLock(hqRoot: string): RichModuleLock | null {
  const lockPath = getLockFilePath(hqRoot);
  if (!fs.existsSync(lockPath)) return null;
  const content = fs.readFileSync(lockPath, 'utf-8');
  return yaml.load(content) as RichModuleLock;
}

export function writeRichLock(hqRoot: string, lockFile: RichModuleLock): void {
  const lockPath = getLockFilePath(hqRoot);
  const content = yaml.dump(lockFile, { lineWidth: -1 });
  fs.writeFileSync(lockPath, LOCK_HEADER + content);
}

export function updateLockEntry(
  hqRoot: string,
  moduleName: string,
  commit: string
): RichModuleLock {
  let lock = readRichLock(hqRoot);
  if (!lock) {
    lock = { version: '1', modules: {} };
  }
  lock.modules[moduleName] = { commit, lockedAt: new Date().toISOString() };
  writeRichLock(hqRoot, lock);
  return lock;
}

export function preserveLockEntries(
  newLock: RichModuleLock,
  existingLock: RichModuleLock | null,
  syncedModuleNames: string[]
): void {
  if (!existingLock) return;
  for (const [name, entry] of Object.entries(existingLock.modules)) {
    if (!syncedModuleNames.includes(name) && !newLock.modules[name]) {
      newLock.modules[name] = entry;
    }
  }
}
