-- Admissions V2 — task 4.2 atomic tenant-admin invitation + membership handoff.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 4.2
-- Requirements: R4.3 (create membership + invitation atomically; never return,
--               log, or persist a reusable plaintext password in browser
--               storage), R4.4 (compensate all records of a failed atomic
--               operation; no orphan admin / partially authoritative tenant),
--               R6.3 (search-by-email staff invitation, not raw UUID entry).
-- Findings: TEN-01, TEN-05.
-- Design: design.md §5.3 (People And Access — membership + invitation handoff),
--         §6.1 (Tenant Aggregate), §17 (durable committed outbox).
--
-- Additive + idempotent, safe under the apply_sql_migrations runner contract
-- (each file runs once via migration_history, but must also re-run as a no-op).
-- Every object is created behind CREATE TABLE IF NOT EXISTS / CREATE INDEX IF
-- NOT EXISTS / a pg_constraint guard, so re-application changes nothing. Forward
-- script only — the paired *_rollback.sql (operator-only, excluded from the boot
-- sweep) reverses it. No DROP / TRUNCATE / DELETE, so it passes the runner's
-- additive-only lint (_find_non_additive_violations).
--
-- The invitation record is the durable handoff artefact that replaces the old
-- fragile client flow (TEN-01): the browser used to create a global admin, then
-- separately create a membership across several calls (misreading the response
-- shape, sometimes stopping before the membership, and marking the tenant
-- active on create), and it displayed + persisted an operator-set initial
-- password in localStorage. The V2 flow creates the identity, this invitation,
-- and the membership in ONE transaction (R4.3/R4.4), stores only the SHA-256
-- HASH of a single-use token (never a plaintext password), and the invitee sets
-- their own password by consuming the token (the "handoff"). Compensation is a
-- transaction rollback, so a failed invite leaves no orphan identity/membership.
--
-- ``managed = False`` model: apps.catalog.models.TenantStaffInvitation mirrors
-- this table; the test unmanaged_schema fixture materialises it via
-- create_model, so this script is the production/Neon source of truth.

CREATE TABLE IF NOT EXISTS tenant_staff_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The tenant the staff member is being scoped to. The invitation, identity,
    -- and membership are one atomic operation keyed off this institution (R4.3).
    institution_id uuid NOT NULL,
    -- Invited email (stored lower-cased). Invitations are searched/created by
    -- email, never by pasting a raw profile UUID (R6.3, TEN-05).
    email text NOT NULL,
    -- The tenant role the membership grants (e.g. admin | reviewer). Never
    -- super_admin — platform authority is never granted through an invitation.
    invited_role varchar(50) NOT NULL DEFAULT 'admin',
    -- Granted tenant mutation capabilities layered onto the membership.
    permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- SHA-256 hash of the single-use invitation token. The raw token is only
    -- ever emailed (in a trusted tenant/platform link); it is NEVER returned to
    -- the browser, logged, or persisted in plaintext (R4.3). NULL once the
    -- invitation is consumed (accepted) or revoked so a used token cannot be
    -- replayed.
    token_hash varchar(64) NULL,
    -- Lifecycle: pending -> accepted | revoked | expired. A pending invitation
    -- with a live (non-expired) token can be accepted; resend rotates the token.
    status varchar(20) NOT NULL DEFAULT 'pending',
    -- The identity created or reused by the invitation (FK profiles). Set inside
    -- the same transaction as the invitation + membership.
    profile_id uuid NULL,
    -- The membership created atomically with the invitation (FK
    -- user_institution_memberships). Deactivated on revoke.
    membership_id uuid NULL,
    -- The Super_Admin / Tenant_Admin who issued the invitation (FK profiles).
    invited_by_id uuid NULL,
    -- Single-use token expiry; an expired pending invitation cannot be accepted
    -- until it is resent (which rotates the token + extends expiry).
    expires_at timestamp with time zone NULL,
    accepted_at timestamp with time zone NULL,
    revoked_at timestamp with time zone NULL,
    -- Resend bookkeeping (last email dispatch + count) for operator visibility.
    last_sent_at timestamp with time zone NULL,
    resend_count integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now()
);

-- One live token per invitation. Partial so the many rows whose token has been
-- consumed/revoked (token_hash NULL) never collide, and a used token can never
-- be replayed against a second row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_staff_invitations_token_hash
    ON tenant_staff_invitations (token_hash)
    WHERE token_hash IS NOT NULL;

-- At most one PENDING invitation per (institution, email): the duplicate-invite
-- race is rejected by the DB, not just the serializer (R4.4 — no partially
-- authoritative duplicate). lower(email) keeps it case-insensitive. Accepted /
-- revoked / expired rows are excluded so re-inviting after revoke/expiry works.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_staff_invitations_pending_email
    ON tenant_staff_invitations (institution_id, lower(email))
    WHERE status = 'pending';

-- Operational listing/filtering by tenant + lifecycle state.
CREATE INDEX IF NOT EXISTS idx_tenant_staff_invitations_institution_status
    ON tenant_staff_invitations (institution_id, status);

-- Covering index for the FK columns (mirrors the production FK-index invariant).
CREATE INDEX IF NOT EXISTS idx_tenant_staff_invitations_profile
    ON tenant_staff_invitations (profile_id);
CREATE INDEX IF NOT EXISTS idx_tenant_staff_invitations_membership
    ON tenant_staff_invitations (membership_id);

-- NOT VALID FKs: enforced for new rows; validation of any pre-existing rows is
-- deferred to a later maintenance step (there are none at ship time). ADD
-- CONSTRAINT has no IF NOT EXISTS form in this Postgres line, so each is wrapped
-- in a pg_constraint guard to keep re-application a no-op.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_staff_invitations_institution_id_fk'
    ) THEN
        ALTER TABLE tenant_staff_invitations
            ADD CONSTRAINT tenant_staff_invitations_institution_id_fk
            FOREIGN KEY (institution_id) REFERENCES institutions (id) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_staff_invitations_profile_id_fk'
    ) THEN
        ALTER TABLE tenant_staff_invitations
            ADD CONSTRAINT tenant_staff_invitations_profile_id_fk
            FOREIGN KEY (profile_id) REFERENCES profiles (id) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_staff_invitations_membership_id_fk'
    ) THEN
        ALTER TABLE tenant_staff_invitations
            ADD CONSTRAINT tenant_staff_invitations_membership_id_fk
            FOREIGN KEY (membership_id) REFERENCES user_institution_memberships (id) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_staff_invitations_invited_by_id_fk'
    ) THEN
        ALTER TABLE tenant_staff_invitations
            ADD CONSTRAINT tenant_staff_invitations_invited_by_id_fk
            FOREIGN KEY (invited_by_id) REFERENCES profiles (id) NOT VALID;
    END IF;

    -- Lifecycle-status domain guard.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_staff_invitations_status'
    ) THEN
        ALTER TABLE tenant_staff_invitations
            ADD CONSTRAINT chk_tenant_staff_invitations_status CHECK (
                status IN ('pending', 'accepted', 'revoked', 'expired')
            );
    END IF;

    -- Resend count is never negative.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_staff_invitations_resend_nonneg'
    ) THEN
        ALTER TABLE tenant_staff_invitations
            ADD CONSTRAINT chk_tenant_staff_invitations_resend_nonneg CHECK (resend_count >= 0);
    END IF;
END$$;
