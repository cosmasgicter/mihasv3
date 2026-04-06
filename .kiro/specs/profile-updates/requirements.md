# Requirements Document

## Introduction

Enable end-to-end student profile editing in the MIHAS admissions platform. The student Settings page currently renders profile data in a read-only form with all controls disabled. This feature adds a backend PATCH endpoint for profile updates, wires the frontend mutation to call it, re-enables the Settings form for editing, and ensures the Neon Postgres `profiles` table already supports all required columns via the Neon MCP power.

## Glossary

- **Profile_API**: The Django REST Framework view at `PATCH /api/v1/auth/profile/` that accepts and persists profile field updates for the authenticated user.
- **Profile_Serializer**: The DRF serializer that validates incoming profile update payloads against field-level constraints before persistence.
- **Settings_Page**: The React page at `apps/admissions/src/pages/student/Settings.tsx` that renders the student profile form.
- **Profile_Mutation**: The React Query mutation in `useProfileQuery.ts` that sends profile update requests to the Profile_API.
- **Profiles_Table**: The `profiles` table in Neon Postgres that stores user profile data.
- **API_Client**: The `apiClient` singleton in `apps/admissions/src/services/client.ts` that handles CSRF token attachment, cookie credentials, and response envelope unwrapping.
- **CSRF_Token**: The per-user token required by the backend `CSRFEnforcementMiddleware` for all state-changing requests (POST, PATCH, PUT, DELETE).

## Requirements

### Requirement 1: Profile Update API Endpoint

**User Story:** As a student, I want to update my profile information through the API, so that my personal details stay current in the system.

#### Acceptance Criteria

1. WHEN an authenticated user sends a PATCH request to `/api/v1/auth/profile/` with a valid JSON body, THE Profile_API SHALL update only the provided fields on the authenticated user's `profiles` row and return the updated profile in the `{"success": true, "data": ...}` envelope.
2. THE Profile_API SHALL accept the following fields for update: `full_name`, `phone`, `date_of_birth`, `sex`, `residence_town`, `country`, `nrc_number`, `address`, `nationality`, `next_of_kin_name`, `next_of_kin_phone`.
3. THE Profile_API SHALL reject updates to protected fields (`id`, `email`, `role`, `password_hash`, `is_active`, `created_at`) by excluding them from the writable field set.
4. WHEN an unauthenticated user sends a PATCH request to `/api/v1/auth/profile/`, THE Profile_API SHALL return HTTP 401 with `{"success": false, "error": "Authentication required", "code": "AUTHENTICATION_REQUIRED"}`.
5. WHEN a PATCH request is missing a valid CSRF token, THE Profile_API SHALL return HTTP 403 with the CSRF validation error response.
6. THE Profile_API SHALL set the `updated_at` field to the current timestamp on every successful update.

### Requirement 2: Profile Field Validation

**User Story:** As a student, I want the system to validate my profile data before saving, so that my records remain accurate and consistent.

#### Acceptance Criteria

1. WHEN the `phone` field is provided and non-empty, THE Profile_Serializer SHALL validate it using the existing Zambian phone number validator (`validate_zambian_phone`).
2. WHEN the `date_of_birth` field is provided, THE Profile_Serializer SHALL validate it as a valid date in ISO 8601 format (YYYY-MM-DD).
3. WHEN the `sex` field is provided, THE Profile_Serializer SHALL accept only the values `Male` or `Female`.
4. WHEN the `full_name` field is provided, THE Profile_Serializer SHALL require a minimum length of 2 characters.
5. WHEN the `nationality` field is provided, THE Profile_Serializer SHALL normalize it using the existing `normalize_nationality` validator.
6. WHEN any field fails validation, THE Profile_Serializer SHALL return HTTP 400 with `{"success": false, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": {...}}` containing field-level error messages.
7. THE Profile_Serializer SHALL allow all non-required fields to be omitted or sent as empty strings without triggering validation errors (partial update semantics).

### Requirement 3: Database Schema Verification

**User Story:** As a developer, I want to confirm the Neon Postgres `profiles` table has all required columns, so that profile updates persist correctly.

#### Acceptance Criteria

