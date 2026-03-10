# Requirements Document

## Introduction

Deep Forensic Database Audit (Round 4) for the MIHAS Application Portal. This is the fourth and deepest pass of forensic analysis, performing a line-by-line, table-by-table, column-by-column cross-reference between the live Neon Postgres database schema (project: wild-bar-37055823), all migration files, all API source files (`api-src/*.ts`), all shared utility files with SQL (`lib/*.ts`), and all TypeScript interfaces in `lib/queries.ts`. The audit verifies migration application status, SQL statement correctness, TypeScript interface fidelity, referential integrity, and data quality across all 28 database tables.

### Previous Rounds Summary

- **Round 1**: Removed `country` column references, fixed IntakeRecord/ProgramRecord interfaces, seeded program_intakes and course_requirements
- **Round 2**: Removed `channel` from notifications INSERT, removed `whatsapp_enabled`/`in_app_enabled` references, fixed audit_logs entity_id UUID cast
- **Round 3**: Fixed SubjectRecord (missing category, is_core), fixed NotificationPreferencesRecord (missing 7 columns)

## Glossary

- **Auditor**: The automated audit system that performs schema cross-referencing and data integrity checks
- **Live_Schema**: The actual Neon Postgres database schema as returned by `information_schema.columns` and `pg_catalog` queries
- **Code_Schema**: The set of SQL column references found in all TypeScript source files (`api-src/*.ts`, `lib/*.ts`)
- **Interface_Schema**: The set of TypeScript interfaces in `lib/queries.ts` that model database records
- **Migration_Set**: The complete set of SQL migration files in `migrations/`
- **Neon_MCP**: The Neon MCP tool used for all live database operations (project ID: wild-bar-37055823)
- **Column_Mismatch**: A discrepancy where code references a column that does not exist in the Live_Schema, or the Live_Schema has a column not reflected in the Interface_Schema
- **Orphan_Record**: A database row that references a parent record (via foreign key) that no longer exists
- **Phantom_Column**: A column referenced in code SQL statements that does not exist in the corresponding Live_Schema table
- **Ghost_Migration**: A migration file that exists in `migrations/` but was never applied to the Live_Schema
- **Query_Builder**: A typed function in `lib/queries.ts` that generates parameterized SQL `QueryConfig` objects
- **API_Source**: TypeScript files in `api-src/` that contain inline SQL queries executed via the `query()` function

## Requirements

### Requirement 1: Migration Application Verification

**User Story:** As a developer, I want to verify that every migration file in `migrations/` was actually applied to the live Neon database, so that I can identify Ghost_Migrations that were created but never executed (especially those created when Neon was unavailable).

#### Acceptance Criteria

1. WHEN the Auditor inspects the Live_Schema, THE Auditor SHALL query `migration_history` table to retrieve all applied migration names and timestamps
2. WHEN the Auditor lists all migration files in `migrations/`, THE Auditor SHALL cross-reference each file against the `migration_history` records to identify Ghost_Migrations
3. FOR EACH migration file not found in `migration_history`, THE Auditor SHALL verify whether the schema changes described in that migration file exist in the Live_Schema (indicating manual or out-of-band application)
4. WHEN a Ghost_Migration is identified, THE Auditor SHALL report the file name, expected schema changes, and current Live_Schema state for each affected table
5. THE Auditor SHALL specifically verify `migrations/add_idempotency_and_status_history.sql` by confirming both `idempotency_keys` and `application_status_history` tables exist with all specified columns and indexes
6. THE Auditor SHALL verify that `application_status_history` has both the original `status` column (from `003_supporting_tables.sql`) and the `old_status`/`new_status` columns (from `add_idempotency_and_status_history.sql`), identifying any column conflicts
7. THE Auditor SHALL verify all 9 post-core migration files were applied: `add_csrf_tokens_table.sql`, `add_password_reset_tokens_table.sql`, `add_login_attempts_table.sql`, `add_audit_retention_category.sql`, `add_idempotency_and_status_history.sql`, `add_version_and_nationality.sql`, `normalize_data.sql`, `seed_and_normalize_data.sql`, `seed_program_intakes_and_requirements.sql`
8. IF the `migration_history` table does not exist or is empty, THEN THE Auditor SHALL fall back to direct schema inspection of each table to verify migration effects

### Requirement 2: Live Schema Column Inventory

**User Story:** As a developer, I want a complete column-by-column inventory of every table in the live database, so that I have a ground-truth reference for all cross-referencing checks.

#### Acceptance Criteria

