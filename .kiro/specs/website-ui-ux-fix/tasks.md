# Implementation Plan: Website UI/UX Fix

## Overview

Incremental refactor of the MIHAS admissions portal UI components to enforce design token usage, unify loading states, fix accessibility gaps, improve mobile responsiveness, and polish form UX. All changes target existing files in `src/components/ui/` and `src/lib/`. No backend changes.

## Tasks

- [x] 1. Card component variant system
  - [x] 1.1 Add CVA-based variants (elevated, outlined, flat, interactive) to `src/components/ui/card.tsx`
    - Install `class-variance-authority` if not already present
    - Add `variant` prop with `outlined` as default, `interactive` boolean prop
    - Elevated: `bg-card shadow-md`, no border
    - Outlined: `border border-border bg-card`, no shadow
    - Flat: `bg-muted`, no border, no shadow
    - Interactive: adds `cursor-pointer hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
    - Preserve backward compatibility (no variant = outlined, same as current)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 1.2 Write property test for Card variant rendering
    - **Property 6: Card variant rendering correctness**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [x] 2. Toast semantic token migration
  - [x] 2.1 Replace hardcoded Tailwind palette colors in `src/components/ui/Toast.tsx` with semantic design tokens
    - Replace `border-green-300 bg-green-50 text-green-900` → `border-success/30 bg-success/5 text-foreground`
    - Replace `border-red-300 bg-red-50 text-red-900` → `border-destructive/30 bg-destructive/5 text-foreground`
    - Replace `border-blue-300 bg-blue-50 text-blue-900` → `border-info/30 bg-info/5 text-foreground`
    - Replace `border-yellow-300 bg-yellow-50 text-yellow-900` → `border-warning/30 bg-warning/5 text-foreground`
    - Replace icon color classes (`text-green-600`, `text-red-600`, etc.) with semantic tokens
    - Replace retry button hardcoded colors (`bg-red-100 hover:bg-red-200 text-red-800`) with semantic tokens
    - Ensure retry button meets 44px touch target minimum (add `min-h-[44px] min-w-[44px]`)
    - _Requirements: 1.3, 1.5, 6.1, 6.5_
  - [x] 2.2 Write property test for Toast ARIA roles and semantic tokens
    - **Property 3: Toast ARIA role matches toast type**
    - **Validates: Requirements 6.3, 6.4**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Status color token migration in utils
  - [x] 4.1 Replace hardcoded palette colors in `getStatusColor()` in `src/lib/utils.ts` with semantic tokens
    - Replace `bg-yellow-200 text-yellow-900 border-yellow-300` → `bg-warning/20 text-foreground border border-warning/30`
    - Replace `bg-blue-200 text-blue-900 border-blue-300` → `bg-info/20 text-foreground border border-info/30`
    - Replace `bg-green-200 text-green-900 border-green-300` → `bg-success/20 text-foreground border border-success/30`
    - Replace `bg-red-200 text-red-900 border-red-300` → `bg-destructive/20 text-foreground border border-destructive/30`
    - Replace `bg-slate-300 text-slate-900 border-slate-400` → `bg-muted text-foreground border border-border`
    - _Requirements: 1.3_

- [x] 5. PageHeader semantic token migration
  - [x] 5.1 Replace hardcoded colors in `src/components/ui/PageHeader.tsx` with semantic design tokens
    - Replace gradient variant `from-blue-600/90 to-indigo-600/85` with `bg-gradient-vibrant` token
    - Replace `text-slate-600`, `text-slate-900`, `text-purple-700` with semantic tokens
    - Replace stat accent hardcoded colors with semantic tokens
    - _Requirements: 1.3_

- [x] 6. Stepper responsive and accessibility improvements
  - [x] 6.1 Update `src/components/ui/Stepper.tsx` for responsive labels and accessibility
    - Hide step labels below `sm` breakpoint (show only step numbers)
    - Ensure step circles are 44×44px minimum touch target (`w-11 h-11`)
    - Add `role="list"` to container, `role="listitem"` to each step
    - Add `aria-current="step"` on the current step
    - Replace `bg-secondary/5` with `bg-muted` and `text-foreground/40` with `text-muted-foreground`
    - Replace `text-caption/40` with `text-muted-foreground`
    - _Requirements: 3.1, 3.2, 4.2, 1.3_

- [x] 7. UnifiedLoader timeout support
  - [x] 7.1 Add timeout message with retry to `src/components/ui/UnifiedLoader.tsx`
    - Add `timeoutMs` and `onTimeout` props to `UnifiedLoaderProps`
    - After `timeoutMs` milliseconds, show "This is taking longer than expected" message with retry button
    - Retry button calls `onTimeout` callback
    - Ensure timeout timer is cleaned up on unmount
    - _Requirements: 2.5_

- [x] 8. AutoSaveIndicator retry support
  - [x] 8.1 Add retry button to error state in `src/components/ui/AutoSaveIndicator.tsx`
    - Add `onRetry` prop to `AutoSaveIndicatorProps`
    - When `status="error"` and `onRetry` is provided, render a "Retry" button next to "Save failed"
    - Ensure retry button meets 44px touch target
    - Keep the component persistently visible during error state (don't auto-hide)
    - _Requirements: 5.1, 5.2_
  - [x] 8.2 Write property test for AutoSaveIndicator error retry
    - **Property 7: AutoSaveIndicator error state includes retry**
    - **Validates: Requirements 5.2**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Input component validation UX improvements
  - [x] 10.1 Enhance error display in `src/components/ui/input.tsx`
    - Add an error icon (AlertCircle from lucide-react) next to error text
    - Ensure error text uses `text-destructive` token consistently
    - Verify `role="alert"` is present on error messages (already exists, confirm)
    - _Requirements: 5.3, 10.4_
  - [x] 10.2 Write property test for Input error display
    - **Property 8: Input error display with destructive styling**
    - **Validates: Requirements 5.3**

- [x] 11. ErrorBoundary page-level recovery
  - [x] 11.1 Enhance `src/components/ui/ErrorBoundary.tsx` page-level variant
    - Ensure page-level ErrorBoundary renders a "Reload Page" button that calls `window.location.reload()`
    - Add friendly messaging: "Something went wrong. Please try reloading the page."
    - Ensure the error display uses destructive color tokens
    - _Requirements: 10.3_
  - [x] 11.2 Write property test for ErrorBoundary recovery UI
    - **Property 9: ErrorBoundary renders recovery UI on error**
    - **Validates: Requirements 10.3**

- [x] 12. Skeleton token consistency
  - [x] 12.1 Update `src/components/ui/skeleton.tsx` to use skeleton color tokens
    - Replace `bg-muted` with `bg-skeleton` in the base Skeleton component
    - Ensure all skeleton presets (SkeletonCard, SkeletonTable, SkeletonAvatar) use the skeleton token
    - _Requirements: 2.2_

- [x] 13. Design token enforcement property tests
  - [x] 13.1 Write property test for semantic color token enforcement across component files
    - **Property 1: Semantic color token enforcement**
    - **Validates: Requirements 1.3, 1.5, 2.2, 6.1, 10.4**
  - [x] 13.2 Write property test for border-radius and box-shadow token enforcement
    - **Property 2: Design token enforcement for radius and shadow**
    - **Validates: Requirements 1.1, 1.2**
  - [x] 13.3 Write property test for animation duration token enforcement
    - **Property 10: Animation duration token enforcement**
    - **Validates: Requirements 9.1**
  - [x] 13.4 Write property test for animation keyframes using only transform and opacity
    - **Property 11: Animation keyframes use only transform and opacity**
    - **Validates: Requirements 9.2**

- [x] 14. Accessibility property tests
  - [x] 14.1 Write property test for touch target minimum on interactive elements
    - **Property 4: Interactive elements meet touch target minimum**
    - **Validates: Requirements 3.1, 6.5**
  - [x] 14.2 Write property test for focus ring consistency
    - **Property 5: Focus ring consistency on interactive elements**
    - **Validates: Requirements 3.2**
  - [x] 14.3 Write property test for reduced motion support
    - **Property 12: Reduced motion support**
    - **Validates: Requirements 9.3**
  - [x] 14.4 Write property test for bottom navigation item limit
    - **Property 13: Bottom navigation item limit**
    - **Validates: Requirements 4.3**

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- All changes are backward-compatible — existing component APIs are preserved
- No backend or database changes required
