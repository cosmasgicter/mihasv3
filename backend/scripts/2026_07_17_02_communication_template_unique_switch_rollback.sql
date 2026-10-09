-- Operator-only reverse of 2026_07_17_02_communication_template_unique_switch.sql.
--
-- Excluded from the apply_sql_migrations boot sweep (*_rollback.sql). Restores
-- the legacy global UNIQUE(template_key) constraint under its original
-- Postgres-generated name so a rollback returns the table to its pre-switch
-- shape. Guarded so re-application is a no-op.
--
-- WARNING: this re-add SUCCEEDS only while the data still satisfies a global
-- unique on template_key (i.e. before any per-institution/versioned rows share
-- a key). Once the tenant-aware model is in use this rollback will fail — by
-- then the forward switch is permanent and reverting means restoring from
-- backup / a Neon branch, exactly as the expand→switch→contract model intends.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.3 | Finding TEN-08.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'communication_templates_template_key_key'
    ) THEN
        ALTER TABLE communication_templates
            ADD CONSTRAINT communication_templates_template_key_key UNIQUE (template_key);
    END IF;
END$$;