1. THE Auditor SHALL query `information_schema.columns` via Neon_MCP for all 28 tables and record column_name, data_type, is_nullable, column_default, and character_maximum_length for each column
2. THE Auditor SHALL query `information_schema.table_constraints` and `information_schema.key_column_usage` to map all primary keys, foreign keys, and unique constraints for each table
3. THE Auditor SHALL query `pg_indexes` to inventory all indexes on each table, recording index name, column(s), and uniqueness
4. THE Auditor SHALL verify the existence of all 28 expected tables: profiles, applications, application_documents, application_grades, application_interviews, application_status_history, application_drafts, programs, intakes, program_intakes, course_requirements, subjects, institutions, payments, documents, notifications, user_notification_preferences, email_queue, device_sessions, csrf_tokens, password_reset_tokens, login_attempts, audit_logs, idempotency_keys, settings, user_permission_overrides, document_migration_log, migration_history
5. IF any expected table is missing from the Live_Schema, THEN THE Auditor SHALL report the missing table and identify which migration file should have created the table
6. THE Auditor SHALL detect any tables in the Live_Schema that are NOT in the expected 28-table list, reporting unexpected tables as potential artifacts from abandoned migrations or manual DB operations
7. THE Auditor SHALL verify the `push_subscriptions` table exists (defined in `003_supporting_tables.sql` but not listed in the 28-table documentation), and report whether it should be added to the canonical table list or removed

### Requirement 3: API Source SQL Cross-Reference (INSERT Statements)

**User Story:** As a developer, I want every INSERT statement in every API source file cross-referenced against the Live_Schema, so that I can identify Phantom_Columns in INSERT column lists that would cause runtime SQL errors.

#### Acceptance Criteria

1. FOR EACH INSERT statement in `api-src/auth.ts`, THE Auditor SHALL extract the target table name and column list, then verify every column exists in the Live_Schema for that table
2. FOR EACH INSERT statement in `api-src/applications.ts`, THE Auditor SHALL extract the target table name and column list, then verify every column exists in the Live_Schema for that table
3. FOR EACH INSERT statement in `api-src/admin.ts`, THE Auditor SHALL extract the target table name and column list, then verify every column exists in the Live_Schema for that table
4. FOR EACH INSERT statement in `api-src/notifications.ts`, THE Auditor SHALL extract the target table name and column list, then verify every column exists in the Live_Schema for that table
5. FOR EACH INSERT statement in `api-src/documents.ts`, THE Auditor SHALL extract the target table name and column list, then verify every column exists in the Live_Schema for that table
6. FOR EACH INSERT statement in `api-src/email.ts`, THE Auditor SHALL extract the target table name and column list, then verify every column exists in the Live_Schema for that table
7. FOR EACH INSERT statement in `api-src/bootstrap.ts`, THE Auditor SHALL extract the target table name and column list, then verify every column exists in the Live_Schema for that table
8. FOR EACH INSERT statement in `api-src/catalog.ts`, THE Auditor SHALL extract the target table name and column list, then verify every column exists in the Live_Schema for that table
9. FOR EACH INSERT statement in `api-src/sessions.ts`, THE Auditor SHALL extract the target table name and column list, then verify every column exists in the Live_Schema for that table
10. FOR EACH INSERT statement in `api-src/payments.ts`, THE Auditor SHALL extract the target table name and column list, then verify every column exists in the Live_Schema for that table
11. WHEN a Phantom_Column is found in an INSERT statement, THE Auditor SHALL report the file name, line number, table name, phantom column name, and the full list of valid columns for that table

### Requirement 4: API Source SQL Cross-Reference (SELECT Statements)

**User Story:** As a developer, I want every SELECT statement in every API source file cross-referenced against the Live_Schema, so that I can identify Phantom_Columns in SELECT column lists that would cause runtime SQL errors.

#### Acceptance Criteria

1. FOR EACH SELECT statement in `api-src/auth.ts` that names specific columns (not `SELECT *`), THE Auditor SHALL verify every selected column exists in the source table(s) of the Live_Schema
2. FOR EACH SELECT statement in `api-src/applications.ts` that names specific columns, THE Auditor SHALL verify every selected column exists in the source table(s) of the Live_Schema
3. FOR EACH SELECT statement in `api-src/admin.ts` that names specific columns, THE Auditor SHALL verify every selected column exists in the source table(s) of the Live_Schema
4. FOR EACH SELECT statement in `api-src/notifications.ts` that names specific columns, THE Auditor SHALL verify every selected column exists in the source table(s) of the Live_Schema
5. FOR EACH SELECT statement in `api-src/catalog.ts` that names specific columns, THE Auditor SHALL verify every selected column exists in the source table(s) of the Live_Schema
6. FOR EACH SELECT statement in `api-src/documents.ts` that names specific columns, THE Auditor SHALL verify every selected column exists in the source table(s) of the Live_Schema
7. FOR EACH SELECT statement in `api-src/email.ts` that names specific columns, THE Auditor SHALL verify every selected column exists in the source table(s) of the Live_Schema
8. FOR EACH SELECT statement in `api-src/sessions.ts` that names specific columns, THE Auditor SHALL verify every selected column exists in the source table(s) of the Live_Schema
9. FOR EACH SELECT statement in `api-src/payments.ts` that names specific columns, THE Auditor SHALL verify every selected column exists in the source table(s) of the Live_Schema
10. FOR EACH SELECT statement in `api-src/bootstrap.ts` that names specific columns, THE Auditor SHALL verify every selected column exists in the source table(s) of the Live_Schema
11. FOR EACH `SELECT *` statement, THE Auditor SHALL verify the target table exists and flag the usage for review (since `SELECT *` is fragile to schema changes)
12. WHEN a Phantom_Column is found in a SELECT statement, THE Auditor SHALL report the file name, line number, table name, phantom column name, and the full list of valid columns for that table

