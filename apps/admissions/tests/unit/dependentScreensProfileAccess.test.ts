/**
 * Dependent Screens Profile Access Verification
 *
 * Source-level verification that all screens displaying user/profile data
 * consume it through the canonical shared helpers:
 *   - useAuth() from AuthContext (session user)
 *   - useProfileQuery() from hooks/auth/useProfileQuery (full profile)
 *
 * This ensures profile updates that synchronize both
 *   ['user-profile', userId] and ['auth', 'session'] caches
 * propagate correctly to every dependent screen.
 *
 * Screens verified:
 *   1. Student Dashboard
 *   2. Settings page
 *   3. Application wizard (useWizardController + useProfileAutoPopulation)
 *   4. Header / UserMenu / DesktopSidebar / AppLayout
 *
 * Validates: Requirements 3.3 (profile update synchronization across screens)
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../src')

function readSource(relativePath: string): string {
  const fullPath = path.join(SRC_ROOT, relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the source imports useAuth from the canonical context */
function importsUseAuth(source: string): boolean {
  return /import\s+\{[^}]*\buseAuth\b[^}]*\}\s+from\s+['"]@\/contexts\/AuthContext['"]/.test(source)
}

/** Returns true when the source imports useProfileQuery from the canonical hook */
function importsUseProfileQuery(source: string): boolean {
  return /import\s+\{[^}]*\buseProfileQuery\b[^}]*\}\s+from\s+['"]@\/hooks\/auth\/useProfileQuery['"]/.test(source)
}

