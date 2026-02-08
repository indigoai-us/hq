# E2E Cloud Testing Workflow

Complete guide for agents to write, run, and debug E2E tests using HQ's cloud testing infrastructure.

## Quick Start

```bash
# Run tests locally against production
cd tests/e2e
npm test

# Run tests against custom URL
BASE_URL=https://my-preview-url.vercel.app npm test

# Run via GitHub Actions (automatic on push)
git push origin feature/my-branch
```

## How Tests Run in CI

Every push to a non-main branch triggers this workflow:

```
Push -> Deploy to Vercel Preview -> Wait for Ready -> Run Playwright Tests -> Report Results
```

### Workflow Components

1. **Vercel Preview Deployment**: Deploys your branch to a unique preview URL
2. **Wait for Ready**: Polls deployment until HTTP 200 (max 5 minutes)
3. **Playwright Tests**: Runs test suite against preview URL
4. **Browserbase (optional)**: Executes tests in cloud browsers with session recordings
5. **Artifacts**: Uploads screenshots, traces, and HTML report

### Triggering Tests

| Trigger | Description |
|---------|-------------|
| `git push` | Automatic on any branch except main |
| Pull Request | Runs when PR opened/updated against main |
| Manual | Actions > E2E Tests > Run workflow |

### Manual Workflow Options

1. Go to **Actions** > **E2E Tests** > **Run workflow**
2. Options:
   - **preview_url**: Custom URL (leave empty for auto-deploy)
   - **debug**: Enable headed mode with slowmo
   - **use_browserbase**: Force local execution if false

## Viewing Test Results

### GitHub Actions UI

1. Go to **Actions** tab
2. Select the workflow run
3. View **Summary** for pass/fail counts
4. Check **Artifacts** section for detailed results

### Artifacts Available

| Artifact | Contents | When Uploaded |
|----------|----------|---------------|
| `e2e-results-json` | test-results.json, test-output.txt | Always |
| `e2e-report-html` | Interactive HTML report | Always |
| `e2e-failures` | Screenshots, traces, videos | On failure |

### Downloading Artifacts via CLI

```bash
# List workflow runs
gh run list --workflow=e2e.yml --limit=5

# Download artifacts from specific run
gh run download <run-id> -n e2e-results-json

# Download all artifacts from latest run
gh run download $(gh run list --workflow=e2e.yml --limit=1 --json databaseId -q '.[0].databaseId')

# View test results JSON
cat e2e-results-json/test-results.json | jq '.suites[].specs[].title'
```

### PR Comments

For pull requests, test results are posted as a comment:
- Pass/fail status
- Test counts (total, passed, failed)
- Preview URL
- Link to artifacts for debugging

## Interpreting Test Failures

### Reading test-results.json

```bash
# Get failed test names
jq -r '[.suites[].specs[] | select(.tests[].results[].status == "failed") | .title] | unique | .[]' test-results.json

# Get error messages
jq -r '.suites[].specs[].tests[].results[] | select(.status == "failed") | .error.message' test-results.json

# Get stack traces
jq -r '.suites[].specs[].tests[].results[] | select(.status == "failed") | .error.stack' test-results.json
```

### Debugging with Screenshots

Failed tests capture screenshots automatically:

```bash
# Extract screenshot info
gh run download <run-id> -n e2e-failures
ls e2e-failures/  # Contains screenshots and traces
```

### Debugging with Traces

Playwright traces provide step-by-step execution replay:

```bash
# View trace locally
npx playwright show-trace e2e-failures/tests/test-results/trace.zip
```

### Browserbase Session Recordings

When using Browserbase:
1. Check workflow output for session ID
2. Visit: `https://browserbase.com/sessions/{sessionId}`
3. Watch video replay, view network requests, console logs

## Writing Tests

### Choose Your Template

| App Type | Template |
|----------|----------|
| Next.js/React web app | [nextjs-webapp.md](templates/nextjs-webapp.md) |
| CLI with browser OAuth | [cli-browser-oauth.md](templates/cli-browser-oauth.md) |
| REST API | [api-endpoints.md](templates/api-endpoints.md) |

