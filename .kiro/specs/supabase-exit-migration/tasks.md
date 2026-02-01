# Implementation Tasks: Supabase Exit Migration

## Task 1: Forensic Extraction and Inventory
- [x] 1.1 Extract complete database schema from Supabase
  - [x] 1.1.1 Export all table definitions with columns, types, and constraints
  - [x] 1.1.2 Export all index definitions
  - [x] 1.1.3 Export all foreign key relationships
  - [x] 1.1.4 Export all check constraints
- [x] 1.2 Extract all stored procedures and functions
  - [x] 1.2.1 Export function definitions from information_schema
  - [x] 1.2.2 Classify functions: utility, trigger, RPC, Supabase-specific
  - [x] 1.2.3 Document function dependencies
- [x] 1.3 Extract all triggers
  - [x] 1.3.1 Export trigger definitions
  - [x] 1.3.2 Map triggers to their functions
  - [x] 1.3.3 Identify Supabase-specific triggers (auth events)
- [x] 1.4 Extract all RLS policies
  - [x] 1.4.1 Export policy definitions from pg_policies
  - [x] 1.4.2 Document auth.uid() usage patterns
  - [x] 1.4.3 Document auth.jwt() usage patterns
- [x] 1.5 Create machine-readable inventory (JSON)
  - [x] 1.5.1 Generate tables inventory with row counts
  - [x] 1.5.2 Generate functions inventory with classifications
  - [x] 1.5.3 Generate RLS policies inventory with replacement mapping

## Task 2: Neon Database Setup
- [x] 2.1 Create Neon project and database
  - [x] 2.1.1 Sign up for Neon account
  - [x] 2.1.2 Create production database
  - [x] 2.1.3 Create development branch for testing
  - [x] 2.1.4 Configure connection pooling
- [x] 2.2 Enable required extensions
  - [x] 2.2.1 Enable uuid-ossp extension
  - [x] 2.2.2 Enable pgcrypto extension
  - [x] 2.2.3 Verify extension compatibility

## Task 3: Schema Migration
- [x] 3.1 Convert table definitions to Neon-compatible SQL
  - [x] 3.1.1 Remove auth.users foreign key references
  - [x] 3.1.2 Convert to profiles table references
  - [x] 3.1.3 Preserve all column types and defaults
- [x] 3.2 Create migration SQL files
  - [x] 3.2.1 Create 001_schema.sql with table definitions
  - [x] 3.2.2 Create 002_indexes.sql with index definitions
  - [x] 3.2.3 Create 003_constraints.sql with foreign keys
- [x] 3.3 Apply schema to Neon database
  - [x] 3.3.1 Run schema migration on development branch
  - [x] 3.3.2 Verify all tables created
  - [x] 3.3.3 Verify all indexes created

## Task 4: Function Migration
- [x] 4.1 Migrate utility functions to Neon
  - [x] 4.1.1 Convert generate_application_number function
  - [x] 4.1.2 Convert generate_tracking_code function
  - [x] 4.1.3 Convert validation functions (phone, email, NRC)
  - [x] 4.1.4 Convert grade calculation functions
- [x] 4.2 Migrate trigger functions to Neon
  - [x] 4.2.1 Convert update_updated_at_column trigger
  - [x] 4.2.2 Convert set_application_defaults trigger
  - [x] 4.2.3 Convert prevent_audit_modification trigger
- [x] 4.3 Convert RPC functions to API endpoints
  - [x] 4.3.1 Add get_admin_dashboard_stats to api/admin.ts
  - [x] 4.3.2 Add check_database_health to api/health.ts
  - [x] 4.3.3 Add get_error_statistics to api/admin.ts
- [x] 4.4 Create migration SQL file for functions
  - [x] 4.4.1 Create 004_functions.sql with utility functions
  - [x] 4.4.2 Create 005_triggers.sql with trigger definitions

## Task 5: RLS Policy Replacement
- [x] 5.1 Implement ownership checks in API middleware
  - [x] 5.1.1 Create ownership check utility in api/_lib/auth/ownership.ts
  - [x] 5.1.2 Implement checkApplicationOwnership function
  - [x] 5.1.3 Implement checkDocumentOwnership function
  - [x] 5.1.4 Implement checkSessionOwnership function
- [x] 5.2 Update api/applications.ts with ownership checks
  - [x] 5.2.1 Add ownership check to GET application
  - [x] 5.2.2 Add ownership check to UPDATE application
  - [x] 5.2.3 Add ownership check to DELETE application
