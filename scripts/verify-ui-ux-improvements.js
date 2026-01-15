/**
 * UI/UX Improvements Verification Script
 * 
 * This script verifies:
 * 1. WCAG AA compliance for color contrast
 * 2. Mobile responsiveness
 * 3. Visual consistency
 * 4. Interactive feedback
 */

import { chromium } from '@playwright/test'
import { getContrastRatio, meetsWCAG_AA, validateColorPalette } from '../src/utils/contrastChecker.ts'
import fs from 'fs'
import path from 'path'

const REPORT_FILE = 'ui-ux-verification-report.json'

// Test configuration
const TEST_VIEWPORTS = [
  { name: 'Mobile Small', width: 320, height: 568 },
  { name: 'Mobile Medium', width: 375, height: 667 },
  { name: 'Mobile Large', width: 414, height: 896 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Desktop Small', width: 1024, height: 768 },
  { name: 'Desktop Medium', width: 1280, height: 720 },
  { name: 'Desktop Large', width: 1920, height: 1080 }
]

const TEST_PAGES = [
  { name: 'Landing Page', url: '/' },
  { name: 'Login', url: '/login' },
  { name: 'Register', url: '/register' },
  { name: 'Track Application', url: '/track' },
  { name: 'Admin Dashboard', url: '/admin/dashboard', requiresAuth: true }
]

const results = {
  timestamp: new Date().toISOString(),
  wcagCompliance: {},
  mobileResponsiveness: {},
  visualConsistency: {},
  interactiveFeedback: {},
  summary: {
    totalTests: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
}

/**
 * Test 1: WCAG AA Color Contrast Compliance
 */
async function testWCAGCompliance() {
  console.log('\n🎨 Testing WCAG AA Color Contrast Compliance...\n')
  
  const colorPalette = {
    'Primary on White': {
      color: '#2563eb',
      background: '#ffffff',
      isLargeText: false
    },
    'Primary Hover on White': {
      color: '#1d4ed8',
      background: '#ffffff',
      isLargeText: false
    },
    'Foreground on Background': {
      color: '#0f172a',
      background: '#ffffff',
      isLargeText: false
    },
    'Muted Foreground on Muted': {
      color: '#374151',
      background: '#f1f5f9',
      isLargeText: false
    },
    'Destructive on White': {
      color: '#dc2626',
      background: '#ffffff',
      isLargeText: false
    },
    'Success on White': {
      color: '#047857',
      background: '#ffffff',
      isLargeText: false
    },
    'Warning on White': {
      color: '#b45309',
      background: '#ffffff',
      isLargeText: false
    },
    'Admin Text on Admin BG': {
      color: '#111827',
      background: '#f9fafb',
      isLargeText: false
    },
    'Admin Secondary on Admin BG': {
      color: '#374151',
      background: '#f9fafb',
      isLargeText: false
    },
    'Link on White': {
      color: '#2563eb',
      background: '#ffffff',
      isLargeText: false
    },
    'Error Text on White': {
      color: '#991b1b',
      background: '#ffffff',
      isLargeText: false
    }
  }
  
  const validationResults = validateColorPalette(colorPalette)
  
  let passed = 0
  let failed = 0
  
  for (const [name, result] of Object.entries(validationResults)) {
    const status = result.passes ? '✅' : '❌'
    console.log(`${status} ${name}: ${result.ratio}:1 (${result.level})`)
    
    if (result.passes) {
      passed++
    } else {
      failed++
    }
    
    results.summary.totalTests++
  }
  
  results.wcagCompliance = {
    tested: Object.keys(colorPalette).length,
    passed,
    failed,
    details: validationResults
  }
  
  results.summary.passed += passed
  results.summary.failed += failed
  
  console.log(`\n📊 WCAG Compliance: ${passed}/${Object.keys(colorPalette).length} passed`)
  
  return failed === 0
}

/**
 * Test 2: Mobile Responsiveness
 */
async function testMobileResponsiveness() {
  console.log('\n📱 Testing Mobile Responsiveness...\n')
  
  const browser = await chromium.launch()
  const responsiveResults = {}
  
  for (const viewport of TEST_VIEWPORTS) {
    console.log(`Testing ${viewport.name} (${viewport.width}x${viewport.height})...`)
    
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height }
    })
    
    const page = await context.newPage()
    const viewportResults = {
      viewport: viewport.name,
      dimensions: `${viewport.width}x${viewport.height}`,
      pages: {}
    }
    
    for (const testPage of TEST_PAGES) {
      if (testPage.requiresAuth) continue // Skip auth-required pages for now
      
      try {
        await page.goto(`http://localhost:5173${testPage.url}`, { 
          waitUntil: 'networkidle',
          timeout: 10000 
        })
        
        // Check for horizontal scrollbar
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
        
        // Check for overflow
        const hasOverflow = await page.evaluate(() => {
          const body = document.body
          return body.scrollWidth > body.clientWidth
        })
        
        // Check touch targets (minimum 44x44px)
        const touchTargets = await page.evaluate(() => {
          const interactiveElements = document.querySelectorAll('button, a, input, textarea, select')
          const smallTargets = []
          
          interactiveElements.forEach(el => {
            const rect = el.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
              smallTargets.push({
                tag: el.tagName,
                width: rect.width,
                height: rect.height,
                text: el.textContent?.substring(0, 30)
              })
            }
          })
          
          return smallTargets
        })
        
        const pageResult = {
          passed: !hasHorizontalScroll && !hasOverflow && touchTargets.length === 0,
          hasHorizontalScroll,
          hasOverflow,
          smallTouchTargets: touchTargets.length,
          touchTargetDetails: touchTargets.slice(0, 5) // First 5 issues
        }
        
        viewportResults.pages[testPage.name] = pageResult
        
        const status = pageResult.passed ? '✅' : '⚠️'
        console.log(`  ${status} ${testPage.name}`)
        
        if (!pageResult.passed) {
          if (hasHorizontalScroll) console.log(`    - Has horizontal scrollbar`)
          if (hasOverflow) console.log(`    - Has content overflow`)
          if (touchTargets.length > 0) console.log(`    - ${touchTargets.length} touch targets < 44px`)
        }
        
        results.summary.totalTests++
        if (pageResult.passed) {
          results.summary.passed++
        } else {
          results.summary.warnings++
        }
        
      } catch (error) {
        console.log(`  ❌ ${testPage.name}: ${error.message}`)
        viewportResults.pages[testPage.name] = {
          passed: false,
          error: error.message
        }
        results.summary.totalTests++
        results.summary.failed++
      }
    }
    
    responsiveResults[viewport.name] = viewportResults
    await context.close()
  }
  
  await browser.close()
  
  results.mobileResponsiveness = responsiveResults
  
  console.log('\n📊 Mobile Responsiveness: Tests completed')
  
  return true
}

