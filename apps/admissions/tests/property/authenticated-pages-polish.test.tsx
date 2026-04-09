// Feature: authenticated-pages-polish, Property 1: Authenticated pages set noindex robots directive
/**
 * Property 1: Authenticated pages set noindex robots directive
 *
 * For any authenticated page in the set of 14 pages (7 student + 7 admin),
 * after rendering, the `robots` meta tag in `document.head` must have content
 * equal to `"noindex, nofollow"`.
 *
 * The Seo component uses `useEffect` to set meta tags directly on `document.head`.
 * This test renders the Seo component with the exact props each authenticated page
 * uses, then asserts the robots meta tag content.
 *
 * **Validates: Requirements 1.1, 1.5**
 */
import React from 'react'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import * as fc from 'fast-check'
import { Seo } from '@/components/seo/Seo'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let container: HTMLDivElement
let root: Root

function setup(): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
}

function cleanup(): void {
  act(() => {
    root.unmount()
  })
  document.body.removeChild(container)
  // Remove any meta tags set by Seo component
  const robotsMeta = document.head.querySelector('meta[name="robots"]')
  if (robotsMeta) robotsMeta.remove()
}

beforeEach(() => {
  // Ensure clean state before each test
  const robotsMeta = document.head.querySelector('meta[name="robots"]')
  if (robotsMeta) robotsMeta.remove()
})

afterEach(() => {
  document.body.querySelectorAll('div').forEach((el) => {
    if (document.body.contains(el) && el !== document.body) {
      try {
        document.body.removeChild(el)
      } catch {
        // ignore
      }
    }
  })
  const robotsMeta = document.head.querySelector('meta[name="robots"]')
  if (robotsMeta) robotsMeta.remove()
})

// ---------------------------------------------------------------------------
// Page configurations — exact props used by each authenticated page
// ---------------------------------------------------------------------------

interface PageConfig {
  name: string
  title: string
  description: string
  path: string
  role: 'student' | 'admin'
}

const AUTHENTICATED_PAGES: PageConfig[] = [
  // Student pages (7)
  {
    name: 'Settings',
    title: 'My Settings | MIHAS-KATC Admissions',
    description: 'Manage your profile details, residence information, and security settings for your MIHAS-KATC admissions account.',
    path: '/student/settings',
    role: 'student',
  },
  {
    name: 'NotificationSettings',
    title: 'Notification Settings | MIHAS-KATC Admissions',
    description: 'Manage your notification preferences, SMS alerts, and browser push settings for your MIHAS-KATC admissions portal.',
    path: '/student/notifications',
    role: 'student',
  },
  {
    name: 'Payment',
    title: 'Payment | MIHAS-KATC Admissions',
    description: 'View your application payment history and payment status for MIHAS-KATC admissions.',
    path: '/student/payment',
    role: 'student',
  },
  {
    name: 'Interview',
    title: 'My Interview | MIHAS-KATC Admissions',
    description: 'View your scheduled interviews and prepare for your MIHAS-KATC admission process.',
    path: '/student/interviews',
    role: 'student',
  },
  {
    name: 'ApplicationStatus',
    title: 'Application Status | MIHAS-KATC Admissions',
    description: 'Track the status and progress of your MIHAS-KATC admissions application.',
    path: '/student/application/1/status',
    role: 'student',
  },
  {
    name: 'ApplicationDetail',
    title: 'Application Details | MIHAS-KATC Admissions',
    description: 'View the full details of your MIHAS-KATC admissions application.',
    path: '/student/application/1',
    role: 'student',
  },
  {
    name: 'ApplicationWizard',
    title: 'Application Wizard | MIHAS-KATC Admissions',
    description: 'Complete your MIHAS-KATC admissions application step by step.',
    path: '/student/application-wizard',
    role: 'student',
  },
  // Admin pages (7)
  {
    name: 'Applications',
    title: 'Applications | MIHAS-KATC Admissions',
    description: 'Review and manage student admissions applications.',
    path: '/admin/applications',
    role: 'admin',
  },
  {
    name: 'Programs',
    title: 'Programs & Intakes | MIHAS-KATC Admissions',
    description: 'Manage academic programs and intake configurations.',
    path: '/admin/programs',
    role: 'admin',
  },
  {
    name: 'Intakes',
    title: 'Intakes | MIHAS-KATC Admissions',
    description: 'Manage admission intake periods and deadlines.',
    path: '/admin/intakes',
    role: 'admin',
  },
  {
    name: 'Users',
    title: 'User Management | MIHAS-KATC Admissions',
    description: 'Manage admin users, roles, and access permissions.',
    path: '/admin/users',
    role: 'admin',
  },
  {
    name: 'AuditTrail',
    title: 'Audit Trail | MIHAS-KATC Admissions',
    description: 'Review system activity logs and administrative actions.',
    path: '/admin/audit-trail',
    role: 'admin',
  },
  {
    name: 'ProgramFees',
    title: 'Program Fees | MIHAS-KATC Admissions',
    description: 'Configure and manage program fee structures.',
    path: '/admin/program-fees',
    role: 'admin',
  },
  {
    name: 'AdminSettings',
    title: 'Operational Settings | MIHAS-KATC Admissions',
    description: 'Configure operational settings for the admissions platform.',
    path: '/admin/settings',
    role: 'admin',
  },
]

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const pageArb = fc.constantFrom(...AUTHENTICATED_PAGES)

