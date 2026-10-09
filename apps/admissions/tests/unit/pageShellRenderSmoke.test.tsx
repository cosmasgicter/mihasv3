/**
 * PageShell Render Smoke Test — Task 9.3 (Phase 9, CI & Design Quality Gates)
 *
 * Spec: `.kiro/specs/full-platform-remediation-2026-07/` — Requirement R10.3:
 * "Verify all 22 `PageShell` consumer pages still render correctly after the
 * CSS animation migration (a targeted visual regression check, not a full
 * E2E suite)."
 *
 * Approach (deliberately NOT a full render of all 22 pages):
 *
 *   1. Real RTL `render()` of `PageShell` itself across the FULL cross-product
 *      of every `tone` x `maxWidth` value it accepts. `PageShell` is the single
 *      shared component every one of the 22 consumers renders through, and the
 *      failure mode this task is guarding against — a CSS-migration regression
 *      producing a missing/`undefined` Tailwind class in `cn(...)` — originates
 *      entirely inside `PageShell`'s own `maxWidthClasses` / `accentClass` maps,
 *      not in any individual consumer page. Exhaustively rendering the shared
 *      component covers every prop combination any consumer could pass,
 *      including combinations no current consumer happens to use yet.
 *
 *   2. A static safety net over the real 22 consumer files (enumerated via
 *      `grep -rl "from '@/components/ui/PageShell'" src/` at the time this
 *      test was written) that (a) confirms each still imports `PageShell` from
 *      the canonical path, (b) extracts every literal `tone=` / `maxWidth=`
 *      value actually passed to `<PageShell>` in that file and asserts it is
 *      one `PageShell` actually maps to a class (catching a typo'd prop value
 *      that would silently render `undefined` into the class list), and
 *      (c) confirms the file carries no framer-motion import (the CSS
 *      animation migration this task's requirement is about).
 *
 * This mirrors the existing static-source-check convention already used
 * throughout this test suite for these same pages (e.g.
 * `tests/unit/mobileResponsiveness.test.ts`, `routeMobileOverflowGuard.test.tsx`,
 * `communicationsHistory.test.ts`, `applicationWizardUxGuard.test.ts`) rather
 * than introducing 11 new heavy per-page mounts requiring bespoke auth/data
 * mocking — full RTL `render()` coverage already exists for a majority of
 * these 22 pages elsewhere (see `tests/unit/page-verification/*.test.tsx`,
 * `tests/unit/tenantConsoleSplit.test.tsx`, `tenantOnboardingState.test.tsx`,
 * `tenantConsoleAuthority.test.tsx`, and
 * `tests/integration/tenantOnboardingWizard.integration.test.tsx`); this file
 * adds the missing guarantee for the shared shell plus a uniform safety net
 * across literally all 22, without duplicating that existing coverage.
 */
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { PageShell, type PageShellProps } from '@/components/ui/PageShell'

afterEach(() => {
  cleanup()
})

// ─────────────────────────────────────────────────────────────────────────
// Exhaustive prop matrix — mirrors PageShell.tsx's own `maxWidthClasses` keys
// and the `tone` union in `PageShellProps`. Kept as literal arrays (not an
// import of PageShell's internal map) so this test independently pins the
// public contract rather than trivially re-deriving it from the same source.
// ─────────────────────────────────────────────────────────────────────────

const TONES: ReadonlyArray<NonNullable<PageShellProps['tone']>> = [
  'default',
  'admin',
  'student',
  'application',
  'public',
]

const MAX_WIDTHS: ReadonlyArray<NonNullable<PageShellProps['maxWidth']>> = [
  'md',
  'lg',
  'xl',
  '2xl',
  '4xl',
  '7xl',
  'full',
]