/**
 * Test 3: Visual Consistency
 */
async function testVisualConsistency() {
  console.log('\n🎨 Testing Visual Consistency...\n')
  
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  })
  const page = await context.newPage()
  
  const consistencyResults = {}
  
  for (const testPage of TEST_PAGES) {
    if (testPage.requiresAuth) continue
    
    try {
      await page.goto(`http://localhost:5173${testPage.url}`, { 
        waitUntil: 'networkidle',
        timeout: 10000 
      })
      
      // Check for design token usage
      const designTokenUsage = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*')
        let hardcodedColors = 0
        let usingTokens = 0
        
        allElements.forEach(el => {
          const styles = window.getComputedStyle(el)
          const color = styles.color
          const bgColor = styles.backgroundColor
          
          // Check if using CSS variables (design tokens)
          if (color.includes('var(--') || bgColor.includes('var(--')) {
            usingTokens++
          }
        })
        
        return {
          totalElements: allElements.length,
          usingTokens,
          percentage: Math.round((usingTokens / allElements.length) * 100)
        }
      })
      
      // Check for consistent spacing
      const spacingConsistency = await page.evaluate(() => {
        const elements = document.querySelectorAll('*')
        const spacingValues = new Set()
        
        elements.forEach(el => {
          const styles = window.getComputedStyle(el)
          const margin = styles.margin
          const padding = styles.padding
          
          if (margin !== '0px') spacingValues.add(margin)
          if (padding !== '0px') spacingValues.add(padding)
        })
        
        return {
          uniqueSpacingValues: spacingValues.size,
          usesConsistentSpacing: spacingValues.size < 50 // Reasonable threshold
        }
      })
      
      // Check for consistent typography
      const typographyConsistency = await page.evaluate(() => {
        const textElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button')
        const fontSizes = new Set()
        const fontWeights = new Set()
        
        textElements.forEach(el => {
          const styles = window.getComputedStyle(el)
          fontSizes.add(styles.fontSize)
          fontWeights.add(styles.fontWeight)
        })
        
        return {
          uniqueFontSizes: fontSizes.size,
          uniqueFontWeights: fontWeights.size,
          usesConsistentTypography: fontSizes.size < 15 // Reasonable threshold
        }
      })
      
      const pageResult = {
        passed: designTokenUsage.percentage > 50 && 
                spacingConsistency.usesConsistentSpacing && 
                typographyConsistency.usesConsistentTypography,
        designTokenUsage,
        spacingConsistency,
        typographyConsistency
      }
      
      consistencyResults[testPage.name] = pageResult
      
      const status = pageResult.passed ? '✅' : '⚠️'
      console.log(`${status} ${testPage.name}`)
      console.log(`  - Design tokens: ${designTokenUsage.percentage}%`)
      console.log(`  - Spacing values: ${spacingConsistency.uniqueSpacingValues}`)
      console.log(`  - Font sizes: ${typographyConsistency.uniqueFontSizes}`)
      
      results.summary.totalTests++
      if (pageResult.passed) {
        results.summary.passed++
      } else {
        results.summary.warnings++
      }
      
    } catch (error) {
      console.log(`❌ ${testPage.name}: ${error.message}`)
      consistencyResults[testPage.name] = {
        passed: false,
        error: error.message
      }
      results.summary.totalTests++
      results.summary.failed++
    }
  }
  
  await context.close()
  await browser.close()
  
  results.visualConsistency = consistencyResults
  
  console.log('\n📊 Visual Consistency: Tests completed')
  
  return true
}

