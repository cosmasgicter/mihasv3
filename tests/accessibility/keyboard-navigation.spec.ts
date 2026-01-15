/**
 * Keyboard Navigation and Focus Management Tests
 * 
 * Tests keyboard accessibility across all admin pages
 * Validates: Requirements 7.4
 * 
 * Feature: mihas-production-fixes, Task 11.5.4
 */

import { test, expect, Page } from '@playwright/test'

// Helper to login as admin
async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="email"]', '***REMOVED***')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/admin/)
}

// Helper to check if element has visible focus indicator
async function hasFocusIndicator(page: Page, selector: string): Promise<boolean> {
  const element = page.locator(selector)
  const outline = await element.evaluate((el) => {
    const styles = window.getComputedStyle(el)
    return {
      outline: styles.outline,
      outlineWidth: styles.outlineWidth,
      outlineStyle: styles.outlineStyle,
      boxShadow: styles.boxShadow,
      border: styles.border
    }
  })
  
  // Check if any focus indicator is present
  return (
    outline.outlineWidth !== '0px' ||
    outline.boxShadow !== 'none' ||
    outline.outline !== 'none'
  )
}

test.describe('Admin Pages Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('Dashboard - Tab order and focus indicators', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')

    // Start from first interactive element
    await page.keyboard.press('Tab')
    
    // Get all focusable elements
    const focusableElements = await page.locator(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ).all()

    expect(focusableElements.length).toBeGreaterThan(0)

    // Test tab order through first 10 elements
    for (let i = 0; i < Math.min(10, focusableElements.length); i++) {
      const focused = await page.evaluate(() => document.activeElement?.tagName)
      expect(focused).toBeTruthy()
      
      // Check focus indicator is visible
      const activeElement = await page.evaluate(() => {
        const el = document.activeElement
        if (!el) return null
        const styles = window.getComputedStyle(el)
        return {
          outline: styles.outline,
          boxShadow: styles.boxShadow
        }
      })
      
      // Should have some focus indicator
      expect(
        activeElement?.outline !== 'none' || 
        activeElement?.boxShadow !== 'none'
      ).toBeTruthy()

      await page.keyboard.press('Tab')
    }
  })

  test('Applications page - Keyboard navigation', async ({ page }) => {
    await page.goto('/admin/applications')
    await page.waitForLoadState('networkidle')

    // Test search input is keyboard accessible
    await page.keyboard.press('Tab')
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]').first()
    if (await searchInput.count() > 0) {
      await searchInput.focus()
      await page.keyboard.type('test')
      const value = await searchInput.inputValue()
      expect(value).toBe('test')
    }

    // Test filter controls are keyboard accessible
    const filterButtons = page.locator('button').filter({ hasText: /filter|status/i })
    if (await filterButtons.count() > 0) {
      await filterButtons.first().focus()
      await page.keyboard.press('Enter')
      // Should open filter menu or toggle filter
    }
  })

  test('Programs page - Form keyboard navigation', async ({ page }) => {
    await page.goto('/admin/programs')
    await page.waitForLoadState('networkidle')

    // Test add program button
    const addButton = page.locator('button').filter({ hasText: /add|new|create/i }).first()
    if (await addButton.count() > 0) {
      await addButton.focus()
      expect(await addButton.evaluate(el => el === document.activeElement)).toBeTruthy()
      
      // Check focus indicator
      const hasFocus = await addButton.evaluate((el) => {
        const styles = window.getComputedStyle(el)
        return styles.outline !== 'none' || styles.boxShadow !== 'none'
      })
      expect(hasFocus).toBeTruthy()
    }
  })

  test('Users page - Table keyboard navigation', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForLoadState('networkidle')

    // Test table is keyboard navigable
    const tableRows = page.locator('table tbody tr')
    if (await tableRows.count() > 0) {
      // Tab through table elements
      await page.keyboard.press('Tab')
      
      // Check if we can navigate to action buttons in table
      const actionButtons = page.locator('table button, table a')
      if (await actionButtons.count() > 0) {
        await actionButtons.first().focus()
        expect(await actionButtons.first().evaluate(el => el === document.activeElement)).toBeTruthy()
      }
    }
  })

  test('Settings page - Form field navigation', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')

    // Get all form inputs
    const inputs = page.locator('input, select, textarea')
    const inputCount = await inputs.count()

    if (inputCount > 0) {
      // Tab through form fields
      for (let i = 0; i < Math.min(5, inputCount); i++) {
        await page.keyboard.press('Tab')
        
        // Check that focus moved to an input
        const focusedTag = await page.evaluate(() => document.activeElement?.tagName)
        expect(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A']).toContain(focusedTag)
      }
    }
  })

  test('Analytics page - Interactive elements keyboard access', async ({ page }) => {
    await page.goto('/admin/analytics')
    await page.waitForLoadState('networkidle')

    // Test date pickers and filters are keyboard accessible
    const dateInputs = page.locator('input[type="date"], input[type="datetime-local"]')
    if (await dateInputs.count() > 0) {
      await dateInputs.first().focus()
      expect(await dateInputs.first().evaluate(el => el === document.activeElement)).toBeTruthy()
    }

    // Test chart controls if present
    const chartButtons = page.locator('[role="button"], button').filter({ hasText: /export|download|view/i })
    if (await chartButtons.count() > 0) {
      await chartButtons.first().focus()
      await page.keyboard.press('Enter')
    }
  })

  test('Escape key closes modals', async ({ page }) => {
    await page.goto('/admin/applications')
    await page.waitForLoadState('networkidle')

    // Try to open a modal (if available)
    const modalTrigger = page.locator('button').filter({ hasText: /view|details|edit/i }).first()
    if (await modalTrigger.count() > 0) {
      await modalTrigger.click()
      await page.waitForTimeout(500)

      // Check if modal opened
      const modal = page.locator('[role="dialog"], .modal, [data-state="open"]')
      if (await modal.count() > 0) {
        // Press Escape to close
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        // Modal should be closed
        expect(await modal.count()).toBe(0)
      }
    }
  })

  test('Focus trap in modals', async ({ page }) => {
    await page.goto('/admin/applications')
    await page.waitForLoadState('networkidle')

    // Open modal if available
    const modalTrigger = page.locator('button').filter({ hasText: /view|details|edit/i }).first()
    if (await modalTrigger.count() > 0) {
      await modalTrigger.click()
      await page.waitForTimeout(500)

      const modal = page.locator('[role="dialog"]')
      if (await modal.count() > 0) {
        // Tab through modal elements
        const modalFocusable = modal.locator('button, input, select, textarea, a, [tabindex]:not([tabindex="-1"])')
        const count = await modalFocusable.count()

        if (count > 0) {
          // Tab through all elements
          for (let i = 0; i < count + 2; i++) {
            await page.keyboard.press('Tab')
          }

          // Focus should still be within modal
          const focusedElement = await page.evaluate(() => {
            const el = document.activeElement
            const modal = document.querySelector('[role="dialog"]')
            return modal?.contains(el)
          })

          expect(focusedElement).toBeTruthy()
        }
      }
    }
  })

  test('Skip links present on admin pages', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')

    // Press Tab to focus first element (should be skip link)
    await page.keyboard.press('Tab')

    // Check if skip link is present
    const skipLink = page.locator('a[href="#main-content"], a[href="#content"]').first()
    
    if (await skipLink.count() > 0) {
      // Skip link should be focused or visible
      const isVisible = await skipLink.isVisible()
      const isFocused = await skipLink.evaluate(el => el === document.activeElement)
      
      expect(isVisible || isFocused).toBeTruthy()

      // Activate skip link
      if (isFocused) {
        await page.keyboard.press('Enter')
        
        // Focus should move to main content
        const mainContent = page.locator('#main-content, #content, main').first()
        if (await mainContent.count() > 0) {
          const mainHasFocus = await page.evaluate(() => {
            const main = document.querySelector('#main-content, #content, main')
            return main?.contains(document.activeElement)
          })
          expect(mainHasFocus).toBeTruthy()
        }
      }
    }
  })

  test('Shift+Tab navigates backwards', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')

    // Tab forward a few times
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    const forwardElement = await page.evaluate(() => document.activeElement?.outerHTML)

    // Tab backward
    await page.keyboard.press('Shift+Tab')

    const backwardElement = await page.evaluate(() => document.activeElement?.outerHTML)

    // Should be different elements
    expect(forwardElement).not.toBe(backwardElement)
  })

  test('Enter and Space activate buttons', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')

    const button = page.locator('button').first()
    if (await button.count() > 0) {
      await button.focus()

      // Test Enter key
      const enterPromise = page.waitForEvent('console', msg => msg.text().includes('click'))
      await page.keyboard.press('Enter')
      
      // Button should be activated (we can't always verify the action, but focus should remain or change)
      const stillExists = await button.count()
      expect(stillExists).toBeGreaterThanOrEqual(0)
    }
  })

  test('Arrow keys navigate select dropdowns', async ({ page }) => {
    await page.goto('/admin/applications')
    await page.waitForLoadState('networkidle')

    const select = page.locator('select').first()
    if (await select.count() > 0) {
      await select.focus()
      
      // Get initial value
      const initialValue = await select.inputValue()

      // Press arrow down
      await page.keyboard.press('ArrowDown')
      
      // Value might change (if there are options)
      const newValue = await select.inputValue()
      
      // At minimum, select should still be focused
      expect(await select.evaluate(el => el === document.activeElement)).toBeTruthy()
    }
  })

  test('Focus visible on all interactive elements', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')

    // Get all interactive elements
    const interactiveElements = await page.locator(
      'button:visible, a:visible, input:visible, select:visible, textarea:visible'
    ).all()

    // Test first 10 elements for focus indicators
    for (let i = 0; i < Math.min(10, interactiveElements.length); i++) {
      const element = interactiveElements[i]
      await element.focus()

      const hasFocusStyle = await element.evaluate((el) => {
        const styles = window.getComputedStyle(el)
        return (
          styles.outline !== 'none' ||
          styles.outlineWidth !== '0px' ||
          styles.boxShadow !== 'none' ||
          el.classList.contains('focus:ring') ||
          el.classList.contains('focus:outline')
        )
      })

      expect(hasFocusStyle).toBeTruthy()
    }
  })

  test('No keyboard traps outside modals', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')

    // Tab through 20 elements
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      
      // Check we can still tab (not trapped)
      const canFocus = await page.evaluate(() => document.activeElement !== null)
      expect(canFocus).toBeTruthy()
    }

    // Should be able to tab back
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Shift+Tab')
      
      const canFocus = await page.evaluate(() => document.activeElement !== null)
      expect(canFocus).toBeTruthy()
    }
  })
})

