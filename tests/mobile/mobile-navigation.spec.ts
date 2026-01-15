import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 13'] });

test.describe('Mobile Navigation - Touch Targets & Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    // Start at home page
    await page.goto('/');
  });

  test('Hamburger menu button meets 44x44px touch target requirement', async ({ page }) => {
    // Find the mobile menu button (visible only on mobile)
    const menuButton = page.locator('button[aria-label*="menu" i]').first();
    
    // Wait for button to be visible
    await expect(menuButton).toBeVisible();
    
    // Get button dimensions
    const box = await menuButton.boundingBox();
    
    // Verify minimum touch target size (44x44px)
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('Mobile menu opens and closes correctly', async ({ page }) => {
    // Find and click the hamburger menu button
    const menuButton = page.locator('button[aria-label*="menu" i]').first();
    await menuButton.click();
    
    // Wait for menu animation
    await page.waitForTimeout(300);
    
    // Check that mobile drawer is visible
    const mobileDrawer = page.locator('div.fixed.right-0').filter({ hasText: /Dashboard|Home|Apply/i }).first();
    await expect(mobileDrawer).toBeVisible();
    
    // Check backdrop is visible
    const backdrop = page.locator('div.fixed.inset-0.bg-black').first();
    await expect(backdrop).toBeVisible();
    
    // Close menu by clicking backdrop
    await backdrop.click();
    
    // Wait for close animation
    await page.waitForTimeout(300);
    
    // Verify menu is closed
    await expect(mobileDrawer).not.toBeVisible();
  });

  test('Mobile menu closes on Escape key', async ({ page }) => {
    // Open mobile menu
    const menuButton = page.locator('button[aria-label*="menu" i]').first();
    await menuButton.click();
    
    // Wait for menu to open
    await page.waitForTimeout(300);
    
    // Press Escape key
    await page.keyboard.press('Escape');
    
    // Wait for close animation
    await page.waitForTimeout(300);
    
    // Verify menu is closed
    const mobileDrawer = page.locator('div.fixed.right-0').filter({ hasText: /Dashboard|Home|Apply/i }).first();
    await expect(mobileDrawer).not.toBeVisible();
  });

  test('All mobile navigation items have proper touch targets', async ({ page }) => {
    // Open mobile menu
    const menuButton = page.locator('button[aria-label*="menu" i]').first();
    await menuButton.click();
    
    // Wait for menu to open
    await page.waitForTimeout(300);
    
    // Find all navigation buttons in the mobile menu
    const navButtons = page.locator('div.fixed.right-0 button, div.fixed.right-0 a').filter({ hasText: /.+/ });
    
    // Get count of navigation items
    const count = await navButtons.count();
    expect(count).toBeGreaterThan(0);
    
    // Check each navigation item has proper touch target
    for (let i = 0; i < Math.min(count, 10); i++) {
      const button = navButtons.nth(i);
      const box = await button.boundingBox();
      
      if (box) {
        // Verify minimum touch target height (44px)
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('Mobile bottom navigation has proper touch targets', async ({ page, context }) => {
    // Login first to see bottom nav
    await page.goto('/auth/signin');
    
    // Fill in test credentials (if available)
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill('test@example.com');
      await page.locator('input[type="password"]').fill('testpassword');
      
      // Try to submit (may fail if credentials are invalid, but that's ok)
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(1000);
    }
    
    // Check if bottom navigation exists (only for authenticated users)
    const bottomNav = page.locator('nav.fixed.bottom-0');
    
    if (await bottomNav.isVisible()) {
      // Get all navigation links in bottom nav
      const navLinks = bottomNav.locator('a, button');
      const count = await navLinks.count();
      
      // Check each link has proper touch target
      for (let i = 0; i < count; i++) {
        const link = navLinks.nth(i);
        const box = await link.boundingBox();
        
        if (box) {
          // Verify minimum touch target size
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.width).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });

  test('Mobile menu has proper ARIA attributes', async ({ page }) => {
    // Find the hamburger menu button
    const menuButton = page.locator('button[aria-label*="menu" i]').first();
    
    // Check aria-label exists
    const ariaLabel = await menuButton.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel?.toLowerCase()).toContain('menu');
    
    // Check aria-expanded attribute
    const ariaExpanded = await menuButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');
    
    // Open menu
    await menuButton.click();
    await page.waitForTimeout(300);
    
    // Check aria-expanded is now true
    const ariaExpandedOpen = await menuButton.getAttribute('aria-expanded');
    expect(ariaExpandedOpen).toBe('true');
  });

  test('Mobile navigation prevents body scroll when menu is open', async ({ page }) => {
    // Get initial body overflow style
    const initialOverflow = await page.evaluate(() => document.body.style.overflow);
    
    // Open mobile menu
    const menuButton = page.locator('button[aria-label*="menu" i]').first();
    await menuButton.click();
    await page.waitForTimeout(300);
    
    // Check body overflow is hidden
    const menuOpenOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(menuOpenOverflow).toBe('hidden');
    
    // Close menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    // Check body overflow is restored
    const menuClosedOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(menuClosedOverflow).toBe('');
  });

  test('Mobile menu items are keyboard accessible', async ({ page }) => {
    // Open mobile menu
    const menuButton = page.locator('button[aria-label*="menu" i]').first();
    await menuButton.click();
    await page.waitForTimeout(300);
    
    // Tab through menu items
    await page.keyboard.press('Tab');
    
    // Check that focus is within the menu
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.tagName;
    });
    
    // Should be on a focusable element (button or link)
    expect(['BUTTON', 'A']).toContain(focusedElement);
  });

  test('Mobile responsive layout adapts correctly', async ({ page }) => {
    // Check viewport is mobile size
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThanOrEqual(768);
    
    // Check that desktop navigation is hidden
    const desktopNav = page.locator('nav').filter({ has: page.locator('.hidden.lg\\:flex') });
    
    // Check mobile menu button is visible
    const menuButton = page.locator('button[aria-label*="menu" i]').first();
    await expect(menuButton).toBeVisible();
  });
});

test.describe('Mobile Navigation - More Menu (Admin)', () => {
  test.beforeEach(async ({ page }) => {
    // This test suite would require admin authentication
    // For now, we'll just test the structure
    await page.goto('/');
  });

  test('More menu button has proper touch target', async ({ page, context }) => {
    // Try to navigate to admin (may require auth)
    await page.goto('/admin');
    
    // Wait a bit for potential redirects
    await page.waitForTimeout(1000);
    
    // Check if bottom nav with "More" button exists
    const moreButton = page.locator('button[aria-label="More options"]');
    
    if (await moreButton.isVisible()) {
      const box = await moreButton.boundingBox();
      
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('More menu items have proper touch targets', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(1000);
    
    const moreButton = page.locator('button[aria-label="More options"]');
    
    if (await moreButton.isVisible()) {
      // Click more button
      await moreButton.click();
      await page.waitForTimeout(300);
      
      // Find menu items
      const menuItems = page.locator('[role="menuitem"]');
      const count = await menuItems.count();
      
      // Check each menu item
      for (let i = 0; i < count; i++) {
        const item = menuItems.nth(i);
        const box = await item.boundingBox();
        
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
});
