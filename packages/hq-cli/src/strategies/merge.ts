/**
 * Merge Sync Strategy (US-007)
 * Copies files from module into HQ, tracks state for conflict detection.
 * Interactive conflict resolution ported from modules/cli/src/commands/modules-sync.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ModuleDefinition, SyncResult, SyncState } from '../types.js';
import { readState, writeState } from '../utils/manifest.js';
import type { ConflictState } from '../utils/conflict.js';
import {
  hashFile,
  checkPreviousResolution,
  recordResolution,
  promptConflictResolution,
} from '../utils/conflict.js';

export interface MergeSyncOptions {
  /** If true, prompt user on conflict. Default: false (auto-keep). */
  interactive?: boolean;
  /** Shared conflict resolution state for recording user choices. */
  conflictState?: ConflictState;
}

interface ConflictInfo {
  srcFile: string;
  destFile: string;
  destRelative: string;
  srcRelative: string;
  srcHash: string;
  destHash: string;
}

function copyRecursive(
  srcDir: string,
  destDir: string,
  state: SyncState,
  moduleName: string,
  hqRoot: string,
  filesChanged: { count: number },
  conflicts: ConflictInfo[]
): void {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath, state, moduleName, hqRoot, filesChanged, conflicts);
    } else {
      const relativeDest = path.relative(hqRoot, destPath);
      const relativeSrc = path.relative(path.join(srcDir, '..'), srcPath);
      const newHash = hashFile(srcPath);

      if (fs.existsSync(destPath)) {
        const existingHash = hashFile(destPath);
        const lastSyncedHash = state.files[relativeDest]?.hash;

        if (lastSyncedHash && existingHash !== lastSyncedHash && existingHash !== newHash) {
          // Conflict: user modified since last sync
          conflicts.push({
            srcFile: srcPath,
            destFile: destPath,
            destRelative: relativeDest,
            srcRelative: relativeSrc,
            srcHash: newHash,
            destHash: existingHash,
          });
          continue;
        }

        if (existingHash === newHash) continue; // Unchanged, skip
      }

      fs.copyFileSync(srcPath, destPath);
      filesChanged.count++;
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
  hqRoot: string,
  options: MergeSyncOptions = {}
): Promise<SyncResult> {
  const { interactive = false, conflictState } = options;

  let state = readState(hqRoot);
  if (!state) {
    state = { version: '1', files: {} };
  }

  const filesChanged = { count: 0 };
  const conflicts: ConflictInfo[] = [];
  const now = new Date().toISOString();

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
      copyRecursive(srcPath, destPath, state, module.name, hqRoot, filesChanged, conflicts);
    } else {
      const relativeDest = path.relative(hqRoot, destPath);
      const newHash = hashFile(srcPath);

      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      if (fs.existsSync(destPath)) {
        const existingHash = hashFile(destPath);
        const lastSyncedHash = state.files[relativeDest]?.hash;

        if (lastSyncedHash && existingHash !== lastSyncedHash && existingHash !== newHash) {
          conflicts.push({
            srcFile: srcPath,
            destFile: destPath,
            destRelative: relativeDest,
            srcRelative: mapping.src,
            srcHash: newHash,
            destHash: existingHash,
          });
          continue;
        }

        if (existingHash === newHash) continue;
      }

      fs.copyFileSync(srcPath, destPath);
      filesChanged.count++;
      state.files[relativeDest] = {
        hash: newHash,
        syncedAt: now,
        fromModule: module.name,
      };
    }
  }

  // Handle conflicts
  let kept = 0;
  if (conflicts.length > 0) {
    console.log(`\n  ${conflicts.length} conflict(s) detected for ${module.name}:`);

    for (const conflict of conflicts) {
      let resolution: 'keep' | 'take' | 'skip' = 'keep';

      // Check for cached resolution
      const cached = conflictState
        ? checkPreviousResolution(
            conflictState,
            module.name,
            conflict.destRelative,
            conflict.destHash,
            conflict.srcHash
          )
        : null;

      if (cached) {
        console.log(`    ${conflict.destRelative}: reusing previous resolution (${cached})`);
        resolution = cached;
      } else if (interactive) {
        resolution = await promptConflictResolution(
          conflict.destRelative,
          conflict.destFile,
          conflict.srcFile
        );
        if (conflictState) {
          recordResolution(
            conflictState,
            module.name,
            conflict.destRelative,
            resolution,
            conflict.destHash,
            conflict.srcHash
          );
        }
      } else {
        console.warn(`  Conflict: ${conflict.destRelative} has local changes, skipping`);
        resolution = 'keep';
      }

      if (resolution === 'take') {
        fs.copyFileSync(conflict.srcFile, conflict.destFile);
        filesChanged.count++;
        state.files[conflict.destRelative] = {
          hash: conflict.srcHash,
          syncedAt: now,
          fromModule: module.name,
        };
        console.log(`    Overwrote: ${conflict.destRelative}`);
      } else {
        kept++;
        if (resolution === 'keep') {
          console.log(`    Kept local: ${conflict.destRelative}`);
        }
      }
    }
  }

  writeState(hqRoot, state);

  const msg = kept > 0 ? `${filesChanged.count} files synced, ${kept} conflicts kept` : undefined;
  return {
    module: module.name,
    success: true,
    action: 'synced',
    filesChanged: filesChanged.count,
    message: msg,
  };
}
