# Duplicate & Deprecated Implementation Audit (MIHAS)

## Scope and method
- Scanned source tree (`src/**`) for duplicate exported symbols and duplicated utility behavior.
- Removed confirmed dead/deprecated modules that were not route-reachable and had no active imports.
- Performed critical review for race-condition hotspots (async state updates, timer cleanup, deprecated browser listeners).

## Deprecated/legacy code removed in this pass
These were fully removed from the codebase because they were explicitly deprecated/staged and had no runtime references:

1. `src/lib/submissionUtils.ts`
   - Marked deprecated and unused.
   - Contained legacy submission and receipt helpers replaced by API-based flows.
2. `src/hooks/useAuth.ts`
   - Deprecated shim re-exporting `useAuth` from `AuthContext`.
   - Replaced imports with direct `@/contexts/AuthContext` usage.
3. Staged admin modules (not route-reachable):
   - `src/pages/admin/EligibilityManagement.tsx`
   - `src/pages/admin/CacheMonitor.tsx`
   - `src/pages/admin/featureRegistry.ts`
   - `src/components/admin/CacheMonitor.tsx`
   - `src/components/admin/CacheMonitorDashboard.tsx`
   - `src/components/admin/ReportTemplates.tsx`

## Race condition / deprecation hardening completed
1. **Removed deprecated `MediaQueryList.addListener/removeListener` path**
   - File: `src/hooks/use-mobile.ts`
   - Kept only modern `addEventListener('change', ...)` with explicit cleanup.
   - Reduces browser API drift and avoids dual codepath behavior divergence.

## High-confidence duplicate implementations found
> These are real duplicate symbols or overlapping implementations that should be consolidated by domain owners.

### Utilities duplicated across `src/lib/*` and `src/utils/*`
- `debounce` (`src/utils/performance.ts`, `src/lib/utils.ts`)
- `throttle` (`src/utils/performance.ts`, `src/lib/utils.ts`)
- `prefersReducedMotion` (`src/utils/animationOptimization.ts`, `src/utils/performance.ts`, `src/lib/utils.ts`, `src/lib/animation-config.ts`)
- `requestIdleCallback` (`src/utils/performance.ts`, `src/lib/performance-utils.ts`)
- `formatFileSize` (`src/utils/file-helpers.ts`, `src/lib/utils.ts`)
- `compressImage` (`src/utils/file-helpers.ts`, `src/lib/utils.ts`)
- `validateFile` (`src/utils/file-helpers.ts`, `src/lib/storage.ts`)
- `safeJsonParse` (`src/lib/utils.ts`, `src/lib/sanitize.ts`)

### Accessibility helpers duplicated
- `trapFocus` (`src/utils/keyboardNavigation.ts`, `src/lib/utils.ts`, `src/lib/accessibility-utils.ts`)
- `announceToScreenReader` (`src/utils/keyboardNavigation.ts`, `src/lib/utils.ts`, `src/lib/accessibility-utils.ts`)
- `getFocusableElements` (`src/utils/keyboardNavigation.ts`, `src/lib/accessibility-utils.ts`)
- `getContrastRatio` (`src/utils/contrastChecker.ts`, `src/lib/accessibility-utils.ts`)
- `hexToRgb` (`src/lib/utils.ts`, `src/lib/accessibility-utils.ts`)

### Security/sanitization overlap
- `sanitizeForLog` (`src/lib/security.ts`, `src/lib/sanitizer.ts`, `src/lib/sanitize.ts`, `src/lib/securityEnhancements.ts`)
- `sanitizeHtml` (`src/lib/security.ts`, `src/lib/sanitizer.ts`, `src/lib/securityEnhancements.ts`)
- `sanitizeText` (`src/lib/sanitizer.ts`, `src/lib/sanitize.ts`)
- `sanitizeFilePath` (`src/lib/security.ts`, `src/lib/securityEnhancements.ts`)
- `SecuritySanitizer` duplicated responsibilities between `securityConfig` and `securityEnhancements`

### UI/component duplication hotspots
- `DashboardSkeleton` in 3 places:
  - `src/components/student/DashboardSkeleton.tsx`
  - `src/components/admin/DashboardSkeleton.tsx`
  - `src/components/ui/skeletons/DashboardSkeleton.tsx`
- `AuthLayout` split between:
  - `src/components/auth/AuthLayout.tsx`
  - `src/pages/auth/AuthLayout.tsx`
- `ApplicationsTable` split between:
  - `src/components/admin/ApplicationsTable.tsx`
  - `src/components/admin/applications/ApplicationsTable.tsx`
- `ErrorBoundary` split between:
  - `src/components/ErrorBoundary.tsx`
  - `src/components/ui/ErrorBoundary.tsx`
- `ResponsiveContainer`, `ResponsiveGrid`, `ResponsiveStack` duplicated between:
  - `src/components/ui/ResponsiveContainer.tsx`
  - `src/components/ui/ResponsiveLayout.tsx`
- `NotificationPreferences` duplicated between student + notifications surfaces and overlapping types/services.

### Hook duplication hotspots
- `useApplications` / `useApplication` duplicated between:
  - `src/hooks/useApiServices.ts`
  - `src/hooks/queries/useApplicationDataQueries.ts`
- `useApplicationsData` duplicated in:
  - `src/hooks/useApplicationsData.ts`
  - `src/hooks/admin/useApplicationsData.ts`
- `useNotificationPreferences` duplicated in:
  - `src/hooks/useNotificationPreferences.ts`
  - `src/hooks/queries/useNotificationQueries.ts`
- `useDraftManager` appears in:
  - `src/hooks/useDraftManager.ts`
  - `src/hooks/useAutoSave.ts` (embedded duplicate responsibilities)

## Critical architectural insights (from a consolidation perspective)
1. **`src/lib` vs `src/utils` is the biggest duplication generator**
   - Same concerns are implemented in both trees, creating drift and inconsistent bug fixes.
2. **Type models are duplicated between UI and domain layers**
   - Example: `ApplicationFormData`, `NotificationPreferences`, `SubmissionStatus`.
3. **Admin surface has historical staged/disabled modules**
   - These should never stay committed long-term; they accumulate stale dependencies.
4. **Security helper sprawl is a latent risk**
   - Multiple sanitizer implementations increase chance of bypass via inconsistent usage.

## Agentic AI execution backlog (recommended next steps)
1. **Establish single-source directories**
   - Utilities: pick `src/lib` *or* `src/utils` as canonical.
   - Hooks: consolidate under `src/hooks/**` with query subfolders.
2. **Create codemod pass**
   - Rewrite imports to canonical modules.
   - Enforce via ESLint `no-restricted-imports` for deprecated paths.
3. **Unify sanitization API**
   - Build one `src/lib/sanitize/index.ts` and deprecate all alternates.
4. **Unify skeleton and layout components**
   - Keep one primitive set in `src/components/ui`.
5. **Race-condition hardening campaign**
   - Standardize `AbortController` for async effects.
   - Require timer/event cleanup in every hook.
   - Add lint rule: no async effect without cancellation strategy.
6. **Enforce dead-code budget in CI**
   - Fail CI when staged/deprecated modules are reintroduced without routing and ownership.

## Definition of done for full duplicate eradication
- No duplicate exported utility names across domains unless intentionally namespaced.
- No deprecated shims/modules in production source tree.
- No staged admin pages without a route and owner.
- All async effects use cancellation/cleanup.