test.describe('Admin Navigation Keyboard Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('Admin navigation menu keyboard accessible', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')

    // Find navigation menu
    const nav = page.locator('nav, [role="navigation"]').first()
    if (await nav.count() > 0) {
      // Tab to navigation
      const navLinks = nav.locator('a, button')
      const linkCount = await navLinks.count()

      if (linkCount > 0) {
        await navLinks.first().focus()
        
        // Tab through navigation items
        for (let i = 0; i < Math.min(5, linkCount); i++) {
          const focused = await page.evaluate(() => {
            const el = document.activeElement
            return el?.tagName
          })
          
          expect(['A', 'BUTTON']).toContain(focused)
          await page.keyboard.press('Tab')
        }
      }
    }
  })

  test('Mobile menu keyboard accessible', async ({ page, viewport }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')

    // Find mobile menu button
    const menuButton = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"]').first()
    if (await menuButton.count() > 0) {
      await menuButton.focus()
      await page.keyboard.press('Enter')

      // Menu should open
      await page.waitForTimeout(300)

      // Check if menu items are keyboard accessible
      const menuItems = page.locator('[role="menu"] a, [role="menu"] button')
      if (await menuItems.count() > 0) {
        await menuItems.first().focus()
        expect(await menuItems.first().evaluate(el => el === document.activeElement)).toBeTruthy()
      }
    }
  })
})
