# Profile Completeness Bug — Bugfix Design

## Overview

The student dashboard displays "Profile 33% Complete" even when all 9 required profile fields exist in the database. This happens when the `/auth/profile/` API call fails for non-auth reasons (network error, 500, CORS, timeout). The catch block in `useProfileQuery.ts` falls back to a sparse profile containing only `{id, user_id, email, role, full_name}`, which resolves to 3/9 fields (first_name from full_name split, last_name from full_name split, email) = 33%. Additionally, `getUserMetadata` in `useProfileAutoPopulation.ts` only extracts fields from `user.user_metadata` and ignores top-level `User` fields like `full_name`, `first_name`, `last_name` that are available from JWT token claims.

The fix enriches both the fallback profile and the metadata extraction to use all available data from the `User` object, and improves auth error detection to handle wrapped errors.

## Glossary

- **Bug_Condition (C)**: The `/auth/profile/` API call fails with a non-auth error AND the `User` object has fields (full_name, email, role) that are not fully utilized in the fallback profile or metadata extraction
- **Property (P)**: The fallback profile and metadata extraction should include all available fields from the `User` object, producing an accurate completion percentage
- **Preservation**: Successful API responses, genuine auth error propagation, `calculateCanonicalProfileCompletion` logic, Settings page behavior, and `getUserMetadata` behavior when `user_metadata` is populated must remain unchanged
- **useProfileQuery**: The hook in `apps/admissions/src/hooks/auth/useProfileQuery.ts` that fetches the user profile via `/auth/profile/` and falls back to session data on non-auth errors
- **getUserMetadata**: The function in `apps/admissions/src/hooks/useProfileAutoPopulation.ts` that extracts metadata fields from a `User` object for use in completion calculation and form auto-population
- **calculateCanonicalProfileCompletion**: The function in `apps/admissions/src/lib/profileFieldMapping.ts` that computes profile completion from 9 required fields (first_name, last_name, email, phone, date_of_birth, gender, nrc_number, address, next_of_kin)
- **User**: The frontend type in `apps/admissions/src/types/auth.ts` representing the JWT-decoded user. Currently has `id`, `email`, `role`, `full_name`, `user_metadata`, `app_metadata` but lacks `first_name` and `last_name` fields that the JWT token actually includes

## Bug Details

### Bug Condition

The bug manifests when the `/auth/profile/` API call fails with a non-auth error (network, 500, CORS, timeout). The `useProfileQuery` catch block constructs a sparse fallback profile missing fields that are available from the JWT token. Simultaneously, `getUserMetadata` fails to extract `full_name`, `first_name`, `last_name` from top-level `User` fields when `user_metadata` is absent.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { apiCallFails: boolean, errorIsAuth: boolean, user: User }
  OUTPUT: boolean

  RETURN input.apiCallFails
         AND NOT input.errorIsAuth
         AND (
           fallbackProfileMissingAvailableFields(input.user)
           OR getUserMetadataIgnoresTopLevelFields(input.user)
         )
END FUNCTION

FUNCTION fallbackProfileMissingAvailableFields(user)
  // The current fallback only includes {id, user_id, email, role, full_name}
  // but the User object from JWT may also have first_name, last_name
  RETURN user.full_name IS NOT EMPTY
         AND fallbackProfile DOES NOT INCLUDE first_name derived from full_name
         AND fallbackProfile DOES NOT INCLUDE last_name derived from full_name
END FUNCTION

FUNCTION getUserMetadataIgnoresTopLevelFields(user)
  // getUserMetadata returns early with only {email} when user_metadata is absent
  RETURN user.full_name IS NOT EMPTY
         AND user.user_metadata IS EMPTY
         AND getUserMetadata(user).full_name IS UNDEFINED
