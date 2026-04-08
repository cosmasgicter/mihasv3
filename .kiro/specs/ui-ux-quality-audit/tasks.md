# Implementation Plan: UI/UX Quality Audit

## Overview

This plan implements a comprehensive UI/UX quality audit for `apps/admissions/`. The work is sequenced so that foundational components (ButtonSpinner, skeletons, useStyleInjection) are created first, then consumers are migrated in logical batches, and finally configuration and polish changes are applied. All changes are frontend-only — no backend modifications.

Test command: `cd apps/admissions && bun run test`

## Tasks

- [ ] 1. Extract ButtonSpinner and create skeleton page components
  - [ ] 1.1 Create `ButtonSpinner` component at `src/components/ui/ButtonSpinner.tsx`
    - Extract `UnifiedSpinner` (SVG spinner + static reduced-motion fallback) from `UnifiedLoader.tsx` into a standalone component
    - Export `ButtonSpinner` with `size` (`'sm' | 'md' | 'lg'`) and `className` props
    - _Requirements: 1b.3, 1b.4_

  - [ ] 1.2 Update `Button.tsx` to import from `ButtonSpinner` instead of `UnifiedLoader`
    - Change `import { UnifiedSpinner } from './UnifiedLoader'` to `import { ButtonSpinner } from './ButtonSpinner'`
    - Replace all `<UnifiedSpinner>` usages with `<ButtonSpinner>` inside Button
    - _Requirements: 1b.3_

  - [ ] 1.3 Add `DashboardSkeleton`, `AuthSkeleton`, and `WizardSkeleton` to `src/components/ui/skeleton.tsx`
    - `DashboardSkeleton`: Extract the inline skeleton JSX from `Dashboard.tsx` `isInitialLoading` block into a reusable component
    - `AuthSkeleton`: Mimic AuthLayout structure (centered card, logo placeholder, heading, 2–3 input skeletons, button)
    - `WizardSkeleton`: Mimic wizard layout (progress bar, step title, form area with field skeletons, nav buttons, sidebar checklist)
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ]* 1.4 Write property test for skeleton type mapping (Property 11)
    - **Property 11: Skeleton type mapping returns correct component**
    - For each `SkeletonType` value, verify `getSkeletonFallback` returns the correct skeleton component
    - **Validates: Requirements 13.4, 13.5, 13.6**

  - [ ] 1.5 Wire skeleton fallbacks into route Suspense boundaries
    - Create `getSkeletonFallback(type?: SkeletonType)` function mapping skeleton types to components
    - Update `App.tsx` route rendering to use `getSkeletonFallback(route.skeletonType)` as Suspense fallback
    - _Requirements: 13.4, 13.5, 13.6_

- [ ] 2. Checkpoint — Verify ButtonSpinner and skeletons
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Create `useStyleInjection` hook and migrate SmoothUI components
  - [ ] 3.1 Create `src/hooks/useStyleInjection.ts`
    - Implement module-level `Map<string, { element: HTMLStyleElement; refCount: number }>` registry
    - On mount: create `<style data-style-key={key}>` in `<head>` if new, or increment refCount
    - On unmount: decrement refCount, remove `<style>` element when refCount reaches 0
    - _Requirements: 9.1, 9.2_

  - [ ]* 3.2 Write property test for style deduplication (Property 7)
    - **Property 7: Style injection deduplicates across multiple component instances**
    - Render N (1–10) instances sharing the same style key, verify exactly one `<style>` element exists; verify cleanup on unmount
    - **Validates: Requirements 9.1, 9.2**

  - [ ] 3.3 Migrate SmoothUI components to use `useStyleInjection`
    - `text-effect.tsx`: Replace inline `<style>` with `useStyleInjection('text-effect', css)`
    - `text-rotate.tsx`: Replace inline `<style>` with `useStyleInjection('text-rotate', css)`
    - `shiny-text.tsx`: Replace inline `<style>` with `useStyleInjection('shiny-text-shimmer', css)`
    - `infinite-grid.tsx`: Replace inline `<style>` with `useStyleInjection('infinite-grid-scroll-{cellSize}', css)` (key includes cellSize)
    - _Requirements: 9.1, 9.2_

