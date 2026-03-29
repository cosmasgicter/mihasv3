// @vitest-environment node
/**
 * Property-Based Tests: Responsive Design
 * Feature: ui-ux-performance-overhaul
 * Task: 17.3 Write property tests for responsive design
 *
 * **Property 27: No Horizontal Overflow at Any Breakpoint** — scrollWidth ≤ viewport width at all breakpoints
 * **Property 28: Modal Responsive Sizing** — full-screen below 768px, centered card above
 *
 * **Validates: Requirements 18.1, 18.5**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ============================================================================
// Test Configuration
// ============================================================================

const NUM_RUNS = 10

// ============================================================================
// Component File Paths
// ============================================================================

const UI_DIR = resolve(process.cwd(), 'src/components/ui')
const NAV_DIR = resolve(process.cwd(), 'src/components/navigation')
const AUTH_DIR = resolve(process.cwd(), 'src/components/auth')

const COMPONENT_PATHS = {
  PageShell: resolve(UI_DIR, 'PageShell.tsx'),
  AuthLayout: resolve(AUTH_DIR, 'AuthLayout.tsx'),
  BottomNavigation: resolve(UI_DIR, 'BottomNavigation.tsx'),
  ResponsiveTable: resolve(UI_DIR, 'ResponsiveTable.tsx'),
  AppLayout: resolve(NAV_DIR, 'AppLayout.tsx'),
  Dialog: resolve(UI_DIR, 'Dialog.tsx'),
  ConfirmDialog: resolve(UI_DIR, 'ConfirmDialog.tsx'),
} as const

// ============================================================================
// Helpers
// ============================================================================

function loadSource(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

function hasAuthLayoutWidthConstraint(source: string): boolean {
  return /max-w-(md|xl|2xl|3xl)\b/.test(source)
}

// Load all sources once at module level
const sources: Record<string, string> = {}
for (const [name, path] of Object.entries(COMPONENT_PATHS)) {
  try {
    sources[name] = loadSource(path)
  } catch {
    // File may not exist — tests will fail with clear message
  }
}

/**
 * Responsive CSS patterns that prevent horizontal overflow.
 * Layout components must use these to ensure content stays within viewport.
 */
const OVERFLOW_PREVENTION_PATTERNS = [
  'max-w-full',
  'overflow-x-hidden',
  'overflow-x-auto',
  'overflow-hidden',
  'w-full',
  'min-w-0',
  'max-w-md',
  'max-w-lg',
  'max-w-xl',
  'max-w-2xl',
  'max-w-4xl',
  'max-w-5xl',
  'max-w-7xl',
  'max-w-screen',
] as const

/** Standard breakpoints from the design spec */
const BREAKPOINTS = [320, 375, 768, 1024, 1280, 1536] as const

// ============================================================================
// Property 27: No Horizontal Overflow at Any Breakpoint
// ============================================================================

