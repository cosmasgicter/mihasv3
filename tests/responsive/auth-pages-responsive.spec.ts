import { test, expect } from '@playwright/test'

/**
 * Responsive Tests for Auth Pages (Sign In, Sign Up)
 * Tests Requirements 7.1, 7.2, 7.3, 7.4:
 * - Mobile branding text visible on sign up page
 * - Mobile branding text visible on sign in page
 * - Informative text readable and properly styled on all screen sizes
 * - Mobile layout does not hide essential information
 */

// Test viewports
const viewports = {
  mobile: [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 12 Pro', width: 390, height: 844 },
    { name: 'Small Mobile', width: 320, height: 568 },
  ],
  tablet: [
    { name: 'iPad Mini', width: 768, height: 1024 },
  ],
  desktop: [
    { name: 'Desktop HD', width: 1280, height: 720 },
    { name: 'Desktop Full HD', width: 1920, height: 1080 },
  ],
}

test.describe('Auth Pages - Mobile Responsive', () => {
  for (const viewport of viewports.mobile) {
    test(`Sign In page should show mobile branding on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/auth/signin')
      await page.waitForLoadState('networkidle')

      // Verify mobile branding section is visible
      const mobileBranding = page.locator('.lg\\:hidden').filter({ hasText: 'Access your personalized portal' })
      await expect(mobileBranding).toBeVisible()

      // Verify informative text is readable
      const brandingText = mobileBranding.locator('p').first()
      await expect(brandingText).toBeVisible()
      const textBox = await brandingText.boundingBox()
      expect(textBox).not.toBeNull()
      expect(textBox!.width).toBeLessThanOrEqual(viewport.width - 32) // Account for padding

      // Verify feature badges are visible
      const featureBadges = mobileBranding.locator('span').filter({ hasText: /24\/7 Access|Fast Processing|Accredited Programs/ })
      const badgeCount = await featureBadges.count()
      expect(badgeCount).toBeGreaterThanOrEqual(1)

      // Verify no horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasHorizontalScroll).toBe(false)
    })

    test(`Sign Up page should show mobile branding on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/auth/signup')
      await page.waitForLoadState('networkidle')

      // Verify mobile branding section is visible
      const mobileBranding = page.locator('.lg\\:hidden').filter({ hasText: 'Access your personalized portal' })
      await expect(mobileBranding).toBeVisible()

      // Verify informative text is readable
      const brandingText = mobileBranding.locator('p').first()
      await expect(brandingText).toBeVisible()

      // Verify no horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasHorizontalScroll).toBe(false)
    })
  }

  test('Mobile branding should be hidden on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/auth/signin')
    await page.waitForLoadState('networkidle')

    // Mobile branding section should be hidden on desktop
    const mobileBranding = page.locator('.lg\\:hidden').filter({ hasText: 'Access your personalized portal' })
    await expect(mobileBranding).toBeHidden()

    // Desktop branding panel should be visible
    const desktopBranding = page.locator('.lg\\:flex').filter({ hasText: 'Grow your healthcare career' })
    await expect(desktopBranding).toBeVisible()
  })
})

test.describe('Auth Pages - Desktop Responsive', () => {
  for (const viewport of viewports.desktop) {
    test(`Sign In page should show branding panel on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/auth/signin')
      await page.waitForLoadState('networkidle')

      // Verify desktop branding panel is visible
      const brandingPanel = page.locator('.lg\\:flex').filter({ hasText: 'Grow your healthcare career' })
      await expect(brandingPanel).toBeVisible()

      // Verify feature cards are visible
      const featureCards = page.locator('.rounded-2xl').filter({ hasText: /24\/7 Access|Dedicated Support|Fast Processing|Accredited Programs/ })
      const cardCount = await featureCards.count()
      expect(cardCount).toBeGreaterThanOrEqual(4)

      // Verify no horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasHorizontalScroll).toBe(false)
    })
  }
})

test.describe('Auth Pages - Form Visibility', () => {
  test('Sign In form should be visible on all viewports', async ({ page }) => {
    const testViewports = [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1280, height: 720 },
    ]

    for (const viewport of testViewports) {
      await page.setViewportSize(viewport)
      await page.goto('/auth/signin')
      await page.waitForLoadState('networkidle')

      // Verify form title is visible
      const formTitle = page.locator('h2').filter({ hasText: /Sign in|Welcome back/i })
      await expect(formTitle).toBeVisible()

      // Verify email input is visible
      const emailInput = page.locator('input[type="email"], input[name="email"]')
      await expect(emailInput).toBeVisible()

      // Verify password input is visible
      const passwordInput = page.locator('input[type="password"]')
      await expect(passwordInput).toBeVisible()

      // Verify submit button is visible
      const submitButton = page.locator('button[type="submit"]')
      await expect(submitButton).toBeVisible()
    }
  })

  test('Sign Up form should be visible on all viewports', async ({ page }) => {
    const testViewports = [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1280, height: 720 },
    ]

    for (const viewport of testViewports) {
      await page.setViewportSize(viewport)
      await page.goto('/auth/signup')
      await page.waitForLoadState('networkidle')

      // Verify form title is visible
      const formTitle = page.locator('h2').filter({ hasText: /Sign up|Create|Register/i })
      await expect(formTitle).toBeVisible()

      // Verify email input is visible
      const emailInput = page.locator('input[type="email"], input[name="email"]')
      await expect(emailInput).toBeVisible()

      // Verify submit button is visible
      const submitButton = page.locator('button[type="submit"]')
      await expect(submitButton).toBeVisible()
    }
  })
})

test.describe('Auth Pages - Touch Targets', () => {
  test('Touch targets should be at least 44x44px on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/auth/signin')
    await page.waitForLoadState('networkidle')

    // Check button touch targets
    const buttons = page.locator('button')
    const buttonCount = await buttons.count()

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i)
      const isVisible = await button.isVisible()

      if (isVisible) {
        const box = await button.boundingBox()
        if (box && box.width > 0 && box.height > 0) {
          expect(box.height).toBeGreaterThanOrEqual(44)
        }
      }
    }
  })
})
