# UI/UX Quality Audit — Verification Prompt

Use this prompt with another LLM (Claude, GPT-4, Gemini, etc.) that has access to the codebase to audit the completed UI/UX quality audit work. Paste this entire document as the prompt.

---

## Context

A comprehensive UI/UX quality audit was completed on `apps/admissions/` in a React 18 + TypeScript + Tailwind CSS + Vite monorepo. The audit covered 15 requirement areas across loading states, accessibility, animation performance, and configuration. All changes are frontend-only.

The spec documents are at:
- `.kiro/specs/ui-ux-quality-audit/requirements.md` — 15 requirements with acceptance criteria
- `.kiro/specs/ui-ux-quality-audit/design.md` — architecture, components, interfaces, correctness properties
- `.kiro/specs/ui-ux-quality-audit/tasks.md` — 16 task groups with sub-tasks

## Your Job

Audit the implementation against every requirement and acceptance criterion. For each check, report PASS, FAIL, or PARTIAL with a brief explanation. At the end, provide a summary of any gaps or regressions.

## Verification Checklist

### 1. Loading State Consistency (Req 1, 1b, 13)

**Files to check:**
- `apps/admissions/src/components/ui/ButtonSpinner.tsx` — exists, exports ButtonSpinner with size/className props
- `apps/admissions/src/components/ui/Button.tsx` — imports ButtonSpinner (not UnifiedLoader/UnifiedSpinner)
- `apps/admissions/src/components/ui/skeleton.tsx` — exports DashboardSkeleton, AuthSkeleton, WizardSkeleton
- `apps/admissions/src/components/ui/skeletons/` — separate skeleton component files if they exist
- `apps/admissions/src/App.tsx` — has getSkeletonFallback function, uses it in Suspense fallbacks

**Verification commands:**
```bash
# Verify UnifiedLoader is deleted
ls apps/admissions/src/components/ui/UnifiedLoader.tsx 2>&1
# Should return "No such file or directory"

# Verify zero imports of UnifiedLoader/UnifiedSpinner in source
grep -r "UnifiedLoader\|UnifiedSpinner" apps/admissions/src/ --include="*.tsx" --include="*.ts" -l
# Should return nothing (or only a JSDoc comment in ButtonSpinner.tsx)

# Verify zero imports in test files
grep -r "from.*UnifiedLoader" apps/admissions/tests/ --include="*.tsx" --include="*.ts" -l
# Should return nothing
```

**Acceptance criteria to verify:**
- [ ] AC 1.1: App uses only two loading patterns: HTML preloader + skeletons
- [ ] AC 1b.1: UnifiedLoader.tsx is deleted
- [ ] AC 1b.2: All imports removed and replaced
- [ ] AC 1b.3: ButtonSpinner extracted with size/className props
- [ ] AC 1b.4: Button loading=true shows inline spinner with aria-busy
- [ ] AC 1b.5: Zero references to UnifiedLoader in any file
- [ ] AC 13.1: DashboardSkeleton component exists
- [ ] AC 13.2: AuthSkeleton component exists
- [ ] AC 13.3: WizardSkeleton component exists
- [ ] AC 13.4-6: Route Suspense fallbacks use getSkeletonFallback with correct mapping

### 2. Color Contrast (Req 2)

**Files to check:**
- `apps/admissions/src/components/smoothui/shape-landing-hero.tsx` — contrast audit comment block, no text-white/80 on small text
- `apps/admissions/src/components/auth/AuthLayout.tsx` — no text-white/70 on small text
- `apps/admissions/src/components/ui/PageHeader.tsx` — no text-white/80 on small text
- `apps/admissions/src/pages/public/tracker/components/ApplicationStatusHeader.tsx` — no text-white/80 on small text

**Verification commands:**
```bash
# Check for remaining low-opacity white text on small elements
grep -rn "text-white/[67]0" apps/admissions/src/ --include="*.tsx"
# Should return nothing or only on large text / icons

grep -rn "text-white/80" apps/admissions/src/ --include="*.tsx"
# Remaining instances should only be on large text (text-base+) or icons, not text-xs/text-sm
```

**Acceptance criteria to verify:**
- [ ] AC 2.1: Hero text meets 4.5:1 contrast for normal text, 3:1 for large text
- [ ] AC 2.3: No text-white/80 on small text in hero
- [ ] AC 2.4: Contrast audit comment block in shape-landing-hero.tsx

