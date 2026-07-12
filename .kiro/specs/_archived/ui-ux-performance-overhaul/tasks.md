# Implementation Plan: UI/UX Performance Overhaul

## Overview

Frontend-only overhaul of the MIHAS Application System. Work is organized in layers: foundation (tokens, CSS patterns) → canonical UI primitives (consolidation) → layout/navigation → page integration → performance optimization → testing. Each task builds on the previous, ending with full wiring. All code is TypeScript + React 18 + Tailwind CSS + Radix UI.

## Tasks

- [x] 1. Establish design token foundation and micro-interaction CSS patterns
  - [x] 1.1 Extend `tailwind.config.js` with missing tokens
    - Add explicit `borderRadius` tokens (none, sm, md, lg, xl, 2xl, full)
    - Add explicit `boxShadow` tokens (sm, md, lg, xl)
    - Add `transitionDuration` tokens (fast: 150ms, normal: 200ms, slow: 300ms)
    - Add animation keyframes: `dialog-in`, `backdrop-in`, `toast-in`, `toast-out`, `shimmer`
    - Add animation utilities: `animate-dialog-in`, `animate-backdrop-in`, `animate-toast-in`, `animate-toast-out`, `animate-shimmer`
    - Verify all existing semantic color tokens (primary, secondary, destructive, success, warning, info, muted, accent, skeleton, admin, link, error) have DEFAULT + foreground variants
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 Create micro-interaction CSS utility classes
    - Add `prefers-reduced-motion` global override in Tailwind CSS layer (animation-duration: 0.01ms, transition-duration: 0.01ms)
    - Define reusable class patterns: `.focus-ring` (`focus-visible:ring-2 ring-ring ring-offset-2 outline-none`), `.press-scale` (`active:scale-[0.98] transition-transform duration-[100ms]`), `.btn-hover` (`transition-colors duration-fast`), `.card-hover` (`transition-shadow duration-fast hover:shadow-md`), `.link-hover` (`transition-colors duration-[100ms]`)
    - Add these as Tailwind plugin utilities or document as className patterns in a shared constants file
    - _Requirements: 12.1, 12.2, 12.3, 12.6, 12.7_

  - [x]* 1.3 Write property tests for design token system
    - **Property 2: Animation Duration Cap** — verify all animation/transition duration tokens ≤ 300ms
    - **Property 3: Reduced Motion Compliance** — verify `prefers-reduced-motion` disables all animations
    - **Validates: Requirements 1.5, 8.2, 12.6, 12.7**

