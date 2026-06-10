-- Beanola multi-tenant admissions platform foundation.
-- Additive and idempotent: new tables/nullable columns/indexes plus best-effort backfills.

CREATE TABLE IF NOT EXISTS canonical_programs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    code varchar(80) NOT NULL UNIQUE,
    description text NULL,
    duration_months integer NULL,
    regulatory_body varchar(100) NULL,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now()
);

ALTER TABLE institutions ADD COLUMN IF NOT EXISTS slug varchar(80) NULL;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS brand_name varchar(255) NULL;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS primary_color varchar(20) NULL;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS secondary_color varchar(20) NULL;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS support_email varchar(255) NULL;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS admissions_email varchar(255) NULL;

ALTER TABLE programs ADD COLUMN IF NOT EXISTS canonical_program_id uuid NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS assignment_priority integer NULL DEFAULT 100;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS offering_status varchar(32) NULL DEFAULT 'active';
ALTER TABLE programs ADD COLUMN IF NOT EXISTS assignment_rules jsonb NULL;

ALTER TABLE program_intakes ADD COLUMN IF NOT EXISTS is_active boolean NULL DEFAULT true;
ALTER TABLE program_intakes ADD COLUMN IF NOT EXISTS assignment_priority integer NULL;
ALTER TABLE program_intakes ADD COLUMN IF NOT EXISTS residency_rules jsonb NULL;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS institution_id uuid NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS program_id uuid NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS program_offering_id uuid NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS intake_id uuid NULL;

CREATE TABLE IF NOT EXISTS institution_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL,
    asset_type varchar(40) NOT NULL,
    storage_key varchar(500) NOT NULL,
    public_url varchar(500) NULL,
    mime_type varchar(100) NOT NULL,
    checksum_sha256 varchar(64) NOT NULL,
    version integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    created_by_id uuid NULL
);

CREATE TABLE IF NOT EXISTS institution_document_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    name varchar(255) NOT NULL,
    version integer NOT NULL DEFAULT 1,
    sections jsonb NOT NULL DEFAULT '{}'::jsonb,
    tokens jsonb NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now(),
    created_by_id uuid NULL
);

CREATE TABLE IF NOT EXISTS institution_required_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL,
    program_id uuid NULL,
    canonical_program_id uuid NULL,
    document_type varchar(80) NOT NULL,
    label varchar(255) NOT NULL,
    is_required boolean NOT NULL DEFAULT true,
    rules jsonb NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS institution_domains (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL,
    hostname varchar(255) NOT NULL UNIQUE,
    is_primary boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    verified_at timestamp with time zone NULL,
    created_at timestamp with time zone NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_institution_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    role varchar(50) NOT NULL,
    permissions jsonb NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NULL DEFAULT now(),
    created_by_id uuid NULL
);

CREATE TABLE IF NOT EXISTS access_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    scope_type varchar(40) NOT NULL,
    institution_id uuid NULL,
    program_id uuid NULL,
    application_id uuid NULL,
    permissions jsonb NULL,
    expires_at timestamp with time zone NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NULL DEFAULT now(),
    created_by_id uuid NULL
);

INSERT INTO canonical_programs (
    name, code, description, duration_months, regulatory_body, is_active, created_at, updated_at
)
SELECT
    p.name,
    p.code,
    p.description,
    p.duration_months,
    p.regulatory_body,
    COALESCE(p.is_active, true),
    COALESCE(p.created_at, now()),
    COALESCE(p.updated_at, now())
FROM programs p
WHERE p.code IS NOT NULL
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = COALESCE(canonical_programs.description, EXCLUDED.description),
    duration_months = COALESCE(canonical_programs.duration_months, EXCLUDED.duration_months),
    regulatory_body = COALESCE(canonical_programs.regulatory_body, EXCLUDED.regulatory_body),
    updated_at = now();

UPDATE programs p
SET canonical_program_id = cp.id
FROM canonical_programs cp
WHERE p.canonical_program_id IS NULL
  AND cp.code = p.code;

UPDATE institutions
SET
    slug = lower(regexp_replace(code, '[^a-zA-Z0-9]+', '-', 'g')),
    brand_name = COALESCE(brand_name, full_name, name),
    support_email = COALESCE(support_email, email),
    admissions_email = COALESCE(admissions_email, email)
WHERE slug IS NULL OR brand_name IS NULL OR support_email IS NULL OR admissions_email IS NULL;

-- Legacy applications store the institution *code* (e.g. 'MIHAS', 'KATC') in
-- the ``applications.institution`` string snapshot, while ``institutions.name``
-- holds the full name. Match on either the institution code or the full name
-- (case-insensitively) so historical rows whose snapshot is the code still
-- link. Idempotent: COALESCE only fills nulls, so re-running is a no-op once a
-- row is linked, and ambiguous rows (no single matching triple) are left null
-- and surfaced by the post-migration exception report.
UPDATE applications a
SET
    institution_id = COALESCE(a.institution_id, i.id),
    program_offering_id = COALESCE(a.program_offering_id, p.id),
    program_id = COALESCE(a.program_id, p.canonical_program_id),
    intake_id = COALESCE(a.intake_id, it.id)
FROM institutions i, programs p, intakes it
WHERE (lower(i.name) = lower(a.institution) OR lower(i.code) = lower(a.institution))
  AND lower(p.name) = lower(a.program)
  AND (p.institution_id = i.id OR p.institution_id IS NULL)
  AND lower(it.name) = lower(a.intake);

