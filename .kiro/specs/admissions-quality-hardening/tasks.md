# Implementation Plan: Admissions Quality Hardening

## Overview

Quality hardening for `apps/admissions/` covering TypeScript safety, error visibility, design token consolidation, page verification tests, service layer polish, and build integrity. No new features — all changes strengthen existing code within the admissions frontend.

Implementation language: TypeScript (React 18 + Vite SPA).

## Tasks

- [x] 1. Create `toError()` utility
  - [x] 1.1 Create `apps/admissions/src/lib/toError.ts` with the `toError(value: unknown): Error` function
    - Accept any `unknown` value and return an `Error` instance
    - If `value instanceof Error`, return it directly
    - Otherwise wrap with `new Error(String(value))`
    - Export as a named export
    - _Requirements: 2.4, 2.6_

  - [x] 1.2 Write property test for `toError` (Property 9)
    - **Property 9: toError utility always returns an Error instance**
    - Use `fc.anything()` to generate arbitrary JS values
    - Assert `toError(value)` always returns an `instanceof Error` with a non-empty `message`
    - Place in `apps/admissions/tests/property/quality-hardening.property.test.ts`
    - **Validates: Requirements 2.4**

- [x] 2. Consolidate design tokens
  - [x] 2.1 Add `chart` and `admin` color categories to `apps/admissions/src/design-system/tokens.ts`
    - Add `chart: { success: '#047857', warning: '#b45309', destructive: '#cc2424', primary: '#2563eb', purple: '#7c3aed' }`
    - Add `admin: { bg: '#f9fafb', card: '#ffffff', border: '#858c98', text: '#111827', textSecondary: '#374151', textMuted: '#6b7280' }`
    - _Requirements: 4.1, 6.1_

  - [x] 2.2 Update `apps/admissions/src/lib/chartColors.ts` to re-export from design tokens
    - Replace hardcoded hex values with `import { designTokens } from '@/design-system/tokens'`
    - Export `CHART_COLORS = designTokens.colors.chart`
    - _Requirements: 4.2, 4.4, 4.5_

  - [x] 2.3 Write property test for chart color token identity (Property 3)
    - **Property 3: Chart colors are identical between token system and chart module**
    - Assert every key in `CHART_COLORS` equals the corresponding `designTokens.colors.chart` value
    - Assert the key sets are identical
    - Place in `apps/admissions/tests/property/quality-hardening.property.test.ts`
    - **Validates: Requirements 4.2, 4.4, 4.5**

  - [x] 2.4 Create a shared color values JS file for ESM/CJS interop and update Tailwind config
    - Create `apps/admissions/src/design-system/tokens.colors.js` (or similar adapter) exporting raw admin color values consumable by CommonJS `tailwind.config.js`
    - Update `apps/admissions/tailwind.config.js` admin color block to reference the shared values instead of hardcoded hex strings
    - Ensure `tokens.ts` re-exports or references the same shared values
    - Preserve WCAG contrast ratio comments in Tailwind config
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 2.5 Add SVG data URI constant using design token neutral-500 color
    - Define `SELECT_CHEVRON_SVG` constant in `apps/admissions/src/design-system/tokens.ts` (or a small helper)
    - Replace the hardcoded `%236b7280` in `apps/admissions/src/components/ui/EnhancedFormComponents.tsx` with the token-derived constant
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 3. Integrate `logApiError` across 6 services
  - [x] 3.1 Add `logApiError` to `apps/admissions/src/services/auth.ts`
    - Wrap each method in try/catch, call `logApiError('auth', endpoint, error)`, then re-throw
    - Preserve existing error propagation (all methods currently throw to callers)
    - _Requirements: 3.1, 3.7_

  - [x] 3.2 Add `logApiError` to `apps/admissions/src/services/sessionService.ts`
    - Add `logApiError('session', endpoint, error)` in each existing catch block before the existing return statement
    - Preserve existing fallback return behavior (`{ success: false, ... }`)
    - _Requirements: 3.2, 3.7_

  - [x] 3.3 Add `logApiError` to `apps/admissions/src/services/pushNotificationManager.ts`
    - Replace or supplement `console.error` calls with `logApiError('push-notifications', endpoint, error)`
    - Preserve existing return behavior (returns `false` or continues)
    - _Requirements: 3.3, 3.7_

  - [x] 3.4 Add `logApiError` to `apps/admissions/src/services/admin/audit.ts`
    - Add `logApiError('admin-audit', endpoint, error)` in the existing catch block before re-throw
    - Preserve existing re-throw behavior
    - _Requirements: 3.4, 3.7_

  - [x] 3.5 Add `logApiError` to `apps/admissions/src/services/admin/users.ts`
    - Wrap methods in try/catch, call `logApiError('admin-users', endpoint, error)`, then re-throw
    - Preserve existing error propagation (all methods currently throw to callers)
    - _Requirements: 3.5, 3.7_

  - [x] 3.6 Add `logApiError` to `apps/admissions/src/services/cacheMonitor.ts`
    - Add `logApiError('cache-monitor', endpoint, error)` alongside existing `console.error` calls
    - Preserve existing return behavior (returns `null` or continues)
    - _Requirements: 3.6, 3.7_

  - [x] 3.7 Write property tests for logApiError integration (Properties 1 and 2)
    - **Property 1: logApiError is called on API failure for all instrumented services**
    - **Property 2: Error propagation behavior is preserved after logApiError integration**
    - Use `fc.constantFrom(...serviceNames)` and `fc.string()` for endpoints
    - Assert `logApiError` is called with correct context and endpoint on API failure
    - Assert throw/return behavior matches pre-integration contract
    - Place in `apps/admissions/tests/property/quality-hardening.property.test.ts`
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7**