- [ ] 4. Replace UnifiedLoader imports — Auth pages and shared UI components
  - [ ] 4.1 Migrate auth pages: `SignInPage.tsx`, `SignUpPage.tsx`, `AuthCallbackPage.tsx`
    - Remove `UnifiedLoader` imports, replace overlay loading states with `AuthSkeleton` or remove
    - _Requirements: 1.2, 1b.2, 1b.5_

  - [ ] 4.2 Migrate shared UI wrapper components
    - `LoadingOverlay.tsx`: Replace `UnifiedLoader` with skeleton-based overlay or `ButtonSpinner`
    - `LoadingSpinner.tsx`: Replace `UnifiedLoader`/`UnifiedSpinner` with `ButtonSpinner`
    - `LoadingFallback.tsx`: Replace `UnifiedLoader` with appropriate skeleton component
    - `LoadingButton.tsx`: Replace `UnifiedSpinner` with `ButtonSpinner`
    - `InlineLoader.tsx`: Replace `UnifiedSpinner` with `ButtonSpinner`
    - `AuthLoadingOverlay.tsx`: Replace `UnifiedSpinner` with `ButtonSpinner`
    - `GuardInlineSkeleton.tsx`: Replace `UnifiedLoader` with `Skeleton` primitives
    - `EnhancedFileUpload.tsx`: Replace `UnifiedSpinner` with `ButtonSpinner`
    - _Requirements: 1b.2, 1b.5_

- [ ] 5. Replace UnifiedLoader imports — Wizard and student pages
  - [ ] 5.1 Migrate wizard: `applicationWizard/index.tsx`, `SubmissionSuccess.tsx`
    - Replace `UnifiedLoader` in wizard `authLoading`/`restoringDraft` states with `WizardSkeleton`
    - Replace `UnifiedLoader` in `SubmissionSuccess.tsx` with `ButtonSpinner` or skeleton
    - _Requirements: 1.3, 1b.2_

  - [ ] 5.2 Migrate student pages: `NotificationSettings.tsx`, `ApplicationStatus.tsx`, `Payment.tsx`, `Interview.tsx`, `Settings.tsx`, `ApplicationDetail.tsx`
    - Remove `UnifiedLoader` imports, replace with `SkeletonCard` or `Skeleton` primitives
    - _Requirements: 1b.2, 1b.5_

- [ ] 6. Replace UnifiedLoader imports — Admin pages and components
  - [ ] 6.1 Migrate admin pages: `Dashboard.tsx`, `Applications.tsx`, `Settings.tsx`, `Programs.tsx`, `Intakes.tsx`, `AuditTrail.tsx`, `ProgramFees.tsx`
    - Remove `UnifiedLoader` imports, replace with `DashboardSkeleton` or inline `Skeleton` primitives
    - _Requirements: 1b.2, 1b.5_

  - [ ] 6.2 Migrate admin components: `CommunicationHistory.tsx`, `UserActivityLog.tsx`, `EnhancedApplicationsManager.tsx`, `UserPermissions.tsx`, `EmailNotifications.tsx`, `ReportsGenerator.tsx`
    - Remove `UnifiedLoader`/`UnifiedSpinner` imports, replace with `Skeleton` primitives or `ButtonSpinner`
    - _Requirements: 1b.2, 1b.5_

  - [ ] 6.3 Migrate admin application components: `ApplicationsTable.tsx`, `ApplicationDetailModal.tsx`, `ApplicationCard.tsx`, `ApplicationApprovalActions.tsx`, `StatusHistoryTab.tsx`, `GradesTab.tsx`, `DocumentsTab.tsx`
    - Remove `UnifiedLoader`/`UnifiedSpinner` imports, replace with `Skeleton` primitives or `ButtonSpinner`
    - _Requirements: 1b.2, 1b.5_

  - [ ] 6.4 Migrate `App.tsx` Suspense fallback
    - Replace `UnifiedLoader` import with `getSkeletonFallback` usage
    - _Requirements: 1b.2, 13.4_

