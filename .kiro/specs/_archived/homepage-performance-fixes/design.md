# Homepage Performance Fixes — Bugfix Design

## Overview

Two bugs degrade the landing page experience on the MIHAS admissions platform:

1. **Eager Dashboard Prefetch (CRITICAL)**: `RoutePrefetcher` in `App.tsx` unconditionally schedules `import('@/pages/student/Dashboard')` after 4 seconds on every route — including the public landing page. This pulls in 35+ transitive dependencies (SSE client, PDF generation, payment status, profile hooks, interviews, animations) that are irrelevant to unauthenticated visitors, causing ~17.5 seconds of cumulative blocking time on mobile networks.

2. **Accreditation Logo 0×0 Rendering (HIGH)**: The `<picture>` element in `OptimizedImage` is inline by default and has no sizing, so it doesn't inherit the parent container's `h-12 w-12` / `h-16 w-16` constraints. Additionally, the component's default `h-auto` class on `<img>` conflicts with the caller's `h-full`, resulting in zero rendered dimensions for the four accreditation logos.

The fix strategy is minimal and targeted: make `RoutePrefetcher` route-aware (skip Dashboard prefetch on marketing routes), and fix `OptimizedImage`'s `<picture>` element to be block-level with full sizing while removing the conflicting `h-auto` default.

## Glossary

- **Bug_Condition (C)**: The condition that triggers each bug — C₁: RoutePrefetcher running on a marketing/public route; C₂: OptimizedImage rendered inside a sized parent with caller-provided `h-full w-full` classes
- **Property (P)**: The desired behavior — P₁: no Dashboard chunk loaded on public routes; P₂: `<picture>` renders as block with inherited dimensions
- **Preservation**: Existing behaviors that must remain unchanged — prefetch on auth routes, Dashboard functionality, OptimizedImage in non-full-size contexts, error fallback UI
- **RoutePrefetcher**: The component in `apps/admissions/src/App.tsx` (lines 95–110) that eagerly imports route chunks during idle time
- **OptimizedImage**: The component in `apps/admissions/src/components/ui/OptimizedImage.tsx` that wraps `<img>` in a `<picture>` element with WebP support and error fallback
- **isMarketingPublicRoute**: Function in `apps/admissions/src/lib/publicRouteMode.ts` that returns `true` for `/`, `/404`, `/contact`, `/privacy`, `/terms`, `/track-application`

## Bug Details

### Bug Condition

**Bug 1 — Eager Dashboard Prefetch on Landing Page**

The bug manifests when `RoutePrefetcher` renders on any route (it is always mounted in `RouteAwareApp`). It unconditionally schedules `import('@/pages/student/Dashboard')` after a 4-second `setTimeout`, regardless of whether the current route is public or authenticated. On marketing routes, this prefetch is wasteful and harmful.

**Bug 2 — Accreditation Logo 0×0 Rendering**

The bug manifests when `OptimizedImage` is rendered inside a sized parent container (e.g., `div.h-12.w-12`) and the caller passes `h-full w-full object-contain` as className. The `<picture>` element is inline by default (no display/sizing styles), so it collapses to 0×0. The component's default `h-auto` on `<img>` also overrides the caller's `h-full`.

**Formal Specification:**

```
FUNCTION isBugCondition_Prefetch(input)
  INPUT: input of type { pathname: string }
  OUTPUT: boolean

  RETURN isMarketingPublicRoute(input.pathname)
END FUNCTION
```

```
FUNCTION isBugCondition_Logo(input)
  INPUT: input of type { parentHasSizing: boolean, callerPassesFullSize: boolean }
  OUTPUT: boolean

  RETURN input.parentHasSizing AND input.callerPassesFullSize
END FUNCTION
```

### Examples

