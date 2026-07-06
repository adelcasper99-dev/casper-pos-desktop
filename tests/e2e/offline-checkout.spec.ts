import { test, expect } from '@playwright/test';

test.describe('Offline Checkout Hardening', () => {
  test('POS gracefully handles network disconnect during checkout', async ({ page, context }) => {
    // Navigate to POS
    await page.goto('/en/pos');
    
    // Check if we need to login
    const isLoginPage = await page.title().then(title => title.toLowerCase().includes('login'));
    if (isLoginPage) {
      // Mock or perform login here if needed
      // Currently, we just want to establish the test structure
      // for the offline fallback mechanism.
      test.skip(true, 'Setup auth state first');
      return;
    }

    // Add item to cart
    await page.click('[data-testid="product-card"]:first-child');
    
    // Verify item is in cart
    await expect(page.locator('.cart-item')).toBeVisible();

    // Simulate offline mode
    await context.setOffline(true);

    // Click checkout
    await page.click('button:has-text("Checkout")');

    // Pay with cash
    await page.click('button:has-text("Cash")');
    await page.click('button:has-text("Confirm Payment")');

    // Expect the system to accept it and queue it
    await expect(page.locator('.toast')).toContainText(/Payment Saved Offline|Checkout Complete/i);

    // Reconnect
    await context.setOffline(false);
  });
});
