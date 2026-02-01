# Requirements Document

## Introduction

This specification defines the complete exit migration from Supabase to a fully independent infrastructure stack. The migration targets Neon Postgres for database operations and Cloudflare R2 for object storage, while maintaining all existing functionality within Vercel's 12-function serverless limit.

The system currently uses Supabase for:
- **Database**: PostgreSQL with 86+ tables, RLS policies, triggers, and stored functions
- **Storage**: File uploads via `app_docs` bucket (documents, receipts, slips)
- **RPC Functions**: 10+ custom database functions called from frontend/backend
- **Row Level Security**: auth.uid()-based policies across multiple tables

Supabase Auth has already been replaced with custom Bun-native JWT authentication.

## Glossary

- **Neon**: Serverless Postgres provider with branching, autoscaling, and scale-to-zero
- **R2**: Cloudflare's S3-compatible object storage with zero egress fees
- **RLS**: Row Level Security - PostgreSQL feature for row-level access control
- **RPC**: Remote Procedure Call - Supabase's method for calling database functions
- **Migration_Bundle**: Collection of SQL scripts for schema, functions, and data migration
- **Storage_Adapter**: Abstraction layer for file operations (upload, download, signed URLs)
- **Function_Consolidation**: Process of merging multiple endpoints into single Vercel functions

## Requirements

### Requirement 1: Supabase Forensic Extraction

**User Story:** As a migration engineer, I want to extract and inventory all Supabase assets, so that I can ensure zero functionality loss during migration.

#### Acceptance Criteria

1. WHEN the forensic extraction runs, THE Migration_Bundle SHALL enumerate all database tables with their column definitions, indexes, and constraints
2. WHEN the forensic extraction runs, THE Migration_Bundle SHALL catalog all RLS policies with their associated auth.uid() references
3. WHEN the forensic extraction runs, THE Migration_Bundle SHALL identify all stored procedures, triggers, and SQL functions
4. WHEN the forensic extraction runs, THE Migration_Bundle SHALL list all RPC functions called from application code
5. WHEN the forensic extraction runs, THE Migration_Bundle SHALL document all storage buckets, their policies, and lifecycle rules
6. WHEN the forensic extraction runs, THE Migration_Bundle SHALL classify each asset as: database-native (Neon compatible), Supabase-specific (requires reimplementation), redundant (already replaced), or dangerous (breaks under Vercel limits)
7. THE Migration_Bundle SHALL produce a machine-readable inventory file (JSON) for automated verification

### Requirement 2: Neon Database Migration

**User Story:** As a system administrator, I want to migrate all database assets to Neon Postgres, so that the system operates independently of Supabase.

#### Acceptance Criteria

1. THE Migration_Bundle SHALL convert all table definitions to Neon-compatible SQL (DDL)
2. THE Migration_Bundle SHALL convert all indexes and constraints to Neon-compatible SQL
3. THE Migration_Bundle SHALL convert all triggers to Neon-compatible SQL or flag for application-layer reimplementation
4. THE Migration_Bundle SHALL convert all stored procedures and functions to Neon-compatible SQL
5. WHEN a Supabase-specific feature is detected (auth.uid(), auth.jwt()), THE Migration_Bundle SHALL flag it for application-layer security enforcement
6. THE Migration_Bundle SHALL produce separate SQL files for: schema creation, function creation, index creation, and data migration
7. THE Migration_Bundle SHALL verify all PostgreSQL extensions required are available in Neon (pgcrypto, uuid-ossp, etc.)
8. WHEN the migration executes, THE System SHALL preserve all existing data with zero data loss
9. WHEN the migration executes, THE System SHALL maintain referential integrity across all foreign key relationships

### Requirement 3: RLS Policy Replacement

**User Story:** As a security engineer, I want to replace Supabase RLS policies with application-layer security, so that access control is maintained without Supabase dependencies.

#### Acceptance Criteria

1. WHEN an RLS policy uses auth.uid(), THE Security_Layer SHALL enforce equivalent access control in the API middleware
2. WHEN an RLS policy checks user roles, THE Security_Layer SHALL use JWT-embedded roles (no database lookup)
3. THE Security_Layer SHALL implement ownership checks for user-specific data (applications, documents, sessions)
4. THE Security_Layer SHALL implement role-based access for admin operations (admin, super_admin, reviewer)
5. WHEN a query bypasses the API layer, THE Database SHALL deny access (service role only)
6. THE Migration_Bundle SHALL document each RLS policy and its application-layer replacement
7. FOR ALL tables with RLS policies, THE Security_Layer SHALL provide equivalent protection

### Requirement 4: RPC Function Migration

**User Story:** As a developer, I want to migrate all RPC functions to application code or Neon-compatible SQL, so that the system functions without Supabase RPC.

#### Acceptance Criteria

1. WHEN an RPC function performs simple queries, THE Migration_Bundle SHALL convert it to a typed query builder
2. WHEN an RPC function performs complex logic, THE Migration_Bundle SHALL convert it to a Neon-compatible stored procedure
3. WHEN an RPC function is called from frontend code, THE Migration_Bundle SHALL create an equivalent API endpoint
4. THE Migration_Bundle SHALL identify all RPC functions: get_admin_dashboard_stats, perform_maintenance, archive_old_applications, cleanup_old_drafts, create_backup_record, update_backup_status, check_database_health, get_error_statistics, increment_plugin_downloads, execute_plugin_query, generate_notification_dedup_hash, check_data_integrity
5. FOR ALL identified RPC functions, THE Migration_Bundle SHALL provide a migration path (SQL function, API endpoint, or query builder)
6. THE Migration_Bundle SHALL verify no RPC calls remain in production code after migration

