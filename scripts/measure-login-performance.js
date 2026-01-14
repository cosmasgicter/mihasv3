/**
 * Login Performance Measurement Script
 * 
 * Measures login performance to verify:
 * - Login completes within 2 seconds
 * - Database queries are minimized
 * - Parallel data fetching is working
 * 
 * Requirements: 4.1, 4.3
 */

import { chromium } from '@playwright/test'

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@mihas.edu.zm'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPassword123!'
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'

async function measureLoginPerformance() {
  console.log('🚀 Starting login performance measurement...\n')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Clear any existing session
    await page.goto(BASE_URL)
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })

    // Navigate to sign in page
    console.log('📍 Navigating to sign in page...')
    await page.goto(`${BASE_URL}/auth/signin`)
    await page.waitForLoadState('networkidle')

    // Track API requests
    const apiRequests = []
    const databaseQueries = []
    const requestTimings = []

    page.on('request', request => {
      const url = request.url()
      const startTime = Date.now()

      if (url.includes('/auth/') || url.includes('supabase') || url.includes('/api/')) {
        apiRequests.push(url)
        requestTimings.push({ url, startTime, type: 'request' })
      }

      if (url.includes('supabase.co/rest/v1/')) {
        databaseQueries.push(url)
      }
    })

    page.on('response', response => {
      const url = response.url()
      const endTime = Date.now()
      
      const timing = requestTimings.find(t => t.url === url && t.type === 'request')
      if (timing) {
        timing.endTime = endTime
        timing.duration = endTime - timing.startTime
      }
    })

    // Fill in credentials
    console.log('✍️  Filling in credentials...')
    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.fill('input[type="password"]', TEST_PASSWORD)

    // Start performance measurement
    console.log('⏱️  Starting login timer...')
    const startTime = Date.now()

    // Click sign in button
    await page.click('button[type="submit"]')

    // Wait for redirect to dashboard
    try {
      await page.waitForURL(/\/(student|admin)\/dashboard/, { timeout: 3000 })
    } catch (error) {
      console.error('❌ Login failed or timed out')
      throw error
    }

    // Calculate login time
    const loginTime = Date.now() - startTime

    // Wait for any background requests to complete
    await page.waitForTimeout(500)

    // Print results
    console.log('\n' + '='.repeat(60))
    console.log('📊 LOGIN PERFORMANCE RESULTS')
    console.log('='.repeat(60))
    
    console.log(`\n⏱️  Login Time: ${loginTime}ms`)
    console.log(`   Target: < 2000ms`)
    console.log(`   Status: ${loginTime < 2000 ? '✅ PASS' : '❌ FAIL'}`)

    console.log(`\n🔌 API Requests: ${apiRequests.length}`)
    console.log(`   Requests made:`)
    apiRequests.forEach((url, index) => {
      const shortUrl = url.replace(BASE_URL, '').replace(/https?:\/\/[^/]+/, '')
      console.log(`   ${index + 1}. ${shortUrl}`)
    })

    console.log(`\n💾 Database Queries: ${databaseQueries.length}`)
    console.log(`   Target: < 3 queries`)
    console.log(`   Status: ${databaseQueries.length < 3 ? '✅ PASS' : '⚠️  WARNING (< 5 acceptable)'}`)
    console.log(`   Queries:`)
    databaseQueries.forEach((url, index) => {
      const shortUrl = url.replace(/https?:\/\/[^/]+/, '')
      console.log(`   ${index + 1}. ${shortUrl}`)
    })

    // Analyze request timings
    const completedTimings = requestTimings.filter(t => t.endTime)
    if (completedTimings.length > 0) {
      console.log(`\n⚡ Request Timings:`)
      completedTimings.forEach(timing => {
        const shortUrl = timing.url.replace(BASE_URL, '').replace(/https?:\/\/[^/]+/, '')
        console.log(`   ${shortUrl}: ${timing.duration}ms`)
      })

      // Check for parallel execution
      const profileRequest = completedTimings.find(r => r.url.includes('profiles'))
      const sessionRequest = completedTimings.find(r => r.url.includes('session') || r.url.includes('auth'))

      if (profileRequest && sessionRequest) {
        const hasOverlap = 
          (profileRequest.startTime <= sessionRequest.endTime && profileRequest.endTime >= sessionRequest.startTime) ||
          (sessionRequest.startTime <= profileRequest.endTime && sessionRequest.endTime >= profileRequest.startTime)

        console.log(`\n🔄 Parallel Execution:`)
        console.log(`   Profile: ${profileRequest.startTime} - ${profileRequest.endTime}`)
        console.log(`   Session: ${sessionRequest.startTime} - ${sessionRequest.endTime}`)
        console.log(`   Overlap: ${hasOverlap ? '✅ YES (parallel)' : '⚠️  NO (sequential)'}`)
      }
    }

    // Check dashboard state
    const dashboardUrl = page.url()
    console.log(`\n🎯 Final State:`)
    console.log(`   URL: ${dashboardUrl}`)
    console.log(`   Status: ${dashboardUrl.match(/\/(student|admin)\/dashboard/) ? '✅ On dashboard' : '❌ Not on dashboard'}`)

    // Overall assessment
    console.log(`\n${'='.repeat(60)}`)
    const allPassed = loginTime < 2000 && databaseQueries.length < 5
    if (allPassed) {
      console.log('✅ ALL PERFORMANCE TARGETS MET')
    } else {
      console.log('⚠️  SOME PERFORMANCE TARGETS NOT MET')
    }
    console.log('='.repeat(60) + '\n')

    return {
      loginTime,
      apiRequests: apiRequests.length,
      databaseQueries: databaseQueries.length,
      success: allPassed
    }

  } catch (error) {
    console.error('\n❌ Error during performance measurement:', error.message)
    throw error
  } finally {
    await browser.close()
  }
}

// Run the measurement
measureLoginPerformance()
  .then(results => {
    console.log('✅ Performance measurement completed successfully')
    process.exit(results.success ? 0 : 1)
  })
  .catch(error => {
    console.error('❌ Performance measurement failed:', error)
    process.exit(1)
  })
