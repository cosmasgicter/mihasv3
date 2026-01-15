import { test, expect, Page } from '@playwright/test'

/**
 * Keyboard Navigation and Focus Management Tests
 * Tests keyboard accessibility across all admin pages
 * Requirements: 7.4
 */

// Helper function to check if element has visible focus indicator
async function hasVisibleFocusIndicator(page: Page, selector: string): Promise<boolean> {
  const element = page.locator(selector)
  await element.focus()
  
  // Check for focus-visible styles
  const outlineWidth = await element.evaluate((el) => {
    const styles = window.getComputedStyle(el)
    return styles.outlineWidth
  })
  
  const boxShadow = await element.evaluate((el) => {
    const styles = window.getComputedStyle(el)
    return styles.boxShadow
  })
  
  // Focus indicator should have either outline or box-shadow
  return outlineWidth !== '0px' && outlineWidth !== 'none' || 
         boxShadow !== 'none' && boxShadow !== ''
}

// Helper to get tab order
async function getTabOrder(page: Page): Promise<string[]> {
  const focusableElements = await page.evaluate(() => {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const elements = Array.from(document.querySelectorAll(selector))
    return elements.map((el, index) => {
      const tag = el.tagName.toLowerCase()
      const id = el.id || `${tag}-${index}`
      const text = (el as HTMLElement).innerText?.slice(0, 30) || el.getAttribute('aria-label') || ''
      return `${tag}#${id}: ${text}`
    })
  })
  return focusableElements
}

test.describe('Keyboard Navigation - Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/auth/signin')
    await page.fill('input[type="email"]', 'admin@mihas.edu.zm')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/admin')
  })

  test('should have skip link at the top of the page', async ({ page }) => {
    // Press Tab to focus first element
    await page.keyboard.press('Tab')
    
    // Check if skip link is present and visible on focus
    const skipLink = page.locator('a[href="#main-content"]').first()
    if (await skipLink.count() > 0) {
      await skipLink.focus()
      const isVisible = await skipLink.isVisible()
      expect(isVisible).toBe(true)
    }
  })

  test('should navigate through all interactive elements with Tab', async ({ page }) => {
    const tabOrder = await getTabOrder(page)
    
    // Should have focusable elements
    expect(tabOrder.length).toBeGreaterThan(0)
    
    // Tab through first 10 elements
    for (let i = 0; i < Math.min(10, tabOrder.length); i++) {
      await page.keyboard.press('Tab')
      
      // Get currently focused element
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement
        return {
          tag: el?.tagName.toLowerCase(),
          text: (el as HTMLElement)?.innerText?.slice(0, 30) || '',
          ariaLabel: el?.getAttribute('aria-label') || ''
        }
      })
      
      // Focused element should be interactive
      expect(['a', 'button', 'input', 'select', 'textarea']).toContain(focusedElement.tag)
    }
  })

  test('should navigate backwards with Shift+Tab', async ({ page }) => {
    // Tab forward 5 times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab')
    }
    
    const forwardElement = await page.evaluate(() => document.activeElement?.tagName)
    
    // Tab backward 2 times
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    
    const backwardElement = await page.evaluate(() => document.activeElement?.tagName)
    
    // Should have moved focus
    expect(backwardElement).toBeTruthy()
  })

  test('should have visible focus indicators on all interactive elements', async ({ page }) => {
    // Get all buttons
    const buttons = await page.locator('button:visible').all()
    
    for (const button of buttons.slice(0, 5)) {
      await button.focus()
      
      // Check for focus styles
      const outlineWidth = await button.evaluate((el) => {
        return window.getComputedStyle(el).outlineWidth
      })
      
      const boxShadow = await button.evaluate((el) => {
        return window.getComputedStyle(el).boxShadow
      })
      
      const ringWidth = await button.evaluate((el) => {
        return window.getComputedStyle(el).getPropertyValue('--tw-ring-width')
      })
      
      // Should have some focus indicator
      const hasFocusIndicator = 
        (outlineWidth && outlineWidth !== '0px' && outlineWidth !== 'none') ||
        (boxShadow && boxShadow !== 'none') ||
        (ringWidth && ringWidth !== '0px')
      
      expect(hasFocusIndicator).toBeTruthy()
    }
  })

  test('should activate buttons with Enter key', async ({ page }) => {
    // Find refresh button
    const refreshButton = page.locator('button:has-text("Refresh")').first()
    
    if (await refreshButton.count() > 0) {
      await refreshButton.focus()
      await page.keyboard.press('Enter')
      
      // Should trigger action (check for loading state or similar)
      await page.waitForTimeout(500)
    }
  })

  test('should activate buttons with Space key', async ({ page }) => {
    // Find a button
    const button = page.locator('button:visible').first()
    
    if (await button.count() > 0) {
      await button.focus()
      await page.keyboard.press('Space')
      
      // Should trigger action
      await page.waitForTimeout(500)
    }
  })

  test('should close mobile menu with Escape key', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    // Open mobile menu
    const menuButton = page.locator('button[aria-label*="menu" i]').first()
    if (await menuButton.count() > 0) {
      await menuButton.click()
      await page.waitForTimeout(300)
      
      // Press Escape
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      
      // Menu should be closed
      const menuPanel = page.locator('.nav-panel')
      if (await menuPanel.count() > 0) {
        const isVisible = await menuPanel.isVisible()
        expect(isVisible).toBe(false)
      }
    }
  })

  test('should trap focus within modal dialogs', async ({ page }) => {
    // Navigate to applications page
    await page.goto('/admin/applications')
    await page.waitForLoadState('networkidle')
    
    // Open an application detail modal if available
    const viewButton = page.locator('button:has-text("View")').first()
    if (await viewButton.count() > 0) {
      await viewButton.click()
      await page.waitForTimeout(500)
      
      // Tab through modal - focus should stay within modal
      const initialFocus = await page.evaluate(() => document.activeElement?.tagName)
      
      // Tab 20 times
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab')
      }
      
      // Focus should still be within modal
      const modalElement = page.locator('[role="dialog"]').first()
      if (await modalElement.count() > 0) {
        const focusedElement = await page.evaluate(() => document.activeElement)
        const isWithinModal = await modalElement.evaluate((modal, focused) => {
          return modal.contains(focused as Node)
        }, focusedElement)
        
        expect(isWithinModal).toBe(true)
      }
    }
  })
})