### Requirement 5: Storage Migration to Cloudflare R2

**User Story:** As a system administrator, I want to migrate file storage from Supabase to Cloudflare R2, so that the system operates independently of Supabase Storage.

#### Acceptance Criteria

1. THE Storage_Adapter SHALL support file upload to R2 with the same interface as Supabase Storage
2. THE Storage_Adapter SHALL support file download from R2 with the same interface as Supabase Storage
3. THE Storage_Adapter SHALL support signed URL generation for secure file access
4. THE Storage_Adapter SHALL support public URL generation for publicly accessible files
5. WHEN migrating existing files, THE Migration_Bundle SHALL preserve all file paths and metadata
6. THE Storage_Adapter SHALL maintain the existing bucket structure (app_docs)
7. THE Storage_Adapter SHALL enforce file size limits (10MB maximum)
8. THE Storage_Adapter SHALL enforce file type restrictions (PDF, JPG, JPEG, PNG)
9. WHEN a storage operation fails, THE Storage_Adapter SHALL return descriptive error messages
10. THE Storage_Adapter SHALL be compatible with Bun runtime

### Requirement 6: Function Consolidation (Vercel 12-Function Limit)

**User Story:** As a platform engineer, I want to consolidate all serverless functions to fit within Vercel's 12-function limit, so that the system operates within free tier constraints.

#### Acceptance Criteria

1. THE Function_Consolidation SHALL identify all current API endpoints and their action counts
2. THE Function_Consolidation SHALL identify all Supabase Edge Functions requiring migration
3. THE Function_Consolidation SHALL propose a consolidation map that fits within 12 functions
4. WHEN consolidating functions, THE Function_Consolidation SHALL preserve all existing functionality
5. WHEN consolidating functions, THE Function_Consolidation SHALL maintain existing URL patterns where possible
6. THE Function_Consolidation SHALL document the mapping from old endpoints to new consolidated endpoints
7. THE current API structure (admin, applications, auth, catalog, documents, health, notifications, payments, sessions) SHALL be preserved or consolidated without behavior loss
8. THE Supabase Edge Function (send-email) SHALL be migrated to an existing consolidated endpoint

### Requirement 7: Data Migration Execution

**User Story:** As a database administrator, I want to execute the data migration with zero downtime, so that production users are not impacted.

#### Acceptance Criteria

1. THE Migration_Execution SHALL support a dual-write period where both databases receive writes
2. THE Migration_Execution SHALL provide a verification step to compare source and target data
3. THE Migration_Execution SHALL support rollback to Supabase if critical issues are detected
4. WHEN the migration completes, THE System SHALL switch reads to Neon atomically
5. THE Migration_Execution SHALL preserve all timestamps (created_at, updated_at) exactly
6. THE Migration_Execution SHALL preserve all UUIDs and primary keys exactly
7. THE Migration_Execution SHALL handle in-progress applications without data loss
8. THE Migration_Execution SHALL complete within a maintenance window of 30 minutes maximum

### Requirement 8: Supabase Dependency Removal

**User Story:** As a developer, I want to remove all Supabase dependencies from the codebase, so that the system has no Supabase lock-in.

#### Acceptance Criteria

1. THE Cleanup_Process SHALL remove @supabase/supabase-js from package.json
2. THE Cleanup_Process SHALL remove all Supabase client imports from source files
3. THE Cleanup_Process SHALL remove Supabase-specific type definitions
4. THE Cleanup_Process SHALL update all storage operations to use the new Storage_Adapter
5. THE Cleanup_Process SHALL update all database operations to use the database abstraction layer
6. THE Cleanup_Process SHALL remove Supabase environment variables from configuration
7. THE Cleanup_Process SHALL update Vite configuration to remove Supabase-specific caching rules
8. THE Cleanup_Process SHALL update service worker to remove Supabase-specific caching
9. WHEN cleanup completes, THE System SHALL have zero references to Supabase in production code

### Requirement 9: Verification and Testing

**User Story:** As a QA engineer, I want to verify the migration preserves all functionality, so that production users experience no regressions.

#### Acceptance Criteria

1. THE Verification_Suite SHALL test all authentication flows (login, logout, register, refresh)
2. THE Verification_Suite SHALL test all application CRUD operations
3. THE Verification_Suite SHALL test all document upload and retrieval operations
4. THE Verification_Suite SHALL test all payment verification flows
5. THE Verification_Suite SHALL test all admin operations (user management, application review)
6. THE Verification_Suite SHALL verify data integrity between source and target databases
7. THE Verification_Suite SHALL verify file integrity between source and target storage
8. THE Verification_Suite SHALL test offline functionality (PWA)
9. THE Verification_Suite SHALL test auto-save functionality (8-second interval)
10. FOR ALL critical paths, THE Verification_Suite SHALL provide pass/fail status with detailed logs

### Requirement 10: Risk Mitigation

**User Story:** As a project manager, I want documented risk mitigation strategies, so that the migration can be executed safely.

#### Acceptance Criteria

1. THE Risk_Register SHALL document all identified risks with probability and impact ratings
2. THE Risk_Register SHALL provide detection mechanisms for each risk
3. THE Risk_Register SHALL provide mitigation strategies for each risk
4. THE Risk_Register SHALL include rollback procedures for critical failures
5. THE Risk_Register SHALL identify data loss scenarios and prevention measures
6. THE Risk_Register SHALL identify performance degradation scenarios and monitoring
7. THE Risk_Register SHALL identify security vulnerability scenarios and countermeasures
8. WHEN a risk materializes, THE System SHALL have documented response procedures
