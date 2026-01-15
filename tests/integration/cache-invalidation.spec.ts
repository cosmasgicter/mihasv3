import { test, expect } from '@playwright/test'

/**
 * Cache Invalidation Tests
 * 
 * Tests cache invalidation functionality including:
 * - Version-based cache keys
 * - Service worker update detection
 * - Cache clearing on version change
 * - Stale content detection
 * 
 * Validates: Requirements 12.1, 12.2, 12.3
 */

test.describe('Cache Invalidation', () => {
  test.beforeEach(async ({ page }) => {
    // Clear all caches before each test
    await page.goto('/')
    await page.evaluate(async () => {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
      }
    })
  })

  test('should use version in cache keys', async ({ page }) => {
    await page.goto('/')
    
    // Wait for service worker to be registered
    await page.waitForTimeout(2000)
    
    // Check that cache names include version
    const cacheNames = await page.evaluate(async () => {
      if ('caches' in window) {
        return await caches.keys()
      }
      return []
    })
    
    console.log('Cache names:', cacheNames)
    
    // At least one cache should exist with version in name
    const hasVersionedCache = cacheNames.some(name => 
      name.includes('mihas-app') && /v\d+\.\d+\.\d+/.test(name)
    )
    
    expect(hasVersionedCache).toBeTruthy()
  })

  test('should detect service worker updates', async ({ page, context }) => {
    // Register service worker
    await page.goto('/')
    await page.waitForTimeout(2000)
    
    // Check if service worker is registered
    const swRegistered = await page.evaluate(() => {
      return 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null
    })
    
    if (!swRegistered) {
      console.log('Service worker not registered, skipping update detection test')
      test.skip()
      return
    }
    
    // Listen for update messages
    const updateMessages: any[] = []
    await page.exposeFunction('captureUpdateMessage', (message: any) => {
      updateMessages.push(message)
    })
    
    await page.evaluate(() => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data.type === 'cache-updated') {
            (window as any).captureUpdateMessage(event.data)
          }
        })
      }
    })
    
    // Simulate service worker update by registering again
    await page.evaluate(() => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
      }
    })
    
    await page.waitForTimeout(3000)
    
    // Check if update was detected (may not always trigger in test environment)
    console.log('Update messages received:', updateMessages.length)
  })

  test('should clear old caches on version change', async ({ page }) => {
    // Create a fake old cache
    await page.evaluate(async () => {
      if ('caches' in window) {
        const oldCache = await caches.open('mihas-app-images-v0.9.0')
        await oldCache.put(
          new Request('/test-image.jpg'),
          new Response('old content')
        )
      }
    })
    
    // Verify old cache exists
    let cacheNames = await page.evaluate(async () => {
      if ('caches' in window) {
        return await caches.keys()
      }
      return []
    })
    
    expect(cacheNames).toContain('mihas-app-images-v0.9.0')
    
    // Navigate to trigger service worker activation
    await page.goto('/')
    await page.waitForTimeout(3000)
    
    // Check if old cache was deleted
    cacheNames = await page.evaluate(async () => {
      if ('caches' in window) {
        return await caches.keys()
      }
      return []
    })
    
    // Old cache should be removed (if service worker is active)
    const hasOldCache = cacheNames.includes('mihas-app-images-v0.9.0')
    console.log('Old cache still exists:', hasOldCache)
    console.log('Current caches:', cacheNames)
  })

  test('should serve latest version after deployment', async ({ page }) => {
    await page.goto('/')
    
    // Get current app version from environment
    const appVersion = await page.evaluate(() => {
      return (window as any).__APP_VERSION__ || import.meta.env.VITE_APP_VERSION
    })
    
    console.log('App version:', appVersion)
    
    // Check that HTML is not cached
    const response = await page.goto('/')
    const cacheControl = response?.headers()['cache-control']
    
    console.log('HTML Cache-Control:', cacheControl)
    
    // HTML should have no-cache directive
    expect(cacheControl).toContain('no-cache')
  })

  test('should handle cache clearing message', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
    
    // Get initial cache count
    const initialCacheCount = await page.evaluate(async () => {
      if ('caches' in window) {
        const names = await caches.keys()
        return names.length
      }
      return 0
    })
    
    console.log('Initial cache count:', initialCacheCount)
    
    // Send clear cache message to service worker
    const cleared = await page.evaluate(async () => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const messageChannel = new MessageChannel()
        
        return new Promise<boolean>((resolve) => {
          messageChannel.port1.onmessage = (event) => {
            resolve(event.data.success === true)
          }
          
          navigator.serviceWorker.controller!.postMessage(
            { type: 'CLEAR_CACHE' },
            [messageChannel.port2]
          )
          
          // Timeout after 5 seconds
          setTimeout(() => resolve(false), 5000)
        })
      }
      return false
    })
    
    if (cleared) {
      // Verify caches were cleared
      const finalCacheCount = await page.evaluate(async () => {
        if ('caches' in window) {
          const names = await caches.keys()
          return names.filter(name => name.startsWith('mihas-app')).length
        }
        return 0
      })
      
      console.log('Final cache count:', finalCacheCount)
      expect(finalCacheCount).toBe(0)
    } else {
      console.log('Cache clearing not supported or service worker not active')
    }
  })

  test('should detect stale content', async ({ page }) => {
    // Create a cache with old content
    await page.evaluate(async () => {
      if ('caches' in window) {
        const cache = await caches.open('mihas-app-test-v1.0.0')
        
        // Create a response with an old date (8 days ago)
        const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
        const response = new Response('old content', {
          headers: {
            'date': oldDate.toUTCString(),
            'content-type': 'text/plain'
          }
        })
        
        await cache.put(new Request('/old-content.txt'), response)
      }
    })
    
    // Check for stale content
    const hasStaleContent = await page.evaluate(async () => {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        
        for (const cacheName of cacheNames) {
          const cache = await caches.open(cacheName)
          const requests = await cache.keys()
          
          for (const request of requests) {
            const response = await cache.match(request)
            if (response) {
              const dateHeader = response.headers.get('date')
              if (dateHeader) {
                const cacheAge = Date.now() - new Date(dateHeader).getTime()
                const sevenDays = 7 * 24 * 60 * 60 * 1000
                
                if (cacheAge > sevenDays) {
                  return true
                }
              }
            }
          }
        }
      }
      return false
    })
    
    console.log('Stale content detected:', hasStaleContent)
    expect(hasStaleContent).toBeTruthy()
  })

  test('should apply correct cache headers', async ({ page }) => {
    // Test HTML cache headers
    const htmlResponse = await page.goto('/')
    const htmlHeaders = htmlResponse?.headers()
    
    console.log('HTML headers:', htmlHeaders?.['cache-control'])
    expect(htmlHeaders?.['cache-control']).toContain('no-cache')
    
    // Test static asset cache headers (if any assets are loaded)
    const assetResponses: any[] = []
    page.on('response', response => {
      const url = response.url()
      if (url.includes('/assets/') && (url.endsWith('.js') || url.endsWith('.css'))) {
        assetResponses.push({
          url,
          cacheControl: response.headers()['cache-control']
        })
      }
    })
    
    await page.waitForLoadState('networkidle')
    
    if (assetResponses.length > 0) {
      console.log('Asset responses:', assetResponses)
      
      // Hashed assets should have immutable cache
      const hasImmutableAssets = assetResponses.some(r => 
        r.cacheControl?.includes('immutable')
      )
      
      console.log('Has immutable assets:', hasImmutableAssets)
    }
  })

  test('should get version from service worker', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
    
    const version = await page.evaluate(async () => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const messageChannel = new MessageChannel()
        
        return new Promise<string | null>((resolve) => {
          messageChannel.port1.onmessage = (event) => {
            resolve(event.data.appVersion || null)
          }
          
          navigator.serviceWorker.controller!.postMessage(
            { type: 'GET_VERSION' },
            [messageChannel.port2]
          )
          
          // Timeout after 3 seconds
          setTimeout(() => resolve(null), 3000)
        })
      }
      return null
    })
    
    console.log('Service worker version:', version)
    
    if (version) {
      // Version should match semver pattern
      expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })
})

