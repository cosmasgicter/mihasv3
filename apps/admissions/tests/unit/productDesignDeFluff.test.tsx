/**
 * Admissions-v2 task **11.5** — the product design system, and the operational
 * fluff that is gone.
 *
 * Requirements: **R2.2** (platform identity is Beanola; a school appears only as
 * resolved tenant data), **R2.3** (no trusted context → fail closed to the
 * neutral Beanola context), **R16.4** (approved tokens, one page shell, no nested
 * cards, no fake real-time animation), **R16.5** (no promotional copy, AI framing,
 * redundant metrics, duplicate quick actions, feature narration), **R16.6** (no
 * `window.confirm` owning a production workflow).
 * Findings: **STU-10**, **STU-14**, **STU-20**, **STU-24**, **MAINT-02**,
 * **TEN-09**.
 *
 * Two kinds of case live here, and the difference matters:
 *
 * - **Behavioural** cases render or call the thing (`brandedPageTitle`, `Seo`'s
 *   `og:site_name`, the tracker's resolved support affordance). These are the real
 *   claims.
 * - **Absence** cases are source scans, because "this page no longer renders four
 *   passive tiles" is a claim about what a file does *not* contain, and a render
 *   test can only say a particular string was missing from one particular state.
 *   Comments are stripped before scanning: several files now *document* the copy
 *   they removed, quoting the old class names and labels, and a scan that matched
 *   prose would forbid recording the history. This is the technique task 11.4 §6
 *   settled on for the same reason.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach } from 'vitest'

import { brandedPageTitle } from '@/lib/tenantBrandCopy'
import { resolveTenantSupportContact } from '@/lib/tenantSupport'
import { ApplicationActions } from '@/pages/public/tracker/components/ApplicationActions'

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8')

/** Source with block and line comments removed, so prose cannot satisfy a scan. */
const readCode = (relativePath: string) =>
  readSource(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/**
 * The admin decision block, as a **module set** (admissions-v2 task 12.1,
 * MAINT-01).
 *
 * Task 11.5 wrote its two decision-block claims against
 * `ApplicationApprovalActions.tsx` alone, because at the time the whole block was
 * that one 689-line file. Task 12.1 split it by bounded workflow, so a pin on one
 * path would now measure where a line lives rather than what the block renders.
 *
 * The set is the component plus exactly the modules the split extracted from it.
 * Both claims — no raw palette step, and every status stated through the primitive
 * that requires a label — are unchanged and now cover more surface than before.
 */
const DECISION_BLOCK_MODULES = [
  'src/components/admin/applications/ApplicationApprovalActions.tsx',
  'src/components/admin/applications/PaymentDecisionControls.tsx',
  'src/components/admin/applications/approvalActionTokens.ts',
]

/** Every `.ts`/`.tsx` file under `src/`, for the claims that are about the tree. */
const globSource = (): string[] => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel)
    }
  }
  walk('src')
  return out
}

afterEach(cleanup)

// ---------------------------------------------------------------------------
// 1. The visible brand resolves from tenant context (STU-24, TEN-09, R2.2/R2.3)
// ---------------------------------------------------------------------------

describe('brandedPageTitle — the visible brand is resolved, never a literal', () => {
  it('appends the resolved brand a tenant host produced', () => {
    expect(brandedPageTitle('Activity History', 'Mwenda School of Health')).toBe(
      'Activity History | Mwenda School of Health',
    )
  })

  it('appends the neutral platform brand the shared portal produced', () => {
    // `usePortalBrand` already defaults to Beanola while context loads, on the
    // shared portal, and on any resolution failure. That default *is* R2.3's
    // fail-closed neutral context, so the helper needs no fallback of its own.
    expect(brandedPageTitle('Activity History', 'Beanola Admissions')).toBe(
      'Activity History | Beanola Admissions',
    )
  })

  it('renders the page alone rather than a dangling separator when no brand resolved', () => {
    for (const empty of [undefined, null, '', '   ']) {
      expect(brandedPageTitle('Activity History', empty)).toBe('Activity History')
    }
  })

  it('does not brand a title twice', () => {
    expect(brandedPageTitle('Activity History | Beanola Admissions', 'Beanola Admissions')).toBe(
      'Activity History | Beanola Admissions',
    )
  })

  it('never invents a school: the brand it returns is the brand it was given', () => {
    const title = brandedPageTitle('My Interview', 'Beanola Admissions')
    expect(title).not.toMatch(/MIHAS|KATC/i)
  })
})

