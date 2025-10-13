import { test, expect } from '@playwright/test'

test.describe('Navigation Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('Landing page navigation', async ({ page }) => {
    await expect(page).toHaveTitle(/MIHAS/)
    await expect(page.locator('nav')).toBeVisible()
    
    // Test main navigation links
    await page.click('text=Sign In')
    await expect(page).toHaveURL(/signin/)
    
    await page.goBack()
    await page.click('text=Apply Now')
    await expect(page).toHaveURL(/signin/)
  })

  test('Authentication flow navigation', async ({ page }) => {
    await page.goto('/signin')
    await expect(page.locator('form')).toBeVisible()
    
    // Test sign up link
    await page.click('text=Sign up')
    await expect(page).toHaveURL(/signup/)
    
    // Test forgot password link
    await page.goto('/signin')
    await page.click('text=Forgot password')
    await expect(page).toHaveURL(/forgot-password/)
  })

  test('Protected route redirects', async ({ page }) => {
    await page.goto('/student/dashboard')
    await expect(page).toHaveURL(/signin/)
    
    await page.goto('/admin')
    await expect(page).toHaveURL(/signin/)
  })

  test('404 page handling', async ({ page }) => {
    await page.goto('/non-existent-page')
    await expect(page).toHaveURL(/404/)
    await expect(page.locator('text=Page Not Found')).toBeVisible()
  })

  test('Public application tracker', async ({ page }) => {
    await page.goto('/track-application')
    await expect(page.locator('input[placeholder*="application"]')).toBeVisible()
  })
})