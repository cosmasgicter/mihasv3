# Public UI Cleanup Implementation Plan

> Session-ready checklist. Update status after each task for resumability.

**Goal:** Deliver a clean, consistent, mobile-friendly public UI with visible homepage media and stronger performance behavior.

**Architecture:** Fix core reveal/visual primitives first, then apply page-level consistency refinements, then verify with script-driven screenshots and route metrics.

**Tech Stack:** React 18, Vite, Tailwind, custom SmoothUI components, Playwright route scan script.

---

## Current Status
- [x] Task 1: Audit and document issues
- [x] Task 2: Fix homepage visibility + hero media
- [x] Task 3: Normalize public page consistency/mobile spacing
- [x] Task 4: Runtime warning cleanup
- [~] Task 5: Verification and handoff update (tests done; browser scan pending sandbox port policy)

## Task 1: Audit and Documentation
**Files:**
- Create: `docs/plans/2026-03-02-ui-cleanup-requirements.md`
- Create: `docs/plans/2026-03-02-ui-cleanup-design.md`
- Create: `docs/plans/2026-03-02-ui-cleanup-plan.md`

**Verification:**
- Ensure issue list references concrete files and screenshot/report evidence.

## Task 2: Homepage Visibility + Hero Media
**Files:**
- Modify: `src/components/smoothui/scroll-reveal.tsx`
- Modify: `src/pages/LandingPage.tsx`
- Optional adjust: `src/lib/constants/landing.ts`

**Steps:**
1. Fix `StaggerItem` reveal visibility contract.
2. Add visual hero media block above fold with optimized image usage.
3. Keep below-fold images lazy.

**Verification:**
- `bunx playwright screenshot --viewport-size="1440,2200" http://127.0.0.1:4173/ /tmp/ui-home-desktop.png`
- `bunx playwright screenshot --viewport-size="390,844" --full-page http://127.0.0.1:4173/ /tmp/ui-home-mobile.png`

## Task 3: Public Consistency + Mobile Ergonomics
**Files:**
- Modify: `src/pages/public/tracker/components/TrackerSearchSection.tsx`
- Modify: `src/pages/public/tracker/components/HelpSection.tsx`
- Modify: `src/pages/public/tracker/components/ApplicationStatusHeader.tsx`
- Modify: `src/components/ui/PageHeader.tsx`
- Optional adjust: `src/pages/ContactPage.tsx`

**Steps:**
1. Improve mobile text hierarchy and spacing density.
2. Standardize control heights and touch targets.
3. Fix gradient text contrast in shared header primitive.

**Verification:**
- `bunx playwright screenshot --viewport-size="390,844" --full-page http://127.0.0.1:4173/track-application /tmp/ui-track-mobile.png`
- `bunx playwright screenshot --viewport-size="390,844" --full-page http://127.0.0.1:4173/contact /tmp/ui-contact-mobile.png`

## Task 4: Runtime Warning Cleanup
**Files:**
- Modify: `src/components/ui/OptimizedImage.tsx`
- Modify: `src/components/auth/AuthLayout.tsx`

**Steps:**
1. Remove invalid DOM image prop forwarding (`fetchPriority` warning).
2. Add missing React `key` in branding feature map.

**Verification:**
- Browser console check on `/`, `/auth/signin`, `/auth/signup` for warning reduction.

## Task 5: Final Verification + Handoff
**Files:**
- Update: `docs/plans/2026-03-02-ui-cleanup-plan.md` (status)

**Steps:**
1. Run route scan script and inspect screenshots.
2. Run targeted tests (if available) for touched UI areas.
3. Mark completed tasks and note remaining follow-ups.

**Verification Commands:**
- `bunx vitest run tests/unit/scrollReveal.test.tsx tests/unit/optimizedImage.test.tsx`
- `bunx vitest run tests/unit/Button.test.tsx tests/unit/ApplicationCard.test.tsx`

## Execution Log
- 2026-03-02: Completed issue scan and documented requirements/design/plan.
- 2026-03-02: Fixed root landing visibility defect by wiring `StaggerReveal` -> `StaggerItem` visibility state.
- 2026-03-02: Added above-the-fold hero image media with responsive sources and priority loading.
- 2026-03-02: Improved public tracker readability/touch sizing and gradient header contrast.
- 2026-03-02: Removed `fetchPriority` DOM prop warning and fixed missing React key warning in auth branding panel.
- 2026-03-02: Verification done for unit tests; browser re-scan blocked by current sandbox inability to bind local dev port (`listen EPERM`).

## Next Session Resume Notes
1. Open this file first and continue from first unchecked task.
2. Re-run targeted Playwright screenshots before new edits to re-baseline.
3. If network is available, run Lighthouse:
   - `bunx lighthouse http://127.0.0.1:4173/ --output=json --output-path=/tmp/lh-home-mobile.json --only-categories=performance,accessibility,best-practices,seo`
