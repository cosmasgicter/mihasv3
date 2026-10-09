-- Admissions V2 — task 4.5 durable tenant change requests.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 4.5
-- Requirements: R5.4 (durable request with draft/submitted/approved/rejected/
--               applied/cancelled semantics for a protected profile, program,
--               or domain change), R5.5 (approval applies transactionally
--               through the SAME canonical command a Platform_Admin uses,
--               notifies relevant parties, and retains before/after audit data
--               without secrets or unnecessary personal information).
-- Findings: TEN-06 (profile/program/domain request-change capabilities render
--           explanatory text but have no durable workflow).
-- Design: design.md §6.4 (TenantChangeRequest state machine
--         draft -> submitted -> approved -> applied, submitted -> rejected,
--         draft/submitted -> cancelled; typed payloads revalidated at apply
--         time; approval calls the canonical command and records before/after
--         versions), §5.2 (authority), §17 (durable committed outbox).
--
-- Additive + idempotent, safe under the apply_sql_migrations runner contract
-- (each file runs once via migration_history, but must also re-run as a no-op).
-- Every object is created behind CREATE TABLE IF NOT EXISTS / CREATE INDEX IF
-- NOT EXISTS / a pg_constraint guard, so re-application changes nothing. Forward
-- script only — the paired *_rollback.sql (operator-only, excluded from the boot
-- sweep) reverses it. No DROP / TRUNCATE / DELETE, so it passes the runner's
-- additive-only lint (_find_non_additive_violations).
--
-- The change-request row is the durable artefact that closes TEN-06: a
-- Tenant_Admin who cannot directly mutate protected configuration SUBMITS a
-- typed request (tenant.<kind>.request_change); a Platform_Admin reviews it and,
-- on approval, the backend applies it transactionally through the SAME canonical
-- command the platform uses directly (design §6.4 — "Approval does not directly
-- patch a JSON blob; it calls the canonical domain command in a transaction and
-- records before/after versions"). before_data / after_data are redacted
-- snapshots (no secrets / unnecessary PII, R5.5); the applied change also emits
-- the normal tenant.<resource>.<verb> config audit event under the approver.
--
-- ``managed = False`` model: apps.catalog.models.TenantChangeRequest mirrors this
-- table; the test unmanaged_schema fixture materialises it via create_model, so
-- this script is the production/Neon source of truth for the same shape.

CREATE TABLE IF NOT EXISTS tenant_change_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The tenant whose protected configuration the request targets. Every list,
    -- detail, cancel, and review path is scoped through this id (R5.4).
    institution_id uuid NOT NULL,
    -- The typed change kind: profile | program | domain. Drives which canonical
    -- command applies the request and which tenant.<kind>.request_change
    -- capability is required to submit it (design §6.4).
    change_kind varchar(20) NOT NULL,
    -- Lifecycle state (design §6.4): draft -> submitted -> approved -> applied,
    -- submitted -> rejected, draft/submitted -> cancelled. The
    -- TenantChangeRequestStateMachine is the single authority for transitions.
    status varchar(20) NOT NULL DEFAULT 'draft',
    -- Typed request payload, validated at submit AND re-validated at apply time
    -- (design §6.4 "revalidated at application time"). Shape depends on
    -- change_kind (profile fields / program fields / domain hostname).
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- The object the change targets when it already exists (program offering id
    -- for a program change) or the object the applied command created (the new
    -- domain id for a domain change). NULL for a profile change (the target is
    -- the institution itself).
    target_object_id uuid NULL,
    -- The configuration version recorded when the request was applied (the
    -- "before/after versions" the design asks approval to record).
    configuration_version integer NOT NULL DEFAULT 1,
    -- Redacted before/after snapshots captured around the canonical apply
    -- command (R5.5). Never raw secrets / unnecessary PII — written through the
    -- shared TenantAuditService redactor before persistence.
    before_data jsonb NULL,
    after_data jsonb NULL,
    -- Bounded reviewer/requester note (approve/reject reason, submit comment).
    review_note text NULL,
    -- Last error recorded against the request (e.g. an apply-time revalidation
    -- failure that rolled the transaction back and left it submitted).
    last_error text NULL,
    -- Idempotency key for the submit/create command so a retried submit returns
    -- the same request rather than a duplicate (design §14.2).
    idempotency_key text NULL,
    -- The Tenant_Admin who requested the change (FK profiles).
    requested_by_id uuid NULL,
    -- The Platform_Admin who reviewed (approved/rejected) the change (FK profiles).
    reviewed_by_id uuid NULL,
    submitted_at timestamp with time zone NULL,
    reviewed_at timestamp with time zone NULL,
    applied_at timestamp with time zone NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now()
);

