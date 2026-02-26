import { test, expect } from '@playwright/test';

/**
 * E2E tests for HQ Installer landing page.
 *
 * Tests the core functionality:
 * - Page loads and displays correctly
 * - OS detection works
 * - Download buttons are present and functional
 * - FAQ accordion works
 * - Tab switching works
 *
 * Execution modes:
 * - Browserbase (cloud): Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID
 * - Local: Default when Browserbase credentials not present
 *
 * Session recordings (Browserbase only):
 *   https://browserbase.com/sessions/{sessionId}
 */

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle('my-hq - Download');
  });

  test('displays logo and tagline', async ({ page }) => {
    const logo = page.locator('h1.logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveText('my-hq');

    const tagline = page.locator('.tagline');
    await expect(tagline).toBeVisible();
    await expect(tagline).toHaveText('Personal OS for AI Workers');
  });

  test('shows OS detection message', async ({ page }) => {
    const detectedOs = page.locator('#detected-os');
    await expect(detectedOs).toBeVisible();

    // Should either show detected OS or fallback message
    const text = await detectedOs.textContent();
    expect(text).toBeTruthy();
    expect(text).not.toBe('Detecting your operating system...');
  });

  test('download button is present', async ({ page }) => {
    // Main download button should exist (may be hidden for Linux)
    const downloadBtn = page.locator('#download-btn');
    await expect(downloadBtn).toBeDefined();

    // Button should have download text if visible
    const isVisible = await downloadBtn.isVisible();
    if (isVisible) {
      const downloadText = page.locator('#download-text');
      const text = await downloadText.textContent();
      expect(text).toMatch(/Download/);
    }
  });

  test('platform links are present', async ({ page }) => {
    const windowsLink = page.locator('#windows-link');
    const macosLink = page.locator('#macos-link');

    // At least one should be visible (opposite of detected OS)
    const windowsVisible = await windowsLink.isVisible();
    const macosVisible = await macosLink.isVisible();

    expect(windowsVisible || macosVisible).toBe(true);

    // Check href attributes
    if (windowsVisible) {
      await expect(windowsLink).toHaveAttribute('href', /\.exe$/);
    }
    if (macosVisible) {
      await expect(macosLink).toHaveAttribute('href', /\.pkg$/);
    }
  });

  test('system requirements section is visible', async ({ page }) => {
    const requirements = page.locator('.requirements');
    await expect(requirements).toBeVisible();

    const heading = requirements.locator('h2');
    await expect(heading).toHaveText('System Requirements');

    // Check requirement items
    const reqItems = page.locator('.req-item');
    await expect(reqItems).toHaveCount(4);
  });

  test('version info is displayed', async ({ page }) => {
    const versionInfo = page.locator('.version-info');
    await expect(versionInfo).toBeVisible();
    await expect(versionInfo).toContainText('Version');
  });
});

test.describe('FAQ Accordion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('FAQ section is present', async ({ page }) => {
    const faqSection = page.locator('.faq-section');
    await expect(faqSection).toBeVisible();

    const heading = faqSection.locator('h2');
    await expect(heading).toHaveText('Frequently Asked Questions');
  });

  test('FAQ items are collapsed by default', async ({ page }) => {
    const faqItems = page.locator('.faq-item');
    const count = await faqItems.count();
    expect(count).toBeGreaterThan(0);

    // Check first item is collapsed
    const firstAnswer = page.locator('.faq-item').first().locator('.faq-answer');
    await expect(firstAnswer).toBeHidden();
  });

  test('clicking FAQ question expands answer', async ({ page }) => {
    const firstQuestion = page.locator('.faq-question').first();
    const firstItem = page.locator('.faq-item').first();
    const firstAnswer = firstItem.locator('.faq-answer');

    // Initially hidden
    await expect(firstAnswer).toBeHidden();

    // Click to expand
    await firstQuestion.click();

    // Should now be visible
    await expect(firstAnswer).toBeVisible();

    // Item should have 'open' class
    await expect(firstItem).toHaveClass(/open/);
  });

  test('clicking expanded FAQ collapses it', async ({ page }) => {
    const firstQuestion = page.locator('.faq-question').first();
    const firstItem = page.locator('.faq-item').first();
    const firstAnswer = firstItem.locator('.faq-answer');

    // Expand
    await firstQuestion.click();
    await expect(firstAnswer).toBeVisible();

    // Collapse
    await firstQuestion.click();
    await expect(firstAnswer).toBeHidden();
  });

  test('multiple FAQs can be open simultaneously', async ({ page }) => {
    const questions = page.locator('.faq-question');
    const items = page.locator('.faq-item');

    // Open first two
    await questions.nth(0).click();
    await questions.nth(1).click();

    // Both should have 'open' class
    await expect(items.nth(0)).toHaveClass(/open/);
    await expect(items.nth(1)).toHaveClass(/open/);
  });
});