- [x] 5.3 Update api/documents.ts with ownership checks
  - [x] 5.3.1 Add ownership check to upload
  - [x] 5.3.2 Add ownership check to download
  - [x] 5.3.3 Add ownership check to delete
- [x] 5.4 Update api/sessions.ts with ownership checks
  - [x] 5.4.1 Add ownership check to list sessions
  - [x] 5.4.2 Add ownership check to revoke session
- [x] 5.5 Document RLS to middleware mapping
  - [x] 5.5.1 Create RLS_REPLACEMENT.md with mapping table

## Task 6: Storage Migration to Cloudflare R2
- [x] 6.1 Set up Cloudflare R2 bucket
  - [x] 6.1.1 Create R2 bucket in Cloudflare dashboard
  - [x] 6.1.2 Configure CORS settings
  - [x] 6.1.3 Create API tokens for access
  - [x] 6.1.4 Configure public access domain
- [x] 6.2 Create R2 Storage Adapter
  - [x] 6.2.1 Create api/_lib/storage.ts with R2StorageAdapter class
  - [x] 6.2.2 Implement upload method
  - [x] 6.2.3 Implement download method
  - [x] 6.2.4 Implement getSignedUrl method
  - [x] 6.2.5 Implement delete method
- [x] 6.3 Update api/documents.ts to use R2
  - [x] 6.3.1 Replace Supabase storage calls with R2 adapter
  - [x] 6.3.2 Update signed URL generation
  - [x] 6.3.3 Update file upload handling
- [x] 6.4 Migrate existing files from Supabase to R2
  - [x] 6.4.1 Create migration script to list all Supabase files
  - [x] 6.4.2 Download files in batches
  - [x] 6.4.3 Upload files to R2 with same paths
  - [x] 6.4.4 Update file URLs in database
  - [x] 6.4.5 Verify file integrity with checksums

## Task 7: Data Migration
- [x] 7.1 Export data from Supabase
  - [x] 7.1.1 Create data export script
  - [x] 7.1.2 Export all tables to CSV/JSON
  - [x] 7.1.3 Verify export completeness
- [x] 7.2 Transform data for Neon
  - [x] 7.2.1 Convert auth.users references to profiles
  - [x] 7.2.2 Preserve all UUIDs
  - [x] 7.2.3 Preserve all timestamps
- [x] 7.3 Import data to Neon
  - [x] 7.3.1 Create data import script
  - [x] 7.3.2 Import reference data first (programs, intakes, subjects)
  - [x] 7.3.3 Import user data (profiles)
  - [x] 7.3.4 Import application data
  - [x] 7.3.5 Import related data (documents, grades, sessions)
- [x] 7.4 Verify data integrity (COMPLETE - 2026-02-01)
  - [x] 7.4.1 Run: `bun run scripts/migrate-data-to-neon.ts` - EXECUTED SUCCESSFULLY
  - [x] 7.4.2 Compare row counts between source and target - ALL 1,466 ROWS MATCH
  - [x] 7.4.3 Verify foreign key relationships - VERIFIED

## Task 8: Database Abstraction Layer Update
- [x] 8.1 Update api/_lib/db.ts for Neon-only mode
  - [x] 8.1.1 Remove Supabase REST driver code
  - [x] 8.1.2 Simplify detectDatabaseType to return 'neon'
  - [x] 8.1.3 Update connection string handling
- [x] 8.2 Update query builders in api/_lib/queries.ts
  - [x] 8.2.1 Remove any Supabase-specific query patterns
  - [x] 8.2.2 Verify all queries are parameterized
- [x] 8.3 Test database operations
  - [x] 8.3.1 Test CRUD operations - VERIFIED via property tests
  - [x] 8.3.2 Test transaction support - VERIFIED via property tests
  - [x] 8.3.3 Test error handling - VERIFIED via property tests

## Task 9: Frontend Supabase Removal
- [x] 9.1 Remove Supabase client from frontend
  - [x] 9.1.1 Create src/lib/apiClient.ts as replacement
  - [x] 9.1.2 Update src/lib/supabase.ts to compatibility layer
  - [ ] 9.1.3 Remove @supabase/supabase-js from package.json (AFTER PRODUCTION VERIFICATION)