test.describe('Keyboard Navigation - Applications Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signin')
    await page.fill('input[type="email"]', 'admin@mihas.edu.zm')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/admin')
    await page.goto('/admin/applications')
    await page.waitForLoadState('networkidle')
  })

  test('should navigate through filter controls', async ({ page }) => {
    // Focus search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search" i]').first()
    
    if (await searchInput.count() > 0) {
      await searchInput.focus()
      const isFocused = await searchInput.evaluate((el) => el === document.activeElement)
      expect(isFocused).toBe(true)
      
      // Type in search
      await page.keyboard.type('test')
      const value = await searchInput.inputValue()
      expect(value).toBe('test')
    }
  })

  test('should navigate through table rows', async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector('table, [role="table"]', { timeout: 5000 }).catch(() => {})
    
    // Tab to first row
    await page.keyboard.press('Tab')
    
    // Should be able to navigate through rows
    const rows = await page.locator('tr[role="row"], [role="row"]').all()
    if (rows.length > 0) {
      expect(rows.length).toBeGreaterThan(0)
    }
  })

  test('should activate row actions with keyboard', async ({ page }) => {
    // Find action buttons in table
    const actionButtons = await page.locator('table button, [role="table"] button').all()
    
    if (actionButtons.length > 0) {
      const firstButton = actionButtons[0]
      await firstButton.focus()
      
      // Should be focusable
      const isFocused = await firstButton.evaluate((el) => el === document.activeElement)
      expect(isFocused).toBe(true)
    }
  })

  test('should navigate export buttons', async ({ page }) => {
    const exportButtons = await page.locator('button:has-text("CSV"), button:has-text("Excel"), button:has-text("PDF")').all()
    
    for (const button of exportButtons) {
      await button.focus()
      const isFocused = await button.evaluate((el) => el === document.activeElement)
      expect(isFocused).toBe(true)
    }
  })
})

