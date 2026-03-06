# Next.js Web App E2E Testing Template

Template for writing comprehensive E2E tests for Next.js web applications using Playwright.

## Prerequisites

- Playwright installed (`npm install -D @playwright/test`)
- Vercel preview deployment or local dev server
- Browserbase credentials (optional, for cloud execution)

## Directory Structure

```
project/
├── tests/
│   └── e2e/
│       ├── playwright.config.ts
│       ├── fixtures/
│       │   └── browserbase.ts     # Optional: Browserbase fixture
│       └── tests/
│           ├── page-name.spec.ts
│           └── feature-name.spec.ts
```

## Setup

### 1. Install Dependencies

```bash
cd tests/e2e
npm init -y
npm install -D @playwright/test
npm install -D @browserbasehq/sdk  # Optional: for cloud execution
```

### 2. playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

const useBrowserbase = process.env.USE_BROWSERBASE !== 'false' &&
  !!process.env.BROWSERBASE_API_KEY &&
  !!process.env.BROWSERBASE_PROJECT_ID;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: useBrowserbase ? 4 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
  ],
  timeout: useBrowserbase ? 60000 : 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    actionTimeout: useBrowserbase ? 15000 : 10000,
    navigationTimeout: useBrowserbase ? 30000 : 15000,
  },
  outputDir: 'test-results/',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

### 3. package.json Scripts

```json
{
  "scripts": {
    "test": "npx playwright test",
    "test:local": "USE_BROWSERBASE=false npx playwright test",
    "test:browserbase": "npx playwright test",
    "test:headed": "npx playwright test --headed",
    "test:debug": "npx playwright test --debug",
    "test:ui": "npx playwright test --ui",
    "report": "npx playwright show-report"
  }
}
```

## Common Patterns

### Basic Page Test

```typescript
import { test, expect } from '@playwright/test';

test.describe('Page Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/path');
  });

  test('page loads correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Expected Title/);
  });

  test('displays expected content', async ({ page }) => {
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Expected Heading');
  });
});
```

### Navigation Testing

```typescript
test('navigation works correctly', async ({ page }) => {
  await page.goto('/');

  // Click navigation link
  await page.locator('nav a[href="/about"]').click();

  // Wait for navigation
  await page.waitForURL('/about');

  // Verify new page content
  await expect(page.locator('h1')).toHaveText('About');
});
```

### Form Submission

```typescript
test('form submission works', async ({ page }) => {
  await page.goto('/contact');

  // Fill form fields
  await page.locator('#name').fill('John Doe');
  await page.locator('#email').fill('john@example.com');
  await page.locator('#message').fill('Test message');

  // Submit form
  await page.locator('button[type="submit"]').click();

  // Wait for success state
  await expect(page.locator('.success-message')).toBeVisible();
  await expect(page.locator('.success-message')).toHaveText(/Thank you/);
});
```

### Interactive Components (Accordion, Modal, Dropdown)

```typescript
test.describe('Accordion', () => {
  test('expands and collapses on click', async ({ page }) => {
    await page.goto('/');

    const trigger = page.locator('.accordion-trigger').first();
    const content = page.locator('.accordion-content').first();

    // Initially hidden
    await expect(content).toBeHidden();

    // Expand
    await trigger.click();
    await expect(content).toBeVisible();

    // Collapse
    await trigger.click();
    await expect(content).toBeHidden();
  });
});

test.describe('Modal', () => {
  test('opens and closes correctly', async ({ page }) => {
    await page.goto('/');

    // Open modal
    await page.locator('[data-testid="open-modal"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Close with X button
    await page.locator('[aria-label="Close"]').click();
    await expect(page.locator('[role="dialog"]')).toBeHidden();
  });
});
```

### Authentication Flow

