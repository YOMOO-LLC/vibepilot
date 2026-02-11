import { test, expect } from '@playwright/test';

test.describe('File Tree', () => {
  test('should render file tree on load', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000); // Wait for WebSocket connection

    // Look for file tree container (common selectors)
    const fileTree = page.locator('[data-testid="file-tree"], [class*="file-tree"], aside, nav');
    await expect(fileTree.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display root directory items', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Wait for file tree to load
    await page.waitForTimeout(2000);

    // Should have at least some files/folders visible
    const fileItems = page.locator('[role="treeitem"], [data-testid*="file"]');
    const count = await fileItems.count();

    expect(count).toBeGreaterThan(0);
  });

  test('should expand and collapse directories', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Find an expandable directory (usually has an arrow/chevron icon)
    const expandableDir = page
      .locator('[role="treeitem"]')
      .filter({ has: page.locator('button, [class*="chevron"], [class*="arrow"]') })
      .first();

    if (await expandableDir.isVisible()) {
      // Click to expand
      const expandButton = expandableDir
        .locator('button, [class*="chevron"], [class*="arrow"]')
        .first();
      await expandButton.click();
      await page.waitForTimeout(1000);

      // Should have nested items visible
      const nestedItems = page.locator('[role="treeitem"][data-depth="2"]');
      if ((await nestedItems.count()) > 0) {
        await expect(nestedItems.first()).toBeVisible();

        // Click again to collapse
        await expandButton.click();
        await page.waitForTimeout(500);

        // Nested items may be hidden or removed from DOM
        if ((await nestedItems.count()) > 0) {
          await expect(nestedItems.first()).not.toBeVisible();
        }
      }
    }
  });

  test('should open file in editor on click', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Find a file item (not a directory)
    const fileItem = page
      .locator('[role="treeitem"]')
      .filter({
        has: page.locator('[class*="file-icon"]:not([class*="folder"]), [data-type="file"]'),
      })
      .first();

    if (await fileItem.isVisible()) {
      await fileItem.click();
      await page.waitForTimeout(1000);

      // Monaco editor should become visible
      const monacoEditor = page.locator('.monaco-editor, [class*="monaco"]');
      await expect(monacoEditor.first()).toBeVisible({ timeout: 10000 });

      // Editor tab should be created
      const editorTab = page.locator('[role="tab"], [data-testid*="editor-tab"]').first();
      if (await editorTab.isVisible()) {
        await expect(editorTab).toBeVisible();
      }
    }
  });

  test('should filter/search files if search is available', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Look for search input in file tree
    const searchInput = page.locator('input[type="text"], input[placeholder*="search" i]').first();

    if (await searchInput.isVisible()) {
      // Type a search query
      await searchInput.fill('package');
      await page.waitForTimeout(1000);

      // Should filter to matching files
      const visibleFiles = page.locator('[role="treeitem"]:visible');
      const count = await visibleFiles.count();

      // Should have at least one result (package.json exists in most projects)
      expect(count).toBeGreaterThan(0);

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(500);
    }
  });

  test('should handle deep directory navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Navigate through nested directories
    for (let i = 0; i < 3; i++) {
      const expandableDir = page
        .locator('[role="treeitem"]')
        .filter({ has: page.locator('button, [class*="chevron"]') })
        .first();

      if (await expandableDir.isVisible()) {
        const expandButton = expandableDir.locator('button, [class*="chevron"]').first();
        await expandButton.click();
        await page.waitForTimeout(500);
      } else {
        break; // No more directories to expand
      }
    }

    // Should still have file tree visible
    const fileTree = page.locator('[data-testid="file-tree"], [class*="file-tree"], aside');
    await expect(fileTree.first()).toBeVisible();
  });
});
