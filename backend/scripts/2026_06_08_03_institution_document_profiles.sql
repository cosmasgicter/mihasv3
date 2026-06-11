-- Beanola multi-tenant: institution document profiles (rich tenant document content).
-- Spec: multi-tenant-beanola-remediation Phase 4 (R8.1, R8.5); design.md Component 4.
--
-- Additive and idempotent: a new table, two indexes, and NOT VALID foreign keys
-- only. No DROP, no rewrite of existing columns — passes the runner's
-- additive-only lint (_find_non_additive_violations) and re-applies as a no-op.
--
-- A dedicated table (rather than overloading institution_document_templates)
-- keeps the simple template path intact: acceptance letters need fee charts,
-- bank accounts, requirements, and a signatory block that the template table's
-- body+signatory sections cannot hold.

CREATE TABLE IF NOT EXISTS institution_document_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    program_id uuid NULL,                  -- offering scope (programs.id)
    canonical_program_id uuid NULL,        -- canonical-program scope
    intake_id uuid NULL,                   -- intake scope
    layout_key varchar(80) NOT NULL DEFAULT 'simple_letter',
    sections jsonb NOT NULL DEFAULT '{}'::jsonb,      -- <=30 keys, each value <=5000 chars
    fee_chart jsonb NOT NULL DEFAULT '[]'::jsonb,     -- <=50 rows
    bank_accounts jsonb NOT NULL DEFAULT '[]'::jsonb, -- <=10
    requirements jsonb NOT NULL DEFAULT '[]'::jsonb,  -- <=50
    signatory jsonb NOT NULL DEFAULT '{}'::jsonb,
    rules jsonb NULL,
    version integer NOT NULL DEFAULT 1,    -- monotonic >=1 per (institution, document_type, scope)
    is_active boolean NOT NULL DEFAULT true,
    created_by_id uuid NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now()
);

-- Hot lookup: resolve active profiles for an institution + document type, newest
-- version first.
CREATE INDEX IF NOT EXISTS idx_doc_profiles_lookup
    ON institution_document_profiles (institution_id, document_type, is_active, version);

-- Scope resolution: most-specific match (offering+intake -> offering ->
-- canonical+intake -> canonical -> institution default).
CREATE INDEX IF NOT EXISTS idx_doc_profiles_scope
    ON institution_document_profiles (institution_id, document_type, program_id, canonical_program_id, intake_id, is_active);

-- NOT VALID FKs: enforced for new rows, validated post-backfill by a later
-- maintenance step. Wrapped so re-application is a no-op (ADD CONSTRAINT has no
-- IF NOT EXISTS form in this Postgres line).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_doc_profiles_institution'
    ) THEN
        ALTER TABLE institution_document_profiles
            ADD CONSTRAINT fk_doc_profiles_institution
            FOREIGN KEY (institution_id) REFERENCES institutions (id) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_doc_profiles_program'
    ) THEN
        ALTER TABLE institution_document_profiles
            ADD CONSTRAINT fk_doc_profiles_program
            FOREIGN KEY (program_id) REFERENCES programs (id) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_doc_profiles_canonical_program'
    ) THEN
        ALTER TABLE institution_document_profiles
            ADD CONSTRAINT fk_doc_profiles_canonical_program
            FOREIGN KEY (canonical_program_id) REFERENCES canonical_programs (id) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_doc_profiles_intake'
    ) THEN
        ALTER TABLE institution_document_profiles
            ADD CONSTRAINT fk_doc_profiles_intake
            FOREIGN KEY (intake_id) REFERENCES intakes (id) NOT VALID;
    END IF;
END$$;