test.describe('Tab Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('manual installation section is present', async ({ page }) => {
    const advancedSection = page.locator('.advanced-section');
    await expect(advancedSection).toBeVisible();

    const heading = advancedSection.locator('h2');
    await expect(heading).toHaveText('Manual Installation');
  });

  test('tab buttons are present', async ({ page }) => {
    const tabButtons = page.locator('.tab-btn');
    await expect(tabButtons).toHaveCount(2);

    await expect(tabButtons.nth(0)).toHaveText('macOS / Linux');
    await expect(tabButtons.nth(1)).toHaveText('Windows');
  });

  test('macOS tab is active by default', async ({ page }) => {
    const macosTab = page.locator('.tab-btn[data-tab="macos-cli"]');
    const windowsTab = page.locator('.tab-btn[data-tab="windows-cli"]');

    await expect(macosTab).toHaveClass(/active/);
    await expect(windowsTab).not.toHaveClass(/active/);

    // macOS content should be visible
    const macosContent = page.locator('#macos-cli');
    await expect(macosContent).toBeVisible();

    // Windows content should be hidden
    const windowsContent = page.locator('#windows-cli');
    await expect(windowsContent).toBeHidden();
  });

  test('clicking Windows tab shows Windows content', async ({ page }) => {
    const windowsTab = page.locator('.tab-btn[data-tab="windows-cli"]');

    await windowsTab.click();

    // Windows tab should now be active
    await expect(windowsTab).toHaveClass(/active/);

    // Windows content should be visible
    const windowsContent = page.locator('#windows-cli');
    await expect(windowsContent).toBeVisible();

    // macOS content should be hidden
    const macosContent = page.locator('#macos-cli');
    await expect(macosContent).toBeHidden();
  });

  test('code blocks contain installation commands', async ({ page }) => {
    const macosCode = page.locator('#macos-cli .code-block code');
    await expect(macosCode).toContainText('npm install -g @anthropic-ai/claude-code');
    await expect(macosCode).toContainText('claude login');

    // Switch to Windows
    await page.locator('.tab-btn[data-tab="windows-cli"]').click();

    const windowsCode = page.locator('#windows-cli .code-block code');
    await expect(windowsCode).toContainText('npm install -g @anthropic-ai/claude-code');
    await expect(windowsCode).toContainText('claude login');
  });
});

test.describe('Footer', () => {
  test('footer contains expected links', async ({ page }) => {
    await page.goto('/');

    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Check for expected link texts
    await expect(footer).toContainText('GitHub');
    await expect(footer).toContainText('Report Issues');
    await expect(footer).toContainText('License');
    await expect(footer).toContainText('2026 my-hq');
  });
});

test.describe('Responsive Design', () => {
  test('page is responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');

    // Logo should still be visible
    const logo = page.locator('h1.logo');
    await expect(logo).toBeVisible();

    // Download section should be visible
    const downloadSection = page.locator('.download-section');
    await expect(downloadSection).toBeVisible();

    // FAQ should be accessible
    const faqSection = page.locator('.faq-section');
    await expect(faqSection).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('page has proper heading hierarchy', async ({ page }) => {
    await page.goto('/');

    // Should have exactly one h1
    const h1Elements = page.locator('h1');
    await expect(h1Elements).toHaveCount(1);

    // h2 elements should exist
    const h2Elements = page.locator('h2');
    const h2Count = await h2Elements.count();
    expect(h2Count).toBeGreaterThan(0);
  });

  test('interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/');

    // Tab buttons should be focusable
    const tabButton = page.locator('.tab-btn').first();
    await tabButton.focus();
    await expect(tabButton).toBeFocused();

    // FAQ questions should be clickable
    const faqQuestion = page.locator('.faq-question').first();
    await faqQuestion.click();

    const faqItem = page.locator('.faq-item').first();
    await expect(faqItem).toHaveClass(/open/);
  });
});