### Requirement 5: API Source SQL Cross-Reference (UPDATE Statements)

**User Story:** As a developer, I want every UPDATE statement in every API source file cross-referenced against the Live_Schema, so that I can identify Phantom_Columns in SET clauses and WHERE clauses.

#### Acceptance Criteria

1. FOR EACH UPDATE statement in all `api-src/*.ts` files, THE Auditor SHALL extract the target table, SET column list, and WHERE clause columns, then verify every column exists in the Live_Schema
2. THE Auditor SHALL specifically audit the dynamic UPDATE builder in `api-src/applications.ts` (the `allowedFields` array in the PATCH handler) to verify every field name in the array corresponds to a real column in the `applications` table
3. THE Auditor SHALL specifically audit the dynamic UPDATE builder in `api-src/admin.ts` (the `handleUpdateUser` function) to verify every updatable field corresponds to a real column in the `profiles` table
4. WHEN a Phantom_Column is found in an UPDATE SET clause or WHERE clause, THE Auditor SHALL report the file name, line number, table name, phantom column name, and the full list of valid columns

### Requirement 6: API Source SQL Cross-Reference (DELETE and JOIN Statements)

**User Story:** As a developer, I want every DELETE and JOIN statement cross-referenced against the Live_Schema, so that I can identify invalid table references, missing foreign keys, and incorrect join conditions.

#### Acceptance Criteria

1. FOR EACH DELETE statement in all `api-src/*.ts` files, THE Auditor SHALL verify the target table exists and any WHERE clause columns exist in the Live_Schema
2. FOR EACH JOIN clause in all `api-src/*.ts` files, THE Auditor SHALL verify both tables exist, the join columns exist in their respective tables, and the join condition references valid foreign key relationships
3. THE Auditor SHALL specifically audit the complex JOINs in `api-src/applications.ts` (the `fetchApplicationDetails` function) which joins applications with profiles, application_documents, application_grades, subjects, and application_status_history
4. THE Auditor SHALL verify that all foreign key references used in JOIN ON clauses match actual foreign key constraints in the Live_Schema
5. WHEN an invalid JOIN reference is found, THE Auditor SHALL report the file name, line number, both table names, the join columns, and the actual foreign key constraints

### Requirement 7: Shared Utility SQL Cross-Reference

**User Story:** As a developer, I want every SQL statement in shared utility files (`lib/*.ts`) cross-referenced against the Live_Schema, so that I can identify Phantom_Columns in utility functions that are called from multiple API endpoints.

#### Acceptance Criteria

1. FOR EACH SQL statement in `lib/queries.ts` (all Query_Builder functions), THE Auditor SHALL verify every referenced column exists in the target table of the Live_Schema
2. FOR EACH SQL statement in `lib/sessions.ts`, THE Auditor SHALL verify every referenced column in `device_sessions` table queries exists in the Live_Schema
3. FOR EACH SQL statement in `lib/csrf.ts`, THE Auditor SHALL verify every referenced column in `csrf_tokens` table queries exists in the Live_Schema
4. FOR EACH SQL statement in `lib/auditLogger.ts`, THE Auditor SHALL verify every referenced column in `audit_logs` table queries exists in the Live_Schema
5. FOR EACH SQL statement in `lib/auth/middleware.ts`, THE Auditor SHALL verify every referenced column in `profiles` and `device_sessions` table queries exists in the Live_Schema
6. FOR EACH SQL statement in `lib/auth/ownership.ts`, THE Auditor SHALL verify every referenced column in ownership check queries exists in the Live_Schema for each target table (applications, application_documents, application_drafts, payments)
7. WHEN a Phantom_Column is found in a shared utility SQL statement, THE Auditor SHALL report the file name, function name, table name, phantom column name, and all call sites in `api-src/*.ts` that invoke the affected function

### Requirement 8: TypeScript Interface Fidelity Audit

**User Story:** As a developer, I want every TypeScript interface in `lib/queries.ts` cross-referenced against the Live_Schema, so that I can identify fields in interfaces that do not exist as columns, and columns in the Live_Schema that are missing from interfaces.

#### Acceptance Criteria

