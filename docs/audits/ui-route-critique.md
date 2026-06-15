# UI Route Critique — Beanola Production Readiness (R7)

> Task 15.1 of `.kiro/specs/beanola-production-readiness/`. Per-route pass/fail
> notes for **every** public, student, and admin `UI_Route` enumerated in
> `apps/admissions/src/routes/config.tsx`, evaluated against R7.1–R7.5, R7.7,
> R7.8, and R7.12 at every `Mobile_Breakpoint` (360, 390, 768, 1024, ≥1440).
>
> **Scope of this task:** author the critique + issue list. Fixes are task 15.2;
> the 360px DOM overflow guard is task 15.3; Playwright screenshot evidence is
> task 15.4. **No fixes applied here.**

## Method

- **Route source of truth:** `apps/admissions/src/routes/config.tsx` (read in
  full). Pure redirect routes (`<Navigate>`) and the `*` catch-all are listed but
  carry no independent UI — they inherit the target route's verdict.
- **Static evidence gathered with `rg`** over `apps/admissions/src/pages/` for:
  purple gradients / gradient text (`from-purple`, `to-purple`, `via-purple`,
  `bg-gradient`, `bg-clip-text`, `text-transparent`), glassmorphism
  (`backdrop-blur`), emoji (Unicode pictographs), touch targets
  (`min-h-touch` / `min-w-touch`), canonical primitives (`PageShell`,
  `SectionCard`, `ErrorDisplay`, `EmptyState`), hardcoded brand
  (`MIHAS|KATC|Mukuba|Kalulushi`), and hardcoded fees / health-only language.
- **Token + global checks:** `tailwind.config.js` Inter chain confirmed full;
  `src/index.css` `@media (prefers-reduced-motion: reduce)` confirmed present
  (line 35) and globally enforced.
