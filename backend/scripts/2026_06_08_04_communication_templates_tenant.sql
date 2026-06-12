-- Beanola multi-tenant: tenant-aware communication templates.
-- Spec: multi-tenant-beanola-remediation Phase 7 (R14.2); design.md Component 7.
--
-- Additive and idempotent: two nullable/defaulted columns, one composite
-- lookup index, and a NOT VALID foreign key only. No DROP, no rewrite of
-- existing columns — passes the runner's additive-only lint
-- (_find_non_additive_violations) and re-applies as a no-op.
--
-- These columns turn the single-tenant communication_templates table
-- (template_key UNIQUE) into a tenant-aware store: institution_id associates
-- a template with a school (NULL = Beanola platform template), and version
-- tracks active revisions so CommunicationService can resolve
-- institution-specific (highest version) -> Beanola platform (highest version)
-- -> safe Beanola default. The legacy UNIQUE(template_key) constraint is left
-- untouched here; relaxing it for per-(institution, key, version) rows is a
-- later, separately-reviewed step.

ALTER TABLE communication_templates
    ADD COLUMN IF NOT EXISTS institution_id uuid NULL;

ALTER TABLE communication_templates
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Tenant-aware lookup (R14.2): resolve active templates for an institution +
-- template key, newest version first. A NULL institution_id row is the Beanola
-- platform template for that key.
CREATE INDEX IF NOT EXISTS idx_comm_templates_tenant_lookup
    ON communication_templates (institution_id, template_key, is_active, version);

-- NOT VALID FK: enforced for new rows, validated post-backfill by a later
-- maintenance step. Wrapped so re-application is a no-op (ADD CONSTRAINT has no
-- IF NOT EXISTS form in this Postgres line). NULL institution_id (platform
-- templates) is permitted by the foreign key.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_comm_templates_institution'
    ) THEN
        ALTER TABLE communication_templates
            ADD CONSTRAINT fk_comm_templates_institution
            FOREIGN KEY (institution_id) REFERENCES institutions (id) NOT VALID;
    END IF;
END$$;
