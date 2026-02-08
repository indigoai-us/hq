#!/usr/bin/env node
/**
 * Process Playwright Test Results into Agent-Friendly Format (Reusable Template)
 *
 * Transforms the verbose Playwright test-results.json into a structured,
 * agent-parseable agent-results.json summary. This makes it easy for AI agents
 * (or CI scripts) to understand test outcomes without parsing Playwright's
 * deeply nested output format.
 *
 * SETUP:
 *   1. Copy this file into your project's scripts/ directory
 *   2. Ensure playwright.config.ts includes the json reporter:
 *      reporter: [['json', { outputFile: 'test-results.json' }]]
 *   3. Run after tests: node scripts/process-results.js
 *
 * Usage:
 *   node scripts/process-results.js [input-file] [output-file]
 *
 *   Defaults:
 *     input-file  = test-results.json
 *     output-file = agent-results.json
 *
 * Output schema:
 * {
 *   summary: { total, passed, failed, skipped, flaky, duration },
 *   status: "passed" | "failed",
 *   failures: [{ test, suite, file, line, error, screenshot, trace, video }],
 *   passed: [{ test, suite, file, duration, retries, flaky }],
 *   skipped: [{ test, suite, file }],
 *   artifacts: { screenshots: [], traces: [], videos: [] },
 *   meta: { timestamp, baseUrl, executionMode, playwrightVersion }
 * }
 *
 * CUSTOMIZE: Extend the output schema by modifying processResults() below.
 * For example, add custom metadata fields in the meta object, or add
 * additional categorization logic for your project's test organization.
 */

const fs = require('fs');
const path = require('path');

// CUSTOMIZE: Change default file paths if your project uses different locations
const inputFile = process.argv[2] || 'test-results.json';
const outputFile = process.argv[3] || 'agent-results.json';

function processResults(results) {
  const output = {
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      duration: 0,
    },
    status: 'passed',
    failures: [],
    passed: [],
    skipped: [],
    artifacts: {
      screenshots: [],
      traces: [],
      videos: [],
    },
    meta: {
      timestamp: new Date().toISOString(),
      // CUSTOMIZE: Change BASE_URL env var name if your project uses a different one
      baseUrl: process.env.BASE_URL || 'unknown',
      executionMode: process.env.USE_BROWSERBASE === 'true' ? 'browserbase' : 'local',
      playwrightVersion: results.config?.version || 'unknown',
    },
  };

  // Process all suites recursively to flatten the nested Playwright structure
  function processSuite(suite, filePath = '') {
    const currentFile = suite.file || filePath;

    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        output.summary.total++;

        const testInfo = {
          test: spec.title,
          suite: suite.title,
          file: currentFile,
          line: spec.line,
          column: spec.column,
        };

        // Get the final result (last retry attempt)
        const results = test.results || [];
        const finalResult = results[results.length - 1];

        if (!finalResult) {
          output.summary.skipped++;
          output.skipped.push(testInfo);
          continue;
        }

        // Calculate total duration across all retries
        const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
        testInfo.duration = totalDuration;
        testInfo.retries = results.length - 1;

        switch (finalResult.status) {
          case 'passed':
            output.summary.passed++;
            output.passed.push(testInfo);

            // Mark as flaky if it passed after a previous failure
            if (results.length > 1 && results.some((r) => r.status === 'failed')) {
              output.summary.flaky++;
              testInfo.flaky = true;
            }
            break;

          case 'failed':
          case 'timedOut':
            output.summary.failed++;
            output.status = 'failed';

            // Extract structured error details for agent consumption
            const error = finalResult.error || {};
            const failureInfo = {
              ...testInfo,
              status: finalResult.status,
              error: {
                message: error.message || 'Unknown error',
                stack: error.stack || null,
                snippet: error.snippet || null,
              },
            };

            // Extract attachments (screenshots, traces, videos) for debugging
            for (const attachment of finalResult.attachments || []) {
              const artifactPath = attachment.path;
              if (!artifactPath) continue;

              const relativePath = path.relative(process.cwd(), artifactPath);

              if (attachment.name === 'screenshot' || attachment.contentType?.startsWith('image/')) {
                failureInfo.screenshot = relativePath;
                output.artifacts.screenshots.push({
                  test: spec.title,
                  path: relativePath,
                });
              } else if (attachment.name === 'trace' || attachment.path?.endsWith('.zip')) {
                failureInfo.trace = relativePath;
                output.artifacts.traces.push({
                  test: spec.title,
                  path: relativePath,
                });
              } else if (attachment.name === 'video' || attachment.contentType?.startsWith('video/')) {
                failureInfo.video = relativePath;
                output.artifacts.videos.push({
                  test: spec.title,
                  path: relativePath,
                });
              }
            }

            output.failures.push(failureInfo);
            break;

          case 'skipped':
            output.summary.skipped++;
            output.skipped.push(testInfo);
            break;
        }
      }
    }

    // Recurse into nested suites (Playwright nests suites for describe blocks)
    for (const childSuite of suite.suites || []) {
      processSuite(childSuite, currentFile);
    }
  }

  // Process all top-level suites (one per test file)
  for (const suite of results.suites || []) {
    processSuite(suite);
  }

  // Total wall-clock duration from Playwright stats
  output.summary.duration = results.stats?.duration || 0;

  return output;
}

// Main execution
try {
  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    console.error('Make sure playwright.config.ts includes: reporter: [[\'json\', { outputFile: \'test-results.json\' }]]');
    process.exit(1);
  }

  const rawResults = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const processed = processResults(rawResults);

  fs.writeFileSync(outputFile, JSON.stringify(processed, null, 2));

  // Print summary to stdout for CI visibility
  console.log('\n=== E2E Test Results (Agent Summary) ===');
  console.log(`Status: ${processed.status.toUpperCase()}`);
  console.log(`Total: ${processed.summary.total}`);
  console.log(`Passed: ${processed.summary.passed}`);
  console.log(`Failed: ${processed.summary.failed}`);
  console.log(`Skipped: ${processed.summary.skipped}`);
  console.log(`Flaky: ${processed.summary.flaky}`);
  console.log(`Duration: ${processed.summary.duration}ms`);

  if (processed.failures.length > 0) {
    console.log('\n--- Failures ---');
    for (const failure of processed.failures) {
      console.log(`\n[FAIL] ${failure.suite} > ${failure.test}`);
      console.log(`  File: ${failure.file}:${failure.line}`);
      console.log(`  Error: ${failure.error.message.split('\n')[0]}`);
      if (failure.screenshot) {
        console.log(`  Screenshot: ${failure.screenshot}`);
      }
      if (failure.trace) {
        console.log(`  Trace: ${failure.trace}`);
      }
    }
  }

  console.log(`\nAgent-friendly results written to: ${outputFile}`);

  // Exit with appropriate code so CI pipelines can detect failures
  process.exit(processed.status === 'passed' ? 0 : 1);
} catch (error) {
  console.error('Error processing results:', error.message);
  process.exit(1);
}