/**
 * Test 4: Interactive Feedback
 */
async function testInteractiveFeedback() {
  console.log('\n⚡ Testing Interactive Feedback...\n')
  
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  })
  const page = await context.newPage()
  
  const feedbackResults = {}
  
  for (const testPage of TEST_PAGES) {
    if (testPage.requiresAuth) continue
    
    try {
      await page.goto(`http://localhost:5173${testPage.url}`, { 
        waitUntil: 'networkidle',
        timeout: 10000 
      })
      
      // Test hover states
      const hoverStates = await page.evaluate(() => {
        const interactiveElements = document.querySelectorAll('button, a, input')
        let withHoverStates = 0
        
        interactiveElements.forEach(el => {
          const styles = window.getComputedStyle(el)
          // Check if element has transition or cursor pointer
          if (styles.transition !== 'all 0s ease 0s' || styles.cursor === 'pointer') {
            withHoverStates++
          }
        })
        
        return {
          total: interactiveElements.length,
          withHoverStates,
          percentage: Math.round((withHoverStates / interactiveElements.length) * 100)
        }
      })
      
      // Test focus states
      const focusStates = await page.evaluate(() => {
        const focusableElements = document.querySelectorAll('button, a, input, textarea, select')
        let withFocusStates = 0
        
        focusableElements.forEach(el => {
          el.focus()
          const styles = window.getComputedStyle(el)
          // Check if element has visible focus indicator
          if (styles.outline !== 'none' || styles.boxShadow !== 'none') {
            withFocusStates++
          }
          el.blur()
        })
        
        return {
          total: focusableElements.length,
          withFocusStates,
          percentage: Math.round((withFocusStates / focusableElements.length) * 100)
        }
      })
      
      // Test loading states (check for loading indicators)
      const loadingStates = await page.evaluate(() => {
        const forms = document.querySelectorAll('form')
        const buttons = document.querySelectorAll('button[type="submit"]')
        
        return {
          formsCount: forms.length,
          submitButtonsCount: buttons.length,
          hasLoadingIndicators: document.querySelector('[data-loading], .loading, .spinner') !== null
        }
      })
      
      const pageResult = {
        passed: hoverStates.percentage > 80 && focusStates.percentage > 80,
        hoverStates,
        focusStates,
        loadingStates
      }
      
      feedbackResults[testPage.name] = pageResult
      
      const status = pageResult.passed ? '✅' : '⚠️'
      console.log(`${status} ${testPage.name}`)
      console.log(`  - Hover states: ${hoverStates.percentage}%`)
      console.log(`  - Focus states: ${focusStates.percentage}%`)
      
      results.summary.totalTests++
      if (pageResult.passed) {
        results.summary.passed++
      } else {
        results.summary.warnings++
      }
      
    } catch (error) {
      console.log(`❌ ${testPage.name}: ${error.message}`)
      feedbackResults[testPage.name] = {
        passed: false,
        error: error.message
      }
      results.summary.totalTests++
      results.summary.failed++
    }
  }
  
  await context.close()
  await browser.close()
  
  results.interactiveFeedback = feedbackResults
  
  console.log('\n📊 Interactive Feedback: Tests completed')
  
  return true
}

/**
 * Main verification function
 */
async function runVerification() {
  console.log('🚀 Starting UI/UX Improvements Verification\n')
  console.log('=' .repeat(60))
  
  try {
    // Run all tests
    await testWCAGCompliance()
    await testMobileResponsiveness()
    await testVisualConsistency()
    await testInteractiveFeedback()
    
    // Generate summary
    console.log('\n' + '='.repeat(60))
    console.log('\n📊 VERIFICATION SUMMARY\n')
    console.log(`Total Tests: ${results.summary.totalTests}`)
    console.log(`✅ Passed: ${results.summary.passed}`)
    console.log(`❌ Failed: ${results.summary.failed}`)
    console.log(`⚠️  Warnings: ${results.summary.warnings}`)
    
    const successRate = Math.round((results.summary.passed / results.summary.totalTests) * 100)
    console.log(`\n📈 Success Rate: ${successRate}%`)
    
    // Save report
    fs.writeFileSync(
      REPORT_FILE,
      JSON.stringify(results, null, 2)
    )
    
    console.log(`\n💾 Report saved to: ${REPORT_FILE}`)
    
    // Determine overall status
    if (results.summary.failed === 0 && successRate >= 90) {
      console.log('\n✅ UI/UX IMPROVEMENTS VERIFIED SUCCESSFULLY!')
      process.exit(0)
    } else if (results.summary.failed === 0) {
      console.log('\n⚠️  UI/UX IMPROVEMENTS PARTIALLY VERIFIED (some warnings)')
      process.exit(0)
    } else {
      console.log('\n❌ UI/UX IMPROVEMENTS VERIFICATION FAILED')
      process.exit(1)
    }
    
  } catch (error) {
    console.error('\n❌ Verification failed with error:', error)
    process.exit(1)
  }
}

// Run verification
runVerification()
