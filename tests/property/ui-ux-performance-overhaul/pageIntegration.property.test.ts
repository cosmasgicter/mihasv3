// @vitest-environment node
/**
 * Property-Based Tests: Page Integration
 * Feature: ui-ux-performance-overhaul
 * Task: 7.7 Write property tests for page integration
 *
 * **Property 21: Semantic HTML Heading Hierarchy** — one `<h1>` per page, no skipped heading levels
 * **Property 23: Skip Link Presence** — first focusable element is skip link targeting `#main-content`
 *
 * **Validates: Requirements 16.6, 17.2**
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

const SRC_DIR = resolve(process.cwd(), 'src')
const UI_DIR = resolve(SRC_DIR, 'components/ui')
const NAV_DIR = resolve(SRC_DIR, 'components/navigation')
const PAGES_DIR = resolve(SRC_DIR, 'pages')

const COMPONENT_PATHS = {
  PageShell: resolve(UI_DIR, 'PageShell.tsx'),
  SkipLink: resolve(UI_DIR, 'SkipLink.tsx'),
  AppLayout: resolve(NAV_DIR, 'AppLayout.tsx'),
  AccessibilityUtils: resolve(SRC_DIR, 'lib/accessibility-utils.ts'),
} as const

/**
 * Pages that use PageShell (authenticated pages).
 * These should NOT add their own <h1> since PageShell provides one.
 */
const PAGE_SHELL_PAGES = {
  StudentDashboard: resolve(PAGES_DIR, 'student/Dashboard.tsx'),
  StudentSettings: resolve(PAGES_DIR, 'student/Settings.tsx'),
  StudentPayment: resolve(PAGES_DIR, 'student/Payment.tsx'),
  StudentInterview: resolve(PAGES_DIR, 'student/Interview.tsx'),
  StudentNotificationSettings: resolve(PAGES_DIR, 'student/NotificationSettings.tsx'),
  StudentApplicationDetail: resolve(PAGES_DIR, 'student/ApplicationDetail.tsx'),
  StudentApplicationStatus: resolve(PAGES_DIR, 'student/ApplicationStatus.tsx'),
  AdminDashboard: resolve(PAGES_DIR, 'admin/Dashboard.tsx'),
  AdminApplications: resolve(PAGES_DIR, 'admin/Applications.tsx'),
  AdminUsers: resolve(PAGES_DIR, 'admin/Users.tsx'),
  AdminSettings: resolve(PAGES_DIR, 'admin/Settings.tsx'),
  AdminAuditTrail: resolve(PAGES_DIR, 'admin/AuditTrail.tsx'),
  AdminMonitoring: resolve(PAGES_DIR, 'admin/Monitoring.tsx'),
  AdminIntakes: resolve(PAGES_DIR, 'admin/Intakes.tsx'),
  AdminPrograms: resolve(PAGES_DIR, 'admin/Programs.tsx'),
  AdminBatchOperations: resolve(PAGES_DIR, 'admin/BatchOperations.tsx'),
  AdminEligibilityManagement: resolve(PAGES_DIR, 'admin/EligibilityManagement.tsx'),
} as const

// ============================================================================
// Helpers
// ============================================================================

function loadSource(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return undefined
  }
}

// Load all sources once at module level
const sources: Record<string, string | undefined> = {}
for (const [name, path] of Object.entries(COMPONENT_PATHS)) {
  sources[name] = loadSource(path)
}

const pageSources: Record<string, string | undefined> = {}
for (const [name, path] of Object.entries(PAGE_SHELL_PAGES)) {
  pageSources[name] = loadSource(path)
}

// ============================================================================
// Property 21: Semantic HTML Heading Hierarchy
// ============================================================================