1. THE Auditor SHALL compare `UserRecord` interface fields against `profiles` table columns in the Live_Schema, reporting any mismatches in both directions (extra interface fields, missing interface fields)
2. THE Auditor SHALL compare `UserAuthRecord` interface fields against `profiles` table columns, verifying all referenced columns exist
3. THE Auditor SHALL compare `UserPublicRecord` interface fields against `profiles` table columns, verifying all referenced columns exist
4. THE Auditor SHALL compare `SessionRecord` interface fields against `device_sessions` table columns in the Live_Schema, reporting any mismatches
5. THE Auditor SHALL compare `SessionDisplayRecord` interface fields against `device_sessions` table columns, verifying all referenced columns exist
6. THE Auditor SHALL compare `AuditLogRecord` interface fields against `audit_logs` table columns in the Live_Schema, including the `retention_category` column added by migration
7. THE Auditor SHALL compare `ApplicationRecord` interface fields against `applications` table columns in the Live_Schema, reporting any mismatches in both directions
8. THE Auditor SHALL compare `DocumentRecord` interface fields against `application_documents` table columns in the Live_Schema, reporting any mismatches
9. THE Auditor SHALL compare `GradeRecord` interface fields against `application_grades` table columns in the Live_Schema, reporting any mismatches
10. THE Auditor SHALL compare `StatusHistoryRecord` interface fields against `application_status_history` table columns in the Live_Schema, reporting any mismatches
11. THE Auditor SHALL compare `ProgramRecord` interface fields against `programs` table columns in the Live_Schema, reporting any mismatches
12. THE Auditor SHALL compare `IntakeRecord` interface fields against `intakes` table columns in the Live_Schema, reporting any mismatches
13. THE Auditor SHALL compare `SubjectRecord` interface fields against `subjects` table columns in the Live_Schema, reporting any mismatches
14. THE Auditor SHALL compare `NotificationPreferencesRecord` interface fields against `user_notification_preferences` table columns in the Live_Schema, reporting any mismatches
15. THE Auditor SHALL compare `PushSubscriptionRecord` interface fields against `push_subscriptions` table columns in the Live_Schema, reporting any mismatches
16. THE Auditor SHALL verify that TypeScript types (string, number, boolean, Date) are compatible with the corresponding PostgreSQL column types (varchar, integer, boolean, timestamptz)
17. THE Auditor SHALL verify that nullable TypeScript fields (`| null`) correspond to nullable columns in the Live_Schema, and non-nullable interface fields correspond to NOT NULL columns

### Requirement 9: Query Builder Validation

**User Story:** As a developer, I want every Query_Builder function in `lib/queries.ts` validated to produce correct SQL for the current Live_Schema, so that I can identify query builders that would fail at runtime.

#### Acceptance Criteria

1. FOR EACH function in `UserQueries`, THE Auditor SHALL verify the generated SQL text references only columns that exist in the `profiles` table, and that parameter placeholders ($1, $2, etc.) match the values array length
2. FOR EACH function in `SessionQueries`, THE Auditor SHALL verify the generated SQL references only columns that exist in the `device_sessions` table, and that parameter counts match
3. FOR EACH function in `AuditQueries`, THE Auditor SHALL verify the generated SQL references only columns that exist in the `audit_logs` table, and that parameter counts match
4. FOR EACH function in `ApplicationQueries`, THE Auditor SHALL verify the generated SQL references only columns that exist in the `applications` table, and that parameter counts match
5. FOR EACH function in `DocumentQueries`, THE Auditor SHALL verify the generated SQL references only columns that exist in the `application_documents` table, and that parameter counts match
6. FOR EACH function in `GradeQueries`, THE Auditor SHALL verify the generated SQL references only columns that exist in the `application_grades` table, and that parameter counts match
7. FOR EACH function in `StatusHistoryQueries`, THE Auditor SHALL verify the generated SQL references only columns that exist in the `application_status_history` table, and that parameter counts match
8. FOR EACH function in `CatalogQueries`, THE Auditor SHALL verify the generated SQL references only columns that exist in the target catalog tables (programs, intakes, subjects), and that parameter counts match
9. FOR EACH function in `NotificationQueries`, THE Auditor SHALL verify the generated SQL references only columns that exist in the target tables (user_notification_preferences, push_subscriptions), and that parameter counts match
10. FOR EACH function in `PaymentQueries`, THE Auditor SHALL verify the generated SQL references only columns that exist in the target tables (applications, profiles), and that parameter counts match
11. THE Auditor SHALL specifically verify the `SessionQueries.create` function which inserts into `device_sessions` with columns `device_id` and `session_token` — confirming these columns exist in the Live_Schema
12. THE Auditor SHALL specifically verify the `ApplicationQueries.update` dynamic builder's `allowedFields` array contains only valid `applications` table columns, and that the `$` parameter placeholder syntax is correct (checking for missing `$` prefix in field assignments)
13. WHEN a Query_Builder produces invalid SQL, THE Auditor SHALL report the query builder name, the invalid column(s), and the corrected SQL

