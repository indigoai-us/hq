import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { scaffoldHQ, type ScaffoldResult } from '../helpers/scaffold';
import {
  runClaude,
  validateEnvironment,
  getCumulativeCost,
  type ClaudeRunResult,
} from '../helpers/claude-runner';

// Recursively collect all file paths (excluding .claude/ template files)
function collectFiles(dir: string): Set<string> {
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const files = new Set<string>();
  try {
    for (const entry of readdirSync(dir)) {
      if (entry === '.claude') continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          for (const f of collectFiles(full)) files.add(f);
        } else {
          files.add(full);
        }
      } catch { /* skip inaccessible */ }
    }
  } catch { /* dir may not exist */ }
  return files;
}

describe('e2e: /handoff', () => {
  let scaffold: ScaffoldResult;
  let result: ClaudeRunResult;
  let filesBefore: Set<string>;

  beforeAll(async () => {
    validateEnvironment();
    scaffold = scaffoldHQ();
    filesBefore = collectFiles(scaffold.dir);

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
    // Log new files for informational purposes
    const filesAfter = collectFiles(scaffold.dir);
    const newFiles = [...filesAfter].filter((f) => !filesBefore.has(f));
    console.log(`[e2e info] /handoff — new files: ${newFiles.length > 0 ? newFiles.join(', ') : 'none'}`);
    scaffold?.cleanup();
  });

  it('exits with code 0', () => {
    expect(result.exitCode).toBe(0);
  });

  it('produces non-empty output', () => {
    // /handoff may write files or just produce text output — both are valid
    const output = (result.stdout + result.stderr).trim();
    expect(output.length).toBeGreaterThan(0);
  });
});