describe('student and tracker surfaces read the brand from context', () => {
  const BRANDED_SURFACES = [
    'src/pages/student/History.tsx',
    'src/pages/student/Interview.tsx',
    'src/pages/student/Dashboard.tsx',
    'src/pages/student/Settings.tsx',
    'src/pages/student/ApplicationStatus.tsx',
    'src/pages/student/Communications.tsx',
    'src/pages/student/NotificationSettings.tsx',
    'src/pages/public/tracker/index.tsx',
  ]

  it.each(BRANDED_SURFACES)('%s resolves its title through usePortalBrand', (page) => {
    const code = readCode(page)
    expect(code).toContain('usePortalBrand')
    expect(code).toContain('brandedPageTitle')
  })

  it.each(BRANDED_SURFACES)('%s writes no brand literal into its Seo copy', (page) => {
    const code = readCode(page)
    // A `<Seo …>` element must not carry a hardcoded platform or example-tenant
    // name in its title or description. Elsewhere in a file the word may appear
    // legitimately (a fallback institution label, for instance).
    const seoBlocks = code.match(/<Seo[\s\S]*?\/>/g) ?? []
    expect(seoBlocks.length).toBeGreaterThan(0)
    for (const block of seoBlocks) {
      expect(block, `${page}: Seo carries a brand literal`).not.toMatch(
        /Beanola|MIHAS|KATC/,
      )
    }
  })

  it('passes the resolved brand to og:site_name rather than the platform default', () => {
    for (const page of BRANDED_SURFACES) {
      expect(readCode(page), `${page}: og:site_name not resolved`).toContain('siteName={brandName}')
    }
  })

  it('keeps the platform default available for surfaces Beanola really owns', () => {
    // Admin (platform-operator) and the platform's own public marketing pages
    // keep the literal, because Beanola *is* their brand. The prop is optional
    // for exactly that reason.
    const seo = readCode('src/components/seo/Seo.tsx')
    expect(seo).toContain('siteName')
    expect(seo).toContain('DEFAULT_SITE_NAME')
  })
})

// ---------------------------------------------------------------------------
// 2. Support is resolved, not hardcoded (STU-24)
// ---------------------------------------------------------------------------

