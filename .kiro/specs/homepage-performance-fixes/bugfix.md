# Bugfix Requirements Document

## Introduction

ScoutQA exploratory testing on the MIHAS admissions platform identified two bugs degrading the homepage experience. Bug 1 (CRITICAL): the landing page triggers eager prefetching of the entire Dashboard module chunk after 4 seconds, pulling in 35+ JavaScript modules (SSE client, PDF generation, payment status, profile auto-population, interviews, animations, etc.) that are irrelevant to the public landing page. On mobile networks this causes a ~10-second white screen delay. Bug 2 (HIGH): four accreditation logos (NMCZ, HPCZ, ECZ, UNZA) render at 0×0 pixels because the `<picture>` element wrapping the `<img>` in `OptimizedImage` is inline by default and does not inherit the parent container's sizing constraints.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user visits the landing page (`/`) THEN the `RoutePrefetcher` component in `App.tsx` unconditionally schedules `import('@/pages/student/Dashboard')` after 4 seconds, downloading the entire Dashboard chunk and its 35+ transitive dependencies (useRealtime, useStudentDashboardPolling, interviewsService, applicationService, catalogService, useProfileAutoPopulation, paymentStatus, applicationSlipPdf, slipService, sseClient, animations, etc.) even though none of these modules are needed on the public landing page.

1.2 WHEN the Dashboard chunk is prefetched on the landing page THEN all 40+ top-level imports in `Dashboard.tsx` (lines 1-45) are eagerly evaluated at module level, pulling in SSE client setup, PDF generation libraries, payment status utilities, profile auto-population hooks, and animation helpers — causing 78 total resources to load and ~17.5 seconds of cumulative blocking time on mobile networks.

1.3 WHEN the `OptimizedImage` component renders an accreditation logo inside the `AccreditationSection` of `LandingPageSections.tsx` THEN the `<picture>` element wrapping the `<img>` tag is rendered as an inline element with no explicit sizing, causing the image to collapse to 0×0 pixels despite the parent `div` having `h-12 w-12` (or `h-16 w-16` at `sm:`) sizing constraints.

1.4 WHEN the `<img>` inside `OptimizedImage` has `className="max-w-full h-auto"` from the component combined with `className="h-full w-full object-contain"` from the caller THEN the conflicting height directives (`h-auto` vs `h-full`) and the unsized inline `<picture>` wrapper result in the image having zero rendered dimensions.

### Expected Behavior (Correct)

2.1 WHEN a user visits the landing page (`/`) THEN the `RoutePrefetcher` SHALL NOT prefetch the Dashboard chunk; Dashboard prefetching SHALL only occur on authenticated routes (e.g., `/student/*`, `/admin/*`, `/dashboard`) where the user is likely to navigate to the Dashboard next.

2.2 WHEN the Dashboard chunk is eventually loaded (on authenticated routes or direct navigation) THEN the heavy transitive dependencies (SSE client, PDF generation, payment status, profile auto-population, interviews service, slip service, animations) SHALL be lazy-imported within the Dashboard component rather than eagerly evaluated at module top-level, so that the Dashboard chunk itself remains lightweight until actually rendered.

2.3 WHEN the `OptimizedImage` component renders inside the `AccreditationSection` THEN the `<picture>` element SHALL be styled as a block-level element (`display: block`) with `width: 100%` and `height: 100%` so that it inherits the parent container's sizing constraints and the accreditation logos render at their intended dimensions (48×48 at base, 64×64 at `sm:`).

2.4 WHEN the `<img>` inside `OptimizedImage` receives caller-provided classes like `h-full w-full object-contain` THEN the component's own default classes SHALL NOT conflict — specifically, `h-auto` SHALL be removed from the default className so that caller-provided height classes take effect without being overridden.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user visits an authenticated route (e.g., `/student/dashboard`, `/admin/dashboard`) THEN the system SHALL CONTINUE TO prefetch the Dashboard chunk and auth shell chunk as it does today, ensuring fast navigation for logged-in users.

3.2 WHEN the Dashboard page is rendered by a logged-in student THEN all Dashboard functionality (application list, status overview, timeline, quick actions, interviews, payment status, profile completion, realtime updates) SHALL CONTINUE TO work correctly with no missing data or broken UI.

3.3 WHEN `OptimizedImage` is used in contexts other than the `AccreditationSection` (e.g., hero images, program cards, or any other caller that does NOT pass `h-full w-full`) THEN the component SHALL CONTINUE TO render images correctly with its existing responsive behavior (`max-w-full` and appropriate height).

3.4 WHEN the landing page loads on desktop or fast networks THEN the First Contentful Paint SHALL CONTINUE TO be under 1 second and the hero section SHALL CONTINUE TO render immediately without waiting for deferred sections.

3.5 WHEN route-level code splitting is used via `React.lazy()` in `routes/config.tsx` THEN all lazy-loaded routes SHALL CONTINUE TO load correctly with their Suspense fallback skeletons.

3.6 WHEN the `OptimizedImage` component encounters a load error THEN it SHALL CONTINUE TO display the fallback placeholder UI with the broken-image icon and alt text.

---

### Bug Condition Derivation

**Bug 1 — Eager Dashboard Prefetch on Landing Page**

```pascal
FUNCTION isBugCondition_Prefetch(X)
  INPUT: X of type { pathname: string }
  OUTPUT: boolean

  // The bug triggers when RoutePrefetcher runs on a marketing/public route
  RETURN isMarketingPublicRoute(X.pathname)
END FUNCTION
```

```pascal
// Property: Fix Checking — No Dashboard prefetch on public routes
FOR ALL X WHERE isBugCondition_Prefetch(X) DO
  modules_loaded ← getLoadedModules(renderApp(X.pathname))
  ASSERT "pages/student/Dashboard" NOT IN modules_loaded
END FOR
```

```pascal
// Property: Preservation Checking — Dashboard prefetch still works on auth routes
FOR ALL X WHERE NOT isBugCondition_Prefetch(X) DO
  ASSERT prefetchBehavior(X) = prefetchBehavior_original(X)
END FOR
```

**Bug 2 — Accreditation Logos 0×0 Rendering**

```pascal
FUNCTION isBugCondition_Logo(X)
  INPUT: X of type { parentHasSizing: boolean, callerPassesFullSize: boolean }
  OUTPUT: boolean

  // The bug triggers when OptimizedImage is inside a sized parent
  // and the caller passes h-full w-full expecting the image to fill it
  RETURN X.parentHasSizing AND X.callerPassesFullSize
END FUNCTION
```

```pascal
// Property: Fix Checking — Images render at parent dimensions
FOR ALL X WHERE isBugCondition_Logo(X) DO
  rendered ← renderOptimizedImage(X)
  ASSERT rendered.picture.display = "block"
  ASSERT rendered.picture.width > 0
  ASSERT rendered.picture.height > 0
  ASSERT rendered.img.height != "auto" // caller's h-full takes effect
END FOR
```

```pascal
// Property: Preservation Checking — Images without full-size classes still work
FOR ALL X WHERE NOT isBugCondition_Logo(X) DO
  ASSERT renderOptimizedImage(X) = renderOptimizedImage_original(X)
END FOR
```
