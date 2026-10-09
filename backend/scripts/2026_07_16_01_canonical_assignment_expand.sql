-- Admissions V2 — task 3.2 (canonical assignment remediation), EXPAND phase.
--
-- Spec:        .kiro/specs/admissions-v2-canonical-rebuild/
-- Requirements: R7.1-R7.2, R15.3-R15.7
-- Findings:    DATA-01, DATA-02, DATA-07, DATA-10, STU-01
-- Sequence:    design.md §15.2 step (2) "add columns/constraints as nullable /
--              NOT VALID where online-safe". EXPAND is additive + idempotent and
--              performs NO data mutation. The backfill (step 4) and validate
--              (step 6) land in the sibling 02_/03_ scripts.
--
-- What this adds
-- --------------
-- 1. canonical_assignment_exceptions — the Legacy_Exception ledger. Ambiguous /
--    unresolvable applications are quarantined here (owner + removal_path) rather
--    than force-resolved (design.md §7.2 / §19 "exception ledger").
-- 2. applications.assignment_quarantined — a boolean flag that lets the non-null
--    invariant be expressed as a plain CHECK: a non-draft application must carry
--    all four canonical IDs UNLESS it is explicitly quarantined. Without the flag
--    the invariant would need a subquery (illegal in a CHECK).
-- 3. chk_applications_canonical_assignment — added NOT VALID so existing rows are
--    not scanned now; the 03_ validate script runs VALIDATE CONSTRAINT after the
--    backfill has resolved-or-quarantined every non-draft row.
--
-- Online-safety: ADD COLUMN with a constant default is metadata-only on PG 11+;
-- ADD CONSTRAINT ... NOT VALID takes a brief lock and does not scan the table.
-- Every statement is idempotent so a re-run after a tracking-table wipe converges.

CREATE TABLE IF NOT EXISTS canonical_assignment_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL,
    reason_code varchar(64) NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    owner varchar(120) NOT NULL DEFAULT 'admissions-data-remediation',
    removal_path text NOT NULL,
    resolved boolean NOT NULL DEFAULT false,
    resolved_at timestamp with time zone NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- One ledger row per (application, reason). Re-running the backfill upserts via
-- ON CONFLICT DO NOTHING; resolution flips ``resolved`` in place rather than
-- inserting a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_canon_assignment_exception_app_reason
    ON canonical_assignment_exceptions (application_id, reason_code);
CREATE INDEX IF NOT EXISTS idx_canon_assignment_exception_app
    ON canonical_assignment_exceptions (application_id);
CREATE INDEX IF NOT EXISTS idx_canon_assignment_exception_open
    ON canonical_assignment_exceptions (reason_code)
    WHERE resolved = false;

-- FK to applications. The table starts empty so a validated FK is instant here
-- (no NOT VALID needed). Guarded so a re-run does not error.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'canon_assignment_exceptions_application_id_fk'
    ) THEN
        ALTER TABLE canonical_assignment_exceptions
            ADD CONSTRAINT canon_assignment_exceptions_application_id_fk
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Quarantine flag: false for every existing row (constant default => metadata-only).
ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS assignment_quarantined boolean NOT NULL DEFAULT false;

-- Non-null-for-active-records invariant, added NOT VALID. A non-draft, non-quarantined
-- application must carry institution_id + program_id (canonical) + program_offering_id
-- + intake_id. Drafts and explicitly quarantined rows are exempt.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_applications_canonical_assignment'
    ) THEN
        ALTER TABLE applications
            ADD CONSTRAINT chk_applications_canonical_assignment
            CHECK (
                status = 'draft'
                OR assignment_quarantined = true
                OR (
                    institution_id IS NOT NULL
                    AND program_id IS NOT NULL
                    AND program_offering_id IS NOT NULL
                    AND intake_id IS NOT NULL
                )
            )
            NOT VALID;
    END IF;
END $$;