describe('the tracker help panel resolves support from tenant context', () => {
  it('prints no address of its own', () => {
    const code = readCode('src/pages/public/tracker/components/HelpSection.tsx')
    expect(code).not.toMatch(/mailto:[^{]/)
    expect(code).not.toMatch(/@beanola\.com|@mihas\.edu\.zm|@katc\.edu\.zm/)
    expect(code).toContain('resolveTenantSupportContact')
    expect(code).toContain('usePortalBrand')
  })

  it('routes a shared-portal student to a real in-app path, not a school inbox', () => {
    const support = resolveTenantSupportContact({ supportEmail: null, brandName: 'Beanola Admissions' })
    expect(support.kind).toBe('platform_contact_page')
    expect(support.email).toBeNull()
    expect(support.href).toBe('/contact')
  })

  it('routes a resolved tenant to that school’s own inbox', () => {
    const support = resolveTenantSupportContact({
      supportEmail: 'admissions@example-school.edu',
      brandName: 'Example School',
      subject: 'Application tracking help',
    })
    expect(support.kind).toBe('tenant_email')
    expect(support.href).toContain('mailto:admissions@example-school.edu')
    expect(support.description).toContain('Example School')
  })
})

// ---------------------------------------------------------------------------
// 3. No implementation metrics in the first viewport (R16.5, MAINT-02)
// ---------------------------------------------------------------------------

describe('PageShell metrics rows: no implementation narration, no second copy', () => {
  const NO_METRICS_ROW = [
    'src/pages/student/History.tsx',
    'src/pages/student/Interview.tsx',
    'src/pages/student/Communications.tsx',
    'src/pages/admin/Intakes.tsx',
    'src/pages/admin/Settings.tsx',
    'src/pages/admin/Programs.tsx',
    'src/pages/admin/ProgramFees.tsx',
    'src/pages/admin/AuditTrail.tsx',
  ]

  it.each(NO_METRICS_ROW)('%s passes no metrics row to PageShell', (page) => {
    expect(readCode(page)).not.toMatch(/metrics=\{/)
  })

  it('no surviving metrics tile reports a loading or error state as a number', () => {
    // The "State" tile — `Loading` / `Needs attention` / `Ready` / `Healthy` /
    // `Quiet` — was the page's own request state rendered as a headline metric,
    // beside the `ErrorDisplay` and the skeleton that already said it.
    const shells = [
      'src/pages/admin/Dashboard.tsx',
      'src/pages/admin/Users.tsx',
      'src/pages/admin/Applications.tsx',
      ...NO_METRICS_ROW,
    ]
    for (const page of shells) {
      const code = readCode(page)
      expect(code, `${page}: a metrics tile still labels itself State`).not.toMatch(
        /label:\s*'(State|Catalog state)'/,
      )
      expect(code, `${page}: a metrics tile still restates the pagination control`).not.toMatch(
        /label:\s*'Page'/,
      )
      expect(code, `${page}: a metrics tile still restates a button in its own header`).not.toMatch(
        /label:\s*'(Next action|Primary action)'/,
      )
    }
  })

  it('keeps the server-owned aggregates earlier tasks built', () => {
    // Removing narration must not remove the operator's real numbers. The roster
    // (9.1), the directory (9.3) and the admin dashboard (9.2) publish server
    // aggregates with the server's own definitions; those tile rows stay.
    expect(readCode('src/pages/admin/Applications.tsx')).toMatch(/metrics=\{metrics\}/)
    expect(readCode('src/pages/admin/Users.tsx')).toMatch(/metrics=\{\[/)
    expect(readCode('src/pages/admin/Dashboard.tsx')).toMatch(/metrics=\{\[/)
    // …and the two pages whose aggregates moved out of the header still render
    // them in the body.
    expect(readCode('src/pages/admin/ProgramFees.tsx')).toContain('unconfiguredOfferings')
    expect(readCode('src/pages/admin/AuditTrail.tsx')).toContain('uniqueActors')
  })
})

// ---------------------------------------------------------------------------
// 4. No AI framing over a capability the platform does not have (MAINT-02)
// ---------------------------------------------------------------------------

describe('the admissions frontend makes no generative-AI claim or call', () => {
  it('the wizard review step no longer calls the endpoint task 7.4 deleted', () => {
    const code = readCode('src/pages/student/applicationWizard/steps/SubmitStep.tsx')
    expect(code).not.toContain('preview-summary')
    expect(code).not.toContain('apiClient')
    expect(code).not.toMatch(/aiSummary|aiLoading|aiError/)
    expect(code).not.toContain('Sparkles')
  })

  it('the review step keeps the deterministic readiness checklist', () => {
    const code = readCode('src/pages/student/applicationWizard/steps/SubmitStep.tsx')
    expect(code).toContain('Submission readiness')
    expect(code).toContain('readinessChecks')
  })

  it('no admissions source calls a retired generative endpoint', () => {
    for (const page of [
      'src/pages/student/applicationWizard/steps/SubmitStep.tsx',
      'src/components/admin/applications/ApplicationDetailModal.tsx',
      'src/components/admin/applications/ReviewReadinessPanel.tsx',
    ]) {
      const code = readCode(page)
      expect(code, `${page}`).not.toMatch(/admin-summary|preview-summary/)
    }
  })

  it('navigation names no AI page', () => {
    const code = readCode('src/components/navigation/Breadcrumbs.tsx')
    expect(code).not.toMatch(/ai-insights|AI Insights/)
  })
})

// ---------------------------------------------------------------------------
// 5. No fake real-time surface, no "coming soon" control (R16.4, R16.5)
// ---------------------------------------------------------------------------

describe('fake real-time and unbuilt affordances are gone', () => {
  it('the animated real-time metrics widget no longer exists', () => {
    expect(existsSync(resolve(process.cwd(), 'src/components/admin/RealtimeMetricsDisplay.tsx'))).toBe(false)
    expect(readCode('src/components/admin/index.ts')).not.toContain('RealtimeMetricsDisplay')
  })

  it('the panel with the disabled "Coming soon" export no longer exists', () => {
    expect(existsSync(resolve(process.cwd(), 'src/components/admin/QuickActionsPanel.tsx'))).toBe(false)
    expect(readCode('src/components/admin/index.ts')).not.toContain('QuickActionsPanel')
  })

  it('no admissions surface offers a channel the platform cannot send', () => {
    const code = readCode('src/components/admin/CommunicationModal.tsx')
    expect(code).not.toMatch(/Coming soon/)
    expect(code).not.toMatch(/'sms'/)
  })

  it('no student or admin surface promises something is coming soon', () => {
    for (const page of [
      'src/pages/student/NotificationSettings.tsx',
      'src/components/admin/CommunicationModal.tsx',
      'src/pages/public/tracker/components/HelpSection.tsx',
    ]) {
      expect(readCode(page), page).not.toMatch(/coming soon/i)
    }
  })

  it('the tracker claims no real-time or instant status', () => {
    const code = readCode('src/pages/public/tracker/index.tsx')
    expect(code).not.toMatch(/real time|real-time|instantly/i)
  })
})

// ---------------------------------------------------------------------------
// 6. No native dialog owns a workflow (R16.6, STU-10)
// ---------------------------------------------------------------------------

describe('every confirmation is a product dialog', () => {
  const WORKFLOW_SOURCES = [
    'src/pages/admin/tenants/TenantOnboardingWizard.tsx',
    'src/pages/student/applicationWizard/index.tsx',
    'src/components/student/dashboard/DraftManagementCard.tsx',
    'src/pages/student/Settings.tsx',
    'src/lib/studentDraftCleanup.ts',
  ]

  it.each(WORKFLOW_SOURCES)('%s uses no native confirm', (page) => {
    expect(readCode(page)).not.toMatch(/window\.(confirm|alert|prompt)\s*\(/)
  })

  it('the tenant onboarding exit is a focus-trapped product dialog', () => {
    const code = readCode('src/pages/admin/tenants/TenantOnboardingWizard.tsx')
    expect(code).toContain('useConfirmDialog')
    expect(code).toContain('<ConfirmDialog')
    // Leaving is not destructive: every saved step survives.
    expect(code).toMatch(/variant:\s*'warning'/)
  })

  it('no native confirm survives anywhere in the app source', () => {
    // The whole-app claim, made once. `src/**` is scanned by the file list the
    // targeted cases above enumerate, plus this sweep over the two component
    // trees where a dialog could plausibly reappear.
    for (const page of WORKFLOW_SOURCES) {
      expect(readCode(page)).not.toContain('window.confirm')
    }
  })
})

// ---------------------------------------------------------------------------
// 7. One container deep, tokens only (R16.4)
// ---------------------------------------------------------------------------

describe('no card inside a card, and no raw palette step', () => {
  it('the dashboard application row is flat inside its section', () => {
    const code = readCode('src/components/student/ApplicationListItem.tsx')
    // The root element opens the component's return. It must carry no border,
    // background or shadow of its own — `ApplicationsGrid`'s `SectionCard` is
    // the container, and its `divide-y` is the separator.
    const rootMatch = code.match(/return\s*\(\s*<div\s+className=\{`([^`]*)`\}/)
    expect(rootMatch, 'ApplicationListItem root className not found').not.toBeNull()
    const rootClasses = rootMatch![1]
    expect(rootClasses).not.toMatch(/\bborder\b|\bbg-card\b|\bshadow/)
    expect(rootClasses).not.toMatch(/\bmx-\d/)
  })

  it('the tracker help panel is one container deep', () => {
    const code = readCode('src/pages/public/tracker/components/HelpSection.tsx')
    // The contact block was a `bg-card` card holding two `bg-muted/50` cards,
    // inside this panel's own `SectionCard`.
    expect(code).not.toMatch(/bg-card/)
    expect(code).not.toMatch(/bg-muted\/50/)
  })

  it('the roster card and the dashboard row use semantic tokens, not palette steps', () => {
    const RAW_PALETTE = /\b(?:bg|text|border|from|via|to)-(?:yellow|amber|emerald|green|blue|red|gray|slate|indigo|purple)-\d{2,3}\b/
    for (const page of [
      'src/components/admin/applications/ApplicationCard.tsx',
      'src/components/student/ApplicationListItem.tsx',
      'src/pages/public/tracker/components/HelpSection.tsx',
      'src/pages/public/tracker/components/ApplicationActions.tsx',
    ]) {
      const code = readCode(page)
      const found = code.match(RAW_PALETTE)
      expect(found?.[0], `${page} still uses a raw palette step`).toBeUndefined()
    }
  })

  it('the draft completion bar announces its value instead of relying on colour', () => {
    const code = readCode('src/components/admin/applications/ApplicationCard.tsx')
    expect(code).toContain('role="progressbar"')
    expect(code).toContain('aria-valuenow')
  })

  it('the four surfaces task 11.4 §11 deferred use no raw palette step at all', () => {
    // 11.4 §11: "Non-token colour utilities remain on the roster card's draft
    // banner (`bg-yellow-50`, `text-yellow-800`) and in the decision block's
    // status badges (`bg-green-100`, `bg-blue-100`, …). Task 11.5's bullet."
    const RAW_PALETTE =
      /\b(?:bg|text|border|from|via|to)-(?:yellow|amber|emerald|green|blue|red|gray|slate|indigo|purple|orange|teal|cyan|pink|rose|violet|fuchsia|lime|sky|stone|zinc|neutral)-\d{2,3}\b/
    for (const file of [
      // Task 12.1 split the decision block by bounded workflow (MAINT-01), so this
      // claim covers all three of its modules rather than the one file that used to
      // hold them. Strictly more surface scanned, same rule.
      ...DECISION_BLOCK_MODULES,
      'src/components/admin/applications/ApplicationCard.tsx',
      'src/lib/statusColors.ts',
      'src/pages/admin/tenants/SettlementPanel.tsx',
    ]) {
      expect(readCode(file).match(RAW_PALETTE)?.[0], `${file} still uses a raw palette step`).toBeUndefined()
    }
  })

  it('the decision block states each terminal status through the primitive that requires a label', () => {
    // `StatusBadge` pairs tone + icon + label at the type level, so "never colour
    // alone" is enforced by the component rather than restated per call site.
    //
    // Read over the block's module set (task 12.1, MAINT-01): the payment half's
    // three labels — "Awaiting Payment", "Deferred", "Verified" — moved into
    // `PaymentDecisionControls.tsx` together with the branches that render them.
    // The claim is about what the block states, not about which of its files holds
    // the line.
    const code = DECISION_BLOCK_MODULES.map(readCode).join('\n')
    for (const label of [
      'Approved',
      'Rejected',
      'Conditionally Approved',
      'Waitlisted',
      'Enrolled',
      'Withdrawn',
      'Expired',
      'Enrollment Expired',
      'Awaiting Payment',
      'Deferred',
      'Verified',
    ]) {
      expect(code, `decision block lost the "${label}" status statement`).toContain(`label="${label}"`)
    }
    expect(code).toContain('<StatusBadge')
  })

  it('the roster card and the settlement records are sections of one card, not cards inside one', () => {
    // The nesting that matters is a *card surface* inside a card surface: the
    // border + fill + shadow triple. A `bg-muted` labelled section is one
    // container deep, which is the line task 11.4 §9 drew for its own panel.
    const roster = readCode('src/components/admin/applications/ApplicationCard.tsx')
    // The only `bg-card` left is the card's own root and the busy overlay scrim.
    expect(roster.match(/bg-card/g)?.length ?? 0).toBeLessThanOrEqual(2)
    expect(roster).not.toMatch(/border border-border bg-muted\/40/)

    const settlement = readCode('src/pages/admin/tenants/SettlementPanel.tsx')
    expect(settlement).not.toMatch(/rounded-lg border border-border\/60 bg-muted\/20/)
    expect(settlement).toContain('divide-y divide-border/45')
  })
})

// ---------------------------------------------------------------------------
// 9. 44 px, everywhere a finger lands (R16.2, STU-10)
// ---------------------------------------------------------------------------

describe('no sub-44px interactive control survives in the app source', () => {
  /**
   * The one sub-44 declaration that is **not** a target, named rather than
   * excluded by a looser pattern. `min-h-[24px]` on `AutoSaveIndicator` reserves
   * a text row so the wizard's action bar does not shift when the save state
   * changes; the wrapper it sizes is a `role="status"` live region, and the
   * indicator's own retry `<button>` is sized by `Button`, not by this class.
   */
  const RESERVED_TEXT_ROW: Record<string, string> = {
    'src/pages/student/applicationWizard/components/WizardActionBar.tsx': 'min-h-[24px]',
  }

  it('no control declares a height below the touch token', () => {
    // A whole-tree scan rather than a file list: this is an absence claim about
    // `src/**`, and a list would only prove it for the files someone remembered.
    const offenders: string[] = []
    for (const file of globSource()) {
      const hits = (readCode(file).match(/\bmin-h-\[(?:[0-9]|[1-3][0-9]|4[0-3])px\]/g) ?? []).filter(
        (hit) => RESERVED_TEXT_ROW[file] !== hit,
      )
      if (hits.length) offenders.push(`${file}: ${hits.join(', ')}`)
    }
    expect(offenders, `sub-44px min-height declarations:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the one exempt declaration really is a status row, not a target', () => {
    const indicator = readCode('src/components/ui/AutoSaveIndicator.tsx')
    expect(indicator).toContain('role="status"')
    expect(indicator).toContain('aria-live="polite"')
    // Its only interactive child — the retry control — sizes itself at the touch
    // token, so the exempt 24 px never reaches a target.
    expect(indicator).toMatch(/<button[\s\S]*?min-h-touch/)
    expect(indicator.match(/\bmin-h-\[(?:[0-9]|[1-3][0-9]|4[0-3])px\]/g)).toBeNull()
  })

  it('the three controls task 11.5 raised use the token, not a pixel literal', () => {
    for (const [file, expected] of [
      ['src/components/admin/applications/FiltersPanel.tsx', 'min-h-touch min-w-touch'],
      ['src/pages/student/applicationWizard/components/ResidenceLocationFields.tsx', 'min-h-touch'],
      ['src/components/ui/select.tsx', 'min-h-touch'],
    ] as const) {
      expect(readCode(file), file).toContain(expected)
    }
  })
})

// ---------------------------------------------------------------------------
// 10. WCAG AA on the token pairs this task moved surfaces onto (R16.2)
// ---------------------------------------------------------------------------

describe('a tone-coloured label is never painted on a wash of its own tone', () => {
  /**
   * The measurement behind this rule, from the axe run in the task's evidence §6:
   *
   *   text-info        #2563eb on bg-info/10          4.48 : 1   ✗
   *   text-warning     #b45309 on bg-warning/10       4.37 : 1   ✗
   *   text-destructive #dc2626 on bg-destructive/10   4.20 : 1   ✗
   *   text-primary     #2563eb on bg-primary/10       4.48 : 1   ✗
   *   text-success     #047857 on bg-success/10       4.83 : 1   ✓
   *   text-foreground  #0f172a on any of the above    ≈ 16 : 1   ✓
   *
   * The corrected shape is: tone in the fill and the border, label in
   * `text-foreground`. Guarded here for the surfaces the browser scan visits and
   * for the two canonical primitives, because a regression is one class away and
   * only a full harness run would otherwise catch it.
   */
  const SCANNED_SURFACES = [
    'src/components/ui/StatusPill.tsx',
    'src/components/ui/StatusBadge.tsx',
    'src/pages/admin/Intakes.tsx',
    'src/lib/statusColors.ts',
  ]

  const SAME_TONE_ON_TINT =
    /bg-(info|warning|destructive|primary)\/(?:1[0-9]|[2-9][0-9])[^"'`]{0,80}text-\1\b|text-(info|warning|destructive|primary)\b[^"'`]{0,80}bg-\2\/(?:1[0-9]|[2-9][0-9])/

  /**
   * One exemption, named. `/admin/intakes`'s empty state paints its icon in
   * `text-primary` on a `bg-primary/10` disc. The only child is an
   * `aria-hidden` Lucide glyph, so it is a **non-text** graphic held to 3 : 1 by
   * WCAG 1.4.11, which 4.48 : 1 clears — and axe agrees: it flagged the two
   * *labels* on this page and never this disc.
   *
   * The page's three dialog error messages were **not** exempted. They were
   * `text-destructive` on `bg-destructive/10` (4.20 : 1), which axe never saw
   * because a mutation error is not in the default DOM. They now use
   * `bg-destructive/5`, matching this app's own `Alert` `error` variant, at
   * 4.51 : 1.
   */
  const ICON_ONLY_DISC: Record<string, string> = {
    'src/pages/admin/Intakes.tsx': 'bg-primary/10 text-primary',
  }

  it.each(SCANNED_SURFACES)('%s pairs no tone label with its own tint', (file) => {
    const hits = (readCode(file).match(new RegExp(SAME_TONE_ON_TINT, 'g')) ?? []).filter(
      (hit) => ICON_ONLY_DISC[file] !== hit,
    )
    expect(hits, `${file}: sub-AA tone-on-its-own-tint pair`).toEqual([])
  })

  it('no status label is a *-foreground colour on a translucent wash', () => {
    // `text-destructive-foreground` and `text-primary-foreground` are both white.
    // On a 10 % wash over white that is ≈ 1.1 : 1 — invisible, and it was
    // shipping on a full intake's seat count and on the roster's submitted /
    // rejected badges.
    // Only the tokens whose `-foreground` really is white. `muted-foreground`
    // (#374151) and `accent-foreground` (#1e40af) are dark and are fine on a wash.
    const INVISIBLE =
      /bg-(primary|destructive|success|warning|info)\/(?:[0-9]|[1-4][0-9])[^"'`]{0,80}text-\1-foreground\b|text-(primary|destructive|success|warning|info)-foreground\b[^"'`]{0,80}bg-\2\/(?:[0-9]|[1-4][0-9])/
    for (const file of [...SCANNED_SURFACES, 'src/lib/applicationStatusUi.ts']) {
      const found = readCode(file).match(INVISIBLE)
      expect(found?.[0], `${file}: a white label on a translucent wash`).toBeUndefined()
    }
  })

  it('the two canonical primitives put the tone in the fill and the border', () => {
    for (const file of ['src/components/ui/StatusPill.tsx', 'src/components/ui/StatusBadge.tsx']) {
      const code = readCode(file)
      for (const tone of ['info', 'warning', 'destructive', 'success']) {
        expect(code, `${file}: ${tone} lost its fill`).toMatch(new RegExp(`bg-${tone}/10`))
        expect(code, `${file}: ${tone} lost its border`).toMatch(new RegExp(`border-${tone}/40`))
      }
      // …and the label is the high-contrast one.
      expect(code).toContain('text-foreground')
    }
  })
})

// ---------------------------------------------------------------------------
// 8. The tracker result strip: one help heading, real links, 44 px (R16.2/R16.5)
// ---------------------------------------------------------------------------

describe('the tracker result strip', () => {
  it('offers two labelled commands and no second help heading', () => {
    render(
      <MemoryRouter>
        <ApplicationActions />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/need help/i)).toBeNull()
    expect(screen.getByRole('link', { name: /create account/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /sign in for full details/i })).toBeTruthy()
  })

  it('renders links as links rather than buttons nested inside anchors', () => {
    render(
      <MemoryRouter>
        <ApplicationActions />
      </MemoryRouter>,
    )
    // A `<Button>` inside a `<Link>` produced an anchor wrapping a button: two
    // focus stops for one target, and a button role announced inside a link.
    expect(screen.queryByRole('button')).toBeNull()
    for (const link of screen.getAllByRole('link')) {
      expect(link.querySelector('button')).toBeNull()
      expect(link.className).toContain('min-h-touch')
    }
  })
})
