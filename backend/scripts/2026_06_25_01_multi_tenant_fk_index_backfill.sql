-- Backfill foreign-key indexes introduced by the multi-tenant admissions work.
--
-- The older 2026_05_22 FK backfill covered the pre-tenant schema. Production
-- now has additional tenant/configuration tables, and the strict drift audit
-- reported their FK columns as missing first-column btree indexes. These
-- indexes are strictly additive and online.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_grants_application_id
    ON access_grants(application_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_grants_created_by_id
    ON access_grants(created_by_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_grants_institution_id
    ON access_grants(institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_grants_program_id
    ON access_grants(program_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_intake_id
    ON applications(intake_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_program_id
    ON applications(program_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_program_offering_id
    ON applications(program_offering_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_assets_created_by_id
    ON institution_assets(created_by_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_assets_institution_id
    ON institution_assets(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_document_profiles_canonical_program_id
    ON institution_document_profiles(canonical_program_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_document_profiles_intake_id
    ON institution_document_profiles(intake_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_document_profiles_program_id
    ON institution_document_profiles(program_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_document_templates_created_by_id
    ON institution_document_templates(created_by_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_domains_approved_by_id
    ON institution_domains(approved_by_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_domains_created_by_id
    ON institution_domains(created_by_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_domains_institution_id
    ON institution_domains(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_required_documents_canonical_program_id
    ON institution_required_documents(canonical_program_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_required_documents_program_id
    ON institution_required_documents(program_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_institution_memberships_created_by_id
    ON user_institution_memberships(created_by_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_institution_memberships_institution_id
    ON user_institution_memberships(institution_id);