- **Bug 1, Example 1**: User visits `/` → after 4s, `import('@/pages/student/Dashboard')` fires → 78 resources loaded, 17.5s blocking time on 3G. Expected: no Dashboard prefetch on `/`.
- **Bug 1, Example 2**: User visits `/contact` → same eager prefetch fires. Expected: no Dashboard prefetch on `/contact`.
- **Bug 1, Example 3**: User visits `/student/dashboard` → Dashboard prefetch fires. Expected: this is correct and should continue working.
- **Bug 2, Example 1**: AccreditationSection renders `<OptimizedImage className="h-full w-full object-contain" />` inside a `div.h-12.w-12` → logo renders at 0×0. Expected: logo renders at 48×48 (or 64×64 at `sm:`).
- **Bug 2, Example 2**: Hero section renders `<OptimizedImage />` without `h-full w-full` → image renders correctly. Expected: this should continue working unchanged.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Dashboard prefetch on authenticated routes (`/student/*`, `/admin/*`, `/dashboard`) must continue to work, ensuring fast navigation for logged-in users (Req 3.1)
- All Dashboard functionality (application list, status overview, timeline, quick actions, interviews, payment status, profile completion, realtime updates) must continue to work correctly when rendered (Req 3.2)
- `OptimizedImage` in contexts that do NOT pass `h-full w-full` (hero images, program cards) must continue to render with existing responsive behavior (`max-w-full`) (Req 3.3)
- Landing page FCP must remain under 1 second on desktop/fast networks (Req 3.4)
- All `React.lazy()` route-level code splitting must continue to work with Suspense fallback skeletons (Req 3.5)
- `OptimizedImage` error fallback (broken-image icon + alt text) must continue to display on load errors (Req 3.6)

**Scope:**
All inputs that do NOT involve marketing/public route prefetching or sized-parent + full-size-class image rendering should be completely unaffected by this fix. This includes:
- Auth shell prefetch via `requestIdleCallback` (first idle callback in `RoutePrefetcher`)
- `scheduleLikelyAuthRoutePreload` in `LandingPage.tsx` (separate from `RoutePrefetcher`)
- `OptimizedImage` usage in `shape-landing-hero.tsx` and program cards in `LandingPageSections.tsx`
- All existing Vite manual chunk splitting and build configuration

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **RoutePrefetcher is route-unaware**: The `RoutePrefetcher` component in `App.tsx` (lines 95–110) does not check the current route before scheduling the Dashboard prefetch. It uses a flat 4-second `setTimeout` with no guard. The component is mounted unconditionally inside `RouteAwareApp`, which already has access to `location.pathname` and `marketingRoute` — but `RoutePrefetcher` doesn't consume this context.

2. **`<picture>` element has no display or sizing styles**: The `OptimizedImage` component returns a bare `<picture>` element with no `className`, `style`, or display property. The HTML `<picture>` element defaults to `display: inline`, which means it does not participate in block-level sizing. When the parent `div` has `h-12 w-12`, the inline `<picture>` does not inherit those constraints.

3. **Conflicting `h-auto` default on `<img>`**: The `<img>` inside `OptimizedImage` has `className="max-w-full h-auto ${className}"`. When the caller passes `h-full w-full object-contain`, the resulting class list contains both `h-auto` and `h-full`. In Tailwind CSS, the last-defined utility in the stylesheet wins (not the last in the class attribute), and `h-auto` typically takes precedence, preventing the image from filling its parent.

4. **Dashboard.tsx has 40+ top-level imports**: `Dashboard.tsx` imports SSE client, PDF generation, payment status, profile auto-population, interviews service, slip service, animations, and many more at the module top level. When the chunk is prefetched, all these imports are eagerly evaluated, creating a massive dependency tree. This is a contributing factor to Bug 1's severity but is a secondary optimization target.

## Correctness Properties

Property 1: Bug Condition — No Dashboard Prefetch on Marketing Routes

_For any_ route where `isMarketingPublicRoute(pathname)` returns true, the fixed `RoutePrefetcher` SHALL NOT trigger `import('@/pages/student/Dashboard')`, ensuring the Dashboard chunk and its 35+ transitive dependencies are not loaded on public pages.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Picture Element Renders at Parent Dimensions

