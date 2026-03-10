# Implementation Plan: Deep Forensic Database Audit

## Overview

Six-phase pipeline audit of the MIHAS Neon Postgres database (project: `wild-bar-37055823`) cross-referencing live schema against all 10 API source files, 6 shared utility files, 15 TypeScript interfaces, 9 query builders, and 23 migration files. Each phase builds on the previous phase's output. All database operations use Neon MCP. All fixes use idempotent SQL.

## Tasks

- [x] 1. Phase 1 — Schema Discovery: Build complete live schema snapshot
  - [x] 1.1 Query information_schema.columns via Neon MCP for all tables in the public schema, recording column_name, data_type, is_nullable, column_default, and character_maximum_length for every column across all tables
    - Store results as the ground-truth schema snapshot for all subsequent phases
    - Verify all 28 expected tables exist: profiles, applications, application_documents, application_grades, application_interviews, application_status_history, application_drafts, programs, intakes, program_intakes, course_requirements, subjects, institutions, payments, documents, notifications, user_notification_preferences, email_queue, device_sessions, csrf_tokens, password_reset_tokens, login_attempts, audit_logs, idempotency_keys, settings, user_permission_overrides, document_migration_log, migration_history
    - Detect any unexpected tables not in the 28-table list (potential artifacts from abandoned migrations)
    - Specifically check for `push_subscriptions` table (defined in 003_supporting_tables.sql but not in canonical list)
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7_

  - [x] 1.2 Query information_schema.table_constraints, key_column_usage, and referential_constraints to map all primary keys, foreign keys, and unique constraints for every table
    - Record constraint names, source/target tables, source/target columns, and ON DELETE rules
    - _Requirements: 2.2_

  - [x] 1.3 Query pg_indexes to inventory all indexes on every table, recording index name, columns, and uniqueness
    - _Requirements: 2.3_

- [x] 2. Phase 2 — Migration Verification: Cross-reference migration files against live schema
  - [x] 2.1 Query the migration_history table via Neon MCP to retrieve all applied migration names and timestamps; if migration_history does not exist or is empty, fall back to direct schema inspection
    - _Requirements: 1.1, 1.8_

  - [x] 2.2 List all migration files in migrations/ directory and cross-reference each against migration_history records to identify Ghost_Migrations
    - For each ghost migration, verify whether its schema changes exist in the live schema (indicating manual or out-of-band application)
    - Report file name, expected changes, and current live schema state for each ghost migration
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 2.3 Specifically verify the 9 post-core migration files were applied: add_csrf_tokens_table.sql, add_password_reset_tokens_table.sql, add_login_attempts_table.sql, add_audit_retention_category.sql, add_idempotency_and_status_history.sql, add_version_and_nationality.sql, normalize_data.sql, seed_and_normalize_data.sql, seed_program_intakes_and_requirements.sql
    - Verify idempotency_keys and application_status_history tables exist with all specified columns and indexes
    - Verify application_status_history has both original `status` column and `old_status`/`new_status` columns, identifying column conflicts
    - _Requirements: 1.5, 1.6, 1.7_

  - [x] 2.4 Audit normalize_data.sql migration correctness: verify intakes table does NOT have program_id column (the DELETE FROM intakes WHERE program_id NOT IN... would fail), check if migration was actually applied by inspecting normalization effects, and verify documents table cleanup safety
    - If normalize_data.sql was not applied due to intakes.program_id error, report which normalization steps were skipped and recommend a corrected migration
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [x] 3. Checkpoint — Review Phase 1-2 findings
  - Ensure schema snapshot is complete and migration verification is done. Ask the user if questions arise before proceeding to SQL cross-referencing.

