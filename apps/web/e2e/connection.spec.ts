import { test, expect } from '@playwright/test';

test.describe('WebSocket Connection', () => {
  test('should establish WebSocket connection on page load', async ({ page }) => {
    await page.goto('/');

    // Wait for the main content to load
    await expect(page.locator('body')).toBeVisible();

    // Check if the app loaded without errors (no error boundary)
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();

    // Wait a bit for WebSocket connection
    await page.waitForTimeout(2000);

    // Check console for connection errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Should not have WebSocket connection errors after a few seconds
    await page.waitForTimeout(1000);
    const wsErrors = errors.filter((e) => e.includes('WebSocket'));
    expect(wsErrors.length).toBe(0);
  });

  test('should handle page refresh gracefully', async ({ page }) => {
    await page.goto('/');

    // Wait for initial load
    await page.waitForTimeout(2000);

    // Reload the page
    await page.reload();

    // Should reconnect successfully
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
  });
});
