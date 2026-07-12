# Requirements Document

## Introduction

The admissions frontend (`apps/admissions/`) was recently aligned with the Django REST API via the `frontend-django-alignment` spec. A CTO skill review of that completed work, combined with a UI design system audit and fullstack page-by-page functionality verification, identified residual quality gaps that need hardening. This spec covers six areas: TypeScript safety (11 files with `@ts-nocheck`, strict mode not enabled), error visibility completion (5 services without `logApiError`), design token consistency (hardcoded colors in charts, SVGs, and admin palette), test coverage for 9 untested pages, service layer polish (naming inconsistency, documented N+1), and page-by-page functional verification across all routes. No new features are introduced — this is purely quality hardening within `apps/admissions/`.

## Glossary

- **Frontend**: The React 18 + TypeScript SPA located at `apps/admissions/`, built with Vite and deployed on Vercel
- **TypeScript_Strict_Mode**: The `strict: true` compiler option in `tsconfig.json` that enables all strict type-checking flags including `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables`, and `alwaysStrict`
- **Ts_Nocheck_Directive**: The `// @ts-nocheck` comment at the top of a TypeScript file that disables all type checking for that file
- **LogApiError**: The structured error logging utility at `src/lib/apiErrorLogger.ts` that logs API errors with context, endpoint, status, and message to the browser console
- **Design_Token_System**: The centralized design values defined in `src/design-system/tokens.ts` covering colors, spacing, typography, and border radius
- **Chart_Colors_Module**: The `src/lib/chartColors.ts` module containing hardcoded hex color values (`#047857`, `#b45309`, `#cc2424`, `#2563eb`, `#7c3aed`) used by chart components
- **Admin_Color_Palette**: The `admin` color object in `tailwind.config.js` containing hardcoded hex values for admin-specific backgrounds, borders, and text colors
- **Service_Layer**: The collection of modules in `apps/admissions/src/services/` that call ApiClient methods and transform raw API responses into frontend-consumable shapes
- **BulkStatus_Endpoint**: The `POST /api/v1/applications/bulk-status/` endpoint used for admin bulk application status updates
- **Interviews_N_Plus_1**: The pattern in `interviewsService.list()` where fetching interviews without an `applicationId` first fetches ALL user applications then makes N parallel interview requests, one per application
- **Page_Verification_Test**: A test file that mocks ApiClient responses with Django API shapes and asserts a page component renders correctly without errors

## Requirements

### Requirement 1: Remove @ts-nocheck Directives and Fix Underlying Type Errors

**User Story:** As a developer, I want all TypeScript files to be fully type-checked, so that type errors are caught at compile time rather than at runtime.

#### Acceptance Criteria

1. THE Frontend SHALL have zero files containing the `// @ts-nocheck` directive
2. WHEN the Ts_Nocheck_Directive is removed from `src/components/ui/EnhancedFormComponents.tsx`, THE Frontend SHALL compile without type errors in that file
3. WHEN the Ts_Nocheck_Directive is removed from `src/utils/api-cache.ts`, THE Frontend SHALL compile without type errors in that file
4. WHEN the Ts_Nocheck_Directive is removed from `src/utils/smart-features.ts`, THE Frontend SHALL compile without type errors in that file
5. WHEN the Ts_Nocheck_Directive is removed from `src/types/eligibility.ts`, THE Frontend SHALL compile without type errors in that file
6. WHEN the Ts_Nocheck_Directive is removed from `src/pages/student/Settings.tsx`, THE Frontend SHALL compile without type errors in that file
7. WHEN the Ts_Nocheck_Directive is removed from `src/pages/student/ApplicationStatus.tsx`, THE Frontend SHALL compile without type errors in that file
8. WHEN the Ts_Nocheck_Directive is removed from `src/pages/student/Dashboard.tsx`, THE Frontend SHALL compile without type errors in that file
9. WHEN the Ts_Nocheck_Directive is removed from `src/pages/student/ApplicationDetail.tsx`, THE Frontend SHALL compile without type errors in that file
10. WHEN the Ts_Nocheck_Directive is removed from `src/pages/student/applicationWizard/types.ts`, THE Frontend SHALL compile without type errors in that file
11. WHEN the Ts_Nocheck_Directive is removed from `src/pages/student/NotificationSettings.tsx`, THE Frontend SHALL compile without type errors in that file
12. WHEN the Ts_Nocheck_Directive is removed from `src/pages/student/applicationWizard/hooks/useWizardController.ts`, THE Frontend SHALL compile without type errors in that file
13. WHEN all Ts_Nocheck_Directives are removed, THE Frontend SHALL pass `bun run type-check` with zero errors
14. WHEN fixing type errors in each file, THE Frontend SHALL preserve the existing runtime behavior of the component or utility


