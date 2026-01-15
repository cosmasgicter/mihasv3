import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Accessibility Compliance Tests', () => {
  test.describe('26.4 Accessibility testing', () => {
    
    test('Run axe-core audit on homepage', async ({ page }) => {
      await page.goto('/')
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      
      console.log(`\nAccessibility violations found: ${accessibilityScanResults.violations.length}`)
      
      if (accessibilityScanResults.violations.length > 0) {
        console.log('\nViolations:')
        accessibilityScanResults.violations.forEach(violation => {
          console.log(`  - ${violation.id}: ${violation.description}`)
          console.log(`    Impact: ${violation.impact}`)
          console.log(`    Nodes affected: ${violation.nodes.length}`)
        })
      }
      
      // Requirement 1.5, 7.1, 7.2: WCAG AA compliance
      expect(accessibilityScanResults.violations, 'Should have no WCAG AA violations').toHaveLength(0)
    })

    test('Run axe-core audit on application wizard', async ({ page }) => {
      // Login first
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || '***REMOVED***')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      await page.goto('/student/application-wizard')
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      
      console.log(`\nApplication wizard violations: ${accessibilityScanResults.violations.length}`)
      
      if (accessibilityScanResults.violations.length > 0) {
        console.log('\nViolations:')
        accessibilityScanResults.violations.forEach(violation => {
          console.log(`  - ${violation.id}: ${violation.description}`)
        })
      }
      
      expect(accessibilityScanResults.violations).toHaveLength(0)
    })

    test('Run axe-core audit on admin dashboard', async ({ page }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'cosmas@beanola.com')
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'Beanola2025')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/admin/**', { timeout: 10000 })
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      
      console.log(`\nAdmin dashboard violations: ${accessibilityScanResults.violations.length}`)
      
      if (accessibilityScanResults.violations.length > 0) {
        console.log('\nViolations:')
        accessibilityScanResults.violations.forEach(violation => {
          console.log(`  - ${violation.id}: ${violation.description}`)
        })
      }
      
      expect(accessibilityScanResults.violations).toHaveLength(0)
    })

    test('Keyboard navigation - Tab through interactive elements', async ({ page }) => {
      await page.goto('/')
      
      // Get all focusable elements
      const focusableElements = await page.evaluate(() => {
        const selector = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        return document.querySelectorAll(selector).length
      })
      
      console.log(`\nFocusable elements found: ${focusableElements}`)
      
      // Tab through first 10 elements
      const focusedElements: string[] = []
      
      for (let i = 0; i < Math.min(10, focusableElements); i++) {
        await page.keyboard.press('Tab')
        
        const focusedElement = await page.evaluate(() => {
          const el = document.activeElement
          return el ? `${el.tagName}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ')[0] : ''}` : 'none'
        })
        
        focusedElements.push(focusedElement)
        
        // Check focus is visible
        const hasFocusIndicator = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement
          if (!el) return false
          
          const styles = window.getComputedStyle(el)
          return styles.outline !== 'none' || styles.boxShadow !== 'none'
        })
        
        expect(hasFocusIndicator, `Element ${focusedElement} should have visible focus indicator`).toBe(true)
      }
      
      console.log('\nFocus order:')
      focusedElements.forEach((el, i) => console.log(`  ${i + 1}. ${el}`))
      
      expect(focusedElements.length).toBeGreaterThan(0)
    })

    test('Keyboard navigation - Form submission', async ({ page }) => {
      await page.goto('/auth/signin')
      
      // Navigate using keyboard only
      await page.keyboard.press('Tab') // Focus email
      await page.keyboard.type('alexisstar8@gmail.com')
      
      await page.keyboard.press('Tab') // Focus password
      await page.keyboard.type('***REMOVED***')
      
      await page.keyboard.press('Tab') // Focus submit button
      await page.keyboard.press('Enter') // Submit form
      
      // Should successfully login
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      expect(page.url()).toContain('student')
    })

    test('Keyboard navigation - Modal dialogs', async ({ page }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'cosmas@beanola.com')
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'Beanola2025')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/admin/**', { timeout: 10000 })
      
      await page.goto('/admin/applications')
      
      // Try to open a modal using keyboard
      const modalTriggers = page.locator('[data-testid*="modal"], [data-testid*="open"]')
      if (await modalTriggers.count() > 0) {
        await modalTriggers.first().focus()
        await page.keyboard.press('Enter')
        
        // Check if modal opened
        const modal = page.locator('[role="dialog"]')
        if (await modal.count() > 0) {
          await expect(modal.first()).toBeVisible()
          
          // Check focus is trapped in modal
          await page.keyboard.press('Tab')
          
          const focusedElement = await page.evaluate(() => {
            return document.activeElement?.closest('[role="dialog"]') !== null
          })
          
          expect(focusedElement, 'Focus should be trapped in modal').toBe(true)
          
          // Close modal with Escape
          await page.keyboard.press('Escape')
          await expect(modal.first()).not.toBeVisible()
        }
      }
    })

    test('Screen reader compatibility - Semantic HTML', async ({ page }) => {
      await page.goto('/')
      
      // Check for semantic HTML elements
      const semanticElements = await page.evaluate(() => {
        return {
          nav: document.querySelectorAll('nav').length,
          main: document.querySelectorAll('main').length,
          header: document.querySelectorAll('header').length,
          footer: document.querySelectorAll('footer').length,
          article: document.querySelectorAll('article').length,
          section: document.querySelectorAll('section').length
        }
      })
      
      console.log('\nSemantic HTML elements:')
      console.log(`  <nav>: ${semanticElements.nav}`)
      console.log(`  <main>: ${semanticElements.main}`)
      console.log(`  <header>: ${semanticElements.header}`)
      console.log(`  <footer>: ${semanticElements.footer}`)
      console.log(`  <article>: ${semanticElements.article}`)
      console.log(`  <section>: ${semanticElements.section}`)
      
      // Should have at least nav and main
      expect(semanticElements.nav, 'Should have <nav> element').toBeGreaterThan(0)
      expect(semanticElements.main, 'Should have <main> element').toBeGreaterThan(0)
    })

    test('Screen reader compatibility - ARIA labels', async ({ page }) => {
      await page.goto('/')
      
      // Check for ARIA labels on interactive elements
      const ariaLabels = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const links = Array.from(document.querySelectorAll('a'))
        const inputs = Array.from(document.querySelectorAll('input'))
        
        return {
          buttonsWithLabel: buttons.filter(btn => 
            btn.getAttribute('aria-label') || btn.textContent?.trim()
          ).length,
          totalButtons: buttons.length,
          linksWithLabel: links.filter(link => 
            link.getAttribute('aria-label') || link.textContent?.trim()
          ).length,
          totalLinks: links.length,
          inputsWithLabel: inputs.filter(input => 
            input.getAttribute('aria-label') || 
            input.getAttribute('aria-labelledby') ||
            document.querySelector(`label[for="${input.id}"]`)
          ).length,
          totalInputs: inputs.length
        }
      })
      
      console.log('\nARIA labels:')
      console.log(`  Buttons: ${ariaLabels.buttonsWithLabel}/${ariaLabels.totalButtons}`)
      console.log(`  Links: ${ariaLabels.linksWithLabel}/${ariaLabels.totalLinks}`)
      console.log(`  Inputs: ${ariaLabels.inputsWithLabel}/${ariaLabels.totalInputs}`)
      
      // Most interactive elements should have labels
      if (ariaLabels.totalButtons > 0) {
        const buttonLabelPercentage = (ariaLabels.buttonsWithLabel / ariaLabels.totalButtons) * 100
        expect(buttonLabelPercentage, 'Most buttons should have labels').toBeGreaterThan(80)
      }
      
      if (ariaLabels.totalInputs > 0) {
        const inputLabelPercentage = (ariaLabels.inputsWithLabel / ariaLabels.totalInputs) * 100
        expect(inputLabelPercentage, 'Most inputs should have labels').toBeGreaterThan(80)
      }
    })

    test('Screen reader compatibility - Alt text for images', async ({ page }) => {
      await page.goto('/')
      
      const images = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'))
        return {
          total: imgs.length,
          withAlt: imgs.filter(img => img.hasAttribute('alt')).length,
          withEmptyAlt: imgs.filter(img => img.getAttribute('alt') === '').length,
          withDescriptiveAlt: imgs.filter(img => {
            const alt = img.getAttribute('alt')
            return alt && alt.length > 0
          }).length
        }
      })
      
      console.log('\nImage alt text:')
      console.log(`  Total images: ${images.total}`)
      console.log(`  With alt attribute: ${images.withAlt}`)
      console.log(`  With descriptive alt: ${images.withDescriptiveAlt}`)
      console.log(`  Decorative (empty alt): ${images.withEmptyAlt}`)
      
      // All images should have alt attribute
      if (images.total > 0) {
        expect(images.withAlt, 'All images should have alt attribute').toBe(images.total)
      }
    })

    test('Color contrast compliance - Text elements', async ({ page }) => {
      await page.goto('/')
      
      // Check color contrast using axe-core
      const contrastResults = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .include('body')
        .analyze()
      
      const contrastViolations = contrastResults.violations.filter(v => 
        v.id === 'color-contrast' || v.id === 'color-contrast-enhanced'
      )
      
      console.log(`\nColor contrast violations: ${contrastViolations.length}`)
      
      if (contrastViolations.length > 0) {
        console.log('\nContrast issues:')
        contrastViolations.forEach(violation => {
          console.log(`  - ${violation.description}`)
          violation.nodes.forEach(node => {
            console.log(`    ${node.html}`)
          })
        })
      }
      
      // Requirement 1.5, 7.1: WCAG AA contrast compliance
      expect(contrastViolations, 'Should have no color contrast violations').toHaveLength(0)
    })

    test('Color contrast compliance - Interactive elements', async ({ page }) => {
      await page.goto('/')
      
      // Check contrast for buttons and links
      const interactiveContrast = await page.evaluate(() => {
        const getContrast = (fg: string, bg: string): number => {
          const getLuminance = (color: string): number => {
            const rgb = color.match(/\d+/g)?.map(Number) || [0, 0, 0]
            const [r, g, b] = rgb.map(val => {
              val = val / 255
              return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
            })
            return 0.2126 * r + 0.7152 * g + 0.0722 * b
          }
          
          const l1 = getLuminance(fg)
          const l2 = getLuminance(bg)
          const lighter = Math.max(l1, l2)
          const darker = Math.min(l1, l2)
          return (lighter + 0.05) / (darker + 0.05)
        }
        
        const buttons = Array.from(document.querySelectorAll('button'))
        const links = Array.from(document.querySelectorAll('a'))
        
        const results: Array<{ element: string; contrast: number; passes: boolean }> = []
        
        ;[...buttons, ...links].forEach(el => {
          const styles = window.getComputedStyle(el)
          const fg = styles.color
          const bg = styles.backgroundColor
          
          if (fg && bg && bg !== 'rgba(0, 0, 0, 0)') {
            const contrast = getContrast(fg, bg)
            results.push({
              element: el.tagName,
              contrast: Math.round(contrast * 10) / 10,
              passes: contrast >= 4.5
            })
          }
        })
        
        return results
      })
      
      console.log('\nInteractive element contrast:')
      interactiveContrast.forEach(result => {
        const status = result.passes ? '✓' : '✗'
        console.log(`  ${status} ${result.element}: ${result.contrast}:1`)
      })
      
      const failedElements = interactiveContrast.filter(r => !r.passes)
      expect(failedElements, 'All interactive elements should meet 4.5:1 contrast').toHaveLength(0)
    })

    test('Form accessibility - Labels and error messages', async ({ page }) => {
      await page.goto('/auth/signin')
      
      // Check form labels
      const formAccessibility = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'))
        
        return inputs.map(input => {
          const hasLabel = !!document.querySelector(`label[for="${input.id}"]`)
          const hasAriaLabel = !!input.getAttribute('aria-label')
          const hasAriaLabelledBy = !!input.getAttribute('aria-labelledby')
          const hasPlaceholder = !!input.getAttribute('placeholder')
          
          return {
            id: input.id || input.name || 'unknown',
            hasAccessibleLabel: hasLabel || hasAriaLabel || hasAriaLabelledBy,
            hasPlaceholder
          }
        })
      })
      
      console.log('\nForm input accessibility:')
      formAccessibility.forEach(input => {
        const status = input.hasAccessibleLabel ? '✓' : '✗'
        console.log(`  ${status} ${input.id}: ${input.hasAccessibleLabel ? 'Has label' : 'Missing label'}`)
      })
      
      const inputsWithoutLabels = formAccessibility.filter(i => !i.hasAccessibleLabel)
      expect(inputsWithoutLabels, 'All form inputs should have accessible labels').toHaveLength(0)
    })

    test('Touch target size on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/')
      
      // Check touch target sizes
      const touchTargets = await page.evaluate(() => {
        const interactiveElements = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'))
        
        return interactiveElements.map(el => {
          const rect = el.getBoundingClientRect()
          return {
            element: el.tagName,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            meetsMinimum: rect.width >= 44 && rect.height >= 44
          }
        })
      })
      
      console.log('\nTouch target sizes (mobile):')
      touchTargets.forEach(target => {
        const status = target.meetsMinimum ? '✓' : '✗'
        console.log(`  ${status} ${target.element}: ${target.width}x${target.height}px`)
      })
      
      const smallTargets = touchTargets.filter(t => !t.meetsMinimum)
      const percentage = ((touchTargets.length - smallTargets.length) / touchTargets.length) * 100
      
      console.log(`\nTouch targets meeting 44x44px: ${Math.round(percentage)}%`)
      
      // Requirement 11.3: Touch targets should be at least 44x44px
      expect(percentage, 'Most touch targets should be at least 44x44px').toBeGreaterThan(80)
    })

    test('WCAG AA compliance summary', async ({ page }) => {
      const pages = [
        { name: 'Homepage', url: '/' },
        { name: 'Programs', url: '/programs' },
        { name: 'About', url: '/about' },
        { name: 'Sign In', url: '/auth/signin' }
      ]
      
      const results: Array<{ page: string; violations: number; passes: boolean }> = []
      
      for (const pageInfo of pages) {
        await page.goto(pageInfo.url)
        
        const scanResults = await new AxeBuilder({ page })
          .withTags(['wcag2aa'])
          .analyze()
        
        results.push({
          page: pageInfo.name,
          violations: scanResults.violations.length,
          passes: scanResults.violations.length === 0
        })
      }
      
      console.log('\n' + '='.repeat(80))
      console.log('WCAG AA COMPLIANCE SUMMARY')
      console.log('='.repeat(80))
      
      results.forEach(result => {
        const status = result.passes ? '✓' : '✗'
        const color = result.passes ? '\x1b[32m' : '\x1b[31m'
        console.log(`${color}${status} ${result.page}: ${result.violations} violations\x1b[0m`)
      })
      
      const allPassed = results.every(r => r.passes)
      console.log(`\n${allPassed ? '✓ All pages meet WCAG AA standards' : '✗ Some pages have accessibility issues'}`)
      console.log('='.repeat(80) + '\n')
      
      expect(allPassed, 'All pages should meet WCAG AA compliance').toBe(true)
    })
  })
})