### Requirement 10: Data Integrity and Referential Integrity Audit

**User Story:** As a developer, I want the live database checked for orphaned records, broken foreign key references, and data quality issues, so that I can identify and fix data corruption from previous bugs.

#### Acceptance Criteria

1. THE Auditor SHALL count rows in all 28 tables and report the row counts
2. THE Auditor SHALL check for Orphan_Records in `applications` where `user_id` does not reference a valid `profiles.id`
3. THE Auditor SHALL check for Orphan_Records in `application_documents` where `application_id` does not reference a valid `applications.id`
4. THE Auditor SHALL check for Orphan_Records in `application_grades` where `application_id` does not reference a valid `applications.id`
5. THE Auditor SHALL check for Orphan_Records in `application_grades` where `subject_id` does not reference a valid `subjects.id`
6. THE Auditor SHALL check for Orphan_Records in `application_status_history` where `application_id` does not reference a valid `applications.id`
7. THE Auditor SHALL check for Orphan_Records in `application_status_history` where `changed_by` does not reference a valid `profiles.id`
8. THE Auditor SHALL check for Orphan_Records in `application_interviews` where `application_id` does not reference a valid `applications.id`
9. THE Auditor SHALL check for Orphan_Records in `application_drafts` where `user_id` does not reference a valid `profiles.id`
10. THE Auditor SHALL check for Orphan_Records in `payments` where `application_id` does not reference a valid `applications.id`
11. THE Auditor SHALL check for Orphan_Records in `payments` where `user_id` does not reference a valid `profiles.id`
12. THE Auditor SHALL check for Orphan_Records in `device_sessions` where `user_id` does not reference a valid `profiles.id`
13. THE Auditor SHALL check for Orphan_Records in `csrf_tokens` where `user_id` does not reference a valid `profiles.id`
14. THE Auditor SHALL check for Orphan_Records in `password_reset_tokens` where `user_id` does not reference a valid `profiles.id`
15. THE Auditor SHALL check for Orphan_Records in `notifications` where `user_id` does not reference a valid `profiles.id`
16. THE Auditor SHALL check for Orphan_Records in `audit_logs` where `actor_id` is not NULL and does not reference a valid `profiles.id`
17. THE Auditor SHALL check for Orphan_Records in `program_intakes` where `program_id` does not reference a valid `programs.id` or `intake_id` does not reference a valid `intakes.id`
18. THE Auditor SHALL check for Orphan_Records in `course_requirements` where `program_id` does not reference a valid `programs.id` or `subject_id` does not reference a valid `subjects.id`
19. THE Auditor SHALL check for Orphan_Records in `programs` where `institution_id` is not NULL and does not reference a valid `institutions.id`
20. THE Auditor SHALL verify that all `applications.status` values are within the valid enum set: draft, submitted, under_review, pending_documents, approved, rejected, waitlisted
21. THE Auditor SHALL verify that all `applications.payment_status` values are within the valid enum set: pending_review, verified, rejected
22. THE Auditor SHALL verify that all `application_grades.grade` values are within the valid range 1-9
23. THE Auditor SHALL verify that all `profiles.role` values are within the valid role set: super_admin, admin, admissions_officer, registrar, finance_officer, academic_head, reviewer, student

### Requirement 11: application_status_history Column Conflict Resolution

**User Story:** As a developer, I want the `application_status_history` table's column structure verified, because two different migrations define overlapping columns (`status` from `003_supporting_tables.sql` and `old_status`/`new_status` from `add_idempotency_and_status_history.sql`), and the code references both patterns.

#### Acceptance Criteria

1. THE Auditor SHALL query the Live_Schema to determine the exact column list of `application_status_history`, identifying whether it has `status`, `old_status`, `new_status`, or all three
2. THE Auditor SHALL scan all code references to `application_status_history` in `api-src/*.ts` and `lib/queries.ts` to determine which column names the code uses (status vs old_status/new_status)
3. IF the table has both `status` and `new_status` columns, THE Auditor SHALL verify that the `StatusHistoryQueries.create` function correctly maps to the actual column names
4. IF the table has both `status` and `new_status` columns, THE Auditor SHALL verify that the `StatusHistoryQueries.findByApplicationId` function correctly aliases columns for the `StatusHistoryRecord` interface
5. THE Auditor SHALL verify that the `seed_and_normalize_data.sql` migration's backfill logic (`UPDATE application_status_history SET new_status = status WHERE new_status IS NULL`) is consistent with the actual column structure
6. WHEN a column conflict is identified, THE Auditor SHALL recommend a resolution: either a migration to consolidate columns or code changes to use the correct column names

### Requirement 12: notifications Table Column Audit

