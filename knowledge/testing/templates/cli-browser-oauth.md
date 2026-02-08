# CLI Browser OAuth E2E Testing Template

Template for testing CLI applications that open a browser for OAuth authentication. This pattern is common for tools like `claude login`, `gh auth`, `vercel login`, etc.

## Prerequisites

- Playwright installed (`npm install -D @playwright/test`)
- CLI binary built and accessible
- Test OAuth credentials or mock server
- Browserbase credentials (optional, for cloud execution)

## Architecture

CLI OAuth flows typically work like this:

```
┌─────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────┐
│   CLI   │────>│ Opens URL   │────>│ Auth Server  │────>│ Callback│
│ Process │     │ in browser  │     │ (login page) │     │  URL    │
└─────────┘     └─────────────┘     └──────────────┘     └─────────┘
     │                                                         │
     │<──────────────── Token exchange ────────────────────────┘
```

## Directory Structure

```
project/
├── tests/
│   └── e2e/
│       ├── playwright.config.ts
│       ├── fixtures/
│       │   └── cli-auth.ts        # CLI + browser coordination fixture
│       └── tests/
│           └── login-flow.spec.ts
```

## Setup

### 1. playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,  // Sequential for CLI tests
  workers: 1,            // One CLI process at a time
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 120000,       // Longer timeout for CLI + browser
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 30000,
    navigationTimeout: 60000,
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

### 2. CLI Auth Fixture (fixtures/cli-auth.ts)

```typescript
import { test as base, Browser, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';

interface CliOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

interface CliAuthFixtures {
  cliProcess: {
    spawn: (command: string, args: string[]) => Promise<CliOutput>;
    extractUrl: (output: string) => string | null;
  };
}

export const test = base.extend<CliAuthFixtures>({
  cliProcess: async ({}, use) => {
    const processes: ChildProcess[] = [];

    const cliHelper = {
      spawn: async (command: string, args: string[]): Promise<CliOutput> => {
        return new Promise((resolve, reject) => {
          let stdout = '';
          let stderr = '';

          const proc = spawn(command, args, {
            env: { ...process.env, BROWSER: 'none' }, // Prevent auto-open
            shell: true,
          });

          processes.push(proc);

          proc.stdout?.on('data', (data) => {
            stdout += data.toString();
            console.log('[CLI stdout]', data.toString());
          });

          proc.stderr?.on('data', (data) => {
            stderr += data.toString();
            console.log('[CLI stderr]', data.toString());
          });

          // Set timeout for CLI completion
          const timeout = setTimeout(() => {
            proc.kill();
            resolve({ stdout, stderr, exitCode: null });
          }, 60000);

          proc.on('close', (code) => {
            clearTimeout(timeout);
            resolve({ stdout, stderr, exitCode: code });
          });

          proc.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      },

      extractUrl: (output: string): string | null => {
        // Common patterns for auth URLs
        const patterns = [
          /https?:\/\/[^\s]+auth[^\s]*/i,
          /https?:\/\/[^\s]+login[^\s]*/i,
          /https?:\/\/[^\s]+oauth[^\s]*/i,
          /Please open:?\s*(https?:\/\/[^\s]+)/i,
          /Visit:?\s*(https?:\/\/[^\s]+)/i,
          /Open in browser:?\s*(https?:\/\/[^\s]+)/i,
        ];

        for (const pattern of patterns) {
          const match = output.match(pattern);
          if (match) {
            return match[1] || match[0];
          }
        }
        return null;
      },
    };

    await use(cliHelper);

    // Cleanup all spawned processes
    for (const proc of processes) {
      if (!proc.killed) {
        proc.kill();
      }
    }
  },
});

export { expect } from '@playwright/test';
```

## Common Patterns

### Basic OAuth Login Flow

```typescript
import { test, expect } from '../fixtures/cli-auth';

test.describe('CLI Login Flow', () => {
  test('completes OAuth authentication', async ({ page, cliProcess }) => {
    // Start CLI login command (with BROWSER=none to get URL)
    const cliPromise = cliProcess.spawn('my-cli', ['login']);

    // Wait for CLI to output auth URL
    await page.waitForTimeout(2000);

    // Extract the auth URL from CLI output (this is simplified)
    // In practice, you might poll for the URL or use a callback mechanism
    const authUrl = 'https://auth.example.com/login?state=xxx';

    // Navigate browser to auth URL
    await page.goto(authUrl);

    // Complete OAuth flow in browser
    await page.locator('#email').fill('test@example.com');
    await page.locator('#password').fill('testpassword');
    await page.locator('button[type="submit"]').click();

    // Wait for OAuth consent screen
    await page.waitForURL(/authorize/);
    await page.locator('button:has-text("Allow")').click();

    // Should redirect to callback URL
    await page.waitForURL(/callback|success/);

    // CLI should complete
    const result = await cliPromise;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Successfully logged in');
  });
});
```

### With Concurrent CLI and Browser

```typescript
import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';

test('login flow with URL capture', async ({ page }) => {
  let authUrl: string | null = null;

  // Start CLI process
  const cli = spawn('my-cli', ['login'], {
    env: { ...process.env, BROWSER: 'none' },
    shell: true,
  });

  // Capture auth URL from output
  const urlPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('URL timeout')), 30000);

    cli.stdout.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/https:\/\/[^\s]+/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
  });

  // Wait for URL
  authUrl = await urlPromise;
  expect(authUrl).toBeTruthy();

  // Complete browser auth flow
  await page.goto(authUrl);
  // ... login steps

  // Wait for CLI to complete
  await new Promise((resolve) => cli.on('close', resolve));
});
```

