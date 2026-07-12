# Implementation Plan: Fix Vercel Build

## Overview

Systematically fix all broken imports causing the Vite production build to fail on Vercel (Linux, case-sensitive filesystem). Work proceeds from the barrel file outward: fix the barrel itself, then fix case-sensitivity mismatches, then create missing stub modules, then verify the build.

## Tasks

- [x] 1. Fix UI barrel file and missing re-exports
  - [x] 1.1 Add missing Tooltip sub-component re-exports to `src/components/ui/index.ts`
    - Add `TooltipProvider`, `TooltipTrigger`, `TooltipContent` exports from `./tooltip`
    - `FieldHelp.tsx` imports these from `@/components/ui` but barrel only exports `Tooltip`
    - _Requirements: 3.1, 5.1_

  - [x] 1.2 Create `src/components/ui/Spinner.tsx` stub component
    - Export `Spinner` that wraps/re-exports `LoadingSpinner` for backward compatibility
    - Referenced by `tests/property/stateVerifier.property.test.ts`
    - _Requirements: 1.1, 3.3_

- [x] 2. Fix case-sensitivity mismatches in direct imports
  - [x] 2.1 Fix `@/components/ui/button` → `@/components/ui/Button` in affected files
    - `src/components/offline/OfflineFormWrapper.tsx`
    - `src/components/admin/CacheMonitorDashboard.tsx`
    - `src/components/admin/CacheMonitor.tsx`
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Fix `@/components/ui/alert` → `@/components/ui/Alert` in affected files
    - `src/components/offline/OfflineFormWrapper.tsx`
    - `src/components/admin/RealtimeStatus.tsx`
    - _Requirements: 2.1, 2.2_

- [x] 3. Create missing stub modules for removed component libraries
  - [x] 3.1 Create `src/components/smoothui/index.tsx` stub
    - Export `PageTransition`, `ScrollReveal`, `StaggerReveal`, `StaggerItem`, `AnimatedCounter` as minimal pass-through/no-op components
    - Used by `LandingPage.tsx`, `ContactPage.tsx`
    - _Requirements: 1.1, 3.3_

  - [x] 3.2 Create `src/components/8starlabs/index.tsx` stub
    - Export `Timeline`, `TimelineItem`, `StatusIndicator`, `StatusBadge` as minimal components
    - Used by `ApplicationTimeline.tsx`, `DashboardStatusOverview.tsx`
    - _Requirements: 1.1, 3.3_

  - [x] 3.3 Create `src/components/navigation/ResponsiveHeader.tsx` and barrel
    - Export `ResponsiveHeader` component
    - Used by `LandingPage.tsx`, `ContactPage.tsx`
    - _Requirements: 1.1, 3.3_

  - [x] 3.4 Create `src/components/icons/index.ts` stub
    - Re-export `ArrowLeft`, `Mail`, `Phone`, `MapPin` from `lucide-react`
    - Used by `ContactPage.tsx`
    - _Requirements: 1.1, 3.3_

- [x] 4. Checkpoint - Run local build verification
  - Run `bunx --bun vite build` and fix any remaining resolution errors
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 4.1, 4.2_

- [ ]* 5. Write property tests for import resolution
  - [ ]* 5.1 Write property test: barrel import paths resolve with exact casing
    - **Property 1: Barrel import paths resolve with exact casing**
    - Parse barrel file, extract import paths, verify each resolves to existing file with matching case
    - **Validates: Requirements 1.1, 2.1**

  - [ ]* 5.2 Write property test: consumer imports satisfied by barrel exports
    - **Property 3: Consumer imports are satisfied by barrel exports**
    - Scan all files importing from `@/components/ui`, verify each symbol is exported by barrel
    - **Validates: Requirements 5.1**

  - [ ]* 5.3 Write property test: no duplicate barrel exports
    - **Property 4: No duplicate barrel exports**
    - Parse barrel file, collect all exported symbol names, verify uniqueness
    - **Validates: Requirements 5.3**

- [x] 6. Final checkpoint - Verify clean build
  - Run `bunx --bun vite build` one final time to confirm zero errors
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 4.1, 4.2, 4.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Stub components should be minimal — render children or return null, no complex logic
- The `smoothui` and `8starlabs` stubs are intentionally simple since those libraries are being phased out
- Case-sensitivity fixes are the highest-priority items since they're the most common cause of "works locally, fails on Vercel"
