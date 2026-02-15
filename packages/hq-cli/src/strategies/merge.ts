/**
 * Merge Sync Strategy (US-007)
 * Copies files from module into HQ, tracks state for conflict detection
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ModuleDefinition, SyncResult, SyncState } from '../types.js';
import { readState, writeState } from '../utils/manifest.js';

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function copyRecursive(
  srcDir: string,
  destDir: string,
  state: SyncState,
  moduleName: string,
  hqRoot: string,
  filesChanged: { count: number }
): void {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath, state, moduleName, hqRoot, filesChanged);
    } else {
      const relativeDest = path.relative(hqRoot, destPath).replace(/\\/g, '/');
      const newHash = hashFile(srcPath);

      // Check if file exists and has been modified by user
      if (fs.existsSync(destPath)) {
        const existingHash = hashFile(destPath);
        const lastSyncedHash = state.files[relativeDest]?.hash;

        if (lastSyncedHash && existingHash !== lastSyncedHash && existingHash !== newHash) {
          // User modified the file since last sync - skip (conflict)
          console.warn(`  Conflict: ${relativeDest} has local changes, skipping`);
          continue;
        }

        if (existingHash === newHash) {
          // File unchanged, skip
          continue;
        }
      }

      // Copy file
      fs.copyFileSync(srcPath, destPath);
      filesChanged.count++;

      // Track in state
      state.files[relativeDest] = {
        hash: newHash,
        syncedAt: new Date().toISOString(),
        fromModule: moduleName,
      };
    }
  }
}

export async function mergeSync(
  module: ModuleDefinition,
  moduleDir: string,
  hqRoot: string
): Promise<SyncResult> {
  let state = readState(hqRoot);
  if (!state) {
    state = { version: '1', files: {} };
  }

  const filesChanged = { count: 0 };

  for (const mapping of module.paths) {
    const srcPath = path.join(moduleDir, mapping.src);
    const destPath = path.join(hqRoot, mapping.dest);

    if (!fs.existsSync(srcPath)) {
      return {
        module: module.name,
        success: false,
        action: 'skipped',
        message: `Source path not found: ${mapping.src}`,
      };
    }

    const srcStat = fs.statSync(srcPath);
    if (srcStat.isDirectory()) {
      copyRecursive(srcPath, destPath, state, module.name, hqRoot, filesChanged);
    } else {
      // Single file
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const relativeDest = path.relative(hqRoot, destPath).replace(/\\/g, '/');
      const newHash = hashFile(srcPath);

      if (fs.existsSync(destPath)) {
        const existingHash = hashFile(destPath);
        const lastSyncedHash = state.files[relativeDest]?.hash;

        if (lastSyncedHash && existingHash !== lastSyncedHash && existingHash !== newHash) {
          console.warn(`  Conflict: ${relativeDest} has local changes, skipping`);
          continue;
        }

        if (existingHash === newHash) {
          continue;
        }
      }

      fs.copyFileSync(srcPath, destPath);
      filesChanged.count++;

      state.files[relativeDest] = {
        hash: newHash,
        syncedAt: new Date().toISOString(),
        fromModule: module.name,
      };
    }
  }

  writeState(hqRoot, state);

  return {
    module: module.name,
    success: true,
    action: 'synced',
    filesChanged: filesChanged.count,
  };
}
