import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { scaffoldHQ, type ScaffoldResult } from '../helpers/scaffold';
import {
  runClaude,
  validateEnvironment,
  getCumulativeCost,
  type ClaudeRunResult,
} from '../helpers/claude-runner';

describe('e2e: /setup', () => {
  let scaffold: ScaffoldResult;
  let initialEntries: string[];
  let result: ClaudeRunResult;

  beforeAll(async () => {
    validateEnvironment();
    scaffold = scaffoldHQ();
    initialEntries = readdirSync(scaffold.dir);

    result = await runClaude({
      prompt: '/setup',
      cwd: scaffold.dir,
      model: 'haiku',
      maxTurns: 3,
    });
  }, 120_000);

  afterAll(() => {
    const cost = getCumulativeCost();
    console.log(
      `[e2e cost] /setup — input: ${cost.inputTokens}, output: ${cost.outputTokens}, total: ${cost.totalTokens}`
    );
    scaffold?.cleanup();
  });

  it('exits with code 0', () => {
    expect(result.exitCode).toBe(0);
  });

  it('output contains expected keyword', () => {
    const output = (result.stdout + result.stderr).toLowerCase();
    const keywords = ['setup', 'created', 'ready', 'initialized', 'configured', 'complete', 'done'];
    const found = keywords.some((kw) => output.includes(kw));
    expect(found).toBe(true);
  });

  it('creates at least one new file or directory', () => {
    const currentEntries = readdirSync(scaffold.dir);
    const newEntries = currentEntries.filter((e) => !initialEntries.includes(e));
    expect(newEntries.length).toBeGreaterThan(0);
  });
});