- [x] 2. Build canonical UI primitive components (consolidation)
  - [x] 2.1 Implement `UnifiedLoader` component
    - Create `src/components/ui/UnifiedLoader.tsx` with `page`, `inline`, `overlay` variants
    - Support `size` (sm, md, lg) and accessible `label` prop
    - Use CSS-only `animate-spin`, `role="status"`, `aria-label`
    - Respect `prefers-reduced-motion` (static icon fallback)
    - Export from `src/components/ui/index.ts`
    - _Requirements: 2.1, 8.6_

  - [x] 2.2 Implement canonical `ErrorDisplay` component
    - Create `src/components/ui/ErrorDisplay.tsx` with `inline` and `section` variants
    - Render error icon (`text-destructive`), title, user-friendly message, optional "Try Again" button
    - Use design token colors exclusively
    - Include `role="alert"` and `aria-live="assertive"` for error announcements
    - _Requirements: 2.2, 8.4, 8.6_

  - [x] 2.3 Implement canonical `ErrorBoundary` component
    - Create `src/components/ui/ErrorBoundary.tsx` as React error boundary
    - Support `page` and `section` levels
    - Render `ErrorDisplay` on catch with "Try Again" button that resets boundary state
    - `page` level: full-viewport error; `section` level: inline within layout
    - _Requirements: 2.2, 8.5_

  - [x] 2.4 Implement canonical `Select` component (Radix-based)
    - Create `src/components/ui/Select.tsx` using `@radix-ui/react-select`
    - Support `options` array, `value`, `onValueChange`, `placeholder`, `disabled`, `error`
    - Style with design tokens: `border-input`, `focus:ring-ring`, `rounded-md`
    - Option padding `py-3 px-4`, open animation `animate-scale-in duration-fast`
    - Keyboard navigation: arrow keys, Enter, Escape, type-ahead (Radix built-in)
    - Include `aria-label`, `aria-describedby` support
    - _Requirements: 2.3, 9.1, 9.5_

  - [x] 2.5 Implement canonical `FileUpload` component
    - Create `src/components/ui/FileUpload.tsx` consolidating all upload variants
    - Drag-and-drop zone via `react-dropzone`
    - Client-side type/size validation before upload
    - Upload progress bar with file name, size, cancel button
    - Error state: retain selected file, show retry button + error message
    - Success state: thumbnail preview (images) or file type icon (PDFs), remove/replace option
    - _Requirements: 2.4, 14.1, 14.2, 14.3, 14.4_

  - [x] 2.6 Implement `EmptyState` component
    - Create `src/components/ui/EmptyState.tsx`
    - Render centered stack: optional icon (48×48), heading, optional description, optional CTA button
    - Use design token colors, `gap-3`, `py-12` vertical padding
    - _Requirements: 8.3, 8.6_

  - [x] 2.7 Implement `AutoSaveIndicator` component
    - Create `src/components/ui/AutoSaveIndicator.tsx`
    - States: `idle` (hidden), `saving` (pulse dot + "Saving..."), `saved` (checkmark + "Saved", fades after 3s), `error` (warning icon + "Save failed" in `text-destructive`)
    - Include `aria-live="polite"` region
    - _Requirements: 6.3, 17.4_

  - [x] 2.8 Implement `Banner` component
    - Create `src/components/ui/Banner.tsx`
    - Variants: `info`, `warning`, `error`, `offline`, `pwa`
    - Full-width, fixed top, `z-50`, dismissible option
    - `role="alert"` for error/warning, `role="status"` for info/pwa
    - Design token colors, consistent padding and border-radius
    - _Requirements: 19.4, 19.5_

  - [x] 2.9 Implement `SkipLinks` component
    - Create `src/components/ui/SkipLinks.tsx`
    - Default link: `#main-content` → "Skip to main content"
    - Visually hidden until focused: `sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50`
    - Must be first focusable element in DOM
    - _Requirements: 16.6_

  - [x]* 2.10 Write property tests for canonical UI primitives
    - **Property 1: Design Token Consistency** — verify no hardcoded hex/rgb/hsl in component classNames
    - **Property 4: Interactive Element Focus Indicators** — verify `focus-visible:ring-2` on all interactive elements
    - **Property 5: Interactive Element Micro-Interactions** — verify transition + active:scale on buttons/cards
    - **Property 8: Form Input Token Consistency** — verify `border-input`, `ring-ring`, `rounded-md` on form inputs
    - **Validates: Requirements 1.1, 8.6, 9.1, 12.1, 12.2, 12.3, 15.3, 15.4, 16.2**