_For any_ `OptimizedImage` rendered inside a sized parent container where the caller passes `h-full w-full` classes, the fixed component SHALL render the `<picture>` element as `display: block` with `width: 100%` and `height: 100%`, and the `<img>` SHALL NOT have a conflicting `h-auto` default, so the image renders at the parent's intended dimensions.

**Validates: Requirements 2.3, 2.4**

Property 3: Preservation — Dashboard Prefetch on Authenticated Routes

_For any_ route where `isMarketingPublicRoute(pathname)` returns false (authenticated routes like `/student/*`, `/admin/*`, `/dashboard`), the fixed `RoutePrefetcher` SHALL continue to prefetch the Dashboard chunk exactly as the original implementation does, preserving fast navigation for logged-in users.

**Validates: Requirements 3.1, 3.2**

Property 4: Preservation — OptimizedImage Without Full-Size Classes

_For any_ `OptimizedImage` usage where the caller does NOT pass `h-full w-full` classes, the fixed component SHALL produce the same rendered output as the original component, preserving existing responsive behavior (`max-w-full`) and error fallback UI.

**Validates: Requirements 3.3, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/admissions/src/App.tsx`

**Component**: `RoutePrefetcher`

**Specific Changes**:
1. **Accept a `isMarketingRoute` prop** (or read from context/location): Pass the already-computed `marketingRoute` boolean from `RouteAwareApp` into `RoutePrefetcher` so it knows whether the current route is public.
2. **Guard the Dashboard prefetch**: Wrap the 4-second `setTimeout` that imports `@/pages/student/Dashboard` in a condition that only fires when `isMarketingRoute` is `false`. The auth shell prefetch via `requestIdleCallback` can remain unconditional (it's lightweight).
3. **Clean up timer on route change**: Ensure the `setTimeout` cleanup in the `useEffect` return still works correctly when the prefetch is conditionally skipped.

**File**: `apps/admissions/src/components/ui/OptimizedImage.tsx`

**Component**: `OptimizedImage`

**Specific Changes**:
4. **Make `<picture>` block-level with full sizing**: Add `className="block w-full h-full"` to the `<picture>` element so it inherits parent container dimensions. This is safe because `block w-full h-full` on a `<picture>` wrapping an `<img>` with `max-w-full` will not break layouts where the parent is unsized — the `<img>` inside still controls its own intrinsic sizing via `max-w-full`.
5. **Remove `h-auto` from `<img>` default classes**: Change the `<img>` className from `` `max-w-full h-auto ${className}` `` to `` `max-w-full ${className}` ``. This removes the conflicting `h-auto` that overrides caller-provided `h-full`. The `max-w-full` alone is sufficient for responsive behavior — images will still scale down to fit their container width without `h-auto`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior. Both bugs are frontend-only and testable with Vitest + React Testing Library + fast-check.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that render `RoutePrefetcher` on marketing routes and assert that `import('@/pages/student/Dashboard')` is called (demonstrating the bug). Write tests that render `OptimizedImage` inside a sized parent with `h-full w-full` and assert the `<picture>` element has no display/sizing styles (demonstrating the bug). Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Prefetch on Landing Page**: Render `RoutePrefetcher` with pathname `/`, advance timers by 4s, assert Dashboard import was called (will demonstrate bug on unfixed code)
2. **Prefetch on Contact Page**: Render `RoutePrefetcher` with pathname `/contact`, advance timers by 4s, assert Dashboard import was called (will demonstrate bug on unfixed code)
3. **Picture Element Inline**: Render `OptimizedImage` with `h-full w-full`, inspect `<picture>` element, assert it has no `display: block` or sizing classes (will demonstrate bug on unfixed code)
4. **Conflicting h-auto**: Render `OptimizedImage` with `className="h-full w-full"`, inspect `<img>` element, assert className contains both `h-auto` and `h-full` (will demonstrate bug on unfixed code)

**Expected Counterexamples**:
- `RoutePrefetcher` calls `import('@/pages/student/Dashboard')` regardless of current route
- `<picture>` element renders as inline with no sizing, causing 0×0 collapse
- `<img>` className contains conflicting `h-auto` and `h-full`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
// Bug 1: No Dashboard prefetch on marketing routes
FOR ALL pathname WHERE isMarketingPublicRoute(pathname) DO
  result := renderRoutePrefetcher(pathname)
  advanceTimers(4000)
  ASSERT "pages/student/Dashboard" NOT IN dynamicImports(result)
END FOR

// Bug 2: Picture element renders at parent dimensions
FOR ALL (parentSize, callerClasses) WHERE callerClasses CONTAINS "h-full w-full" DO
  rendered := renderOptimizedImage({ className: callerClasses })
  picture := rendered.querySelector("picture")
  ASSERT picture.classList.contains("block")
  ASSERT picture.classList.contains("w-full")
  ASSERT picture.classList.contains("h-full")
  img := rendered.querySelector("img")
  ASSERT NOT img.classList.contains("h-auto")
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
// Bug 1: Dashboard prefetch still works on auth routes
FOR ALL pathname WHERE NOT isMarketingPublicRoute(pathname) DO
  ASSERT prefetchBehavior_fixed(pathname) = prefetchBehavior_original(pathname)
END FOR

// Bug 2: OptimizedImage without h-full w-full still renders correctly
FOR ALL className WHERE className DOES NOT CONTAIN "h-full w-full" DO
  ASSERT renderOptimizedImage_fixed({ className }) = renderOptimizedImage_original({ className })
END FOR
```

