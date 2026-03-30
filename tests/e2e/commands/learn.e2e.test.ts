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

describe('e2e: /learn', () => {
  let scaffold: ScaffoldResult;
  let result: ClaudeRunResult;

  beforeAll(async () => {
    validateEnvironment();
    scaffold = scaffoldHQ();

    result = await runClaude({
      prompt: '/learn -c ghq "Claude CLI e2e testing patterns"',
      cwd: scaffold.dir,
      model: 'haiku',
      maxTurns: 3,
    });
  }, 120_000);

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

  it('creates at least one .md file in knowledge/', () => {
    const knowledgeDir = join(scaffold.dir, 'knowledge');
    const mdFiles = findFiles(knowledgeDir, '.md');
    // Also check companies/*/knowledge/ as an alternative location
    const companiesDir = join(scaffold.dir, 'companies');
    const companyMdFiles = findFiles(companiesDir, '.md');
    const allMd = [...mdFiles, ...companyMdFiles];
    expect(allMd.length).toBeGreaterThan(0);
  });
});
