#!/usr/bin/env node
/**
 * Process Playwright test results into agent-friendly format.
 *
 * Transforms the verbose test-results.json into a structured summary
 * that agents can easily parse to understand test outcomes.
 *
 * Usage:
 *   node scripts/process-results.js [test-results.json] [output.json]
 *
 * Output format:
 * {
 *   summary: { total, passed, failed, skipped, duration },
 *   status: "passed" | "failed",
 *   failures: [{ test, file, line, error, screenshot, trace }],
 *   passed: [{ test, file, duration }],
 *   artifacts: { screenshots: [], traces: [], videos: [] },
 *   meta: { timestamp, baseUrl, executionMode }
 * }
 */

const fs = require('fs');
const path = require('path');

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
      baseUrl: process.env.BASE_URL || 'unknown',
      executionMode: process.env.USE_BROWSERBASE === 'true' ? 'browserbase' : 'local',
      playwrightVersion: results.config?.version || 'unknown',
    },
  };

  // Process all suites recursively
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

        // Get the final result (last retry)
        const results = test.results || [];
        const finalResult = results[results.length - 1];

        if (!finalResult) {
          output.summary.skipped++;
          output.skipped.push(testInfo);
          continue;
        }

        // Calculate duration across all retries
        const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
        testInfo.duration = totalDuration;
        testInfo.retries = results.length - 1;

        switch (finalResult.status) {
          case 'passed':
            output.summary.passed++;
            output.passed.push(testInfo);

            // Check if flaky (passed after retry)
            if (results.length > 1 && results.some((r) => r.status === 'failed')) {
              output.summary.flaky++;
              testInfo.flaky = true;
            }
            break;

          case 'failed':
          case 'timedOut':
            output.summary.failed++;
            output.status = 'failed';

            // Extract error details
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

            // Extract attachments (screenshots, traces, videos)
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

    // Process nested suites
    for (const childSuite of suite.suites || []) {
      processSuite(childSuite, currentFile);
    }
  }

  // Process all top-level suites
  for (const suite of results.suites || []) {
    processSuite(suite);
  }

  // Calculate total duration
  output.summary.duration = results.stats?.duration || 0;

  return output;
}

// Main
try {
  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
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

  // Exit with appropriate code
  process.exit(processed.status === 'passed' ? 0 : 1);
} catch (error) {
  console.error('Error processing results:', error.message);
  process.exit(1);
}