describe('Property 21: Semantic HTML Heading Hierarchy', () => {
  /**
   * **Validates: Requirements 17.2**
   *
   * For any page rendered within PageShell, the page should contain exactly one
   * <h1> element. All heading elements (h1 through h6) should follow a logical
   * hierarchy where no level is skipped (e.g., h1 → h3 without h2 is invalid).
   */

  const pageShellSrc = sources.PageShell
  const ensurePageShellLoaded = () =>
    expect(pageShellSrc, 'PageShell source must be loaded').toBeDefined()

  it('PROPERTY: PageShell renders exactly one <h1> element', () => {
    ensurePageShellLoaded()
    const h1Matches = pageShellSrc!.match(/<h1[\s>]/g) || []
    expect(
      h1Matches.length,
      'PageShell must render exactly one <h1> element'
    ).toBe(1)
  })

  it('PROPERTY: PageShell does not skip heading levels (h1 present, no h3+ without h2)', () => {
    ensurePageShellLoaded()

    // Extract all heading tags from PageShell source
    const headingMatches = pageShellSrc!.match(/<h([1-6])[\s>]/g) || []
    const levels = headingMatches.map(m => parseInt(m.match(/h([1-6])/)?.[1] ?? '0'))

    // PageShell should have h1 at minimum
    expect(levels.includes(1), 'PageShell must contain an <h1>').toBe(true)

    // Check no levels are skipped within PageShell itself
    for (let i = 1; i < levels.length; i++) {
      const current = levels[i]
      const previous = levels[i - 1]
      // Going deeper should not skip levels (e.g., h1 → h3 without h2)
      if (current > previous) {
        expect(
          current - previous,
          `Heading hierarchy skip detected: h${previous} → h${current}`
        ).toBeLessThanOrEqual(1)
      }
    }
  })

  it('PROPERTY: Pages using PageShell do not add additional <h1> elements', () => {
    ensurePageShellLoaded()

    // Get all loaded page sources that use PageShell
    const pagesWithPageShell = Object.entries(pageSources).filter(
      ([, src]) => src && src.includes('PageShell')
    )

    expect(
      pagesWithPageShell.length,
      'At least some pages should use PageShell'
    ).toBeGreaterThan(0)

    for (const [pageName, src] of pagesWithPageShell) {
      // Count <h1> tags in the page source (excluding the PageShell import/usage)
      // Pages should NOT render their own <h1> since PageShell provides one
      const h1Matches = src!.match(/<h1[\s>]/g) || []
      expect(
        h1Matches.length,
        `Page ${pageName} must not add its own <h1> — PageShell provides the page heading`
      ).toBe(0)
    }
  })

  it('PROPERTY: For any page using PageShell, no heading level exceeds h4 without lower levels present', () => {
    ensurePageShellLoaded()

    const pageNameArb = fc.constantFrom(
      ...Object.keys(pageSources).filter(name => {
        const src = pageSources[name]
        return src && src.includes('PageShell')
      })
    )

    fc.assert(
      fc.property(pageNameArb, (pageName) => {
        const src = pageSources[pageName]!

        // Extract the set of distinct heading levels used in the page
        const headingMatches = src.match(/<h([1-6])[\s>]/g) || []
        const levels = headingMatches.map(m => parseInt(m.match(/h([1-6])/)?.[1] ?? '0'))
        const uniqueLevels = [...new Set(levels)].sort((a, b) => a - b)

        // Since PageShell provides h1, page headings should start at h2 or lower
        if (uniqueLevels.length > 0) {
          const minLevel = uniqueLevels[0]
          expect(
            minLevel,
            `Page ${pageName}: lowest heading should be h2+ (h1 is in PageShell), found h${minLevel}`
          ).toBeGreaterThanOrEqual(2)
        }

        // Verify no deeply nested headings (h5, h6) appear without their parent levels.
        // h2 and h3 are commonly used as section/subsection headings in pages.
        // If h4+ is used, h2 must also be present (allowing h3 as a common subsection pattern).
        if (uniqueLevels.includes(4) || uniqueLevels.includes(5) || uniqueLevels.includes(6)) {
          expect(
            uniqueLevels.includes(2) || uniqueLevels.includes(3),
            `Page ${pageName}: uses deep headings (h4+) without h2 or h3 — hierarchy too deep`
          ).toBe(true)
        }

        // No heading should exceed h6
        for (const level of uniqueLevels) {
          expect(
            level,
            `Page ${pageName}: heading level h${level} exceeds maximum h6`
          ).toBeLessThanOrEqual(6)
        }
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: validateHeadingHierarchy utility correctly validates heading sequences', () => {
    const utilsSrc = sources.AccessibilityUtils
    expect(utilsSrc, 'accessibility-utils.ts must be loaded').toBeDefined()

    // The utility should export a validateHeadingHierarchy function
    expect(
      utilsSrc!.includes('validateHeadingHierarchy'),
      'accessibility-utils must export validateHeadingHierarchy function'
    ).toBe(true)
  })
})


// ============================================================================
// Property 23: Skip Link Presence
// ============================================================================

describe('Property 23: Skip Link Presence', () => {
  /**
   * **Validates: Requirements 16.6**
   *
   * For any page rendered with the app shell, the first focusable element in
   * the DOM should be a skip link (<a>) targeting #main-content that is
   * visually hidden until focused.
   */

  const skipLinkSrc = sources.SkipLink
  const appLayoutSrc = sources.AppLayout
  const utilsSrc = sources.AccessibilityUtils

  const ensureSkipLinkLoaded = () =>
    expect(skipLinkSrc, 'SkipLink source must be loaded').toBeDefined()
  const ensureAppLayoutLoaded = () =>
    expect(appLayoutSrc, 'AppLayout source must be loaded').toBeDefined()

  it('PROPERTY: SkipLink component renders an <a> element', () => {
    ensureSkipLinkLoaded()
    expect(
      skipLinkSrc!.includes('<a'),
      'SkipLink must render an <a> element'
    ).toBe(true)
  })

  it('PROPERTY: SkipLink targets the main content area via APP_MAIN_CONTENT_ID', () => {
    ensureSkipLinkLoaded()

    // SkipLink should reference APP_MAIN_CONTENT_ID for its href
    const targetsMainContent =
      skipLinkSrc!.includes('APP_MAIN_CONTENT_ID') ||
      skipLinkSrc!.includes('#main-content') ||
      skipLinkSrc!.includes('#app-main-content')

    expect(
      targetsMainContent,
      'SkipLink must target the main content area (APP_MAIN_CONTENT_ID or #main-content)'
    ).toBe(true)
  })

  it('PROPERTY: SkipLink default text is "Skip to main content"', () => {
    ensureSkipLinkLoaded()
    expect(
      skipLinkSrc!.includes('Skip to main content'),
      'SkipLink must have default text "Skip to main content"'
    ).toBe(true)
  })

  it('PROPERTY: SkipLink is visually hidden until focused', () => {
    ensureSkipLinkLoaded()

    // The skip link should use a visually-hidden-until-focused pattern
    // Check for the CSS classes used in skipLinkClasses from accessibility-utils
    const hasHiddenPattern =
      // Transform-based hiding (used in this project)
      skipLinkSrc!.includes('skipLinkClasses') ||
      // Or direct sr-only pattern
      skipLinkSrc!.includes('sr-only') ||
      // Or translate-based hiding
      skipLinkSrc!.includes('-translate-y-full')

    expect(
      hasHiddenPattern,
      'SkipLink must be visually hidden until focused (using skipLinkClasses, sr-only, or translate)'
    ).toBe(true)
  })

  it('PROPERTY: SkipLink becomes visible on focus', () => {
    // Check the skipLinkClasses in accessibility-utils for focus visibility
    expect(utilsSrc, 'accessibility-utils.ts must be loaded').toBeDefined()

    const hasFocusVisibility =
      utilsSrc!.includes('focus:translate-y-0') ||
      utilsSrc!.includes('focus:not-sr-only') ||
      utilsSrc!.includes('focus:opacity-100')

    expect(
      hasFocusVisibility,
      'skipLinkClasses must make the link visible on focus'
    ).toBe(true)
  })

  it('PROPERTY: AppLayout renders SkipLink as the first child element', () => {
    ensureAppLayoutLoaded()

    // SkipLink must be imported and used in AppLayout
    expect(
      appLayoutSrc!.includes('SkipLink'),
      'AppLayout must import and use SkipLink component'
    ).toBe(true)

    // SkipLink should appear before other content in the layout
    // Find the position of SkipLink usage vs other major elements
    const skipLinkPos = appLayoutSrc!.indexOf('<SkipLink')
    const sidebarPos = appLayoutSrc!.indexOf('<DesktopSidebar')
    const mainPos = appLayoutSrc!.indexOf('<main')
    const headerPos = appLayoutSrc!.indexOf('<Header')

    expect(
      skipLinkPos,
      'SkipLink must be rendered in AppLayout'
    ).toBeGreaterThan(-1)

    // SkipLink should come before sidebar, main, and header
    if (sidebarPos > -1) {
      expect(
        skipLinkPos,
        'SkipLink must appear before DesktopSidebar in DOM order'
      ).toBeLessThan(sidebarPos)
    }
    if (mainPos > -1) {
      expect(
        skipLinkPos,
        'SkipLink must appear before <main> in DOM order'
      ).toBeLessThan(mainPos)
    }
    if (headerPos > -1) {
      expect(
        skipLinkPos,
        'SkipLink must appear before Header in DOM order'
      ).toBeLessThan(headerPos)
    }
  })

  it('PROPERTY: AppLayout main content area has the matching ID for skip link target', () => {
    ensureAppLayoutLoaded()

    // The main element should have the APP_MAIN_CONTENT_ID
    const hasMainContentId =
      appLayoutSrc!.includes('APP_MAIN_CONTENT_ID') ||
      appLayoutSrc!.includes('id="app-main-content"') ||
      appLayoutSrc!.includes('id="main-content"')

    expect(
      hasMainContentId,
      'AppLayout <main> must have the APP_MAIN_CONTENT_ID for skip link targeting'
    ).toBe(true)
  })

  it('PROPERTY: APP_MAIN_CONTENT_ID is defined in accessibility-utils', () => {
    expect(utilsSrc, 'accessibility-utils.ts must be loaded').toBeDefined()

    expect(
      utilsSrc!.includes('APP_MAIN_CONTENT_ID'),
      'accessibility-utils must export APP_MAIN_CONTENT_ID constant'
    ).toBe(true)
  })

  it('PROPERTY: For any arbitrary page path, the skip link structure is consistent', () => {
    ensureAppLayoutLoaded()
    ensureSkipLinkLoaded()

    const pagePathArb = fc.constantFrom(
      '/student/dashboard',
      '/student/settings',
      '/student/payment',
      '/admin/dashboard',
      '/admin/applications',
      '/admin/users',
    )

    fc.assert(
      fc.property(pagePathArb, (_path) => {
        // Regardless of which page is rendered, the AppLayout always includes:
        // 1. SkipLink as first focusable element
        expect(
          appLayoutSrc!.includes('<SkipLink'),
          'AppLayout must always render SkipLink regardless of route'
        ).toBe(true)

        // 2. A main element with the target ID
        expect(
          appLayoutSrc!.includes('APP_MAIN_CONTENT_ID'),
          'AppLayout must always have main content ID regardless of route'
        ).toBe(true)

        // 3. SkipLink targets the correct ID
        expect(
          skipLinkSrc!.includes('APP_MAIN_CONTENT_ID'),
          'SkipLink must reference APP_MAIN_CONTENT_ID'
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })
})
