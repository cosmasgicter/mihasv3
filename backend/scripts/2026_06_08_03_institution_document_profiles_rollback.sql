-- Reversible inverse of 2026_06_08_03_institution_document_profiles.sql.
-- Apply only after confirming no application code depends on the structures
-- being dropped.
--
-- Forward script effect: a new institution_document_profiles table, two
-- indexes, and four NOT VALID foreign keys. Dropping the table with CASCADE
-- removes its indexes and the foreign keys in one inverse-additive step, so
-- this rollback is idempotent on re-run and does not error on a partial state.

DROP INDEX IF EXISTS idx_doc_profiles_scope;
DROP INDEX IF EXISTS idx_doc_profiles_lookup;

DROP TABLE IF EXISTS institution_document_profiles CASCADE;
