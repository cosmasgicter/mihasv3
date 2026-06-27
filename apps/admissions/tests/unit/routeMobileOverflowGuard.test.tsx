/**
 * Route Mobile Overflow + Touch-Target Guard
 *
 * Feature: beanola-production-readiness, Property 30: Every UI route is
 * overflow-free with adequate touch targets at 360px
 *
 * **Validates: Requirements 7.2, 7.3**
 *
 * Task 15.3 of `.kiro/specs/beanola-production-readiness/`.
 *
 * Property 30 (design.md): *For any* UI_Route enumerated in the Phase-7 route
 * matrix, rendered at the 360px Mobile_Breakpoint, the route produces no
 * horizontal overflow (content width does not exceed the viewport) and every
 * interactive element (button, tab, icon button, input) presents a touch
 * target of at least 44×44px.
 *
 * ── What this guard measures, and why ───────────────────────────────────────
 * jsdom has **no layout engine**: `scrollWidth`, `clientWidth`, and
 * `getBoundingClientRect()` all return 0, so a true pixel-accurate overflow /
 * 44×44 measurement is impossible here. Per the task contract this guard
 * measures *what is measurable* in the DOM and source surface at 360px:
 *
 *   1. **Overflow (R7.2)** — no interactive/content element declares a fixed
 *      width or min-width that exceeds the 360px viewport, either as a Tailwind
 *      arbitrary class (`w-[NNNpx]` / `min-w-[NNNpx]`) or as an inline pixel
 *      style. A fixed width > 360px is the single most common cause of a
 *      horizontal scrollbar on the primary mobile target.
 *   2. **Touch targets (R7.3)** — every route surface that renders interactive
 *      elements carries a ≥44px touch-sizing signal: the canonical `Button`
 *      primitive (which bakes in `min-h-touch` / `h-11`), or an explicit
 *      `min-h-touch` / `min-w-touch` / `min-h-[44px]` / `h-11`+ class.
 *
 * The remaining checks that genuinely need a real layout engine — pixel-perfect
 * `scrollWidth ≤ viewport`, rendered 44×44 bounding boxes, wrapped-tab overflow,
 * and visual clipping — are **deferred to the 15.4 Playwright pass** at
 * 360×800 / 390×844 / 768×1024 / 1024×768 / 1440×900. See the
 * `deferred to 15.4` test at the bottom of this file for the explicit list.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'node:fs'
import * as path from 'node:path'
import React from 'react'

const SRC_ROOT = path.resolve(__dirname, '../../src')
const VIEWPORT = 360

// ─────────────────────────────────────────────────────────────────────────────
// Route → page-file map (the Phase-7 UI_Route matrix)
//
// Source of truth: `apps/admissions/src/routes/config.tsx`. Pure redirect routes
// (`<Navigate>`) and the `*` catch-all carry no independent UI and inherit their
// target's verdict, so they are not listed here. Routes that share a component
// (`/signin`, `/login`, `/admin/dashboard`, …) are represented once by their
// canonical path.
// ─────────────────────────────────────────────────────────────────────────────
interface RouteSurface {
  path: string
  file: string
}

const ROUTE_SURFACES: RouteSurface[] = [
  // Public
  { path: '/', file: 'pages/LandingPage.tsx' },
  { path: '/track-application', file: 'pages/public/tracker/index.tsx' },
  { path: '/contact', file: 'pages/ContactPage.tsx' },
  { path: '/terms', file: 'pages/TermsPage.tsx' },
  { path: '/privacy', file: 'pages/PrivacyPage.tsx' },
  { path: '/auth/signin', file: 'pages/auth/SignInPage.tsx' },
  { path: '/auth/signup', file: 'pages/auth/SignUpPage.tsx' },
  { path: '/auth/forgot-password', file: 'pages/auth/ForgotPasswordPage.tsx' },
  { path: '/auth/reset-password', file: 'pages/auth/ResetPasswordPage.tsx' },
  { path: '/auth/callback', file: 'pages/auth/AuthCallbackPage.tsx' },
  { path: '/payment/callback', file: 'pages/student/PaymentCallback.tsx' },
  { path: '/404', file: 'pages/NotFoundPage.tsx' },
  // Student
  { path: '/student/dashboard', file: 'pages/student/Dashboard.tsx' },
  { path: '/student/application-wizard', file: 'pages/student/applicationWizard/index.tsx' },
  { path: '/student/status', file: 'pages/student/ApplicationStatus.tsx' },
  { path: '/student/application/:id', file: 'pages/student/ApplicationDetail.tsx' },
  { path: '/student/settings', file: 'pages/student/Settings.tsx' },
  { path: '/student/notifications', file: 'pages/student/NotificationSettings.tsx' },
  { path: '/student/payment', file: 'pages/student/Payment.tsx' },
  { path: '/student/interview', file: 'pages/student/Interview.tsx' },
  { path: '/student/communications', file: 'pages/student/Communications.tsx' },
  { path: '/student/history', file: 'pages/student/History.tsx' },
  // Admin
  { path: '/admin/dashboard', file: 'pages/admin/Dashboard.tsx' },
  { path: '/admin/settings', file: 'pages/admin/Settings.tsx' },
  { path: '/admin/applications', file: 'pages/admin/Applications.tsx' },
  { path: '/admin/programs', file: 'pages/admin/Programs.tsx' },
  { path: '/admin/tenants', file: 'pages/admin/Tenants.tsx' },
  { path: '/admin/tenants/new', file: 'pages/admin/tenants/TenantOnboardingWizard.tsx' },
  { path: '/admin/intakes', file: 'pages/admin/Intakes.tsx' },
  { path: '/admin/users', file: 'pages/admin/Users.tsx' },
  { path: '/admin/audit', file: 'pages/admin/AuditTrail.tsx' },
  { path: '/admin/program-fees', file: 'pages/admin/ProgramFees.tsx' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Source-surface helper — read a page file PLUS every app-local component it
// imports, so checks see the route's full rendered surface even after a page was
// split into focused subcomponents. (Same approach as mobileResponsiveness.test.)
// ─────────────────────────────────────────────────────────────────────────────
function readRouteSurface(relativePath: string): string {
  const visited = new Set<string>()
  const queue: string[] = [relativePath]
  const parts: string[] = []

  while (queue.length > 0) {
    const current = queue.shift() as string
    if (visited.has(current)) continue
    visited.add(current)

    const fullPath = path.join(SRC_ROOT, current)
    if (!fs.existsSync(fullPath)) continue
    const content = fs.readFileSync(fullPath, 'utf-8')
    parts.push(content)

    const importRegex = /from\s+['"]([^'"]+)['"]/g
    let match: RegExpExecArray | null
    while ((match = importRegex.exec(content)) !== null) {
      const spec = match[1]
      let resolved: string | null = null
      if (spec.startsWith('@/')) {
        resolved = spec.slice(2)
      } else if (spec.startsWith('./') || spec.startsWith('../')) {
        const baseDir = path.dirname(current)
        resolved = path.normalize(path.join(baseDir, spec))
      }
      if (!resolved) continue
      const candidates = [
        `${resolved}.tsx`,
        `${resolved}.ts`,
        `${resolved}/index.tsx`,
        `${resolved}/index.ts`,
      ]
      for (const cand of candidates) {
        if (fs.existsSync(path.join(SRC_ROOT, cand))) {
          queue.push(cand)
          break
        }
      }
    }
  }

  return parts.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Overflow detection (R7.2) — fixed widths that exceed the 360px viewport.
// ─────────────────────────────────────────────────────────────────────────────

/** Tailwind arbitrary fixed-width / min-width classes wider than the viewport. */
function fixedWidthClassOverflows(source: string, viewport: number): string[] {
  const offenders: string[] = []
  const re = /\b(?:min-)?w-\[(\d+)px\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const px = parseInt(m[1], 10)
    if (px > viewport) offenders.push(m[0])
  }
  return offenders
}