**User Story:** As a developer, I want the `notifications` table verified because Round 2 removed `channel` from INSERT statements, but the core schema (`002_core_schema.sql`) defines a `channel` column — I need to know the actual Live_Schema state.

#### Acceptance Criteria

1. THE Auditor SHALL query the Live_Schema to determine the exact column list of the `notifications` table, specifically checking for the presence of `channel`, `priority`, `action_url`, `metadata`, and `idempotency_key` columns
2. THE Auditor SHALL scan all code references to the `notifications` table in `api-src/notifications.ts` to verify every INSERT, SELECT, and UPDATE references only columns that exist in the Live_Schema
3. IF the `channel` column exists in the Live_Schema but is not referenced in code, THE Auditor SHALL report this as a dead column that may be safely removed or should be re-added to code
4. THE Auditor SHALL verify that the `idempotency_key` column referenced in `api-src/notifications.ts` (for deduplication) exists in the Live_Schema

### Requirement 13: user_notification_preferences Column Audit

**User Story:** As a developer, I want the `user_notification_preferences` table verified because Round 2 removed `whatsapp_enabled` and `in_app_enabled` from code, but the core schema defines them — I need to know the actual Live_Schema state and whether the `NotificationPreferencesRecord` interface is accurate.

#### Acceptance Criteria

1. THE Auditor SHALL query the Live_Schema to determine the exact column list of `user_notification_preferences`, specifically checking for `whatsapp_enabled`, `in_app_enabled`, `sms_enabled`, `application_updates`, `payment_reminders`, `interview_reminders`, `marketing_emails`, `quiet_hours_start`, `quiet_hours_end`, and `timezone`
2. THE Auditor SHALL compare the Live_Schema columns against the `NotificationPreferencesRecord` interface in `lib/queries.ts`, reporting any mismatches
3. THE Auditor SHALL scan all UPSERT/INSERT statements targeting `user_notification_preferences` in `api-src/notifications.ts` and `lib/queries.ts` to verify column lists match the Live_Schema
4. IF `whatsapp_enabled` and `in_app_enabled` exist in the Live_Schema but are not referenced in code, THE Auditor SHALL report these as dead columns with a recommendation to either remove them via migration or re-add code references

### Requirement 14: profiles Table Comprehensive Column Audit

**User Story:** As a developer, I want the `profiles` table comprehensively audited because it is the most heavily referenced table across all API endpoints, and previous rounds found column mismatches.

#### Acceptance Criteria

1. THE Auditor SHALL query the Live_Schema to determine the exact column list of `profiles`, including all columns added by migrations (`nationality` from `add_version_and_nationality.sql`, `full_name` from core schema)
2. THE Auditor SHALL verify that the `profiles` table has the `country` column (defined in `002_core_schema.sql`) and check whether any code still references it (Round 1 was supposed to remove all `country` references)
3. THE Auditor SHALL scan all SQL statements in `api-src/auth.ts` that reference `profiles` and verify every column exists in the Live_Schema
4. THE Auditor SHALL scan all SQL statements in `api-src/admin.ts` that reference `profiles` and verify every column exists in the Live_Schema
5. THE Auditor SHALL verify that the `handleRegister` function in `api-src/auth.ts` inserts into `profiles` with a column list that matches the Live_Schema
6. THE Auditor SHALL verify that the `handleProfile` function in `api-src/auth.ts` (profile update) only updates columns that exist in the Live_Schema
7. THE Auditor SHALL verify that the `UserQueries.create` function in `lib/queries.ts` inserts into `profiles` with a column list that matches the Live_Schema
8. THE Auditor SHALL check for columns in the Live_Schema `profiles` table that are never referenced in any code (dead columns), reporting each with a recommendation

### Requirement 15: applications Table Comprehensive Column Audit

**User Story:** As a developer, I want the `applications` table comprehensively audited because it has the most columns (40+) and is the core business entity, making it the highest-risk table for column mismatches.

#### Acceptance Criteria

1. THE Auditor SHALL query the Live_Schema to determine the exact column list of `applications`, including `version` (from `add_version_and_nationality.sql`), `receipt_number`, `eligibility_status`, `eligibility_score`, `eligibility_notes`, `admin_feedback`, `admin_feedback_date`, `admin_feedback_by`, `decision_date`, `additional_subjects`, `country`, `nationality`, `address_line_1`, `address_line_2`, `postal_code`
2. THE Auditor SHALL compare the `ApplicationRecord` interface against the Live_Schema, identifying fields in the interface that do not exist as columns and columns in the Live_Schema that are missing from the interface
3. THE Auditor SHALL verify that the `ApplicationQueries.update` dynamic builder's `allowedFields` array contains only valid column names and does not include removed columns like `country`
4. THE Auditor SHALL scan all inline SQL in `api-src/applications.ts` that references the `applications` table and verify every column exists in the Live_Schema
5. THE Auditor SHALL verify that the `payments.ts` receipt handler's inline type annotation for the application query result matches actual `applications` table columns (checking for phantom columns like `full_name`, `email`, `phone`, `program`, `institution` which may be stored differently)
6. THE Auditor SHALL verify that the `handleCreate` function in `api-src/applications.ts` inserts into `applications` with a column list that matches the Live_Schema

