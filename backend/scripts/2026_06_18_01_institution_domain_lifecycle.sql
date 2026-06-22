-- Enterprise tenant authority: institution_domains lifecycle columns.
-- Spec: enterprise-tenant-authority Task 1.1 (R7.1, R7.10); design.md
-- "InstitutionDomain lifecycle fields and status state machine" + "Additive
-- SQL migration scripts".
--
-- Additive and idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT
-- EXISTS, and NOT VALID foreign keys only. No DROP, no rewrite of existing
-- columns -- passes the runner's additive-only lint
-- (_find_non_additive_violations) and re-applies as a no-op. Applied by
-- apply_sql_migrations and tracked in migration_history.
--
-- The existing institution_domains table (created by
-- 2026_06_08_01_multi_tenant_beanola_admissions.sql) carries only hostname,
-- is_primary, is_active, verified_at, created_at, created_by_id. This script
-- adds the domain verification lifecycle:
--   * status              -- pending_dns | pending_review | verified | active
--                            | disabled | failed (R7.2 state machine)
--   * verification_token  -- >=32-char token presented as the DNS record (R7.3)
--   * dns_target          -- generated DNS target the tenant must point at
--   * last_checked_at     -- updated on every verification job run (R7.4/R7.5)
--   * last_error          -- descriptive verification failure, <=1000 chars
--   * approved_by_id      -- super-admin who activated the domain (R7.6)
--
-- Existing rows default to status='active': they are already live and resolve
-- tenants today, so the default preserves current routing behavior unchanged.

ALTER TABLE institution_domains
    ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active';

ALTER TABLE institution_domains
    ADD COLUMN IF NOT EXISTS verification_token varchar(128);

ALTER TABLE institution_domains
    ADD COLUMN IF NOT EXISTS dns_target varchar(255);

ALTER TABLE institution_domains
    ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

ALTER TABLE institution_domains
    ADD COLUMN IF NOT EXISTS last_error varchar(1000);

ALTER TABLE institution_domains
    ADD COLUMN IF NOT EXISTS approved_by_id uuid;

-- created_by_id already exists on the base table; add idempotently in case an
-- older base schema predates it (no-op when present).
ALTER TABLE institution_domains
    ADD COLUMN IF NOT EXISTS created_by_id uuid;

-- Partial unique index: forbid two active domains sharing a hostname across
-- tenants (R7.10). Case-insensitive on hostname; only enforced WHERE the
-- domain is currently active, so non-active lifecycle rows (pending/disabled/
-- failed) do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_institution_domains_active_hostname
    ON institution_domains (lower(hostname))
    WHERE status = 'active';

-- Resolution / lifecycle filtering by status.
CREATE INDEX IF NOT EXISTS idx_institution_domains_status
    ON institution_domains (status);

-- NOT VALID FKs for the lifecycle actor columns -> profiles(id). Enforced for
-- new rows; validation of pre-existing rows is deferred to a later maintenance
-- step. ADD CONSTRAINT has no IF NOT EXISTS form in this Postgres line, so each
-- is wrapped in a pg_constraint guard to keep re-application a no-op.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'institution_domains_created_by_id_fk'
    ) THEN
        ALTER TABLE institution_domains
            ADD CONSTRAINT institution_domains_created_by_id_fk
            FOREIGN KEY (created_by_id) REFERENCES profiles (id) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'institution_domains_approved_by_id_fk'
    ) THEN
        ALTER TABLE institution_domains
            ADD CONSTRAINT institution_domains_approved_by_id_fk
            FOREIGN KEY (approved_by_id) REFERENCES profiles (id) NOT VALID;
    END IF;
END$$;