### 3. Focus Indicator Unification (Req 3)

**Files to check:**
- `apps/admissions/src/styles/interactive-feedback.css` — global focus rules use ring-ring token
- All admin components listed in task 9.2

**Verification commands:**
```bash
# Check for any remaining legacy focus:ring-blue patterns
grep -rn "focus:ring-blue" apps/admissions/src/ --include="*.tsx" --include="*.ts" --include="*.css"
# Should return ZERO results

# Verify the global rule uses ring-ring
grep "focus-visible" apps/admissions/src/styles/interactive-feedback.css | head -5
```

**Acceptance criteria to verify:**
- [ ] AC 3.1: Single focus pattern: focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
- [ ] AC 3.2: All legacy focus:ring-blue-500/600 patterns replaced
- [ ] AC 3.4: Only focus-visible (not focus:) for ring display
- [ ] AC 3.6: interactive-feedback.css uses ring token, not hardcoded blue-600

### 4. Heading Hierarchy (Req 4)

**Files to check:**
- `apps/admissions/src/pages/LandingPage.tsx` — h1 in hero, h2 for sections, h3 for cards
- `apps/admissions/src/components/ui/PageShell.tsx` — dev-mode heading validation useEffect

**Verification commands:**
```bash
# Check heading tags in landing page sections
grep -n "<h[1-6]" apps/admissions/src/pages/LandingPage.tsx
# Should show h1 only in hero, h2 for section titles

# Verify PageShell has heading validation
grep -n "validateHeadingHierarchy\|extractHeadingLevels" apps/admissions/src/components/ui/PageShell.tsx
```

**Acceptance criteria to verify:**
- [ ] AC 4.1: Exactly one h1 per page view
- [ ] AC 4.2: No heading level skips
- [ ] AC 4.3: Landing page: h1 hero, h2 sections, h3 cards
- [ ] AC 4.6: Dev-mode heading hierarchy validation in PageShell

### 5. Form Accessibility (Req 5)

**Files to check:**
- `apps/admissions/src/pages/student/applicationWizard/steps/BasicKycStep.tsx` — fieldset/legend
- `apps/admissions/src/pages/student/applicationWizard/steps/EducationStep.tsx` — fieldset/legend
- `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx` — fieldset/legend
- `apps/admissions/src/pages/student/applicationWizard/steps/SubmitStep.tsx` — fieldset/legend
- `apps/admissions/src/pages/student/applicationWizard/components/WizardErrorSummary.tsx` — error summary component
- `apps/admissions/src/pages/student/applicationWizard/index.tsx` — error summary integration

**Verification commands:**
```bash
# Verify fieldset/legend in wizard steps
grep -l "fieldset\|legend" apps/admissions/src/pages/student/applicationWizard/steps/*.tsx
# Should list all 4 step files

# Verify WizardErrorSummary exists
ls apps/admissions/src/pages/student/applicationWizard/components/WizardErrorSummary.tsx

# Verify error summary is used in wizard index
grep "WizardErrorSummary\|validationErrors" apps/admissions/src/pages/student/applicationWizard/index.tsx | head -5
```

**Acceptance criteria to verify:**
- [ ] AC 5.1: Wizard steps wrapped in fieldset with descriptive legend
- [ ] AC 5.2: Error summary displayed at top of form on validation failure
- [ ] AC 5.3: Focus moves to first errored field on validation failure

### 6. EmptyState Polish (Req 6)

**File to check:** `apps/admissions/src/components/ui/EmptyState.tsx`

**Acceptance criteria to verify:**
- [ ] AC 6.4: secondaryAction prop exists and renders secondary button
- [ ] AC 6.5: headingLevel prop exists (default 'h3'), renders correct HTML tag

### 7. Error Recovery UX (Req 7)

**File to check:** `apps/admissions/src/components/ui/ErrorDisplay.tsx`

**Acceptance criteria to verify:**
- [ ] AC 7.1: Shows Retry button + description + Contact Support link on network error
- [ ] AC 7.2: Shows Go Back button when onGoBack provided and onRetry absent
- [ ] AC 7.3: supportUrl prop defaults to /contact

### 8. Animation Performance (Req 9)