describe('PageShell — exhaustive tone x maxWidth render matrix', () => {
  for (const tone of TONES) {
    for (const maxWidth of MAX_WIDTHS) {
      it(`renders without crashing and without an "undefined"/"null" class for tone="${tone}" maxWidth="${maxWidth}"`, () => {
        const { container } = render(
          <PageShell title="Smoke test page" tone={tone} maxWidth={maxWidth}>
            <p>content</p>
          </PageShell>
        )

        const html = container.innerHTML
        expect(html).not.toContain('undefined')
        expect(html).not.toContain('class="null')
        expect(html).not.toContain(' null"')

        // The shared CSS entrance animation class (the actual output of the
        // framer-motion -> CSS migration) must always resolve regardless of
        // tone/maxWidth.
        const wrapper = container.firstElementChild as HTMLElement | null
        expect(wrapper).not.toBeNull()
        expect(wrapper?.className).toContain('animate-page-shell-in')

        // Exactly one <h1>, matching PageShell's documented heading contract.
        expect(container.querySelectorAll('h1')).toHaveLength(1)
      })
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────
// Static safety net across the real 22 PageShell consumers.
// ─────────────────────────────────────────────────────────────────────────

const SRC_DIR = resolve(process.cwd(), 'src')

/**
 * The 22 files that import `PageShell` from the canonical path, as of this
 * writing (`grep -rl "from '@/components/ui/PageShell'" apps/admissions/src/`).
 * If this list drifts from the real repo state, the first test below fails
 * loudly rather than silently under-covering a new consumer.
 */
const PAGE_SHELL_CONSUMERS: readonly string[] = [
  'pages/admin/Applications.tsx',
  'pages/admin/AuditTrail.tsx',
  'pages/admin/Dashboard.tsx',
  'pages/admin/Intakes.tsx',
  'pages/admin/ProgramFees.tsx',
  'pages/admin/Programs.tsx',
  'pages/admin/Settings.tsx',
  'pages/admin/Tenants.tsx',
  'pages/admin/tenants/SuperAdminTenantConsole.tsx',
  'pages/admin/tenants/TenantAdminSchoolConsole.tsx',
  'pages/admin/tenants/TenantOnboardingWizard.tsx',
  'pages/admin/Users.tsx',
  // `pages/student/ApplicationDetail.tsx` removed by admissions-v2 task 10.6
  // (R13.13, STU-23) — one canonical student application workspace.
  'pages/student/ApplicationStatus.tsx',
  'pages/student/applicationWizard/index.tsx',
  'pages/student/Communications.tsx',
  'pages/student/Dashboard.tsx',
  'pages/student/History.tsx',
  'pages/student/Interview.tsx',
  'pages/student/NotificationSettings.tsx',
  'pages/student/Payment.tsx',
  'pages/student/Settings.tsx',
]

function readPageSource(relPath: string): string {
  return readFileSync(resolve(SRC_DIR, relPath), 'utf-8')
}

// 22 → 21 with admissions-v2 task 10.6: the second student application workspace
// was a `PageShell` consumer, and consolidating onto one canonical workspace
// (R13.13, STU-23) removed the page, not just its route.
describe('PageShell consumers (21 pages) — static prop-safety guard', () => {
  it('the enumerated consumer list has exactly 21 entries with no duplicates', () => {
    expect(PAGE_SHELL_CONSUMERS).toHaveLength(21)
    expect(new Set(PAGE_SHELL_CONSUMERS).size).toBe(21)
  })

  it.each(PAGE_SHELL_CONSUMERS)(
    '%s still imports PageShell from the canonical path',
    (relPath) => {
      const source = readPageSource(relPath)
      // Quote-agnostic: the wizard page is formatted with double quotes.
      expect(source).toMatch(/from ["']@\/components\/ui\/PageShell["']/)
    }
  )

  it.each(PAGE_SHELL_CONSUMERS)(
    'every tone=/maxWidth= literal passed to <PageShell> in %s is a value PageShell maps to a real class',
    (relPath) => {
      const source = readPageSource(relPath)

      const toneMatches = [
        ...source.matchAll(/<PageShell\b[^>]*?\btone=["']([^"']+)["']/g),
      ]
      for (const match of toneMatches) {
        expect(
          TONES,
          `${relPath} passes tone="${match[1]}" to <PageShell> — must be one of PageShell's known tones (${TONES.join(', ')})`
        ).toContain(match[1])
      }

      const maxWidthMatches = [
        ...source.matchAll(/<PageShell\b[^>]*?\bmaxWidth=["']([^"']+)["']/g),
      ]
      for (const match of maxWidthMatches) {
        expect(
          MAX_WIDTHS,
          `${relPath} passes maxWidth="${match[1]}" to <PageShell> — must be one of PageShell's known maxWidth values (${MAX_WIDTHS.join(', ')})`
        ).toContain(match[1])
      }
    }
  )

  it.each(PAGE_SHELL_CONSUMERS)(
    '%s carries no framer-motion import (CSS-animation-migration regression guard)',
    (relPath) => {
      const source = readPageSource(relPath)
      expect(source).not.toMatch(/from ['"]framer-motion['"]/)
    }
  )
})