- [x] 3. Checkpoint — Verify foundation and primitives
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Build layout and navigation components
  - [x] 4.1 Implement `PageShell` component
    - Create `src/components/ui/PageShell.tsx`
    - `<header>` with title (`<h1>`), optional subtitle, optional actions
    - `<main id="main-content">` content area with responsive padding: `px-4` → `md:px-6` → `lg:px-8`
    - Max-width container centered on desktop (`mx-auto`)
    - Bottom padding for BottomNavigation on mobile: `pb-20 md:pb-0`
    - Mobile: full-width, actions stack vertically; Desktop: centered, actions inline
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 17.1, 17.2_

  - [x] 4.2 Implement `AuthLayout` component
    - Create `src/components/ui/AuthLayout.tsx`
    - Full-viewport centered layout (`min-h-screen flex items-center justify-center`)
    - MIHAS logo + institution name above form card
    - Form card: `max-w-md w-full mx-4`, `rounded-lg shadow-lg bg-card p-6 md:p-8`
    - Mobile: full-width card, inputs `min-h-[48px]`, submit button `min-h-[48px]`
    - _Requirements: 5.1, 5.2_

  - [x] 4.3 Implement `BottomNavigation` component
    - Create `src/components/ui/BottomNavigation.tsx`
    - Fixed bottom, `md:hidden`, 4 items (Dashboard, Applications, Notifications, Settings)
    - Active state: `text-primary bg-primary/10`; Inactive: `text-muted-foreground`
    - Badge support, safe-area padding `pb-[env(safe-area-inset-bottom)]`
    - Height `h-16`, all items `min-h-[44px]` touch targets
    - _Requirements: 4.1, 4.2_

  - [x] 4.4 Implement `ResponsiveHeader` component
    - Create `src/components/ui/ResponsiveHeader.tsx`
    - Mobile-only (`md:hidden`), fixed top, `h-14`
    - Back button (optional, `min-w-[44px] min-h-[44px]`), page title (center, truncate), user menu avatar (right)
    - Background: `bg-background/95 backdrop-blur-sm border-b border-border`
    - _Requirements: 4.5_

  - [x] 4.5 Create route-level skeleton fallbacks
    - Create `src/components/ui/skeletons/DashboardSkeleton.tsx`
    - Create `src/components/ui/skeletons/WizardSkeleton.tsx`
    - Create `src/components/ui/skeletons/AdminTableSkeleton.tsx`
    - Create `src/components/ui/skeletons/AuthSkeleton.tsx`
    - Create `src/components/ui/skeletons/DetailSkeleton.tsx`
    - Create `src/components/ui/skeletons/index.ts` exporting skeleton registry
    - Each skeleton mirrors target page layout using existing Skeleton primitives
    - Respect `prefers-reduced-motion` (disable shimmer)
    - _Requirements: 8.1, 8.2, 10.2_

  - [x] 4.6 Implement `ResponsiveTable` component
    - Create `src/components/ui/ResponsiveTable.tsx`
    - Renders `<table>` at `md:` and above with `<th scope="col">`, `<caption>` or `aria-label`
    - Below 768px: transforms to stacked card layout
    - Column `priority`: `always` (shown in card), `desktop` (table only)
    - Row click handler, empty state support, loading state
    - _Requirements: 7.3, 7.5, 15.2, 17.6_

  - [x]* 4.7 Write property tests for layout and navigation
    - **Property 9: BottomNavigation Active State** — exactly one active item, `md:hidden` present
    - **Property 10: ResponsiveHeader Title Rendering** — title rendered, back button with `aria-label` when `showBack`
    - **Property 12: PageShell Structural Invariants** — one `<h1>`, `<main>`, responsive padding, bottom padding
    - **Property 20: Table Accessibility Invariants** — `<th scope="col">`, `<caption>` or `aria-label`
    - **Property 26: Responsive Table Transformation** — card mode below 768px, table mode above
    - **Validates: Requirements 3.1, 3.5, 4.1, 4.2, 4.5, 7.3, 7.5, 17.2, 17.6**