-- Idempotency-key uniqueness for the submit/create command (design §14.2).
-- Partial so the many rows without a key never collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_change_requests_idempotency_key
    ON tenant_change_requests (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Tenant-scoped listing/filtering by institution + lifecycle state (R5.4). This
-- is the query the tenant console and platform review queue both page over.
CREATE INDEX IF NOT EXISTS idx_tenant_change_requests_institution_status
    ON tenant_change_requests (institution_id, status);

-- Operational filtering by lifecycle state (platform review queue).
CREATE INDEX IF NOT EXISTS idx_tenant_change_requests_status
    ON tenant_change_requests (status);

-- Covering indexes for the FK columns (mirrors the production FK-index invariant).
CREATE INDEX IF NOT EXISTS idx_tenant_change_requests_requested_by
    ON tenant_change_requests (requested_by_id);
CREATE INDEX IF NOT EXISTS idx_tenant_change_requests_reviewed_by
    ON tenant_change_requests (reviewed_by_id);

-- NOT VALID FKs: enforced for new rows; validation of any pre-existing rows is
-- deferred to a later maintenance step (there are none at ship time). ADD
-- CONSTRAINT has no IF NOT EXISTS form in this Postgres line, so each is wrapped
-- in a pg_constraint guard to keep re-application a no-op.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_change_requests_institution_id_fk'
    ) THEN
        ALTER TABLE tenant_change_requests
            ADD CONSTRAINT tenant_change_requests_institution_id_fk
            FOREIGN KEY (institution_id) REFERENCES institutions (id) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_change_requests_requested_by_id_fk'
    ) THEN
        ALTER TABLE tenant_change_requests
            ADD CONSTRAINT tenant_change_requests_requested_by_id_fk
            FOREIGN KEY (requested_by_id) REFERENCES profiles (id) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_change_requests_reviewed_by_id_fk'
    ) THEN
        ALTER TABLE tenant_change_requests
            ADD CONSTRAINT tenant_change_requests_reviewed_by_id_fk
            FOREIGN KEY (reviewed_by_id) REFERENCES profiles (id) NOT VALID;
    END IF;

    -- Change-kind domain guard (design §6.4 typed payloads).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_change_requests_kind'
    ) THEN
        ALTER TABLE tenant_change_requests
            ADD CONSTRAINT chk_tenant_change_requests_kind CHECK (
                change_kind IN ('profile', 'program', 'domain')
            );
    END IF;

    -- Lifecycle-status domain guard (design §6.4 states).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_change_requests_status'
    ) THEN
        ALTER TABLE tenant_change_requests
            ADD CONSTRAINT chk_tenant_change_requests_status CHECK (
                status IN ('draft', 'submitted', 'approved', 'applied', 'rejected', 'cancelled')
            );
    END IF;

    -- Configuration version is never negative.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_change_requests_version_nonneg'
    ) THEN
        ALTER TABLE tenant_change_requests
            ADD CONSTRAINT chk_tenant_change_requests_version_nonneg CHECK (configuration_version >= 0);
    END IF;
END$$;
