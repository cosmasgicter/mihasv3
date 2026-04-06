# Implementation Plan: Profile Updates

## Overview

Enable end-to-end student profile editing by adding a Django PATCH/GET endpoint at `/api/v1/auth/profile/`, wiring the frontend mutation in `useProfileQuery.ts` with optimistic updates, and enabling the Settings page form for editing. Backend uses Python (Django + DRF), frontend uses TypeScript (React + React Query). No database migration needed — the `profiles` table already has all required columns.

## Tasks

- [x] 1. Backend serializers and view
  - [x] 1.1 Add `ProfileReadSerializer` and `ProfileUpdateSerializer` to `backend/apps/accounts/serializers.py`
    - `ProfileReadSerializer`: read-only fields `id`, `email`, `role`, `full_name`, `phone`, `date_of_birth`, `sex`, `residence_town`, `country`, `nrc_number`, `address`, `nationality`, `next_of_kin_name`, `next_of_kin_phone`, `updated_at`
    - `ProfileUpdateSerializer`: writable fields `full_name`, `phone`, `date_of_birth`, `sex`, `residence_town`, `country`, `nrc_number`, `address`, `nationality`, `next_of_kin_name`, `next_of_kin_phone`
    - `phone` validated via `validate_zambian_phone` when non-empty
    - `sex` as `ChoiceField` with `['Male', 'Female']`
    - `full_name` with `min_length=2`
    - `nationality` normalized via `normalize_nationality`
    - All fields optional, empty strings accepted (partial update semantics)
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 1.2 Add `ProfileView` to `backend/apps/accounts/views.py`
    - `APIView` with `IsAuthenticated` permission
    - `GET`: return authenticated user's profile via `ProfileReadSerializer`
    - `PATCH`: validate with `ProfileUpdateSerializer(partial=True)`, update profile, set `updated_at` to current timestamp, return updated profile via `ProfileReadSerializer`
    - Validation errors return 400 with `{"success": false, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": {...}}`
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 6.2, 6.4_

  - [x] 1.3 Register the profile URL in `backend/apps/accounts/urls.py`
    - Add `path("profile/", ProfileView.as_view(), name="auth-profile")`
    - Import `ProfileView` in the urls module
    - _Requirements: 1.1, 6.2_

  - [ ]* 1.4 Write property tests for backend profile update
    - Create `backend/tests/property/test_profile_update_properties.py`
    - **Property 1: Profile update round-trip** — For any valid subset of editable fields, PATCH then GET returns patched values unchanged and non-patched values preserved
    - **Validates: Requirements 1.1, 1.2, 6.2, 6.4**
    - **Property 2: Protected fields are immutable through PATCH** — PATCH with protected fields (`id`, `email`, `role`, `password_hash`, `is_active`, `created_at`) leaves them unchanged
    - **Validates: Requirements 1.3**
    - **Property 3: updated_at advances on every successful update** — After a valid PATCH, `updated_at` is >= the pre-PATCH value
    - **Validates: Requirements 1.6**
    - **Property 4: Invalid field values produce validation errors** — Invalid phone, date_of_birth, sex, or full_name returns 400 with field-keyed error details
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6**

  - [ ]* 1.5 Write unit tests for backend profile endpoint
    - Create `backend/tests/unit/test_profile_endpoint.py`
    - Unauthenticated PATCH returns 401 (Requirement 1.4)
    - Missing CSRF token returns 403 (Requirement 1.5)
    - GET returns full profile with all expected fields (Requirement 6.4)
    - Empty PATCH body returns 200 with unchanged profile (Requirement 2.7)
    - _Requirements: 1.4, 1.5, 2.7, 6.4_

- [x] 2. Checkpoint — Backend endpoint complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Database schema verification
  - [x] 3.1 Verify Neon Postgres `profiles` table schema via Neon MCP
    - Confirm all editable columns exist: `full_name`, `phone`, `date_of_birth`, `sex`, `residence_town`, `country`, `nrc_number`, `address`, `nationality`, `next_of_kin_name`, `next_of_kin_phone`
    - Confirm `updated_at` column exists with type `timestamptz`
    - Confirm column types match Django model field definitions
    - If any column is missing, use Neon MCP to add it with appropriate type and NULL default
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Frontend mutation and profile query
  - [x] 4.1 Update `useProfileQuery.ts` with real query and mutation
    - Replace stub `queryFn` to fetch from `GET /api/v1/auth/profile/` via `apiClient.request()`
    - Fall back to session-based profile construction on GET failure
    - Replace no-op `mutationFn` with `PATCH /api/v1/auth/profile/` via `apiClient.request()` sending dirty fields as JSON body
    - Add optimistic update: `onMutate` snapshots cache and writes optimistic data, `onError` rolls back to snapshot, `onSettled` invalidates `user-profile` query
    - Propagate field-level validation errors from 400 responses
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.3, 7.1, 7.2, 7.3_

  - [ ]* 4.2 Write property tests for frontend profile mutation
    - Create `apps/admissions/tests/property/profileUpdates.property.test.ts`
    - **Property 5: Save button reflects form dirty state** — Button enabled iff `isDirty && !updatingProfile`
    - **Validates: Requirements 5.2**
    - **Property 6: Only dirty fields are submitted** — PATCH body contains exactly the dirty fields
    - **Validates: Requirements 5.3**
    - **Property 7: Cache rollback on mutation failure** — On failed PATCH, cache restores to pre-optimistic state
    - **Validates: Requirements 7.1, 7.2**

  - [ ]* 4.3 Write unit tests for frontend profile mutation
    - Create `apps/admissions/tests/unit/profileUpdates.test.ts`
    - GET fallback to session-based profile on failure (Requirement 6.3)
    - Optimistic update applied before server response (Requirement 7.1)
    - _Requirements: 6.3, 7.1_

- [x] 5. Settings page enablement
  - [x] 5.1 Enable editing and wire save on `Settings.tsx`
    - Set `profileEditingEnabled = true`
    - Remove the read-only notice banner block
    - Add `onSubmit` handler that extracts dirty fields from `dirtyFields` and calls `updateProfile`
    - Replace the disabled "Profile editing unavailable" button with a "Save changes" button
    - Save button enabled when `isDirty && !updatingProfile`, shows spinner during save
    - On success: show success toast, reset form dirty state via `reset()` with server data
    - On validation error (400): map `fieldErrors` to React Hook Form `setError()` for inline display
    - On network/server error: show error toast with retry messaging
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 5.2 Write unit tests for Settings page editing
    - Add tests to `apps/admissions/tests/unit/profileUpdates.test.ts`
    - Settings page renders with editing enabled (Requirement 5.1)
    - Read-only banner is not rendered (Requirement 5.8)
    - Success toast shown after save (Requirement 5.5)
    - Field-level errors displayed on validation failure (Requirement 5.6)
    - Error toast shown on network/server error (Requirement 5.7)
    - _Requirements: 5.1, 5.5, 5.6, 5.7, 5.8_

- [x] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- No database migration is needed — schema verification via Neon MCP confirms existing columns