### Requirement 16: device_sessions Table Column Audit

**User Story:** As a developer, I want the `device_sessions` table verified because the `SessionQueries.create` function inserts `device_id` and `session_token` columns that may or may not exist in the Live_Schema.

#### Acceptance Criteria

1. THE Auditor SHALL query the Live_Schema to determine the exact column list of `device_sessions`, specifically checking for `device_id`, `session_token`, `device_info`, `ip_address`, `user_agent`, `is_active`, `last_activity`, `expires_at`
2. THE Auditor SHALL verify that `SessionQueries.create` in `lib/queries.ts` inserts values for columns that all exist in the Live_Schema
3. THE Auditor SHALL verify that the `ip_address` column type in the Live_Schema (INET) is compatible with the string values being inserted by the code
4. THE Auditor SHALL verify that the `isSessionActive` function in `lib/sessions.ts` references only valid columns in its inline SQL query

### Requirement 17: audit_logs Table Column and Type Audit

**User Story:** As a developer, I want the `audit_logs` table verified because Round 2 identified that `entity_id` is UUID NOT NULL but code passes non-UUID strings, and the `retention_category` column was added by a later migration.

#### Acceptance Criteria

1. THE Auditor SHALL query the Live_Schema to determine the exact column list and types of `audit_logs`, specifically checking `entity_id` type (UUID vs TEXT), `retention_category` existence, and `ip_address` type (INET vs TEXT)
2. THE Auditor SHALL verify that the `AuditQueries.log` function's `$4::uuid` cast is compatible with the `entity_id` column type in the Live_Schema
3. THE Auditor SHALL verify that the `sanitizeEntityId` function in `lib/queries.ts` correctly handles non-UUID values by substituting the placeholder UUID
4. THE Auditor SHALL verify that the `retention_category` column exists with the CHECK constraint for valid values ('standard', 'security')
5. THE Auditor SHALL verify that all `AuditQueries` functions pass `ip_address` values compatible with the column type (INET requires valid IP format, not arbitrary strings)
6. IF `entity_id` is still UUID type, THE Auditor SHALL verify that all code paths that call `AuditQueries.log` or `AuditQueries.logAuthEvent` or `AuditQueries.logSessionEvent` pass valid UUID values or use the sanitizeEntityId function

### Requirement 18: settings Table Column Audit

**User Story:** As a developer, I want the `settings` table verified because `api-src/admin.ts` performs CRUD operations on it and the `seed_and_normalize_data.sql` migration seeds default values.

#### Acceptance Criteria

1. THE Auditor SHALL query the Live_Schema to determine the exact column list of `settings`, specifically checking for `key`, `value`, `description`, `category`, `is_public`, `updated_by`
2. THE Auditor SHALL verify that the `SystemSetting` interface in `api-src/admin.ts` matches the Live_Schema columns
3. THE Auditor SHALL verify that all INSERT, UPDATE, and SELECT statements targeting `settings` in `api-src/admin.ts` reference only valid columns
4. THE Auditor SHALL verify that the seeded settings from `seed_and_normalize_data.sql` use column names that match the Live_Schema

### Requirement 19: Catalog Tables Column Audit (programs, intakes, subjects, institutions, program_intakes, course_requirements)

**User Story:** As a developer, I want all catalog tables verified because `api-src/catalog.ts` performs full CRUD operations and the interfaces in `lib/queries.ts` must match the Live_Schema.

#### Acceptance Criteria

1. THE Auditor SHALL verify the `programs` table has `institution_id` (added by `seed_and_normalize_data.sql`) and all columns referenced by `CatalogQueries` and `api-src/catalog.ts`
2. THE Auditor SHALL verify the `ProgramRow` interface in `api-src/catalog.ts` matches the Live_Schema `programs` table columns
3. THE Auditor SHALL verify the `IntakeRow` interface in `api-src/catalog.ts` matches the Live_Schema `intakes` table columns
4. THE Auditor SHALL verify the `InstitutionRecord` interface in `api-src/catalog.ts` matches the Live_Schema `institutions` table columns, including `full_name` and `description` (added by `seed_and_normalize_data.sql`)
5. THE Auditor SHALL verify that `program_intakes` has the UNIQUE constraint on `(program_id, intake_id)` and all columns referenced by code
6. THE Auditor SHALL verify that `course_requirements` has all columns referenced by `seed_program_intakes_and_requirements.sql`: `program_id`, `subject_id`, `is_mandatory`, `minimum_grade`, `weight`, `requirement_type`
7. THE Auditor SHALL verify that the `intakes` table has `program_id` column — the `normalize_data.sql` migration deletes intakes where `program_id NOT IN (SELECT id FROM programs)`, but the core schema does NOT define a `program_id` column on `intakes`, which would cause the migration to fail