- [x] 4. Checkpoint — Verify tokens and services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Remove `@ts-nocheck` directives (small files first)
  - [x] 5.1 Fix and remove `@ts-nocheck` from `apps/admissions/src/types/eligibility.ts`
    - Remove the directive and fix all resulting type errors
    - Use `toError()` for catch blocks accessing `error.message`
    - Preserve existing runtime behavior
    - _Requirements: 1.5, 1.13, 1.14_

  - [x] 5.2 Fix and remove `@ts-nocheck` from `apps/admissions/src/utils/api-cache.ts`
    - Remove the directive and fix all resulting type errors
    - Add index signatures or `Record<string, T>` for loose object indexing
    - Preserve existing runtime behavior
    - _Requirements: 1.3, 1.13, 1.14_

  - [x] 5.3 Fix and remove `@ts-nocheck` from `apps/admissions/src/utils/smart-features.ts`
    - Remove the directive and fix all resulting type errors
    - Add index signatures or `Record<string, T>` for loose object indexing
    - Preserve existing runtime behavior
    - _Requirements: 1.4, 1.13, 1.14_

  - [x] 5.4 Fix and remove `@ts-nocheck` from `apps/admissions/src/components/ui/EnhancedFormComponents.tsx`
    - Remove the directive and fix all resulting type errors
    - Fix Zod schema `.shape` access with `z.infer` or appropriate casts
    - Preserve existing runtime behavior
    - _Requirements: 1.2, 1.13, 1.14_

  - [x] 5.5 Fix and remove `@ts-nocheck` from `apps/admissions/src/pages/student/Settings.tsx`
    - Remove the directive and fix all resulting type errors
    - Add explicit parameter types for event handlers
    - Add null checks for optional chaining
    - Preserve existing runtime behavior
    - _Requirements: 1.6, 1.13, 1.14_

  - [x] 5.6 Fix and remove `@ts-nocheck` from `apps/admissions/src/pages/student/ApplicationStatus.tsx`
    - Remove the directive and fix all resulting type errors
    - Add explicit parameter types and null checks
    - Preserve existing runtime behavior
    - _Requirements: 1.7, 1.13, 1.14_

  - [x] 5.7 Fix and remove `@ts-nocheck` from `apps/admissions/src/pages/student/Dashboard.tsx`
    - Remove the directive and fix all resulting type errors
    - Add explicit parameter types and null checks
    - Preserve existing runtime behavior
    - _Requirements: 1.8, 1.13, 1.14_

  - [x] 5.8 Fix and remove `@ts-nocheck` from `apps/admissions/src/pages/student/ApplicationDetail.tsx`
    - Remove the directive and fix all resulting type errors
    - Add explicit parameter types and null checks
    - Preserve existing runtime behavior
    - _Requirements: 1.9, 1.13, 1.14_

  - [x] 5.9 Fix and remove `@ts-nocheck` from `apps/admissions/src/pages/student/NotificationSettings.tsx`
    - Remove the directive and fix all resulting type errors
    - Add explicit parameter types and null checks
    - Preserve existing runtime behavior
    - _Requirements: 1.11, 1.13, 1.14_

  - [x] 5.10 Fix and remove `@ts-nocheck` from `apps/admissions/src/pages/student/applicationWizard/types.ts`
    - Remove the directive and fix all resulting type errors
    - Add explicit generic parameters on `useForm<T>()` calls if present
    - Preserve existing runtime behavior
    - _Requirements: 1.10, 1.13, 1.14_

  - [x] 5.11 Fix and remove `@ts-nocheck` from `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts`
    - This is the largest file (1733 lines) — tackle last among @ts-nocheck files
    - Remove the directive and fix all resulting type errors
    - Add explicit generic parameters on `useForm<T>()` calls
    - Use `toError()` for catch blocks
    - Add explicit parameter types for event handlers and callbacks
    - Preserve existing runtime behavior
    - _Requirements: 1.12, 1.13, 1.14_

