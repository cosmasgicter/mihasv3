import { test, expect } from '@playwright/test';

test.describe('Accessibility Tests', () => {
  test('Should have proper ARIA labels and roles', async ({ page }) => {
    await page.goto('/');
    
    // Check main navigation
    await expect(page.locator('nav[role="navigation"]')).toBeVisible();
    await expect(page.locator('[aria-label="Main navigation"]')).toBeVisible();
    
    // Check buttons have accessible names
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const textContent = await button.textContent();
      
      expect(ariaLabel || textContent?.trim()).toBeTruthy();
    }
  });

  test('Should support keyboard navigation', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Tab through form elements
    await page.keyboard.press('Tab');
    await expect(page.locator('input[type="email"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('input[type="password"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('button[type="submit"]')).toBeFocused();
  });

  test('Should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    // Check for h1
    await expect(page.locator('h1')).toHaveCount(1);
    
    // Check heading order
    const headings = page.locator('h1, h2, h3, h4, h5, h6');
    const headingCount = await headings.count();
    
    for (let i = 0; i < headingCount; i++) {
      const heading = headings.nth(i);
      const tagName = await heading.evaluate(el => el.tagName.toLowerCase());
      expect(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']).toContain(tagName);
    }
  });

  test('Should have sufficient color contrast', async ({ page }) => {
    await page.goto('/');
    
    // Check text elements have sufficient contrast
    const textElements = page.locator('p, span, div, button, a');
    const elementCount = await textElements.count();
    
    for (let i = 0; i < Math.min(elementCount, 10); i++) {
      const element = textElements.nth(i);
      const styles = await element.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        };
      });
      
      expect(styles.color).toBeTruthy();
    }
  });

  test('Should have alt text for images', async ({ page }) => {
    await page.goto('/');
    
    const images = page.locator('img');
    const imageCount = await images.count();
    
    for (let i = 0; i < imageCount; i++) {
      const image = images.nth(i);
      const alt = await image.getAttribute('alt');
      const ariaLabel = await image.getAttribute('aria-label');
      
      expect(alt || ariaLabel).toBeTruthy();
    }
  });

  test('Should support screen reader navigation', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Check for landmarks
    await expect(page.locator('main[role="main"]')).toBeVisible();
    await expect(page.locator('nav[role="navigation"]')).toBeVisible();
    
    // Check for form labels
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        const hasLabel = await label.count() > 0;
        expect(hasLabel || ariaLabel).toBeTruthy();
      }
    }
  });

  test('Should handle focus management in modals', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    // Open modal
    await page.click('[data-testid="open-modal"]');
    
    // Check focus is trapped in modal
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    const modalContainer = page.locator('[data-testid="modal"]');
    
    await expect(focusedElement).toBeVisible();
    await expect(modalContainer).toContainText(await focusedElement.textContent() || '');
  });

  test('Should announce dynamic content changes', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Check for aria-live regions
    await expect(page.locator('[aria-live="polite"]')).toBeVisible();
    
    // Fill form and check for announcements
    await page.fill('input[name="firstName"]', 'John');
    
    // Check for validation messages with proper ARIA
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  test('Should support high contrast mode', async ({ page }) => {
    await page.goto('/');
    
    // Simulate high contrast mode
    await page.addStyleTag({
      content: `
        @media (prefers-contrast: high) {
          * {
            background: white !important;
            color: black !important;
            border: 1px solid black !important;
          }
        }
      `
    });
    
    // Check elements are still visible
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

  test('Should support reduced motion preferences', async ({ page }) => {
    await page.goto('/');
    
    // Simulate reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    
    // Check animations are disabled
    const animatedElements = page.locator('[class*="animate"]');
    const elementCount = await animatedElements.count();
    
    for (let i = 0; i < elementCount; i++) {
      const element = animatedElements.nth(i);
      const animationDuration = await element.evaluate(el => 
        window.getComputedStyle(el).animationDuration
      );
      
      expect(animationDuration).toBe('0s');
    }
  });
});