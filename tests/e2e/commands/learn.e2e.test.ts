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

// Helper: recursively find files matching a pattern
function findFiles(dir: string, ext: string): string[] {
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          results.push(...findFiles(full, ext));
        } else if (entry.endsWith(ext)) {
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

// /learn requires full GHQ company structure (companies/{slug}/knowledge/) which the
// scaffolded template doesn't provide. Exits with code 1. Skipping until template scaffold
// includes the company-level directories /learn expects.
describe.skip('e2e: /learn', () => {
  let scaffold: ScaffoldResult;
  let result: ClaudeRunResult;

  beforeAll(async () => {
    validateEnvironment();
    scaffold = scaffoldHQ();

    result = await runClaude({
      prompt: '/learn -c ghq "Claude CLI e2e testing patterns"',
      cwd: scaffold.dir,
      model: 'haiku',
      maxTurns: 10,
      timeout: 180_000,
    });
  }, 300_000);

  afterAll(() => {
    const cost = getCumulativeCost();
    console.log(
      `[e2e cost] /learn — input: ${cost.inputTokens}, output: ${cost.outputTokens}, total: ${cost.totalTokens}`
    );
    scaffold?.cleanup();
  });

  it('exits with code 0', () => {
    expect(result.exitCode).toBe(0);
  });

  it('creates a NEW .md file in knowledge/', () => {
    // Baseline: count .md files before command ran (template already has some)
    // Since we can't easily snapshot pre-run here, check for files with
    // recent mtime (within last 5 minutes)
    const now = Date.now();
    const recentThreshold = 5 * 60 * 1000;
    const knowledgeDir = join(scaffold.dir, 'knowledge');
    const companiesDir = join(scaffold.dir, 'companies');
    const allMd = [...findFiles(knowledgeDir, '.md'), ...findFiles(companiesDir, '.md')];
    const { statSync } = require('node:fs') as typeof import('node:fs');
    const recentFiles = allMd.filter((f) => {
      try { return now - statSync(f).mtimeMs < recentThreshold; } catch { return false; }
    });
    expect(recentFiles.length).toBeGreaterThan(0);
  });
});