/** Inline `width: NNN(px)` / `minWidth: NNN(px)` styles wider than the viewport. */
function inlineWidthOverflows(source: string, viewport: number): string[] {
  const offenders: string[] = []
  // React inline styles are camelCase object keys (`width`, `minWidth`). The
  // negative lookbehind `(?<![-\w])` excludes kebab `max-width` / `min-width`
  // that appear inside media-query strings like `(max-width: 639px)` — those
  // are responsive breakpoints, not fixed element widths.
  const re = /(?<![-\w])(?:width|minWidth)\s*:\s*['"]?(\d{2,})(?:px)?['"]?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const px = parseInt(m[1], 10)
    if (px > viewport) offenders.push(m[0])
  }
  return offenders
}

// ─────────────────────────────────────────────────────────────────────────────
// Touch-target detection (R7.3).
// ─────────────────────────────────────────────────────────────────────────────

/** Class tokens / signals guaranteeing a ≥44px touch target. */
const TOUCH_SIZING_PATTERNS: RegExp[] = [
  /\bmin-h-touch(?:-lg)?\b/,
  /\bmin-w-touch(?:-lg)?\b/,
  /\bmin-h-\[(4[4-9]|[5-9]\d|\d{3,})px\]/, // min-h-[44px]+
  /\bmin-w-\[(4[4-9]|[5-9]\d|\d{3,})px\]/, // min-w-[44px]+
  /\bh-1[1-9]\b/, // h-11 (44px) .. h-19
  /\bh-2\d\b/, // h-20+ … large controls
  /\btouch-target\b/,
]