- [x] 4. Phase 3 — SQL Cross-Reference: Validate every SQL statement in api-src/ and lib/ against live schema
  - [x] 4.1 Audit all INSERT statements in api-src/auth.ts against the live schema — extract target table and column list for each INSERT, verify every column exists in the profiles, login_attempts, password_reset_tokens, csrf_tokens, and device_sessions tables
    - Report phantom columns with file name, line number, table name, phantom column, and valid column list
    - _Requirements: 3.1, 14.3, 14.5_

  - [x] 4.2 Audit all INSERT, SELECT, UPDATE, DELETE statements in api-src/applications.ts against the live schema — verify every column reference in applications, application_documents, application_grades, application_status_history, application_interviews, application_drafts, idempotency_keys tables
    - Specifically audit the dynamic UPDATE builder's allowedFields array to verify every field corresponds to a real applications column
    - Specifically audit the fetchApplicationDetails complex JOINs (applications + profiles + application_documents + application_grades + subjects + application_status_history)
    - _Requirements: 3.2, 4.2, 5.2, 6.3, 15.4, 15.6_

  - [x] 4.3 Audit all SQL statements in api-src/admin.ts against the live schema — verify every column reference in profiles, applications, settings, user_permission_overrides, audit_logs tables
    - Specifically audit the handleUpdateUser function to verify every updatable field corresponds to a real profiles column
    - Verify SystemSetting interface matches settings table columns
    - _Requirements: 3.3, 4.3, 5.3, 14.4, 18.2, 18.3_

  - [x] 4.4 Audit all SQL statements in api-src/notifications.ts against the live schema — verify every column reference in notifications, user_notification_preferences, email_queue tables
    - Verify idempotency_key column exists in notifications table
    - Check for channel column presence/absence
    - _Requirements: 3.4, 4.4, 12.1, 12.2, 12.3, 12.4_

  - [x] 4.5 Audit all SQL statements in api-src/documents.ts, api-src/email.ts, api-src/bootstrap.ts, api-src/catalog.ts, api-src/sessions.ts, api-src/payments.ts against the live schema
    - Verify every column reference in application_documents, email_queue, programs, intakes, subjects, institutions, program_intakes, course_requirements, device_sessions, payments, applications tables
    - Verify ProgramRow, IntakeRow, InstitutionRecord interfaces match live schema
    - Verify payments.ts receipt handler inline type annotations match actual columns
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.5-4.10, 15.5, 19.1-19.7_

  - [x] 4.6 Audit all SQL statements in shared utility files: lib/queries.ts, lib/sessions.ts, lib/csrf.ts, lib/auditLogger.ts, lib/auth/middleware.ts, lib/auth/ownership.ts against the live schema
    - Verify every column reference in all query builder functions
    - Verify lib/sessions.ts references valid device_sessions columns
    - Verify lib/csrf.ts references valid csrf_tokens columns
    - Verify lib/auditLogger.ts references valid audit_logs columns
    - Verify lib/auth/middleware.ts references valid profiles and device_sessions columns
    - Verify lib/auth/ownership.ts references valid columns for applications, application_documents, application_drafts, payments
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 4.7 Flag all SELECT * usages across all api-src/ and lib/ files for review (fragile to schema changes)
    - _Requirements: 4.11_

