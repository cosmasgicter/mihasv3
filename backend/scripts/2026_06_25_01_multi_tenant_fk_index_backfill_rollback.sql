-- Reversible inverse of 2026_06_25_01_multi_tenant_fk_index_backfill.sql.
-- Apply only after confirming no application code depends on these indexes.
--
-- Drops the 20 multi-tenant/admissions FK indexes in reverse creation order.
-- Uses DROP INDEX CONCURRENTLY IF EXISTS so the rollback is online and
-- idempotent on re-run. Like the forward script, this file cannot run inside a
-- transaction; apply it manually with autocommit. Rollback files are excluded
-- from the normal apply_sql_migrations lexical apply ordering.

DROP INDEX CONCURRENTLY IF EXISTS idx_user_institution_memberships_institution_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_institution_memberships_created_by_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_required_documents_program_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_required_documents_canonical_program_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_domains_institution_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_domains_created_by_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_domains_approved_by_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_document_templates_created_by_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_document_profiles_program_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_document_profiles_intake_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_document_profiles_canonical_program_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_assets_institution_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_institution_assets_created_by_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_applications_program_offering_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_applications_program_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_applications_intake_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_access_grants_program_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_access_grants_institution_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_access_grants_created_by_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_access_grants_application_id;
