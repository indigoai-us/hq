/**
 * Browserbase Playwright Fixture (Reusable Template)
 *
 * Provides cloud browser execution via Browserbase with automatic
 * fallback to local Playwright when Browserbase is unavailable.
 *
 * SETUP:
 *   1. Copy this file into your project's test fixtures directory
 *   2. Install dependencies: npm install @playwright/test @browserbasehq/sdk
 *   3. Set environment variables (see below)
 *   4. Import { test, expect } from this fixture instead of @playwright/test
 *
 * Environment variables:
 *   BROWSERBASE_API_KEY    - API key from https://browserbase.com/dashboard
 *   BROWSERBASE_PROJECT_ID - Project ID from Browserbase dashboard
 *   USE_BROWSERBASE        - Set to 'true' to enable, 'false' to force local
 *                            (default: auto-detect based on env vars)
 *
 * Session recordings are available at:
 *   https://browserbase.com/sessions/{sessionId}
 *
 * CUSTOMIZE points are marked with "// CUSTOMIZE:" comments below.
 */

import { test as base, chromium, BrowserContext, Page } from '@playwright/test';

// Browserbase SDK types (avoids hard dependency on SDK at compile time)
interface BrowserbaseSession {
  id: string;
  connectUrl: string;
}

interface BrowserbaseSDK {
  sessions: {
    create: (options: { projectId: string }) => Promise<BrowserbaseSession>;
  };
}

// Store session info for reporting - accessible via the browserbaseInfo fixture
interface BrowserbaseInfo {
  enabled: boolean;
  sessionId?: string;
  sessionUrl?: string;
}

// CUSTOMIZE: Add additional fixture types here if your tests need them.
// For example, you might add an authenticated page fixture:
//   authenticatedPage: Page;
export const test = base.extend<{
  browserbaseInfo: BrowserbaseInfo;
}>({
  // Custom context fixture that uses Browserbase when available.
  // This overrides the default Playwright context with one connected
  // via CDP to a Browserbase cloud browser session.
  context: async ({ baseURL }, use, testInfo) => {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    const projectId = process.env.BROWSERBASE_PROJECT_ID;
    const useBrowserbase = process.env.USE_BROWSERBASE !== 'false' && apiKey && projectId;

    if (useBrowserbase) {
      // Dynamically import Browserbase SDK so it's not required for local runs
      let Browserbase: new (options: { apiKey: string }) => BrowserbaseSDK;
      try {
        const sdk = await import('@browserbasehq/sdk');
        Browserbase = sdk.default;
      } catch (e) {
        console.log('Browserbase SDK not installed, falling back to local Playwright');
        const context = await chromium.launchPersistentContext('', {
          // CUSTOMIZE: Adjust viewport size for your application's needs
          viewport: { width: 1280, height: 720 },
        });
        await use(context);
        await context.close();
        return;
      }

      try {
        const bb = new Browserbase({ apiKey });
        const session = await bb.sessions.create({ projectId });

        console.log(`Browserbase session: ${session.id}`);
        console.log(`Session replay: https://browserbase.com/sessions/${session.id}`);

        // Store session info in test annotations so it appears in reports
        // and can be retrieved by the browserbaseInfo fixture
        testInfo.annotations.push({
          type: 'browserbase_session',
          description: session.id,
        });
        testInfo.annotations.push({
          type: 'browserbase_url',
          description: `https://browserbase.com/sessions/${session.id}`,
        });

        // Connect via Chrome DevTools Protocol (CDP)
        const browser = await chromium.connectOverCDP(session.connectUrl);
        const context = browser.contexts()[0];

        await use(context);

        await browser.close();
      } catch (error) {
        // Graceful fallback: if Browserbase fails (network issues, quota, etc.)
        // the test still runs locally rather than failing outright
        console.error('Browserbase connection failed, falling back to local Playwright:', error);
        const context = await chromium.launchPersistentContext('', {
          // CUSTOMIZE: Adjust viewport size for your application's needs
          viewport: { width: 1280, height: 720 },
        });
        await use(context);
        await context.close();
      }
    } else {
      // Local Playwright fallback - no Browserbase credentials configured
      const context = await chromium.launchPersistentContext('', {
        // CUSTOMIZE: Adjust viewport size for your application's needs
        viewport: { width: 1280, height: 720 },
      });
      await use(context);
      await context.close();
    }
  },

  // Custom page fixture that uses the Browserbase-connected context.
  // Reuses existing page from CDP connection or creates a new one.
  page: async ({ context, baseURL }, use) => {
    const page = context.pages()[0] || await context.newPage();

    // CUSTOMIZE: Set your project's base URL for relative navigation.
    // This navigates to baseURL on page setup so tests can use
    // relative paths like page.goto('/dashboard')
    if (baseURL) {
      await page.goto(baseURL);
    }

    await use(page);
  },

  // Browserbase info fixture for test reporting.
  // Use this in tests to conditionally log session URLs or
  // include Browserbase metadata in custom reporters.
  browserbaseInfo: async ({}, use, testInfo) => {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    const projectId = process.env.BROWSERBASE_PROJECT_ID;
    const enabled = process.env.USE_BROWSERBASE !== 'false' && !!apiKey && !!projectId;

    const sessionAnnotation = testInfo.annotations.find(a => a.type === 'browserbase_session');
    const urlAnnotation = testInfo.annotations.find(a => a.type === 'browserbase_url');

    await use({
      enabled,
      sessionId: sessionAnnotation?.description,
      sessionUrl: urlAnnotation?.description,
    });
  },
});

export { expect } from '@playwright/test';
