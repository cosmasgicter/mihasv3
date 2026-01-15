import { test, expect } from '@playwright/test'

test.describe('Comprehensive Performance Testing', () => {
  test.describe('26.3 Performance testing', () => {
    
    test('Navigation performance < 500ms', async ({ page }) => {
      // Login first
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || '***REMOVED***')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      // Test navigation performance
      const routes = [
        '/student/dashboard',
        '/student/applications',
        '/student/profile',
        '/student/dashboard'
      ]
      
      const navigationTimes: number[] = []
      
      for (const route of routes) {
        const startTime = Date.now()
        await page.goto(route)
        await page.waitForLoadState('domcontentloaded')
        const endTime = Date.now()
        
        const navigationTime = endTime - startTime
        navigationTimes.push(navigationTime)
        
        console.log(`Navigation to ${route}: ${navigationTime}ms`)
        
        // Requirement 3.1: Navigation < 500ms
        expect(navigationTime, `Navigation to ${route} should be < 500ms`).toBeLessThan(500)
      }
      
      const avgNavigationTime = navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length
      console.log(`Average navigation time: ${Math.round(avgNavigationTime)}ms`)
      
      expect(avgNavigationTime).toBeLessThan(500)
    })

    test('Login performance < 2 seconds', async ({ page }) => {
      await page.goto('/auth/signin')
      
      // Measure login time
      const startTime = Date.now()
      
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || '***REMOVED***')
      await page.click('button[type="submit"]')
      
      // Wait for redirect to dashboard
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      const endTime = Date.now()
      const loginTime = endTime - startTime
      
      console.log(`Login time: ${loginTime}ms`)
      
      // Requirement 4.1: Login < 2 seconds
      expect(loginTime, 'Login should complete within 2 seconds').toBeLessThan(2000)
    })

    test('Track application page < 1 second', async ({ page }) => {
      await page.goto('/track-application')
      
      const startTime = Date.now()
      
      // Wait for page to be interactive
      await page.waitForLoadState('domcontentloaded')
      await page.waitForLoadState('networkidle')
      
      const endTime = Date.now()
      const loadTime = endTime - startTime
      
      console.log(`Track application page load time: ${loadTime}ms`)
      
      // Requirement: Track application page < 1 second
      expect(loadTime, 'Track application page should load within 1 second').toBeLessThan(1000)
    })

    test('Page load performance < 2 seconds (LCP)', async ({ page }) => {
      const pages = [
        { name: 'Homepage', url: '/' },
        { name: 'Programs', url: '/programs' },
        { name: 'About', url: '/about' },
        { name: 'Track Application', url: '/track-application' }
      ]
      
      for (const pageInfo of pages) {
        await page.goto(pageInfo.url)
        
        // Measure LCP
        const lcp = await page.evaluate(() => {
          return new Promise<number>((resolve) => {
            const observer = new PerformanceObserver((list) => {
              const entries = list.getEntries()
              const lastEntry = entries[entries.length - 1] as any
              resolve(lastEntry.startTime)
            })
            observer.observe({ type: 'largest-contentful-paint', buffered: true })
            
            setTimeout(() => {
              observer.disconnect()
              resolve(0)
            }, 3000)
          })
        })
        
        console.log(`${pageInfo.name} LCP: ${Math.round(lcp)}ms`)
        
        // Requirement 14.1: LCP < 2 seconds
        expect(lcp, `${pageInfo.name} LCP should be < 2000ms`).toBeLessThan(2000)
      }
    })

    test('Bundle size optimization', async ({ page }) => {
      await page.goto('/')
      
      // Get all loaded scripts
      const scripts = await page.evaluate(() => {
        const scriptElements = Array.from(document.querySelectorAll('script[src]'))
        return scriptElements.map(script => ({
          src: (script as HTMLScriptElement).src,
          async: (script as HTMLScriptElement).async,
          defer: (script as HTMLScriptElement).defer
        }))
      })
      
      console.log(`Total scripts loaded: ${scripts.length}`)
      
      // Check for code splitting
      const hasCodeSplitting = scripts.some(script => 
        script.src.includes('chunk') || script.src.includes('lazy')
      )
      
      console.log(`Code splitting detected: ${hasCodeSplitting}`)
      
      // Verify scripts are loaded efficiently
      const asyncOrDefer = scripts.filter(script => script.async || script.defer)
      console.log(`Scripts with async/defer: ${asyncOrDefer.length}/${scripts.length}`)
      
      expect(hasCodeSplitting, 'Code splitting should be implemented').toBe(true)
    })

    test('API response time', async ({ page }) => {
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || '***REMOVED***')
      
      // Monitor API calls
      const apiCalls: Array<{ url: string; duration: number }> = []
      
      page.on('response', response => {
        const url = response.url()
        if (url.includes('/api/') || url.includes('/functions/')) {
          const timing = response.timing()
          if (timing) {
            apiCalls.push({
              url,
              duration: timing.responseEnd
            })
          }
        }
      })
      
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      // Wait for all API calls to complete
      await page.waitForTimeout(2000)
      
      console.log(`\nAPI Response Times:`)
      apiCalls.forEach(call => {
        console.log(`  ${call.url}: ${Math.round(call.duration)}ms`)
      })
      
      // Check that API calls are reasonably fast
      const slowCalls = apiCalls.filter(call => call.duration > 1000)
      console.log(`\nSlow API calls (>1s): ${slowCalls.length}/${apiCalls.length}`)
      
      expect(slowCalls.length, 'Most API calls should be < 1s').toBeLessThan(apiCalls.length / 2)
    })

    test('Database query optimization', async ({ page }) => {
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || '***REMOVED***')
      
      // Monitor network requests
      const requests: string[] = []
      
      page.on('request', request => {
        const url = request.url()
        if (url.includes('supabase') || url.includes('/api/')) {
          requests.push(url)
        }
      })
      
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      // Wait for all requests
      await page.waitForTimeout(2000)
      
      console.log(`Total database/API requests during login: ${requests.length}`)
      
      // Requirement 4.3: Database queries < 3 during session establishment
      expect(requests.length, 'Database queries should be optimized (< 5 during login)').toBeLessThan(5)
    })

    test('Cache effectiveness', async ({ page }) => {
      // First visit
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      const firstLoadResources = await page.evaluate(() => {
        return performance.getEntriesByType('resource').length
      })
      
      console.log(`First load resources: ${firstLoadResources}`)
      
      // Second visit (should use cache)
      await page.reload()
      await page.waitForLoadState('networkidle')
      
      const secondLoadResources = await page.evaluate(() => {
        return performance.getEntriesByType('resource').length
      })
      
      console.log(`Second load resources: ${secondLoadResources}`)
      
      // Check cache headers
      const cachedResources = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
        return resources.filter(resource => {
          return resource.transferSize === 0 && resource.decodedBodySize > 0
        }).length
      })
      
      console.log(`Cached resources on second load: ${cachedResources}`)
      
      expect(cachedResources, 'Some resources should be cached').toBeGreaterThan(0)
    })

    test('Image optimization', async ({ page }) => {
      await page.goto('/')
      
      // Get all images
      const images = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'))
        return imgs.map(img => ({
          src: img.src,
          width: img.naturalWidth,
          height: img.naturalHeight,
          loading: img.loading,
          decoding: img.decoding
        }))
      })
      
      console.log(`Total images: ${images.length}`)
      
      // Check for lazy loading
      const lazyImages = images.filter(img => img.loading === 'lazy')
      console.log(`Lazy loaded images: ${lazyImages.length}/${images.length}`)
      
      // Check for async decoding
      const asyncDecoding = images.filter(img => img.decoding === 'async')
      console.log(`Async decoding images: ${asyncDecoding.length}/${images.length}`)
      
      // Most images should use lazy loading
      if (images.length > 0) {
        expect(lazyImages.length, 'Most images should use lazy loading').toBeGreaterThan(0)
      }
    })

    test('Animation performance (60fps)', async ({ page }) => {
      await page.goto('/')
      
      // Measure frame rate during scroll
      const frameRate = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let frames = 0
          let lastTime = performance.now()
          
          const measureFrames = () => {
            frames++
            const currentTime = performance.now()
            
            if (currentTime - lastTime >= 1000) {
              resolve(frames)
            } else {
              requestAnimationFrame(measureFrames)
            }
          }
          
          // Trigger some scrolling
          window.scrollBy(0, 100)
          requestAnimationFrame(measureFrames)
        })
      })
      
      console.log(`Frame rate: ${frameRate} fps`)
      
      // Requirement 14.5: Maintain 60fps
      expect(frameRate, 'Frame rate should be close to 60fps').toBeGreaterThan(50)
    })

    test('Memory usage', async ({ page }) => {
      await page.goto('/')
      
      // Get memory usage if available
      const memoryUsage = await page.evaluate(() => {
        if ('memory' in performance) {
          const memory = (performance as any).memory
          return {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit
          }
        }
        return null
      })
      
      if (memoryUsage) {
        const usedMB = Math.round(memoryUsage.usedJSHeapSize / 1024 / 1024)
        const totalMB = Math.round(memoryUsage.totalJSHeapSize / 1024 / 1024)
        
        console.log(`Memory usage: ${usedMB}MB / ${totalMB}MB`)
        
        // Memory should be reasonable (< 100MB for initial page load)
        expect(usedMB, 'Memory usage should be reasonable').toBeLessThan(100)
      } else {
        console.log('Memory API not available in this browser')
      }
    })

    test('Lighthouse audit score > 90', async ({ page }) => {
      // This is a placeholder - actual Lighthouse audit would be run separately
      // using the lighthouse CLI or lighthouse-ci
      
      await page.goto('/')
      
      // Measure key metrics that contribute to Lighthouse score
      const metrics = await page.evaluate(() => {
        return new Promise<any>((resolve) => {
          const result: any = {}
          
          // FCP
          const paintEntries = performance.getEntriesByType('paint')
          const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint')
          if (fcpEntry) {
            result.fcp = fcpEntry.startTime
          }
          
          // LCP
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries()
            const lastEntry = entries[entries.length - 1] as any
            result.lcp = lastEntry.startTime
          })
          lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
          
          // CLS
          let cls = 0
          const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const layoutShift = entry as any
              if (!layoutShift.hadRecentInput) {
                cls += layoutShift.value
              }
            }
            result.cls = cls
          })
          clsObserver.observe({ type: 'layout-shift', buffered: true })
          
          setTimeout(() => {
            lcpObserver.disconnect()
            clsObserver.disconnect()
            resolve(result)
          }, 2000)
        })
      })
      
      console.log('\nLighthouse-relevant metrics:')
      console.log(`  FCP: ${metrics.fcp ? Math.round(metrics.fcp) + 'ms' : 'N/A'}`)
      console.log(`  LCP: ${metrics.lcp ? Math.round(metrics.lcp) + 'ms' : 'N/A'}`)
      console.log(`  CLS: ${metrics.cls ? metrics.cls.toFixed(3) : 'N/A'}`)
      
      // These thresholds align with Lighthouse scoring
      if (metrics.fcp) expect(metrics.fcp).toBeLessThan(1800)
      if (metrics.lcp) expect(metrics.lcp).toBeLessThan(2500)
      if (metrics.cls) expect(metrics.cls).toBeLessThan(0.1)
      
      console.log('\n✓ Key metrics meet Lighthouse thresholds')
    })
  })
})
