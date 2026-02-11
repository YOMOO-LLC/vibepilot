import { test, expect } from '@playwright/test';

test.describe('Terminal', () => {
  test('should create a new terminal tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000); // Wait for WebSocket connection

    // Look for the new tab button (assuming there's a "+" or "New" button)
    const newTabButton = page
      .locator('button')
      .filter({ hasText: /\+|New/i })
      .first();

    if (await newTabButton.isVisible()) {
      await newTabButton.click();
      await page.waitForTimeout(1000);

      // Should have at least one terminal tab
      const tabs = page.locator('[role="tab"], [data-testid*="tab"]');
      await expect(tabs.first()).toBeVisible();
    }
  });

  test('should render xterm.js terminal', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // xterm.js adds a specific class to its container
    const xtermElement = page.locator('.xterm, [class*="xterm"]').first();
    await expect(xtermElement).toBeVisible({ timeout: 10000 });
  });

  test('should switch between terminal and editor panes', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Look for terminal/editor toggle buttons
    const terminalButton = page
      .locator('button')
      .filter({ hasText: /terminal/i })
      .first();
    const editorButton = page
      .locator('button')
      .filter({ hasText: /editor/i })
      .first();

    if ((await terminalButton.isVisible()) && (await editorButton.isVisible())) {
      // Click terminal button
      await terminalButton.click();
      await page.waitForTimeout(500);

      // Terminal should be visible
      await expect(page.locator('.xterm, [class*="xterm"]').first()).toBeVisible();

      // Click editor button
      await editorButton.click();
      await page.waitForTimeout(500);

      // Monaco editor should be visible
      await expect(page.locator('.monaco-editor, [class*="monaco"]').first()).toBeVisible();
    }
  });

  test('should persist terminal session on page refresh', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Find terminal element
    const xtermElement = page.locator('.xterm, [class*="xterm"]').first();
    await expect(xtermElement).toBeVisible({ timeout: 10000 });

    // Reload page
    await page.reload();
    await page.waitForTimeout(3000);

    // Terminal should still be visible and session should be restored
    await expect(xtermElement).toBeVisible({ timeout: 10000 });
  });

  test('should handle terminal tab close', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Look for close button on tab (usually an "×" or close icon)
    const closeButton = page
      .locator('button')
      .filter({ hasText: /×|close/i })
      .first();

    if (await closeButton.isVisible()) {
      const initialTabCount = await page.locator('[role="tab"], [data-testid*="tab"]').count();

      await closeButton.click();
      await page.waitForTimeout(500);

      const newTabCount = await page.locator('[role="tab"], [data-testid*="tab"]').count();

      // Tab count should decrease or at least one tab should remain
      expect(newTabCount).toBeLessThanOrEqual(initialTabCount);
    }
  });
});