### Test File Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do expected behavior', async ({ page }) => {
    // Navigate
    await page.goto('/');

    // Interact
    await page.click('[data-testid="button"]');

    // Assert
    await expect(page.locator('h1')).toContainText('Expected');
  });
});
```

### Key Patterns

```typescript
// Wait for element to be visible
await expect(page.locator('[data-testid="loading"]')).toBeHidden();
await expect(page.locator('[data-testid="content"]')).toBeVisible();

// Click and wait for navigation
await Promise.all([
  page.waitForURL('**/dashboard'),
  page.click('[data-testid="login-button"]'),
]);

// Fill form
await page.fill('[data-testid="email"]', 'test@example.com');
await page.fill('[data-testid="password"]', 'password123');
await page.click('[data-testid="submit"]');

// Assert API response
const response = await page.waitForResponse('**/api/users');
expect(response.status()).toBe(200);

// Screenshot for debugging
await page.screenshot({ path: 'debug.png' });
```

### Running Tests Locally

```bash
cd tests/e2e

# All tests
npm test

# Specific test file
npm test tests/landing-page.spec.ts

# Debug mode (headed browser)
npm run test:debug

# With UI mode
npx playwright test --ui

# Against custom URL
BASE_URL=https://my-app.vercel.app npm test
```

## Infrastructure Components

### Vercel Preview Deployments

Every branch push creates a preview deployment:
- **URL pattern**: `https://{project}-{hash}-{team}.vercel.app`
- **Auto-expires**: Based on team settings (180 days default)
- **Configuration**: See [vercel-preview-deployments.md](vercel-preview-deployments.md)

### Browserbase Cloud Execution

Optional cloud browser infrastructure:
- **Benefits**: No local browsers, parallel execution, session recordings
- **Fallback**: If unavailable, tests run locally
- **Configuration**: See [browserbase-integration.md](browserbase-integration.md)

### GitHub Actions Workflow

Workflow file: `.github/workflows/e2e.yml`

Key environment variables:
- `BASE_URL`: Preview deployment URL
- `BROWSERBASE_API_KEY`: For cloud execution
- `BROWSERBASE_PROJECT_ID`: For cloud execution
- `VERCEL_TOKEN`: For deploying previews

## Required Secrets

Add these secrets to your GitHub repository (**Settings > Secrets and variables > Actions**):

| Secret | Required | Purpose |
|--------|----------|---------|
| `VERCEL_TOKEN` | Yes | Deploy preview environments |
| `BROWSERBASE_API_KEY` | No | Cloud browser execution |
| `BROWSERBASE_PROJECT_ID` | No | Cloud browser execution |

### Getting VERCEL_TOKEN

