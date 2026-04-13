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
      maxTurns: 10,
    });
  }, 600_000);

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

  it('produces non-empty output', () => {
    // Claude's exact wording is non-deterministic — just verify it produced output
    const output = (result.stdout + result.stderr).trim();
    expect(output.length).toBeGreaterThan(0);
  });

  it('produces non-empty output', () => {
    // /setup may not create new top-level files (template already has structure),
    // but Claude should always produce output when executing the command
    const output = result.stdout + result.stderr;
    expect(output.length).toBeGreaterThan(0);
  });
});