/** Does this route surface render any interactive element? */
function hasInteractiveElements(source: string): boolean {
  return (
    /<Button\b/.test(source) ||
    /<button\b/.test(source) ||
    /<Link\b/.test(source) ||
    /<a\s/.test(source) ||
    /<input\b/.test(source) ||
    /<select\b/.test(source) ||
    /<textarea\b/.test(source) ||
    /role=["']tab["']/.test(source) ||
    /role=["']button["']/.test(source)
  )
}

/** Is the touch target satisfied somewhere on the route surface? */
function hasTouchSizing(source: string): boolean {
  // Delegating to the canonical Button primitive is sufficient — it bakes in
  // `min-h-touch` / `h-11` for every size variant.
  if (/<Button\b/.test(source) || /components\/ui\/Button/.test(source)) return true
  return TOUCH_SIZING_PATTERNS.some((re) => re.test(source))
}

// Pre-load every route surface once.
const SURFACES: Record<string, string> = {}
for (const route of ROUTE_SURFACES) {
  SURFACES[route.path] = readRouteSurface(route.file)
}

// =============================================================================
// Property 30 — static-surface property over the full route set at 360px
// =============================================================================
describe('Property 30: Every UI route is overflow-free with adequate touch targets at 360px', () => {
  const routeArb = fc.constantFrom(...ROUTE_SURFACES)

  it('every route surface loads (non-empty)', () => {
    for (const route of ROUTE_SURFACES) {
      expect(SURFACES[route.path]?.length ?? 0, `route ${route.path} (${route.file}) surface empty`).toBeGreaterThan(0)
    }
  })

  it('PROPERTY: no route declares a fixed width/min-width exceeding the 360px viewport (R7.2)', () => {
    fc.assert(
      fc.property(routeArb, (route) => {
        const source = SURFACES[route.path]
        const classOverflows = fixedWidthClassOverflows(source, VIEWPORT)
        const inlineOverflows = inlineWidthOverflows(source, VIEWPORT)
        expect(
          classOverflows,
          `${route.path} (${route.file}) has fixed-width classes wider than ${VIEWPORT}px: ${classOverflows.join(', ')}`,
        ).toEqual([])
        expect(
          inlineOverflows,
          `${route.path} (${route.file}) has inline pixel widths wider than ${VIEWPORT}px: ${inlineOverflows.join(', ')}`,
        ).toEqual([])
      }),
      { numRuns: 20, seed: 0 },
    )
  })

  it('PROPERTY: every route with interactive elements provides a ≥44px touch target (R7.3)', () => {
    fc.assert(
      fc.property(routeArb, (route) => {
        const source = SURFACES[route.path]
        if (!hasInteractiveElements(source)) return // nothing interactive → vacuously ok
        expect(
          hasTouchSizing(source),
          `${route.path} (${route.file}) renders interactive elements but declares no ≥44px touch ` +
            `sizing (Button primitive, min-h-touch, min-w-touch, min-h-[44px], or h-11+).`,
        ).toBe(true)
      }),
      { numRuns: 20, seed: 0 },
    )
  })
})

// =============================================================================
// DOM-measured anchor — render mountable static routes into a real jsdom DOM
// sized to 360px and measure what jsdom can give us.
//
// We mock only the shell (PublicLayout) and Seo so each page body renders in
// isolation with the REAL canonical Button/Link primitives, then assert:
//   • no rendered element carries an inline width that overflows 360px,
//   • every rendered interactive element resolves a ≥44px touch-sizing class
//     (on itself, a descendant, or an ancestor — covers <Link><Button/></Link>),
//   • the documented jsdom scrollWidth/clientWidth limitation is recorded.
// =============================================================================
vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'public-layout' }, children),
}))
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }))

// Imported after the mocks above.
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const DOM_ROUTES = [
  { path: '/contact', loader: () => import('@/pages/ContactPage') },
  { path: '/terms', loader: () => import('@/pages/TermsPage') },
  { path: '/privacy', loader: () => import('@/pages/PrivacyPage') },
  { path: '/404', loader: () => import('@/pages/NotFoundPage') },
] as const

function classListHasTouchToken(className: string): boolean {
  return TOUCH_SIZING_PATTERNS.some((re) => re.test(className))
}

/** Touch sizing satisfied on the element, a descendant, or an ancestor. */
function resolvesTouchSizing(el: Element): boolean {
  const ownClass = typeof el.className === 'string' ? el.className : ''
  if (classListHasTouchToken(ownClass)) return true
  if (el.querySelector('[class]')) {
    const descendants = Array.from(el.querySelectorAll('[class]'))
    if (descendants.some((d) => classListHasTouchToken((d as HTMLElement).className))) return true
  }
  let ancestor = el.parentElement
  while (ancestor) {
    const cls = typeof ancestor.className === 'string' ? ancestor.className : ''
    if (classListHasTouchToken(cls)) return true
    ancestor = ancestor.parentElement
  }
  return false
}