/** Returns true when the source calls useAuth() */
function callsUseAuth(source: string): boolean {
  return /\buseAuth\s*\(/.test(source)
}

/** Returns true when the source calls useProfileQuery() */
function callsUseProfileQuery(source: string): boolean {
  return /\buseProfileQuery\s*\(/.test(source)
}

/**
 * Returns true when the source contains a raw useQuery call with a
 * hardcoded 'user-profile' query key (divergent profile fetch).
 */
function hasDivergentProfileQuery(source: string): boolean {
  // Match useQuery({ queryKey: ['user-profile' ... but NOT inside authQueries or useProfileQuery
  return /useQuery\s*\(\s*\{[^}]*queryKey\s*:\s*\[['"]user-profile['"]/.test(source)
}

/**
 * Returns true when the source directly calls an API endpoint for profile
 * data outside the canonical service boundary (authService / authQueries).
 */
function hasDirectProfileFetch(source: string): boolean {
  // Direct fetch/request to /auth/profile/ or /auth/session/
  return /(?:fetch|request)\s*\(\s*['"][^'"]*\/auth\/profile\/['"]/.test(source)
}

// ---------------------------------------------------------------------------
// Screen file paths
// ---------------------------------------------------------------------------

const SCREENS = {
  dashboard: 'pages/student/Dashboard.tsx',
  settings: 'pages/student/Settings.tsx',
  wizardController: 'pages/student/applicationWizard/hooks/useWizardController.ts',
  header: 'components/navigation/Header.tsx',
  userMenu: 'components/ui/UserMenu.tsx',
  desktopSidebar: 'components/navigation/DesktopSidebar.tsx',
  appLayout: 'components/navigation/AppLayout.tsx',
  profileAutoPopulation: 'hooks/useProfileAutoPopulation.ts',
} as const

// ===========================================================================
// Tests
// ===========================================================================

describe('Dependent screens use canonical profile/session access', () => {
  // -----------------------------------------------------------------------
  // 1. Student Dashboard
  // -----------------------------------------------------------------------
  describe('Student Dashboard', () => {
    const source = readSource(SCREENS.dashboard)

    it('imports useAuth from AuthContext', () => {
      expect(importsUseAuth(source)).toBe(true)
    })

    it('imports useProfileQuery from canonical hook', () => {
      expect(importsUseProfileQuery(source)).toBe(true)
    })

    it('calls useAuth()', () => {
      expect(callsUseAuth(source)).toBe(true)
    })

    it('calls useProfileQuery()', () => {
      expect(callsUseProfileQuery(source)).toBe(true)
    })

    it('does not have a divergent profile useQuery', () => {
      expect(hasDivergentProfileQuery(source)).toBe(false)
    })

    it('does not directly fetch /auth/profile/', () => {
      expect(hasDirectProfileFetch(source)).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // 2. Settings Page
  // -----------------------------------------------------------------------
  describe('Settings Page', () => {
    const source = readSource(SCREENS.settings)

    it('imports useAuth from AuthContext', () => {
      expect(importsUseAuth(source)).toBe(true)
    })

    it('imports useProfileQuery from canonical hook', () => {
      expect(importsUseProfileQuery(source)).toBe(true)
    })

    it('calls useAuth()', () => {
      expect(callsUseAuth(source)).toBe(true)
    })

    it('calls useProfileQuery()', () => {
      expect(callsUseProfileQuery(source)).toBe(true)
    })

    it('does not have a divergent profile useQuery', () => {
      expect(hasDivergentProfileQuery(source)).toBe(false)
    })

    it('does not directly fetch /auth/profile/', () => {
      expect(hasDirectProfileFetch(source)).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // 3. Application Wizard (useWizardController)
  // -----------------------------------------------------------------------
  describe('Application Wizard (useWizardController)', () => {
    const source = readSource(SCREENS.wizardController)

    it('imports useAuth from AuthContext', () => {
      expect(importsUseAuth(source)).toBe(true)
    })

    it('imports useProfileQuery from canonical hook', () => {
      expect(importsUseProfileQuery(source)).toBe(true)
    })

    it('calls useAuth()', () => {
      expect(callsUseAuth(source)).toBe(true)
    })

    it('calls useProfileQuery()', () => {
      expect(callsUseProfileQuery(source)).toBe(true)
    })

    it('does not have a divergent profile useQuery', () => {
      expect(hasDivergentProfileQuery(source)).toBe(false)
    })

    it('does not directly fetch /auth/profile/', () => {
      expect(hasDirectProfileFetch(source)).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // 3b. useProfileAutoPopulation (used by wizard and settings)
  // -----------------------------------------------------------------------
  describe('useProfileAutoPopulation', () => {
    const source = readSource(SCREENS.profileAutoPopulation)

    it('imports useAuth from AuthContext', () => {
      expect(importsUseAuth(source)).toBe(true)
    })

    it('imports useProfileQuery from canonical hook', () => {
      expect(importsUseProfileQuery(source)).toBe(true)
    })

    it('does not have a divergent profile useQuery', () => {
      expect(hasDivergentProfileQuery(source)).toBe(false)
    })

    it('does not directly fetch /auth/profile/', () => {
      expect(hasDirectProfileFetch(source)).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // 4. Header
  // -----------------------------------------------------------------------
  describe('Header', () => {
    const source = readSource(SCREENS.header)

    it('imports useAuth from AuthContext', () => {
      expect(importsUseAuth(source)).toBe(true)
    })

    it('imports useProfileQuery from canonical hook', () => {
      expect(importsUseProfileQuery(source)).toBe(true)
    })

    it('calls useAuth()', () => {
      expect(callsUseAuth(source)).toBe(true)
    })

    it('calls useProfileQuery()', () => {
      expect(callsUseProfileQuery(source)).toBe(true)
    })

    it('does not have a divergent profile useQuery', () => {
      expect(hasDivergentProfileQuery(source)).toBe(false)
    })

    it('does not directly fetch /auth/profile/', () => {
      expect(hasDirectProfileFetch(source)).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // 4b. UserMenu
  // -----------------------------------------------------------------------
  describe('UserMenu', () => {
    const source = readSource(SCREENS.userMenu)

    it('imports useAuth from AuthContext', () => {
      expect(importsUseAuth(source)).toBe(true)
    })

    it('imports useProfileQuery from canonical hook', () => {
      expect(importsUseProfileQuery(source)).toBe(true)
    })

    it('calls useAuth()', () => {
      expect(callsUseAuth(source)).toBe(true)
    })

    it('calls useProfileQuery()', () => {
      expect(callsUseProfileQuery(source)).toBe(true)
    })

    it('does not have a divergent profile useQuery', () => {
      expect(hasDivergentProfileQuery(source)).toBe(false)
    })

    it('does not directly fetch /auth/profile/', () => {
      expect(hasDirectProfileFetch(source)).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // 4c. DesktopSidebar
  // -----------------------------------------------------------------------
  describe('DesktopSidebar', () => {
    const source = readSource(SCREENS.desktopSidebar)

    it('imports useAuth from AuthContext', () => {
      expect(importsUseAuth(source)).toBe(true)
    })

    it('calls useAuth()', () => {
      expect(callsUseAuth(source)).toBe(true)
    })

    it('does not have a divergent profile useQuery', () => {
      expect(hasDivergentProfileQuery(source)).toBe(false)
    })

    it('does not directly fetch /auth/profile/', () => {
      expect(hasDirectProfileFetch(source)).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // 4d. AppLayout
  // -----------------------------------------------------------------------
  describe('AppLayout', () => {
    const source = readSource(SCREENS.appLayout)

    it('imports useAuth from AuthContext', () => {
      expect(importsUseAuth(source)).toBe(true)
    })

    it('calls useAuth()', () => {
      expect(callsUseAuth(source)).toBe(true)
    })

    it('does not have a divergent profile useQuery', () => {
      expect(hasDivergentProfileQuery(source)).toBe(false)
    })

    it('does not directly fetch /auth/profile/', () => {
      expect(hasDirectProfileFetch(source)).toBe(false)
    })
  })
})

// ===========================================================================
// Guard: No screen outside the auth boundary owns a raw profile query key
// ===========================================================================

describe('No dependent screen owns a raw profile query key literal', () => {
  const screenFiles = Object.values(SCREENS)

  for (const relativePath of screenFiles) {
    it(`${relativePath} does not contain a hardcoded ['user-profile', ...] query key`, () => {
      const source = readSource(relativePath)
      // Allow imports of profileQueryKey, but disallow raw literals
      const rawKeyPattern = /\[\s*['"]user-profile['"]\s*,/
      const lines = source.split('\n')
      const offendingLines = lines
        .map((line, i) => ({ line: line.trim(), num: i + 1 }))
        .filter(({ line }) => rawKeyPattern.test(line))
        // Exclude import statements and type annotations
        .filter(({ line }) => !line.startsWith('import') && !line.startsWith('//') && !line.startsWith('*'))

      expect(offendingLines).toEqual([])
    })
  }
})