### Requirement 20: Remaining Tables Column Audit

**User Story:** As a developer, I want all remaining tables (csrf_tokens, password_reset_tokens, login_attempts, idempotency_keys, email_queue, application_interviews, application_drafts, payments, documents, document_migration_log, user_permission_overrides) verified against their code references.

#### Acceptance Criteria

1. THE Auditor SHALL verify `csrf_tokens` columns match the SQL in `lib/csrf.ts`: `user_id`, `token_hash`, `expires_at`, `created_at`
2. THE Auditor SHALL verify `password_reset_tokens` columns match the SQL in `api-src/auth.ts`: `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at`
3. THE Auditor SHALL verify `login_attempts` columns match the SQL in `api-src/auth.ts`: `email_hash`, `ip_hash`, `attempted_at`, `success`
4. THE Auditor SHALL verify `idempotency_keys` columns match the SQL in `api-src/applications.ts`: `key`, `endpoint`, `response_json`, `created_at`
5. THE Auditor SHALL verify `email_queue` columns match the SQL in `api-src/email.ts` and `api-src/notifications.ts`: `recipient_email`, `recipient_name`, `subject`, `body`, `html_body`, `template_name`, `template_data`, `status`, `priority`, `retry_count`, `max_retries`, `error_message`, `sent_at`, `created_at`
6. THE Auditor SHALL verify `application_interviews` columns match the SQL in `api-src/applications.ts`: `application_id`, `scheduled_at`, `mode`, `location`, `status`, `notes`, `created_by`, `updated_by`
7. THE Auditor SHALL verify `application_drafts` columns match any code references, checking for `user_id`, `application_id`, `draft_data`, `step_completed`, `is_active`
8. THE Auditor SHALL verify `payments` table columns match any code references in `lib/auth/ownership.ts` and `api-src/payments.ts`
9. THE Auditor SHALL verify `documents` (legacy table) has 0 rows as documented, and check if any code still references it
10. THE Auditor SHALL verify `document_migration_log` and `migration_history` tables exist and have the expected columns
11. THE Auditor SHALL verify `user_permission_overrides` columns match any code references in `api-src/admin.ts`

### Requirement 21: normalize_data.sql Migration Correctness Audit

**User Story:** As a developer, I want the `normalize_data.sql` migration verified for correctness because it references columns and relationships that may not exist in the Live_Schema, specifically the `intakes.program_id` reference and the `documents` table cleanup.

#### Acceptance Criteria

1. THE Auditor SHALL verify that the `intakes` table in the Live_Schema does NOT have a `program_id` column, confirming that the `DELETE FROM intakes WHERE program_id NOT IN (SELECT id FROM programs)` statement in `normalize_data.sql` would fail if executed
2. THE Auditor SHALL verify whether `normalize_data.sql` was actually applied by checking if its effects are visible (e.g., normalized phone numbers, default nationality values)
3. THE Auditor SHALL verify that the `documents` table cleanup in `normalize_data.sql` (`DELETE FROM documents WHERE application_id NOT IN ...`) is safe given the table's current state
4. IF `normalize_data.sql` was not applied due to the `intakes.program_id` error, THE Auditor SHALL report which normalization steps were skipped and recommend a corrected migration

### Requirement 22: Fix Generation and Remediation Plan

**User Story:** As a developer, I want a prioritized remediation plan for every issue found, so that I can fix all problems in order of severity without breaking the production system.

#### Acceptance Criteria

1. FOR EACH Phantom_Column found, THE Auditor SHALL generate a specific code fix (remove the column reference or add a migration to create the column)
2. FOR EACH Interface_Mismatch found, THE Auditor SHALL generate a specific interface update with the corrected field list
3. FOR EACH Ghost_Migration found, THE Auditor SHALL generate a corrected migration file that can be safely applied to the Live_Schema
4. FOR EACH Orphan_Record found, THE Auditor SHALL generate a cleanup SQL statement with appropriate safety checks
5. FOR EACH data quality issue found, THE Auditor SHALL generate a normalization SQL statement
6. THE Auditor SHALL categorize all fixes into severity levels: CRITICAL (causes runtime errors), HIGH (causes data corruption), MEDIUM (dead code/columns), LOW (documentation mismatch)
7. THE Auditor SHALL order fixes so that migration fixes are applied before code fixes, and code fixes are applied before data cleanup
8. THE Auditor SHALL ensure all generated migration SQL uses `IF NOT EXISTS` / `IF EXISTS` for idempotent re-runs
9. THE Auditor SHALL ensure no generated fix would break in-progress student applications or lose existing data