### Testing Callback Server

Some CLIs spawn a local server to receive the OAuth callback:

```typescript
test('handles OAuth callback correctly', async ({ page, request }) => {
  // Start CLI which starts callback server
  const cli = spawn('my-cli', ['login'], { shell: true });

  // Wait for server to start
  await new Promise((r) => setTimeout(r, 2000));

  // CLI should be listening on localhost
  // Complete OAuth flow (browser side)
  await page.goto('https://auth.example.com/login');
  await page.locator('#email').fill('test@example.com');
  await page.locator('#password').fill('testpass');
  await page.locator('button[type="submit"]').click();

  // Verify callback was received
  // (The OAuth flow will redirect to CLI's callback server)
  await page.waitForURL(/localhost:\d+\/callback/);

  // Page should show success
  await expect(page.locator('body')).toContainText('Success');
});
```

### Testing Error States

```typescript
test.describe('Login Error Handling', () => {
  test('handles invalid credentials', async ({ page, cliProcess }) => {
    const cliPromise = cliProcess.spawn('my-cli', ['login']);

    // Get auth URL and navigate
    await page.waitForTimeout(2000);
    await page.goto('https://auth.example.com/login');

    // Enter wrong credentials
    await page.locator('#email').fill('wrong@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    // Should show error
    await expect(page.locator('.error')).toBeVisible();
    await expect(page.locator('.error')).toContainText('Invalid');

    // CLI should still be waiting
    const result = await cliPromise;
    expect(result.exitCode).not.toBe(0);
  });

  test('handles cancelled authorization', async ({ page }) => {
    // Start login flow
    await page.goto('https://auth.example.com/login');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#password').fill('testpass');
    await page.locator('button[type="submit"]').click();

    // On consent screen, click Deny
    await page.waitForURL(/authorize/);
    await page.locator('button:has-text("Deny")').click();

    // Should show access denied
    await expect(page).toHaveURL(/error=access_denied/);
  });

  test('handles network failure', async ({ page, context }) => {
    // Simulate network failure
    await context.setOffline(true);

    await page.goto('https://auth.example.com/login').catch(() => {});

    // Should show network error
    await expect(page.locator('body')).toContainText(/network|offline/i);
  });
});
```

### Testing Token Persistence

```typescript
test('stores credentials after login', async ({ page, cliProcess }) => {
  // Complete login flow
  // ... (login steps)

  // Verify credentials file exists
  const result = await cliProcess.spawn('my-cli', ['whoami']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('test@example.com');
});

test('logout clears credentials', async ({ cliProcess }) => {
  // Logout
  const logoutResult = await cliProcess.spawn('my-cli', ['logout']);
  expect(logoutResult.exitCode).toBe(0);

  // whoami should fail
  const whoamiResult = await cliProcess.spawn('my-cli', ['whoami']);
  expect(whoamiResult.exitCode).not.toBe(0);
  expect(whoamiResult.stderr).toContain('Not logged in');
});
```

## Handling Real OAuth Providers

### GitHub OAuth

```typescript
test('GitHub OAuth flow', async ({ page }) => {
  await page.goto('https://github.com/login/oauth/authorize?...');

  // GitHub login form
  await page.locator('#login_field').fill(process.env.GITHUB_TEST_USER!);
  await page.locator('#password').fill(process.env.GITHUB_TEST_PASS!);
  await page.locator('input[type="submit"]').click();

  // Authorize app
  await page.waitForURL(/authorize/);
  await page.locator('button:has-text("Authorize")').click();
});
```

### Mock OAuth Server

For CI/CD, use a mock OAuth server:

```typescript
import { createServer } from 'http';

test.beforeAll(async () => {
  // Start mock OAuth server
  const server = createServer((req, res) => {
    if (req.url?.includes('/authorize')) {
      res.writeHead(302, { Location: 'http://localhost:3000/callback?code=mock' });
      res.end();
    } else if (req.url?.includes('/token')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'mock-token' }));
    }
  });
  server.listen(9999);
});
```

## Cleanup

```typescript
test.afterEach(async ({ cliProcess }) => {
  // Ensure CLI processes are killed
  // (handled by fixture cleanup)

  // Clear any stored credentials
  await cliProcess.spawn('my-cli', ['logout']).catch(() => {});
});
```

## CI Considerations

```yaml
# .github/workflows/e2e.yml
- name: Run CLI OAuth tests
  env:
    # Use test credentials stored in secrets
    TEST_USER: ${{ secrets.TEST_USER }}
    TEST_PASS: ${{ secrets.TEST_PASS }}
    # Or use mock server
    USE_MOCK_OAUTH: true
  run: npm test
```

## Troubleshooting

### URL Not Appearing

- CLI may be buffering output; add `stdbuf -o0` prefix
- Check for `BROWSER=none` environment variable
- Some CLIs need `--no-browser` flag

### Timing Issues

- Use `page.waitForURL()` instead of arbitrary timeouts
- CLI processes may take time to start
- Add retry logic for URL extraction

### Port Conflicts

- CLI callback servers may use dynamic ports
- Parse port from CLI output
- Use `waitForUrl(/localhost:\d+/)` pattern

## Related

- [Next.js WebApp Template](./nextjs-webapp.md)
- [API Endpoints Template](./api-endpoints.md)
- [Browserbase Integration](../browserbase-integration.md)
