# E2E Testing Templates: Playwright + Browserbase

Reusable templates for setting up E2E tests with Playwright and optional Browserbase cloud browser execution. Copy these files into any project to get a working test setup with cloud and local execution modes.

## Files

| File | Purpose |
|------|---------|
| `browserbase.ts` | Playwright fixture that connects to Browserbase cloud browsers via CDP. Falls back to local Playwright automatically when credentials are missing or connection fails. Import `{ test, expect }` from this file instead of `@playwright/test`. |
| `playwright.config.ts` | Playwright configuration with Browserbase auto-detection, CI-aware settings, and multiple reporters (list + html + json). Adjust timeouts, workers, and base URL for your project. |
| `package.json` | Minimal dependencies template with npm scripts for local, cloud, debug, and agent-mode test execution. |
| `../scripts/process-results.js` | Transforms Playwright's verbose `test-results.json` into `agent-results.json` -- a flat, structured summary that AI agents can parse easily. Includes failure details, artifact paths, and execution metadata. |

## Quick Start

1. Copy the template files into your project:

```bash
# From your project root
mkdir -p tests/e2e/fixtures tests/e2e/scripts

cp knowledge/testing/templates/fixtures/browserbase.ts   tests/e2e/fixtures/
cp knowledge/testing/templates/fixtures/playwright.config.ts tests/e2e/
cp knowledge/testing/templates/fixtures/package.json     tests/e2e/
cp knowledge/testing/templates/scripts/process-results.js tests/e2e/scripts/
```

2. Install dependencies:

```bash
cd tests/e2e
npm install
npx playwright install chromium
```

3. Write your first test (import from the fixture, not from `@playwright/test`):

```typescript
// tests/e2e/tests/example.spec.ts
import { test, expect } from '../fixtures/browserbase';

test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/My App/);
});
```

4. Run tests:

```bash
# Local execution (default)
npm test

# Force local even if Browserbase env vars are set
npm run test:local

# Cloud execution via Browserbase
BROWSERBASE_API_KEY=xxx BROWSERBASE_PROJECT_ID=yyy npm run test:browserbase

# Agent mode: runs tests + generates agent-results.json
npm run test:agent
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | No | Target application URL (default: `http://localhost:3000`) |
| `BROWSERBASE_API_KEY` | For cloud | API key from Browserbase dashboard |
| `BROWSERBASE_PROJECT_ID` | For cloud | Project ID from Browserbase dashboard |
| `USE_BROWSERBASE` | No | `'true'` to force cloud, `'false'` to force local |
| `CI` | Auto | Set by CI providers; enables stricter settings |

## Customization Points

All template files contain `// CUSTOMIZE:` comments marking the spots you should adjust for your project:

- **Viewport size** -- `browserbase.ts` (3 locations) and `playwright.config.ts`
- **Base URL** -- `playwright.config.ts` default value
- **Timeouts** -- `playwright.config.ts` (global, expect, action, navigation)
- **Worker count** -- `playwright.config.ts` (Browserbase concurrent sessions)
- **Retry count** -- `playwright.config.ts` (CI retries)
- **Browser projects** -- `playwright.config.ts` (uncomment Firefox/WebKit)
- **Result file paths** -- `process-results.js` (input/output filenames)
- **Meta fields** -- `process-results.js` (add custom metadata)

## Execution Modes

### Local (default)
Uses Playwright's built-in Chromium. No external dependencies needed beyond `@playwright/test`. Tests run on the machine executing them.

### Browserbase (cloud)
Connects to Browserbase's cloud browser infrastructure via Chrome DevTools Protocol (CDP). Each test gets a dedicated browser session with full recording. Session replay URLs are logged to console and stored in test annotations.

### Fallback behavior
The fixture gracefully falls back to local execution when:
- Browserbase credentials are not set
- `@browserbasehq/sdk` is not installed
- Browserbase connection fails (network issues, quota exceeded, etc.)

This means tests never fail due to Browserbase infrastructure issues -- they just run locally instead.

## Agent Results Format

The `process-results.js` script produces `agent-results.json` with this structure:

```json
{
  "summary": { "total": 10, "passed": 9, "failed": 1, "skipped": 0, "flaky": 0, "duration": 45000 },
  "status": "failed",
  "failures": [{ "test": "login works", "file": "tests/auth.spec.ts", "error": { "message": "..." } }],
  "passed": [{ "test": "homepage loads", "file": "tests/home.spec.ts", "duration": 2000 }],
  "artifacts": { "screenshots": [], "traces": [], "videos": [] },
  "meta": { "timestamp": "...", "baseUrl": "...", "executionMode": "local" }
}
```