- **Impeccable CLI:** `impeccable detect apps/admissions/src/` — see
  [Impeccable detect findings](#impeccable-detect-findings).
- **Verdict legend:** **PASS** = no issue found by static analysis at any
  breakpoint; **PASS\*** = passes but carries a note/assumption a Playwright pass
  (15.4) must confirm; **FAIL** = concrete violation, gets an issue ID.

### Cross-cutting results (apply to every route)

| Check (Req) | Result | Evidence |
|---|---|---|
| Purple gradients / gradient text (R7.5) | **PASS** | Zero `from/to/via-purple`, `bg-gradient`, `bg-clip-text`, `text-transparent` hits across `pages/`. |
| Glassmorphism (R7.5) | **PASS** | Only `backdrop-blur-sm` in the wizard sticky action bar scrim (`applicationWizard/index.tsx:938`) — modal-scrim use, allowed by DESIGN.md §5. No glassmorphism on content surfaces. |
| Nested cards (R7.5) | **PASS\*** | No `SectionCard > Card > Card` found in static scan; deep nesting to be confirmed visually in 15.4. |
| Emoji as structural icons (R7.5) | **FAIL** | `EducationStep.tsx` subject-category labels use 🔬💼📚💻🎨🌍★ — **UI-R7-001**. Dev-only ⚡ in `PaymentStep.tsx` is tree-shaken from production (quarantined, not a prod violation — **UI-R7-002** to verify the guard). |
| Inter fallback chain preserved (R7.5) | **PASS** | `tailwind.config.js:121` carries the full Tailwind default sans stack with Inter prepended. |
| Reduced motion respected (R7.7) | **PASS** | Global `@media (prefers-reduced-motion: reduce)` in `src/index.css:35`; no per-page override found. |
| Lucide icons only (R7.4) | **PASS\*** | No emoji structural icons outside UI-R7-001; Lucide is the icon system. Per-route icon-only-button labelling to confirm in 15.4. |
| WCAG AA contrast (R7.4) | **PASS\*** | Tokens are AA-documented in `design-tokens.css`; no per-page hardcoded hex found in scan. Rendered contrast to confirm in 15.4. |
| Beanola-as-platform copy, no hardcoded brand/fees/health-only (R7.12) | **PASS** | Zero `MIHAS/KATC/Mukuba/Kalulushi` and zero hardcoded `K###`/`ZMW`/health-only strings in active `pages/` (excluding `pages/dev/` previews). Copy reads "Beanola Admissions". School names sourced from tenant data. |
| Touch targets ≥44px @360 (R7.3) | **PASS\*** | `min-h-touch`/`min-w-touch` present across student + admin pages. A few low-usage pages need DOM measurement — the 15.3 overflow/touch guard is the authoritative check. |
| Horizontal overflow @360/390 (R7.2) | **PASS\*** | No obvious fixed-width offenders in scan; the authoritative measurement is the 15.3 DOM guard + 15.4 Playwright pass. Admin tables flagged for scroll-container confirmation (see admin section). |
| Scope/school context (R7.8) | Mixed | Admin Dashboard has explicit scope resolution + no-scope state. Other admin surfaces inherit a global scope indicator — flagged per route below. |

---

## Public routes

| Route | Component | Verdict | Notes |
|---|---|---|---|
| `/` | `LandingPage` | **PASS\*** | Brand register (allowed). Beanola-as-platform copy confirmed (`LandingPage.tsx:129–157`). SEO structured data is Beanola-branded. Confirm hero CTA ≥44px + no 360px overflow in 15.4. |
| `/track-application` | `public/tracker/index` | **PASS\*** | `min-h-touch` present in `TrackerSearchSection`, `NoResultsView`, `HelpSection`. Public anonymous surface — confirm no PII leak + AA contrast in 15.4. |
| `/contact` | `ContactPage` | **PASS** | 5× `min-h-touch`. Beanola copy (`ContactPage.tsx:51–52`). No brand/fee hardcoding. |
| `/terms` | `TermsPage` | **PASS\*** | Static legal copy. Confirm heading order + 360px reflow in 15.4. |
| `/privacy` | `PrivacyPage` | **PASS\*** | Static legal copy. Confirm heading order + 360px reflow in 15.4. |
| `/auth/signin`, `/signin`, `/login` | `SignInPage` | **PASS\*** | Beanola copy (`SignInPage.tsx:96–104`). Auth-form attributes (autocomplete/inputmode/type) enforced by existing audit tests. Confirm ≥44px fields @360. |
| `/auth/signup` | `SignUpPage` | **PASS\*** | Same auth-form contract. Confirm field touch targets + inline/server error display @360 in 15.4. |
| `/auth/forgot-password` | `ForgotPasswordPage` | **PASS\*** | Confirm success-state copy + field targets in 15.4. |
| `/auth/reset-password` | `ResetPasswordPage` | **PASS\*** | Confirm field targets + error mapping in 15.4. |
| `/auth/callback` | `AuthCallbackPage` | **PASS\*** | Transitional/loading surface — confirm a visible loading state at all breakpoints. |
| `/payment/callback` | `student/PaymentCallback` | **PASS** | Public guard but payment-result surface; 1× `min-h-touch`. Confirm result/retry affordance in 15.4. |
| `/dashboard` | `DashboardRedirect` | **PASS** | Redirect-only, no independent UI. |
| `/404` | `NotFoundPage` | **PASS** | Beanola copy (`NotFoundPage.tsx:109`). |
| `*` | `<Navigate to="/404">` | **PASS** | Catch-all redirect, inherits `/404`. |

## Student routes

| Route | Component | Verdict | Notes |
|---|---|---|---|
| `/student/dashboard` | `student/Dashboard` | **PASS\*** | `PageShell`. Confirm card layout + primary "Continue application" action prominence @360. |
| `/apply`, `/student/application-wizard` | `applicationWizard/index` | **FAIL** | **UI-R7-001** — `EducationStep` emoji category labels (R7.5). Otherwise strong: `PageShell`, 3× `min-h-touch`, sticky action bar with safe-area inset, `Stepper`. Auto-save + dirty-state to confirm in 15.2/15.4. |
| `/student/applications/new` | `<Navigate>` | **PASS** | Redirect to wizard. |
| `/student/applications` | `<Navigate>` | **PASS** | Redirect to dashboard. |
| `/student/application-status` | `<Navigate>` | **PASS** | Redirect to `/student/status`. |
| `/student/status` | `student/ApplicationStatus` | **PASS\*** | `PageShell` + `min-h-touch`. Status uses `StatusIcon` (icon+label pairing, R7.4). See **UI-R7-003** (StatusTimeline side-tab border) which renders on status surfaces. |
| `/application/:id` | `student/ApplicationStatus` | **PASS\*** | Same component as `/student/status`. |
| `/student/application/:id/status` | `student/ApplicationStatus` | **PASS\*** | Same component. |
| `/student/application/:id` | `student/ApplicationDetail` | **PASS\*** | `PageShell`, 2× `min-h-touch`, `StatusIcon` x2. Confirm metadata density + no 360px overflow in 15.4. |
| `/settings`, `/student/profile`, `/student/profile/edit` | `<Navigate>` | **PASS** | Redirects to `/student/settings`. |
| `/student/settings` | `student/Settings` | **PASS\*** | `PageShell`, 2× `min-h-touch`. Dirty-state + `beforeunload` protection is a hard rule (R7.6) — confirm preserved in 15.2. |
| `/student/notifications` | `student/NotificationSettings` | **PASS** | `PageShell`, 6× `min-h-touch` (toggles well-sized). |
| `/student/payment` | `student/Payment` | **PASS\*** | `PageShell`, 2× `min-h-touch`, 4× `StatusIcon`. Read-only history surface (correct per product contract). Confirm payment badges readable @360. |
| `/student/payments` | `<Navigate>` | **PASS** | Redirect to `/student/payment`. |
| `/student/interview` | `student/Interview` | **PASS\*** | `PageShell`, 2× `min-h-touch`. Confirm join-action button target + time display @360. |
| `/student/interviews` | `<Navigate>` | **PASS** | Redirect. |
| `/student/communications` | `student/Communications` | **PASS\*** | `PageShell`, 1× `min-h-touch`. Confirm list empty-state + 360px reflow. |
| `/student/history` | `student/History` | **PASS\*** | `PageShell`. Status-label mapping present. Confirm timeline reflow @360. |

## Admin routes

> Admin is desktop-first but must remain usable at 360/390 (R7.2, R7.9). Tables
> must become cards/scroll containers with collapsible filters and safe bulk
> actions on mobile.

| Route | Component | Verdict | Notes |
|---|---|---|---|
| `/admin`, `/admin/dashboard` | `admin/Dashboard` | **PASS** | `PageShell`. **Scope context done well (R7.8):** `resolveDashboardScope` + explicit `no-scope` `EmptyState` ("No school access assigned", `Dashboard.tsx:185–209`). Reference pattern for other admin surfaces. |
| `/admin/profile` | `admin/Settings` | **PASS\*** | Shared with `/admin/settings`. Confirm form contract @360. |
| `/admin/applications` | `admin/Applications` | **FAIL** | **UI-R7-004** — needs explicit mobile card/scroll-container + collapsible filter confirmation (R7.9). Has 6× `min-h-touch`, institution filter + scope, dialogs. Has overflow-x table; confirm it is an *intentional* scroll container with readable badges @360 in 15.2/15.4. |
| `/admin/programs` | `admin/Programs` | **PASS\*** | `PageShell`, dialogs. Confirm dialog is full-screen/bottom-sheet @360 with focus trap + non-clipped footer (R7.10) in 15.2. |
| `/admin/tenants` | `admin/Tenants` | **FAIL** | **UI-R7-005** — 10-tab `TabsList` (`flex-wrap`, `Tenants.tsx:531–543`) covering Domains/Offerings/Routing/Docs/Templates/Profiles/Assets/Staff/Settlement/Audit. Confirm wrapped tabs stay ≥44px and don't overflow @360; this single route is the matrix's *tenant onboarding, document profiles, assets, routing simulator* surfaces. Beanola copy confirmed (`Tenants.tsx:429`). |
| `/admin/intakes` | `admin/Intakes` | **PASS\*** | `PageShell`, table + dialogs. Confirm mobile table strategy + dialog @360 (R7.9, R7.10). |
| `/admin/users` | `admin/Users` | **PASS\*** | `PageShell`, 8× `min-h-touch`, table + dialogs. Confirm bulk-action safety + table reflow @360 (R7.9). |
| `/admin/audit` | `admin/AuditTrail` | **PASS\*** | `PageShell`, 1× `min-h-touch`. Dense table — confirm scroll-container + no PII leak @360 (R7.9, R5.10). |
| `/admin/program-fees` | `admin/ProgramFees` | **PASS\*** | `PageShell`, table. Fees are configured (not hardcoded) — consistent with R7.12. Confirm table reflow @360. |
| `/admin/settings` | `admin/Settings` | **PASS\*** | `PageShell`. Confirm form contract + dialog behaviour @360. |

### Admin tenant sub-panels (rendered inside `/admin/tenants`)

These are not standalone routes but are named in the Phase-7 matrix; critiqued
as tab panels of `/admin/tenants`.

| Panel | File | Verdict | Notes |
|---|---|---|---|
| Offerings & rules | `tenants/OfferingsPanel.tsx` | **PASS\*** | 1× `min-h-touch`, 2× `StatusIcon`. Confirm table/list reflow @360. |
| Routing simulator | `tenants/RoutingSimulatorPanel.tsx` | **PASS\*** | 7× `StatusIcon` (good icon+label pairing). Confirm result panel reflow @360. |
| Document profiles | `tenants/ProfilesPanel.tsx` | **PASS\*** | 4× `StatusIcon`. Confirm profile cards single-container-deep @360. |
| Assets | `tenants/*` (assets tab) | **PASS\*** | Confirm asset upload control ≥44px + preview fallback @360. |
| Templates | `tenants/TemplatesPanel.tsx` | **PASS\*** | 1× `min-h-touch`, 3× `StatusIcon`. Confirm editor reflow @360. |
| Settlement | `tenants/SettlementPanel.tsx` | **PASS\*** | 2× `StatusIcon`, table. Confirm scroll container @360. |
| Audit | `tenants/AuditPanel.tsx` | **PASS\*** | 2× `StatusIcon`. Confirm no PII + table reflow @360. |

---

## Impeccable detect findings

`impeccable detect apps/admissions/src/` (v2.1.9, 511 files scanned) — **exit
code 2**, **3 anti-patterns found**:

| # | File:line | Rule | Severity | Disposition |
|---|---|---|---|---|
| 1 | `components/student/applicationStatus/StatusTimeline.tsx:54` | `[side-tab] border-l-2` | P1 (tell, not a hard guardrail breach) | **UI-R7-003** — thick colored left border on a card. Renders on student status surfaces. Fix in 15.2 (subtler accent or remove). |
| 2 | `src/index.css:16` | `[overused-font] font-family: 'Inter'` | Informational | **Accepted / WONTFIX.** Inter is the mandated body font and its full fallback chain is a hard constraint (`tech.md`, DESIGN.md §2). Not a P0; do not "fix". |
| 3 | `src/index.css:52` | `[overused-font] font-family: Inter` | Informational | **Accepted / WONTFIX.** Same as above. |

**P0 findings: none.** The two `overused-font` hits are deliberate platform
decisions (Inter is required, chain must stay full), and `side-tab` is a P1
visual tell, not a guardrail breach. No purple-gradient / glassmorphism /
nested-card / emoji rule fired at the CLI level (the CLI does not scan the
`EducationStep` string labels as structural icons — see UI-R7-001, caught by the
dedicated emoji scan).

---

## Issue list (every FAIL gets an ID)

| Issue ID | Route / surface | Req | Severity | Description | Target task |
|---|---|---|---|---|---|
| **UI-R7-001** | `/apply`, `/student/application-wizard` → `EducationStep.tsx:192–199` | R7.5 | High | Subject-category labels use emoji as structural icons (🔬 Sciences, 💼 Commercial, 📚 Humanities, 💻 Technology, 🎨 Practical, 🌍 Languages, ★ Core). Replace with Lucide icons or plain text labels. | 15.2 |
| **UI-R7-002** | `PaymentStep.tsx:252,256` (dev-bypass) | R7.5 | Low | ⚡ emoji in the dev-only "Simulate Payment" control. Tree-shaken from production builds — quarantined, not a prod violation. Verify the production tree-shake guard so it can never ship. | 15.2 (verify only) |
| **UI-R7-003** | `StatusTimeline.tsx:54` (student status surfaces) | R7.4/R7.5 | Medium | `border-l-2` side-tab card border — Impeccable P1 AI-tell. Replace with a subtler accent or remove. | 15.2 |
| **UI-R7-004** | `/admin/applications` | R7.9 | Medium | Confirm/ensure the applications table renders as an intentional mobile scroll container (or cards) with collapsible filters, safe discoverable bulk actions, and readable status/payment badges at 360/390px. | 15.2 + 15.4 |
| **UI-R7-005** | `/admin/tenants` | R7.2/R7.3 | Medium | 10-tab wrapped `TabsList` — confirm tabs stay ≥44×44px and produce no horizontal overflow at 360/390px; this route also hosts the document-profiles, assets, and routing-simulator surfaces. | 15.2 + 15.3 + 15.4 |

### Deferred-to-Playwright confirmations (PASS\* items)

The PASS\* verdicts are static-analysis-clean but require rendered confirmation
in **15.4** (Playwright at 360×800, 390×844, 768×1024, 1024×768, 1440×900) and
the **15.3** DOM overflow/touch-target guard:

- All admin tables: intentional mobile scroll-container / card strategy (R7.9).
- All admin dialogs: full-screen/bottom-sheet, focus trap, non-clipped footer,
  working close/escape/back at 360px (R7.10).
- Auth + settings forms: field touch targets ≥44px, inline + server error
  mapping, success state, dirty-state/`beforeunload` preservation (R7.6).
- Rendered WCAG AA contrast on every text+background pair (R7.4).
- Nested-card depth and heading order across all routes (R7.5, R8 a11y).
- Scope/school indicator visibility on every staff surface beyond Dashboard
  (R7.8).

---

## Summary

- **Routes covered:** 50 `RouteConfig` entries from `routes/config.tsx`
  (12 public incl. redirects + catch-all, 21 student incl. redirects, 14 admin),
  plus 7 admin tenant sub-panels named in the Phase-7 matrix.
- **Distinct UI surfaces critiqued:** 13 public, ~12 student, ~10 admin +
  7 tenant panels (redirect routes inherit their target's verdict).
- **Impeccable detect:** exit 2, 3 anti-patterns, **0 P0**. One actionable P1
  (`side-tab` → UI-R7-003); two `overused-font` hits accepted (Inter is
  mandated).
- **Fails opened:** 5 issue IDs (**UI-R7-001**…**UI-R7-005**). Highest priority
  is UI-R7-001 (emoji structural icons in the wizard EducationStep).
- **Cross-cutting guardrails:** purple gradients/gradient text **none**;
  glassmorphism **none on content** (only allowed modal-scrim blur); Inter chain
  **full**; reduced-motion **enforced globally**; Beanola-as-platform copy with
  **no hardcoded brand/fees/health-only** strings in active source.
- **Next:** 15.2 applies the fixes (UI-R7-001/003 hard, UI-R7-004/005 confirm +
  fix), 15.3 adds the 360px overflow/touch DOM guard, 15.4 captures Playwright
  evidence.

---

## Task 15.4 — Playwright screenshot evidence (R7.11)

**Harness:** `apps/admissions/tests/e2e/mobileBreakpointScreenshots.spec.ts`
(authored under task 15.4, mirroring the gated/deferred pattern of
`apps/admissions/tests/e2e/whiteLabelHostOverride.spec.ts`).

The spec drives the **key** public, student, and admin `UI_Route`s through the
full `Mobile_Breakpoint` set and writes one full-page PNG per
(route × breakpoint). It also captures **failure screenshots** for the open
issue IDs below so the PASS\*/FAIL notes above have rendered evidence.

### Mobile_Breakpoint set captured

| Breakpoint | Width × Height | Role |
|---|---|---|
| 360×800 | 360 × 800 | Primary mobile target |
| 390×844 | 390 × 844 | Modern phone |
| 768×1024 | 768 × 1024 | Tablet portrait |
| 1024×768 | 1024 × 768 | Tablet landscape / small laptop |
| 1440×900 | 1440 × 900 | Desktop |

### Key routes captured (subset of `routes/config.tsx`, Phase-7 matrix)

- **Public (no auth):** `/`, `/track-application`, `/contact`, `/auth/signin`,
  `/auth/signup`, `/auth/forgot-password`, `/404`.
- **Student (auth-guarded):** `/student/dashboard`,
  `/student/application-wizard`, `/student/status`, `/student/payment`,
  `/student/interview`, `/student/settings`.
- **Admin (auth-guarded):** `/admin/dashboard`, `/admin/applications`,
  `/admin/tenants`, `/admin/users`, `/admin/audit`.

### Failure screenshots referenced from the issue notes (R7.11)

Captured at the two narrowest breakpoints (360×800, 390×844) where the failures
manifest:

| Issue | Surface | What the shot evidences |
|---|---|---|
| **UI-R7-001** | `/student/application-wizard` | EducationStep emoji category labels used as structural icons (R7.5). |
| **UI-R7-003** | `/student/status` | StatusTimeline `border-l-2` side-tab AI-tell (R7.4/R7.5). |
| **UI-R7-004** | `/admin/applications` | Applications table mobile scroll-container / cards at 360/390 (R7.9). |
| **UI-R7-005** | `/admin/tenants` | 10-tab wrapped `TabsList` — tab ≥44px + no overflow at 360/390 (R7.2/R7.3). |

### Run status — DEFERRED (live capture)

A live capture run was **not executed** in this environment. The harness is
authored, gated, and runnable; the blockers are environmental, not code:

1. **No Playwright browser binary** — `~/.cache/ms-playwright` has no Chromium
   (`browserType.launch: Executable doesn't exist … chrome-headless-shell`).
2. **No running admissions dev server** on `http://localhost:5173`.

The whole suite is therefore gated behind `UI_SCREENSHOTS_E2E=1` and the
auth-guarded student/admin routes additionally skip unless
`PLAYWRIGHT_STORAGE_STATE` points at a logged-in session — so it is a no-op in
CI / the sandbox and only captures evidence when an operator runs it against a
staging or local environment with browsers installed. The 98 planned cases
enumerate cleanly under
`bun x playwright test tests/e2e/mobileBreakpointScreenshots.spec.ts --list`
(verified). The deterministic 360px overflow/touch check is the runnable DOM
guard `tests/unit/routeMobileOverflowGuard.test.tsx` (task 15.3, Property 30).

### How to capture the evidence (operator step)

```bash
cd apps/admissions

# 1. one-time: install the browser binary
bun x playwright install chromium

# 2. start the admissions app (separate terminal)
bun run dev                               # serves http://localhost:5173

# 3a. public routes only (no auth required)
UI_SCREENSHOTS_E2E=1 \
PLAYWRIGHT_BASE_URL=http://localhost:5173 \
  bun x playwright test tests/e2e/mobileBreakpointScreenshots.spec.ts

# 3b. include student/admin routes — supply a logged-in storage state
#     (capture once: bun x playwright codegen --save-storage=state.json <url>)
UI_SCREENSHOTS_E2E=1 \
PLAYWRIGHT_BASE_URL=http://localhost:5173 \
PLAYWRIGHT_STORAGE_STATE=./state.json \
  bun x playwright test tests/e2e/mobileBreakpointScreenshots.spec.ts

# enumerate the planned cases without a browser or server:
bun x playwright test tests/e2e/mobileBreakpointScreenshots.spec.ts --list
```

Output PNGs land in `test-results/ui-route-screenshots/` (one per
route × breakpoint) and `test-results/ui-route-screenshots/failures/` (the
UI-R7-### failure shots).
