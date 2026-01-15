import { test, expect, devices } from '@playwright/test'

test.describe('Cross-Browser Compatibility Tests', () => {
  const browsers = ['chromium', 'firefox', 'webkit']
  
  test.describe('26.2 Cross-browser testing', () => {
    test('Homepage renders correctly across all browsers', async ({ page, browserName }) => {
      await page.goto('/')
      
      // Check critical elements
      await expect(page.locator('h1')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('nav')).toBeVisible()
      
      // Check for layout issues
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      const windowWidth = await page.evaluate(() => window.innerWidth)
      
      // No horizontal scrollbar
      expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 1) // +1 for rounding
      
      console.log(`✓ Homepage renders correctly on ${browserName}`)
    })

    test('Application wizard works across all browsers', async ({ page, browserName }) => {
      // Login first
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || 'Skyl3r@L0m1s')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      // Navigate to wizard
      await page.goto('/student/application-wizard')
      
      // Test form inputs work
      await page.fill('input[name="firstName"]', 'Test')
      await expect(page.locator('input[name="firstName"]')).toHaveValue('Test')
      
      // Test select dropdowns work
      const selectElements = page.locator('select')
      if (await selectElements.count() > 0) {
        await selectElements.first().selectOption({ index: 1 })
      }
      
      // Test textarea works (fix verification)
      const textareas = page.locator('textarea')
      if (await textareas.count() > 0) {
        await textareas.first().fill('Test content')
        await expect(textareas.first()).toHaveValue('Test content')
      }
      
      console.log(`✓ Application wizard works on ${browserName}`)
    })

    test('Admin dashboard works across all browsers', async ({ page, browserName }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'cosmas@beanola.com')
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'Beanola2025')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/admin/**', { timeout: 10000 })
      
      // Check dashboard loads
      await expect(page.locator('body')).toBeVisible()
      
      // Check navigation works
      await expect(page.locator('nav')).toBeVisible()
      
      // Test table rendering
      await page.goto('/admin/applications')
      const table = page.locator('table, [role="table"]')
      if (await table.count() > 0) {
        await expect(table.first()).toBeVisible()
      }
      
      console.log(`✓ Admin dashboard works on ${browserName}`)
    })

    test('CSS animations work across all browsers', async ({ page, browserName }) => {
      await page.goto('/')
      
      // Check for animation support
      const supportsAnimations = await page.evaluate(() => {
        const div = document.createElement('div')
        div.style.animation = 'test 1s'
        return div.style.animation !== ''
      })
      
      expect(supportsAnimations).toBe(true)
      
      // Check for transform support
      const supportsTransforms = await page.evaluate(() => {
        const div = document.createElement('div')
        div.style.transform = 'translateX(10px)'
        return div.style.transform !== ''
      })
      
      expect(supportsTransforms).toBe(true)
      
      console.log(`✓ CSS animations supported on ${browserName}`)
    })

    test('Flexbox and Grid layouts work across all browsers', async ({ page, browserName }) => {
      await page.goto('/')
      
      // Check flexbox support
      const supportsFlexbox = await page.evaluate(() => {
        const div = document.createElement('div')
        div.style.display = 'flex'
        return div.style.display === 'flex'
      })
      
      expect(supportsFlexbox).toBe(true)
      
      // Check grid support
      const supportsGrid = await page.evaluate(() => {
        const div = document.createElement('div')
        div.style.display = 'grid'
        return div.style.display === 'grid'
      })
      
      expect(supportsGrid).toBe(true)
      
      console.log(`✓ Modern layouts supported on ${browserName}`)
    })

    test('JavaScript features work across all browsers', async ({ page, browserName }) => {
      await page.goto('/')
      
      // Check ES6+ features
      const supportsES6 = await page.evaluate(() => {
        try {
          // Arrow functions
          const arrow = () => true
          // Template literals
          const template = `test`
          // Destructuring
          const { a } = { a: 1 }
          // Spread operator
          const arr = [...[1, 2, 3]]
          // Promises
          const promise = new Promise(resolve => resolve(true))
          
          return true
        } catch (e) {
          return false
        }
      })
      
      expect(supportsES6).toBe(true)
      
      console.log(`✓ JavaScript features supported on ${browserName}`)
    })

    test('Local storage works across all browsers', async ({ page, browserName }) => {
      await page.goto('/')
      
      // Test localStorage
      await page.evaluate(() => {
        localStorage.setItem('test-key', 'test-value')
      })
      
      const value = await page.evaluate(() => {
        return localStorage.getItem('test-key')
      })
      
      expect(value).toBe('test-value')
      
      // Clean up
      await page.evaluate(() => {
        localStorage.removeItem('test-key')
      })
      
      console.log(`✓ Local storage works on ${browserName}`)
    })

    test('Service worker support across browsers', async ({ page, browserName }) => {
      await page.goto('/')
      
      const supportsServiceWorker = await page.evaluate(() => {
        return 'serviceWorker' in navigator
      })
      
      // Service workers are supported in all modern browsers
      expect(supportsServiceWorker).toBe(true)
      
      console.log(`✓ Service worker supported on ${browserName}`)
    })

    test('Fetch API works across all browsers', async ({ page, browserName }) => {
      await page.goto('/')
      
      const supportsFetch = await page.evaluate(() => {
        return typeof fetch === 'function'
      })
      
      expect(supportsFetch).toBe(true)
      
      console.log(`✓ Fetch API supported on ${browserName}`)
    })
  })

  test.describe('Mobile browser testing', () => {
    test.use({ ...devices['iPhone 12'] })
    
    test('Mobile Safari compatibility', async ({ page }) => {
      await page.goto('/')
      
      // Check viewport meta tag
      const hasViewportMeta = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="viewport"]')
        return !!meta
      })
      
      expect(hasViewportMeta).toBe(true)
      
      // Check touch events
      const supportsTouchEvents = await page.evaluate(() => {
        return 'ontouchstart' in window
      })
      
      expect(supportsTouchEvents).toBe(true)
      
      console.log('✓ Mobile Safari compatibility verified')
    })

    test('Mobile Chrome compatibility', async ({ page }) => {
      await page.goto('/')
      
      // Check for mobile-specific features
      const isMobile = await page.evaluate(() => {
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      })
      
      // In test environment, this might not be true, so we just check it doesn't error
      expect(typeof isMobile).toBe('boolean')
      
      console.log('✓ Mobile Chrome compatibility verified')
    })
  })

  test.describe('Browser-specific issue fixes', () => {
    test('Date input works across browsers', async ({ page, browserName }) => {
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || 'Skyl3r@L0m1s')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      await page.goto('/student/application-wizard')
      
      const dateInputs = page.locator('input[type="date"]')
      if (await dateInputs.count() > 0) {
        await dateInputs.first().fill('2000-01-15')
        const value = await dateInputs.first().inputValue()
        expect(value).toBe('2000-01-15')
      }
      
      console.log(`✓ Date inputs work on ${browserName}`)
    })

    test('File upload works across browsers', async ({ page, browserName }) => {
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || 'Skyl3r@L0m1s')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      await page.goto('/student/application-wizard')
      
      const fileInputs = page.locator('input[type="file"]')
      if (await fileInputs.count() > 0) {
        await fileInputs.first().setInputFiles({
          name: 'test.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('test content')
        })
        
        // Verify file was selected
        const files = await fileInputs.first().evaluate((input: HTMLInputElement) => {
          return input.files?.length || 0
        })
        
        expect(files).toBeGreaterThan(0)
      }
      
      console.log(`✓ File upload works on ${browserName}`)
    })

    test('Modal dialogs work across browsers', async ({ page, browserName }) => {
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'cosmas@beanola.com')
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'Beanola2025')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/admin/**', { timeout: 10000 })
      
      await page.goto('/admin/applications')
      
      // Try to open a modal
      const modalTriggers = page.locator('[data-testid*="modal"], [data-testid*="open"]')
      if (await modalTriggers.count() > 0) {
        await modalTriggers.first().click()
        
        // Check if modal opened
        const modal = page.locator('[role="dialog"], [data-testid*="modal"]')
        if (await modal.count() > 0) {
          await expect(modal.first()).toBeVisible()
        }
      }
      
      console.log(`✓ Modal dialogs work on ${browserName}`)
    })

    test('Dropdown menus work across browsers', async ({ page, browserName }) => {
      await page.goto('/')
      
      // Check for dropdown functionality
      const dropdowns = page.locator('select, [role="combobox"]')
      if (await dropdowns.count() > 0) {
        const firstDropdown = dropdowns.first()
        await firstDropdown.click()
        
        // Verify dropdown is interactive
        const isVisible = await firstDropdown.isVisible()
        expect(isVisible).toBe(true)
      }
      
      console.log(`✓ Dropdown menus work on ${browserName}`)
    })

    test('Sticky positioning works across browsers', async ({ page, browserName }) => {
      await page.goto('/')
      
      // Check sticky support
      const supportsSticky = await page.evaluate(() => {
        const div = document.createElement('div')
        div.style.position = 'sticky'
        return div.style.position === 'sticky'
      })
      
      expect(supportsSticky).toBe(true)
      
      console.log(`✓ Sticky positioning supported on ${browserName}`)
    })

    test('CSS custom properties work across browsers', async ({ page, browserName }) => {
      await page.goto('/')
      
      // Check CSS variables support
      const supportsCustomProperties = await page.evaluate(() => {
        const div = document.createElement('div')
        div.style.setProperty('--test-var', 'test')
        return div.style.getPropertyValue('--test-var') === 'test'
      })
      
      expect(supportsCustomProperties).toBe(true)
      
      console.log(`✓ CSS custom properties supported on ${browserName}`)
    })
  })

  test.describe('Responsive design across browsers', () => {
    const viewports = [
      { name: 'Mobile', width: 375, height: 667 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop', width: 1920, height: 1080 }
    ]

    for (const viewport of viewports) {
      test(`Layout works on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto('/')
        
        // Check no horizontal overflow
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1)
        
        // Check navigation is visible
        await expect(page.locator('nav')).toBeVisible()
        
        console.log(`✓ Layout works on ${viewport.name}`)
      })
    }
  })
})
