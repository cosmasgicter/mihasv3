# Requirements: UI Consistency Consolidation

## Requirement 1: Error Display Consolidation

**User Story:** As a developer, I want a single canonical error display pattern, so that error presentation is consistent across the application and deprecated variants are removed.

### Acceptance Criteria

1. WHEN a page needs to display an inline error THEN the system SHALL use `ErrorDisplay` with `variant="inline"` from `@/components/ui/ErrorDisplay`
2. WHEN a page needs to display a section-level error THEN the system SHALL use `ErrorDisplay` with `variant="section"` from `@/components/ui/ErrorDisplay`
3. WHEN a page needs a dismissible error banner THEN the system SHALL use `Banner` with `variant="error"` from `@/components/ui/Banner`
4. WHEN all consumers of deprecated error components have been migrated THEN the system SHALL remove `ErrorBanner`, `LegacyErrorDisplay`, `InlineError`, and `ErrorPage` exports from `ErrorDisplay.tsx`
5. WHEN deprecated error components are removed THEN the system SHALL ensure zero TypeScript compilation errors across the codebase

## Requirement 2: Loading Component Consolidation

**User Story:** As a developer, I want a single canonical loading component, so that loading states look and behave consistently.

### Acceptance Criteria

1. WHEN a page needs a full-page loader THEN the system SHALL use `UnifiedLoader` with `variant="page"`
2. WHEN a component needs an inline spinner THEN the system SHALL use `UnifiedLoader` with `variant="inline"` or `UnifiedSpinner`
3. WHEN a component needs an overlay loader THEN the system SHALL use `UnifiedLoader` with `variant="overlay"`
4. WHEN all consumers have been migrated THEN the system SHALL remove non-canonical loading components that are no longer imported

## Requirement 3: Dead Admin Layout Removal

**User Story:** As a developer, I want dead layout code removed, so that the codebase is smaller and less confusing.

### Acceptance Criteria

1. WHEN `AdminLayout`, `AdminSidebar`, `AdminHeader`, and `AdminMobileNav` have zero page-level imports THEN the system SHALL delete these files
2. WHEN dead admin layout files are deleted THEN the system SHALL ensure no remaining import references exist

## Requirement 4: Duplicate AuthLayout Removal

**User Story:** As a developer, I want a single AuthLayout component, so that authentication pages use one consistent layout.

### Acceptance Criteria

1. WHEN `src/components/ui/AuthLayout.tsx` has zero external imports THEN the system SHALL delete it
2. WHEN the ui barrel export references the deleted AuthLayout THEN the system SHALL remove that export line
3. WHEN the duplicate is removed THEN the canonical `src/components/auth/AuthLayout.tsx` SHALL remain the only AuthLayout

## Requirement 5: Responsive Hook Consolidation

**User Story:** As a developer, I want a single responsive/mobile-detection hook, so that breakpoint logic is consistent and not duplicated across five hooks.

### Acceptance Criteria

1. WHEN a component needs mobile detection THEN the system SHALL use `useIsMobile` from `@/hooks/use-mobile`
2. WHEN a component needs full breakpoint info (mobile/tablet/desktop) THEN the system SHALL use `useResponsive` from `@/hooks/useResponsive`
3. WHEN `useMediaQuery` and `useMobileNavigation` have zero external imports THEN the system SHALL delete those hook files
4. WHEN `useEnhancedResponsive` consumers are migrated to `useResponsive` THEN the system SHALL delete `useEnhancedResponsive`
5. WHEN responsive hooks are consolidated THEN the system SHALL ensure all remaining consumers compile without errors

## Requirement 6: Toast Import Convention

**User Story:** As a developer, I want a single canonical toast import path, so that the codebase follows one convention.

### Acceptance Criteria

1. WHEN a component needs toast functionality THEN the system SHALL import from `@/hooks/useToast` (not directly from `@/components/ui/Toast`)
2. WHEN all direct `useToastStore` imports from `@/components/ui/Toast` are migrated THEN the system SHALL have a consistent single import path

## Requirement 7: Dead Save Status Component Removal

**User Story:** As a developer, I want unused save status components removed, so that the codebase has no dead UI code.

### Acceptance Criteria

1. WHEN `SaveStatus.tsx` and `SaveNotification.tsx` have zero external imports THEN the system SHALL delete them
2. WHEN dead save components are deleted THEN the system SHALL ensure no remaining import references exist

## Requirement 8: Design Token Compliance

**User Story:** As a developer, I want all color values to use Tailwind design tokens, so that the UI is themeable and consistent.

### Acceptance Criteria

1. WHEN `EligibilityDashboard.tsx` uses hardcoded hex colors THEN the system SHALL replace them with the corresponding design token values
2. WHEN replacing colors THEN the system SHALL map `#10B981` → success token (`#047857`), `#F59E0B` → warning token (`#b45309`), `#EF4444` → destructive token (`#cc2424`), `#3B82F6` → primary token (`#2563eb`)
3. WHEN a hardcoded color has no exact token match THEN the system SHALL use the closest semantic token or add a `chart` token to `tailwind.config.js`

## Requirement 9: Manual Loading State Migration

**User Story:** As a developer, I want pages to use React Query for server data fetching, so that loading/error states are handled declaratively instead of with manual `setLoading(true)` patterns.

### Acceptance Criteria

1. WHEN a page fetches server data with manual `setLoading(true)` THEN the system SHALL migrate it to use React Query `useQuery` hooks
2. WHEN migrating to React Query THEN the system SHALL use `CACHE_CONFIG` from `@/hooks/queries/useQueryConfig` for stale/cache times
3. WHEN migrating to React Query THEN the system SHALL create query hooks in `src/hooks/queries/` following existing patterns
4. WHEN a page has both loading and error states from server fetches THEN the system SHALL derive them from React Query's `isLoading` and `error` return values

## Requirement 10: Application Store Refactoring

**User Story:** As a developer, I want the applicationStore to contain only UI state, so that server data is not duplicated between Zustand and React Query.

### Acceptance Criteria

1. WHEN `applicationStore` stores server data (applications, programs, intakes) THEN the system SHALL remove those fields and move data fetching to React Query hooks
2. WHEN refactoring the store THEN the system SHALL keep only UI state (e.g., `currentApplicationId`, wizard step)
3. WHEN server data is removed from the store THEN the system SHALL update all consumers to use React Query hooks instead

## Requirement 11: Duplicate NotificationPreferences Removal

**User Story:** As a developer, I want a single NotificationPreferences component, so that notification settings UI is not duplicated.

### Acceptance Criteria

1. WHEN `src/components/admin/NotificationPreferences.tsx` has zero page-level imports THEN the system SHALL delete it
2. WHEN the duplicate is removed THEN the canonical `src/components/notifications/NotificationPreferences.tsx` SHALL remain the only implementation
