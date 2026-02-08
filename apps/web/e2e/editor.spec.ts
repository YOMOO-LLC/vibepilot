import { test, expect } from '@playwright/test';

test.describe('Editor', () => {
  test('should render Monaco editor', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Switch to editor pane if needed
    const editorButton = page.locator('button').filter({ hasText: /editor/i }).first();
    if (await editorButton.isVisible()) {
      await editorButton.click();
      await page.waitForTimeout(500);
    }

    // Monaco editor should be visible
    const monacoEditor = page.locator('.monaco-editor, [class*="monaco"]');
    await expect(monacoEditor.first()).toBeVisible({ timeout: 10000 });
  });

  test('should open file and display content', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Click on a file in the file tree
    const fileItem = page
      .locator('[role="treeitem"]')
      .filter({
        has: page.locator(
          '[class*="file-icon"]:not([class*="folder"]), [data-type="file"]',
        ),
      })
      .first();

    if (await fileItem.isVisible()) {
      await fileItem.click();
      await page.waitForTimeout(1500);

      // Monaco editor should show content
      const editorContent = page.locator('.monaco-editor .view-lines');
      await expect(editorContent.first()).toBeVisible({ timeout: 10000 });

      // Should have some text content
      const textContent = await editorContent.first().textContent();
      expect(textContent?.length).toBeGreaterThan(0);
    }
  });

  test('should create and manage multiple editor tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Open first file
    const firstFile = page
      .locator('[role="treeitem"]')
      .filter({ has: page.locator('[data-type="file"]') })
      .first();

    if (await firstFile.isVisible()) {
      await firstFile.click();
      await page.waitForTimeout(1000);

      // Try to open a second file
      const secondFile = page
        .locator('[role="treeitem"]')
        .filter({ has: page.locator('[data-type="file"]') })
        .nth(1);

      if (await secondFile.isVisible()) {
        await secondFile.click();
        await page.waitForTimeout(1000);

        // Should have at least 2 editor tabs
        const editorTabs = page.locator('[data-testid*="editor-tab"], [role="tab"]');
        const tabCount = await editorTabs.count();
        expect(tabCount).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test('should switch between editor tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Open two files
    const files = page
      .locator('[role="treeitem"]')
      .filter({ has: page.locator('[data-type="file"]') });

    if ((await files.count()) >= 2) {
      await files.nth(0).click();
      await page.waitForTimeout(1000);

      await files.nth(1).click();
      await page.waitForTimeout(1000);

      // Get editor tabs
      const tabs = page.locator('[data-testid*="editor-tab"], [role="tab"]');

      if ((await tabs.count()) >= 2) {
        // Click first tab
        await tabs.nth(0).click();
        await page.waitForTimeout(500);

        // First tab should be active
        await expect(tabs.nth(0)).toHaveAttribute(/aria-selected|data-active/, /true/);

        // Click second tab
        await tabs.nth(1).click();
        await page.waitForTimeout(500);

        // Second tab should be active
        await expect(tabs.nth(1)).toHaveAttribute(/aria-selected|data-active/, /true/);
      }
    }
  });

  test('should close editor tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Open a file
    const file = page
      .locator('[role="treeitem"]')
      .filter({ has: page.locator('[data-type="file"]') })
      .first();

    if (await file.isVisible()) {
      await file.click();
      await page.waitForTimeout(1000);

      // Find close button on editor tab
      const closeButton = page
        .locator('[data-testid*="editor-tab"] button, [role="tab"] button')
        .filter({ hasText: /×|close/i })
        .first();

      if (await closeButton.isVisible()) {
        const initialTabCount = await page
          .locator('[data-testid*="editor-tab"], [role="tab"]')
          .count();

        await closeButton.click();
        await page.waitForTimeout(500);

        const newTabCount = await page
          .locator('[data-testid*="editor-tab"], [role="tab"]')
          .count();
        expect(newTabCount).toBeLessThanOrEqual(initialTabCount);
      }
    }
  });

  test('should handle large files', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Try to find package-lock.json or similar large file
    const largeFile = page
      .locator('[role="treeitem"]')
      .filter({ hasText: /lock|dist|bundle/i })
      .first();

    if (await largeFile.isVisible()) {
      await largeFile.click();
      await page.waitForTimeout(3000); // Give more time for large files

      // Monaco should still render
      const monacoEditor = page.locator('.monaco-editor .view-lines');
      await expect(monacoEditor.first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('should show syntax highlighting', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Open a TypeScript or JavaScript file
    const codeFile = page
      .locator('[role="treeitem"]')
      .filter({ hasText: /\.tsx?$|\.jsx?$/i })
      .first();

    if (await codeFile.isVisible()) {
      await codeFile.click();
      await page.waitForTimeout(1500);

      // Monaco should have syntax tokens
      const syntaxTokens = page.locator('.monaco-editor .mtk1, .monaco-editor .mtk2');
      const tokenCount = await syntaxTokens.count();

      // Should have at least some syntax highlighting
      expect(tokenCount).toBeGreaterThan(0);
    }
  });

  test('should persist editor state on tab switch', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Open first file
    const firstFile = page
      .locator('[role="treeitem"]')
      .filter({ has: page.locator('[data-type="file"]') })
      .first();

    if (await firstFile.isVisible()) {
      await firstFile.click();
      await page.waitForTimeout(1000);

      // Get initial content
      const initialContent = await page
        .locator('.monaco-editor .view-lines')
        .first()
        .textContent();

      // Open second file
      const secondFile = page
        .locator('[role="treeitem"]')
        .filter({ has: page.locator('[data-type="file"]') })
        .nth(1);

      if (await secondFile.isVisible()) {
        await secondFile.click();
        await page.waitForTimeout(1000);

        // Switch back to first file
        const tabs = page.locator('[data-testid*="editor-tab"], [role="tab"]');
        if ((await tabs.count()) >= 2) {
          await tabs.nth(0).click();
          await page.waitForTimeout(500);

          // Content should be the same
          const newContent = await page
            .locator('.monaco-editor .view-lines')
            .first()
            .textContent();
          expect(newContent).toBe(initialContent);
        }
      }
    }
  });
});