### Requirement 2: Enable TypeScript Strict Mode

**User Story:** As a developer, I want TypeScript strict mode enabled in the project configuration, so that the compiler enforces the strongest type safety guarantees across the entire codebase.

#### Acceptance Criteria

1. THE Frontend `tsconfig.json` SHALL set `strict` to `true`
2. WHEN `strict` is set to `true`, THE Frontend SHALL remove the individually specified `strictNullChecks` and `noImplicitAny` options since they are implied by `strict`
3. THE Frontend SHALL add `noUncheckedIndexedAccess: true` to `tsconfig.json` compilerOptions to catch unsafe indexed access patterns
4. WHEN TypeScript_Strict_Mode is enabled, THE Frontend SHALL pass `bun run type-check` with zero errors
5. WHEN TypeScript_Strict_Mode is enabled, THE Frontend SHALL pass `bun run build` successfully
6. IF enabling `strict: true` introduces errors in third-party type declarations, THEN THE Frontend SHALL address those errors with targeted type assertions or declaration overrides rather than disabling strict mode

### Requirement 3: Complete logApiError Integration Across All Services

**User Story:** As a developer, I want every service module to use the structured `logApiError` utility for error logging, so that no API error is silently swallowed and all failures are visible in the browser console with consistent diagnostic fields.

#### Acceptance Criteria

1. WHEN an API call fails in `src/services/auth.ts`, THE Service_Layer SHALL log the error using LogApiError with the context `'auth'` and the failing endpoint path
2. WHEN an API call fails in `src/services/sessionService.ts`, THE Service_Layer SHALL log the error using LogApiError with the context `'session'` and the failing endpoint path
3. WHEN an API call fails in `src/services/pushNotificationManager.ts`, THE Service_Layer SHALL log the error using LogApiError with the context `'push-notifications'` and the failing endpoint path
4. WHEN an API call fails in `src/services/admin/audit.ts`, THE Service_Layer SHALL log the error using LogApiError with the context `'admin-audit'` and the failing endpoint path
5. WHEN an API call fails in `src/services/admin/users.ts`, THE Service_Layer SHALL log the error using LogApiError with the context `'admin-users'` and the failing endpoint path
6. THE Service_Layer SHALL NOT have any catch block that discards error information without calling LogApiError or `console.error`
7. WHEN LogApiError is added to a service, THE Service_Layer SHALL preserve the existing error propagation behavior (re-throw if the caller expects it, return fallback if the caller expects it)

### Requirement 4: Migrate Chart Colors to Design Tokens

**User Story:** As a developer, I want chart colors to reference the design token system instead of hardcoded hex values, so that color changes propagate consistently across all visual components.

#### Acceptance Criteria

1. THE Design_Token_System SHALL include a `chart` color category with semantic names for chart-specific colors (success, warning, destructive, primary, purple)
2. WHEN the Chart_Colors_Module is updated, THE Frontend SHALL reference values from the Design_Token_System instead of hardcoded hex strings
3. WHEN `EligibilityDashboard.tsx` renders charts, THE Frontend SHALL use chart colors sourced from the Design_Token_System
4. WHEN chart colors are migrated, THE Frontend SHALL maintain the same visual appearance (identical hex values moved to tokens, not changed)
5. THE Chart_Colors_Module SHALL serve as a convenience re-export from the Design_Token_System rather than an independent source of color values