```typescript
test.describe('Authentication', () => {
  test('login with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill('user@example.com');
    await page.locator('#password').fill('password123');
    await page.locator('button[type="submit"]').click();

    // Wait for redirect to dashboard
    await page.waitForURL('/dashboard');
    await expect(page.locator('.user-profile')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill('user@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('.error-message')).toHaveText(/Invalid/);
  });
});
```

### Data Loading States

```typescript
test('shows loading state then data', async ({ page }) => {
  await page.goto('/dashboard');

  // May see loading indicator
  const loader = page.locator('.loading-spinner');
  if (await loader.isVisible()) {
    await expect(loader).toBeHidden({ timeout: 10000 });
  }

  // Data should now be visible
  const dataList = page.locator('.data-item');
  await expect(dataList.first()).toBeVisible();
  expect(await dataList.count()).toBeGreaterThan(0);
});
```

### API Mocking (for isolated tests)

```typescript
test('shows error state when API fails', async ({ page }) => {
  // Mock the API to return error
  await page.route('**/api/data', (route) => {
    route.fulfill({
      status: 500,
      body: JSON.stringify({ error: 'Server error' }),
    });
  });

  await page.goto('/dashboard');

  await expect(page.locator('.error-state')).toBeVisible();
});
```

### Responsive Testing

```typescript
test.describe('Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('mobile menu works', async ({ page }) => {
    await page.goto('/');

    // Desktop nav should be hidden
    await expect(page.locator('.desktop-nav')).toBeHidden();

    // Mobile hamburger should be visible
    const hamburger = page.locator('[aria-label="Menu"]');
    await expect(hamburger).toBeVisible();

    // Open mobile menu
    await hamburger.click();
    await expect(page.locator('.mobile-nav')).toBeVisible();
  });
});
```

## Assertions Cheatsheet

```typescript
// Visibility
await expect(locator).toBeVisible();
await expect(locator).toBeHidden();

// Text content
await expect(locator).toHaveText('Exact text');
await expect(locator).toContainText('partial');
await expect(locator).toHaveText(/regex/);

// Attributes
await expect(locator).toHaveAttribute('href', '/path');
await expect(locator).toHaveClass(/active/);
await expect(locator).toHaveId('element-id');

// State
await expect(locator).toBeEnabled();
await expect(locator).toBeDisabled();
await expect(locator).toBeChecked();
await expect(locator).toBeFocused();

// Count
await expect(locator).toHaveCount(5);

// Page
await expect(page).toHaveTitle(/Title/);
await expect(page).toHaveURL('/expected-path');
```

## Cleanup

Tests should be idempotent. If your tests create data:

```typescript
test.afterEach(async ({ request }) => {
  // Clean up created test data
  await request.delete('/api/test-cleanup');
});
```

## Running Tests

```bash
# Local development
npm run test:local

# Against preview deployment
BASE_URL=https://preview-abc.vercel.app npm test

# Cloud execution via Browserbase
BROWSERBASE_API_KEY=xxx BROWSERBASE_PROJECT_ID=yyy npm test

# Debug mode
npm run test:debug
```

## CI Integration

See `.github/workflows/e2e.yml` for GitHub Actions workflow that:
1. Deploys to Vercel preview
2. Waits for deployment ready
3. Runs Playwright against preview URL
4. Uploads artifacts on failure
5. Posts results to PR

## Troubleshooting

### Test Flakiness

- Use `await expect(...).toBeVisible()` before interactions
- Add explicit waits: `await page.waitForLoadState('networkidle')`
- Use test.slow() for genuinely slow tests
- Add retries in CI: `retries: process.env.CI ? 2 : 0`

### Debugging Failed Tests

```bash
# Show traces for failed tests
npx playwright show-trace test-results/trace.zip

# View HTML report
npm run report

# Browserbase session recordings
# URL printed in test output: https://browserbase.com/sessions/{id}
```

## Related

- [Browserbase Integration](../browserbase-integration.md)
- [Vercel Preview Deployments](../vercel-preview-deployments.md)
- [API Endpoints Template](./api-endpoints.md)