**Testing Approach**: Property-based testing with fast-check is recommended for preservation checking because:
- It generates many route pathnames automatically to verify prefetch behavior across the input domain
- It generates many className combinations to verify OptimizedImage rendering is unchanged
- It catches edge cases that manual unit tests might miss (e.g., unusual route patterns, className orderings)

**Test Plan**: Observe behavior on UNFIXED code first for auth routes and non-full-size OptimizedImage usage, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Auth Route Prefetch Preservation**: Generate random authenticated route pathnames (`/student/*`, `/admin/*`), verify Dashboard prefetch still fires after 4s
2. **OptimizedImage Default Rendering Preservation**: Generate random className strings that do NOT contain `h-full w-full`, verify rendered output matches original component behavior
3. **Error Fallback Preservation**: Verify OptimizedImage error fallback UI is unchanged after the fix
4. **Auth Shell Prefetch Preservation**: Verify the `requestIdleCallback` auth shell prefetch in RoutePrefetcher is unaffected by the route guard

### Unit Tests

- Test `RoutePrefetcher` skips Dashboard import on each marketing route (`/`, `/404`, `/contact`, `/privacy`, `/terms`, `/track-application`)
- Test `RoutePrefetcher` fires Dashboard import on authenticated routes (`/student/dashboard`, `/admin/dashboard`, `/dashboard`)
- Test `OptimizedImage` `<picture>` element has `block w-full h-full` classes
- Test `OptimizedImage` `<img>` element does NOT have `h-auto` in default classes
- Test `OptimizedImage` caller-provided `h-full w-full` classes are applied without conflict
- Test `OptimizedImage` error fallback still renders correctly

### Property-Based Tests

- Generate random marketing route pathnames from the known set and verify no Dashboard prefetch occurs (fix checking)
- Generate random non-marketing route pathnames and verify Dashboard prefetch still occurs (preservation checking)
- Generate random className strings without `h-full` and verify `OptimizedImage` `<img>` output matches expected pattern (preservation checking)
- Generate random `OptimizedImage` props (src, alt, width, height, className with `h-full w-full`) and verify `<picture>` always has block sizing (fix checking)

### Integration Tests

- Test full landing page render does not trigger Dashboard chunk loading (network-level verification)
- Test AccreditationSection renders logos at correct dimensions (48×48 base, 64×64 at sm:)
- Test navigation from landing page to `/auth/signin` does not load Dashboard chunk
- Test navigation from `/student/dashboard` still loads Dashboard chunk correctly