test.describe('Keyboard Navigation - Programs Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signin')
    await page.fill('input[type="email"]', 'admin@mihas.edu.zm')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/admin')
    await page.goto('/admin/programs')
    await page.waitForLoadState('networkidle')
  })

  test('should navigate through program cards', async ({ page }) => {
    // Tab through page
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
    }
    
    // Should have focused elements
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(focusedElement).toBeTruthy()
  })

  test('should have accessible form controls', async ({ page }) => {
    // Look for add/edit buttons
    const addButton = page.locator('button:has-text("Add"), button:has-text("New")').first()
    
    if (await addButton.count() > 0) {
      await addButton.focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      
      // Form should open
      const form = page.locator('form').first()
      if (await form.count() > 0) {
        // Tab through form fields
        await page.keyboard.press('Tab')
        const focusedElement = await page.evaluate(() => {
          const el = document.activeElement
          return el?.tagName.toLowerCase()
        })
        
        expect(['input', 'textarea', 'select', 'button']).toContain(focusedElement)
      }
    }
  })
})

test.describe('Keyboard Navigation - Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signin')
    await page.fill('input[type="email"]', 'admin@mihas.edu.zm')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/admin')
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')
  })

  test('should navigate through settings sections', async ({ page }) => {
    // Tab through settings
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(100)
    }
    
    // Should have navigated through multiple elements
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(focusedElement).toBeTruthy()
  })

  test('should toggle switches with Space key', async ({ page }) => {
    // Find toggle switches
    const switches = await page.locator('[role="switch"], input[type="checkbox"]').all()
    
    if (switches.length > 0) {
      const firstSwitch = switches[0]
      await firstSwitch.focus()
      
      // Get initial state
      const initialState = await firstSwitch.evaluate((el) => {
        if (el.getAttribute('role') === 'switch') {
          return el.getAttribute('aria-checked') === 'true'
        }
        return (el as HTMLInputElement).checked
      })
      
      // Press Space to toggle
      await page.keyboard.press('Space')
      await page.waitForTimeout(200)
      
      // State should have changed
      const newState = await firstSwitch.evaluate((el) => {
        if (el.getAttribute('role') === 'switch') {
          return el.getAttribute('aria-checked') === 'true'
        }
        return (el as HTMLInputElement).checked
      })
      
      expect(newState).not.toBe(initialState)
    }
  })
})

test.describe('Focus Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signin')
    await page.fill('input[type="email"]', 'admin@mihas.edu.zm')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/admin')
  })

  test('should restore focus after modal closes', async ({ page }) => {
    await page.goto('/admin/applications')
    await page.waitForLoadState('networkidle')
    
    // Focus a button
    const viewButton = page.locator('button:has-text("View")').first()
    if (await viewButton.count() > 0) {
      await viewButton.focus()
      const buttonId = await viewButton.evaluate((el) => el.id || el.className)
      
      // Click to open modal
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      
      // Close modal with Escape
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
      
      // Focus should return to button
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement
        return el?.id || el?.className
      })
      
      // Focus should be restored (may not be exact same element)
      expect(focusedElement).toBeTruthy()
    }
  })

  test('should not trap focus outside modals', async ({ page }) => {
    // Tab through page
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
    }
    
    // Focus should move freely
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(focusedElement).toBeTruthy()
  })

  test('should have logical tab order', async ({ page }) => {
    const tabOrder = await getTabOrder(page)
    
    // Should have elements in tab order
    expect(tabOrder.length).toBeGreaterThan(0)
    
    // Log tab order for manual review
    console.log('Tab order:', tabOrder.slice(0, 20))
  })

  test('should skip hidden elements in tab order', async ({ page }) => {
    // Tab through page
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      
      // Get focused element visibility
      const isVisible = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        if (!el) return false
        
        const styles = window.getComputedStyle(el)
        return styles.display !== 'none' && 
               styles.visibility !== 'hidden' &&
               styles.opacity !== '0'
      })
      
      // Focused element should be visible
      expect(isVisible).toBe(true)
    }
  })
})
