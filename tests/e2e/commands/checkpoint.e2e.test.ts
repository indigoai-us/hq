import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldHQ, type ScaffoldResult } from '../helpers/scaffold';
import {
  runClaude,
  validateEnvironment,
  getCumulativeCost,
  type ClaudeRunResult,
} from '../helpers/claude-runner';

describe('e2e: /checkpoint', () => {
  let scaffold: ScaffoldResult;
  let result: ClaudeRunResult;
  const targetDirs = ['workspace', 'threads', '.agents'];
  let beforeMtimes: Map<string, number>;

  beforeAll(async () => {
    validateEnvironment();
    scaffold = scaffoldHQ();
    // Snapshot mtimes of directories that may already exist in template
    beforeMtimes = new Map();
    for (const dir of targetDirs) {
      const full = join(scaffold.dir, dir);
      if (existsSync(full)) {
        beforeMtimes.set(dir, statSync(full).mtimeMs);
      }
    }

    result = await runClaude({
      prompt: '/checkpoint',
      cwd: scaffold.dir,
      model: 'haiku',
      maxTurns: 10,
    });
  }, 300_000);

  afterAll(() => {
    const cost = getCumulativeCost();
    console.log(
      `[e2e cost] /checkpoint — input: ${cost.inputTokens}, output: ${cost.outputTokens}, total: ${cost.totalTokens}`
    );
    // Log file-creation results for informational purposes
    const newOrModified = targetDirs.filter((d) => {
      const full = join(scaffold.dir, d);
      if (!existsSync(full)) return false;
      const before = beforeMtimes.get(d);
      if (before === undefined) return true; // new dir
      return statSync(full).mtimeMs > before; // modified dir
    });
    console.log(`[e2e info] /checkpoint — dirs created/modified: ${newOrModified.join(', ') || 'none'}`);
    scaffold?.cleanup();
  });

  it('exits with code 0', () => {
    expect(result.exitCode).toBe(0);
  });

  it('produces non-empty output', () => {
    const output = (result.stdout + result.stderr).trim();
    expect(output.length).toBeGreaterThan(0);
  });
});
