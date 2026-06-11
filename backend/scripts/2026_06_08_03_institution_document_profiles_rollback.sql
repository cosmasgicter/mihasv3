-- Reversible inverse of 2026_06_08_03_institution_document_profiles.sql.
-- Apply only after confirming no application code depends on the structures
-- being dropped.
--
-- Forward script effect: a new institution_document_profiles table, two
-- indexes, and four NOT VALID foreign keys. This rollback drops the FKs,
-- indexes, and the table using IF EXISTS so it is idempotent on re-run and
-- does not error on a partial state.

ALTER TABLE IF EXISTS institution_document_profiles
    DROP CONSTRAINT IF EXISTS fk_doc_profiles_intake;
ALTER TABLE IF EXISTS institution_document_profiles
    DROP CONSTRAINT IF EXISTS fk_doc_profiles_canonical_program;
ALTER TABLE IF EXISTS institution_document_profiles
    DROP CONSTRAINT IF EXISTS fk_doc_profiles_program;
ALTER TABLE IF EXISTS institution_document_profiles
    DROP CONSTRAINT IF EXISTS fk_doc_profiles_institution;

DROP INDEX IF EXISTS idx_doc_profiles_scope;
DROP INDEX IF EXISTS idx_doc_profiles_lookup;

DROP TABLE IF EXISTS institution_document_profiles;