**Files to check:**
- `apps/admissions/src/hooks/useStyleInjection.ts` — module-level Map registry, ref-counted
- `apps/admissions/src/components/smoothui/text-effect.tsx` — uses useStyleInjection
- `apps/admissions/src/components/smoothui/text-rotate.tsx` — uses useStyleInjection
- `apps/admissions/src/components/smoothui/shiny-text.tsx` — uses useStyleInjection
- `apps/admissions/src/components/smoothui/infinite-grid.tsx` — uses useStyleInjection with dynamic key

**Verification commands:**
```bash
# Verify no inline <style> tags remain in SmoothUI components
grep -n "<style>" apps/admissions/src/components/smoothui/*.tsx
# Should return ZERO results

# Verify useStyleInjection is imported
grep "useStyleInjection" apps/admissions/src/components/smoothui/*.tsx
# Should show imports in all 4 files
```

**Acceptance criteria to verify:**
- [ ] AC 9.1: No inline <style> tags on every render
- [ ] AC 9.2: Style deduplication via shared registry

### 9. Configuration (Req 14, 15)

**Files to check:**
- `apps/admissions/tailwind.config.js` — darkMode: 'class'
- `apps/admissions/src/styles/print.css` — @media print rules
- `apps/admissions/src/index.css` — imports print.css

**Verification commands:**
```bash
# Verify darkMode
grep "darkMode" apps/admissions/tailwind.config.js
# Should show: darkMode: 'class'

# Verify print stylesheet exists and has required rules
grep -c "@media print\|@page\|background: white\|color: black" apps/admissions/src/styles/print.css

# Verify print.css is imported
grep "print.css" apps/admissions/src/index.css
```

**Acceptance criteria to verify:**
- [ ] AC 14.3: darkMode: 'class' (not 'media')
- [ ] AC 15.1: Print stylesheet exists and is imported
- [ ] AC 15.2: Hides nav/footer/toasts/animations in print
- [ ] AC 15.5: White background, black text in print
- [ ] AC 15.6: @page margins set

### 10. Property Tests (11 correctness properties)

**Test files to check:**
```
apps/admissions/tests/property/button-loading-spinner.property.test.tsx    — Property 1
apps/admissions/tests/property/contrast-heading.property.test.ts           — Properties 2, 3
apps/admissions/tests/property/form-error-aria.property.test.tsx           — Property 4
apps/admissions/tests/property/emptystate-errordisplay.property.test.tsx   — Properties 5, 6
apps/admissions/tests/property/style-injection.property.test.tsx           — Property 7
apps/admissions/tests/property/keyboard-navigation.property.test.tsx       — Properties 8, 9
apps/admissions/tests/property/decorative-aria-hidden.property.test.tsx    — Property 10
apps/admissions/tests/property/skeleton-mapping.property.test.tsx          — Property 11
```

**Verification command:**
```bash
cd apps/admissions && npx vitest run tests/property/button-loading-spinner.property.test.tsx tests/property/contrast-heading.property.test.ts tests/property/emptystate-errordisplay.property.test.tsx tests/property/form-error-aria.property.test.tsx tests/property/style-injection.property.test.tsx tests/property/keyboard-navigation.property.test.tsx tests/property/decorative-aria-hidden.property.test.tsx tests/property/skeleton-mapping.property.test.tsx
```

**Acceptance criteria to verify:**
- [ ] All 8 test files exist
- [ ] All tests pass
- [ ] Each test uses fast-check with minimum 100 iterations
- [ ] Each test file has the Feature/Property comment header

### 11. Screen Reader & Accessibility Regressions

**Spot-check these files for aria attributes:**
- `apps/admissions/src/components/smoothui/infinite-grid.tsx` — aria-hidden="true" on root
- `apps/admissions/src/components/ui/Toast.tsx` — aria-live regions (assertive for errors, polite for success)
- `apps/admissions/src/components/ui/input.tsx` — role="alert" on error messages, aria-invalid, aria-describedby

## Output Format

For each section above, report:

```
### Section Name
- AC X.Y: PASS | FAIL | PARTIAL — brief explanation
- AC X.Z: PASS | FAIL | PARTIAL — brief explanation
```

At the end, provide:

```
### Summary
- Total ACs checked: N
- Passed: N
- Failed: N
- Partial: N
- Gaps found: [list any missing or incomplete items]
- Regressions found: [list any broken existing functionality]
- Recommendations: [list any suggested follow-up work]
```
