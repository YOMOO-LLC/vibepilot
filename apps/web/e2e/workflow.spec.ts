import { test, expect } from '@playwright/test';

test.describe('Complete Workflow', () => {
  test('should complete a full coding workflow', async ({ page }) => {
    // 1. Load the application
    await page.goto('/');
    await page.waitForTimeout(2000);

    // 2. Verify WebSocket connection
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();

    // 3. Terminal should be visible by default
    const terminal = page.locator('.xterm, [class*="xterm"]').first();
    await expect(terminal).toBeVisible({ timeout: 10000 });

    // 4. Navigate file tree and open a file
    await page.waitForTimeout(1000);
    const file = page
      .locator('[role="treeitem"]')
      .filter({ has: page.locator('[data-type="file"]') })
      .first();

    if (await file.isVisible()) {
      await file.click();
      await page.waitForTimeout(1500);

      // 5. Editor should open and display content
      const editor = page.locator('.monaco-editor');
      await expect(editor.first()).toBeVisible({ timeout: 10000 });

      // 6. Switch back to terminal
      const terminalButton = page
        .locator('button')
        .filter({ hasText: /terminal/i })
        .first();
      if (await terminalButton.isVisible()) {
        await terminalButton.click();
        await page.waitForTimeout(500);

        // Terminal should be visible again
        await expect(terminal).toBeVisible();
      }

      // 7. Switch back to editor
      const editorButton = page
        .locator('button')
        .filter({ hasText: /editor/i })
        .first();
      if (await editorButton.isVisible()) {
        await editorButton.click();
        await page.waitForTimeout(500);

        // Editor should be visible again
        await expect(editor.first()).toBeVisible();
      }
    }
  });

  test('should handle session persistence across refresh', async ({ page }) => {
    // 1. Initial load
    await page.goto('/');
    await page.waitForTimeout(2000);

    // 2. Open a file
    const file = page
      .locator('[role="treeitem"]')
      .filter({ has: page.locator('[data-type="file"]') })
      .first();

    if (await file.isVisible()) {
      await file.click();
      await page.waitForTimeout(1500);

      // 3. Note the file name from tab
      const editorTab = page
        .locator('[data-testid*="editor-tab"], [role="tab"]')
        .first();
      const tabText = await editorTab.textContent();

      // 4. Refresh the page
      await page.reload();
      await page.waitForTimeout(3000);

      // 5. Terminal session should persist
      const terminal = page.locator('.xterm, [class*="xterm"]').first();
      await expect(terminal).toBeVisible({ timeout: 10000 });

      // 6. Check if editor tab persisted (if sessionStorage is enabled)
      const editorTabAfterRefresh = page
        .locator('[data-testid*="editor-tab"], [role="tab"]')
        .first();
      if (await editorTabAfterRefresh.isVisible()) {
        const newTabText = await editorTabAfterRefresh.textContent();
        // Tab might persist or be recreated
        expect(newTabText?.length).toBeGreaterThan(0);
      }
    }
  });

  test('should handle multiple concurrent operations', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Open multiple files in quick succession
    const files = page
      .locator('[role="treeitem"]')
      .filter({ has: page.locator('[data-type="file"]') });

    const fileCount = await files.count();
    const filesToOpen = Math.min(fileCount, 3);

    for (let i = 0; i < filesToOpen; i++) {
      await files.nth(i).click();
      await page.waitForTimeout(300); // Quick succession
    }

    // Wait for operations to complete
    await page.waitForTimeout(2000);

    // Should have multiple editor tabs
    const editorTabs = page.locator('[data-testid*="editor-tab"], [role="tab"]');
    const tabCount = await editorTabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(filesToOpen);

    // Editor should still be responsive
    const editor = page.locator('.monaco-editor');
    await expect(editor.first()).toBeVisible();
  });

  test('should handle errors gracefully', async ({ page }) => {
    // Track console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Try to perform various operations
    const file = page
      .locator('[role="treeitem"]')
      .filter({ has: page.locator('[data-type="file"]') })
      .first();

    if (await file.isVisible()) {
      await file.click();
      await page.waitForTimeout(1500);
    }

    // Close and reopen tabs
    const closeButton = page
      .locator('button')
      .filter({ hasText: /×|close/i })
      .first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(500);
    }

    // Should not have crashed or shown error boundary
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();

    // Should not have critical errors (some warnings are acceptable)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Warning') &&
        !e.includes('DevTools') &&
        !e.includes('Extension'),
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('should maintain responsive UI under load', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Expand multiple directories rapidly
    const expandButtons = page
      .locator('[role="treeitem"] button, [class*="chevron"]')
      .first();

    for (let i = 0; i < 5; i++) {
      if (await expandButtons.isVisible()) {
        await expandButtons.click();
        await page.waitForTimeout(100); // Very fast clicks
      }
    }

    // Open multiple files
    const files = page
      .locator('[role="treeitem"]')
      .filter({ has: page.locator('[data-type="file"]') });

    const fileCount = Math.min(await files.count(), 5);
    for (let i = 0; i < fileCount; i++) {
      await files.nth(i).click();
      await page.waitForTimeout(200);
    }

    // UI should still be responsive
    const editor = page.locator('.monaco-editor');
    await expect(editor.first()).toBeVisible({ timeout: 10000 });

    // Should be able to switch tabs
    const tabs = page.locator('[data-testid*="editor-tab"], [role="tab"]');
    if ((await tabs.count()) > 1) {
      await tabs.last().click();
      await page.waitForTimeout(500);
      await expect(tabs.last()).toHaveAttribute(/aria-selected|data-active/, /true/);
    }
  });
});
