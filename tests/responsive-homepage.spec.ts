import { test, expect } from '@playwright/test'

test.describe('Homepage Responsiveness - Task 10.4 Implementation', () => {
  test('should display correctly on mobile (320px)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/')
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle')
    
    // Check that hero section is visible
    const heroSection = page.locator('#hero')
    await expect(heroSection).toBeVisible()
    
    // Check that buttons are stacked vertically on mobile
    const buttonContainer = page.locator('#hero .flex.flex-col')
    await expect(buttonContainer).toBeVisible()
    
    // Verify hero title is readable on mobile
    const heroTitle = page.locator('#hero h1')
    await expect(heroTitle).toBeVisible()
    const titleFontSize = await heroTitle.evaluate(el => {
      return window.getComputedStyle(el).fontSize
    })
    const fontSize = parseInt(titleFontSize)
    expect(fontSize).toBeGreaterThanOrEqual(24) // Minimum for mobile headings
    
    // Check that no horizontal scrollbar appears
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth)
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth)
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1) // Allow 1px tolerance
    
    // Verify container-responsive class works properly
    const containerElement = page.locator('.container-responsive').first()
    const containerWidth = await containerElement.evaluate(el => el.offsetWidth)
    expect(containerWidth).toBeLessThanOrEqual(320) // Should not exceed viewport
  })

  test('should display correctly on tablet (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle')
    
    // Check that features section uses proper grid
    const featuresGrid = page.locator('#features .grid')
    await expect(featuresGrid).toBeVisible()
    
    // Check that stats section shows 2 columns on tablet
    const statsGrid = page.locator('#stats .grid')
    await expect(statsGrid).toBeVisible()
    
    // Verify grid layout on tablet - stats should show 2 columns
    const statsItems = page.locator('#stats .grid > div')
    const statsCount = await statsItems.count()
    expect(statsCount).toBe(4) // Should have 4 stat items
    
    // Check responsive text sizing
    const heroTitle = page.locator('#hero h1')
    const titleFontSize = await heroTitle.evaluate(el => {
      return window.getComputedStyle(el).fontSize
    })
    const fontSize = parseInt(titleFontSize)
    expect(fontSize).toBeGreaterThanOrEqual(32) // Larger for tablet
    
    // Verify no horizontal overflow
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth)
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth)
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1)
  })

  test('should display correctly on desktop (1024px+)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/')
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle')
    
    // Check that features section shows 3 columns
    const featuresSection = page.locator('#features')
    await expect(featuresSection).toBeVisible()
    
    // Verify features grid shows 3 columns on desktop
    const featuresGrid = page.locator('#features .grid')
    const gridClasses = await featuresGrid.getAttribute('class')
    expect(gridClasses).toContain('lg:grid-cols-3')
    
    // Check that stats section shows 4 columns
    const statsSection = page.locator('#stats')
    await expect(statsSection).toBeVisible()
    
    // Verify stats grid shows 4 columns on desktop
    const statsGrid = page.locator('#stats .grid')
    const statsGridClasses = await statsGrid.getAttribute('class')
    expect(statsGridClasses).toContain('lg:grid-cols-4')
    
    // Check desktop typography
    const heroTitle = page.locator('#hero h1')
    const titleFontSize = await heroTitle.evaluate(el => {
      return window.getComputedStyle(el).fontSize
    })
    const fontSize = parseInt(titleFontSize)
    expect(fontSize).toBeGreaterThanOrEqual(48) // Larger for desktop
    
    // Verify no horizontal overflow
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth)
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth)
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1)
  })

  test('should have proper touch targets on mobile (44x44px minimum)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle')
    
    // Check main CTA button has minimum 44px height and width
    const ctaButton = page.locator('a[href="/auth/signup"] button').first()
    await expect(ctaButton).toBeVisible()
    const buttonBox = await ctaButton.boundingBox()
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44)
    expect(buttonBox?.width).toBeGreaterThanOrEqual(44)
    
    // Check secondary button has minimum 44px height and width
    const secondaryButton = page.locator('#hero button').nth(1)
    await expect(secondaryButton).toBeVisible()
    const secondaryBox = await secondaryButton.boundingBox()
    expect(secondaryBox?.height).toBeGreaterThanOrEqual(44)
    expect(secondaryBox?.width).toBeGreaterThanOrEqual(44)
    
    // Check scroll indicator has adequate touch target
    const scrollIndicator = page.locator('#hero .cursor-pointer.animate-bounce')
    if (await scrollIndicator.isVisible()) {
      const scrollBox = await scrollIndicator.boundingBox()
      expect(scrollBox?.height).toBeGreaterThanOrEqual(44)
      expect(scrollBox?.width).toBeGreaterThanOrEqual(44)
    }
    
    // Check footer links have adequate touch targets
    const footerLinks = page.locator('footer a')
    const linkCount = await footerLinks.count()
    
    for (let i = 0; i < Math.min(linkCount, 3); i++) {
      const link = footerLinks.nth(i)
      if (await link.isVisible()) {
        const linkBox = await link.boundingBox()
        if (linkBox) {
          expect(linkBox.height).toBeGreaterThanOrEqual(44)
          // Width can be flexible for text links, but height must be 44px
        }
      }
    }
    
    // Check social media links in footer
    const socialLinks = page.locator('footer a[href="#"]')
    const socialCount = await socialLinks.count()
    
    for (let i = 0; i < socialCount; i++) {
      const socialLink = socialLinks.nth(i)
      if (await socialLink.isVisible()) {
        const socialBox = await socialLink.boundingBox()
        if (socialBox) {
          expect(socialBox.height).toBeGreaterThanOrEqual(44)
          expect(socialBox.width).toBeGreaterThanOrEqual(44)
        }
      }
    }
  })

  test('should not break layout on various viewport sizes', async ({ page }) => {
    const viewports = [
      { width: 320, height: 568, name: 'iPhone SE' },
      { width: 375, height: 667, name: 'iPhone 8' },
      { width: 414, height: 896, name: 'iPhone 11' },
      { width: 768, height: 1024, name: 'iPad' },
      { width: 1024, height: 768, name: 'Desktop small' },
      { width: 1280, height: 720, name: 'Desktop medium' },
      { width: 1920, height: 1080, name: 'Desktop large' },
      { width: 2560, height: 1440, name: 'Desktop 2K' },
    ]

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      
      // Wait for page to load completely
      await page.waitForLoadState('networkidle')
      
      // Check for horizontal overflow
      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth)
      const bodyClientWidth = await page.evaluate(() => document.body.clientWidth)
      expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 2, 
        `Horizontal overflow detected on ${viewport.name} (${viewport.width}x${viewport.height})`)
      
      // Check that main sections are visible
      await expect(page.locator('#hero')).toBeVisible()
      await expect(page.locator('#stats')).toBeVisible()
      await expect(page.locator('#features')).toBeVisible()
      
      // Verify container-responsive works at all breakpoints
      const containerElements = page.locator('.container-responsive')
      const containerCount = await containerElements.count()
      
      for (let i = 0; i < Math.min(containerCount, 3); i++) {
        const container = containerElements.nth(i)
        const containerWidth = await container.evaluate(el => el.offsetWidth)
        expect(containerWidth).toBeLessThanOrEqual(viewport.width, 
          `Container width exceeds viewport on ${viewport.name}`)
      }
      
      // Check that text remains readable (not too small)
      const heroTitle = page.locator('#hero h1')
      if (await heroTitle.isVisible()) {
        const titleFontSize = await heroTitle.evaluate(el => {
          return window.getComputedStyle(el).fontSize
        })
        const fontSize = parseInt(titleFontSize)
        expect(fontSize).toBeGreaterThanOrEqual(20, 
          `Font size too small on ${viewport.name}`)
      }
    }
  })

  test('should have readable text at all breakpoints', async ({ page }) => {
    const viewports = [
      { width: 320, height: 568, name: 'Mobile Small' },
      { width: 375, height: 667, name: 'Mobile Medium' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1024, height: 768, name: 'Desktop' },
      { width: 1280, height: 720, name: 'Desktop Large' }
    ]

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      
      // Wait for page to load completely
      await page.waitForLoadState('networkidle')
      
      // Check hero title is readable
      const heroTitle = page.locator('#hero h1')
      if (await heroTitle.isVisible()) {
        const titleStyles = await heroTitle.evaluate(el => {
          const styles = window.getComputedStyle(el)
          return {
            fontSize: styles.fontSize,
            lineHeight: styles.lineHeight,
            color: styles.color
          }
        })
        
        // Font size should be at least 20px on mobile, larger on desktop
        const fontSize = parseInt(titleStyles.fontSize)
        if (viewport.width <= 768) {
          expect(fontSize).toBeGreaterThanOrEqual(20, 
            `Hero title font size too small on ${viewport.name}`)
        } else {
          expect(fontSize).toBeGreaterThanOrEqual(32, 
            `Hero title font size too small on ${viewport.name}`)
        }
      }
      
      // Check body text readability
      const heroDescription = page.locator('#hero p')
      if (await heroDescription.isVisible()) {
        const descStyles = await heroDescription.evaluate(el => {
          const styles = window.getComputedStyle(el)
          return {
            fontSize: styles.fontSize,
            lineHeight: styles.lineHeight
          }
        })
        
        const descFontSize = parseInt(descStyles.fontSize)
        expect(descFontSize).toBeGreaterThanOrEqual(14, 
          `Body text too small on ${viewport.name}`)
      }
      
      // Check feature card text
      const featureTitle = page.locator('#features .text-lg, #features .text-xl, #features .text-2xl').first()
      if (await featureTitle.isVisible()) {
        const featureFontSize = await featureTitle.evaluate(el => {
          return parseInt(window.getComputedStyle(el).fontSize)
        })
        expect(featureFontSize).toBeGreaterThanOrEqual(16, 
          `Feature title too small on ${viewport.name}`)
      }
    }
  })

  test('should handle responsive grid layouts correctly', async ({ page }) => {
    // Test mobile layout (1 column)
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Stats should be in single column on mobile
    const statsGrid = page.locator('#stats .grid')
    const statsGridClasses = await statsGrid.getAttribute('class')
    expect(statsGridClasses).toContain('grid-cols-1')
    
    // Features should be in single column on mobile
    const featuresGrid = page.locator('#features .grid')
    const featuresGridClasses = await featuresGrid.getAttribute('class')
    expect(featuresGridClasses).toContain('grid-cols-1')
    
    // Test tablet layout (2-3 columns)
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    // Stats should show 2 columns on tablet
    const statsGridTablet = await page.locator('#stats .grid').getAttribute('class')
    expect(statsGridTablet).toContain('xs:grid-cols-2')
    
    // Test desktop layout (3-4 columns)
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    // Features should show 3 columns on desktop
    const featuresGridDesktop = await page.locator('#features .grid').getAttribute('class')
    expect(featuresGridDesktop).toContain('lg:grid-cols-3')
    
    // Stats should show 4 columns on desktop
    const statsGridDesktop = await page.locator('#stats .grid').getAttribute('class')
    expect(statsGridDesktop).toContain('lg:grid-cols-4')
  })

  test('should maintain proper spacing and padding at all breakpoints', async ({ page }) => {
    const viewports = [
      { width: 320, height: 568, name: 'Mobile' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1024, height: 768, name: 'Desktop' }
    ]

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      // Check container padding
      const container = page.locator('.container-responsive').first()
      const containerStyles = await container.evaluate(el => {
        const styles = window.getComputedStyle(el)
        return {
          paddingLeft: styles.paddingLeft,
          paddingRight: styles.paddingRight,
          maxWidth: styles.maxWidth
        }
      })
      
      const paddingLeft = parseInt(containerStyles.paddingLeft)
      const paddingRight = parseInt(containerStyles.paddingRight)
      
      // Ensure adequate padding on all devices
      expect(paddingLeft).toBeGreaterThanOrEqual(16) // Minimum 16px padding
      expect(paddingRight).toBeGreaterThanOrEqual(16)
      
      // Check section spacing
      const heroSection = page.locator('#hero')
      const heroHeight = await heroSection.evaluate(el => el.offsetHeight)
      expect(heroHeight).toBeGreaterThan(400) // Hero should be substantial height
      
      // Check that sections have proper vertical spacing
      const statsSection = page.locator('#stats')
      const statsStyles = await statsSection.evaluate(el => {
        const styles = window.getComputedStyle(el)
        return {
          paddingTop: styles.paddingTop,
          paddingBottom: styles.paddingBottom
        }
      })
      
      const statsPaddingTop = parseInt(statsStyles.paddingTop)
      const statsPaddingBottom = parseInt(statsStyles.paddingBottom)
      
      expect(statsPaddingTop).toBeGreaterThanOrEqual(48) // Minimum section padding
      expect(statsPaddingBottom).toBeGreaterThanOrEqual(48)
    }
  })

  test('should handle image responsiveness correctly', async ({ page }) => {
    const viewports = [
      { width: 320, height: 568 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 }
    ]

    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      // Check program images are responsive
      const programImages = page.locator('img[alt*="campus"]')
      const imageCount = await programImages.count()
      
      for (let i = 0; i < imageCount; i++) {
        const image = programImages.nth(i)
        if (await image.isVisible()) {
          const imageBox = await image.boundingBox()
          if (imageBox) {
            // Images should not exceed container width
            expect(imageBox.width).toBeLessThanOrEqual(viewport.width)
            // Images should maintain aspect ratio and be visible
            expect(imageBox.height).toBeGreaterThan(100)
          }
        }
      }
      
      // Check accreditation logos are responsive
      const logoImages = page.locator('img[alt*="logo"]')
      const logoCount = await logoImages.count()
      
      for (let i = 0; i < Math.min(logoCount, 3); i++) {
        const logo = logoImages.nth(i)
        if (await logo.isVisible()) {
          const logoBox = await logo.boundingBox()
          if (logoBox) {
            // Logos should be appropriately sized
            expect(logoBox.width).toBeLessThanOrEqual(100)
            expect(logoBox.height).toBeLessThanOrEqual(100)
            expect(logoBox.width).toBeGreaterThan(20)
            expect(logoBox.height).toBeGreaterThan(20)
          }
        }
      }
    }
  })

  test('should maintain accessibility on mobile devices', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check that form inputs don't trigger zoom on iOS (16px minimum)
    const inputs = page.locator('input, textarea, select')
    const inputCount = await inputs.count()
    
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i)
      if (await input.isVisible()) {
        const fontSize = await input.evaluate(el => {
          return window.getComputedStyle(el).fontSize
        })
        const fontSizeNum = parseInt(fontSize)
        expect(fontSizeNum).toBeGreaterThanOrEqual(16, 
          'Input font size should be at least 16px to prevent zoom on iOS')
      }
    }
    
    // Check that interactive elements have proper spacing
    const buttons = page.locator('button, a[role="button"]')
    const buttonCount = await buttons.count()
    
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i)
      if (await button.isVisible()) {
        const buttonBox = await button.boundingBox()
        if (buttonBox) {
          // Buttons should have adequate spacing between them
          expect(buttonBox.height).toBeGreaterThanOrEqual(44)
        }
      }
    }
    
    // Check that text has adequate line height for readability
    const paragraphs = page.locator('p')
    const paragraphCount = await paragraphs.count()
    
    for (let i = 0; i < Math.min(paragraphCount, 3); i++) {
      const paragraph = paragraphs.nth(i)
      if (await paragraph.isVisible()) {
        const lineHeight = await paragraph.evaluate(el => {
          return window.getComputedStyle(el).lineHeight
        })
        const lineHeightNum = parseFloat(lineHeight)
        // Line height should be at least 1.4 for readability
        expect(lineHeightNum).toBeGreaterThanOrEqual(1.4)
      }
    }
  })
})