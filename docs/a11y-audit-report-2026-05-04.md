# WCAG 2.2 Accessibility Audit Report

**Platform:** MIHAS (Admissions + Jobs-Ops)  
**Date:** May 4, 2026  
**Standard:** WCAG 2.2 Level A and AA  
**Frameworks:** React 18 + TypeScript + Tailwind CSS + Radix UI (Admissions), Lucide (Jobs-Ops)  
**Auditor:** Automated static analysis + manual code review

---

## Executive Summary

| App | Critical | Major | Minor | Compliance |
|-----|----------|-------|-------|------------|
| **Admissions** | 0 | 5 | 4 | ✅ Level A compliant, ⚠️ Level AA mostly compliant |
| **Jobs-Ops** | 5 | 6 | 3 | ❌ Level A non-compliant, ❌ Level AA non-compliant |
| **Cross-App** | 0 | 2 | 1 | ⚠️ Requires attention |

**Admissions** has strong accessibility foundations — proper landmarks, skip links, ARIA live regions, form label associations, touch targets, and reduced-motion support. Remaining issues are CSS-level (focus indicators, contrast).

**Jobs-Ops** has zero accessibility implementation beyond basic semantic HTML in the shell. It needs error boundaries, ARIA landmarks with labels, focus management, form labels, focus indicators, and screen reader support across all feature pages.

---

## JOBS-OPS APP — Violations

### CRITICAL (Fix Before Release)

| # | WCAG | File | Issue |
|---|------|------|-------|
| J-1 | 2.4.7 | All interactive elements | **Zero `focus-visible` indicators anywhere in the app.** No focus rings on buttons, links, or inputs. Keyboard users cannot see where focus is. The entire app uses no `focus-visible:` Tailwind utilities. |
| J-2 | 1.3.1 | `JobsOpsShell.tsx` | **Landmarks missing `aria-label` differentiation.** Two `<aside>` elements exist (sidebar + right panel) with no `aria-label` — screen readers cannot distinguish them. `<nav>` has no `aria-label`. |
| J-3 | 4.1.2 | `JobsOpsShell.tsx:222-226` | **Command palette trigger button has no accessible name.** The button contains only a keyboard shortcut badge (`⌘K`) and text "Jump to…" but no `aria-label` describing its purpose. |
| J-4 | 4.1.2 | `JobsOpsShell.tsx:280-300` | **Right panel content has no ARIA structure.** "System pulse" and "Pinned handoff anchors" sections are plain divs with no `role`, `aria-label`, or heading association for screen readers. |
| J-5 | 2.4.3 | `JobsOpsShell.tsx:290-340` | **Command palette has no focus trap.** When opened, focus is set to the search input but Tab can escape the palette into the background. No `aria-modal`, no `role="dialog"`, no Escape key handling visible. |

### MAJOR (Fix Within Sprint)

| # | WCAG | File | Issue |
|---|------|------|-------|
| J-6 | 1.4.3 | Multiple files | **`text-muted` color contrast likely fails.** The `text-muted` class maps to a CSS variable. Without knowing the runtime value, any muted text on `bg-canvas` or white backgrounds risks failing the 4.5:1 ratio. Used extensively across all feature pages. |
| J-7 | 2.4.7 | `JobsOpsShell.tsx:313`, `JobsInboxPage.tsx:101` | **Inputs use `outline-none` without `focus-visible` replacement.** Search inputs in the command palette and jobs inbox have `outline-none` with no visible focus indicator. |
| J-8 | 4.1.3 | All feature pages | **No `aria-live` regions for dynamic content.** When data loads, filters change, or status updates occur, there are no live regions to announce changes to screen readers. |
| J-9 | 2.5.8 | `JobsOpsShell.tsx:164-190` | **Sidebar nav items may not meet 24x24 minimum target size.** Nav links use padding but no explicit min-height/min-width. Dense sidebar in collapsed state may have undersized targets. |
| J-10 | 4.1.2 | `JobsOpsShell.tsx:133-137` | **Sidebar collapse toggle missing `aria-expanded`.** The button has `aria-label` but no `aria-expanded` attribute to communicate the sidebar's current state. |
| J-11 | 1.3.1 | All feature pages | **Heading hierarchy inconsistencies.** Shell renders `<h1>` and `<h2>`, but feature pages also render `<h2>` and `<h3>` without guaranteed hierarchy. `EmptyState` and `LoadingState` components use `<h3>` regardless of context. |

### MINOR (Fix Within 2 Sprints)

| # | WCAG | File | Issue |
|---|------|------|-------|
| J-12 | 2.3.3 | All animated elements | **No `prefers-reduced-motion` support.** The `animate-rise` class and transitions have no motion-reduce variants. |
| J-13 | 3.1.1 | `index.html` | **No preloader accessibility.** Unlike admissions, the jobs-ops preloader has no `aria-live` or `aria-label`. |
| J-14 | 2.4.1 | Shell | **No skip link.** No mechanism for keyboard users to skip the sidebar navigation and jump to main content. |

