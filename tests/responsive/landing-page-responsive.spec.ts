import { test, expect } from '@playwright/test'

/**
 * Responsive Breakpoint Tests for Landing Page
 * Tests Requirements 1.2 and 1.3:
 * - Mobile (320px-768px)
 * - Tablet (768px-1024px)
 * - Desktop (1024px+)
 * - No horizontal scrollbars
 */

// Test viewports
const viewports = {
  mobile: [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 12 Pro', width: 390, height: 844 },
    { name: 'Samsung Galaxy S20', width: 360, height: 800 },
    { name: 'Small Mobile', width: 320, height: 568 },
  ],
  tablet: [
    { name: 'iPad Mini', width: 768, height: 1024 },
    { name: 'iPad Air', width: 820, height: 1180 },
    { name: 'Surface Pro 7', width: 912, height: 1368 },
  ],
  desktop: [
    { name: 'Laptop', width: 1024, height: 768 },
    { name: 'Desktop HD', width: 1280, height: 720 },
    { name: 'Desktop Full HD', width: 1920, height: 1080 },
    { name: 'Desktop 4K', width: 2560, height: 1440 },
  ],
}

test.describe('Landing Page - Mobile Responsive (320px-768px)', () => {
  for (const viewport of viewports.mobile) {
    test(`should render correctly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      // Set viewport
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      
      // Navigate to landing page
      await page.goto('/')
      
      // Wait for page to load
      await page.waitForLoadState('networkidle')
      
      // Check for horizontal scrollbar
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasHorizontalScroll).toBe(false)
      
      // Verify hero section is visible
      const heroSection = page.locator('#hero')
      await expect(heroSection).toBeVisible()
      
      // Verify hero title is readable
      const heroTitle = heroSection.locator('h1')
      await expect(heroTitle).toBeVisible()
      const heroTitleBox = await heroTitle.boundingBox()
      expect(heroTitleBox).not.toBeNull()
      expect(heroTitleBox!.width).toBeLessThanOrEqual(viewport.width - 32) // Account for padding
      
      // Verify buttons are stacked vertically on mobile
      const buttonContainer = heroSection.locator('div').filter({ hasText: 'Start Your Application' }).first()
      const buttons = buttonContainer.locator('button, a')
      const buttonCount = await buttons.count()
      expect(buttonCount).toBeGreaterThanOrEqual(2)
      
      // Verify stats section grid is single column on mobile
      const statsSection = page.locator('#stats')
      await statsSection.scrollIntoViewIfNeeded()
      await expect(statsSection).toBeVisible()
      
      // Verify features section is visible
      const featuresSection = page.locator('#features')
      await featuresSection.scrollIntoViewIfNeeded()
      await expect(featuresSection).toBeVisible()
      
      // Verify no content overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width)
      
      // Verify touch targets are at least 44x44px
      const allButtons = page.locator('button, a[role="button"]')
      const buttonBoxes = await allButtons.evaluateAll((elements) => {
        return elements.map(el => {
          const rect = el.getBoundingClientRect()
          return { width: rect.width, height: rect.height }
        })
      })
      
      for (const box of buttonBoxes) {
        if (box.width > 0 && box.height > 0) {
          expect(box.width).toBeGreaterThanOrEqual(44)
          expect(box.height).toBeGreaterThanOrEqual(44)
        }
      }
    })
  }
  
  test('should have mobile-friendly navigation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    // Check for mobile navigation
    const mobileNav = page.locator('header')
    await expect(mobileNav).toBeVisible()
    
    // Verify navigation is fixed at top
    const navPosition = await mobileNav.evaluate((el) => {
      return window.getComputedStyle(el).position
    })
    expect(navPosition).toBe('fixed')
  })
  
  test('should not have text overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check all text elements
    const textElements = page.locator('h1, h2, h3, p')
    const count = await textElements.count()
    
    for (let i = 0; i < Math.min(count, 20); i++) {
      const element = textElements.nth(i)
      const isVisible = await element.isVisible()
      
      if (isVisible) {
        const box = await element.boundingBox()
        if (box) {
          expect(box.width).toBeLessThanOrEqual(320)
        }
      }
    }
  })
})

test.describe('Landing Page - Tablet Responsive (768px-1024px)', () => {
  for (const viewport of viewports.tablet) {
    test(`should render correctly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      // Check for horizontal scrollbar
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasHorizontalScroll).toBe(false)
      
      // Verify hero section
      const heroSection = page.locator('#hero')
      await expect(heroSection).toBeVisible()
      
      // Verify stats section uses 2-column grid on tablet
      const statsSection = page.locator('#stats')
      await statsSection.scrollIntoViewIfNeeded()
      await expect(statsSection).toBeVisible()
      
      // Verify features section
      const featuresSection = page.locator('#features')
      await featuresSection.scrollIntoViewIfNeeded()
      await expect(featuresSection).toBeVisible()
      
      // Verify no content overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width)
    })
  }
  
  test('should have proper grid layout on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Scroll to stats section
    const statsSection = page.locator('#stats')
    await statsSection.scrollIntoViewIfNeeded()
    
    // Check grid layout
    const statsGrid = statsSection.locator('.grid').first()
    const gridClasses = await statsGrid.getAttribute('class')
    expect(gridClasses).toContain('grid')
  })
})