- [x] 5. Phase 4 — Interface & Query Builder Audit: Validate TypeScript interfaces and query builders against live schema
  - [x] 5.1 Compare all 15 TypeScript interfaces in lib/queries.ts against live schema columns — UserRecord, UserAuthRecord, UserPublicRecord, SessionRecord, SessionDisplayRecord, AuditLogRecord, ApplicationRecord, DocumentRecord, GradeRecord, StatusHistoryRecord, ProgramRecord, IntakeRecord, SubjectRecord, NotificationPreferencesRecord, PushSubscriptionRecord
    - For each interface: report extra fields (in interface but not in table), missing fields (in table but not in interface)
    - Verify TypeScript types are compatible with PostgreSQL types (string↔varchar/text/uuid, number↔integer/numeric, boolean↔boolean, Date↔timestamptz)
    - Verify nullable TypeScript fields (| null) correspond to nullable columns, and non-nullable fields correspond to NOT NULL columns
    - _Requirements: 8.1-8.17_

  - [x] 5.2 Compare inline interfaces in api-src/ files against live schema — SystemSetting (admin.ts→settings), ProgramRow (catalog.ts→programs), IntakeRow (catalog.ts→intakes), InstitutionRecord (catalog.ts→institutions)
    - _Requirements: 18.2, 19.2, 19.3, 19.4_

  - [x] 5.3 Validate all 9 query builder objects in lib/queries.ts produce correct SQL for the current live schema
    - UserQueries → profiles: verify columns and parameter counts
    - SessionQueries → device_sessions: specifically verify create() inserts device_id and session_token columns that exist in live schema
    - AuditQueries → audit_logs: verify $4::uuid cast compatibility with entity_id column type, verify retention_category column exists
    - ApplicationQueries → applications: verify update() allowedFields array contains only valid columns, verify parameter placeholder syntax
    - DocumentQueries → application_documents: verify columns and parameter counts
    - GradeQueries → application_grades: verify columns and parameter counts
    - StatusHistoryQueries → application_status_history: verify create() maps to actual column names (status vs old_status/new_status)
    - CatalogQueries → programs, intakes, subjects: verify columns and parameter counts
    - NotificationQueries → user_notification_preferences, push_subscriptions: verify columns and parameter counts
    - _Requirements: 9.1-9.13_

  - [x] 5.4 Resolve application_status_history column conflict — determine whether table has status, old_status, new_status, or all three; verify StatusHistoryQueries.create and findByApplicationId use correct column names; verify seed_and_normalize_data.sql backfill logic consistency
    - _Requirements: 11.1-11.6_

  - [x] 5.5 Audit user_notification_preferences columns — check for whatsapp_enabled, in_app_enabled, sms_enabled and all preference columns; compare against NotificationPreferencesRecord; verify UPSERT statements match live schema; report dead columns
    - _Requirements: 13.1-13.4_

  - [x] 5.6 Audit device_sessions columns — verify device_id, session_token, device_info, ip_address, user_agent, is_active, last_activity, expires_at; verify SessionQueries.create; verify ip_address INET type compatibility; verify isSessionActive function
    - _Requirements: 16.1-16.4_

  - [x] 5.7 Audit audit_logs columns and types — verify entity_id type (UUID vs TEXT), retention_category existence and CHECK constraint, ip_address type (INET vs TEXT); verify sanitizeEntityId handles non-UUID values; verify all AuditQueries pass compatible ip_address values
    - _Requirements: 17.1-17.6_

  - [x] 5.8 Audit remaining tables: csrf_tokens, password_reset_tokens, login_attempts, idempotency_keys, email_queue, application_interviews, application_drafts, payments, documents (legacy), document_migration_log, user_permission_overrides against their code references
    - Verify documents table has 0 rows and check if any code still references it
    - _Requirements: 20.1-20.11_

- [x] 6. Checkpoint — Review Phase 3-4 findings
  - Ensure all SQL cross-referencing and interface auditing is complete. Ask the user if questions arise before proceeding to data integrity checks.

- [x] 7. Phase 5 — Data Integrity Checks: Run orphan record detection and enum validation on live data
  - [x] 7.1 Count rows in all 28 tables via Neon MCP and report the row counts
    - _Requirements: 10.1_

  - [x] 7.2 Run orphan record detection queries for all 19 foreign key relationships via Neon MCP
    - applications.user_id → profiles.id
    - application_documents.application_id → applications.id
    - application_grades.application_id → applications.id
    - application_grades.subject_id → subjects.id
    - application_status_history.application_id → applications.id
    - application_status_history.changed_by → profiles.id
    - application_interviews.application_id → applications.id
    - application_drafts.user_id → profiles.id
    - payments.application_id → applications.id
    - payments.user_id → profiles.id
    - device_sessions.user_id → profiles.id
    - csrf_tokens.user_id → profiles.id
    - password_reset_tokens.user_id → profiles.id
    - notifications.user_id → profiles.id
    - audit_logs.actor_id → profiles.id (where actor_id IS NOT NULL)
    - program_intakes.program_id → programs.id
    - program_intakes.intake_id → intakes.id
    - course_requirements.program_id → programs.id
    - course_requirements.subject_id → subjects.id
    - programs.institution_id → institutions.id (where institution_id IS NOT NULL)
    - _Requirements: 10.2-10.19_

  - [x] 7.3 Validate enum values in live data via Neon MCP
    - applications.status must be in: draft, submitted, under_review, pending_documents, approved, rejected, waitlisted
    - applications.payment_status must be in: pending_review, verified, rejected
    - application_grades.grade must be in range 1-9
    - profiles.role must be in: super_admin, admin, admissions_officer, registrar, finance_officer, academic_head, reviewer, student
    - _Requirements: 10.20-10.23_

  - [x] 7.4 Deep-dive profiles table: verify country column existence and check for lingering code references (Round 1 cleanup); verify nationality column from add_version_and_nationality.sql; verify handleRegister and handleProfile column lists; verify UserQueries.create column list; identify dead columns never referenced in code
    - _Requirements: 14.1-14.8_

  - [x] 7.5 Deep-dive applications table: verify all 40+ columns including version, receipt_number, eligibility fields, admin_feedback fields, decision_date, additional_subjects, address fields; verify ApplicationRecord interface completeness; verify handleCreate column list
    - _Requirements: 15.1-15.6_

  - [x] 7.6 Deep-dive catalog tables: verify programs.institution_id, ProgramRow/IntakeRow/InstitutionRecord interfaces, program_intakes UNIQUE constraint, course_requirements columns from seed migration, intakes.program_id non-existence
    - _Requirements: 19.1-19.7_

  - [x] 7.7 Deep-dive settings table: verify columns match SystemSetting interface and seed_and_normalize_data.sql column names
    - _Requirements: 18.1-18.4_

