# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Profile Completeness Sparse Fallback & Missing Metadata
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the three bug facets exist
  - **Test file**: `apps/admissions/tests/property/profileCompletenessBugCondition.property.test.ts`
  - **Scoped PBT Approach**: Use fast-check to generate `User` objects with `full_name` present and `user_metadata` absent
  - Test 1 — `getUserMetadata` ignores top-level fields: call `getUserMetadata({ id: '1', email: 'test@example.com', role: 'student', full_name: 'John Doe' })` and assert `result.full_name` is defined. On unfixed code `getUserMetadata` returns `{ email }` only when `user_metadata` is absent (from Bug Condition `getUserMetadataIgnoresTopLevelFields` in design)
  - Test 2 — Sparse fallback missing `first_name`/`last_name`: for any `User` with non-empty `full_name`, build the fallback profile object `{ id, user_id, email, role, full_name }` and assert it includes `first_name` and `last_name` derived from `full_name`. On unfixed code the fallback lacks these fields (from Bug Condition `fallbackProfileMissingAvailableFields` in design)
  - Test 3 — Wrapped auth error not detected: create error `{ status: 401 }` without `name: 'AuthenticationError'` and assert the catch block re-throws it. On unfixed code the check only looks at `err.name` so wrapped 401 errors silently produce fallback (from design Property 3)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bug exists)
  - Document counterexamples found: `getUserMetadata` returns `{ email }` discarding `full_name`; fallback profile has no `first_name`/`last_name`; wrapped 401 errors produce fallback instead of propagating
  - Mark task complete when tests are written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - getUserMetadata With Populated user_metadata & Completion Calculation
  - **IMPORTANT**: Follow observation-first methodology
  - **Test file**: `apps/admissions/tests/property/profileCompletenessPreservation.property.test.ts`
  - Observe: `getUserMetadata({ id: '1', email: 'test@example.com', role: 'student', full_name: 'Bob Jones', user_metadata: { full_name: 'Bob Jones', phone: '0971234567' } })` returns `{ full_name: 'Bob Jones', phone: '0971234567', email: ... }` on unfixed code
  - Observe: `calculateCanonicalProfileCompletion` with a full 9-field profile returns 100% on unfixed code
  - Observe: errors with `name: 'AuthenticationError'` are re-thrown on unfixed code
  - Write property-based test (fast-check): for all `User` objects with populated `user_metadata`, `getUserMetadata` output includes all fields from `user_metadata` and `signup_data` (from design Property 4, Preservation Requirements)
  - Write property-based test: for all profile + metadata inputs, `calculateCanonicalProfileCompletion` returns the same proportional percentage based on 9 required fields (from design Property 6, function is NOT modified)
  - Write property-based test: for all errors with `name === 'AuthenticationError'`, the auth error detection continues to identify and re-throw them (from design Property 5, Preservation Requirements)
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7_

- [x] 3. Fix profile completeness bug — enrich fallback profile, getUserMetadata, and auth error detection

  - [x] 3.1 Add `first_name` and `last_name` to `User` interface
    - File: `apps/admissions/src/types/auth.ts`
    - Add optional `first_name?: string` and `last_name?: string` fields to the `User` interface to match JWT token claims from `generate_access_token` in `tokens.py`
    - _Bug_Condition: User type lacks first_name/last_name even though JWT includes them_
    - _Expected_Behavior: User interface includes all JWT claim fields_
    - _Requirements: 2.1_

  - [x] 3.2 Enrich fallback profile and improve auth error detection in `useProfileQuery`
    - File: `apps/admissions/src/hooks/auth/useProfileQuery.ts`
    - Extend auth error check: `if ((err as any).name === 'AuthenticationError' || (err as any).status === 401)` to detect wrapped 401 errors
    - Enrich fallback object: add `first_name` derived from `user.first_name ?? user.full_name?.split(/\s+/)[0]` and `last_name` derived from `user.last_name ?? user.full_name?.split(/\s+/).slice(1).join(' ')`
    - _Bug_Condition: isBugCondition(input) where apiCallFails AND NOT errorIsAuth AND fallbackProfileMissingAvailableFields(user)_
    - _Expected_Behavior: fallback includes first_name, last_name; wrapped 401 errors are re-thrown_
    - _Preservation: Successful API responses return sanitized data as-is; name-based AuthenticationError continues to propagate_
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.3 Enrich `getUserMetadata` with top-level User fields
    - File: `apps/admissions/src/hooks/useProfileAutoPopulation.ts`
    - Before the early return when `user_metadata` is absent, extract `full_name` from `user.full_name`, `first_name` from `user.first_name`, `last_name` from `user.last_name` into the result object
    - When `user_metadata` IS present, use top-level `User` fields (`user.full_name`, `user.first_name`, `user.last_name`) as fallbacks for missing metadata fields
    - _Bug_Condition: getUserMetadataIgnoresTopLevelFields(user) where user.full_name IS NOT EMPTY AND user.user_metadata IS EMPTY AND getUserMetadata(user).full_name IS UNDEFINED_
    - _Expected_Behavior: getUserMetadata returns full_name, first_name, last_name from top-level User fields when user_metadata is absent_
    - _Preservation: getUserMetadata extraction from user_metadata and signup_data continues to work as before_
    - _Requirements: 2.3, 2.4_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Profile Completeness Enriched Fallback & Metadata
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (enriched fallback, getUserMetadata with top-level fields, robust auth error detection)
    - Run `bun run test:admissions` targeting `profileCompletenessBugCondition.property.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - getUserMetadata With Populated user_metadata & Completion Calculation
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run `bun run test:admissions` targeting `profileCompletenessPreservation.property.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm getUserMetadata with populated user_metadata produces identical output
    - Confirm calculateCanonicalProfileCompletion returns same results
    - Confirm AuthenticationError name-based detection still works

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `bun run test:admissions`
  - Ensure all property tests pass (both bug condition and preservation)
  - Ensure no regressions in existing test suite
  - Ask the user if questions arise
