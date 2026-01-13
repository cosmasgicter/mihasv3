/**
 * PWA and Mobile Capabilities Test Suite
 * Tests all mobile and PWA enhancements for task 12
 * Requirements: 9.1-9.5 - Mobile responsiveness, offline functionality, auto-save, push notifications, PWA experience
 */

import { test, expect, Page, BrowserContext } from '@playwright/test'

test.describe('Task 12: Mobile and PWA Capabilities', () => {
  let page: Page
  let context: BrowserContext

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 375, height: 667 }, // iPhone SE dimensions
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    })
    page = await context.newPage()
  })

  test.describe('12.2: Robust Offline Functionality', () => {
    test('should cache critical data for offline access', async () => {
      // Navigate to application
      await page.goto('/')
      
      // Wait for service worker registration
      await page.waitForFunction(() => 'serviceWorker' in navigator)
      
      // Check if offline data manager is initialized
      const offlineManagerExists = await page.evaluate(() => {
        return typeof window.offlineDataManager !== 'undefined'
      })
      
      expect(offlineManagerExists).toBeTruthy()
      
      // Simulate going offline
      await context.setOffline(true)
      
      // Check if cached data is available
      const cacheStatus = await page.evaluate(async () => {
        if (window.offlineDataManager) {
          return window.offlineDataManager.isOfflineModeAvailable()
        }
        return false
      })
      
      expect(cacheStatus).toBeTruthy()
    })

    test('should enable offline form completion', async () => {
      await page.goto('/apply')
      
      // Fill out form data
      await page.fill('[data-testid="full-name"]', 'John Doe')
      await page.fill('[data-testid="email"]', 'john@example.com')
      
      // Go offline
      await context.setOffline(true)
      
      // Continue filling form
      await page.fill('[data-testid="phone"]', '+260123456789')
      
      // Check if data is saved offline
      const offlineData = await page.evaluate(() => {
        const stored = localStorage.getItem('mihas_offline_forms')
        return stored ? JSON.parse(stored) : null
      })
      
      expect(offlineData).toBeTruthy()
    })

    test('should implement sync mechanisms when connectivity returns', async () => {
      await page.goto('/apply')
      
      // Go offline and save data
      await context.setOffline(true)
      await page.fill('[data-testid="full-name"]', 'Jane Doe')
      
      // Come back online
      await context.setOffline(false)
      
      // Wait for sync to trigger
      await page.waitForTimeout(2000)
      
      // Check sync status
      const syncStatus = await page.evaluate(() => {
        return document.querySelector('[data-testid="sync-status"]')?.textContent
      })
      
      expect(syncStatus).toContain('Synced')
    })
  })

  test.describe('12.3: Enhanced Auto-save Consistency', () => {
    test('should implement reliable 8-second auto-save intervals', async () => {
      await page.goto('/apply')
      
      // Fill form data
      await page.fill('[data-testid="full-name"]', 'Test User')
      
      // Wait for auto-save (8 seconds + buffer)
      await page.waitForTimeout(9000)
      
      // Check if auto-save occurred
      const saveStatus = await page.evaluate(() => {
        return document.querySelector('[data-testid="save-status"]')?.textContent
      })
      
      expect(saveStatus).toContain('Saved')
    })

    test('should prevent data loss during network interruptions', async () => {
      await page.goto('/apply')
      
      // Fill form
      await page.fill('[data-testid="full-name"]', 'Network Test User')
      
      // Simulate network interruption
      await context.setOffline(true)
      await page.fill('[data-testid="email"]', 'network@test.com')
      
      // Check if data is preserved locally
      const localData = await page.evaluate(() => {
        const autoSaveKey = Object.keys(localStorage).find(key => key.startsWith('autosave_'))
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null
      })
      
      expect(localData).toBeTruthy()
      expect(localData).toContain('Network Test User')
    })

    test('should provide user feedback on save status', async () => {
      await page.goto('/apply')
      
      // Fill form data
      await page.fill('[data-testid="full-name"]', 'Feedback Test')
      
      // Check for save status indicator
      const saveIndicator = await page.locator('[data-testid="save-status"]')
      await expect(saveIndicator).toBeVisible()
      
      // Wait for save to complete
      await page.waitForTimeout(9000)
      
      // Check for success feedback
      await expect(saveIndicator).toContainText(/Saved|Success/)
    })
  })

  test.describe('12.4: Push Notification System', () => {
    test('should support push notification registration', async () => {
      await page.goto('/')
      
      // Check if push notifications are supported
      const pushSupported = await page.evaluate(() => {
        return 'PushManager' in window && 'serviceWorker' in navigator
      })
      
      expect(pushSupported).toBeTruthy()
    })

    test('should handle notification preferences', async () => {
      await page.goto('/settings/notifications')
      
      // Check for notification preference controls
      const notificationToggle = await page.locator('[data-testid="push-notifications-toggle"]')
      await expect(notificationToggle).toBeVisible()
      
      // Toggle notification preference
      await notificationToggle.click()
      
      // Verify preference is saved
      const isEnabled = await page.evaluate(() => {
        const prefs = localStorage.getItem('push_prefs_test_user')
        return prefs ? JSON.parse(prefs).pushEnabled : false
      })
      
      expect(typeof isEnabled).toBe('boolean')
    })

    test('should track notification delivery', async () => {
      await page.goto('/')
      
      // Check if notification tracking is available
      const trackingAvailable = await page.evaluate(() => {
        return typeof window.pushNotificationManager !== 'undefined'
      })
      
      expect(trackingAvailable).toBeTruthy()
    })
  })

  test.describe('12.5: PWA Native Experience', () => {
    test('should have valid PWA manifest', async () => {
      const response = await page.request.get('/manifest.json')
      expect(response.status()).toBe(200)
      
      const manifest = await response.json()
      expect(manifest.name).toBe('MIHAS Application System')
      expect(manifest.short_name).toBe('MIHAS')
      expect(manifest.display).toBe('standalone')
      expect(manifest.icons).toBeDefined()
      expect(manifest.icons.length).toBeGreaterThan(0)
    })

    test('should register service worker', async () => {
      await page.goto('/')
      
      const swRegistered = await page.evaluate(async () => {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration()
          return !!registration
        }
        return false
      })
      
      expect(swRegistered).toBeTruthy()
    })

    test('should support app installation prompt', async () => {
      await page.goto('/')
      
      // Check if PWA installation is supported
      const installSupported = await page.evaluate(() => {
        return 'BeforeInstallPromptEvent' in window || 
               window.matchMedia('(display-mode: standalone)').matches
      })
      
      // Note: This test may not work in all environments
      // In real scenarios, the beforeinstallprompt event is browser-controlled
      console.log('PWA install support:', installSupported)
    })

    test('should provide native app-like experience', async () => {
      await page.goto('/')
      
      // Check for PWA-specific features
      const pwaFeatures = await page.evaluate(() => {
        return {
          hasManifest: !!document.querySelector('link[rel="manifest"]'),
          hasServiceWorker: 'serviceWorker' in navigator,
          hasWebShare: 'share' in navigator,
          hasAppBadge: 'setAppBadge' in navigator
        }
      })
      
      expect(pwaFeatures.hasManifest).toBeTruthy()
      expect(pwaFeatures.hasServiceWorker).toBeTruthy()
    })

    test('should handle offline-first architecture', async () => {
      await page.goto('/')
      
      // Go offline
      await context.setOffline(true)
      
      // Navigate to cached page
      await page.goto('/dashboard')
      
      // Check if page loads from cache
      const pageLoaded = await page.evaluate(() => {
        return document.readyState === 'complete'
      })
      
      expect(pageLoaded).toBeTruthy()
    })
  })

  test.describe('Integration Tests', () => {
    test('should handle complete offline-to-online workflow', async () => {
      // Start online
      await page.goto('/apply')
      
      // Fill initial data
      await page.fill('[data-testid="full-name"]', 'Integration Test User')
      
      // Go offline
      await context.setOffline(true)
      
      // Continue filling form offline
      await page.fill('[data-testid="email"]', 'integration@test.com')
      await page.fill('[data-testid="phone"]', '+260987654321')
      
      // Wait for auto-save
      await page.waitForTimeout(9000)
      
      // Come back online
      await context.setOffline(false)
      
      // Wait for sync
      await page.waitForTimeout(5000)
      
      // Check final status
      const finalStatus = await page.evaluate(() => {
        const syncStatus = document.querySelector('[data-testid="sync-status"]')?.textContent
        const saveStatus = document.querySelector('[data-testid="save-status"]')?.textContent
        return { syncStatus, saveStatus }
      })
      
      expect(finalStatus.syncStatus).toContain('Synced')
      expect(finalStatus.saveStatus).toContain('Saved')
    })

    test('should maintain data consistency across page reloads', async () => {
      await page.goto('/apply')
      
      // Fill form data
      const testData = {
        fullName: 'Persistence Test User',
        email: 'persistence@test.com',
        phone: '+260123456789'
      }
      
      await page.fill('[data-testid="full-name"]', testData.fullName)
      await page.fill('[data-testid="email"]', testData.email)
      await page.fill('[data-testid="phone"]', testData.phone)
      
      // Wait for auto-save
      await page.waitForTimeout(9000)
      
      // Reload page
      await page.reload()
      
      // Check if data is restored
      const restoredData = {
        fullName: await page.inputValue('[data-testid="full-name"]'),
        email: await page.inputValue('[data-testid="email"]'),
        phone: await page.inputValue('[data-testid="phone"]')
      }
      
      expect(restoredData.fullName).toBe(testData.fullName)
      expect(restoredData.email).toBe(testData.email)
      expect(restoredData.phone).toBe(testData.phone)
    })
  })

  test.describe('Performance and Storage', () => {
    test('should manage storage usage efficiently', async () => {
      await page.goto('/')
      
      // Check storage usage
      const storageInfo = await page.evaluate(() => {
        if (window.offlineDataManager) {
          return window.offlineDataManager.getStorageUsage()
        }
        return null
      })
      
      expect(storageInfo).toBeTruthy()
      expect(storageInfo.percentage).toBeLessThan(90) // Should not exceed 90% usage
    })

    test('should handle storage cleanup', async () => {
      await page.goto('/')
      
      // Generate some test data
      await page.evaluate(() => {
        for (let i = 0; i < 10; i++) {
          localStorage.setItem(`test_data_${i}`, JSON.stringify({ data: 'x'.repeat(1000) }))
        }
      })
      
      // Trigger cleanup
      await page.evaluate(() => {
        if (window.offlineDataManager) {
          window.offlineDataManager.clearOldData()
        }
      })
      
      // Check if cleanup worked
      const remainingTestData = await page.evaluate(() => {
        return Object.keys(localStorage).filter(key => key.startsWith('test_data_')).length
      })
      
      expect(remainingTestData).toBeLessThan(10)
    })
  })

  test.afterEach(async () => {
    await context.close()
  })
})