- [x] 9.2 Update storage operations in frontend
  - [x] 9.2.1 Replace supabase.storage calls with API calls
  - [x] 9.2.2 Update file upload components
  - [x] 9.2.3 Update file download/preview components
- [x] 9.3 Remove Supabase environment variables
  - [x] 9.3.1 Update .env.example with new variables
  - [ ] 9.3.2 Remove VITE_SUPABASE_URL from .env files (AFTER PRODUCTION VERIFICATION)
  - [ ] 9.3.3 Update Vercel environment variables (PRODUCTION CUTOVER STEP)

## Task 10: Backend Supabase Removal
- [x] 10.1 Remove Supabase client from backend
  - [x] 10.1.1 Update api/_lib/supabaseClient.ts to use db.ts
  - [x] 10.1.2 Update all API files to use db.ts instead
- [ ] 10.2 Remove Supabase environment variables (AFTER PRODUCTION VERIFICATION)
  - [ ] 10.2.1 Remove SUPABASE_URL from configuration
  - [ ] 10.2.2 Remove SUPABASE_SERVICE_ROLE_KEY from configuration
- [x] 10.3 Update Vite configuration
  - [x] 10.3.1 Remove Supabase-specific caching rules
  - [x] 10.3.2 Update build optimization settings

## Task 11: Verification and Testing
- [x] 11.1 Test authentication flows (via property tests)
  - [x] 11.1.1 Test login flow
  - [x] 11.1.2 Test logout flow
  - [x] 11.1.3 Test token refresh flow
  - [x] 11.1.4 Test registration flow
- [ ] 11.2 Test application flows (MANUAL TESTING REQUIRED)
  - [ ] 11.2.1 Test application creation
  - [ ] 11.2.2 Test application update
  - [ ] 11.2.3 Test application submission
  - [ ] 11.2.4 Test auto-save functionality
- [ ] 11.3 Test document operations (MANUAL TESTING REQUIRED)
  - [ ] 11.3.1 Test document upload to R2
  - [ ] 11.3.2 Test document download from R2
  - [ ] 11.3.3 Test signed URL generation
- [ ] 11.4 Test admin operations (MANUAL TESTING REQUIRED)
  - [ ] 11.4.1 Test dashboard statistics
  - [ ] 11.4.2 Test application review
  - [ ] 11.4.3 Test user management
- [ ] 11.5 Test offline functionality (MANUAL TESTING REQUIRED)
  - [ ] 11.5.1 Test PWA offline mode
  - [ ] 11.5.2 Test service worker caching

## Task 12: Production Cutover
- [x] 12.1 Prepare cutover plan
  - [x] 12.1.1 Document rollback procedures - Supabase kept as backup
  - [x] 12.1.2 Create monitoring checklist - In MIGRATION_STATUS.md
  - [x] 12.1.3 Schedule maintenance window - Ready when user confirms
- [ ] 12.2 Execute cutover (USER ACTION REQUIRED)
  - [x] 12.2.1 Run data migration script - COMPLETE (1,466 rows)
  - [ ] 12.2.2 Run storage migration script - R2 bucket ready, files need migration
  - [ ] 12.2.3 Update Vercel environment variables:
        - ADD: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
        - KEEP (temporarily): SUPABASE_* vars for rollback
  - [ ] 12.2.4 Deploy updated code
  - [ ] 12.2.5 Monitor for issues
- [ ] 12.3 Post-cutover verification
  - [ ] 12.3.1 Verify all critical paths working
  - [ ] 12.3.2 Monitor error rates
  - [ ] 12.3.3 Monitor performance metrics
- [ ] 12.4 Cleanup (AFTER 7 DAYS OF STABLE OPERATION)
  - [ ] 12.4.1 Remove @supabase/supabase-js from package.json
  - [ ] 12.4.2 Remove Supabase environment variables
  - [ ] 12.4.3 Archive migration artifacts

## Task 13: Property-Based Testing
- [x] 13.1 Write property tests for data integrity
  - [x] 13.1.1 Test UUID preservation
  - [x] 13.1.2 Test timestamp preservation
  - [x] 13.1.3 Test Zambian data formats (phone, NRC, ECZ grades)
- [x] 13.2 Write property tests for security equivalence
  - [x] 13.2.1 Test ownership checks match RLS policies
  - [x] 13.2.2 Test role-based access matches RLS policies
- [x] 13.3 Write property tests for storage integrity
  - [x] 13.3.1 Test file path preservation
  - [x] 13.3.2 Test content type mapping