- [ ] 7. Delete `UnifiedLoader.tsx` and verify zero references
  - Delete `src/components/ui/UnifiedLoader.tsx`
  - Verify no remaining imports of `UnifiedLoader` or `UnifiedSpinner` in any `.tsx` or `.ts` file
  - _Requirements: 1b.1, 1b.5_

- [ ] 8. Checkpoint — Verify UnifiedLoader removal
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Focus indicator unification
  - [ ] 9.1 Update `interactive-feedback.css` global focus rules
    - Change `*:focus-visible` from `outline-blue-600 ring-blue-600` to `outline-none ring-2 ring-ring ring-offset-2`
    - Update `input:focus-visible`, `textarea:focus-visible`, `select:focus-visible` to use `ring-ring` instead of `ring-blue-600`
    - Update `[tabindex]:focus-visible` to use `ring-ring` instead of `outline-blue-600`
    - Change `.focus-ring-input` from `focus:ring-blue-600` to `focus-visible:ring-ring`
    - Change `.keyboard-focus` from `outline-blue-600` to `outline-ring` or remove in favor of the global rule
    - _Requirements: 3.1, 3.2, 3.6_

  - [ ] 9.2 Replace legacy `focus:ring-blue-500` / `focus:ring-blue-600` patterns in admin components
    - Batch 1 — Filter/search components: `FiltersPanel.tsx`, `ApplicationsFilters.tsx`, `AdminSearchBar.tsx`, `EnhancedApplicationsManager.tsx`
    - Batch 2 — Table/card components: `EnhancedApplicationsTable.tsx`, `ApplicationsTable.tsx`, `ApplicationsCards.tsx`, `ApplicationCard.tsx`
    - Batch 3 — Form/dialog components: `BulkUserOperations.tsx`, `UserExport.tsx`, `RegulatoryGuidelinesTable.tsx`
    - Batch 4 — Application feature components: `EligibilityDashboard.tsx`, `EligibilityChecker.tsx`
    - Replace all `focus:ring-2 focus:ring-blue-500` and `focus:ring-2 focus:ring-blue-600` with `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none`
    - _Requirements: 3.2, 3.4_

- [ ] 10. Color contrast and heading hierarchy fixes
  - [ ] 10.1 Fix color contrast in `shape-landing-hero.tsx`
    - Change `text-white/80` on small text (ShinyText brand accent, overlay caption) to `text-white/90` or `text-white`
    - Add a contrast audit comment block documenting each foreground/background pair with computed ratios
    - _Requirements: 2.1, 2.3, 2.4_

  - [ ] 10.2 Fix heading hierarchy on Landing Page sections
    - Verify h1 is used only for hero headline, h2 for section titles, h3 for card titles
    - Fix any heading level skips in `FeaturesSection`, `AccreditationSection`, `ProgramsSection`, `CTASection`
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 10.3 Add dev-mode heading hierarchy validation to `PageShell.tsx`
    - Integrate `validateHeadingHierarchy` from `accessibility-utils.ts` as a development-only `useEffect` that logs console warnings
    - _Requirements: 4.6_

  - [ ]* 10.4 Write property tests for contrast and heading utilities (Properties 2, 3)
    - **Property 2: suggestAccessibleColor always returns a WCAG-compliant color**
    - Generate random hex colors, verify returned color has contrast ratio ≥ 4.5 against background
    - **Validates: Requirements 2.1, 2.5**
    - **Property 3: Heading hierarchy validation is correct**
    - Generate random arrays of heading levels (1–6), verify `validateHeadingHierarchy` matches specification rules
    - **Validates: Requirements 4.1, 4.2, 4.6**