- [x] 5. Checkpoint — Verify layout and navigation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement hooks and performance utilities
  - [x] 6.1 Implement `usePrefetch` hook
    - Create `src/hooks/usePrefetch.ts`
    - Returns `{ onMouseEnter, onFocus }` handlers that call dynamic `import()` for target route chunk
    - Cache-aware: subsequent triggers do not re-import if already cached
    - _Requirements: 10.5_

  - [x] 6.2 Implement `useScrollRestoration` hook
    - Create `src/hooks/useScrollRestoration.ts`
    - Store `window.scrollY` in an in-memory `Map<string, number>` keyed by route path
    - Restore scroll position on return navigation
    - Integrate with router wrapper for BottomNavigation tab switches
    - _Requirements: 4.6_

  - [x]* 6.3 Write property tests for hooks
    - **Property 11: Scroll Position Round Trip** — store and retrieve returns original value
    - **Property 29: Debounce Prevents Rapid Firing** — N rapid events within 300ms fire handler at most once
    - **Property 30: Prefetch Triggers on Hover/Focus** — import called exactly once, not re-called if cached
    - **Validates: Requirements 4.6, 10.5, 11.6**

- [x] 7. Integrate layout components into existing pages
  - [x] 7.1 Apply `PageShell` to all authenticated student pages
    - Wrap student dashboard, application wizard, application detail, payment, interview, settings, notification settings with `PageShell`
    - Ensure consistent title, subtitle, and actions per page
    - Verify `<main id="main-content">` and single `<h1>` per page
    - _Requirements: 3.4, 17.1, 17.2_

  - [x] 7.2 Apply `PageShell` to all admin pages
    - Wrap admin dashboard, applications, users, settings, audit trail, monitoring, intakes, programs, eligibility management, batch operations with `PageShell`
    - Ensure admin stat cards use canonical `Card` with semantic color tokens
    - Ensure admin action buttons use canonical `Button` with appropriate variants
    - _Requirements: 3.4, 15.1, 15.3, 15.6_

  - [x] 7.3 Apply `AuthLayout` to all auth pages
    - Wrap SignInPage, SignUpPage, ForgotPasswordPage, ResetPasswordPage with `AuthLayout`
    - Ensure all auth form inputs use canonical `Input` with consistent styling
    - Ensure password inputs use `PasswordInput` with 44×44px toggle touch target
    - Ensure form error messages use `aria-describedby` linkage and `text-destructive`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.4 Wire `BottomNavigation` and `ResponsiveHeader` into app shell
    - Add `BottomNavigation` to the authenticated layout (visible `md:hidden`)
    - Add `ResponsiveHeader` to the authenticated layout (visible `md:hidden`)
    - Ensure `DesktopSidebar` uses design token colors (no hardcoded values)
    - Apply `usePrefetch` to navigation links in both BottomNavigation and DesktopSidebar
    - Apply `useScrollRestoration` to router wrapper
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 15.4_

  - [x] 7.5 Wire `SkipLinks` into app shell
    - Add `SkipLinks` as first focusable element on every page
    - Ensure `PageShell` content area has `id="main-content"` target
    - _Requirements: 16.6_

  - [x] 7.6 Integrate `Banner` component for offline/PWA/insecure storage
    - Replace existing `OfflineBanner`, `InsecureStorageBanner`, `InstallBanner` with canonical `Banner`
    - Ensure consistent positioning (fixed top, z-50) and dismiss behavior
    - _Requirements: 19.4_

  - [x]* 7.7 Write property tests for page integration
    - **Property 21: Semantic HTML Heading Hierarchy** — one `<h1>` per page, no skipped heading levels
    - **Property 23: Skip Link Presence** — first focusable element is skip link targeting `#main-content`
    - **Validates: Requirements 16.6, 17.2**