---

## ADMISSIONS APP — Violations

### MAJOR (Fix Within Sprint)

| # | WCAG | File | Issue |
|---|------|------|-------|
| A-1 | 2.4.7 | `dropdown-menu.tsx`, `select.tsx` | **Dropdown and select items use `outline-none focus:bg-accent` without `focus-visible` ring.** Keyboard users see a background color change but no visible focus ring, which is insufficient for users with low vision. |
| A-2 | 1.4.3 | `AdminCommunicationsPanel.tsx`, `History.tsx` | **`text-gray-400` on light backgrounds fails contrast.** Gray-400 (#9ca3af) on white has ~2.9:1 ratio, well below the 4.5:1 threshold. Used for status labels and timestamps. |
| A-3 | 1.3.1 | `AdminCommunicationsPanel.tsx:267-276`, `CommunicationModal.tsx:297` | **Admin form inputs missing `<label>` elements.** Title, message, and subject inputs in admin communication forms lack proper label association. |
| A-4 | 1.3.1 | `applicationWizard/index.tsx` | **Wizard error messages not linked to fields via `aria-describedby`.** The `getFieldAriaDescribedBy` function is defined but not applied to form inputs in wizard steps. Errors are announced but not associated with specific fields. |
| A-5 | 2.4.3 | `applicationWizard/index.tsx:~380` | **Focus management timing after validation errors.** Focus moves to the first errored field before the error summary is fully announced. Should delay focus move by ~300ms to allow screen reader announcement. |

### MINOR (Fix Within 2 Sprints)

| # | WCAG | File | Issue |
|---|------|------|-------|
| A-6 | 1.4.3 | `tokens.colors.cjs` | **Admin border color `#858c98` has 3.39:1 contrast on white.** Passes for borders (non-text) but would fail if used as text color. Currently used correctly for borders only — monitor for misuse. |
| A-7 | 1.1.1 | `LandingPageSections.tsx:130` | **Accreditation logo alt text is generic.** Uses `"NMCZ logo"` instead of `"Nursing and Midwifery Council of Zambia (NMCZ) accreditation"`. Functional but could be more descriptive. |
| A-8 | 2.1.1 | `applicationWizard/index.tsx:~420` | **Keyboard shortcuts undocumented.** Ctrl+Arrow and Ctrl+S shortcuts exist but are not communicated to users. |
| A-9 | 1.3.1 | Multiple pages | **Heading hierarchy needs verification.** Some pages may skip heading levels (h1 → h3). Requires manual DOM inspection to confirm. |

---

## CROSS-APP — Violations

| # | WCAG | Scope | Issue |
|---|------|-------|-------|
| X-1 | 1.4.3 | Jobs-Ops | **Color system not auditable.** All jobs-ops colors use CSS custom properties without fallback values. Cannot verify contrast ratios without runtime values. |
| X-2 | 1.4.3 | Admissions | **`text-muted-foreground` (#6b7280) at 4.83:1 on white barely passes AA.** On light gray backgrounds (slate-50, slate-100), contrast drops below threshold. |
| X-3 | 4.1.3 | Admissions | **ErrorDisplay returns `null` for empty messages.** If error state is set but message is empty, no alert is shown. Should provide a fallback message. |

---

## POSITIVE FINDINGS ✅

### Admissions App (Strong Foundation)
- ✅ `<html lang="en">` present with proper viewport meta
- ✅ Skip link component (`SkipLink.tsx`) with proper focus management
- ✅ `<main>` landmark with consistent ID across layouts
- ✅ All images use `OptimizedImage` with required `alt` prop and decorative image support
- ✅ No `<div onClick>` patterns — all interactive elements use semantic HTML
- ✅ Form inputs have `aria-invalid`, `aria-required`, `aria-describedby` associations
- ✅ Error messages use `role="alert"` with `aria-live="assertive"`
- ✅ `aria-live="polite"` on loading overlays, save indicators, file upload progress, dashboard polling
- ✅ Auth forms have proper `autocomplete`, `inputMode`, and `type` attributes
- ✅ Button component meets 44px minimum touch target with `touch-manipulation`
- ✅ Tailwind config includes `motion-reduce:` variants for all animations
- ✅ No positive `tabindex` values — natural tab order preserved
- ✅ Radix UI primitives provide built-in keyboard navigation
- ✅ Admin colors documented with contrast ratios meeting AA

### Jobs-Ops App (Partial)
- ✅ `<html lang="en">` present
- ✅ Semantic landmarks exist: `<aside>`, `<nav>`, `<header>`, `<main>` in shell
- ✅ Sidebar toggle has `aria-label`
- ✅ Command palette search input has `aria-label`
- ✅ Jobs search input wrapped in `<label>` element
- ✅ No `<img>` tags (uses Lucide icons which are SVGs)
- ✅ All `onClick` handlers are on `<button>` or `<Link>` elements (no div-click anti-pattern)
- ✅ `SectionCard` uses `<section>` with `<header>` semantic structure

---

## REMEDIATION PLAN

### Priority 1 — Jobs-Ops Critical (Estimated: 8-12 hours)

| Task | Effort | Impact |
|------|--------|--------|
| Add `focus-visible:ring-2 focus-visible:ring-primary/50` to all interactive elements globally via Tailwind base layer | 1h | Unblocks keyboard navigation for all users |
| Add `aria-label` to both `<aside>` elements and `<nav>` in shell | 30m | Screen readers can distinguish landmarks |
| Add `role="dialog"`, `aria-modal="true"`, focus trap, and Escape handling to command palette | 2h | Keyboard users can use and dismiss the palette |
| Add `aria-expanded` to sidebar toggle | 15m | Screen readers announce sidebar state |
| Add `aria-live="polite"` regions to feature pages for data loading/filtering | 2h | Dynamic content changes announced |
| Add skip link component | 30m | Keyboard users can skip sidebar |
| Add `focus-visible` replacement for `outline-none` inputs | 30m | Search inputs visible to keyboard users |
| Add `prefers-reduced-motion` to `animate-rise` and transitions | 30m | Motion-sensitive users not affected |
| Add preloader accessibility to `index.html` | 15m | Screen readers announce loading state |

### Priority 2 — Admissions Major (Estimated: 4-6 hours)

| Task | Effort | Impact |
|------|--------|--------|
| Replace `focus:bg-accent` with `focus-visible:ring-2` in dropdown-menu and select components | 1h | Keyboard focus visible in dropdowns |
| Replace `text-gray-400` with `text-gray-600` in admin communications and history | 30m | Status labels readable for low-vision users |
| Add `<label>` elements to admin communication form inputs | 1h | Screen readers identify admin form fields |
| Apply `aria-describedby` from `getFieldAriaDescribedBy` to wizard step inputs | 1h | Validation errors linked to specific fields |
| Delay focus move after validation errors by 300ms | 30m | Error summary announced before focus moves |

### Priority 3 — Polish (Estimated: 2-3 hours)

| Task | Effort | Impact |
|------|--------|--------|
| Document jobs-ops CSS variable color values for contrast auditing | 30m | Enables automated contrast checking |
| Enhance accreditation logo alt text | 15m | Better context for screen reader users |
| Add keyboard shortcut help to wizard | 30m | Users discover Ctrl+Arrow shortcuts |
| Verify heading hierarchy across all pages | 1h | Clean document outline |
| Add fallback message to ErrorDisplay for empty messages | 15m | Prevents silent error states |

---

## COMPLIANCE SUMMARY

| Criterion | Admissions | Jobs-Ops |
|-----------|-----------|----------|
| **1.1.1** Non-text Content | ✅ Pass | ✅ Pass (no images) |
| **1.3.1** Info and Relationships | ⚠️ 2 issues | ❌ 3 issues |
| **1.3.5** Identify Input Purpose | ✅ Pass | N/A (no identity forms) |
| **1.4.3** Contrast (Minimum) | ⚠️ 2 issues | ❌ Cannot verify |
| **2.1.1** Keyboard | ✅ Pass | ✅ Pass |
| **2.3.3** Animation from Interactions | ✅ Pass | ❌ No motion-reduce |
| **2.4.1** Bypass Blocks | ✅ Skip link | ❌ No skip link |
| **2.4.3** Focus Order | ⚠️ 1 issue | ✅ Pass |
| **2.4.7** Focus Visible | ⚠️ 2 components | ❌ Zero focus indicators |
| **2.5.8** Target Size | ✅ 44px minimum | ⚠️ Unverified |
| **3.1.1** Language of Page | ✅ Pass | ✅ Pass |
| **3.3.1** Error Identification | ✅ Pass | N/A (no forms) |
| **4.1.2** Name, Role, Value | ✅ Pass | ❌ 3 issues |
| **4.1.3** Status Messages | ✅ Pass | ❌ No live regions |

---

## TESTING RECOMMENDATIONS

Full WCAG 2.2 validation requires manual testing with assistive technologies and expert accessibility review. This audit covers static code analysis only. Recommended next steps:

1. **Screen reader testing** with NVDA (Windows) and VoiceOver (macOS) on all critical flows
2. **Keyboard-only navigation** test of complete admissions wizard and jobs-ops inbox
3. **Color contrast verification** with browser DevTools or axe DevTools extension
4. **Touch target measurement** on mobile devices for dense admin layouts
5. **Heading hierarchy validation** with WAVE browser extension on all pages
6. **Focus order verification** by tabbing through each page end-to-end