### Requirement 5: Fix Inline SVG Hardcoded Colors

**User Story:** As a developer, I want inline SVG elements to use design token colors instead of hardcoded hex values, so that the design system is the single source of truth for all colors.

#### Acceptance Criteria

1. WHEN `EnhancedFormComponents.tsx` renders a select dropdown with an SVG chevron, THE Frontend SHALL use the neutral-500 color from the Design_Token_System (`#6B7280`) instead of the hardcoded `%236b7280` in the SVG data URI
2. THE Frontend SHALL define a utility or constant that provides the SVG data URI with the design token color value, so that future color changes only require updating the token
3. WHEN the inline SVG color is migrated, THE Frontend SHALL maintain the same visual appearance

### Requirement 6: Consolidate Admin Color Palette into Design Tokens

**User Story:** As a developer, I want the admin-specific color palette to be defined in the design token system and referenced from the Tailwind configuration, so that all color definitions have a single source of truth.

#### Acceptance Criteria

1. THE Design_Token_System SHALL include an `admin` color category with values for background, card, border, text, text-secondary, and text-muted
2. WHEN the Admin_Color_Palette is consolidated, THE `tailwind.config.js` admin color definitions SHALL reference values from the Design_Token_System
3. WHEN admin colors are consolidated, THE Frontend SHALL maintain the same visual appearance and WCAG contrast ratios documented in the Tailwind config comments
4. THE Frontend SHALL NOT have admin-specific color hex values defined in both `tailwind.config.js` and `src/design-system/tokens.ts` independently — one SHALL be the source and the other SHALL reference it


### Requirement 7: Audit Components for Non-Token Color Usage

**User Story:** As a developer, I want all components to use design tokens or Tailwind semantic classes for colors instead of raw hex values, so that the design system is consistently applied.

#### Acceptance Criteria

1. THE Frontend SHALL have zero hardcoded hex color values in component TSX files outside of the Design_Token_System, Chart_Colors_Module, or Tailwind configuration
2. WHEN a component uses a color that exists in the Design_Token_System, THE component SHALL reference the token rather than a raw hex value or arbitrary Tailwind value
3. IF a component requires a color not present in the Design_Token_System, THEN THE developer SHALL add the color to the Design_Token_System before using it in the component
4. THE Frontend SHALL document any intentional exceptions (e.g., third-party library requirements) with inline comments explaining why a hardcoded color is necessary

### Requirement 8: Create Verification Tests for Untested Pages

**User Story:** As a developer, I want every page to have a dedicated test file that verifies it renders correctly with mocked Django API responses, so that regressions in page rendering are caught automatically.

#### Acceptance Criteria

1. THE Frontend SHALL include a Page_Verification_Test for `LandingPage.tsx` that asserts the page renders its key content sections without errors
2. THE Frontend SHALL include a Page_Verification_Test for `ContactPage.tsx` that mocks form submission and asserts the contact form renders and accepts input
3. THE Frontend SHALL include a Page_Verification_Test for `NotFoundPage.tsx` that asserts the 404 page renders with a navigation link back to the home page
4. THE Frontend SHALL include a Page_Verification_Test for `public/tracker/index.tsx` that mocks the application tracking API response and asserts the tracker renders search results
5. THE Frontend SHALL include a Page_Verification_Test for `admin/Programs.tsx` that mocks the catalog programs API response and asserts the programs table renders with data
6. THE Frontend SHALL include a Page_Verification_Test for `admin/Intakes.tsx` that mocks the catalog intakes API response and asserts the intakes table renders with data
7. THE Frontend SHALL include a Page_Verification_Test for `admin/Settings.tsx` that asserts the admin settings page renders its configuration sections
8. THE Frontend SHALL include a Page_Verification_Test for `admin/AuditTrail.tsx` that mocks the audit logs API response and asserts the audit log table renders with entries
9. THE Frontend SHALL include a Page_Verification_Test for `student/Interview.tsx` that mocks the interviews API response and asserts the interview scheduling UI renders correctly
10. EACH Page_Verification_Test SHALL mock ApiClient responses with Django API response shapes matching the actual backend serializer output
11. EACH Page_Verification_Test SHALL be runnable via `cd apps/admissions && bun run test` and SHALL pass in CI
12. EACH Page_Verification_Test SHALL be placed in `apps/admissions/tests/unit/page-verification/`

