# Loader Unification Plan

> Forensic audit of all loader/spinner/skeleton implementations with a detailed unification strategy.

**Generated**: 2026-02-03T15:11:49.971Z
**Audit Version**: 1.0.0

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Loader Inventory](#loader-inventory)
3. [Redundant Loader Groups](#redundant-loader-groups)
4. [Replacement Strategy](#replacement-strategy)
5. [Global Loading State Management](#global-loading-state-management)
6. [Action Items](#action-items)
7. [Appendix: Loader Usages](#appendix-loader-usages)

## Executive Summary

**Report Generated**: 2026-02-03T15:11:49.972Z

### Loader System Health Status

 **CRITICAL** - High loader redundancy

### Overview

| Metric | Count |
|--------|-------|
| Total Loader Definitions | 57 |
| Total Loader Usages | 359 |
| Unique Loader Components | 46 |
| Redundant Loaders | 49 |
| Redundant Groups | 5 |

### Loaders by Type

| Type | Total | Redundant | Keep |
|------|-------|-----------|------|
|  Spinner | 105 | 9 | 96 |
|  Skeleton | 196 | 32 | 164 |
|  Progress | 14 | 6 | 8 |
|  Overlay | 9 | 1 | 8 |
|  Inline | 8 | 1 | 7 |


## Loader Inventory

Complete list of all loader components found in the codebase.

### Loader Definitions

| Component | Type | File | Line | Status |
|-----------|------|------|------|--------|
| `ProgressBar` |  progress | `src\components\8starlabs\partition-bar.tsx` | 126 |  Redundant |
| `ApplicationsSkeleton` |  skeleton | `...dmin\applications\ApplicationsSkeleton.tsx` | 3 |  Redundant |
| `DashboardSkeleton` |  skeleton | `src\components\admin\DashboardSkeleton.tsx` | 3 |  Redundant |
| `DashboardSkeleton` |  skeleton | `src\components\student\DashboardSkeleton.tsx` | 171 |  Redundant |
| `StudentDashboardSkeleton` |  skeleton | `...nents\student\StudentDashboardSkeleton.tsx` | 3 |  Redundant |
| `ApplicationProgress` |  progress | `src\components\ui\ApplicationProgress.tsx` | 10 |  Redundant |
| `AuthLoadingOverlay` |  overlay | `src\components\ui\AuthLoadingOverlay.tsx` | 17 |  Redundant |
| `EnhancedLoadingSpinner` |  spinner | `src\components\ui\EnhancedLoadingSpinner.tsx` | 39 |  Redundant |
| `FullScreenLoader` |  overlay | `src\components\ui\EnhancedLoadingSpinner.tsx` | 117 |  Keep |
| `SkeletonCard` |  skeleton | `src\components\ui\EnhancedLoadingSpinner.tsx` | 142 |  Redundant |
| `SkeletonTable` |  skeleton | `src\components\ui\EnhancedLoadingSpinner.tsx` | 154 |  Redundant |
| `SkeletonForm` |  skeleton | `src\components\ui\EnhancedLoadingSpinner.tsx` | 169 |  Redundant |
| `LoadingButton` |  inline | `src\components\ui\EnhancedLoadingSpinner.tsx` | 181 |  Keep |
| `FancyPreloader` |  spinner | `src\components\ui\FancyPreloader.tsx` | 5 |  Redundant |
| `InlineLoader` |  inline | `src\components\ui\InlineLoader.tsx` | 21 |  Keep |
| `DataTableLoader` |  spinner | `src\components\ui\InlineLoader.tsx` | 73 |  Redundant |
| `FormSubmissionLoader` |  spinner | `src\components\ui\InlineLoader.tsx` | 85 |  Keep |
| `PageContentLoader` |  spinner | `src\components\ui\InlineLoader.tsx` | 95 |  Redundant |
| `LoadingButton` |  inline | `src\components\ui\LoadingButton.tsx` | 20 |  Redundant |
| `LoadingFallback` |  spinner | `src\components\ui\LoadingFallback.tsx` | 20 |  Redundant |
| `LoadingOverlay` |  overlay | `src\components\ui\LoadingOverlay.tsx` | 19 |  Keep |
| `LoadingSpinner` |  spinner | `src\components\ui\LoadingSpinner.tsx` | 18 |  Redundant |
| `LoadingState` |  spinner | `src\components\ui\LoadingState.tsx` | 11 |  Keep |
| `Skeleton` |  skeleton | `src\components\ui\LoadingState.tsx` | 38 |  Keep |
| `TableSkeleton` |  skeleton | `src\components\ui\LoadingState.tsx` | 51 |  Redundant |
| `CardSkeleton` |  skeleton | `src\components\ui\LoadingState.tsx` | 65 |  Redundant |
| `PageLoadingFallback` |  spinner | `src\components\ui\PageLoadingFallback.tsx` | 25 |  Redundant |
| `CompactLoadingFallback` |  spinner | `src\components\ui\PageLoadingFallback.tsx` | 45 |  Redundant |
| `Progress` |  progress | `src\components\ui\progress.tsx` | 8 |  Keep |
| `ProgressIndicator` |  progress | `src\components\ui\ProgressIndicator.tsx` | 21 |  Redundant |
| `CircularProgress` |  progress | `src\components\ui\ProgressIndicator.tsx` | 113 |  Redundant |
| `IndeterminateProgress` |  progress | `src\components\ui\ProgressIndicator.tsx` | 190 |  Redundant |
| `Skeleton` |  skeleton | `src\components\ui\skeleton.tsx` | 11 |  Redundant |
| `SkeletonText` |  skeleton | `src\components\ui\skeleton.tsx` | 49 |  Redundant |
| `SkeletonCard` |  skeleton | `src\components\ui\skeleton.tsx` | 63 |  Redundant |
| `SkeletonTable` |  skeleton | `src\components\ui\skeleton.tsx` | 78 |  Redundant |
| `SkeletonDashboard` |  skeleton | `src\components\ui\skeleton.tsx` | 99 |  Redundant |
| `SkeletonLoader` |  skeleton | `src\components\ui\SkeletonLoader.tsx` | 14 |  Redundant |
| `SkeletonCard` |  skeleton | `src\components\ui\SkeletonLoader.tsx` | 69 |  Redundant |
| `SkeletonTable` |  skeleton | `src\components\ui\SkeletonLoader.tsx` | 79 |  Redundant |
| `SkeletonAvatar` |  skeleton | `src\components\ui\SkeletonLoader.tsx` | 106 |  Redundant |
| `SkeletonBase` |  skeleton | `src\components\ui\skeletons\index.tsx` | 29 |  Redundant |
| `SkeletonCard` |  skeleton | `src\components\ui\skeletons\index.tsx` | 75 |  Redundant |
| `SkeletonTable` |  skeleton | `src\components\ui\skeletons\index.tsx` | 114 |  Redundant |
| `SkeletonForm` |  skeleton | `src\components\ui\skeletons\index.tsx` | 154 |  Redundant |
| `SkeletonHero` |  skeleton | `src\components\ui\skeletons\index.tsx` | 183 |  Redundant |
| `SkeletonDashboard` |  skeleton | `src\components\ui\skeletons\index.tsx` | 234 |  Redundant |
| `SkeletonStats` |  skeleton | `src\components\ui\skeletons\index.tsx` | 268 |  Redundant |
| `SkeletonTimeline` |  skeleton | `src\components\ui\skeletons\index.tsx` | 290 |  Redundant |
| `SkeletonNavigation` |  skeleton | `src\components\ui\skeletons\index.tsx` | 319 |  Redundant |
| `SkeletonList` |  skeleton | `src\components\ui\skeletons\index.tsx` | 352 |  Redundant |
| `SkeletonProfile` |  skeleton | `src\components\ui\skeletons\index.tsx` | 380 |  Redundant |
| `SkeletonWrapper` |  skeleton | `src\components\ui\skeletons\index.tsx` | 415 |  Redundant |
| `UnifiedLoader` |  spinner | `src\components\ui\UnifiedLoader.tsx` | 356 |  Redundant |
| `SkeletonProvider` |  skeleton | `src\contexts\SkeletonContext.tsx` | 56 |  Redundant |
| `SkeletonContext` |  skeleton | `src\contexts\SkeletonContext.tsx` | 49 |  Redundant |
| `EnhancedProgressIndicator` |  progress | `...d\components\EnhancedProgressIndicator.tsx` | 383 |  Redundant |

**Legend**: 🟢 Keep | 🔴 Redundant

## Redundant Loader Groups

The following groups of loaders serve similar purposes and should be unified.

###  redundant-loader-group-1

**Type**: progress
**Similarity**: 80%
**Confidence**: likely

#### Keep (Primary)

- **`Progress`**
  - File: `src\components\ui\progress.tsx`
  - Line: 8
  - Global: No

#### Remove (Redundant)

- **`ProgressBar`**
  - File: `src\components\8starlabs\partition-bar.tsx`
  - Line: 126
- **`ApplicationProgress`**
  - File: `src\components\ui\ApplicationProgress.tsx`
  - Line: 10
- **`ProgressIndicator`**
  - File: `src\components\ui\ProgressIndicator.tsx`
  - Line: 21
- **`CircularProgress`**
  - File: `src\components\ui\ProgressIndicator.tsx`
  - Line: 113
- **`IndeterminateProgress`**
  - File: `src\components\ui\ProgressIndicator.tsx`
  - Line: 190
- **`EnhancedProgressIndicator`**
  - File: `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`
  - Line: 383

#### Reason

> Same loader type: progress; Serve the same functional purpose based on naming patterns; Similar names: "ProgressBar" and "Progress"; One appears to be a variant/enhanced version of the other; Similar names: "ApplicationProgress" and "Progress"; Similar names: "Progress" and "ProgressIndicator"; Similar names: "Progress" and "CircularProgress"; Similar names: "Progress" and "IndeterminateProgress"; Similar names: "Progress" and "EnhancedProgressIndicator"; Similar names: "ProgressIndicator" and "EnhancedProgressIndicator"

---

###  redundant-loader-group-2

**Type**: skeleton
**Similarity**: 82%
**Confidence**: likely

#### Keep (Primary)

- **`Skeleton`**
  - File: `src\components\ui\LoadingState.tsx`
  - Line: 38
  - Global: No

#### Remove (Redundant)

- **`ApplicationsSkeleton`**
  - File: `src\components\admin\applications\ApplicationsSkeleton.tsx`
  - Line: 3
- **`DashboardSkeleton`**
  - File: `src\components\admin\DashboardSkeleton.tsx`
  - Line: 3
- **`DashboardSkeleton`**
  - File: `src\components\student\DashboardSkeleton.tsx`
  - Line: 171
- **`StudentDashboardSkeleton`**
  - File: `src\components\student\StudentDashboardSkeleton.tsx`
  - Line: 3
- **`SkeletonCard`**
  - File: `src\components\ui\EnhancedLoadingSpinner.tsx`
  - Line: 142
- **`SkeletonTable`**
  - File: `src\components\ui\EnhancedLoadingSpinner.tsx`
  - Line: 154
- **`SkeletonForm`**
  - File: `src\components\ui\EnhancedLoadingSpinner.tsx`
  - Line: 169
- **`TableSkeleton`**
  - File: `src\components\ui\LoadingState.tsx`
  - Line: 51
- **`CardSkeleton`**
  - File: `src\components\ui\LoadingState.tsx`
  - Line: 65
- **`Skeleton`**
  - File: `src\components\ui\skeleton.tsx`
  - Line: 11
- **`SkeletonText`**
  - File: `src\components\ui\skeleton.tsx`
  - Line: 49
- **`SkeletonCard`**
  - File: `src\components\ui\skeleton.tsx`
  - Line: 63
- **`SkeletonTable`**
  - File: `src\components\ui\skeleton.tsx`
  - Line: 78
- **`SkeletonDashboard`**
  - File: `src\components\ui\skeleton.tsx`
  - Line: 99
- **`SkeletonLoader`**
  - File: `src\components\ui\SkeletonLoader.tsx`
  - Line: 14
- **`SkeletonCard`**
  - File: `src\components\ui\SkeletonLoader.tsx`
  - Line: 69
- **`SkeletonTable`**
  - File: `src\components\ui\SkeletonLoader.tsx`
  - Line: 79
- **`SkeletonAvatar`**
  - File: `src\components\ui\SkeletonLoader.tsx`
  - Line: 106
- **`SkeletonBase`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 29
- **`SkeletonCard`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 75
- **`SkeletonTable`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 114
- **`SkeletonForm`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 154
- **`SkeletonHero`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 183
- **`SkeletonDashboard`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 234
- **`SkeletonStats`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 268
- **`SkeletonTimeline`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 290
- **`SkeletonNavigation`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 319
- **`SkeletonList`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 352
- **`SkeletonProfile`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 380
- **`SkeletonWrapper`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 415
- **`SkeletonProvider`**
  - File: `src\contexts\SkeletonContext.tsx`
  - Line: 56
- **`SkeletonContext`**
  - File: `src\contexts\SkeletonContext.tsx`
  - Line: 49

#### Reason

> Same loader type: skeleton; Serve the same functional purpose based on naming patterns; Similar names: "ApplicationsSkeleton" and "Skeleton"; Similar names: "ApplicationsSkeleton" and "SkeletonLoader"; Similar names: "DashboardSkeleton" and "DashboardSkeleton"; Similar names: "DashboardSkeleton" and "StudentDashboardSkeleton"; Similar names: "DashboardSkeleton" and "Skeleton"; Similar names: "DashboardSkeleton" and "SkeletonLoader"; Similar names: "StudentDashboardSkeleton" and "Skeleton"; Similar names: "StudentDashboardSkeleton" and "SkeletonLoader"; Similar names: "SkeletonCard" and "Skeleton"; Similar names: "SkeletonCard" and "SkeletonCard"; Similar names: "SkeletonCard" and "SkeletonLoader"; Similar names: "SkeletonTable" and "Skeleton"; Similar names: "SkeletonTable" and "SkeletonTable"; Similar names: "SkeletonTable" and "SkeletonLoader"; Similar names: "SkeletonForm" and "Skeleton"; Similar names: "SkeletonForm" and "SkeletonLoader"; Similar names: "SkeletonForm" and "SkeletonForm"; Similar names: "Skeleton" and "TableSkeleton"; Similar names: "Skeleton" and "CardSkeleton"; Similar names: "Skeleton" and "Skeleton"; Similar names: "Skeleton" and "SkeletonText"; Similar names: "Skeleton" and "SkeletonCard"; Similar names: "Skeleton" and "SkeletonTable"; Similar names: "Skeleton" and "SkeletonDashboard"; Similar names: "Skeleton" and "SkeletonLoader"; Similar names: "Skeleton" and "SkeletonAvatar"; Similar names: "Skeleton" and "SkeletonBase"; Similar names: "Skeleton" and "SkeletonForm"; Similar names: "Skeleton" and "SkeletonHero"; Similar names: "Skeleton" and "SkeletonStats"; Similar names: "Skeleton" and "SkeletonTimeline"; Similar names: "Skeleton" and "SkeletonNavigation"; Similar names: "Skeleton" and "SkeletonList"; Similar names: "Skeleton" and "SkeletonProfile"; Similar names: "Skeleton" and "SkeletonWrapper"; Similar names: "Skeleton" and "SkeletonProvider"; Similar names: "Skeleton" and "SkeletonContext"; Similar names: "TableSkeleton" and "Skeleton"; Similar names: "TableSkeleton" and "SkeletonLoader"; Similar names: "CardSkeleton" and "Skeleton"; Similar names: "CardSkeleton" and "SkeletonLoader"; Similar names: "SkeletonText" and "SkeletonLoader"; Similar names: "SkeletonText" and "SkeletonContext"; Similar names: "SkeletonDashboard" and "SkeletonLoader"; Similar names: "SkeletonDashboard" and "SkeletonDashboard"; Similar names: "SkeletonLoader" and "SkeletonCard"; Similar names: "SkeletonLoader" and "SkeletonTable"; Similar names: "SkeletonLoader" and "SkeletonAvatar"; Similar names: "SkeletonLoader" and "SkeletonBase"; Similar names: "SkeletonLoader" and "SkeletonForm"; Similar names: "SkeletonLoader" and "SkeletonHero"; Similar names: "SkeletonLoader" and "SkeletonDashboard"; Similar names: "SkeletonLoader" and "SkeletonStats"; Similar names: "SkeletonLoader" and "SkeletonTimeline"; Similar names: "SkeletonLoader" and "SkeletonNavigation"; Similar names: "SkeletonLoader" and "SkeletonList"; Similar names: "SkeletonLoader" and "SkeletonProfile"; Similar names: "SkeletonLoader" and "SkeletonWrapper"; Similar names: "SkeletonLoader" and "SkeletonProvider"; Similar names: "SkeletonLoader" and "SkeletonContext"; Similar names: "SkeletonProfile" and "SkeletonProvider"

---

###  redundant-loader-group-3

**Type**: overlay
**Similarity**: 96%
**Confidence**: certain

#### Keep (Primary)

- **`LoadingOverlay`**
  - File: `src\components\ui\LoadingOverlay.tsx`
  - Line: 19
  - Global: No

#### Remove (Redundant)

- **`AuthLoadingOverlay`**
  - File: `src\components\ui\AuthLoadingOverlay.tsx`
  - Line: 17

#### Reason

> Similar names: "AuthLoadingOverlay" and "LoadingOverlay"; Same loader type: overlay; Serve the same functional purpose based on naming patterns

---

###  redundant-loader-group-4

**Type**: spinner
**Similarity**: 69%
**Confidence**: possible

#### Keep (Primary)

- **`LoadingState`**
  - File: `src\components\ui\LoadingState.tsx`
  - Line: 11
  - Global: No

#### Remove (Redundant)

- **`EnhancedLoadingSpinner`**
  - File: `src\components\ui\EnhancedLoadingSpinner.tsx`
  - Line: 39
- **`FancyPreloader`**
  - File: `src\components\ui\FancyPreloader.tsx`
  - Line: 5
- **`DataTableLoader`**
  - File: `src\components\ui\InlineLoader.tsx`
  - Line: 73
- **`PageContentLoader`**
  - File: `src\components\ui\InlineLoader.tsx`
  - Line: 95
- **`LoadingFallback`**
  - File: `src\components\ui\LoadingFallback.tsx`
  - Line: 20
- **`LoadingSpinner`**
  - File: `src\components\ui\LoadingSpinner.tsx`
  - Line: 18
- **`PageLoadingFallback`**
  - File: `src\components\ui\PageLoadingFallback.tsx`
  - Line: 25
- **`CompactLoadingFallback`**
  - File: `src\components\ui\PageLoadingFallback.tsx`
  - Line: 45
- **`UnifiedLoader`**
  - File: `src\components\ui\UnifiedLoader.tsx`
  - Line: 356

#### Reason

> Same loader type: spinner; Serve the same functional purpose based on naming patterns; One appears to be a variant/enhanced version of the other; Similar names: "EnhancedLoadingSpinner" and "LoadingSpinner"; Similar names: "LoadingFallback" and "PageLoadingFallback"; Similar names: "LoadingFallback" and "CompactLoadingFallback"

---

###  redundant-loader-group-5

**Type**: inline
**Similarity**: 100%
**Confidence**: certain

#### Keep (Primary)

- **`LoadingButton`**
  - File: `src\components\ui\EnhancedLoadingSpinner.tsx`
  - Line: 181
  - Global: No

#### Remove (Redundant)

- **`LoadingButton`**
  - File: `src\components\ui\LoadingButton.tsx`
  - Line: 20

#### Reason

> Similar names: "LoadingButton" and "LoadingButton"; Same loader type: inline; Serve the same functional purpose based on naming patterns

---

## Replacement Strategy

This section provides a detailed plan for migrating to the UnifiedLoader component.

### Target: UnifiedLoader Component

All loaders should be replaced with the `UnifiedLoader` component located at:

```
src/components/ui/UnifiedLoader.tsx
```

### UnifiedLoader Variants

| Variant | Use Case | Replaces |
|---------|----------|----------|
| `page` | Full page loading states | LoadingFallback, PageLoader, FullScreenLoader |
| `inline` | Within content loading | LoadingSpinner, InlineLoader, Spinner |
| `skeleton` | Placeholder content | Skeleton, SkeletonCard, SkeletonTable |
| `overlay` | Modal-like overlay | LoadingOverlay, AuthLoadingOverlay |

### UnifiedLoader Sizes

| Size | Use Case |
|------|----------|
| `sm` | Buttons, inline text |
| `md` | Cards, sections (default) |
| `lg` | Full page, modals |

### Migration Examples

#### Migrating Progress

**Before:**
```tsx
<Progress />
```

**After:**
```tsx
<UnifiedLoader variant="inline" />
```

#### Migrating Skeleton

**Before:**
```tsx
<Skeleton />
```

**After:**
```tsx
<UnifiedLoader variant="skeleton" />
```

#### Migrating LoadingOverlay

**Before:**
```tsx
<LoadingOverlay />
```

**After:**
```tsx
<UnifiedLoader variant="overlay" />
```

#### Migrating LoadingState

**Before:**
```tsx
<LoadingState />
```

**After:**
```tsx
<UnifiedLoader variant="inline" />
```

#### Migrating LoadingButton

**Before:**
```tsx
<LoadingButton />
```

**After:**
```tsx
<UnifiedLoader variant="inline" />
```

## Global Loading State Management

The application uses a Zustand store for managing global loading states.

### Loading Store Location

```
src/stores/loadingStore.ts
```

### Usage Pattern

```tsx
import { useLoadingStore, useLoadingKey } from '@/stores/loadingStore';

// Option 1: Full store access
const { startLoading, stopLoading, isKeyLoading } = useLoadingStore();

// Option 2: Single key helper
const [isLoading, startLoading, stopLoading] = useLoadingKey('fetch-data');

// Start loading
startLoading('fetch-applications');

// Check loading state
if (isKeyLoading('fetch-applications')) {
  return <UnifiedLoader variant="page" message="Loading applications..." />;
}

// Stop loading
stopLoading('fetch-applications');
```

### Benefits

- **Single source of truth**: All loading states in one store
- **No double loaders**: Prevents multiple spinners from showing
- **Key-based tracking**: Track multiple concurrent operations
- **Easy debugging**: `getActiveKeys()` shows all active loading operations


## Action Items

### Priority 1: Remove Redundant Loaders (High)

The following loaders should be removed and replaced with UnifiedLoader:

1. Remove `ProgressBar` from `src\components\8starlabs\partition-bar.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
2. Remove `ApplicationProgress` from `src\components\ui\ApplicationProgress.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
3. Remove `ProgressIndicator` from `src\components\ui\ProgressIndicator.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
4. Remove `CircularProgress` from `src\components\ui\ProgressIndicator.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
5. Remove `IndeterminateProgress` from `src\components\ui\ProgressIndicator.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
6. Remove `EnhancedProgressIndicator` from `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
7. Remove `ApplicationsSkeleton` from `src\components\admin\applications\ApplicationsSkeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
8. Remove `DashboardSkeleton` from `src\components\admin\DashboardSkeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
9. Remove `DashboardSkeleton` from `src\components\student\DashboardSkeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
10. Remove `StudentDashboardSkeleton` from `src\components\student\StudentDashboardSkeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
11. Remove `SkeletonCard` from `src\components\ui\EnhancedLoadingSpinner.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
12. Remove `SkeletonTable` from `src\components\ui\EnhancedLoadingSpinner.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
13. Remove `SkeletonForm` from `src\components\ui\EnhancedLoadingSpinner.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
14. Remove `TableSkeleton` from `src\components\ui\LoadingState.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
15. Remove `CardSkeleton` from `src\components\ui\LoadingState.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
16. Remove `Skeleton` from `src\components\ui\skeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
17. Remove `SkeletonText` from `src\components\ui\skeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
18. Remove `SkeletonCard` from `src\components\ui\skeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
19. Remove `SkeletonTable` from `src\components\ui\skeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
20. Remove `SkeletonDashboard` from `src\components\ui\skeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
21. Remove `SkeletonLoader` from `src\components\ui\SkeletonLoader.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
22. Remove `SkeletonCard` from `src\components\ui\SkeletonLoader.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
23. Remove `SkeletonTable` from `src\components\ui\SkeletonLoader.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
24. Remove `SkeletonAvatar` from `src\components\ui\SkeletonLoader.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
25. Remove `SkeletonBase` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
26. Remove `SkeletonCard` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
27. Remove `SkeletonTable` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
28. Remove `SkeletonForm` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
29. Remove `SkeletonHero` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
30. Remove `SkeletonDashboard` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
31. Remove `SkeletonStats` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
32. Remove `SkeletonTimeline` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
33. Remove `SkeletonNavigation` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
34. Remove `SkeletonList` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
35. Remove `SkeletonProfile` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
36. Remove `SkeletonWrapper` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
37. Remove `SkeletonProvider` from `src\contexts\SkeletonContext.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
38. Remove `SkeletonContext` from `src\contexts\SkeletonContext.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
39. Remove `AuthLoadingOverlay` from `src\components\ui\AuthLoadingOverlay.tsx`
   - Replace with: `<UnifiedLoader variant="overlay" />`
40. Remove `EnhancedLoadingSpinner` from `src\components\ui\EnhancedLoadingSpinner.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
41. Remove `FancyPreloader` from `src\components\ui\FancyPreloader.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
42. Remove `DataTableLoader` from `src\components\ui\InlineLoader.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
43. Remove `PageContentLoader` from `src\components\ui\InlineLoader.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
44. Remove `LoadingFallback` from `src\components\ui\LoadingFallback.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
45. Remove `LoadingSpinner` from `src\components\ui\LoadingSpinner.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
46. Remove `PageLoadingFallback` from `src\components\ui\PageLoadingFallback.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
47. Remove `CompactLoadingFallback` from `src\components\ui\PageLoadingFallback.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
48. Remove `UnifiedLoader` from `src\components\ui\UnifiedLoader.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
49. Remove `LoadingButton` from `src\components\ui\LoadingButton.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`

### Priority 2: Update Import Statements (Medium)

After removing redundant loaders, update all files that import them.

### Priority 3: Verify No Visual Regressions (Low)

After migration, verify:

- [ ] No visual flicker during page transitions
- [ ] No double loaders appearing
- [ ] Loading states work on mobile devices
- [ ] Accessibility labels are present (screen reader support)
- [ ] Reduced motion preference is respected

## Appendix: Loader Usages

This section documents where each loader is used in the codebase.

### LoadingSpinner

**Total Usages**: 101 (43 imports, 58 JSX)

**Imported in:**

- `src\components\admin\ApplicationFlowAnalyzer.tsx:4`
- `src\components\admin\applications\ApplicationApprovalActions.tsx:4`
- `src\components\admin\applications\ApplicationCard.tsx:3`
- `src\components\admin\applications\ApplicationDetailModal.tsx:7`
- `src\components\admin\applications\ApplicationsTable.tsx:2`
- `src\components\admin\applications\modal\DocumentsTab.tsx:2`
- `src\components\admin\applications\modal\GradesTab.tsx:2`
- `src\components\admin\applications\modal\StatusHistoryTab.tsx:2`
- `src\components\admin\CommunicationHistory.tsx:12`
- `src\components\admin\DatabaseMonitoring.tsx:5`
- ... and 33 more

### Skeleton

**Total Usages**: 90 (3 imports, 87 JSX)

**Imported in:**

- `src\components\admin\applications\ApplicationsSkeleton.tsx:1`
- `src\components\student\DashboardSkeleton.tsx:9`
- `src\components\student\StudentDashboardSkeleton.tsx:1`

### SkeletonBase

**Total Usages**: 34 (0 imports, 34 JSX)

### Loader2

**Total Usages**: 30 (14 imports, 16 JSX)

**Imported in:**

- `src\components\8starlabs\timeline.tsx:11`
- `src\components\DashboardRedirect.tsx:7`
- `src\components\student\ApplicationSlipActions.tsx:3`
- `src\components\student\QuickActions.tsx:11`
- `src\components\ui\EnhancedLoadingSpinner.tsx:13`
- `src\components\ui\FormFeedback.tsx:10`
- `src\components\ui\LoadingState.tsx:2`
- `src\components\ui\ProgressIndicator.tsx:10`
- `src\components\ui\TouchOptimizedButton.tsx:4`
- `src\pages\auth\ForgotPasswordPage.tsx:20`
- ... and 4 more

### SkeletonCard

**Total Usages**: 9 (2 imports, 7 JSX)

**Imported in:**

- `src\components\admin\applications\ApplicationsSkeleton.tsx:1`
- `src\components\student\StudentDashboardSkeleton.tsx:1`

### EnhancedLoadingSpinner

**Total Usages**: 8 (2 imports, 6 JSX)

**Imported in:**

- `src\components\ui\EnhancedFileUpload.tsx:5`
- `src\components\ui\MobileOptimizedButton.tsx:3`

### SkeletonLoader

**Total Usages**: 7 (0 imports, 7 JSX)

### AuthLoadingOverlay

**Total Usages**: 5 (2 imports, 3 JSX)

**Imported in:**

- `src\pages\auth\SignInPage.tsx:19`
- `src\pages\auth\SignUpPage.tsx:22`

### ProgressIndicator

**Total Usages**: 4 (2 imports, 2 JSX)

**Imported in:**

- `src\components\application\SimpleFileUpload.tsx:4`
- `src\components\ui\EnhancedFileUpload.tsx:6`

### InlineLoader

**Total Usages**: 4 (0 imports, 4 JSX)

### SkeletonLine

**Total Usages**: 4 (0 imports, 4 JSX)

### UnifiedLoaderProps

**Total Usages**: 4 (0 imports, 4 JSX)

### UnifiedLoader

**Total Usages**: 4 (0 imports, 4 JSX)

### ApplicationsSkeleton

**Total Usages**: 4 (2 imports, 2 JSX)

**Imported in:**

- `src\pages\admin\Applications.tsx:5`
- `src\pages\admin\ApplicationsAdmin.tsx:10`

### DashboardSkeleton

**Total Usages**: 4 (2 imports, 2 JSX)

**Imported in:**

- `src\pages\admin\Dashboard.tsx:48`
- `src\pages\student\Dashboard.tsx:21`

### TableSkeleton

**Total Usages**: 3 (1 imports, 2 JSX)

**Imported in:**

- `src\pages\admin\Users.tsx:6`

### SkeletonText

**Total Usages**: 3 (1 imports, 2 JSX)

**Imported in:**

- `src\components\student\StudentDashboardSkeleton.tsx:1`

### Spinner

**Total Usages**: 3 (0 imports, 3 JSX)

### LoadingState

**Total Usages**: 3 (1 imports, 2 JSX)

**Imported in:**

- `src\pages\admin\Users.tsx:6`

### SkeletonProvider

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\App.tsx:7`

### Progress

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\components\admin\BulkNotificationManager.tsx:15`

### SkeletonDashboard

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\components\admin\DashboardSkeleton.tsx:1`

### SkeletonTable

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\components\admin\EnhancedApplicationsTable.tsx:6`

### LoadingButton

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\components\application\SimpleFileUpload.tsx:3`

### ProgressPrimitive

**Total Usages**: 2 (0 imports, 2 JSX)

### CardSkeleton

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\pages\admin\Users.tsx:6`

### EnhancedProgressIndicator

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\pages\student\applicationWizard\index.tsx:20`

### LoadingFallback

**Total Usages**: 1 (1 imports, 0 JSX)

**Imported in:**

- `src\App.tsx:15`

### MetricCardSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### StatusOverviewSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### ApplicationCardSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### TimelineSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### ProfileSummarySkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### DeadlinesSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### QuickActionSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### FileWithProgress

**Total Usages**: 1 (0 imports, 1 JSX)

### FullScreenLoader

**Total Usages**: 1 (0 imports, 1 JSX)

### LoadingOverlay

**Total Usages**: 1 (0 imports, 1 JSX)

### SkeletonStats

**Total Usages**: 1 (0 imports, 1 JSX)

### SkeletonTimeline

**Total Usages**: 1 (0 imports, 1 JSX)

### SkeletonCardContent

**Total Usages**: 1 (0 imports, 1 JSX)

### PageLoader

**Total Usages**: 1 (0 imports, 1 JSX)

### OverlayLoader

**Total Usages**: 1 (0 imports, 1 JSX)

### SkeletonContextValue

**Total Usages**: 1 (0 imports, 1 JSX)

### SkeletonContext

**Total Usages**: 1 (0 imports, 1 JSX)

### useOverallProgress

**Total Usages**: 1 (1 imports, 0 JSX)

**Imported in:**

- `src\pages\student\applicationWizard\index.tsx:27`

---

*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*

**Validates**: Requirements 3.1, 3.2 - Loader System Unification