1. Go to [vercel.com/account/tokens](https://vercel.com/account/tokens)
2. Create token with "Full Account" scope
3. Add to GitHub secrets

### Getting Browserbase Credentials

1. Sign up at [browserbase.com](https://browserbase.com)
2. Get API key from Overview Dashboard
3. Get Project ID from Overview Dashboard
4. Add both to GitHub secrets

## Common Workflows

### After Writing Code

1. Write or update E2E tests
2. Run locally: `npm test`
3. Fix any failures
4. Push to branch
5. Check GitHub Actions for CI results

### Debugging CI Failures

1. Check workflow summary for pass/fail status
2. Download `e2e-failures` artifact
3. Review screenshots and traces
4. If using Browserbase, watch session recording
5. Reproduce locally: `BASE_URL=<preview-url> npm test`

### Reviewing PR

1. Check PR comment for test results
2. Click preview URL to manually verify
3. Download artifacts if tests failed
4. Request changes if E2E tests don't pass

## Troubleshooting

### Tests Pass Locally but Fail in CI

| Cause | Solution |
|-------|----------|
| Different BASE_URL | Check preview URL is correct |
| Timing issues | Add explicit waits (`await expect(...).toBeVisible()`) |
| Missing data | Ensure test data setup runs before tests |
| Network latency | Increase timeouts for cloud execution |

### Deployment Not Ready

If tests fail with "deployment not ready":
- Check Vercel dashboard for build errors
- Verify VERCEL_TOKEN is valid
- Check `vercel.json` configuration

### Browserbase Connection Failed

If Browserbase connection fails:
- Tests automatically fall back to local Playwright
- Check BROWSERBASE_API_KEY is valid
- Verify BROWSERBASE_PROJECT_ID matches your project
- Check rate limits (429 errors)

### Can't Find Element

```bash
# Debug locally with inspector
npx playwright test --debug

# Check if element is rendered
await page.content()  // Print full HTML

# Use more specific selector
await page.locator('[data-testid="unique-id"]')  // Preferred
await page.locator('button:has-text("Submit")')  // Text-based
await page.getByRole('button', { name: 'Submit' })  // Accessibility
```

## gh CLI Quick Reference

```bash
# List recent workflow runs
gh run list --workflow=e2e.yml --limit=10

# View run details
gh run view <run-id>

# Watch run in progress
gh run watch <run-id>

# Download all artifacts
gh run download <run-id>

# Download specific artifact
gh run download <run-id> -n e2e-results-json

# Re-run failed jobs
gh run rerun <run-id> --failed

# Trigger manual run
gh workflow run e2e.yml -f preview_url=https://custom.vercel.app

# Get latest run ID
gh run list --workflow=e2e.yml --limit=1 --json databaseId -q '.[0].databaseId'
```

## Agent-Friendly Test Results

The E2E workflow produces an `agent-results.json` file designed for easy machine parsing.

### Download and Parse Results

```bash
# Get latest run ID
RUN_ID=$(gh run list --workflow=e2e.yml --limit=1 --json databaseId -q '.[0].databaseId')

# Download agent-friendly results
gh run download $RUN_ID -n e2e-results-json
cd e2e-results-json

# Quick status check
jq '.status' agent-results.json
# Output: "passed" or "failed"

# Get summary counts
jq '.summary' agent-results.json
# Output: {"total":21,"passed":21,"failed":0,"skipped":0,"flaky":0,"duration":4523}
```

### Parsing Failures

```bash
# List all failed tests
jq -r '.failures[] | "\(.suite) > \(.test)"' agent-results.json

# Get failure details with error messages
jq '.failures[] | {test: .test, file: "\(.file):\(.line)", error: .error.message}' agent-results.json

# Get screenshot paths for failed tests
jq -r '.failures[] | select(.screenshot) | "\(.test): \(.screenshot)"' agent-results.json

# Get trace paths for debugging
jq -r '.failures[] | select(.trace) | "\(.test): \(.trace)"' agent-results.json

# Full stack traces
jq -r '.failures[] | "=== \(.test) ===\n\(.error.stack // "no stack")\n"' agent-results.json
```

### Parsing Passed Tests

```bash
# List all passed tests
jq -r '.passed[] | "\(.suite) > \(.test)"' agent-results.json

# Find flaky tests (passed after retry)
jq -r '.passed[] | select(.flaky) | "\(.test) (retries: \(.retries))"' agent-results.json

# Slowest tests
jq -r '[.passed[] | {test: .test, duration: .duration}] | sort_by(.duration) | reverse | .[:5]' agent-results.json
```

### Download Failure Artifacts

```bash
# Download screenshots, traces, videos (only uploaded on failure)
gh run download $RUN_ID -n e2e-failures

# List downloaded artifacts
ls -la e2e-failures/

# View trace locally
npx playwright show-trace e2e-failures/*/trace.zip
```

### Agent-Results.json Schema

```json
{
  "summary": {
    "total": 21,
    "passed": 20,
    "failed": 1,
    "skipped": 0,
    "flaky": 0,
    "duration": 4523
  },
  "status": "failed",
  "failures": [
    {
      "test": "page loads with correct title",
      "suite": "Landing Page",
      "file": "tests/landing-page.spec.ts",
      "line": 26,
      "column": 3,
      "duration": 5000,
      "retries": 2,
      "status": "failed",
      "error": {
        "message": "Expected: 'HQ - Download'\nReceived: 'HQ'",
        "stack": "Error: expect(received).toHaveTitle(expected)...",
        "snippet": null
      },
      "screenshot": "test-results/Landing-Page-page-loads-with-correct-title/test-failed-1.png",
      "trace": "test-results/Landing-Page-page-loads-with-correct-title/trace.zip",
      "video": null
    }
  ],
  "passed": [
    {
      "test": "displays logo and tagline",
      "suite": "Landing Page",
      "file": "tests/landing-page.spec.ts",
      "line": 30,
      "duration": 1234,
      "retries": 0
    }
  ],
  "skipped": [],
  "artifacts": {
    "screenshots": [{"test": "page loads with correct title", "path": "..."}],
    "traces": [{"test": "page loads with correct title", "path": "..."}],
    "videos": []
  },
  "meta": {
    "timestamp": "2026-02-01T12:00:00Z",
    "baseUrl": "https://{project}-abc123.vercel.app",
    "executionMode": "browserbase",
    "playwrightVersion": "1.51.0"
  }
}
```

### One-Liner for Agents

```bash
# Complete failure check in one command
gh run download $(gh run list --workflow=e2e.yml --limit=1 --json databaseId -q '.[0].databaseId') -n e2e-results-json && \
jq -e '.status == "passed"' e2e-results-json/agent-results.json || \
jq '.failures[] | {test: .test, error: .error.message}' e2e-results-json/agent-results.json
```

## Branch Protection & Quality Gates

### Required Status Checks

The `main` branch is protected with required status checks:

| Check | Required | Description |
|-------|----------|-------------|
| `Run E2E Tests` | Yes | Playwright E2E test suite must pass |

PRs cannot be merged until the E2E Tests workflow completes successfully.

### Verifying Protection Status

```bash
# Check branch protection rules
gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks --jq '{strict, contexts}'

# Example output:
# {"strict":true,"contexts":["Run E2E Tests"]}
```

### Merge Blocked Indicator

When E2E tests fail:
- Merge button shows "Merge blocked" with red X
- Required status check shows "Run E2E Tests -- Failing"
- PR comment includes failure details and artifact links

### Emergency Override (Admin Only)

**IMPORTANT:** Skipping E2E tests should be extremely rare. Before overriding, consider:
1. Can you fix the test quickly?
2. Is the failure a flaky test vs. real regression?
3. Is this a critical hotfix that can't wait?

**To bypass for a single PR:**

1. Go to repository **Settings** > **Branches** > **main** protection rule
2. Temporarily enable "Allow specified actors to bypass required pull requests"
3. Add yourself as a bypass actor
4. Merge the PR
5. **IMMEDIATELY** revert the bypass setting

**Alternative: Admin merge (if enforce_admins=false):**

```bash
# Check if admin enforcement is enabled
gh api repos/{owner}/{repo}/branches/main/protection/enforce_admins --jq '.enabled'

# If false, admins can merge without passing checks via:
# Repository Settings > Branch protection > Uncheck "Include administrators"
```

**AUDIT REQUIREMENT:** When bypassing:
1. Document in PR comment why override was necessary
2. Create follow-up issue to fix the failing test
3. Notify team via standard communication channel

### Configuring Protection for New Repos

```bash
# Set up branch protection with E2E requirement
gh api repos/{owner}/{repo}/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  --input - << 'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Run E2E Tests"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null
}
EOF
```

**Parameters explained:**
- `strict: true` - Requires branch to be up-to-date with base before merging
- `contexts: ["Run E2E Tests"]` - The job name from e2e.yml workflow
- `enforce_admins: false` - Allows admin override in emergencies
- `required_approving_review_count: 0` - No PR reviews required (adjust per team policy)

## Related Documentation

- [Vercel Preview Deployments](vercel-preview-deployments.md) - Preview URL configuration
- [Browserbase Integration](browserbase-integration.md) - Cloud browser setup
- [E2E Templates](templates/README.md) - Test patterns by app type