- [x] 6. Checkpoint — Verify @ts-nocheck removal
  - Run `bun run type-check` and `bun run build` to confirm zero errors after all directives removed
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Enable TypeScript strict mode
  - [x] 7.1 Update `apps/admissions/tsconfig.json` to enable strict mode
    - Set `"strict": true`
    - Remove `"strictNullChecks": true` and `"noImplicitAny": true` (implied by strict)
    - Add `"noUncheckedIndexedAccess": true`
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 7.2 Fix all new type errors introduced by strict mode across the codebase
    - Apply `toError()` utility to all catch blocks that access `error.message` without a type guard (from `useUnknownInCatchVariables`)
    - Fix `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, and `alwaysStrict` errors
    - Address any third-party type declaration issues with targeted type assertions
    - Run `bun run type-check` until zero errors
    - _Requirements: 2.4, 2.5, 2.6_

- [x] 8. Checkpoint — Verify strict mode
  - Run `bun run type-check` and `bun run build` to confirm zero errors with strict mode enabled
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Service layer polish
  - [x] 9.1 Add inline comment to `applicationService.bulkStatus` documenting camelCase-to-snake_case transformation
    - Add comment at the serialization point in `apps/admissions/src/services/applications.ts` where `applicationIds` becomes `application_ids`
    - Do not change runtime behavior
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 9.2 Write property test for bulkStatus serialization (Property 4)
    - **Property 4: bulkStatus serializes applicationIds to snake_case**
    - Use `fc.array(fc.uuid())` for application IDs and `fc.string()` for status
    - Mock `apiClient.request` and assert the JSON body contains `application_ids` (snake_case)
    - Place in `apps/admissions/tests/property/quality-hardening.property.test.ts`
    - **Validates: Requirements 9.1, 9.2**

  - [x] 9.3 Add N+1 TODO documentation to `interviewsService.list()` in `apps/admissions/src/services/interviews.ts`
    - Add a `TODO` block comment documenting the N+1 pattern
    - Reference the recommended backend fix: `GET /api/v1/interviews/?mine=true`
    - Note the current semaphore mitigation (max 5 concurrent)
    - Do not change runtime behavior
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 10. Page verification tests
  - [x] 10.1 Create `apps/admissions/tests/unit/page-verification/landing-page.test.tsx`
    - Mock relevant services and render `LandingPage`
    - Assert key content sections render without errors
    - _Requirements: 8.1, 8.10, 8.11, 8.12_

  - [x] 10.2 Create `apps/admissions/tests/unit/page-verification/contact-page.test.tsx`
    - Mock form submission and render `ContactPage`
    - Assert the contact form renders and accepts input
    - _Requirements: 8.2, 8.10, 8.11, 8.12_

  - [x] 10.3 Create `apps/admissions/tests/unit/page-verification/not-found-page.test.tsx`
    - Render `NotFoundPage`
    - Assert 404 content renders with a navigation link back to home
    - _Requirements: 8.3, 8.10, 8.11, 8.12_

  - [x] 10.4 Create `apps/admissions/tests/unit/page-verification/public-tracker.test.tsx`
    - Mock the application tracking API response with Django API shapes
    - Assert the tracker renders search results
    - _Requirements: 8.4, 8.10, 8.11, 8.12_

  - [x] 10.5 Create `apps/admissions/tests/unit/page-verification/admin-programs.test.tsx`
    - Mock the catalog programs API response with Django API shapes
    - Assert the programs table renders with data
    - _Requirements: 8.5, 8.10, 8.11, 8.12_

  - [x] 10.6 Create `apps/admissions/tests/unit/page-verification/admin-intakes.test.tsx`
    - Mock the catalog intakes API response with Django API shapes
    - Assert the intakes table renders with data
    - _Requirements: 8.6, 8.10, 8.11, 8.12_

  - [x] 10.7 Create `apps/admissions/tests/unit/page-verification/admin-settings.test.tsx`
    - Render `admin/Settings`
    - Assert the admin settings page renders its configuration sections
    - _Requirements: 8.7, 8.10, 8.11, 8.12_

  - [x] 10.8 Create `apps/admissions/tests/unit/page-verification/admin-audit-trail.test.tsx`
    - Mock the audit logs API response with Django API shapes
    - Assert the audit log table renders with entries
    - _Requirements: 8.8, 8.10, 8.11, 8.12_

  - [x] 10.9 Create `apps/admissions/tests/unit/page-verification/student-interview.test.tsx`
    - Mock the interviews API response with Django API shapes
    - Assert the interview scheduling UI renders correctly
    - _Requirements: 8.9, 8.10, 8.11, 8.12_

- [x] 11. Write property test for route config completeness (Property 5)
  - **Property 5: All route config entries resolve to defined components**
  - Iterate the `routes` array from `src/routes/config.tsx`
  - Assert every route's `element` field is defined (not `undefined` or `null`)
  - Place in `apps/admissions/tests/property/quality-hardening.property.test.ts`
  - **Validates: Requirements 11.6, 11.7**

- [x] 12. Color audit
  - [x] 12.1 Audit all component TSX files for non-token hex color usage
    - Search for hardcoded hex values in `apps/admissions/src/components/**/*.tsx` and `apps/admissions/src/pages/**/*.tsx`
    - Replace any found hex values with design token references or Tailwind semantic classes
    - If a color is not in the token system, add it to `tokens.ts` first
    - Document any intentional exceptions with inline comments
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [-] 13. Final build integrity checkpoint
  - Run `bun run type-check` — zero errors
  - Run `bun run build` — successful
  - Run `bun run test` — all tests passing
  - Run `bun run lint` — zero errors or warnings
  - If lint rule conflicts arise from stricter TypeScript, update ESLint config to align
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after major phases
- Property tests validate universal correctness properties from the design document
- `useWizardController.ts` (task 5.11) is intentionally last among @ts-nocheck files — it's the largest and most complex
- Strict mode (task 7) is enabled AFTER all @ts-nocheck files are clean to avoid compounding errors
- The Tailwind config adapter (task 2.4) needs careful ESM/CJS boundary handling
- Properties 6–8 (page rendering) are covered by the unit test page verification tasks (10.1–10.9), not fast-check property tests
