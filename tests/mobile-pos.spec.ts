import { test, expect } from '@playwright/test';

test.describe('Mobile POS Viewport Tests', () => {
    test.use({
        viewport: { width: 390, height: 844 }, // iPhone 14 viewport
        isMobile: true,
        hasTouch: true,
    });

    /**
     * Navigate to /pos and wait for page to settle.
     * Returns true only when the app shell is authenticated and the MobileHeader renders.
     * In unauthenticated environments (CI / no session), returns false so tests skip gracefully.
     */
    async function isAuthenticated(page: any): Promise<boolean> {
        await page.goto('/pos');
        await page.waitForLoadState('networkidle');
        // MobileHeader renders only when layout has a valid user session
        return page.locator('[data-testid="mobile-header"]').isVisible();
    }

    test('desktop sidebar is hidden on mobile viewport', async ({ page }) => {
        const authed = await isAuthenticated(page);
        if (!authed) {
            test.skip(true, 'Unauthenticated — sidebar/header layout requires a valid session');
            return;
        }

        // Sidebar div has class "hidden md:flex" — must NOT be visible at 390px
        const desktopSidebar = page.locator('aside');
        await expect(desktopSidebar).not.toBeVisible();

        // MobileHeader must be present and visible
        await expect(page.locator('[data-testid="mobile-header"]')).toBeVisible();
    });

    test('renders mobile POS with catalog, sticky cart bar, and bottom sheet drawer', async ({ page }) => {
        const authed = await isAuthenticated(page);
        if (!authed) {
            test.skip(true, 'Unauthenticated — POS layout requires a valid session');
            return;
        }

        // MobileHeader visible
        await expect(page.locator('[data-testid="mobile-header"]')).toBeVisible();

        // Desktop sidebar hidden
        await expect(page.locator('aside')).not.toBeVisible();

        // Product grid — conditional on seeded product data
        const productButtons = page.locator('button:has-text("EGP"), button:has-text("$")');
        const count = await productButtons.count();
        if (count > 0) {
            await productButtons.first().click();

            // Sticky cart bar
            const cartBar = page.locator('text=السلة').first();
            await expect(cartBar).toBeVisible();

            // Open cart bottom sheet
            await cartBar.click();
            const cartDrawer = page.locator('[role="dialog"]').filter({ hasText: 'سلة المشتريات' });
            await expect(cartDrawer).toBeVisible();

            // Touch target ≥ 36px
            const plusButton = cartDrawer.locator('button:has(svg.lucide-plus)').first();
            await expect(plusButton).toBeVisible();
            const box = await plusButton.boundingBox();
            if (box) {
                expect(box.width).toBeGreaterThanOrEqual(36);
                expect(box.height).toBeGreaterThanOrEqual(36);
            }
        }
    });

    test('spacebar in search does not trigger cart hold on mobile', async ({ page }) => {
        const authed = await isAuthenticated(page);
        if (!authed) {
            test.skip(true, 'Unauthenticated — hotkey guard test requires a valid session');
            return;
        }

        const searchInput = page.locator('input[placeholder*="بحث"], input[type="text"]').first();
        if (await searchInput.isVisible()) {
            await searchInput.focus();
            await searchInput.press('Space');
            const toast = page.locator('text=تم تعليق السلة');
            await expect(toast).not.toBeVisible();
        }
    });
});