- [ ] 11. Enhance EmptyState and ErrorDisplay components
  - [ ] 11.1 Add `secondaryAction` and `headingLevel` props to `EmptyState.tsx`
    - Add optional `secondaryAction: { label: string; onClick: () => void }` prop
    - Add optional `headingLevel: 'h2' | 'h3'` prop (default `'h3'`), render heading with correct HTML tag
    - _Requirements: 6.4, 6.5_

  - [ ] 11.2 Add `onGoBack` and `supportUrl` props to `ErrorDisplay.tsx`
    - Add optional `onGoBack: () => void` prop — renders "Go Back" button when `onRetry` is absent
    - Add optional `supportUrl: string` prop (default `'/contact'`) — renders "Contact Support" link
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 11.3 Write property tests for EmptyState and ErrorDisplay (Properties 5, 6)
    - **Property 5: EmptyState renders according to prop contract**
    - Verify heading tag matches `headingLevel` prop; verify secondary button presence matches `secondaryAction` prop
    - **Validates: Requirements 6.4, 6.5**
    - **Property 6: ErrorDisplay supportUrl defaults and overrides correctly**
    - Verify default `/contact` link; verify custom URL; verify onGoBack vs onRetry rendering
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [ ] 12. Checkpoint — Verify accessibility and component enhancements
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Form accessibility, wizard fieldsets, and keyboard navigation
  - [ ] 13.1 Add `<fieldset>`/`<legend>` wrappers to wizard step components
    - Wrap related fields in `BasicKycStep`, `EducationStep`, `PaymentStep`, `SubmitStep` with `<fieldset>` and descriptive `<legend>` elements
    - _Requirements: 5.1_

  - [ ] 13.2 Add error summary with focus management to wizard
    - When validation fails, display error summary at top of form listing all errors with links to focus corresponding fields
    - Move keyboard focus to first errored field on validation failure
    - _Requirements: 5.2, 5.3_

  - [ ]* 13.3 Write property test for form error aria-live (Property 4)
    - **Property 4: Form error messages are announced via aria-live**
    - Render Input with random non-empty error string, assert `role="alert"` on error element
    - **Validates: Requirements 5.5, 5.6**

  - [ ]* 13.4 Write property tests for keyboard navigation (Properties 8, 9)
    - **Property 8: FocusTrap cycles focus within container**
    - Create container with N focusable elements, simulate Tab/Shift+Tab, verify wrap-around
    - **Validates: Requirements 10.2**
    - **Property 9: Arrow key navigation computes correct index**
    - Generate random currentIndex and itemCount, verify ArrowRight/ArrowLeft/Home/End produce correct index
    - **Validates: Requirements 10.4**

- [ ] 14. Configuration and print stylesheet
  - [ ] 14.1 Fix Tailwind dark mode config
    - Change `darkMode: 'media'` to `darkMode: 'class'` in `tailwind.config.js`
    - _Requirements: 14.3, 14.5_

  - [ ] 14.2 Create print stylesheet and import it
    - Create `src/styles/print.css` with `@media print` rules: hide nav/footer/toasts/animations, single-column layout, white background, black text, `@page` margins, link URL display
    - Import `print.css` in `src/index.css`
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ]* 14.3 Write property test for decorative aria-hidden (Property 10)
    - **Property 10: Decorative SmoothUI elements use aria-hidden**
    - Render `InfiniteGrid` with random props, verify root container has `aria-hidden="true"`
    - **Validates: Requirements 11.6**

- [ ] 15. Button loading state property test
  - [ ]* 15.1 Write property test for Button loading spinner (Property 1)
    - **Property 1: Button loading state renders inline spinner**
    - Render Button with random variant × size × `loading=true`, assert SVG spinner present, `aria-busy="true"`, and `disabled`
    - **Validates: Requirements 1b.3, 1b.4**

- [ ] 16. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- ButtonSpinner extraction (1.1–1.2) MUST complete before UnifiedLoader deletion (7)
- Skeleton components (1.3) MUST be created before replacing UnifiedLoader usages (4–6)
- `useStyleInjection` hook (3.1) MUST be created before migrating SmoothUI components (3.3)
- Focus indicator CSS changes (9.1–9.2) are done in a single pass
- UnifiedLoader import replacements are batched: auth pages (4), wizard + student (5), admin (6)
