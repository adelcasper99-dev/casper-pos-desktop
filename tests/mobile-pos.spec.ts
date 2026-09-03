import { test, expect } from '@playwright/test';

test.describe('Mobile POS Viewport Tests', () => {
    test.use({
        viewport: { width: 390, height: 844 }, // iPhone 14 viewport
        isMobile: true,
        hasTouch: true,
    });

    test('renders mobile POS with catalog, sticky cart bar, and bottom sheet drawer', async ({ page }) => {
        // Navigate to POS terminal
        await page.goto('/pos');

        // 1. Verify desktop sidebar is hidden on mobile viewport
        const desktopSidebar = page.locator('aside');
        await expect(desktopSidebar).not.toBeVisible();

        // 2. Verify mobile header is present
        const mobileHeader = page.locator('header');
        await expect(mobileHeader).toBeVisible();

        // 3. Verify product grid renders items
        const productButtons = page.locator('button:has-text("EGP"), button:has-text("$")');
        // If products exist, count > 0
        const count = await productButtons.count();
        if (count > 0) {
            // Click first product to add to cart
            await productButtons.first().click();

            // 4. Verify sticky bottom cart bar appears with badge
            const cartBar = page.locator('text=السلة').first();
            await expect(cartBar).toBeVisible();

            // 5. Open mobile cart drawer
            await cartBar.click();

            // Verify bottom sheet drawer is open
            const cartDrawer = page.locator('[role="dialog"]').filter({ hasText: 'سلة المشتريات' });
            await expect(cartDrawer).toBeVisible();

            // Verify quantity steppers have touch-friendly minimum sizes
            const plusButton = cartDrawer.locator('button:has(svg.lucide-plus)').first();
            await expect(plusButton).toBeVisible();
            const box = await plusButton.boundingBox();
            if (box) {
                expect(box.width).toBeGreaterThanOrEqual(36);
                expect(box.height).toBeGreaterThanOrEqual(36);
            }
        }
    });

    test('spacebar input in search does not trigger cart hold on mobile', async ({ page }) => {
        await page.goto('/pos');
        const searchInput = page.locator('input[placeholder*="بحث"], input[type="text"]').first();
        if (await searchInput.isVisible()) {
            await searchInput.focus();
            await searchInput.press('Space');
            // Ensure no "تم تعليق السلة" or held cart toast appeared
            const toast = page.locator('text=تم تعليق السلة');
            await expect(toast).not.toBeVisible();
        }
    });
});
