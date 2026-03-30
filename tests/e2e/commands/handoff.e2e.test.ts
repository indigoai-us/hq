import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldHQ, type ScaffoldResult } from '../helpers/scaffold';
import {
  runClaude,
  validateEnvironment,
  getCumulativeCost,
  type ClaudeRunResult,
} from '../helpers/claude-runner';

// Helper: recursively find files matching a suffix
function findFiles(dir: string, suffix: string): string[] {
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          results.push(...findFiles(full, suffix));
        } else if (entry.includes(suffix)) {
          results.push(full);
        }
      } catch {
        // skip inaccessible entries
      }
    }
  } catch {
    // dir may not exist
  }
  return results;
}

describe('e2e: /handoff', () => {
  let scaffold: ScaffoldResult;
  let result: ClaudeRunResult;

  beforeAll(async () => {
    validateEnvironment();
    scaffold = scaffoldHQ();

    result = await runClaude({
      prompt: '/handoff',
      cwd: scaffold.dir,
      model: 'haiku',
      maxTurns: 10,
    });
  }, 300_000);

  afterAll(() => {
    const cost = getCumulativeCost();
    console.log(
      `[e2e cost] /handoff — input: ${cost.inputTokens}, output: ${cost.outputTokens}, total: ${cost.totalTokens}`
    );
    scaffold?.cleanup();
  });

  it('exits with code 0', () => {
    expect(result.exitCode).toBe(0);
  });

  it('writes handoff.json or handoff.md', () => {
    const hasJson = existsSync(join(scaffold.dir, 'handoff.json'));
    const hasMd = existsSync(join(scaffold.dir, 'handoff.md'));
    // Also search recursively for any handoff file
    const handoffFiles = findFiles(scaffold.dir, 'handoff');
    const found = hasJson || hasMd || handoffFiles.length > 0;
    expect(found).toBe(true);
  });
});