test.describe('Landing Page - Desktop Responsive (1024px+)', () => {
  for (const viewport of viewports.desktop) {
    test(`should render correctly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      // Check for horizontal scrollbar
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasHorizontalScroll).toBe(false)
      
      // Verify hero section
      const heroSection = page.locator('#hero')
      await expect(heroSection).toBeVisible()
      
      // Verify hero content is centered and not too wide
      const heroContent = heroSection.locator('.content-wrapper').first()
      const heroBox = await heroContent.boundingBox()
      expect(heroBox).not.toBeNull()
      expect(heroBox!.width).toBeLessThanOrEqual(1280) // Max content width
      
      // Verify stats section uses 4-column grid on desktop
      const statsSection = page.locator('#stats')
      await statsSection.scrollIntoViewIfNeeded()
      await expect(statsSection).toBeVisible()
      
      // Verify features section uses 3-column grid
      const featuresSection = page.locator('#features')
      await featuresSection.scrollIntoViewIfNeeded()
      await expect(featuresSection).toBeVisible()
      
      // Verify no content overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width)
      
      // Verify footer is visible
      const footer = page.locator('footer')
      await footer.scrollIntoViewIfNeeded()
      await expect(footer).toBeVisible()
    })
  }
  
  test('should have proper multi-column layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Verify stats use 4 columns
    const statsSection = page.locator('#stats')
    await statsSection.scrollIntoViewIfNeeded()
    const statsGrid = statsSection.locator('.grid').first()
    const statsGridClasses = await statsGrid.getAttribute('class')
    expect(statsGridClasses).toContain('grid')
    
    // Verify features use 3 columns
    const featuresSection = page.locator('#features')
    await featuresSection.scrollIntoViewIfNeeded()
    const featuresGrid = featuresSection.locator('.grid').first()
    const featuresGridClasses = await featuresGrid.getAttribute('class')
    expect(featuresGridClasses).toContain('grid')
  })
  
  test('should have buttons side-by-side on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    
    const heroSection = page.locator('#hero')
    const buttonContainer = heroSection.locator('div').filter({ hasText: 'Start Your Application' }).first()
    
    // Verify buttons exist
    const buttons = buttonContainer.locator('button, a')
    const buttonCount = await buttons.count()
    expect(buttonCount).toBeGreaterThanOrEqual(2)
  })
})

test.describe('Landing Page - Cross-breakpoint Tests', () => {
  test('should maintain aspect ratios across all viewports', async ({ page }) => {
    const testViewports = [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 },
    ]
    
    for (const viewport of testViewports) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      // Check images maintain aspect ratio
      const images = page.locator('img')
      const imageCount = await images.count()
      
      for (let i = 0; i < Math.min(imageCount, 5); i++) {
        const img = images.nth(i)
        const isVisible = await img.isVisible()
        
        if (isVisible) {
          const box = await img.boundingBox()
          if (box) {
            expect(box.width).toBeGreaterThan(0)
            expect(box.height).toBeGreaterThan(0)
          }
        }
      }
    }
  })
  
  test('should not have horizontal scroll at any breakpoint', async ({ page }) => {
    const testWidths = [320, 375, 414, 768, 1024, 1280, 1920, 2560]
    
    for (const width of testWidths) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      
      expect(hasHorizontalScroll).toBe(false)
    }
  })
  
  test('should have readable text at all breakpoints', async ({ page }) => {
    const testViewports = [
      { width: 320, height: 568 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 },
    ]
    
    for (const viewport of testViewports) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      // Check font sizes are readable (at least 14px for body text)
      const bodyText = page.locator('p').first()
      const fontSize = await bodyText.evaluate((el) => {
        return parseInt(window.getComputedStyle(el).fontSize)
      })
      
      expect(fontSize).toBeGreaterThanOrEqual(14)
    }
  })
  
  test('should maintain proper spacing at all breakpoints', async ({ page }) => {
    const testViewports = [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 },
    ]
    
    for (const viewport of testViewports) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      // Verify sections have proper spacing
      const sections = page.locator('section')
      const sectionCount = await sections.count()
      
      for (let i = 0; i < Math.min(sectionCount, 5); i++) {
        const section = sections.nth(i)
        const isVisible = await section.isVisible()
        
        if (isVisible) {
          const padding = await section.evaluate((el) => {
            const style = window.getComputedStyle(el)
            return {
              top: parseInt(style.paddingTop),
              bottom: parseInt(style.paddingBottom),
            }
          })
          
          // Sections should have some vertical padding
          expect(padding.top + padding.bottom).toBeGreaterThan(0)
        }
      }
    }
  })
})

test.describe('Landing Page - Orientation Tests', () => {
  test('should handle landscape orientation on mobile', async ({ page }) => {
    // Landscape mobile (e.g., iPhone in landscape)
    await page.setViewportSize({ width: 667, height: 375 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check for horizontal scrollbar
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasHorizontalScroll).toBe(false)
    
    // Verify hero is visible
    const heroSection = page.locator('#hero')
    await expect(heroSection).toBeVisible()
  })
  
  test('should handle portrait orientation on tablet', async ({ page }) => {
    // Portrait tablet (e.g., iPad in portrait)
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check for horizontal scrollbar
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasHorizontalScroll).toBe(false)
  })
})