- [x] 8. Checkpoint — Verify page integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Consolidate existing component consumers and update imports
  - [x] 9.1 Replace all loading variant imports with `UnifiedLoader`
    - Find and replace all imports of LoadingSpinner, EnhancedLoadingSpinner, LoadingState, LoadingFallback, LoadingOverlay, InlineLoader, Spinner, PageLoadingFallback, AuthLoadingOverlay, FancyPreloader
    - Map each usage to the appropriate `UnifiedLoader` variant (page, inline, overlay)
    - Remove deprecated loading component files
    - _Requirements: 2.1, 2.5_

  - [x] 9.2 Replace all error variant imports with canonical `ErrorDisplay`/`ErrorBoundary`
    - Find and replace imports of SimpleErrorBoundary, EnhancedErrorHandling, FormError, FormFeedback
    - Map inline errors to `ErrorDisplay` variant="inline", section errors to variant="section"
    - Map error boundaries to canonical `ErrorBoundary` with appropriate level
    - Remove deprecated error component files
    - _Requirements: 2.2, 2.5_

  - [x] 9.3 Replace all select variant imports with canonical `Select`
    - Find and replace imports of `standalone-select`, `form-select`
    - Migrate all consumers to the Radix-based `Select` component API
    - Keep `dropdown-menu.tsx` separate (action menus, different purpose)
    - Remove deprecated select component files
    - _Requirements: 2.3, 2.5_

  - [x] 9.4 Replace all file upload variant imports with canonical `FileUpload`
    - Find and replace imports of EnhancedFileUpload, SimpleFileUpload, animated-file-upload
    - Migrate all consumers to the canonical `FileUpload` component API
    - Remove deprecated file upload component files
    - _Requirements: 2.4, 2.5_

  - [x] 9.5 Replace all save indicator imports with `AutoSaveIndicator`
    - Find and replace imports of SaveNotification, SaveStatus, SaveStatusIndicator
    - Wire into application wizard auto-save hook
    - Remove deprecated save indicator files
    - _Requirements: 2.5_

  - [x] 9.6 Update `src/components/ui/index.ts` barrel export
    - Export all canonical components: UnifiedLoader, ErrorDisplay, ErrorBoundary, Select, FileUpload, EmptyState, AutoSaveIndicator, Banner, SkipLinks, PageShell, AuthLayout, BottomNavigation, ResponsiveHeader, ResponsiveTable
    - Remove all deprecated component exports
    - _Requirements: 2.6_

- [x] 10. Checkpoint — Verify consolidation (no broken imports)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Polish application wizard UX
  - [x] 11.1 Improve wizard progress indicator
    - Update `EnhancedProgressIndicator` to use design token colors
    - Show current step number + label, completed steps with checkmark, remaining steps
    - Mobile: compact horizontal layout, max 80px vertical space
    - Meet WCAG AA contrast on all step states
    - _Requirements: 6.1, 6.2_

  - [x] 11.2 Wire `AutoSaveIndicator` into wizard
    - Position in wizard card header or below progress indicator
    - Connect to existing `useAutoSave` hook status
    - _Requirements: 6.3_

  - [x] 11.3 Add wizard step transitions
    - Implement subtle crossfade or slide transition between steps (CSS-only, ≤ 200ms)
    - Provide directional context (left/right based on step direction)
    - _Requirements: 6.5_

  - [x] 11.4 Fix wizard navigation button positioning
    - Make Next/Previous buttons sticky footer on mobile (`sticky bottom-0`)
    - Primary action (Next/Submit) visually prominent
    - Ensure buttons are within thumb reach on mobile
    - _Requirements: 6.6_

  - [x] 11.5 Add wizard validation scroll-to-error
    - On validation error, scroll to first error field and focus it
    - Ensure error message is visible without additional scrolling
    - _Requirements: 6.7_
  
  - [x] 11.6 Write property tests for wizard
    - **Property 13: Wizard Progress Indicator Correctness** — correct completed/active/remaining states for any step count and current index
    - **Property 14: AutoSaveIndicator State Rendering** — correct rendering for all 4 status values, `aria-live` present
    - **Validates: Requirements 6.1, 6.3, 17.4**