### Requirement 9: Fix bulkStatus Payload Naming Inconsistency

**User Story:** As a developer, I want the bulkStatus interface and JSON payload to use consistent naming conventions, so that the code is clear about the data transformation happening at the API boundary.

#### Acceptance Criteria

1. THE `applicationService.bulkStatus` method SHALL accept a parameter object with `applicationIds` (camelCase) as the TypeScript interface field name
2. WHEN serializing the bulkStatus payload to JSON, THE Service_Layer SHALL transform `applicationIds` to `application_ids` (snake_case) for the Django API
3. THE Service_Layer SHALL include an inline comment at the serialization point documenting the camelCase-to-snake_case transformation for the BulkStatus_Endpoint
4. THE Frontend SHALL maintain the existing runtime behavior of the bulk status operation

### Requirement 10: Document Interviews N+1 as Known Limitation

**User Story:** As a developer, I want the interviews N+1 query pattern to be documented as a known limitation with a clear path to resolution, so that future developers understand the performance trade-off and the planned fix.

#### Acceptance Criteria

1. THE `interviewsService.list()` method in `src/services/interviews.ts` SHALL include a `TODO` comment documenting the N+1 pattern: fetching all applications then making N parallel interview requests
2. THE `TODO` comment SHALL reference the recommended backend fix: a `GET /api/v1/interviews/?mine=true` endpoint that returns all interviews for the authenticated user in a single query
3. THE `TODO` comment SHALL note that the current semaphore-based concurrency limiter (max 5 parallel requests) mitigates but does not eliminate the N+1 problem
4. THE Frontend SHALL NOT change the runtime behavior of `interviewsService.list()` — this requirement is documentation-only


### Requirement 11: Page-by-Page Functional Verification

**User Story:** As a developer, I want every page in the application to be verified for correct rendering with Django API responses, including error states, empty states, and loading states, so that the entire user experience is validated end-to-end.

#### Acceptance Criteria

1. EACH page in the Frontend route configuration SHALL render without JavaScript errors when provided with valid mocked Django API responses
2. EACH page that loads data from the Django API SHALL display an appropriate loading state while data is being fetched
3. EACH page that loads data from the Django API SHALL display an appropriate error state when the API returns an error response
4. EACH page that loads data from the Django API SHALL display an appropriate empty state when the API returns an empty result set
5. WHEN a page has navigation links or route transitions, THE Frontend SHALL verify that the links point to valid routes defined in the route configuration
6. THE Frontend route configuration SHALL have zero routes pointing to undefined or non-existent page components
7. THE Frontend SHALL verify that all 40+ routes defined in `src/routes/config.tsx` resolve to renderable components

### Requirement 12: TypeScript Build Integrity After All Changes

**User Story:** As a developer, I want the entire codebase to compile cleanly after all quality hardening changes, so that no regression is introduced by the hardening work.

#### Acceptance Criteria

1. WHEN all requirements in this spec are implemented, THE Frontend SHALL pass `bun run type-check` with zero errors
2. WHEN all requirements in this spec are implemented, THE Frontend SHALL pass `bun run build` successfully
3. WHEN all requirements in this spec are implemented, THE Frontend SHALL pass `bun run test` with all tests passing
4. WHEN all requirements in this spec are implemented, THE Frontend SHALL pass `bun run lint` with zero errors or warnings
5. IF a lint rule conflict arises from stricter TypeScript settings, THEN THE Frontend SHALL update the ESLint configuration to align with the new TypeScript strictness rather than suppressing the TypeScript compiler
