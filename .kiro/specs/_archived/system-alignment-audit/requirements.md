# Requirements Document

## Introduction

This spec covers a comprehensive alignment audit of the MIHAS admissions platform. The system has gone through multiple architectural iterations, leaving mismatches between Django models and the production Neon Postgres schema, incomplete serializers, inconsistent data patterns in the applications table, and frontend service layers that reference fields the backend does not provide. The audit addresses eight areas: schema alignment, serializer accuracy, application tracking completeness, text-vs-FK data consistency, frontend service alignment, dead code removal, notification and payment system gaps, and test alignment.

The platform runs Django 5 + DRF on the backend with unmanaged models (`managed = False`) mapping to a Neon Postgres database, and React 18 + TypeScript + React Query on the frontend.

## Glossary

- **Application_Model**: The Django model `Application` in `backend/apps/applications/models.py` mapping to the `applications` database table.
- **Intake_Model**: The Django model `Intake` in `backend/apps/catalog/models.py` mapping to the `intakes` database table.
- **ApplicationTrackingSerializer**: The DRF serializer in `backend/apps/applications/serializers.py` used by the public tracking endpoint `GET /api/v1/applications/track/`.
- **ApplicationTrackView**: The DRF view in `backend/apps/applications/views.py` serving the public application tracking endpoint.
- **IdentifierResolver**: The utility class in `backend/apps/applications/identifier_resolver.py` that resolves text-based program, intake, and institution references to canonical catalog records.
- **Catalog_Service**: The frontend service module at `apps/admissions/src/services/catalog.ts` that normalizes backend API responses for programs, intakes, institutions, and subjects.
- **Intakes_Page**: The admin intakes management page at `apps/admissions/src/pages/admin/Intakes.tsx`.
- **Neon_Database**: The production Neon Postgres instance hosting all platform tables.
- **Schema_Alignment**: The state where every Django model field corresponds to an actual database column with matching name, type, and constraints.
- **Text_FK_Field**: An application table column (program, intake, institution) that stores a human-readable text string instead of a foreign key UUID reference.
- **Payment_Model**: The Django model `Payment` in `backend/apps/documents/models.py` mapping to the `payments` database table.
- **Notification_Model**: The Django model `Notification` in `backend/apps/common/models.py` mapping to the `notifications` database table.

## Requirements

### Requirement 1: Application Tracking Serializer Completeness

**User Story:** As a student tracking my application, I want the tracking endpoint to return the institution name alongside program and intake, so that I can see the complete details of my application.

#### Acceptance Criteria

1. WHEN a valid tracking code is provided, THE ApplicationTrackingSerializer SHALL include the `institution` field in the response alongside `program`, `intake`, `status`, `payment_status`, `application_number`, `public_tracking_code`, `created_at`, and `submitted_at`.
2. WHEN the `institution` field on an application contains a code (e.g. "KATC"), THE ApplicationTrackingSerializer SHALL return the stored value as-is without attempting to resolve it to a full name.
3. WHEN the `institution` field on an application contains a full name (e.g. "Kalulushi Training Centre"), THE ApplicationTrackingSerializer SHALL return the stored value as-is.
4. THE ApplicationTrackingSerializer SHALL expose only non-sensitive fields suitable for unauthenticated public access.

### Requirement 2: Intake Model Schema Alignment

**User Story:** As a developer, I want the Intake Django model to match the actual database schema exactly, so that ORM queries and admin pages do not crash or return incorrect data.

#### Acceptance Criteria

1. THE Intake_Model SHALL define a field named `max_capacity` mapping to the `max_capacity` column in the `intakes` database table.
2. THE Intake_Model SHALL define a field named `semester` mapping to the `semester` column in the `intakes` database table.
3. THE Intake_Model SHALL define a field named `application_start_date` mapping to the `application_start_date` column in the `intakes` database table.
4. THE Intake_Model SHALL NOT define a field named `total_capacity` or `available_spots` unless those columns exist in the `intakes` database table.
5. WHEN the Intake_Model is queried via the ORM, THE Intake_Model SHALL return accurate values for all mapped fields without raising `OperationalError` or `ProgrammingError` exceptions.

### Requirement 3: Frontend Intakes Page Field Alignment

**User Story:** As an admin managing intakes, I want the intakes page to use the correct field names from the API, so that creating and editing intakes works without errors.

#### Acceptance Criteria

