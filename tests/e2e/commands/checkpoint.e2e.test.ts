import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
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

  beforeAll(async () => {
    validateEnvironment();
    scaffold = scaffoldHQ();

    result = await runClaude({
      prompt: '/checkpoint',
      cwd: scaffold.dir,
      model: 'haiku',
      maxTurns: 3,
    });
  }, 120_000);

  afterAll(() => {
    const cost = getCumulativeCost();
    console.log(
      `[e2e cost] /checkpoint — input: ${cost.inputTokens}, output: ${cost.outputTokens}, total: ${cost.totalTokens}`
    );
    scaffold?.cleanup();
  });

  it('exits with code 0', () => {
    expect(result.exitCode).toBe(0);
  });

  it('writes workspace/ or threads/ directory', () => {
    const hasWorkspace = existsSync(join(scaffold.dir, 'workspace'));
    const hasThreads = existsSync(join(scaffold.dir, 'threads'));
    const hasAgents = existsSync(join(scaffold.dir, '.agents'));
    expect(hasWorkspace || hasThreads || hasAgents).toBe(true);
  });
});