- [x] 8. Checkpoint — Review Phase 5 findings
  - Ensure all data integrity checks are complete. Ask the user if questions arise before generating fixes.

- [x] 9. Phase 6 — Fix Generation: Generate prioritized remediation for all issues found
  - [x] 9.1 Generate CRITICAL fixes for phantom columns causing runtime SQL errors — produce specific code fixes (remove column reference) or migration SQL (add column with IF NOT EXISTS)
    - Order: migration fixes first, then code fixes
    - _Requirements: 22.1, 22.6, 22.7, 22.8_

  - [x] 9.2 Generate HIGH fixes for interface mismatches causing silent data loss — produce corrected interface definitions for lib/queries.ts and inline interfaces in api-src/ files
    - _Requirements: 22.2, 22.6_

  - [x] 9.3 Generate HIGH fixes for ghost migrations with unapplied schema changes — produce corrected migration SQL files with IF NOT EXISTS guards
    - Specifically generate corrected normalize_data.sql that removes the intakes.program_id reference
    - _Requirements: 22.3, 22.8_

  - [x] 9.4 Generate MEDIUM fixes for dead columns in schema not referenced by code — produce optional migration SQL to drop columns, and code fixes for SELECT * usages
    - _Requirements: 22.6_

  - [x] 9.5 Generate data cleanup SQL for orphan records and enum normalization — all DELETE statements must have explicit WHERE clauses, all fixes must be safe for in-progress applications
    - _Requirements: 22.4, 22.5, 22.9_

  - [x] 9.6 Apply all CRITICAL and HIGH fixes to the codebase — update lib/queries.ts interfaces and query builders, update api-src/*.ts inline SQL, create corrected migration file(s) in migrations/
    - Ensure no fix breaks in-progress student applications or loses existing data
    - _Requirements: 22.7, 22.9_

  - [x] 9.7 Execute data cleanup SQL via Neon MCP — run orphan record cleanup and enum normalization queries against the live database (all data is test data, safe to modify)
    - _Requirements: 22.4, 22.5_

- [x] 10. Final checkpoint — Ensure all fixes are applied
  - Ensure all code changes compile, all migration SQL is idempotent, and all data cleanup was executed. Ask the user if questions arise.

## Notes

- All database operations use Neon MCP (project: wild-bar-37055823) — never Supabase
- The live schema is the single source of truth, not migration files or TypeScript interfaces
- All generated migration SQL uses IF NOT EXISTS / IF EXISTS for idempotent re-runs
- All data in the database is test data — safe to modify freely
- migrations/ directory is gitignored
- API source files are in api-src/ (TypeScript), bundled to api/ (JavaScript, auto-generated)
- Shared utilities are at project root lib/, not api/lib/
- Focus on implementation fixes, minimize writing new tests
- Each phase builds on the previous — do not skip phases
