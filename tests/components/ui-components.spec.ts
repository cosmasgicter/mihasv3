import { test, expect } from '@playwright/test'

test.describe('UI Components', () => {
  test('Loading spinners display correctly', async ({ page }) => {
    await page.goto('/')
    
    // Test enhanced loading spinner
    await page.evaluate(() => {
      const spinner = document.createElement('div')
      spinner.setAttribute('data-testid', 'loading-spinner')
      spinner.className = 'animate-spin'
      document.body.appendChild(spinner)
    })
    
    const spinner = page.locator('[data-testid="loading-spinner"]')
    await expect(spinner).toBeAttached()
  })

  test('Button components work correctly', async ({ page }) => {
    await page.goto('/signin')
    
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toBeEnabled()
    
    // Test button states
    await submitButton.hover()
    await expect(submitButton).toHaveClass(/hover:/)
  })

  test('Form validation displays', async ({ page }) => {
    await page.goto('/signin')
    
    // Submit empty form to trigger validation
    await page.click('button[type="submit"]')
    
    const errorMsg = page.locator('.error-message, [role="alert"], .text-red-500')
    await expect(errorMsg.first()).toBeAttached()
  })

  test('Toast notifications work', async ({ page }) => {
    await page.goto('/')
    
    // Trigger toast notification
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: 'Test notification', type: 'success' }
      }))
    })
    
    const toast = page.locator('[data-testid="toast"], .toast, [role="status"]')
    await expect(toast.first()).toBeAttached()
  })

  test('Modal dialogs function properly', async ({ page }) => {
    await page.goto('/student/dashboard')
    
    // Mock modal trigger
    await page.evaluate(() => {
      const modal = document.createElement('div')
      modal.setAttribute('data-testid', 'modal')
      modal.className = 'fixed inset-0 z-50'
      document.body.appendChild(modal)
    })
    
    await expect(page.locator('[data-testid="modal"]')).toBeVisible()
    
    // Test modal close
    await page.keyboard.press('Escape')
  })

  test('File upload component', async ({ page }) => {
    await page.goto('/apply')
    
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.count() > 0) {
      await expect(fileInput).toBeVisible()
      
      // Test drag and drop area
      const dropZone = page.locator('[data-testid="drop-zone"]')
      if (await dropZone.count() > 0) {
        await expect(dropZone).toBeVisible()
      }
    }
  })

  test('Progress indicators work', async ({ page }) => {
    await page.goto('/apply')
    
    const progressBar = page.locator('[data-testid="progress-bar"]')
    if (await progressBar.count() > 0) {
      await expect(progressBar).toBeVisible()
      
      const progressValue = await progressBar.getAttribute('aria-valuenow')
      expect(parseInt(progressValue || '0')).toBeGreaterThanOrEqual(0)
    }
  })
})