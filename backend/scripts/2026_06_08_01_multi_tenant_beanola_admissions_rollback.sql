-- Reversible inverse of 2026_06_08_01_multi_tenant_beanola_admissions.sql.
-- Apply only after confirming no application code depends on the structures
-- being dropped, and only if the multi-tenant rollout is being fully reverted.
--
-- Forward script effect: 7 new tenant tables (canonical_programs,
-- institution_assets, institution_document_templates,
-- institution_required_documents, institution_domains,
-- user_institution_memberships, access_grants), nullable tenant columns on
-- institutions/programs/program_intakes/applications, and supporting FKs.
--
-- This rollback drops the new tables (CASCADE clears their FKs) and the
-- additive columns. Every statement is inverse-additive (DROP TABLE / ALTER
-- TABLE ... DROP COLUMN). The nullable columns added to existing tables carry
-- tenant-assignment data; do not run this unless that data loss is intended.

-- 1. New tenant tables (CASCADE clears dependent FKs).
DROP TABLE IF EXISTS access_grants CASCADE;
DROP TABLE IF EXISTS user_institution_memberships CASCADE;
DROP TABLE IF EXISTS institution_domains CASCADE;
DROP TABLE IF EXISTS institution_required_documents CASCADE;
DROP TABLE IF EXISTS institution_document_templates CASCADE;
DROP TABLE IF EXISTS institution_assets CASCADE;
DROP TABLE IF EXISTS canonical_programs CASCADE;

-- 2. Additive columns on applications (tenant assignment snapshots).
ALTER TABLE applications DROP COLUMN IF EXISTS intake_id;
ALTER TABLE applications DROP COLUMN IF EXISTS program_offering_id;
ALTER TABLE applications DROP COLUMN IF EXISTS program_id;
ALTER TABLE applications DROP COLUMN IF EXISTS institution_id;

-- 3. Additive columns on program_intakes.
ALTER TABLE program_intakes DROP COLUMN IF EXISTS residency_rules;
ALTER TABLE program_intakes DROP COLUMN IF EXISTS assignment_priority;
ALTER TABLE program_intakes DROP COLUMN IF EXISTS is_active;

-- 4. Additive columns on programs.
ALTER TABLE programs DROP COLUMN IF EXISTS assignment_rules;
ALTER TABLE programs DROP COLUMN IF EXISTS offering_status;
ALTER TABLE programs DROP COLUMN IF EXISTS assignment_priority;
ALTER TABLE programs DROP COLUMN IF EXISTS canonical_program_id;

-- 5. Additive columns on institutions (tenant branding).
ALTER TABLE institutions DROP COLUMN IF EXISTS admissions_email;
ALTER TABLE institutions DROP COLUMN IF EXISTS support_email;
ALTER TABLE institutions DROP COLUMN IF EXISTS secondary_color;
ALTER TABLE institutions DROP COLUMN IF EXISTS primary_color;
ALTER TABLE institutions DROP COLUMN IF EXISTS brand_name;
ALTER TABLE institutions DROP COLUMN IF EXISTS slug;
