import { getCumulativeCost } from './claude-runner';

interface TestCostEntry {
  testName: string;
  inputTokens: number;
  outputTokens: number;
}

const testCosts: TestCostEntry[] = [];

/**
 * Record token usage for a single test. Call this in afterEach or after each runClaude call.
 */
export function recordTestCost(testName: string, inputTokens: number, outputTokens: number) {
  testCosts.push({ testName, inputTokens, outputTokens });
}

/**
 * Estimate USD cost based on Claude Haiku 4.5 pricing.
 * Input: $1.00 / 1M tokens, Output: $5.00 / 1M tokens
 */
function estimateUSD(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 1.0;
  const outputCost = (outputTokens / 1_000_000) * 5.0;
  return inputCost + outputCost;
}

function pad(str: string, width: number): string {
  return str.padEnd(width);
}

function padNum(n: number, width: number): string {
  return String(n).padStart(width);
}

/**
 * Print a formatted cost report to stdout. Call in globalTeardown or suite-level afterAll.
 */
export function printCostReport() {
  const cumulative = getCumulativeCost();

  const separator = '='.repeat(78);
  const lines: string[] = [];

  lines.push('');
  lines.push(separator);
  lines.push('  E2E Cost Report');
  lines.push(separator);
  lines.push('');

  if (testCosts.length > 0) {
    lines.push('  Per-Test Token Usage:');
    lines.push('  ' + '-'.repeat(74));
    lines.push(
      `  ${pad('Test', 40)} ${'Input'.padStart(10)} ${'Output'.padStart(10)} ${'Total'.padStart(10)}`
    );
    lines.push('  ' + '-'.repeat(74));

    for (const entry of testCosts) {
      const total = entry.inputTokens + entry.outputTokens;
      const name = entry.testName.length > 38
        ? entry.testName.slice(0, 35) + '...'
        : entry.testName;
      lines.push(
        `  ${pad(name, 40)} ${padNum(entry.inputTokens, 10)} ${padNum(entry.outputTokens, 10)} ${padNum(total, 10)}`
      );
    }

    lines.push('  ' + '-'.repeat(74));
    lines.push('');
  } else {
    lines.push('  No per-test cost data recorded.');
    lines.push('  (Call recordTestCost() in afterEach to track individual tests.)');
    lines.push('');
  }

  lines.push('  Cumulative Totals:');
  lines.push(`    Input tokens:  ${cumulative.inputTokens.toLocaleString()}`);
  lines.push(`    Output tokens: ${cumulative.outputTokens.toLocaleString()}`);
  lines.push(`    Total tokens:  ${cumulative.totalTokens.toLocaleString()}`);
  lines.push('');

  const usd = estimateUSD(cumulative.inputTokens, cumulative.outputTokens);
  lines.push(`  Estimated cost:  $${usd.toFixed(4)} (Haiku 4.5 pricing)`);

  const budget = process.env['E2E_TOKEN_BUDGET']
    ? parseInt(process.env['E2E_TOKEN_BUDGET'], 10)
    : 100_000;
  const utilization = cumulative.totalTokens > 0
    ? ((cumulative.totalTokens / budget) * 100).toFixed(1)
    : '0.0';
  lines.push(`  Budget used:     ${cumulative.totalTokens.toLocaleString()} / ${budget.toLocaleString()} (${utilization}%)`);

  lines.push('');
  lines.push(separator);
  lines.push('');

  console.log(lines.join('\n'));
}
