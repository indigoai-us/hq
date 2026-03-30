import { execFile } from 'node:child_process';

export interface ClaudeRunOptions {
  prompt: string;
  cwd: string;
  model?: string;
  maxTurns?: number;
  allowedTools?: string[];
  outputFormat?: 'text' | 'json';
  timeout?: number;
}

export interface ClaudeRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cost: {
    inputTokens: number;
    outputTokens: number;
  };
  duration: number;
}

const DEFAULT_MODEL = 'haiku';
const DEFAULT_MAX_TURNS = 3;
const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_TOKEN_BUDGET = 100_000;

let cumulativeInputTokens = 0;
let cumulativeOutputTokens = 0;

export function getCumulativeCost() {
  return {
    inputTokens: cumulativeInputTokens,
    outputTokens: cumulativeOutputTokens,
    totalTokens: cumulativeInputTokens + cumulativeOutputTokens,
  };
}

export function resetCumulativeCost() {
  cumulativeInputTokens = 0;
  cumulativeOutputTokens = 0;
}

function getTokenBudget(): number {
  const env = process.env['E2E_TOKEN_BUDGET'];
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TOKEN_BUDGET;
}

function checkBudget() {
  const budget = getTokenBudget();
  const total = cumulativeInputTokens + cumulativeOutputTokens;
  if (total > budget) {
    throw new Error(
      `E2E token budget exceeded: ${total} tokens used, budget is ${budget}. ` +
      `Set E2E_TOKEN_BUDGET env var to increase the limit.`
    );
  }
}

export function validateEnvironment() {
  if (!process.env['ANTHROPIC_API_KEY']) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set. ' +
      'E2E tests require a valid API key to run Claude CLI.'
    );
  }

  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    execFileSync('which', ['claude'], { stdio: 'pipe' });
  } catch {
    throw new Error(
      'claude CLI is not found on PATH. ' +
      'Install Claude Code CLI before running e2e tests: https://docs.anthropic.com/en/docs/claude-code'
    );
  }
}

function parseTokenUsage(output: string): { inputTokens: number; outputTokens: number } {
  // Claude CLI outputs token usage in stderr or structured JSON output
  const inputMatch = output.match(/input[_\s]?tokens[:\s]+(\d+)/i);
  const outputMatch = output.match(/output[_\s]?tokens[:\s]+(\d+)/i);
  return {
    inputTokens: inputMatch ? parseInt(inputMatch[1], 10) : 0,
    outputTokens: outputMatch ? parseInt(outputMatch[1], 10) : 0,
  };
}

export function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const {
    prompt,
    cwd,
    model = DEFAULT_MODEL,
    maxTurns = DEFAULT_MAX_TURNS,
    allowedTools = [],
    outputFormat = 'text',
    timeout = DEFAULT_TIMEOUT,
  } = options;

  // Check budget before running
  checkBudget();

  const args = ['-p', prompt, '--model', model, '--max-turns', String(maxTurns)];

  if (outputFormat === 'json') {
    args.push('--output-format', 'json');
  }

  for (const tool of allowedTools) {
    args.push('--allowedTools', tool);
  }

  return new Promise<ClaudeRunResult>((resolve, reject) => {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeout);

    const child = execFile(
      'claude',
      args,
      {
        cwd,
        signal: controller.signal,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        const duration = Date.now() - start;

        if (error && error.killed) {
          reject(new Error(`Claude CLI timed out after ${timeout}ms`));
          return;
        }

        const exitCode = error ? (error.code as unknown as number ?? 1) : 0;
        const combined = stdout + stderr;
        const cost = parseTokenUsage(combined);

        cumulativeInputTokens += cost.inputTokens;
        cumulativeOutputTokens += cost.outputTokens;

        // Check budget after running
        try {
          checkBudget();
        } catch (budgetError) {
          reject(budgetError);
          return;
        }

        resolve({
          stdout,
          stderr,
          exitCode,
          cost,
          duration,
        });
      }
    );
  });
}
