# run-tests

Run test suite and report results. Supports local execution and CI execution via GitHub Actions.

## Arguments

`$ARGUMENTS` = `--suite <name>` or `--file <path>` (optional)

Optional:
- `--repo <path>` - Target repository
- `--type <unit|e2e|all>` - Test type (default: all)
- `--watch` - Watch mode (local only)
- `--mode <local|ci>` - Execution mode (default: ci for E2E, local for unit)
- `--preview-url <url>` - Custom preview URL for CI execution
- `--wait` - Wait for CI run to complete and download results (default: true)

## Process

### Mode Detection

Determine execution mode based on test type and arguments:

1. If `--mode ci` or `--type e2e` (without `--mode local`): use CI execution
2. If `--mode local` or `--type unit`: use local execution
3. Default for E2E: CI execution (prefer cloud over local)
4. Default for unit/integration: local execution

### Local Execution

1. Detect test framework (Jest, Vitest, Playwright)
2. Run specified tests
3. Capture results
4. Format report
5. Surface failures with context

### CI Execution (GitHub Actions)

For E2E tests, prefer CI execution via the `e2e.yml` GitHub Actions workflow.

#### Step 1: Trigger Workflow

```bash
# Trigger with default settings (uses latest push deployment)
gh workflow run e2e.yml

# Trigger with custom preview URL
gh workflow run e2e.yml -f preview_url=https://custom-preview.vercel.app

# Trigger with debug mode
gh workflow run e2e.yml -f debug=true

# Trigger with specific test directory
gh workflow run e2e.yml -f test_dir=tests/e2e
```

#### Step 2: Wait for Completion

```bash
# Get the run ID (wait a moment for it to register)
sleep 5
RUN_ID=$(gh run list --workflow=e2e.yml --limit=1 --json databaseId -q '.[0].databaseId')

# Watch the run in real-time
gh run watch $RUN_ID
```

#### Step 3: Download Results

```bash
# Download agent-friendly results
gh run download $RUN_ID -n e2e-results-json

# Download failure artifacts (screenshots, traces, videos)
gh run download $RUN_ID -n e2e-failures 2>/dev/null || echo "No failure artifacts (tests may have passed)"

# Download HTML report
gh run download $RUN_ID -n e2e-report-html 2>/dev/null || echo "No HTML report"
```

#### Step 4: Parse agent-results.json

```bash
# Quick status check
jq '.status' e2e-results-json/agent-results.json

# Summary counts
jq '.summary' e2e-results-json/agent-results.json

# List failed tests
jq -r '.failures[] | "\(.suite) > \(.test)"' e2e-results-json/agent-results.json

# Get failure details with error messages
jq '.failures[] | {test: .test, file: "\(.file):\(.line)", error: .error.message}' e2e-results-json/agent-results.json

# Get screenshot paths for failed tests
jq -r '.failures[] | select(.screenshot) | "\(.test): \(.screenshot)"' e2e-results-json/agent-results.json

# Get trace paths for debugging
jq -r '.failures[] | select(.trace) | "\(.test): \(.trace)"' e2e-results-json/agent-results.json

# Find flaky tests
jq -r '.passed[] | select(.flaky) | "\(.test) (retries: \(.retries))"' e2e-results-json/agent-results.json

# Check execution mode (browserbase vs local)
jq -r '.meta.executionMode' e2e-results-json/agent-results.json

# Get the URL tests ran against
jq -r '.meta.baseUrl' e2e-results-json/agent-results.json
```

#### Step 5: Debug Failures (if any)

```bash
# View Browserbase session recordings (if cloud execution)
# Session URLs are in the GitHub Actions step summary

# View Playwright traces locally
npx playwright show-trace e2e-failures/*/trace.zip

# Reproduce locally against the same preview URL
BASE_URL=$(jq -r '.meta.baseUrl' e2e-results-json/agent-results.json)
cd tests/e2e && BASE_URL=$BASE_URL npm test
```

### Complete CI One-Liner

```bash
# Trigger, wait, download, and check results
gh workflow run e2e.yml && \
sleep 5 && \
RUN_ID=$(gh run list --workflow=e2e.yml --limit=1 --json databaseId -q '.[0].databaseId') && \
gh run watch $RUN_ID && \
gh run download $RUN_ID -n e2e-results-json && \
jq -r '"Status: \(.status)\nTotal: \(.summary.total) | Passed: \(.summary.passed) | Failed: \(.summary.failed) | Flaky: \(.summary.flaky)"' e2e-results-json/agent-results.json
```

## Output

### Local Execution Report

```
42 passed
2 failed
3 skipped

Failed tests:
1. src/api/auth.test.ts:42 - login should return token
   Error: Expected 200, got 401

2. src/components/Button.test.tsx:18 - renders correctly
   Error: Snapshot mismatch
```

### CI Execution Report

```
CI Run: #12345 (https://github.com/owner/repo/actions/runs/12345)
Execution Mode: browserbase (cloud)
Preview URL: https://project-abc123-team.vercel.app

Status: passed
Total: 21 | Passed: 21 | Failed: 0 | Skipped: 0 | Flaky: 0
Duration: 4523ms

Session Recordings: https://browserbase.com/sessions/{sessionId}
```

### CI Failure Report

```
CI Run: #12346 (https://github.com/owner/repo/actions/runs/12346)
Execution Mode: browserbase (cloud)
Preview URL: https://project-def456-team.vercel.app

Status: failed
Total: 21 | Passed: 20 | Failed: 1 | Skipped: 0 | Flaky: 0

Failed Tests:
1. Landing Page > page loads with correct title
   File: tests/landing-page.spec.ts:26
   Error: Expected 'HQ - Download', Received 'HQ'
   Screenshot: test-results/Landing-Page-page-loads-with-correct-title/test-failed-1.png
   Trace: test-results/Landing-Page-page-loads-with-correct-title/trace.zip
   Session: https://browserbase.com/sessions/abc123

Debug locally:
  BASE_URL=https://project-def456-team.vercel.app npm test tests/landing-page.spec.ts
```

## Rules

- Prefer CI execution over local for E2E tests
- Always download and parse `agent-results.json` after CI runs (not raw `test-results.json`)
- When CI tests fail, include Browserbase session recording URL if available
- When reporting failures, include the file:line location, error message, and available artifacts
- For flaky tests, report retry count and flag for investigation
- Always report the preview URL that tests ran against