- [x] 12. Polish loading, empty, and error states across all views
  - [x] 12.1 Add `EmptyState` to all list/dashboard views
    - Student dashboard (no applications), application list, notification list, payment history
    - Admin application list, user list, audit trail
    - Each with relevant icon, heading, description, and CTA where applicable
    - _Requirements: 8.3_

  - [x] 12.2 Add `ErrorDisplay` to all React Query error states
    - Replace ad-hoc error rendering with canonical `ErrorDisplay` + "Try Again" calling `refetch()`
    - Apply to student dashboard, admin dashboard, application lists, detail views
    - _Requirements: 8.4_

  - [x] 12.3 Wire route-level skeleton fallbacks into lazy routes
    - Replace generic spinner `Suspense` fallbacks with layout-matched skeletons
    - Use `DashboardSkeleton` for dashboard routes, `WizardSkeleton` for wizard, `AdminTableSkeleton` for admin tables, `AuthSkeleton` for auth pages, `DetailSkeleton` for detail views
    - Wire `LazyLoadErrorBoundary` to show `ErrorDisplay` with "Reload" on chunk load failure
    - _Requirements: 8.1, 8.5, 10.2, 10.3_

  - [x]* 12.4 Write property tests for state components
    - **Property 15: EmptyState Rendering Completeness** — heading always rendered, description/action conditional
    - **Property 16: ErrorDisplay Retry Invariant** — retry button present iff onRetry provided
    - **Property 17: FileUpload State Machine Rendering** — correct UI for each upload state
    - **Validates: Requirements 8.3, 8.4, 14.1, 14.2, 14.3, 14.4**

- [x] 13. Improve toast positioning and notification consistency
  - [x] 13.1 Fix toast positioning
    - Desktop: `top-4 right-4`, stacking downward with `gap-2`
    - Mobile: `top-4 left-4 right-4`, full-width minus padding
    - Slide-in animation: `translateY(-100%) → translateY(0)` with fade, 200ms
    - Auto-dismiss fade-out: 150ms
    - Ensure toasts don't overlap BottomNavigation (already satisfied by top positioning)
    - _Requirements: 12.5, 19.2, 19.6_

  - [x] 13.2 Ensure notification ARIA roles
    - Toast/Alert/Banner: `role="alert"` for error/warning, `role="status"` for success/info
    - Verify `aria-live` regions on toast container
    - _Requirements: 19.5_

  - [x]* 13.3 Write property tests for notifications
    - **Property 18: Notification Variant ARIA Roles** — correct role for each severity
    - **Property 19: Notification Variant Color Consistency** — design token colors, no hardcoded values
    - **Validates: Requirements 19.1, 19.3, 19.4, 19.5**

- [x] 14. Checkpoint — Verify wizard, states, and notifications
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Apply performance optimizations
  - [x] 15.1 Add `React.memo` to expensive list components
    - Wrap application list rows, user table rows, notification list items
    - Add appropriate comparison functions (compare by id, status, updatedAt)
    - _Requirements: 11.1_

  - [x] 15.2 Add `useMemo`/`useCallback` for derived data and handlers
    - Memoize filtered/sorted application lists, dashboard statistics
    - Wrap event handlers passed to memoized children with `useCallback`
    - _Requirements: 11.2_

  - [x] 15.3 Add React Query granular selectors
    - Use `select` option on queries to extract only needed data slices
    - Prevent re-renders from polling/SSE updates that don't affect the consuming component
    - _Requirements: 11.3_

  - [x] 15.4 Add debounce to search inputs and throttle to scroll handlers
    - Debounce search inputs with 300ms delay
    - Throttle scroll-based data loading to prevent excessive re-renders
    - _Requirements: 11.6_

  - [x] 15.5 Verify and optimize route-level code splitting
    - Ensure all page components use `React.lazy()` with dynamic `import()`
    - Verify main entry bundle < 200KB gzipped (React runtime, router, Zustand, React Query core, Tailwind, app shell only)
    - Add `<link rel="modulepreload">` for main entry module and critical route chunks in `index.html`
    - _Requirements: 10.1, 10.4, 20.6_

  - [x] 15.6 Optimize asset loading
    - Verify Inter font uses `font-display: swap` with system font fallback
    - Add `<link rel="preload">` for critical resources (main CSS, main JS, Inter font) in `index.html`
    - Ensure non-critical JS (service worker, PWA install) is deferred
    - Ensure vendor chunks (excel, pdf, ocr, charts) are lazy-loaded only when needed
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_ 

