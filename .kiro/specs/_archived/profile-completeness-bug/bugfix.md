# Bugfix Requirements Document

## Introduction

The student dashboard displays "Profile 33% Complete" for users who have all 9 required profile fields filled in the database. The root cause is twofold: (1) when the `/auth/profile/` API call fails for non-auth reasons (network error, 500, CORS, timeout), the `useProfileQuery` catch block falls back to a minimal profile object containing only `email`, `role`, and `full_name`, causing `calculateCanonicalProfileCompletion` to resolve only 3 of 9 fields (first_name from full_name split, last_name from full_name split, email) = 33%; and (2) the `getUserMetadata` function in `useProfileAutoPopulation.ts` only extracts fields from `user.user_metadata` and ignores top-level `User` object fields like `full_name`, so the metadata fallback path also fails to contribute additional data to the completion calculation.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the `/auth/profile/` API call fails with a non-auth error (network error, 500, CORS, timeout) THEN the system falls back to a sparse profile object containing only `id`, `user_id`, `email`, `role`, and `full_name`, causing the profile completion to display as 33% even though all 9 required fields exist in the database.

1.2 WHEN the `/auth/profile/` API call fails and the error is not recognized as an `AuthenticationError` (e.g., the error was wrapped or transformed during the fetch chain) THEN the system catches the error and returns the sparse fallback instead of propagating the auth error for proper logout handling.

1.3 WHEN `getUserMetadata` is called with a `User` object that has a `full_name` field at the top level but no `user_metadata` property THEN the system returns only `{ email }` and discards the `full_name` value, reducing the data available for the completion calculation fallback.

1.4 WHEN the sparse fallback profile is used and `getUserMetadata` also returns minimal data THEN the `calculateCanonicalProfileCompletion` function receives insufficient input and computes 33% (3 of 9 fields: first_name from full_name split, last_name from full_name split, email) instead of the true completion percentage.

### Expected Behavior (Correct)

2.1 WHEN the `/auth/profile/` API call fails with a non-auth error THEN the system SHALL construct a fallback profile object that includes all available fields from the `User` object (id, user_id, email, role, full_name) so that the completion calculation has the maximum data available from the session.

2.2 WHEN the `/auth/profile/` API call fails and the error might be an authentication error THEN the system SHALL use robust error detection (checking for status code 401 or error name `AuthenticationError`) to correctly identify auth errors and propagate them for proper logout handling, rather than silently falling back to sparse data.

2.3 WHEN `getUserMetadata` is called with a `User` object that has `full_name` at the top level but no `user_metadata` THEN the system SHALL extract `full_name` from the top-level `User` fields and include it in the returned metadata, so it is available as a fallback for the completion calculation.

2.4 WHEN the fallback profile is used together with enriched metadata from `getUserMetadata` THEN the system SHALL compute the profile completion percentage using all available data from both sources, resulting in a more accurate percentage that reflects the data known to the client.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the `/auth/profile/` API call succeeds THEN the system SHALL CONTINUE TO use the full profile response from the API as-is for the completion calculation.

3.2 WHEN the `/auth/profile/` API call fails with a genuine authentication error (401 after failed refresh) THEN the system SHALL CONTINUE TO propagate the error so the auth cascade handles logout properly.

3.3 WHEN `calculateCanonicalProfileCompletion` receives a complete profile object with all 9 required fields filled THEN the system SHALL CONTINUE TO return 100%.

3.4 WHEN `calculateCanonicalProfileCompletion` receives a profile with some fields missing THEN the system SHALL CONTINUE TO return the correct proportional percentage based on the 9 required fields.

3.5 WHEN the Settings page loads the profile for editing THEN the system SHALL CONTINUE TO display and save profile data correctly without any change in behavior.

3.6 WHEN the application wizard auto-populates form fields via `useProfileAutoPopulation` THEN the system SHALL CONTINUE TO populate fields using the best available data from profile and metadata sources.

3.7 WHEN `getUserMetadata` is called with a `User` object that has a populated `user_metadata` property THEN the system SHALL CONTINUE TO extract fields from `user_metadata` and `signup_data` as it does today.
