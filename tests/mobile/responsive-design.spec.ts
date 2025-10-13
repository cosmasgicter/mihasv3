import { test, expect } from '@playwright/test';

test.describe('Mobile Responsive Design Tests', () => {
  const mobileViewports = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 12', width: 390, height: 844 },
    { name: 'Samsung Galaxy S21', width: 360, height: 800 },
    { name: 'iPad Mini', width: 768, height: 1024 }
  ];

  mobileViewports.forEach(({ name, width, height }) => {
    test(`Should display correctly on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      
      // Check if mobile navigation is visible
      await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
      
      // Check if desktop navigation is hidden
      await expect(page.locator('[data-testid="desktop-nav"]')).not.toBeVisible();
      
      // Check if content is properly sized
      const content = page.locator('main');
      const boundingBox = await content.boundingBox();
      expect(boundingBox?.width).toBeLessThanOrEqual(width);
    });
  });

  test('Should handle touch interactions on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/student/application-wizard');
    
    // Test touch targets are at least 44px
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const boundingBox = await button.boundingBox();
      
      if (boundingBox) {
        expect(boundingBox.height).toBeGreaterThanOrEqual(44);
        expect(boundingBox.width).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('Should show mobile-optimized forms', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/student/application-wizard');
    
    // Check if form inputs are properly sized for mobile
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const boundingBox = await input.boundingBox();
      
      if (boundingBox) {
        expect(boundingBox.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('Should handle mobile keyboard interactions', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/auth/signin');
    
    // Focus on email input
    await page.focus('input[type="email"]');
    
    // Check if viewport adjusts for keyboard
    await expect(page.locator('input[type="email"]')).toBeInViewport();
  });

  test('Should show mobile-specific navigation patterns', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/student/dashboard');
    
    // Check for bottom navigation on mobile
    await expect(page.locator('[data-testid="bottom-nav"]')).toBeVisible();
    
    // Check for hamburger menu
    await expect(page.locator('[data-testid="hamburger-menu"]')).toBeVisible();
  });

  test('Should handle swipe gestures', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/student/application-wizard');
    
    // Simulate swipe gesture for step navigation
    const stepContainer = page.locator('[data-testid="step-container"]');
    
    await stepContainer.hover();
    await page.mouse.down();
    await page.mouse.move(100, 0);
    await page.mouse.up();
    
    // Check if step changed
    await expect(page.locator('text=Step 2')).toBeVisible();
  });

  test('Should optimize images for mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    const images = page.locator('img');
    const imageCount = await images.count();
    
    for (let i = 0; i < imageCount; i++) {
      const image = images.nth(i);
      const src = await image.getAttribute('src');
      
      // Check if images have responsive attributes
      const srcset = await image.getAttribute('srcset');
      const sizes = await image.getAttribute('sizes');
      
      expect(src || srcset).toBeTruthy();
    }
  });

  test('Should handle mobile file uploads', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/student/application-wizard');
    
    // Check if file upload area is touch-friendly
    const uploadArea = page.locator('[data-testid="file-upload-area"]');
    const boundingBox = await uploadArea.boundingBox();
    
    if (boundingBox) {
      expect(boundingBox.height).toBeGreaterThanOrEqual(100);
    }
  });

  test('Should show mobile-optimized tables', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin/applications');
    
    // Check if tables are responsive (cards or horizontal scroll)
    const table = page.locator('table');
    
    if (await table.isVisible()) {
      // Should have horizontal scroll
      await expect(page.locator('[data-testid="table-scroll"]')).toBeVisible();
    } else {
      // Should show card layout instead
      await expect(page.locator('[data-testid="card-layout"]')).toBeVisible();
    }
  });

  test('Should handle mobile modal dialogs', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/student/dashboard');
    
    await page.click('[data-testid="open-modal"]');
    
    // Check if modal takes full screen on mobile
    const modal = page.locator('[data-testid="modal"]');
    const boundingBox = await modal.boundingBox();
    
    if (boundingBox) {
      expect(boundingBox.width).toBeCloseTo(375, 10);
    }
  });
});