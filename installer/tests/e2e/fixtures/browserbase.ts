/**
 * Browserbase Playwright Fixture
 *
 * Provides cloud browser execution via Browserbase.
 * Falls back to local Playwright when Browserbase is unavailable.
 *
 * Environment variables:
 *   BROWSERBASE_API_KEY - API key from Browserbase dashboard
 *   BROWSERBASE_PROJECT_ID - Project ID from Browserbase dashboard
 *   USE_BROWSERBASE - Set to 'true' to enable Browserbase (default: auto-detect)
 *
 * Session recordings are available at:
 *   https://browserbase.com/sessions/{sessionId}
 */

import { test as base, chromium, BrowserContext, Page } from '@playwright/test';

// Browserbase SDK types
interface BrowserbaseSession {
  id: string;
  connectUrl: string;
}

interface BrowserbaseSDK {
  sessions: {
    create: (options: { projectId: string }) => Promise<BrowserbaseSession>;
  };
}

// Store session info for reporting
interface BrowserbaseInfo {
  enabled: boolean;
  sessionId?: string;
  sessionUrl?: string;
}

// Extend base test with Browserbase fixtures
export const test = base.extend<{
  browserbaseInfo: BrowserbaseInfo;
}>({
  // Custom context fixture that uses Browserbase when available
  context: async ({ baseURL }, use, testInfo) => {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    const projectId = process.env.BROWSERBASE_PROJECT_ID;
    const useBrowserbase = process.env.USE_BROWSERBASE !== 'false' && apiKey && projectId;

    if (useBrowserbase) {
      // Dynamically import Browserbase SDK
      let Browserbase: new (options: { apiKey: string }) => BrowserbaseSDK;
      try {
        const sdk = await import('@browserbasehq/sdk');
        Browserbase = sdk.default;
      } catch (e) {
        console.log('Browserbase SDK not installed, falling back to local Playwright');
        const context = await chromium.launchPersistentContext('', {
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

        // Store session info in test annotations
        testInfo.annotations.push({
          type: 'browserbase_session',
          description: session.id,
        });
        testInfo.annotations.push({
          type: 'browserbase_url',
          description: `https://browserbase.com/sessions/${session.id}`,
        });

        // Connect via CDP
        const browser = await chromium.connectOverCDP(session.connectUrl);
        const context = browser.contexts()[0];

        await use(context);

        await browser.close();
      } catch (error) {
        console.error('Browserbase connection failed, falling back to local Playwright:', error);
        const context = await chromium.launchPersistentContext('', {
          viewport: { width: 1280, height: 720 },
        });
        await use(context);
        await context.close();
      }
    } else {
      // Local Playwright fallback
      const context = await chromium.launchPersistentContext('', {
        viewport: { width: 1280, height: 720 },
      });
      await use(context);
      await context.close();
    }
  },

  // Custom page fixture that uses the Browserbase context
  page: async ({ context, baseURL }, use) => {
    const page = context.pages()[0] || await context.newPage();

    // Set base URL for relative navigation
    if (baseURL) {
      await page.goto(baseURL);
    }

    await use(page);
  },

  // Browserbase info fixture for test reporting
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
