# Implementation Plan: System Alignment Audit

## Overview

Surgical fixes to align Django backend serializers/models with the Neon Postgres schema and fix frontend catalog service + Intakes page to use correct API field names. Backend first, then frontend, then tests. No DB migrations needed.

## Tasks

- [x] 1. Backend: ApplicationTrackingSerializer and Application model fixes
  - [x] 1.1 Add `institution` to `ApplicationTrackingSerializer.fields`
    - In `backend/apps/applications/serializers.py`, add `"institution"` to the `ApplicationTrackingSerializer.Meta.fields` list
    - The field is already a `CharField` on the `Application` model — no new field definition needed
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Widen `Application` model `max_length` for `program`, `intake`, `institution`
    - In `backend/apps/applications/models.py`, change `program` from `max_length=50` to `max_length=255`
    - Change `intake` from `max_length=50` to `max_length=100`
    - Change `institution` from `max_length=50` to `max_length=255`
    - No migration needed — `managed = False` and Postgres `varchar` has no length constraint
    - _Requirements: 4.7, 4.8, 4.9_

  - [x] 1.3 Write property test: Institution field pass-through identity
    - **Property 1: Institution field pass-through identity**
    - For any string stored in `Application.institution`, `ApplicationTrackingSerializer` returns it unchanged
    - Test in `backend/tests/property/` using `hypothesis`
    - **Validates: Requirements 1.2, 1.3**

  - [x] 1.4 Write property test: Tracking serializer exposes only non-sensitive fields
    - **Property 2: Tracking serializer exposes only non-sensitive fields**
    - Verify serializer output field names are a subset of the allowed set and exclude all sensitive fields
    - Test in `backend/tests/property/` using `hypothesis`
    - **Validates: Requirements 1.1, 1.4**

  - [x] 1.5 Write unit tests for backend model and serializer changes
    - Verify `ApplicationTrackingSerializer.Meta.fields` includes `institution`
    - Verify `Application` model `program.max_length >= 255`, `intake.max_length >= 100`, `institution.max_length >= 255`
    - Verify `ApplicationSerializer` and `ApplicationListSerializer` include `institution`
    - Test in `backend/tests/unit/`
    - _Requirements: 1.1, 4.7, 4.8, 4.9, 5.1, 5.2, 11.2_

- [x] 2. Checkpoint — Backend fixes verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Frontend: Catalog service field alignment
  - [x] 3.1 Fix `Intake` interface in `catalog.ts`
    - In `apps/admissions/src/services/catalog.ts`, replace `total_capacity: number` with `max_capacity: number`
    - Replace `available_spots?: number` with `current_enrollment?: number`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 3.2 Fix `normalizeIntake` function in `catalog.ts`
    - Update to pass `max_capacity` through directly instead of renaming to `total_capacity`
    - Include `current_enrollment` from the raw API response
    - Remove `available_spots` computation from the normalizer
    - _Requirements: 3.4, 9.4, 9.5_

  - [x] 3.3 Fix `buildIntakePayload` function in `catalog.ts`
    - Update to map `max_capacity` directly instead of `data.total_capacity`
    - Remove any `available_spots` from the payload
    - _Requirements: 3.5, 9.6_

  - [x] 3.4 Fix `IntakeFormData` and mutation types in `catalog.ts`
    - Replace `total_capacity` with `max_capacity` in form data types
    - Remove `available_spots` from form data types
    - _Requirements: 3.2, 10.1, 10.2_

  - [x] 3.5 Write property test: normalizeIntake preserves max_capacity
    - **Property 3: normalizeIntake preserves max_capacity without renaming**
    - For any raw intake with numeric `max_capacity`, output has `max_capacity` equal to input and no `total_capacity`
    - Test in `apps/admissions/tests/property/` using `fast-check`
    - **Validates: Requirements 3.4, 9.4, 9.5**

  - [x] 3.6 Write property test: buildIntakePayload maps max_capacity directly
    - **Property 4: buildIntakePayload maps max_capacity directly**
    - For any form data with numeric `max_capacity`, payload has `max_capacity` equal to input and no `total_capacity`
    - Test in `apps/admissions/tests/property/` using `fast-check`
    - **Validates: Requirements 3.2, 3.5, 9.6**

- [x] 4. Frontend: Intakes page field alignment
  - [x] 4.1 Fix `Intakes.tsx` Zod schema, form fields, and table columns
    - In `apps/admissions/src/pages/admin/Intakes.tsx`, replace `total_capacity` with `max_capacity` in the Zod validation schema
    - Replace `total_capacity` with `max_capacity` in form field names and labels
    - Replace `available_spots` column with inline computation: `max_capacity - (current_enrollment ?? 0)`
    - Remove `available_spots` from the create/edit form
    - _Requirements: 3.1, 3.2, 3.3, 3.6_

  - [x] 4.2 Write property test: Available spots computation
    - **Property 5: Available spots computation is correct**
    - For any non-negative `max_capacity` and `current_enrollment`, available spots = `max(max_capacity - current_enrollment, 0)`, never negative
    - Test in `apps/admissions/tests/property/` using `fast-check`
    - **Validates: Requirements 3.3**

  - [x] 4.3 Write property test: Capacity validation rejects non-positive values
    - **Property 6: Capacity validation rejects non-positive values**
    - For any integer ≤ 0, the Zod schema rejects it; for any positive integer, it accepts
    - Test in `apps/admissions/tests/property/` using `fast-check`
    - **Validates: Requirements 3.6**

- [x] 5. Checkpoint — Frontend fixes verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Dead code cleanup and test alignment
  - [x] 6.1 Remove stale `total_capacity` and `available_spots` references
    - Scan frontend code for any remaining references to `total_capacity` or `available_spots` as API field names
    - Remove or update any found references (excluding migration scripts or historical docs)
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 6.2 Write property test: Tracking code pattern accepts all documented formats
    - **Property 7: Tracking code pattern accepts all documented formats**
    - For any string matching APP-YYYYMMDD-XXXXXXXX, MIHAS+9digits, KATC+9digits, TRK-12alphanum, TRK+5-6alphanum, the regex matches; random strings do not match
    - Test in `backend/tests/property/` using `hypothesis`
    - **Validates: Requirements 6.4**

  - [x] 6.3 Write unit tests for dead code removal verification
    - Verify no references to `total_capacity` or `available_spots` as API field names in active frontend code
    - Test in `apps/admissions/tests/unit/`
    - _Requirements: 10.1, 10.2, 11.1_

- [x] 7. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Backend fixes (task 1) are independent and should be done first
- Frontend service fixes (task 3) must precede page fixes (task 4) since `Intakes.tsx` imports from `catalog.ts`
- No database migrations are needed — all model changes are Django-side validation only (`managed = False`)
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and structural checks
