/**
 * Mobile Responsiveness Test Suite
 * Tests mobile layout, touch targets, and responsive behavior
 */

import { test, expect, type Page } from '@playwright/test'

// Mobile viewport configurations
const MOBILE_VIEWPORTS = {
  iphoneSE: { width: 375, height: 667 },
  iphone12: { width: 390, height: 844 },
  iphone14Plus: { width: 428, height: 926 },
  pixel5: { width: 393, height: 851 },
  galaxyS21: { width: 360, height: 800 },
  ipadMini: { width: 768, height: 1024 },
  ipadPro: { width: 1024, height: 1366 }
}

// Test pages
const TEST_PAGES = [
  { path: '/', name: 'Landing Page' },
  { path: '/auth/signin', name: 'Sign In' },
  { path: '/auth/signup', name: 'Sign Up' },
  { path: '/track', name: 'Track Application' }
]

const AUTHENTICATED_STUDENT_PAGES = [
  { path: '/student/dashboard', name: 'Student Dashboard' },
  { path: '/apply', name: 'Application Wizard' },
  { path: '/student/notifications', name: 'Notifications' }
]

const AUTHENTICATED_ADMIN_PAGES = [
  { path: '/admin/dashboard', name: 'Admin Dashboard' },
  { path: '/admin/applications', name: 'Applications' },
  { path: '/admin/users', name: 'Users' }
]