1. THE Intakes_Page SHALL use the field name `max_capacity` when reading intake capacity from API responses, matching the backend `IntakeSerializer` field name.
2. THE Intakes_Page SHALL send the field name `max_capacity` when creating or updating intakes via the API.
3. THE Intakes_Page SHALL compute available spots as `max_capacity - current_enrollment` for display purposes rather than relying on a separate `available_spots` field from the API.
4. THE Catalog_Service `normalizeIntake` function SHALL map the backend `max_capacity` field to the frontend intake interface without renaming it to `total_capacity`.
5. THE Catalog_Service `buildIntakePayload` function SHALL send `max_capacity` to the backend when creating or updating intakes.
6. WHEN the Intakes_Page form validates capacity, THE Intakes_Page SHALL validate that `max_capacity` is a positive integer.

### Requirement 4: Application Text-FK Field Consistency

**User Story:** As a developer, I want a clear strategy for handling the text-based program, intake, and institution fields in the applications table, so that lookups and joins work reliably across old and new data.

#### Acceptance Criteria

1. THE IdentifierResolver SHALL resolve application `program` text values to canonical Program records by matching against `Program.name` (case-insensitive), then `Program.code` (case-insensitive), then partial name match.
2. THE IdentifierResolver SHALL resolve application `institution` text values to canonical Institution records by matching against `Institution.code` (case-insensitive), then `Institution.name` (case-insensitive), then `Institution.full_name` (case-insensitive), then partial name match.
3. THE IdentifierResolver SHALL resolve application `intake` text values to canonical Intake records by matching against `Intake.name` (case-insensitive), then partial name match.
4. WHEN a new application is created, THE ApplicationCreateSerializer SHALL canonicalize the `program`, `intake`, and `institution` values to their canonical names via the IdentifierResolver before storing them.
5. WHEN a new application is created, THE ApplicationCreateSerializer SHALL store the canonical full name (not the code) for `program`, `intake`, and `institution` fields.
6. IF the IdentifierResolver cannot resolve a program, intake, or institution value, THEN THE ApplicationCreateSerializer SHALL return a validation error with a descriptive message.
7. THE Application_Model `program` field SHALL have `max_length` of at least 255 characters to accommodate full program names (e.g. "Diploma in Clinical Medicine").
8. THE Application_Model `intake` field SHALL have `max_length` of at least 100 characters to accommodate full intake names (e.g. "July 2026 Intake").
9. THE Application_Model `institution` field SHALL have `max_length` of at least 255 characters to accommodate full institution names (e.g. "Kalulushi Training Centre").

### Requirement 5: Application Serializer Field Completeness

**User Story:** As an admin reviewing applications, I want every serializer to return complete and accurate data, so that no fields show as "unknown" or missing in the UI.

#### Acceptance Criteria

1. THE ApplicationSerializer SHALL include the `institution` field in its response for all application detail views.
2. THE ApplicationListSerializer SHALL include the `institution` field in its response for list views.
3. WHEN an application has a `payment_status` of "verified" or "force_approved" but no corresponding Payment record, THE ApplicationSerializer SHALL still return the `payment_status` value from the application record.
4. THE ApplicationSerializer SHALL return `null` for payment summary fields (`payment_method`, `paid_amount`, `paid_at`, `receipt_number`, `payment_reference`) when no Payment record exists for the application.
5. WHEN an application has legacy payment columns populated in the database but not mapped in the Django model, THE ApplicationSerializer SHALL not attempt to read those unmapped columns.

### Requirement 6: Legacy Data Pattern Documentation and Handling

**User Story:** As a developer, I want the system to handle both legacy and current data patterns gracefully, so that old applications remain accessible and functional.

#### Acceptance Criteria

1. WHEN the ApplicationTrackView receives a legacy application number (e.g. "MIHAS202641411" or "KATC202610579"), THE ApplicationTrackView SHALL match it against the `application_number` column and return the application data.
2. WHEN the ApplicationTrackView receives a legacy tracking code (e.g. "TRKHKAUTY" or "TRK370990"), THE ApplicationTrackView SHALL match it against the `public_tracking_code` column and return the application data.
3. WHEN an application has `created_at` set to null, THE ApplicationSerializer SHALL return `null` for the `created_at` field without raising an error.
4. THE ApplicationTrackView TRACKING_CODE_PATTERN SHALL accept all documented legacy formats: MIHAS + 9 digits, KATC + 9 digits, TRK + 5-6 alphanumeric characters (no dash), as well as current formats: APP-YYYYMMDD-XXXXXXXX and TRK-12 alphanumeric characters.