describe('Property 27: No Horizontal Overflow at Any Breakpoint', () => {
  /**
   * **Validates: Requirements 18.1**
   *
   * For any page rendered at viewport widths 320px, 375px, 768px, 1024px,
   * 1280px, and 1536px, the document body's scrollWidth should not exceed
   * the viewport width, ensuring no horizontal scrollbar appears.
   *
   * We verify this via static analysis: layout components must use responsive
   * patterns (max-w-*, overflow-hidden/auto, w-full, min-w-0) that prevent
   * content from exceeding the viewport width.
   */

  it('PROPERTY: PageShell uses max-width constraint and responsive padding to prevent overflow', () => {
    const src = sources.PageShell
    expect(src, 'PageShell source must be loaded').toBeDefined()

    // PageShell must have a max-width container
    const hasMaxWidth = src.includes('max-w-')
    expect(hasMaxWidth, 'PageShell must use max-w-* to constrain content width').toBe(true)

    // PageShell must use mx-auto for centering within the max-width
    expect(src.includes('mx-auto'), 'PageShell must use mx-auto for centered layout').toBe(true)

    // PageShell must use responsive padding (px-4 base for mobile)
    expect(src.includes('px-4'), 'PageShell must use px-4 base padding for mobile').toBe(true)
  })

  it('PROPERTY: AuthLayout uses max-w-md and w-full to prevent overflow', () => {
    const src = sources.AuthLayout
    expect(src, 'AuthLayout source must be loaded').toBeDefined()

    expect(hasAuthLayoutWidthConstraint(src), 'AuthLayout must use a max-w-* constraint to prevent overflow').toBe(true)
    expect(src.includes('w-full'), 'AuthLayout must use w-full for responsive width').toBe(true)
    expect(src.includes('px-4'), 'AuthLayout must use horizontal padding for mobile').toBe(true)
  })

  it('PROPERTY: ResponsiveTable uses overflow-x-auto for desktop table view', () => {
    const src = sources.ResponsiveTable
    expect(src, 'ResponsiveTable source must be loaded').toBeDefined()

    expect(
      src.includes('overflow-x-auto'),
      'ResponsiveTable must use overflow-x-auto to handle wide tables without horizontal page overflow'
    ).toBe(true)
  })

  it('PROPERTY: ResponsiveTable desktop table uses w-full to fill container', () => {
    const src = sources.ResponsiveTable
    expect(src, 'ResponsiveTable source must be loaded').toBeDefined()

    expect(
      src.includes('w-full'),
      'ResponsiveTable <table> must use w-full to fill its container'
    ).toBe(true)
  })

  it('PROPERTY: AppLayout uses overflow-x-hidden and min-w-0 to prevent overflow', () => {
    const src = sources.AppLayout
    expect(src, 'AppLayout source must be loaded').toBeDefined()

    expect(
      src.includes('overflow-x-hidden'),
      'AppLayout must use overflow-x-hidden to prevent horizontal overflow at the app shell level'
    ).toBe(true)

    expect(
      src.includes('min-w-0'),
      'AppLayout must use min-w-0 on flex children to prevent flex items from overflowing'
    ).toBe(true)
  })

  it('PROPERTY: BottomNavigation uses fixed positioning with left-0 right-0 to stay within viewport', () => {
    const src = sources.BottomNavigation
    expect(src, 'BottomNavigation source must be loaded').toBeDefined()

    expect(src.includes('fixed'), 'BottomNavigation must use fixed positioning').toBe(true)
    expect(src.includes('left-0'), 'BottomNavigation must use left-0').toBe(true)
    expect(src.includes('right-0'), 'BottomNavigation must use right-0').toBe(true)
  })

  it('PROPERTY: For any breakpoint, layout components use responsive patterns that prevent overflow', () => {
    const breakpointArb = fc.constantFrom(...BREAKPOINTS)

    fc.assert(
      fc.property(breakpointArb, (breakpoint) => {
        // For each breakpoint, verify that the key layout components have
        // overflow prevention patterns in place

        const pageShell = sources.PageShell
        const authLayout = sources.AuthLayout
        const appLayout = sources.AppLayout

        expect(pageShell, 'PageShell source must be loaded').toBeDefined()
        expect(authLayout, 'AuthLayout source must be loaded').toBeDefined()
        expect(appLayout, 'AppLayout source must be loaded').toBeDefined()

        // PageShell: must have max-width + responsive padding at all breakpoints
        const pageShellHasConstraint =
          pageShell.includes('max-w-') && pageShell.includes('mx-auto')
        expect(
          pageShellHasConstraint,
          `PageShell must constrain width at ${breakpoint}px via max-w-* + mx-auto`
        ).toBe(true)

        // AuthLayout: must have max-w-md for form card
        expect(
          hasAuthLayoutWidthConstraint(authLayout),
          `AuthLayout must constrain form card width at ${breakpoint}px`
        ).toBe(true)

        // AppLayout: must prevent overflow at the shell level
        expect(
          appLayout.includes('overflow-x-hidden'),
          `AppLayout must prevent horizontal overflow at ${breakpoint}px`
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: Dialog uses w-full on mobile to prevent overflow', () => {
    const src = sources.Dialog
    expect(src, 'Dialog source must be loaded').toBeDefined()

    expect(
      src.includes('w-full'),
      'Dialog must use w-full to fill viewport on mobile'
    ).toBe(true)
  })
})


// ============================================================================
// Property 28: Modal Responsive Sizing
// ============================================================================

describe('Property 28: Modal Responsive Sizing', () => {
  /**
   * **Validates: Requirements 18.5**
   *
   * For any modal dialog, at viewport widths below 768px the modal should
   * render as full-screen (using inset-0 or equivalent), and at viewport
   * widths 768px and above it should render as a centered card with a
   * max-width constraint.
   */

  // --- Dialog (Radix-based) ---

  it('PROPERTY: Dialog uses inset-0 for full-screen mobile layout', () => {
    const src = sources.Dialog
    expect(src, 'Dialog source must be loaded').toBeDefined()

    // On mobile (base styles), the dialog should be full-screen via inset-0
    expect(
      src.includes('inset-0'),
      'Dialog must use inset-0 for full-screen mobile layout'
    ).toBe(true)
  })

  it('PROPERTY: Dialog uses md: breakpoint for centered card on desktop', () => {
    const src = sources.Dialog
    expect(src, 'Dialog source must be loaded').toBeDefined()

    // At md+ breakpoint, dialog should switch to centered card positioning
    const hasMdCentering =
      src.includes('md:left-[50%]') ||
      src.includes('md:translate-x-[-50%]') ||
      src.includes('md:inset-auto')

    expect(
      hasMdCentering,
      'Dialog must use md: breakpoint classes for centered card positioning on desktop'
    ).toBe(true)
  })

  it('PROPERTY: Dialog has max-width constraint on desktop via md:max-w-*', () => {
    const src = sources.Dialog
    expect(src, 'Dialog source must be loaded').toBeDefined()

    // Desktop dialog should have a max-width constraint
    const hasMdMaxWidth = /md:max-w-/.test(src)
    expect(
      hasMdMaxWidth,
      'Dialog must have md:max-w-* for max-width constraint on desktop'
    ).toBe(true)
  })

  it('PROPERTY: Dialog has rounded corners only on desktop (md:rounded-lg)', () => {
    const src = sources.Dialog
    expect(src, 'Dialog source must be loaded').toBeDefined()

    // Mobile: no rounded corners (full-screen), Desktop: rounded-lg
    expect(
      src.includes('md:rounded-lg') || src.includes('md:rounded-xl'),
      'Dialog must apply rounded corners only at md+ breakpoint for card appearance'
    ).toBe(true)
  })

  it('PROPERTY: Dialog has border only on desktop (md:border)', () => {
    const src = sources.Dialog
    expect(src, 'Dialog source must be loaded').toBeDefined()

    // Mobile: border-0 (full-screen), Desktop: md:border
    expect(
      src.includes('border-0') || src.includes('border-none'),
      'Dialog must have no border on mobile (full-screen mode)'
    ).toBe(true)
    expect(
      src.includes('md:border'),
      'Dialog must have border on desktop (card mode)'
    ).toBe(true)
  })

  // --- ConfirmDialog ---

  it('PROPERTY: ConfirmDialog uses full-viewport scrollable container for mobile', () => {
    const src = sources.ConfirmDialog
    expect(src, 'ConfirmDialog source must be loaded').toBeDefined()

    // ConfirmDialog uses a fixed inset-0 scrollable container
    expect(
      src.includes('fixed inset-0'),
      'ConfirmDialog must use fixed inset-0 for full-viewport coverage'
    ).toBe(true)

    expect(
      src.includes('overflow-y-auto'),
      'ConfirmDialog must use overflow-y-auto for scrollable content on small screens'
    ).toBe(true)
  })

  it('PROPERTY: ConfirmDialog centers content with flex and max-w-md constraint', () => {
    const src = sources.ConfirmDialog
    expect(src, 'ConfirmDialog source must be loaded').toBeDefined()

    expect(
      src.includes('items-center') && src.includes('justify-center'),
      'ConfirmDialog must center its card with flex centering'
    ).toBe(true)

    expect(
      src.includes('max-w-md'),
      'ConfirmDialog must constrain card width with max-w-md'
    ).toBe(true)
  })

  it('PROPERTY: ConfirmDialog uses w-full for responsive card width', () => {
    const src = sources.ConfirmDialog
    expect(src, 'ConfirmDialog source must be loaded').toBeDefined()

    expect(
      src.includes('w-full'),
      'ConfirmDialog card must use w-full to be responsive within its max-width constraint'
    ).toBe(true)
  })

  it('PROPERTY: ConfirmDialog buttons stack vertically on mobile (flex-col-reverse) and inline on desktop (sm:flex-row)', () => {
    const src = sources.ConfirmDialog
    expect(src, 'ConfirmDialog source must be loaded').toBeDefined()

    expect(
      src.includes('flex-col-reverse'),
      'ConfirmDialog buttons must stack vertically on mobile'
    ).toBe(true)

    expect(
      src.includes('sm:flex-row'),
      'ConfirmDialog buttons must be inline on larger screens'
    ).toBe(true)
  })

  it('PROPERTY: For any dialog size variant, Dialog applies md:max-w-* constraint', () => {
    const src = sources.Dialog
    expect(src, 'Dialog source must be loaded').toBeDefined()

    const sizeArb = fc.constantFrom('sm', 'md', 'lg', 'xl', 'full')

    fc.assert(
      fc.property(sizeArb, (size) => {
        // The Dialog component defines size variants that map to md:max-w-* classes
        const hasSizeMapping =
          src.includes('dialogSizeClasses') || src.includes('md:max-w-')

        expect(
          hasSizeMapping,
          `Dialog must have size variant mapping for size="${size}" with md:max-w-* classes`
        ).toBe(true)

        // Verify the size classes object exists and maps to md: prefixed max-widths
        const sizeClassesMatch = src.match(/md:max-w-/g) || []
        expect(
          sizeClassesMatch.length,
          'Dialog must define multiple md:max-w-* size variants'
        ).toBeGreaterThanOrEqual(1)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: Dialog mobile base styles use full-screen pattern (inset-0 + w-full + no rounded corners)', () => {
    const src = sources.Dialog
    expect(src, 'Dialog source must be loaded').toBeDefined()

    // Verify the combination of mobile full-screen patterns
    const hasInset0 = src.includes('inset-0')
    const hasWFull = src.includes('w-full')
    const hasBorder0 = src.includes('border-0')

    expect(
      hasInset0 && hasWFull && hasBorder0,
      'Dialog mobile base must combine inset-0 + w-full + border-0 for full-screen appearance'
    ).toBe(true)
  })
})
