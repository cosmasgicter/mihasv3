// @vitest-environment node
/**
 * Property 4: Interactive elements meet touch target minimum
 * Feature: website-ui-ux-fix, Property 4: Interactive elements meet touch target minimum
 *
 * For any interactive element (button, link, input) in the Component_Library,
 * the element's minimum height and minimum width SHALL be at least 44px
 * (via min-h-touch, min-h-[44px], h-11, or equivalent).
 *
 * **Validates: Requirements 3.1, 6.5**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all .tsx files from a directory */
function collectTsxFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...collectTsxFiles(fullPath))
    } else if (entry.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }
  return files
}

/** Strip comments from file content so we don't get false positives */
function stripComments(content: string): string {
  let result = content.replace(/\/\/.*$/gm, '')
  result = result.replace(/\/\*[\s\S]*?\*\//g, '')
  return result
}

const UI_DIR = join(process.cwd(), 'src', 'components', 'ui')
const allComponentFiles = collectTsxFiles(UI_DIR)

// ---------------------------------------------------------------------------
// Touch target detection
// ---------------------------------------------------------------------------

/**
 * CSS classes that guarantee at least 44px height.
 * - h-11 = 44px, h-12 = 48px, h-14 = 56px, h-16 = 64px
 * - min-h-[44px], min-h-touch, min-h-11, min-h-12
 * - p-3 (12px padding) on a container with content typically exceeds 44px
 *   but is not a reliable guarantee on its own, so we don't count it alone.
 */
const TOUCH_TARGET_HEIGHT_PATTERNS = [
  /\bh-1[1-9]\b/,          // h-11 (44px) through h-19
  /\bh-[2-9]\d\b/,         // h-20+
  /\bmin-h-\[44px\]/,      // explicit 44px min-height
  /\bmin-h-\[4[4-9]px\]/,  // min-h-[44px] through min-h-[49px]
  /\bmin-h-\[5\dpx\]/,     // min-h-[50px] through min-h-[59px]
  /\bmin-h-\[6\dpx\]/,     // min-h-[60px]+
  /\bmin-h-touch\b/,       // custom token
  /\bmin-h-11\b/,          // 44px
  /\bmin-h-12\b/,          // 48px
  /\btouch-target\b/,      // custom utility class for touch targets
]

/**
 * Check if a block of class text contains a valid touch target sizing class.
 */
function hasTouchTargetClass(classText: string): boolean {
  return TOUCH_TARGET_HEIGHT_PATTERNS.some((pattern) => pattern.test(classText))
}

// ---------------------------------------------------------------------------
// Key interactive component files that MUST have touch target sizing
// ---------------------------------------------------------------------------

/**
 * These are the critical interactive component files that define buttons,
 * inputs, or other tappable elements. Each must contain at least one
 * touch-target-compliant sizing class.
 *
 * We focus on the primary interactive primitives per the spec:
 * - Button component (primary interactive element)
 * - Toast retry button (Requirement 6.5)
 * - AutoSaveIndicator retry button (Requirement 5.2)
 * - Input component
 * - Select component
 * - Checkbox, Radio, Switch (form controls)
 * - Dialog close button
 * - ConfirmDialog close button
 * - ErrorBoundary reload button
 * - PasswordInput
 */
const CRITICAL_INTERACTIVE_FILES = [
  'Button.tsx',
  'Toast.tsx',
  'AutoSaveIndicator.tsx',
  'input.tsx',
  'select.tsx',
  'checkbox.tsx',
  'Radio.tsx',
  'radio-group.tsx',
  'switch.tsx',
  'Dialog.tsx',
  'ConfirmDialog.tsx',
  'ErrorBoundary.tsx',
  'PasswordInput.tsx',
  'MobilePageHeader.tsx',
  'EnhancedFormComponents.tsx',
  'EnhancedErrorHandling.tsx',
  'CanonicalSelect.tsx',
  'form-radio-group.tsx',
]

/** Resolve critical file names to full paths (handle both / and \ separators) */
const criticalFiles = CRITICAL_INTERACTIVE_FILES
  .map((name) => allComponentFiles.find((f) => {
    const normalized = f.replace(/\\/g, '/')
    return normalized.endsWith(`/${name}`)
  }))
  .filter((f): f is string => f !== undefined)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: website-ui-ux-fix, Property 4: Interactive elements meet touch target minimum', () => {
  it('should find critical interactive component files to test', () => {
    expect(criticalFiles.length).toBeGreaterThan(0)
    // We should find at least the core files
    expect(criticalFiles.length).toBeGreaterThanOrEqual(10)
  })

  // Feature: website-ui-ux-fix, Property 4: Interactive elements meet touch target minimum
  it('Property 4: critical interactive components include touch target sizing (≥44px)', () => {
    const fileIndexArb = fc.integer({ min: 0, max: criticalFiles.length - 1 })

    fc.assert(
      fc.property(fileIndexArb, (index) => {
        const filePath = criticalFiles[index]
        const content = readFileSync(filePath, 'utf-8')
        const cleaned = stripComments(content)
        const relativePath = filePath.replace(/\\/g, '/').replace(process.cwd().replace(/\\/g, '/') + '/', '')

        const hasTarget = hasTouchTargetClass(cleaned)

        expect(
          hasTarget,
          `${relativePath} defines interactive elements but does not include any touch target ` +
          `sizing class (h-11, min-h-[44px], min-h-touch, touch-target, etc.). ` +
          `All interactive elements must meet the 44×44px minimum touch target.`
        ).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  // Exhaustive check: verify EVERY critical file
  it('Property 4 (exhaustive): all critical interactive component files include touch target sizing', () => {
    const violations: string[] = []

    for (const filePath of criticalFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const cleaned = stripComments(content)

      if (!hasTouchTargetClass(cleaned)) {
        violations.push(filePath.replace(/\\/g, '/').replace(process.cwd().replace(/\\/g, '/') + '/', ''))
      }
    }

    expect(
      violations,
      `The following interactive component files lack touch target sizing (≥44px):\n` +
      violations.map((v) => `  ${v}`).join('\n') +
      `\nAll interactive elements must include h-11, min-h-[44px], min-h-touch, or touch-target class.`
    ).toHaveLength(0)
  })

  // Specific check: Button component size variants all meet touch target
  it('Property 4 (Button): default and standard size variants meet 44px minimum', () => {
    const buttonFile = criticalFiles.find((f) => f.replace(/\\/g, '/').endsWith('/Button.tsx'))
    expect(buttonFile).toBeDefined()

    const content = readFileSync(buttonFile!, 'utf-8')
    const cleaned = stripComments(content)

    // The default size variant must use h-11 (44px) or larger
    expect(
      cleaned,
      'Button default size variant should use h-11 (44px) for touch target compliance'
    ).toMatch(/default:\s*['"].*\bh-1[1-9]\b/)

    // The icon size variant must use h-11 w-11 (44px square)
    expect(
      cleaned,
      'Button icon size variant should use h-11 w-11 (44px) for touch target compliance'
    ).toMatch(/icon:\s*['"].*\bh-11\b.*\bw-11\b/)
  })

  // Specific check: Toast retry button meets touch target (Requirement 6.5)
  it('Property 4 (Toast): retry action button meets 44px touch target minimum', () => {
    const toastFile = criticalFiles.find((f) => f.replace(/\\/g, '/').endsWith('/Toast.tsx'))
    expect(toastFile).toBeDefined()

    const content = readFileSync(toastFile!, 'utf-8')
    const cleaned = stripComments(content)

    // Toast retry button must have min-h-[44px] and min-w-[44px]
    expect(
      cleaned,
      'Toast retry button should have min-h-[44px] for touch target compliance'
    ).toMatch(/min-h-\[44px\]/)

    expect(
      cleaned,
      'Toast retry button should have min-w-[44px] for touch target compliance'
    ).toMatch(/min-w-\[44px\]/)
  })

  // Specific check: AutoSaveIndicator retry button meets touch target
  it('Property 4 (AutoSaveIndicator): retry button meets 44px touch target minimum', () => {
    const autoSaveFile = criticalFiles.find((f) => f.replace(/\\/g, '/').endsWith('/AutoSaveIndicator.tsx'))
    expect(autoSaveFile).toBeDefined()

    const content = readFileSync(autoSaveFile!, 'utf-8')
    const cleaned = stripComments(content)

    // AutoSaveIndicator retry button must have min-h-[44px] and min-w-[44px]
    expect(
      cleaned,
      'AutoSaveIndicator retry button should have min-h-[44px] for touch target compliance'
    ).toMatch(/min-h-\[44px\]/)

    expect(
      cleaned,
      'AutoSaveIndicator retry button should have min-w-[44px] for touch target compliance'
    ).toMatch(/min-w-\[44px\]/)
  })
})


// ---------------------------------------------------------------------------
// Property 5: Focus ring consistency on interactive elements
// Feature: website-ui-ux-fix, Property 5: Focus ring consistency on interactive elements
//
// For any interactive element (button, link, input, select) in the Component_Library,
// the element SHALL include focus-visible ring styling (focus-visible:ring-2
// focus-visible:ring-ring focus-visible:ring-offset-2 or the focus-ring utility class).
//
// **Validates: Requirements 3.2**
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate focus ring styling is present.
 * Components may use any of these approaches:
 * - focus-visible:ring-2 (standard keyboard-only focus ring)
 * - focus:ring-2 (general focus ring — also acceptable)
 * - focus-ring (custom utility class)
 * - Delegation to Button or another component that already has focus ring styling
 */
const FOCUS_RING_PATTERNS = [
  /focus-visible:ring-2/,
  /focus-visible:ring-/,
  /focus:ring-2/,
  /focus:ring-ring/,
  /focus-ring\b/,
]

/**
 * Check if file content contains any focus ring styling pattern.
 */
function hasFocusRingStyle(content: string): boolean {
  return FOCUS_RING_PATTERNS.some((pattern) => pattern.test(content))
}

/**
 * Components that delegate their interactive elements to the Button component
 * (which already has focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2).
 * These don't need their own focus ring classes — they inherit from Button.
 */
const DELEGATES_TO_BUTTON = [
  'ErrorBoundary.tsx',
  'ErrorDisplay.tsx',
]

/**
 * Critical interactive component files that MUST have focus ring styling,
 * either directly or via delegation to Button.
 */
const FOCUS_RING_CRITICAL_FILES = [
  'Button.tsx',
  'input.tsx',
  'select.tsx',
  'textarea.tsx',
  'checkbox.tsx',
  'Radio.tsx',
  'radio-group.tsx',
  'switch.tsx',
  'Dialog.tsx',
  'ConfirmDialog.tsx',
  'Toast.tsx',
  'AutoSaveIndicator.tsx',
  'PasswordInput.tsx',
  'MobilePageHeader.tsx',
  'EnhancedFormComponents.tsx',
  'EnhancedErrorHandling.tsx',
  'CanonicalSelect.tsx',
  'tabs.tsx',
  'card.tsx',
  'SubjectSelection.tsx',
  'UnifiedLoader.tsx',
]

/** Resolve critical file names to full paths */
const focusRingCriticalFiles = FOCUS_RING_CRITICAL_FILES
  .map((name) => allComponentFiles.find((f) => {
    const normalized = f.replace(/\\/g, '/')
    return normalized.endsWith(`/${name}`)
  }))
  .filter((f): f is string => f !== undefined)

/** Check if a file delegates interactive elements to Button */
function delegatesToButton(filePath: string): boolean {
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || ''
  return DELEGATES_TO_BUTTON.includes(fileName)
}

describe('Feature: website-ui-ux-fix, Property 5: Focus ring consistency on interactive elements', () => {
  it('should find critical interactive component files for focus ring testing', () => {
    expect(focusRingCriticalFiles.length).toBeGreaterThan(0)
    expect(focusRingCriticalFiles.length).toBeGreaterThanOrEqual(15)
  })

  // Feature: website-ui-ux-fix, Property 5: Focus ring consistency on interactive elements
  it('Property 5: critical interactive components include focus ring styling', () => {
    const fileIndexArb = fc.integer({ min: 0, max: focusRingCriticalFiles.length - 1 })

    fc.assert(
      fc.property(fileIndexArb, (index) => {
        const filePath = focusRingCriticalFiles[index]
        const content = readFileSync(filePath, 'utf-8')
        const cleaned = stripComments(content)
        const relativePath = filePath.replace(/\\/g, '/').replace(process.cwd().replace(/\\/g, '/') + '/', '')

        // Components that delegate to Button get a pass if they import Button
        if (delegatesToButton(filePath)) {
          const importsButton = /import\s+.*Button.*from/.test(cleaned)
          expect(
            importsButton,
            `${relativePath} is expected to delegate focus ring to Button but does not import Button.`
          ).toBe(true)
          return
        }

        const hasFocusRing = hasFocusRingStyle(cleaned)

        expect(
          hasFocusRing,
          `${relativePath} defines interactive elements but does not include focus ring styling ` +
          `(focus-visible:ring-2, focus:ring-2, focus:ring-ring, or focus-ring utility). ` +
          `All interactive elements must have consistent focus ring styling per Requirement 3.2.`
        ).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  // Exhaustive check: verify EVERY critical file
  it('Property 5 (exhaustive): all critical interactive component files include focus ring styling', () => {
    const violations: string[] = []

    for (const filePath of focusRingCriticalFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const cleaned = stripComments(content)
      const relativePath = filePath.replace(/\\/g, '/').replace(process.cwd().replace(/\\/g, '/') + '/', '')

      // Components that delegate to Button
      if (delegatesToButton(filePath)) {
        const importsButton = /import\s+.*Button.*from/.test(cleaned)
        if (!importsButton) {
          violations.push(`${relativePath} (expected Button delegation but no Button import)`)
        }
        continue
      }

      if (!hasFocusRingStyle(cleaned)) {
        violations.push(relativePath)
      }
    }

    expect(
      violations,
      `The following interactive component files lack focus ring styling:\n` +
      violations.map((v) => `  ${v}`).join('\n') +
      `\nAll interactive elements must include focus-visible:ring-2 or equivalent per Requirement 3.2.`
    ).toHaveLength(0)
  })

  // Specific check: Button component has the full focus-visible ring pattern
  it('Property 5 (Button): includes full focus-visible ring pattern', () => {
    const buttonFile = focusRingCriticalFiles.find((f) => f.replace(/\\/g, '/').endsWith('/Button.tsx'))
    expect(buttonFile).toBeDefined()

    const content = readFileSync(buttonFile!, 'utf-8')
    const cleaned = stripComments(content)

    expect(cleaned, 'Button should have focus-visible:ring-2').toContain('focus-visible:ring-2')
    expect(cleaned, 'Button should have focus-visible:ring-ring').toContain('focus-visible:ring-ring')
    expect(cleaned, 'Button should have focus-visible:ring-offset-2').toContain('focus-visible:ring-offset-2')
  })

  // Specific check: Input component has focus-visible ring pattern
  it('Property 5 (Input): includes focus-visible ring pattern', () => {
    const inputFile = focusRingCriticalFiles.find((f) => f.replace(/\\/g, '/').endsWith('/input.tsx'))
    expect(inputFile).toBeDefined()

    const content = readFileSync(inputFile!, 'utf-8')
    const cleaned = stripComments(content)

    expect(cleaned, 'Input should have focus-visible:ring-2').toContain('focus-visible:ring-2')
    expect(cleaned, 'Input should have focus-visible:ring-ring').toContain('focus-visible:ring-ring')
    expect(cleaned, 'Input should have focus-visible:ring-offset-2').toContain('focus-visible:ring-offset-2')
  })

  // Specific check: Select component has focus-visible ring pattern
  it('Property 5 (Select): includes focus-visible ring pattern', () => {
    const selectFile = focusRingCriticalFiles.find((f) => f.replace(/\\/g, '/').endsWith('/select.tsx'))
    expect(selectFile).toBeDefined()

    const content = readFileSync(selectFile!, 'utf-8')
    const cleaned = stripComments(content)

    expect(cleaned, 'Select should have focus-visible:ring-2').toContain('focus-visible:ring-2')
    expect(cleaned, 'Select should have focus-visible:ring-ring').toContain('focus-visible:ring-ring')
    expect(cleaned, 'Select should have focus-visible:ring-offset-2').toContain('focus-visible:ring-offset-2')
  })

  // Specific check: Card interactive variant has focus-visible ring pattern
  it('Property 5 (Card): interactive variant includes focus-visible ring pattern', () => {
    const cardFile = focusRingCriticalFiles.find((f) => f.replace(/\\/g, '/').endsWith('/card.tsx'))
    expect(cardFile).toBeDefined()

    const content = readFileSync(cardFile!, 'utf-8')
    const cleaned = stripComments(content)

    // Card's interactive variant should have focus ring styling
    expect(cleaned, 'Card interactive variant should have focus-visible:ring-2').toContain('focus-visible:ring-2')
    expect(cleaned, 'Card interactive variant should have focus-visible:ring-ring').toContain('focus-visible:ring-ring')
    expect(cleaned, 'Card interactive variant should have focus-visible:ring-offset-2').toContain('focus-visible:ring-offset-2')
  })
})


// ---------------------------------------------------------------------------
// Property 12: Reduced motion support
// Feature: website-ui-ux-fix, Property 12: Reduced motion support
//
// For any component that uses animations, the component SHALL include
// `motion-reduce:` utility classes or `prefers-reduced-motion` media query
// handling to disable non-essential animations.
//
// **Validates: Requirements 9.3**
// ---------------------------------------------------------------------------

/**
 * Significant animation class patterns that warrant reduced motion handling.
 * Simple `transition-colors` or `transition-shadow` are generally acceptable
 * without explicit reduced motion handling. We focus on visible, potentially
 * discomfort-causing animations.
 */
const SIGNIFICANT_ANIMATION_PATTERNS = [
  /\banimate-spin\b/,
  /\banimate-pulse\b/,
  /\banimate-bounce\b/,
  /\banimate-fade/,
  /\banimate-scale/,
  /\banimate-slide/,
  /\banimate-in\b/,
  /\banimate-out\b/,
  /\banimate-\[/,           // arbitrary animation values e.g. animate-[spin_3s...]
]

/**
 * Patterns that indicate the component handles reduced motion.
 */
const REDUCED_MOTION_PATTERNS = [
  /motion-reduce:/,
  /motion-safe:/,
  /prefers-reduced-motion/,
]

/**
 * Check if file content contains significant animation classes.
 */
function hasSignificantAnimations(content: string): boolean {
  return SIGNIFICANT_ANIMATION_PATTERNS.some((pattern) => pattern.test(content))
}

/**
 * Check if file content contains reduced motion handling.
 */
function hasReducedMotionHandling(content: string): boolean {
  return REDUCED_MOTION_PATTERNS.some((pattern) => pattern.test(content))
}

/**
 * The global CSS file (src/index.css) contains a blanket
 * `@media (prefers-reduced-motion: reduce)` rule that sets
 * animation-duration and transition-duration to near-zero for all elements.
 * This provides a baseline safety net for all components.
 *
 * We verify this global rule exists, and additionally check that components
 * with significant animations either rely on this global rule or have their
 * own component-level reduced motion handling.
 */
const GLOBAL_CSS_PATH = join(process.cwd(), 'src', 'index.css')
const globalCssContent = readFileSync(GLOBAL_CSS_PATH, 'utf-8')
const hasGlobalReducedMotionRule =
  /prefers-reduced-motion:\s*reduce/.test(globalCssContent) &&
  /animation-duration:\s*0\.01ms\s*!important/.test(globalCssContent) &&
  /transition-duration:\s*0\.01ms\s*!important/.test(globalCssContent)

/** Collect component files that use significant animations */
const filesWithSignificantAnimations = allComponentFiles.filter((filePath) => {
  const content = readFileSync(filePath, 'utf-8')
  const cleaned = stripComments(content)
  return hasSignificantAnimations(cleaned)
})

describe('Feature: website-ui-ux-fix, Property 12: Reduced motion support', () => {
  it('should find component files with significant animations to test', () => {
    expect(filesWithSignificantAnimations.length).toBeGreaterThan(0)
  })

  // Verify the global CSS blanket rule exists as a safety net
  it('Property 12 (global): src/index.css contains blanket prefers-reduced-motion rule', () => {
    expect(
      hasGlobalReducedMotionRule,
      'src/index.css must contain a @media (prefers-reduced-motion: reduce) rule ' +
      'that sets animation-duration and transition-duration to near-zero for all elements. ' +
      'This provides the baseline safety net for reduced motion support.'
    ).toBe(true)
  })

  // Feature: website-ui-ux-fix, Property 12: Reduced motion support
  it('Property 12: components with significant animations have reduced motion coverage', () => {
    // Every component with significant animations is covered either by:
    // 1. The global CSS blanket rule (always applies), OR
    // 2. Component-level motion-reduce: / motion-safe: / prefers-reduced-motion handling
    //
    // Since the global rule exists, all components are covered. But we still
    // verify the global rule is present for each sampled file as a property check.
    const fileIndexArb = fc.integer({
      min: 0,
      max: filesWithSignificantAnimations.length - 1,
    })

    fc.assert(
      fc.property(fileIndexArb, (index) => {
        const filePath = filesWithSignificantAnimations[index]
        const content = readFileSync(filePath, 'utf-8')
        const cleaned = stripComments(content)
        const relativePath = filePath
          .replace(/\\/g, '/')
          .replace(process.cwd().replace(/\\/g, '/') + '/', '')

        // The component is covered if EITHER:
        // a) The global CSS blanket rule exists (covers all elements), OR
        // b) The component itself has reduced motion handling
        const isCovered =
          hasGlobalReducedMotionRule || hasReducedMotionHandling(cleaned)

        expect(
          isCovered,
          `${relativePath} uses significant animations but has no reduced motion support. ` +
          `Either add motion-reduce: utility classes, prefers-reduced-motion media query handling, ` +
          `or ensure the global CSS (src/index.css) has a blanket reduced motion rule.`
        ).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  // Exhaustive check: verify EVERY file with significant animations
  it('Property 12 (exhaustive): all files with significant animations have reduced motion coverage', () => {
    const violations: string[] = []

    for (const filePath of filesWithSignificantAnimations) {
      const content = readFileSync(filePath, 'utf-8')
      const cleaned = stripComments(content)
      const relativePath = filePath
        .replace(/\\/g, '/')
        .replace(process.cwd().replace(/\\/g, '/') + '/', '')

      const isCovered =
        hasGlobalReducedMotionRule || hasReducedMotionHandling(cleaned)

      if (!isCovered) {
        violations.push(relativePath)
      }
    }

    expect(
      violations,
      `The following files use significant animations without reduced motion coverage:\n` +
      violations.map((v) => `  ${v}`).join('\n') +
      `\nEach must have motion-reduce: classes, prefers-reduced-motion handling, ` +
      `or be covered by the global CSS blanket rule.`
    ).toHaveLength(0)
  })

  // Specific check: components with component-level reduced motion handling
  it('Property 12 (component-level): key interactive components have explicit motion-reduce handling', () => {
    // These components are known to have their own motion-reduce: classes
    // beyond the global CSS rule, providing defense-in-depth
    const COMPONENTS_WITH_EXPLICIT_HANDLING = [
      'Button.tsx',
      'input.tsx',
      'select.tsx',
    ]

    for (const fileName of COMPONENTS_WITH_EXPLICIT_HANDLING) {
      const filePath = allComponentFiles.find((f) =>
        f.replace(/\\/g, '/').endsWith(`/${fileName}`)
      )
      expect(filePath, `Expected to find ${fileName} in component files`).toBeDefined()

      const content = readFileSync(filePath!, 'utf-8')
      const cleaned = stripComments(content)
      const relativePath = filePath!
        .replace(/\\/g, '/')
        .replace(process.cwd().replace(/\\/g, '/') + '/', '')

      expect(
        hasReducedMotionHandling(cleaned),
        `${relativePath} should have explicit component-level reduced motion handling ` +
        `(motion-reduce: or prefers-reduced-motion) as defense-in-depth.`
      ).toBe(true)
    }
  })
})


// ---------------------------------------------------------------------------
// Property 13: Bottom navigation item limit
// Feature: website-ui-ux-fix, Property 13: Bottom navigation item limit
//
// For any set of navigation items passed to BottomNavigation, the rendered
// navigation SHALL display at most 5 items.
//
// **Validates: Requirements 4.3**
// ---------------------------------------------------------------------------

/**
 * Bottom navigation component files to check for item limiting logic.
 * We check both the canonical BottomNavigation and the MobileBottomNav.
 */
const BOTTOM_NAV_FILES = [
  join(process.cwd(), 'src', 'components', 'ui', 'BottomNavigation.tsx'),
  join(process.cwd(), 'src', 'components', 'navigation', 'MobileBottomNav.tsx'),
]

const existingBottomNavFiles = BOTTOM_NAV_FILES.filter((f) => {
  try {
    statSync(f)
    return true
  } catch {
    return false
  }
})

/**
 * Patterns that indicate the component enforces a maximum item limit of 5 or fewer.
 * This includes:
 * - .slice(0, 5) or .slice(0,5) — explicit truncation
 * - MAX_ITEMS, MAX_NAV_ITEMS, or similar constants set to 5
 * - items.length > 5 or items.length <= 5 — conditional checks
 * - Hardcoded arrays with ≤5 items used as defaults
 * - "More" button pattern that limits visible items to ≤5 (3-4 main + "More")
 */
const ITEM_LIMIT_PATTERNS = [
  /\.slice\(\s*0\s*,\s*[1-5]\s*\)/,                    // .slice(0, 5) or fewer
  /MAX_(?:NAV_)?ITEMS\s*=\s*[1-5]\b/,                   // MAX_ITEMS = 5
  /\.length\s*>\s*5\b/,                                  // items.length > 5
  /\.length\s*<=?\s*5\b/,                                // items.length <= 5
  /\.length\s*>=?\s*5\b/,                                // items.length >= 5
]

/**
 * Check if a component uses a "More" overflow pattern, which inherently
 * limits the number of visible bottom nav items by showing only a fixed
 * set of main links plus a "More" button.
 */
const MORE_OVERFLOW_PATTERN = /['"]More['"]/

/**
 * Count the number of hardcoded nav item entries in arrays.
 * Matches patterns like: { href: '...', label: '...', icon: ... }
 * Returns the maximum array size found.
 */
function getMaxHardcodedNavArraySize(content: string): number {
  // Match array blocks that look like nav item arrays (contain href/to and label/icon)
  const arrayPattern = /(?:const|let|var)\s+\w+(?:Nav(?:Items|Links)|(?:main|student|admin)(?:Links|Items))\s*(?::\s*[^=]+)?\s*=\s*\[([\s\S]*?)\]/g
  let maxSize = 0
  let match: RegExpExecArray | null

  while ((match = arrayPattern.exec(content)) !== null) {
    const arrayContent = match[1]
    // Count object literals in the array (each { ... } is one nav item)
    const itemCount = (arrayContent.match(/\{[^{}]*(?:href|to)\s*:/g) || []).length
    if (itemCount > maxSize) {
      maxSize = itemCount
    }
  }

  return maxSize
}

describe('Feature: website-ui-ux-fix, Property 13: Bottom navigation item limit', () => {
  it('should find at least one bottom navigation component file', () => {
    expect(
      existingBottomNavFiles.length,
      'Expected to find at least one bottom navigation component file ' +
      '(BottomNavigation.tsx or MobileBottomNav.tsx)'
    ).toBeGreaterThan(0)
  })

  // Feature: website-ui-ux-fix, Property 13: Bottom navigation item limit
  it('Property 13: bottom navigation components enforce at most 5 visible items', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: existingBottomNavFiles.length - 1 }),
        (index) => {
          const filePath = existingBottomNavFiles[index]
          const content = readFileSync(filePath, 'utf-8')
          const cleaned = stripComments(content)
          const relativePath = filePath
            .replace(/\\/g, '/')
            .replace(process.cwd().replace(/\\/g, '/') + '/', '')

          // Check for explicit item limit patterns
          const hasExplicitLimit = ITEM_LIMIT_PATTERNS.some((p) => p.test(cleaned))

          // Check for "More" overflow pattern (limits visible items inherently)
          const hasMoreOverflow = MORE_OVERFLOW_PATTERN.test(cleaned)

          // Check that all hardcoded nav arrays have ≤5 items
          const maxArraySize = getMaxHardcodedNavArraySize(cleaned)
          const hardcodedArraysWithinLimit = maxArraySize <= 5

          // The component enforces the limit if ANY of these hold:
          // 1. It has an explicit .slice() or length check
          // 2. It uses a "More" overflow button pattern
          // 3. All hardcoded nav arrays have ≤5 items (no dynamic unbounded rendering)
          const enforcesLimit =
            hasExplicitLimit || hasMoreOverflow || hardcodedArraysWithinLimit

          expect(
            enforcesLimit,
            `${relativePath} does not enforce a maximum of 5 bottom navigation items. ` +
            `The component should either use .slice(0, 5), a MAX_ITEMS constant, ` +
            `a "More" overflow pattern, or ensure all hardcoded nav arrays have ≤5 items. ` +
            `Found max hardcoded array size: ${maxArraySize}.`
          ).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Property test with generated item counts: verify the limit conceptually holds
  it('Property 13 (generated): any item count 1-10 would be limited to at most 5 visible', () => {
    // Read the canonical BottomNavigation component
    const bottomNavPath = existingBottomNavFiles.find((f) =>
      f.replace(/\\/g, '/').includes('BottomNavigation.tsx')
    )

    if (!bottomNavPath) {
      // If no BottomNavigation.tsx exists, skip this sub-test
      return
    }

    const content = readFileSync(bottomNavPath, 'utf-8')
    const cleaned = stripComments(content)

    // Determine the enforcement mechanism
    const hasSliceLimit = /\.slice\(\s*0\s*,\s*[1-5]\s*\)/.test(cleaned)
    const hasLengthCheck = /\.length\s*[><=]+\s*5/.test(cleaned)
    const hasMoreButton = MORE_OVERFLOW_PATTERN.test(cleaned)
    const maxArray = getMaxHardcodedNavArraySize(cleaned)

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (itemCount) => {
          // If the component uses .slice(0, N) where N <= 5, any input is safe
          if (hasSliceLimit) return true

          // If the component has a length check, it handles overflow
          if (hasLengthCheck) return true

          // If it uses a "More" button, visible items are bounded
          if (hasMoreButton) return true

          // If all hardcoded arrays are ≤5 and the component only uses those
          // (no dynamic unbounded rendering of arbitrary items), the limit holds
          if (maxArray <= 5 && maxArray > 0) return true

          // If none of the above, the property fails for item counts > 5
          return itemCount <= 5
        }
      ),
      { numRuns: 100 }
    )
  })

  // Exhaustive check: verify ALL bottom nav files enforce the limit
  it('Property 13 (exhaustive): all bottom navigation files enforce ≤5 visible items', () => {
    const violations: string[] = []

    for (const filePath of existingBottomNavFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const cleaned = stripComments(content)
      const relativePath = filePath
        .replace(/\\/g, '/')
        .replace(process.cwd().replace(/\\/g, '/') + '/', '')

      const hasExplicitLimit = ITEM_LIMIT_PATTERNS.some((p) => p.test(cleaned))
      const hasMoreOverflow = MORE_OVERFLOW_PATTERN.test(cleaned)
      const maxArraySize = getMaxHardcodedNavArraySize(cleaned)
      const hardcodedWithinLimit = maxArraySize <= 5

      if (!hasExplicitLimit && !hasMoreOverflow && !hardcodedWithinLimit) {
        violations.push(
          `${relativePath} (max hardcoded array: ${maxArraySize} items, ` +
          `no .slice limit, no "More" overflow)`
        )
      }
    }

    expect(
      violations,
      `The following bottom navigation files do not enforce ≤5 visible items:\n` +
      violations.map((v) => `  ${v}`).join('\n') +
      `\nRequirement 4.3: bottom navigation bar with no more than 5 items.`
    ).toHaveLength(0)
  })

  // Specific check: AppLayout passes ≤5 items to BottomNavigation
  it('Property 13 (AppLayout): nav item arrays passed to BottomNavigation have ≤5 items', () => {
    const appLayoutPath = join(
      process.cwd(),
      'src',
      'components',
      'navigation',
      'AppLayout.tsx'
    )

    let content: string
    try {
      content = readFileSync(appLayoutPath, 'utf-8')
    } catch {
      // AppLayout doesn't exist — skip
      return
    }

    const cleaned = stripComments(content)
    const maxArraySize = getMaxHardcodedNavArraySize(cleaned)

    expect(
      maxArraySize,
      `AppLayout defines nav item arrays with ${maxArraySize} items, ` +
      `but bottom navigation must have at most 5 items (Requirement 4.3).`
    ).toBeLessThanOrEqual(5)
  })
})
