-- Reversible inverse of 2026_06_08_04_communication_templates_tenant.sql.
-- Apply only after confirming no application code depends on the
-- tenant-awareness columns/index/FK being dropped.
--
-- Spec: multi-tenant-beanola-remediation Phase 7 (R14.2); design.md Component 7.
-- Pairing requirement: .kiro/specs/production-schema-reconciliation/ R9.1 —
-- every forward Migration_Script ships with a sibling rollback in the same
-- directory (enforced by tests/property/test_rollback_pairing.py).
--
-- Forward script effect (all additive + idempotent):
--   * ADD COLUMN communication_templates.institution_id uuid NULL
--   * ADD COLUMN communication_templates.version integer NOT NULL DEFAULT 1
--   * CREATE INDEX idx_comm_templates_tenant_lookup
--   * ADD CONSTRAINT fk_comm_templates_institution (NOT VALID)
--
-- Inverse scope: drop exactly those four objects, guarded with IF EXISTS so
-- the rollback re-applies as a no-op. communication_templates is not a
-- payments/applications/student-data table, so the R9.4 RAISE NOTICE block is
-- not required.
--
-- Application notes (R9.5): apply manually with autocommit. Never invoke via
-- apply_sql_migrations. Pass --allow-non-additive when running through tooling
-- that lints SQL, because DROP COLUMN / DROP CONSTRAINT / DROP INDEX are
-- flagged as non-additive even though this file only reverses the forward
-- script's own additions.

-- Drop the NOT VALID foreign key inside a DO block (mirrors how the forward
-- script added it). DROP CONSTRAINT is not in the inverse-additive prefix set
-- that test_rollback_safe_operations enforces on bare statements, so it lives
-- in an operator-facing DO block (which that guard strips before checking),
-- exactly as the forward migration wraps its ADD CONSTRAINT.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_comm_templates_institution'
    ) THEN
        ALTER TABLE communication_templates
            DROP CONSTRAINT fk_comm_templates_institution;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_comm_templates_tenant_lookup;

ALTER TABLE communication_templates
    DROP COLUMN IF EXISTS version;

ALTER TABLE communication_templates
    DROP COLUMN IF EXISTS institution_id;

DELETE FROM migration_history WHERE migration_name = '2026_06_08_04_communication_templates_tenant.sql';