CREATE UNIQUE INDEX IF NOT EXISTS uq_institutions_slug
    ON institutions (slug)
    WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_programs_canonical_program_id
    ON programs (canonical_program_id);
CREATE INDEX IF NOT EXISTS idx_programs_offering_assignment
    ON programs (canonical_program_id, offering_status, assignment_priority, id);
CREATE INDEX IF NOT EXISTS idx_program_intakes_assignment
    ON program_intakes (program_id, intake_id, is_active);
CREATE INDEX IF NOT EXISTS idx_applications_tenant_ids
    ON applications (institution_id, program_id, program_offering_id, intake_id);
CREATE INDEX IF NOT EXISTS idx_user_institution_memberships_user
    ON user_institution_memberships (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_access_grants_user_scope
    ON access_grants (user_id, scope_type, is_active);
CREATE INDEX IF NOT EXISTS idx_institution_templates_lookup
    ON institution_document_templates (institution_id, document_type, is_active, version);
CREATE INDEX IF NOT EXISTS idx_required_documents_lookup
    ON institution_required_documents (institution_id, program_id, canonical_program_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_membership_user_institution
    ON user_institution_memberships (user_id, institution_id)
    WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_template_version
    ON institution_document_templates (institution_id, document_type, version);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_canonical_program_id_fk') THEN
        ALTER TABLE programs
            ADD CONSTRAINT programs_canonical_program_id_fk
            FOREIGN KEY (canonical_program_id) REFERENCES canonical_programs(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_institution_id_fk') THEN
        ALTER TABLE applications
            ADD CONSTRAINT applications_institution_id_fk
            FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_program_id_fk') THEN
        ALTER TABLE applications
            ADD CONSTRAINT applications_program_id_fk
            FOREIGN KEY (program_id) REFERENCES canonical_programs(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_program_offering_id_fk') THEN
        ALTER TABLE applications
            ADD CONSTRAINT applications_program_offering_id_fk
            FOREIGN KEY (program_offering_id) REFERENCES programs(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_intake_id_fk') THEN
        ALTER TABLE applications
            ADD CONSTRAINT applications_intake_id_fk
            FOREIGN KEY (intake_id) REFERENCES intakes(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_assets_institution_id_fk') THEN
        ALTER TABLE institution_assets
            ADD CONSTRAINT institution_assets_institution_id_fk
            FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_assets_created_by_id_fk') THEN
        ALTER TABLE institution_assets
            ADD CONSTRAINT institution_assets_created_by_id_fk
            FOREIGN KEY (created_by_id) REFERENCES profiles(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_templates_institution_id_fk') THEN
        ALTER TABLE institution_document_templates
            ADD CONSTRAINT institution_templates_institution_id_fk
            FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_templates_created_by_id_fk') THEN
        ALTER TABLE institution_document_templates
            ADD CONSTRAINT institution_templates_created_by_id_fk
            FOREIGN KEY (created_by_id) REFERENCES profiles(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'required_documents_institution_id_fk') THEN
        ALTER TABLE institution_required_documents
            ADD CONSTRAINT required_documents_institution_id_fk
            FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'required_documents_program_id_fk') THEN
        ALTER TABLE institution_required_documents
            ADD CONSTRAINT required_documents_program_id_fk
            FOREIGN KEY (program_id) REFERENCES programs(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'required_documents_canonical_program_id_fk') THEN
        ALTER TABLE institution_required_documents
            ADD CONSTRAINT required_documents_canonical_program_id_fk
            FOREIGN KEY (canonical_program_id) REFERENCES canonical_programs(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_domains_institution_id_fk') THEN
        ALTER TABLE institution_domains
            ADD CONSTRAINT institution_domains_institution_id_fk
            FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memberships_user_id_fk') THEN
        ALTER TABLE user_institution_memberships
            ADD CONSTRAINT memberships_user_id_fk
            FOREIGN KEY (user_id) REFERENCES profiles(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memberships_institution_id_fk') THEN
        ALTER TABLE user_institution_memberships
            ADD CONSTRAINT memberships_institution_id_fk
            FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memberships_created_by_id_fk') THEN
        ALTER TABLE user_institution_memberships
            ADD CONSTRAINT memberships_created_by_id_fk
            FOREIGN KEY (created_by_id) REFERENCES profiles(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_grants_user_id_fk') THEN
        ALTER TABLE access_grants
            ADD CONSTRAINT access_grants_user_id_fk
            FOREIGN KEY (user_id) REFERENCES profiles(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_grants_institution_id_fk') THEN
        ALTER TABLE access_grants
            ADD CONSTRAINT access_grants_institution_id_fk
            FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_grants_program_id_fk') THEN
        ALTER TABLE access_grants
            ADD CONSTRAINT access_grants_program_id_fk
            FOREIGN KEY (program_id) REFERENCES programs(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_grants_application_id_fk') THEN
        ALTER TABLE access_grants
            ADD CONSTRAINT access_grants_application_id_fk
            FOREIGN KEY (application_id) REFERENCES applications(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_grants_created_by_id_fk') THEN
        ALTER TABLE access_grants
            ADD CONSTRAINT access_grants_created_by_id_fk
            FOREIGN KEY (created_by_id) REFERENCES profiles(id) NOT VALID;
    END IF;
END $$;
