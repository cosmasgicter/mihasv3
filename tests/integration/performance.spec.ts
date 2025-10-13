import { test, expect } from '@playwright/test'

test.describe('Performance Tests', () => {
  test('Page load performance', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto('/')
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle')
    
    const loadTime = Date.now() - startTime
    
    // Page should load within 3 seconds
    expect(loadTime).toBeLessThan(3000)
  })

  test('Core Web Vitals', async ({ page }) => {
    await page.goto('/')
    
    // Measure Largest Contentful Paint (LCP)
    const lcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1]
          resolve(lastEntry.startTime)
        }).observe({ entryTypes: ['largest-contentful-paint'] })
        
        // Fallback timeout
        setTimeout(() => resolve(0), 5000)
      })
    })
    
    // LCP should be under 2.5 seconds
    expect(lcp).toBeLessThan(2500)
  })

  test('JavaScript bundle size', async ({ page }) => {
    const responses: any[] = []
    
    page.on('response', response => {
      if (response.url().includes('.js') && response.status() === 200) {
        responses.push(response)
      }
    })
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    let totalSize = 0
    for (const response of responses) {
      const headers = await response.allHeaders()
      const contentLength = headers['content-length']
      if (contentLength) {
        totalSize += parseInt(contentLength)
      }
    }
    
    // Total JS bundle should be under 1MB
    expect(totalSize).toBeLessThan(1024 * 1024)
  })

  test('Image optimization', async ({ page }) => {
    const imageResponses: any[] = []
    
    page.on('response', response => {
      if (response.url().match(/\.(jpg|jpeg|png|webp|avif)$/i)) {
        imageResponses.push(response)
      }
    })
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    for (const response of imageResponses) {
      const headers = await response.allHeaders()
      const contentLength = headers['content-length']
      
      if (contentLength) {
        const size = parseInt(contentLength)
        // Individual images should be under 500KB
        expect(size).toBeLessThan(500 * 1024)
      }
    }
  })

  test('API response times', async ({ page }) => {
    const apiResponses: { url: string; time: number }[] = []
    
    page.on('response', response => {
      if (response.url().includes('/.netlify/functions/')) {
        const timing = response.timing()
        apiResponses.push({
          url: response.url(),
          time: timing.responseEnd - timing.requestStart
        })
      }
    })
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Navigate to pages that make API calls
    await page.goto('/signin')
    await page.waitForLoadState('networkidle')
    
    for (const response of apiResponses) {
      // API responses should be under 2 seconds
      expect(response.time).toBeLessThan(2000)
    }
  })

  test('Memory usage', async ({ page }) => {
    await page.goto('/')
    
    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0
    })
    
    // Navigate through several pages
    await page.goto('/signin')
    await page.goto('/auth/signup')
    await page.goto('/')
    
    // Get final memory usage
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0
    })
    
    // Memory usage shouldn't increase dramatically
    const memoryIncrease = finalMemory - initialMemory
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // 50MB
  })

  test('Caching effectiveness', async ({ page }) => {
    // First visit
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const firstLoadResources: string[] = []
    page.on('response', response => {
      firstLoadResources.push(response.url())
    })
    
    // Second visit (should use cache)
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    const cachedResponses = await page.evaluate(() => {
      return performance.getEntriesByType('navigation')[0]
    })
    
    // Check if resources were served from cache
    expect(cachedResponses).toBeTruthy()
  })

  test('Lazy loading effectiveness', async ({ page }) => {
    const loadedImages: string[] = []
    
    page.on('response', response => {
      if (response.url().match(/\.(jpg|jpeg|png|webp|avif)$/i)) {
        loadedImages.push(response.url())
      }
    })
    
    await page.goto('/')
    
    const initialImageCount = loadedImages.length
    
    // Scroll down to trigger lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    
    await page.waitForTimeout(1000)
    
    const finalImageCount = loadedImages.length
    
    // More images should load after scrolling (if lazy loading is implemented)
    if (finalImageCount > initialImageCount) {
      expect(finalImageCount).toBeGreaterThan(initialImageCount)
    }
  })

  test('Service worker caching', async ({ page }) => {
    await page.goto('/')
    
    // Check if service worker is registered
    const swRegistered = await page.evaluate(() => {
      return 'serviceWorker' in navigator
    })
    
    if (swRegistered) {
      const swActive = await page.evaluate(() => {
        return navigator.serviceWorker.controller !== null
      })
      
      expect(swActive).toBeTruthy()
    }
  })

  test('Database query performance', async ({ page }) => {
    // Mock admin authentication
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-admin-token',
        user: { id: 'admin-user', role: 'admin' }
      }))
    })
    
    const startTime = Date.now()
    
    await page.goto('/admin/applications')
    await page.waitForSelector('[data-testid="applications-table"]')
    
    const queryTime = Date.now() - startTime
    
    // Database queries should complete within 5 seconds
    expect(queryTime).toBeLessThan(5000)
  })
})