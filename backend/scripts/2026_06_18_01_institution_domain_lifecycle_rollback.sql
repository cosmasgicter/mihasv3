-- Reversible inverse of 2026_06_18_01_institution_domain_lifecycle.sql.
-- Apply only after confirming no application code depends on the structures
-- being dropped.
--
-- Forward script effect: six additive columns (status, verification_token,
-- dns_target, last_checked_at, last_error, approved_by_id), two indexes
-- (uq_institution_domains_active_hostname, idx_institution_domains_status),
-- and two NOT VALID foreign keys (created_by_id, approved_by_id -> profiles).
--
-- This rollback removes exactly those additions, idempotently (IF EXISTS
-- throughout, so a re-run or a partial-state rollback does not error).
--
-- NOTE: created_by_id is intentionally NOT dropped here -- the column is owned
-- by the base table from 2026_06_08_01_multi_tenant_beanola_admissions.sql.
-- Only the foreign key this migration added on it is removed.

ALTER TABLE institution_domains
    DROP CONSTRAINT IF EXISTS institution_domains_approved_by_id_fk;

ALTER TABLE institution_domains
    DROP CONSTRAINT IF EXISTS institution_domains_created_by_id_fk;

DROP INDEX IF EXISTS idx_institution_domains_status;
DROP INDEX IF EXISTS uq_institution_domains_active_hostname;

ALTER TABLE institution_domains DROP COLUMN IF EXISTS approved_by_id;
ALTER TABLE institution_domains DROP COLUMN IF EXISTS last_error;
ALTER TABLE institution_domains DROP COLUMN IF EXISTS last_checked_at;
ALTER TABLE institution_domains DROP COLUMN IF EXISTS dns_target;
ALTER TABLE institution_domains DROP COLUMN IF EXISTS verification_token;
ALTER TABLE institution_domains DROP COLUMN IF EXISTS status;