END FUNCTION
```

### Examples

- User with `full_name: "John Doe"`, `email: "john@example.com"`, no `user_metadata` → API fails → fallback has `{email, role, full_name}` → `getUserMetadata` returns `{email}` → completion = 33% (first_name from full_name split, last_name from full_name split, email). Expected: at least 33%, but the metadata path should also contribute `full_name` for redundancy.
- User with `full_name: "Jane Smith"`, `email: "jane@example.com"`, no `user_metadata` → API fails with a wrapped 401 error (has `status: 401` but not `name: 'AuthenticationError'`) → error is NOT detected as auth → sparse fallback returned instead of propagating for logout. Expected: error should be detected as auth and re-thrown.
- User with `full_name: "Alice"` (single name), `email: "alice@example.com"`, no `user_metadata` → API fails → fallback has `full_name: "Alice"` → completion resolves first_name="Alice", last_name="" → 2/9 = 22%. Expected: same result but with enriched metadata also providing `full_name`.
- User with populated `user_metadata: { full_name: "Bob Jones", phone: "0971234567" }` → API fails → `getUserMetadata` correctly extracts from `user_metadata` → this path works correctly today. Expected: unchanged behavior.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When the `/auth/profile/` API call succeeds, the full profile response is used as-is for completion calculation
- When a genuine `AuthenticationError` (name-based) occurs, it is propagated for logout handling
- `calculateCanonicalProfileCompletion` logic in `profileFieldMapping.ts` is NOT modified
- Settings page profile loading and saving behavior remains identical
- `getUserMetadata` extraction from `user_metadata` and `signup_data` continues to work as before
- Form auto-population via `useProfileAutoPopulation` continues using best available data from profile and metadata

**Scope:**
All inputs where the `/auth/profile/` API succeeds, or where `getUserMetadata` is called with a `User` that has populated `user_metadata`, should be completely unaffected by this fix.

## Hypothesized Root Cause

Based on the bug description and code analysis, the issues are:

1. **Sparse Fallback Profile**: In `useProfileQuery.ts` line ~68, the catch block constructs `{id, user_id, email, role, full_name}`. The JWT token (see `backend/apps/accounts/tokens.py` `generate_access_token`) includes `first_name` and `last_name` claims, but the `User` TypeScript type lacks these fields, so they are never passed to the fallback. Even without adding them to the type, `full_name` could be split into `first_name` and `last_name` in the fallback to provide more data to the completion calculation.

2. **getUserMetadata Early Return**: In `useProfileAutoPopulation.ts` line ~37, when `user.user_metadata` is falsy, the function returns `{email}` immediately, discarding `user.full_name` which is available at the top level. This means the metadata fallback path contributes nothing beyond email.

3. **Missing User Type Fields**: The `User` interface in `types/auth.ts` does not include `first_name` or `last_name`, even though the JWT access token payload includes these claims. The frontend JWT decode or session endpoint likely strips them.

4. **Weak Auth Error Detection**: The catch block only checks `err.name === 'AuthenticationError'`. If the error object has been wrapped (e.g., by the fetch chain or apiClient) and carries `status: 401` instead of the specific error name, it won't be detected as an auth error, causing silent fallback instead of proper logout propagation.

## Correctness Properties

Property 1: Bug Condition — Enriched Fallback Includes Available User Fields

_For any_ `User` object where the profile API fails with a non-auth error, the fallback profile constructed in `useProfileQuery` SHALL include `first_name` and `last_name` (derived from `full_name` if not directly available) in addition to `id`, `user_id`, `email`, `role`, and `full_name`, so that `calculateCanonicalProfileCompletion` receives maximum available data.

**Validates: Requirements 2.1, 2.4**

Property 2: Bug Condition — getUserMetadata Extracts Top-Level User Fields

_For any_ `User` object where `user_metadata` is absent or empty, `getUserMetadata` SHALL extract `full_name` (and `first_name`, `last_name` if available) from the top-level `User` fields, so that the metadata fallback path contributes all available data to the completion calculation.

**Validates: Requirements 2.3, 2.4**

Property 3: Bug Condition — Robust Auth Error Detection

_For any_ error object with `status === 401` OR `name === 'AuthenticationError'`, the catch block in `useProfileQuery` SHALL re-throw the error instead of falling back to sparse data, ensuring proper logout handling.

**Validates: Requirements 2.2**

Property 4: Preservation — getUserMetadata With Populated user_metadata

_For any_ `User` object where `user_metadata` is populated, `getUserMetadata` SHALL produce the same result as the original function, preserving all existing metadata extraction behavior from `user_metadata` and `signup_data`.

**Validates: Requirements 3.6, 3.7**

Property 5: Preservation — Successful API Response Unchanged

_For any_ successful `/auth/profile/` API response, `useProfileQuery` SHALL return the sanitized profile data exactly as before, with no change in behavior.

**Validates: Requirements 3.1**

Property 6: Preservation — Profile Completion Calculation Unchanged

_For any_ profile and metadata input, `calculateCanonicalProfileCompletion` SHALL produce the same result as before the fix, since this function is NOT modified.

**Validates: Requirements 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/admissions/src/types/auth.ts`

**Type**: `User`

**Specific Changes**:
1. **Add Missing Fields**: Add optional `first_name` and `last_name` fields to the `User` interface to match the JWT token claims from `generate_access_token` in `tokens.py`

---

**File**: `apps/admissions/src/hooks/auth/useProfileQuery.ts`

**Function**: `useProfileQuery` (queryFn catch block)

**Specific Changes**:
1. **Enrich Fallback Profile**: Add `first_name` and `last_name` to the fallback object, deriving them from `user.first_name`/`user.last_name` if available, or splitting `user.full_name` as a secondary source
2. **Improve Auth Error Detection**: Extend the auth error check to also detect errors with `status === 401` (in addition to `name === 'AuthenticationError'`), handling wrapped errors from the fetch chain

---