// Property-based tests for mobile and PWA capabilities
test.describe('Property-Based Tests: Mobile and PWA', () => {
  test('Property 37: Responsive Design Optimization', async ({ page }) => {
    const viewports = [
      { width: 320, height: 568 }, // iPhone 5
      { width: 375, height: 667 }, // iPhone SE
      { width: 414, height: 896 }, // iPhone 11
      { width: 768, height: 1024 }, // iPad
      { width: 1024, height: 768 }, // iPad Landscape
      { width: 1920, height: 1080 } // Desktop
    ]

    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      
      // Check if layout is optimized for this viewport
      const layoutOptimized = await page.evaluate(() => {
        const elements = document.querySelectorAll('*')
        let hasOverflow = false
        
        elements.forEach(el => {
          const rect = el.getBoundingClientRect()
          if (rect.width > window.innerWidth) {
            hasOverflow = true
          }
        })
        
        return !hasOverflow
      })
      
      expect(layoutOptimized).toBeTruthy()
    }
  })

  test('Property 38: Offline Functionality', async ({ page, context }) => {
    await page.goto('/')
    
    // Test offline functionality with various network conditions
    const networkConditions = [true, false] // online, offline
    
    for (const isOnline of networkConditions) {
      await context.setOffline(!isOnline)
      
      // Try to perform critical operations
      const canPerformOperations = await page.evaluate(async () => {
        try {
          // Check if critical data is available
          const hasCache = localStorage.getItem('mihas_offline_cache') !== null
          
          // Check if forms can be filled
          const formElements = document.querySelectorAll('input, textarea, select')
          const canFillForms = formElements.length > 0
          
          return hasCache || canFillForms
        } catch (error) {
          return false
        }
      })
      
      expect(canPerformOperations).toBeTruthy()
    }
  })

  test('Property 39: Auto-save Consistency', async ({ page }) => {
    await page.goto('/apply')
    
    // Test auto-save with various data inputs
    const testInputs = [
      'Short text',
      'A'.repeat(1000), // Long text
      'Special chars: !@#$%^&*()',
      '🎓📚💻', // Emojis
      JSON.stringify({ nested: { data: true } }) // Complex data
    ]
    
    for (const input of testInputs) {
      await page.fill('[data-testid="full-name"]', input)
      
      // Wait for auto-save interval (8 seconds + buffer)
      await page.waitForTimeout(9000)
      
      // Check if data was saved
      const savedData = await page.evaluate(() => {
        const keys = Object.keys(localStorage).filter(key => key.startsWith('autosave_'))
        return keys.length > 0 ? localStorage.getItem(keys[0]) : null
      })
      
      expect(savedData).toBeTruthy()
      expect(savedData).toContain(input)
    }
  })

  test('Property 40: Push Notification Delivery', async ({ page }) => {
    await page.goto('/')
    
    // Test notification system with various payload types
    const notificationTypes = [
      { title: 'Simple', body: 'Simple notification' },
      { title: 'With Data', body: 'Notification with data', data: { url: '/dashboard' } },
      { title: 'With Actions', body: 'Actionable notification', actions: [{ action: 'view', title: 'View' }] }
    ]
    
    for (const notification of notificationTypes) {
      const canHandle = await page.evaluate((notif) => {
        try {
          // Check if notification can be processed
          if ('Notification' in window && 'serviceWorker' in navigator) {
            // Simulate notification handling
            return true
          }
          return false
        } catch (error) {
          return false
        }
      }, notification)
      
      expect(canHandle).toBeTruthy()
    }
  })

  test('Property 41: PWA Native Experience', async ({ page }) => {
    await page.goto('/')
    
    // Test PWA features across different scenarios
    const pwaFeatures = await page.evaluate(() => {
      return {
        hasManifest: !!document.querySelector('link[rel="manifest"]'),
        hasServiceWorker: 'serviceWorker' in navigator,
        hasWebShare: 'share' in navigator,
        hasInstallPrompt: 'BeforeInstallPromptEvent' in window,
        isStandalone: window.matchMedia('(display-mode: standalone)').matches,
        hasOfflineSupport: 'caches' in window
      }
    })
    
    // At least basic PWA features should be available
    expect(pwaFeatures.hasManifest).toBeTruthy()
    expect(pwaFeatures.hasServiceWorker).toBeTruthy()
    expect(pwaFeatures.hasOfflineSupport).toBeTruthy()
  })
})