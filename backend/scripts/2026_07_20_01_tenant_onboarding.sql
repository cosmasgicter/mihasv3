-- Admissions V2 — task 4.1 durable resumable tenant onboarding aggregate.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 4.1
-- Requirements: R4.1-R4.6
-- Findings: TEN-01, TEN-02
-- Design: design.md §6.1 (TenantOnboarding durable workflow aggregate + states),
--         §6.2 (readiness invariants / blockers), §17 (durable "queued" work).
--
-- Additive + idempotent, safe under the apply_sql_migrations runner contract
-- (each file runs once via migration_history, but must also re-run as a no-op).
-- Every object is created behind CREATE TABLE IF NOT EXISTS / CREATE INDEX IF
-- NOT EXISTS / a pg_constraint guard, so re-application changes nothing. Forward
-- script only — the paired *_rollback.sql (operator-only, excluded from the boot
-- sweep) reverses it. No DROP / TRUNCATE / DELETE, so it passes the runner's
-- additive-only lint (_find_non_additive_violations).
--
-- The aggregate makes tenant onboarding a durable, resumable, server-owned
-- workflow (R4.1): a row per onboarding tracks state, the current step, a
-- per-step completion snapshot, the last computed launch blockers, the
-- idempotency key that made "begin" replay-safe, and the last error. The
-- institution is created INACTIVE and only flips active through the audited
-- activation command once blockers are empty (R4.1, R4.4, R4.6) — the row here
-- is what lets a partially-configured tenant be resumed or cancelled without
-- leaving a partially-authoritative active tenant behind.
--
-- ``managed = False`` model: apps.catalog.models.TenantOnboarding mirrors this
-- table; the test unmanaged_schema fixture materialises it via create_model, so
-- this script is the production/Neon source of truth for the same shape.

CREATE TABLE IF NOT EXISTS tenant_onboarding (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The institution created by the "begin" command. Created inactive; only
    -- the activation command flips institutions.is_active true (R4.1).
    institution_id uuid NOT NULL,
    -- Workflow state (design §6.1): draft | in_review | active | rejected |
    -- cancelled | suspended. Never 'active' at creation (R4.1).
    state varchar(20) NOT NULL DEFAULT 'draft',
    -- The step the operator is on / last touched, for resume UX (R4.1).
    current_step varchar(50) NULL,
    -- Bumped when the onboarding configuration graph changes materially.
    configuration_version integer NOT NULL DEFAULT 1,
    -- Per-step completion snapshot: {"<step>": {"completed": true, ...}} (R4.1).
    steps jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Last computed machine-readable launch blockers snapshot (R4.5). The live
    -- readiness query is authoritative at activation time; this is a cache for
    -- the resume UI so a returning operator sees the last-known blockers.
    blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Last error recorded against the workflow (e.g. a blocked activation).
    last_error text NULL,
    -- Idempotency key for the "begin" command so a retried create returns the
    -- same onboarding rather than a second orphan institution (R4.1).
    idempotency_key text NULL,
    -- The Super_Admin who began the onboarding.
    created_by_id uuid NULL,
    activated_at timestamp with time zone NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now()
);

-- One onboarding row per institution: the begin command is the sole creator of
-- both the institution and its onboarding, so a given institution has exactly
-- one workflow. A partial unique index (rather than a table constraint) keeps
-- re-application a no-op and tolerates any future soft-deleted rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_onboarding_institution
    ON tenant_onboarding (institution_id);

-- Idempotency-key uniqueness for the "begin" command (R4.1). Partial so the
-- many rows without a key (older/legacy or key-less begins) never collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_onboarding_idempotency_key
    ON tenant_onboarding (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Operational filtering by workflow state (list "draft"/"in_review" queues).
CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_state
    ON tenant_onboarding (state);

-- NOT VALID FKs: enforced for new rows; validation of any pre-existing rows is
-- deferred to a later maintenance step (there are none at ship time). ADD
-- CONSTRAINT has no IF NOT EXISTS form in this Postgres line, so each is wrapped
-- in a pg_constraint guard to keep re-application a no-op.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_onboarding_institution_id_fk'
    ) THEN
        ALTER TABLE tenant_onboarding
            ADD CONSTRAINT tenant_onboarding_institution_id_fk
            FOREIGN KEY (institution_id) REFERENCES institutions (id) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_onboarding_created_by_id_fk'
    ) THEN
        ALTER TABLE tenant_onboarding
            ADD CONSTRAINT tenant_onboarding_created_by_id_fk
            FOREIGN KEY (created_by_id) REFERENCES profiles (id) NOT VALID;
    END IF;

    -- Workflow state domain guard (design §6.1 states).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_onboarding_state'
    ) THEN
        ALTER TABLE tenant_onboarding
            ADD CONSTRAINT chk_tenant_onboarding_state CHECK (
                state IN ('draft', 'in_review', 'active', 'rejected', 'cancelled', 'suspended')
            );
    END IF;
END$$;