**File**: `apps/admissions/src/hooks/useProfileAutoPopulation.ts`

**Function**: `getUserMetadata`

**Specific Changes**:
1. **Extract Top-Level User Fields**: Before the early return when `user_metadata` is absent, also extract `full_name` from `user.full_name`, and `first_name`/`last_name` from `user.first_name`/`user.last_name` if they exist on the `User` object
2. **Merge Top-Level With Metadata**: When `user_metadata` IS present, use top-level `User` fields as fallbacks for any metadata fields that are missing (e.g., if `user_metadata.full_name` is absent but `user.full_name` exists)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that call `getUserMetadata` with `User` objects lacking `user_metadata` and verify the output. Test the fallback profile shape in `useProfileQuery` by mocking API failures. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **getUserMetadata Missing Top-Level Fields**: Call `getUserMetadata({ id: '1', email: 'test@example.com', role: 'student', full_name: 'John Doe' })` and assert `result.full_name` is defined (will fail on unfixed code)
2. **Fallback Profile Missing first_name/last_name**: Mock API failure, verify fallback includes `first_name` and `last_name` (will fail on unfixed code)
3. **Wrapped Auth Error Not Detected**: Create error with `{ status: 401 }` but no `name: 'AuthenticationError'`, verify it is re-thrown (will fail on unfixed code)
4. **Completion With Sparse Fallback**: Use the sparse fallback profile + minimal metadata, verify completion > 33% when full_name is available (will fail on unfixed code because metadata doesn't contribute full_name)

**Expected Counterexamples**:
- `getUserMetadata` returns `{ email: 'test@example.com' }` when `full_name: 'John Doe'` is available at top level
- Fallback profile lacks `first_name` and `last_name` fields
- Wrapped 401 errors silently produce fallback instead of propagating

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL user WHERE isBugCondition(user) DO
  // getUserMetadata enrichment
  metadata := getUserMetadata_fixed(user)
  ASSERT metadata.full_name IS NOT UNDEFINED WHEN user.full_name IS NOT EMPTY

  // Fallback profile enrichment
  fallback := buildFallbackProfile_fixed(user)
  ASSERT fallback.first_name IS NOT UNDEFINED WHEN user.full_name IS NOT EMPTY
  ASSERT fallback.last_name IS NOT UNDEFINED WHEN user.full_name HAS MULTIPLE WORDS

  // Auth error detection
  FOR ALL error WHERE error.status === 401 OR error.name === 'AuthenticationError' DO
    ASSERT catchBlock_fixed(error) THROWS error
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL user WHERE NOT isBugCondition(user) DO
  // getUserMetadata with populated user_metadata
  ASSERT getUserMetadata_original(user) = getUserMetadata_fixed(user)

  // Successful API response
  ASSERT useProfileQuery_original(successResponse) = useProfileQuery_fixed(successResponse)
END FOR
```

**Testing Approach**: Property-based testing with fast-check is recommended for preservation checking because:
- It generates many `User` objects with various combinations of fields and `user_metadata` shapes
- It catches edge cases like empty strings, single-word names, special characters in names
- It provides strong guarantees that `getUserMetadata` behavior is unchanged when `user_metadata` is populated

**Test Plan**: Observe behavior on UNFIXED code first for `getUserMetadata` with populated `user_metadata`, then write property-based tests capturing that behavior.

**Test Cases**:
1. **getUserMetadata Preservation**: For any `User` with populated `user_metadata`, verify `getUserMetadata` output is identical before and after fix
2. **Completion Calculation Preservation**: For any profile + metadata input, verify `calculateCanonicalProfileCompletion` returns the same result (function is not modified)
3. **Auth Error Name Detection Preservation**: Verify errors with `name: 'AuthenticationError'` continue to be re-thrown

### Unit Tests

- Test `getUserMetadata` with `User` objects that have `full_name` at top level but no `user_metadata`
- Test `getUserMetadata` with `User` objects that have both top-level fields and `user_metadata` (metadata takes precedence)
- Test fallback profile construction includes `first_name` and `last_name` derived from `full_name`
- Test auth error detection with `status: 401` errors, `name: 'AuthenticationError'` errors, and non-auth errors
- Test edge cases: empty `full_name`, single-word name, `null` user

### Property-Based Tests

- Generate random `User` objects with various `full_name` values and absent `user_metadata`, verify `getUserMetadata` always includes `full_name` in output
- Generate random `User` objects with populated `user_metadata`, verify output is identical to original function (preservation)
- Generate random error objects, verify auth errors (status 401 or name AuthenticationError) are always re-thrown and non-auth errors always produce fallback

### Integration Tests

- Test full dashboard flow: mock API failure → verify `ProfileCompletionBadge` shows enriched percentage
- Test Settings page continues to load and save profile correctly after fix
- Test application wizard auto-population continues to work with enriched metadata
