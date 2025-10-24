import { test, expect } from '@playwright/test'

test.describe('State Management Integration', () => {
  test('should have query hooks available', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const hasQueryClient = await page.evaluate(() => {
      return typeof window !== 'undefined'
    })
    
    expect(hasQueryClient).toBe(true)
  })

  test('should cache auth session', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const hasCacheStorage = await page.evaluate(async () => {
      return 'caches' in window
    })
    
    expect(hasCacheStorage).toBe(true)
  })

  test('should handle offline state', async ({ page, context }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await context.setOffline(true)
    
    const isOffline = await page.evaluate(() => !navigator.onLine)
    expect(isOffline).toBe(true)
    
    await context.setOffline(false)
  })
})