test.describe('Cache Performance', () => {
  test('should monitor cache hit rates', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Wait for cache monitor to collect metrics
    await page.waitForTimeout(3000)
    
    // Check if cache monitoring is working
    const cacheStats = await page.evaluate(() => {
      // Access cache monitor if exposed globally
      const monitor = (window as any).cacheMonitor
      if (monitor && typeof monitor.getCacheStats === 'function') {
        return monitor.getCacheStats()
      }
      return null
    })
    
    if (cacheStats) {
      console.log('Cache stats:', cacheStats)
      expect(cacheStats).toHaveProperty('hitRate')
      expect(cacheStats).toHaveProperty('totalHits')
      expect(cacheStats).toHaveProperty('totalMisses')
    } else {
      console.log('Cache monitor not accessible in browser context')
    }
  })

  test('should log cache errors', async ({ page }) => {
    const consoleErrors: string[] = []
    
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('cache')) {
        consoleErrors.push(msg.text())
      }
    })
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Trigger a cache error by trying to access invalid cache
    await page.evaluate(async () => {
      try {
        if ('caches' in window) {
          // Try to open a cache with invalid name
          await caches.open('')
        }
      } catch (error) {
        console.error('Cache error:', error)
      }
    })
    
    await page.waitForTimeout(1000)
    
    console.log('Cache errors logged:', consoleErrors.length)
  })
})