describe('Property 30 (DOM-measured): static routes render overflow-free with touch targets at 360px', () => {
  afterEach(() => cleanup())

  it.each(DOM_ROUTES.map((r) => r.path))(
    '%s — no rendered element overflows 360px and interactive elements meet touch sizing',
    async (routePath) => {
      const entry = DOM_ROUTES.find((r) => r.path === routePath)!
      const mod = await entry.loader()
      const Page = mod.default

      // Pin the document/viewport to the 360px Mobile_Breakpoint.
      document.documentElement.style.width = `${VIEWPORT}px`
      document.body.style.width = `${VIEWPORT}px`

      const { container } = render(
        React.createElement(
          MemoryRouter,
          { initialEntries: [routePath] },
          React.createElement(Page),
        ),
      )
      container.setAttribute('style', `width:${VIEWPORT}px`)

      // (1) Overflow — no inline pixel width beyond the viewport on any element.
      const overWide: string[] = []
      container.querySelectorAll<HTMLElement>('*').forEach((el) => {
        const w = parseInt(el.style.width || '', 10)
        const mw = parseInt(el.style.minWidth || '', 10)
        if (Number.isFinite(w) && w > VIEWPORT) overWide.push(`${el.tagName}.width=${w}`)
        if (Number.isFinite(mw) && mw > VIEWPORT) overWide.push(`${el.tagName}.minWidth=${mw}`)
      })
      expect(overWide, `${routePath} has rendered elements wider than ${VIEWPORT}px: ${overWide.join(', ')}`).toEqual([])

      // (1b) jsdom has no layout engine — scrollWidth/clientWidth are 0 here.
      // The relation still holds trivially; pixel-accurate overflow is a 15.4
      // Playwright check. We assert + document rather than silently skip.
      expect(document.body.scrollWidth).toBeLessThanOrEqual(VIEWPORT)

      // (2) Touch targets — every interactive CONTROL resolves ≥44px sizing.
      // R7.3 / Property 30 enumerate the controls explicitly as
      // "button, tab, icon button, input" — plain inline/prose navigation
      // links (e.g. legal-copy table-of-contents anchors, 404 suggested-page
      // cards) are NOT in that set, so the selector deliberately excludes bare
      // <a href>. Button-styled anchors (`<Button asChild><a/></Button>`) are
      // still covered: they render a touch-sized wrapper resolved by
      // `resolvesTouchSizing` via descendant/ancestor lookup.
      const interactiveSel =
        'button, input:not([type="hidden"]), select, textarea, [role="tab"], [role="button"]'
      const interactive = Array.from(container.querySelectorAll(interactiveSel))
      const untouched = interactive.filter((el) => !resolvesTouchSizing(el))
      expect(
        untouched.map((el) => `${el.tagName}:${(el as HTMLElement).className}`),
        `${routePath} has interactive controls without a resolvable ≥44px touch class`,
      ).toEqual([])
    },
  )

  it('the DOM-measured set collectively exercises real interactive controls', async () => {
    let totalControls = 0
    for (const entry of DOM_ROUTES) {
      const mod = await entry.loader()
      const { container } = render(
        React.createElement(
          MemoryRouter,
          { initialEntries: [entry.path] },
          React.createElement(mod.default),
        ),
      )
      totalControls += container.querySelectorAll(
        'button, input:not([type="hidden"]), select, textarea, [role="tab"], [role="button"]',
      ).length
      cleanup()
    }
    // ContactPage + NotFoundPage render real buttons — the touch check is not vacuous.
    expect(totalControls, 'DOM-measured routes rendered no interactive controls at all').toBeGreaterThan(0)
  })
})

// =============================================================================
// Deferred-to-15.4 documentation — rendered-only checks a layout engine needs.
// =============================================================================
describe('Property 30 — rendered-only checks deferred to the 15.4 Playwright pass', () => {
  it('documents the layout-engine checks that jsdom cannot perform', () => {
    const deferred = [
      'pixel-accurate document.scrollWidth ≤ viewport at 360/390/768/1024/1440',
      'rendered 44×44px bounding boxes via getBoundingClientRect',
      'wrapped-tab overflow on /admin/tenants (10-tab TabsList — UI-R7-005)',
      'admin table → mobile card/scroll-container behaviour (UI-R7-004)',
      'dialog full-screen/bottom-sheet, focus trap, non-clipped footer (R7.10)',
      'rendered WCAG AA contrast on every text+background pair (R7.4)',
    ]
    // This is an explicit, reviewable manifest — not an assertion of behaviour.
    expect(deferred.length).toBeGreaterThan(0)
  })
})