1. THE Profiles_Table SHALL contain columns for all editable profile fields: `full_name`, `phone`, `date_of_birth`, `sex`, `residence_town`, `country`, `nrc_number`, `address`, `nationality`, `next_of_kin_name`, `next_of_kin_phone`.
2. THE Profiles_Table SHALL contain an `updated_at` column of type `timestamptz` to record the last modification time.
3. IF any required column is missing from the Profiles_Table, THEN the Neon MCP power SHALL be used to add the missing column with the appropriate type and a `NULL` default.
4. THE Profiles_Table column types SHALL match the Django `Profile` model field definitions (e.g., `varchar(255)` for `CharField(max_length=255)`, `date` for `DateField`, `text` for `TextField`).

### Requirement 4: Frontend Profile Mutation

**User Story:** As a student, I want the Settings page to save my changes when I click the save button, so that my profile updates are sent to the server.

#### Acceptance Criteria

1. WHEN the `updateProfile` function is called with a partial profile object, THE Profile_Mutation SHALL send a PATCH request to `/api/v1/auth/profile/` via the API_Client with the profile fields as the JSON body.
2. WHEN the Profile_API returns a successful response, THE Profile_Mutation SHALL update the React Query cache for the `user-profile` query key with the returned profile data.
3. WHEN the Profile_API returns a validation error (HTTP 400), THE Profile_Mutation SHALL propagate the field-level error details so the Settings_Page can display them.
4. WHEN the Profile_API returns an authentication error (HTTP 401), THE Profile_Mutation SHALL trigger the existing API_Client auth failure flow (token refresh or redirect to sign-in).
5. THE Profile_Mutation SHALL include `credentials: 'include'` and the CSRF_Token header in the PATCH request via the API_Client.

### Requirement 5: Settings Page Editing Enablement

**User Story:** As a student, I want to edit my profile fields and save changes on the Settings page, so that I can keep my personal information up to date.

#### Acceptance Criteria

1. THE Settings_Page SHALL enable all profile form controls for editing by setting `profileEditingEnabled` to `true`.
2. THE Settings_Page SHALL display a "Save changes" button that is enabled only when the form has unsaved changes (`isDirty` is true) and no save operation is in progress.
3. WHEN the user clicks the "Save changes" button, THE Settings_Page SHALL submit only the dirty (changed) fields to the Profile_Mutation.
4. WHILE a save operation is in progress, THE Settings_Page SHALL display a loading indicator on the save button and disable form submission to prevent duplicate requests.
5. WHEN the save operation succeeds, THE Settings_Page SHALL display a success toast notification and reset the form dirty state.
6. WHEN the save operation fails with validation errors, THE Settings_Page SHALL display the field-level errors inline next to the corresponding form fields.
7. WHEN the save operation fails with a network or server error, THE Settings_Page SHALL display an error toast notification with a retry option.
8. THE Settings_Page SHALL remove the read-only notice banner that currently states "Profile editing is temporarily unavailable."

### Requirement 6: Profile Query Enhancement

**User Story:** As a student, I want the Settings page to load my complete profile from the server, so that I see all my saved data including fields updated from other devices.

#### Acceptance Criteria

1. THE Profile_Mutation SHALL fetch the authenticated user's full profile from `GET /api/v1/auth/profile/` instead of constructing a partial profile from the auth session object alone.
2. THE Profile_API SHALL support a GET method that returns the authenticated user's complete profile in the `{"success": true, "data": ...}` envelope.
3. WHEN the GET request fails, THE Profile_Mutation SHALL fall back to the existing behavior of constructing a profile from the auth session user object.
4. THE Profile_API GET response SHALL include all editable fields plus `id`, `email`, and `role` as read-only fields.

### Requirement 7: Optimistic Update and Cache Consistency

**User Story:** As a student, I want my profile changes to appear immediately in the UI after saving, so that the experience feels responsive.

#### Acceptance Criteria

1. WHEN a profile update is submitted, THE Profile_Mutation SHALL optimistically update the React Query cache with the submitted field values before the server response arrives.
2. IF the server returns an error after an optimistic update, THEN THE Profile_Mutation SHALL roll back the cache to the previous profile state.
3. WHEN a profile update succeeds, THE Profile_Mutation SHALL replace the optimistic cache entry with the server-returned profile data to ensure consistency.