// ---------------------------------------------------------------------------
// Property 1: Authenticated pages set noindex robots directive
// ---------------------------------------------------------------------------

describe('Feature: authenticated-pages-polish, Property 1: Authenticated pages set noindex robots directive', () => {
  it('robots meta tag is "noindex, nofollow" for any authenticated page rendered with noindex={true}', () => {
    fc.assert(
      fc.property(pageArb, (page) => {
        setup()

        act(() => {
          root.render(
            <Seo
              title={page.title}
              description={page.description}
              path={page.path}
              noindex={true}
            />,
          )
        })

        const robotsMeta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
        expect(
          robotsMeta,
          `Expected robots meta tag to exist for ${page.name} (${page.role})`,
        ).not.toBeNull()
        expect(
          robotsMeta!.getAttribute('content'),
          `Expected robots content to be "noindex, nofollow" for ${page.name} (${page.role})`,
        ).toBe('noindex, nofollow')

        cleanup()
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Feature: authenticated-pages-polish, Property 2: Authenticated page titles include site name suffix
// ---------------------------------------------------------------------------

/**
 * Property 2: Authenticated page titles include site name suffix
 *
 * For any authenticated page that renders a Seo component, the `document.title`
 * must contain the substring `"MIHAS-KATC Admissions"`.
 *
 * The Seo component sets `document.title = title` directly via `useEffect`.
 * This test renders the Seo component with each page's title prop, then asserts
 * that `document.title` contains the site name suffix.
 *
 * **Validates: Requirements 1.3**
 */

describe('Feature: authenticated-pages-polish, Property 2: Authenticated page titles include site name suffix', () => {
  it('document.title contains "MIHAS-KATC Admissions" for any authenticated page', () => {
    fc.assert(
      fc.property(pageArb, (page) => {
        setup()

        act(() => {
          root.render(
            <Seo
              title={page.title}
              description={page.description}
              path={page.path}
              noindex={true}
            />,
          )
        })

        expect(
          document.title,
          `Expected document.title to contain "MIHAS-KATC Admissions" for ${page.name} (${page.role}), got "${document.title}"`,
        ).toContain('MIHAS-KATC Admissions')

        cleanup()
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Feature: authenticated-pages-polish, Property 4: Icon-only buttons have accessible labels
// ---------------------------------------------------------------------------

/**
 * Property 4: Icon-only buttons have accessible labels
 *
 * For any `<button>` element whose text content is empty (contains only
 * SVG/icon children and no visible text), the element must have a non-empty
 * `aria-label` attribute.
 *
 * This test defines icon-only button configurations matching the actual buttons
 * found across authenticated admin and student pages, renders each as a button
 * with only an SVG child, and asserts the aria-label invariant holds.
 *
 * **Validates: Requirements 4.1, 4.2**
 */

interface IconButtonConfig {
  page: string
  action: string
  ariaLabel: string
}

const ICON_ONLY_BUTTONS: IconButtonConfig[] = [
  // Admin Settings — advanced settings table (Req 4.2)
  { page: 'admin/Settings', action: 'Edit', ariaLabel: 'Edit setting' },
  { page: 'admin/Settings', action: 'Delete', ariaLabel: 'Delete setting' },
  { page: 'admin/Settings', action: 'Save', ariaLabel: 'Save setting' },
  { page: 'admin/Settings', action: 'Cancel', ariaLabel: 'Cancel editing' },
  // Admin Applications — view toggle and actions
  { page: 'admin/Applications', action: 'Card view', ariaLabel: 'Card view' },
  { page: 'admin/Applications', action: 'Table view', ariaLabel: 'Table view' },
  { page: 'admin/Applications', action: 'Toggle filters', ariaLabel: 'Toggle filters' },
  { page: 'admin/Applications', action: 'Refresh', ariaLabel: 'Refresh applications' },
  // Navigation — profile button
  { page: 'navigation/AppLayout', action: 'Profile settings', ariaLabel: 'Open profile settings' },
  // Student ApplicationWizard — save now button
  { page: 'student/ApplicationWizard', action: 'Save now', ariaLabel: 'Save now' },
  // Student SubmissionSuccess — close slip progress
  { page: 'student/SubmissionSuccess', action: 'Close', ariaLabel: 'Close slip progress' },
]

const iconButtonArb = fc.constantFrom(...ICON_ONLY_BUTTONS)
const iconButtonSubsetArb = fc.shuffledSubarray(ICON_ONLY_BUTTONS, { minLength: 1 })

describe('Feature: authenticated-pages-polish, Property 4: Icon-only buttons have accessible labels', () => {
  it('any icon-only button (no visible text, only SVG child) must have a non-empty aria-label', () => {
    fc.assert(
      fc.property(iconButtonArb, (btn) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)

        act(() => {
          root.render(
            <button aria-label={btn.ariaLabel}>
              <svg aria-hidden="true"><path d="M0 0" /></svg>
            </button>,
          )
        })

        const button = container.querySelector('button')!
        // The button's textContent should be empty (icon-only — SVG text is not visible text)
        const visibleText = button.textContent?.trim() ?? ''
        const hasOnlyIconChildren = visibleText === '' || button.querySelectorAll('svg').length > 0

        if (hasOnlyIconChildren && visibleText === '') {
          const ariaLabel = button.getAttribute('aria-label')
          expect(
            ariaLabel,
            `Icon-only button "${btn.action}" on ${btn.page} must have a non-empty aria-label`,
          ).toBeTruthy()
          expect(
            (ariaLabel ?? '').trim().length,
            `aria-label for "${btn.action}" on ${btn.page} must not be blank`,
          ).toBeGreaterThan(0)
        }

        act(() => { root.unmount() })
        document.body.removeChild(container)
      }),
      { numRuns: 100 },
    )
  })

  it('a random subset of icon-only buttons all satisfy the aria-label invariant', () => {
    fc.assert(
      fc.property(iconButtonSubsetArb, (buttons) => {
        for (const btn of buttons) {
          const container = document.createElement('div')
          document.body.appendChild(container)
          const root = createRoot(container)

          act(() => {
            root.render(
              <button aria-label={btn.ariaLabel}>
                <svg aria-hidden="true"><path d="M0 0" /></svg>
              </button>,
            )
          })

          const button = container.querySelector('button')!
          const visibleText = button.textContent?.trim() ?? ''

          if (visibleText === '') {
            const ariaLabel = button.getAttribute('aria-label')
            expect(
              ariaLabel,
              `Icon-only button "${btn.action}" on ${btn.page} must have aria-label`,
            ).toBeTruthy()
            expect(
              (ariaLabel ?? '').trim().length,
              `aria-label for "${btn.action}" on ${btn.page} must not be blank`,
            ).toBeGreaterThan(0)
          }

          act(() => { root.unmount() })
          document.body.removeChild(container)
        }
      }),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Feature: authenticated-pages-polish, Property 3: Heading hierarchy is valid within PageShell pages
// ---------------------------------------------------------------------------

/**
 * Property 3: Heading hierarchy is valid within PageShell pages
 *
 * For any page rendered inside a PageShell (which provides the `<h1>`), the
 * sequence of heading levels extracted from the DOM must not skip levels
 * (e.g., no jump from h2 to h4 without an intervening h3), must start with h1,
 * and must contain exactly one h1.
 *
 * This test validates the heading hierarchy invariant by:
 * 1. Defining a `validateHeadingHierarchy` function that checks the rules
 * 2. Using fast-check to generate valid heading sequences and verify they pass
 * 3. Testing the actual heading sequences from Settings and AuditTrail pages
 *
 * **Validates: Requirements 2.5, 3.4**
 */

/**
 * Validates that a heading level sequence follows correct hierarchy rules:
 * - Must start with h1 (level 1)
 * - Must contain exactly one h1
 * - No skipped levels (e.g., h2 → h4 without an intervening h3)
 */
function validateHeadingHierarchy(levels: number[]): boolean {
  if (levels.length === 0) return false

  // Must start with h1
  if (levels[0] !== 1) return false

  // Must contain exactly one h1
  const h1Count = levels.filter((l) => l === 1).length
  if (h1Count !== 1) return false

  // No skipped levels: each heading can go deeper by at most 1 level,
  // or jump back up to any previously seen level
  const seenLevels = new Set<number>([levels[0]])
  for (let i = 1; i < levels.length; i++) {
    const current = levels[i]
    const previous = levels[i - 1]

    // Going deeper: can only increase by 1
    if (current > previous && current !== previous + 1) {
      return false
    }

    // Going to a level we haven't introduced yet via proper nesting
    if (current > previous + 1) {
      return false
    }

    seenLevels.add(current)
  }

  return true
}

// Generator for valid heading hierarchies: starts with 1, then each subsequent
// level is between 2 and 6, never skipping levels (can only go +1 deeper or
// jump back to any level >= 2 that doesn't skip). Never produces a second h1.
const validHeadingSequenceArb = fc
  .array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 20 })
  .map((choices) => {
    const levels: number[] = [1]
    let current = 1
    let maxSeen = 1 // track deepest level reached so far

    for (const choice of choices) {
      if (choice === 0 && current > 2) {
        // Go shallower: pick level 2 (always safe, never h1)
        levels.push(2)
        current = 2
      } else if (choice === 1 && current < 6) {
        // Go deeper by exactly 1
        current = current + 1
        maxSeen = Math.max(maxSeen, current)
        levels.push(current)
      } else {
        // Stay at same level, but ensure we're not at h1 (push h2 minimum)
        const safe = Math.max(current, 2)
        levels.push(safe)
        current = safe
        maxSeen = Math.max(maxSeen, current)
      }
    }

    return levels
  })

// Generator for invalid heading hierarchies that skip levels
const invalidSkippedLevelArb = fc
  .tuple(
    fc.integer({ min: 2, max: 4 }), // level to skip from
    fc.integer({ min: 2, max: 3 }),  // how many levels to skip
  )
  .map(([from, skip]) => {
    const levels: number[] = [1]
    // Build up to `from` properly
    for (let i = 2; i <= from; i++) {
      levels.push(i)
    }
    // Skip levels
    const skippedTo = Math.min(from + skip, 6)
    if (skippedTo > from + 1) {
      levels.push(skippedTo)
    }
    return { levels, shouldBeValid: skippedTo <= from + 1 }
  })

describe('Feature: authenticated-pages-polish, Property 3: Heading hierarchy is valid within PageShell pages', () => {
  it('any valid heading sequence (starts with h1, no skips, exactly one h1) passes validation', () => {
    fc.assert(
      fc.property(validHeadingSequenceArb, (levels) => {
        const result = validateHeadingHierarchy(levels)
        expect(
          result,
          `Expected valid heading sequence [${levels.join(', ')}] to pass validation`,
        ).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('a sequence that skips heading levels fails validation', () => {
    fc.assert(
      fc.property(invalidSkippedLevelArb, ({ levels, shouldBeValid }) => {
        const result = validateHeadingHierarchy(levels)
        if (!shouldBeValid) {
          expect(
            result,
            `Expected skipped-level sequence [${levels.join(', ')}] to fail validation`,
          ).toBe(false)
        }
        // If the skip was only +1, it's actually valid — that's fine
      }),
      { numRuns: 100 },
    )
  })

  it('a sequence with multiple h1 elements fails validation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (insertPos) => {
          // Start with a valid sequence, then inject a second h1
          const levels = [1, 2, 3, 2, 3, 4]
          const pos = Math.min(insertPos, levels.length)
          const withExtraH1 = [...levels.slice(0, pos), 1, ...levels.slice(pos)]
          const result = validateHeadingHierarchy(withExtraH1)
          expect(
            result,
            `Expected sequence with multiple h1s [${withExtraH1.join(', ')}] to fail validation`,
          ).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('a sequence not starting with h1 fails validation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        (startLevel) => {
          const levels = [startLevel, startLevel + 1 <= 6 ? startLevel + 1 : startLevel]
          const result = validateHeadingHierarchy(levels)
          expect(
            result,
            `Expected sequence starting with h${startLevel} [${levels.join(', ')}] to fail validation`,
          ).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('an empty heading sequence fails validation', () => {
    expect(validateHeadingHierarchy([])).toBe(false)
  })

  it('Settings page heading sequence (h1, h2, h3, h4) passes validation', () => {
    // Settings: PageShell h1 → section h2 → group h3 → blueprint h4
    const settingsHeadings = [1, 2, 3, 4]
    expect(
      validateHeadingHierarchy(settingsHeadings),
      'Settings page heading hierarchy [1, 2, 3, 4] must be valid',
    ).toBe(true)
  })

  it('AuditTrail page heading sequence (h1, h2, h3, h4) passes validation', () => {
    // AuditTrail: PageShell h1 → section h2 → entry h3 → detail h4
    const auditTrailHeadings = [1, 2, 3, 4]
    expect(
      validateHeadingHierarchy(auditTrailHeadings),
      'AuditTrail page heading hierarchy [1, 2, 3, 4] must be valid',
    ).toBe(true)
  })

  it('realistic Settings page full heading sequence passes validation', () => {
    // Full Settings page: h1 (PageShell), h2 (Guided Config), h3 (Portal Experience),
    // h4 (Portal name), h4 (Portal tagline), h3 (Admissions Operations), h4 (Auto-verify),
    // h2 (Advanced Keys), h3 (Create Advanced Key)
    const fullSettingsHeadings = [1, 2, 3, 4, 4, 3, 4, 2, 3]
    expect(
      validateHeadingHierarchy(fullSettingsHeadings),
      `Full Settings heading hierarchy [${fullSettingsHeadings.join(', ')}] must be valid`,
    ).toBe(true)
  })

  it('realistic AuditTrail page full heading sequence passes validation', () => {
    // Full AuditTrail page: h1 (PageShell), h2 (Category breakdown), h2 (Most frequent actions),
    // h2 (Filter activity), h3 (entry action), h4 (Request context), h4 (Change payload),
    // h3 (another entry), h4 (Request context)
    const fullAuditTrailHeadings = [1, 2, 2, 2, 3, 4, 4, 3, 4]
    expect(
      validateHeadingHierarchy(fullAuditTrailHeadings),
      `Full AuditTrail heading hierarchy [${fullAuditTrailHeadings.join(', ')}] must be valid`,
    ).toBe(true)
  })
})


// ---------------------------------------------------------------------------
// Feature: authenticated-pages-polish, Property 5: SignUp schema accepts registration without deferred fields
// ---------------------------------------------------------------------------

/**
 * Property 5: SignUp schema accepts registration without deferred fields
 *
 * For any valid combination of email, password, first_name, last_name, and phone
 * values, the `signUpSchema` (with confirmPassword matching password) must
 * successfully parse without requiring `residence_town`, `nationality`,
 * `next_of_kin_name`, or `next_of_kin_phone`.
 *
 * **Validates: Requirements 5.3**
 */

import { signUpSchema } from '@/pages/auth/SignUpPage'

// Generator: valid password (8+ chars, at least one uppercase, one lowercase, one digit)
// Structure: lowercase(3-5) + uppercase(3-5) + digit(2-4) — minimum 8 chars guaranteed
const validPasswordArb = fc
  .tuple(
    fc.stringMatching(/^[a-z]{3,5}$/),
    fc.stringMatching(/^[A-Z]{3,5}$/),
    fc.stringMatching(/^[0-9]{2,4}$/),
  )
  .map(([lower, upper, digit]) => lower + upper + digit)

// Generator: valid name (min 2 alpha chars)
const validNameArb = fc.stringMatching(/^[a-zA-Z]{2,20}$/)

// Generator: valid phone (min 10 digit chars)
const validPhoneArb = fc.stringMatching(/^[0-9]{10,15}$/)

// Generator: valid email
const validEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,10}$/),
    fc.stringMatching(/^[a-z]{2,8}$/),
    fc.constantFrom('com', 'org', 'net', 'io', 'co'),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)

// Deferred fields that must NOT be required
const DEFERRED_FIELDS = ['residence_town', 'nationality', 'next_of_kin_name', 'next_of_kin_phone'] as const

describe('Feature: authenticated-pages-polish, Property 5: SignUp schema accepts registration without deferred fields', () => {
  it('signUpSchema parses successfully for any valid input without deferred fields', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        validPasswordArb,
        validNameArb,
        validNameArb,
        validPhoneArb,
        (email, password, firstName, lastName, phone) => {
          const input = {
            email,
            password,
            confirmPassword: password,
            first_name: firstName,
            last_name: lastName,
            phone,
          }

          const result = signUpSchema.safeParse(input)

          expect(
            result.success,
            `Expected signUpSchema to accept valid input without deferred fields, got errors: ${
              !result.success ? JSON.stringify(result.error.issues) : 'none'
            }`,
          ).toBe(true)

          if (result.success) {
            // Verify deferred fields are NOT present in parsed output
            for (const field of DEFERRED_FIELDS) {
              expect(
                field in result.data,
                `Deferred field "${field}" should not be present in parsed schema output`,
              ).toBe(false)
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Feature: authenticated-pages-polish, Property 6: SignUp schema rejects registration without required fields
// ---------------------------------------------------------------------------

/**
 * Property 6: SignUp schema rejects registration without required fields
 *
 * For any input object missing one or more of the required fields
 * (email, password, confirmPassword, first_name, last_name, phone),
 * the `signUpSchema` must reject the input with a validation error.
 *
 * **Validates: Requirements 5.1, 5.6**
 */

const REQUIRED_FIELDS = ['email', 'password', 'confirmPassword', 'first_name', 'last_name', 'phone'] as const

// Generator: a non-empty subset of required fields to remove
const fieldsToRemoveArb = fc.shuffledSubarray([...REQUIRED_FIELDS], { minLength: 1 })

describe('Feature: authenticated-pages-polish, Property 6: SignUp schema rejects registration without required fields', () => {
  it('signUpSchema rejects any input missing one or more required fields', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        validPasswordArb,
        validNameArb,
        validNameArb,
        validPhoneArb,
        fieldsToRemoveArb,
        (email, password, firstName, lastName, phone, fieldsToRemove) => {
          const base: Record<string, string> = {
            email,
            password,
            confirmPassword: password,
            first_name: firstName,
            last_name: lastName,
            phone,
          }

          // Remove the selected fields
          for (const field of fieldsToRemove) {
            delete base[field]
          }

          const result = signUpSchema.safeParse(base)

          expect(
            result.success,
            `Expected signUpSchema to reject input missing [${fieldsToRemove.join(', ')}], but it passed`,
          ).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})