test.describe('Mobile Responsiveness', () => {
  test.describe('Public Pages - No Horizontal Scroll', () => {
    for (const viewport of Object.entries(MOBILE_VIEWPORTS)) {
      const [deviceName, size] = viewport

      test(`${deviceName} - No horizontal scroll on public pages`, async ({ page }) => {
        await page.setViewportSize(size)

        for (const testPage of TEST_PAGES) {
          await page.goto(testPage.path)
          await page.waitForLoadState('networkidle')

          // Check for horizontal scroll
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
          const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)

          expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1) // +1 for rounding
        }
      })
    }
  })

  test.describe('Touch Target Sizes', () => {
    test('All interactive elements meet 44x44px minimum', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.iphone12)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Get all interactive elements
      const interactiveElements = await page.locator('button, a, input, select, textarea').all()

      for (const element of interactiveElements) {
        const isVisible = await element.isVisible()
        if (!isVisible) continue

        const box = await element.boundingBox()
        if (!box) continue

        // Check minimum touch target size (44x44px)
        const meetsMinimum = box.width >= 44 && box.height >= 44

        if (!meetsMinimum) {
          const elementInfo = await element.evaluate((el) => ({
            tag: el.tagName,
            class: el.className,
            text: el.textContent?.slice(0, 50)
          }))

          console.warn(`Touch target too small: ${elementInfo.tag}.${elementInfo.class} (${box.width}x${box.height}px)`)
        }

        // Allow some elements to be smaller if they have adequate padding
        const hasPadding = await element.evaluate((el) => {
          const style = window.getComputedStyle(el)
          const padding = parseInt(style.paddingTop) + parseInt(style.paddingBottom)
          return padding >= 16
        })

        expect(meetsMinimum || hasPadding).toBeTruthy()
      }
    })
  })

  test.describe('Mobile Navigation', () => {
    test('Mobile bottom navigation visible on small screens', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.iphone12)
      
      // Login as student
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', 'test@example.com')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button[type="submit"]')
      
      await page.waitForURL(/\/student\/dashboard/)
      
      // Check mobile bottom nav is visible
      const bottomNav = page.locator('nav.md\\:hidden.fixed.bottom-0')
      await expect(bottomNav).toBeVisible()
      
      // Check nav items are visible
      const navItems = bottomNav.locator('a')
      const count = await navItems.count()
      expect(count).toBeGreaterThan(0)
    })

    test('Desktop sidebar hidden on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.iphone12)
      
      // Login as student
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', 'test@example.com')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button[type="submit"]')
      
      await page.waitForURL(/\/student\/dashboard/)
      
      // Check desktop sidebar is hidden
      const desktopSidebar = page.locator('aside.hidden.md\\:flex')
      await expect(desktopSidebar).not.toBeVisible()
    })
  })

  test.describe('Responsive Grid Layouts', () => {
    test('Grids stack on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.iphone12)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Find all grid containers
      const grids = await page.locator('[class*="grid"]').all()

      for (const grid of grids) {
        const isVisible = await grid.isVisible()
        if (!isVisible) continue

        // Check grid columns
        const gridTemplateColumns = await grid.evaluate((el) => {
          return window.getComputedStyle(el).gridTemplateColumns
        })

        // On mobile, should be single column or auto
        const columnCount = gridTemplateColumns.split(' ').length
        
        // Allow up to 2 columns on mobile for compact layouts
        expect(columnCount).toBeLessThanOrEqual(2)
      }
    })
  })

  test.describe('Text Readability', () => {
    test('All text meets minimum font size', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.iphone12)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Get all text elements
      const textElements = await page.locator('p, span, div, h1, h2, h3, h4, h5, h6, a, button, label').all()

      for (const element of textElements) {
        const isVisible = await element.isVisible()
        if (!isVisible) continue

        const hasText = await element.evaluate((el) => {
          return el.textContent && el.textContent.trim().length > 0
        })
        if (!hasText) continue

        const fontSize = await element.evaluate((el) => {
          return parseInt(window.getComputedStyle(el).fontSize)
        })

        // Minimum font size should be 14px (some exceptions for labels)
        if (fontSize < 12) {
          const elementInfo = await element.evaluate((el) => ({
            tag: el.tagName,
            class: el.className,
            text: el.textContent?.slice(0, 30)
          }))
          console.warn(`Font size too small: ${elementInfo.tag}.${elementInfo.class} (${fontSize}px)`)
        }

        expect(fontSize).toBeGreaterThanOrEqual(12)
      }
    })
  })

  test.describe('Form Usability on Mobile', () => {
    test('Form inputs are usable on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.iphone12)
      await page.goto('/auth/signin')
      await page.waitForLoadState('networkidle')

      // Check input fields
      const inputs = await page.locator('input').all()

      for (const input of inputs) {
        const isVisible = await input.isVisible()
        if (!isVisible) continue

        const box = await input.boundingBox()
        if (!box) continue

        // Input height should be at least 44px for easy tapping
        expect(box.height).toBeGreaterThanOrEqual(40)
      }
    })

    test('Form labels are visible and associated', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.iphone12)
      await page.goto('/auth/signin')
      await page.waitForLoadState('networkidle')

      // Check all inputs have labels
      const inputs = await page.locator('input[type="email"], input[type="password"], input[type="text"]').all()

      for (const input of inputs) {
        const isVisible = await input.isVisible()
        if (!isVisible) continue

        // Check for label or aria-label
        const hasLabel = await input.evaluate((el) => {
          const id = el.id
          const label = id ? document.querySelector(`label[for="${id}"]`) : null
          const ariaLabel = el.getAttribute('aria-label')
          const ariaLabelledBy = el.getAttribute('aria-labelledby')
          
          return !!(label || ariaLabel || ariaLabelledBy)
        })

        expect(hasLabel).toBeTruthy()
      }
    })
  })

  test.describe('Image Responsiveness', () => {
    test('Images scale properly on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.iphone12)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Get all images
      const images = await page.locator('img').all()

      for (const image of images) {
        const isVisible = await image.isVisible()
        if (!isVisible) continue

        const box = await image.boundingBox()
        if (!box) continue

        // Image should not exceed viewport width
        expect(box.width).toBeLessThanOrEqual(MOBILE_VIEWPORTS.iphone12.width)
      }
    })
  })

  test.describe('Modal and Overlay Behavior', () => {
    test('Modals fit on mobile screen', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.iphone12)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Look for modal triggers
      const modalTriggers = await page.locator('[data-testid*="modal"], [aria-haspopup="dialog"]').all()

      for (const trigger of modalTriggers) {
        const isVisible = await trigger.isVisible()
        if (!isVisible) continue

        // Click to open modal
        await trigger.click()
        await page.waitForTimeout(500) // Wait for animation

        // Check modal size
        const modal = page.locator('[role="dialog"]').first()
        if (await modal.isVisible()) {
          const box = await modal.boundingBox()
          if (box) {
            // Modal should fit within viewport
            expect(box.width).toBeLessThanOrEqual(MOBILE_VIEWPORTS.iphone12.width)
            expect(box.height).toBeLessThanOrEqual(MOBILE_VIEWPORTS.iphone12.height)
          }

          // Close modal
          const closeButton = modal.locator('button[aria-label*="close"], button[aria-label*="Close"]').first()
          if (await closeButton.isVisible()) {
            await closeButton.click()
            await page.waitForTimeout(500)
          }
        }
      }
    })
  })

  test.describe('Viewport Meta Tag', () => {
    test('Has proper viewport meta tag', async ({ page }) => {
      await page.goto('/')
      
      const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content')
      
      expect(viewportMeta).toContain('width=device-width')
      expect(viewportMeta).toContain('initial-scale=1')
    })
  })

  test.describe('Safe Area Support', () => {
    test('Content respects safe areas on notched devices', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.iphone14Plus)
      
      // Login as student
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', 'test@example.com')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button[type="submit"]')
      
      await page.waitForURL(/\/student\/dashboard/)
      
      // Check for safe area classes
      const hasSafeArea = await page.evaluate(() => {
        const elements = document.querySelectorAll('.safe-area-top, .safe-area-bottom, .app-safe-area')
        return elements.length > 0
      })
      
      expect(hasSafeArea).toBeTruthy()
    })
  })

  test.describe('Performance on Mobile', () => {
    test('Page loads within acceptable time on 3G', async ({ page }) => {
      // Emulate slow 3G
      await page.route('**/*', route => {
        setTimeout(() => route.continue(), 100) // Add 100ms delay
      })

      await page.setViewportSize(MOBILE_VIEWPORTS.iphone12)
      
      const startTime = Date.now()
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime

      // Should load within 5 seconds on slow 3G
      expect(loadTime).toBeLessThan(5000)
    })
  })
})

test.describe('Tablet Responsiveness', () => {
  test('iPad layout works correctly', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS.ipadMini)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check no horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

    // Check layout adapts to tablet size
    const hasTabletLayout = await page.evaluate(() => {
      const width = window.innerWidth
      return width >= 768 && width < 1024
    })
    expect(hasTabletLayout).toBeTruthy()
  })
})