- [x] 16. Apply form and accessibility improvements across all pages
  - [x] 16.1 Ensure consistent form input styling
    - Audit all form inputs across auth, wizard, admin, and settings pages
    - Ensure all use canonical UI primitives with design token classes
    - Ensure minimum 44px height on touch devices, 44×44px checkbox/radio touch targets
    - Labels above inputs with 8px gap, error messages below with 4px top margin
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 16.2 Ensure keyboard accessibility across all interactive elements
    - Verify Tab order matches visual layout on all pages
    - Verify `focus-visible:ring-2 ring-ring ring-offset-2` on all interactive elements
    - Verify Escape key closes all modals, dialogs, dropdowns, toasts
    - Verify focus trapping in modals/dialogs (Radix handles this)
    - Verify wizard step navigation is keyboard-operable
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 16.3 Ensure semantic HTML and ARIA compliance
    - Verify `<main>`, `<nav>`, `<header>`, `<footer>` landmarks on all pages
    - Verify all icon-only buttons have `aria-label`
    - Verify all data tables have `<caption>` or `aria-label>`, `<th scope="col">`
    - Verify `aria-live` regions for dynamic content (toasts, auto-save, form errors)
    - _Requirements: 17.1, 17.3, 17.4, 17.5, 17.6_

  - [x]* 16.4 Write property tests for accessibility
    - **Property 6: Form Field Accessibility Invariants** — label association, `aria-required`, `aria-invalid`, `aria-describedby`
    - **Property 7: Form Input Touch Target Minimum** — min 44px height for inputs, 44×44px for checkboxes/radios
    - **Property 22: Icon-Only Button Accessibility** — `aria-label` on icon-only buttons
    - **Property 24: Escape Key Dismissal** — Escape closes overlays, returns focus
    - **Property 25: Modal Focus Trapping** — Tab cycles within modal only
    - **Validates: Requirements 5.4, 6.4, 9.2, 9.3, 9.4, 16.3, 16.4, 17.3, 17.5**

- [x] 17. Ensure responsive design across all breakpoints
  - [x] 17.1 Audit and fix responsive behavior
    - Verify no horizontal overflow at 320px, 375px, 768px, 1024px, 1280px, 1536px
    - Ensure mobile-first approach: base styles target mobile, breakpoint modifiers add desktop
    - Ensure forms stack vertically below 768px, multi-column at `md:`
    - Ensure buttons `w-full` below 768px, `w-auto` at `md:`
    - Ensure modals full-screen below 768px, centered card at `md:`
    - Ensure images/charts scale with `max-w-full` and appropriate aspect ratios
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [x] 17.2 Apply `ResponsiveTable` to admin data tables
    - Replace admin application tables, user tables, audit trail, payment history with `ResponsiveTable`
    - Configure column priorities: key columns as `always`, detail columns as `desktop`
    - _Requirements: 7.3, 15.2_

  - [x]* 17.3 Write property tests for responsive design
    - **Property 27: No Horizontal Overflow at Any Breakpoint** — scrollWidth ≤ viewport width at all breakpoints
    - **Property 28: Modal Responsive Sizing** — full-screen below 768px, centered card above
    - **Validates: Requirements 18.1, 18.5**

- [x] 18. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no deprecated component imports remain
  - Verify `src/components/ui/index.ts` exports only canonical components
  - Verify design token usage (no hardcoded hex values in component files)

## Notes
- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (30 properties across 15 test files)
- This is a frontend-only overhaul — no backend, database, or auth changes
- All animations are CSS-only (no framer-motion) to keep INP low
- Consolidation tasks (task 9) should be done carefully to avoid breaking existing consumers
