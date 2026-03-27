/**
 * Interactive conflict resolution — ported from modules/cli/src/commands/modules-sync.ts
 */

import * as fs from 'fs';
import * as readline from 'readline';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';

export type ConflictResolution = 'keep' | 'take' | 'skip';

export interface ConflictResolutionRecord {
  resolution: ConflictResolution;
  localHash: string;
  sourceHash: string;
  resolvedAt: string;
}

export interface ConflictState {
  resolutions: Record<string, ConflictResolutionRecord>;
}

export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function getResolutionKey(moduleName: string, filePath: string): string {
  return `${moduleName}:${filePath}`;
}

export function checkPreviousResolution(
  state: ConflictState,
  moduleName: string,
  filePath: string,
  localHash: string,
  sourceHash: string
): ConflictResolution | null {
  const key = getResolutionKey(moduleName, filePath);
  const record = state.resolutions[key];
  if (!record) return null;
  if (record.localHash === localHash && record.sourceHash === sourceHash) {
    return record.resolution;
  }
  return null;
}

export function recordResolution(
  state: ConflictState,
  moduleName: string,
  filePath: string,
  resolution: ConflictResolution,
  localHash: string,
  sourceHash: string
): void {
  const key = getResolutionKey(moduleName, filePath);
  state.resolutions[key] = {
    resolution,
    localHash,
    sourceHash,
    resolvedAt: new Date().toISOString(),
  };
}

export function showDiff(localFile: string, sourceFile: string, destPath: string): void {
  console.log(`\n--- Diff for ${destPath} ---`);
  console.log('(< local, > incoming)\n');
  const result = spawnSync('diff', ['-u', localFile, sourceFile], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.stdout) {
    const lines = result.stdout.split('\n');
    const max = 50;
    console.log(lines.slice(0, max).join('\n'));
    if (lines.length > max) console.log(`\n... (${lines.length - max} more lines)`);
  } else {
    console.log(`  Local: ${fs.statSync(localFile).size} bytes`);
    console.log(`  Source: ${fs.statSync(sourceFile).size} bytes`);
  }
  console.log('');
}

export async function promptConflictResolution(
  destPath: string,
  localFile: string,
  sourceFile: string
): Promise<ConflictResolution> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    const ask = (): void => {
      console.log(`\nConflict: ${destPath}`);
      console.log('  Local file modified since last sync.');
      console.log('  [k]eep  [t]ake  [d]iff');
      rl.question('  Choice [k/t/d]: ', (answer) => {
        switch (answer.toLowerCase().trim()) {
          case 'k': case 'keep':
            rl.close(); resolve('keep'); break;
          case 't': case 'take':
            rl.close(); resolve('take'); break;
          case 'd': case 'diff':
            showDiff(localFile, sourceFile, destPath);
            ask();
            break;
          default:
            console.log('  Invalid. Enter k, t, or d.');
            ask();
        }
      });
    };
    ask();
  });
}