### Requirement 7: Payment System Gap Acknowledgment

**User Story:** As an admin, I want the system to correctly represent the payment state of applications even when no payment records exist in the payments table, so that I can distinguish between legacy manual payments and Lenco-processed payments.

#### Acceptance Criteria

1. WHEN an application has `payment_status` set to "verified" or "force_approved" but the `payments` table contains zero records for that application, THE ApplicationSerializer SHALL return the `payment_status` from the application record and `null` for all payment detail fields.
2. THE ApplicationListSerializer SHALL display the `payment_status` badge correctly for applications with legacy payment statuses that have no corresponding Payment records.
3. IF an admin queries payment details for an application with no Payment records, THEN the payment detail endpoint SHALL return an empty list rather than an error.
4. THE Payment_Model SHALL remain mapped to the `payments` table with all columns matching the actual database schema.

### Requirement 8: Notification System Verification

**User Story:** As a developer, I want to verify that the notification system is correctly wired to create notifications, so that users receive notifications for application events.

#### Acceptance Criteria

1. THE Notification_Model SHALL have all fields matching the actual `notifications` database table columns.
2. WHEN an application status changes, THE notification creation logic SHALL create a Notification record for the application owner with the new status information.
3. IF the notification creation fails, THEN the status change operation SHALL still complete successfully and log the notification failure.
4. THE notification list endpoint SHALL return notifications in the standard paginated envelope format.

### Requirement 9: Frontend-Backend API Response Shape Alignment

**User Story:** As a frontend developer, I want the frontend service layer types and normalizers to match the actual API response shapes, so that data flows correctly without silent failures.

#### Acceptance Criteria

1. THE Catalog_Service `Intake` interface SHALL define `max_capacity` as a number field matching the backend `IntakeSerializer` response.
2. THE Catalog_Service `Intake` interface SHALL define `current_enrollment` as an optional number field matching the backend `IntakeSerializer` response.
3. THE Catalog_Service `Intake` interface SHALL NOT define `total_capacity` or `available_spots` as fields expected from the API response.
4. THE Catalog_Service `normalizeIntake` function SHALL handle both the backend field name `max_capacity` and compute derived display values (like available spots) from `max_capacity` and `current_enrollment`.
5. WHEN the backend returns an intake record, THE Catalog_Service SHALL not silently drop or rename fields that cause the frontend to display incorrect data.
6. THE Catalog_Service `buildIntakePayload` function SHALL map frontend form field `max_capacity` to the backend field `max_capacity` without renaming to `total_capacity`.

### Requirement 10: Dead Code and Orphaned Pattern Removal

**User Story:** As a developer, I want orphaned code referencing old field names and deprecated patterns removed, so that the codebase is clean and does not mislead future development.

#### Acceptance Criteria

1. THE codebase SHALL NOT contain references to `total_capacity` as an API field name for intakes, except in migration scripts or historical documentation.
2. THE codebase SHALL NOT contain references to `available_spots` as an API field name for intakes, except in migration scripts or historical documentation.
3. WHEN a frontend form or service references a field name that does not exist in the corresponding backend serializer, THE code review process SHALL flag it as a misalignment requiring correction.
4. THE Application_Model docstring SHALL document all known legacy unmapped columns in the database that are intentionally not mapped in the Django model.

### Requirement 11: Test Alignment with Current Schema

**User Story:** As a developer, I want all tests to validate against the current schema and API contracts, so that test results reflect the actual system behavior.

#### Acceptance Criteria

1. WHEN a property test validates intake fields, THE test SHALL use `max_capacity` as the field name, not `total_capacity`.
2. WHEN a property test validates the ApplicationTrackingSerializer fields, THE test SHALL verify that `institution` is included in the serializer fields.
3. WHEN a test validates application creation, THE test SHALL verify that `program`, `intake`, and `institution` values are canonicalized to full names via the IdentifierResolver.
4. IF a test references a field name that does not exist in the current model or serializer, THEN THE test SHALL be updated to use the correct field name.
5. WHEN a test validates payment-related behavior, THE test SHALL account for the possibility of applications with payment statuses but no corresponding Payment records.
