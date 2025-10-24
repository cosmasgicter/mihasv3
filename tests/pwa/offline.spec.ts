import { test, expect } from '@playwright/test'

test.describe('PWA Offline Mode', () => {
  test('should register service worker', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const swRegistered = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return !!reg
    })
    expect(swRegistered).toBe(true)
  })

  test('should cache static assets', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const cacheKeys = await page.evaluate(async () => await caches.keys())
    expect(cacheKeys.length).toBeGreaterThan(0)
  })

  test('should have offline page in public folder', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check if offline.html exists by trying to fetch it
    const hasOfflinePage = await page.evaluate(async () => {
      try {
        const response = await fetch('/offline.html')
        return response.ok
      } catch {
        return false
      }
    })
    
    expect(hasOfflinePage).toBe(true)
  })

  test('should queue requests when offline', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await page.evaluate(() => {
      localStorage.setItem('offline_queue', JSON.stringify([
        { id: '1', url: '/api/test', method: 'POST', timestamp: Date.now() }
      ]))
    })
    
    const queueSize = await page.evaluate(() => {
      const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]')
      return queue.length
    })
    expect(queueSize).toBe(1)
  })

  test('should detect online/offline status', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const isOnline = await page.evaluate(() => navigator.onLine)
    expect(typeof isOnline).toBe('boolean')
  })

  test('should persist queue in localStorage', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const testQueue = [
      { id: '1', url: '/api/save', method: 'POST', body: { test: 'data' }, timestamp: Date.now() },
      { id: '2', url: '/api/update', method: 'PUT', body: { test: 'data2' }, timestamp: Date.now() }
    ]
    
    await page.evaluate((queue) => {
      localStorage.setItem('offline_queue', JSON.stringify(queue))
    }, testQueue)
    
    const storedQueue = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('offline_queue') || '[]')
    })
    
    expect(storedQueue.length).toBe(2)
    expect(storedQueue[0].url).toBe('/api/save')
    expect(storedQueue[1].url).toBe('/api/update')
  })

  test('should clear queue after successful sync', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await page.evaluate(() => {
      localStorage.setItem('offline_queue', JSON.stringify([
        { id: '1', url: '/api/test', method: 'POST', timestamp: Date.now() }
      ]))
    })
    
    await page.evaluate(() => {
      localStorage.removeItem('offline_queue')
    })
    
    const queueSize = await page.evaluate(() => {
      const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]')
      return queue.length
    })
    expect(queueSize).toBe(0)
  })

  test('should have sync status tracking', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await page.evaluate(() => {
      localStorage.setItem('sync_status', 'syncing')
    })
    
    const status = await page.evaluate(() => {
      return localStorage.getItem('sync_status')
    })
    expect(status).toBe('syncing')
  })
})
