-- Admissions V2 — task 3.3 catalog/fee/grant/template/waitlist/capacity
-- integrity constraints (EXPAND).
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.3
-- Requirements: R5.6, R6.7, R7.4-R7.7, R15.5
-- Findings: TEN-08, DATA-02, DATA-03, DATA-05, DATA-06
-- Design: design.md §7.1 (ownership-graph SQL invariants) + §15.2
--         (priority schema corrections).
--
-- Additive + idempotent, so it is safe under the apply_sql_migrations runner
-- contract (each file runs once via migration_history, but must also re-run as
-- a no-op). Every object is created behind an IF NOT EXISTS / pg_constraint
-- guard, so re-application changes nothing. Forward script only — the paired
-- *_rollback.sql (operator-only, excluded from the boot sweep) reverses it.
--
-- Null-safe uniqueness (R5.6, R6.7): the tenant-scoped uniques use
-- NULLS NOT DISTINCT (PostgreSQL 15+; production, Neon, and CI are all >= 16)
-- so a NULL institution_id / program_id / canonical_program_id / intake_id is
-- treated as a real value rather than "every NULL is unique". Two Beanola
-- platform template rows (institution_id NULL) with the same key+version
-- therefore collide, which is exactly the invariant the design requires.
--
-- The last-seat / capacity counter enforcement (locking, atomic increment) is
-- owned by task 5.3; this task adds the *schema* guardrails (unique/scope/
-- non-negative constraints) that make those races fail closed at the DB layer.
--
-- A READ-ONLY preflight (docs/v2-evidence/3.3/inventory.sql, blocks P1-P8) was
-- run on the Neon default branch first: zero duplicate ProgramIntake pairs,
-- zero duplicate active fees, zero duplicate grant/profile/template versions,
-- zero negative capacity counters, and zero rows that violate the global
-- template_key drop (script 02). Every constraint below is therefore created
-- VALID (no NOT VALID staging needed) because no existing row violates it.

-- ---------------------------------------------------------------------------
-- 1. ProgramIntake (Intake_Offering) — unique (program_id, intake_id).
--    R7.4 "unique offering/intake links". The Django unique_together already
--    materialised `program_intakes_program_id_intake_id_key` on Neon + the
--    ephemeral test DB, but production (self-hosted) may lack it; create a
--    covering unique index only when NO unique already covers the pair.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conrelid = 'program_intakes'::regclass
          AND c.contype = 'u'
          AND c.conkey = ARRAY[
              (SELECT attnum FROM pg_attribute
                 WHERE attrelid = 'program_intakes'::regclass AND attname = 'program_id'),
              (SELECT attnum FROM pg_attribute
                 WHERE attrelid = 'program_intakes'::regclass AND attname = 'intake_id')
          ]::smallint[]
    ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_program_intakes_program_intake
            ON program_intakes (program_id, intake_id);
    END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2. ProgramIntake + Intake — non-negative capacity/enrollment counters.
--    R7.6 "constrained non-negative counters"; design §7.1. NULL is permitted
--    (unconfigured capacity) — a CHECK passes on NULL, only a negative value
--    fails.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_program_intakes_capacity_nonneg') THEN
        ALTER TABLE program_intakes
            ADD CONSTRAINT chk_program_intakes_capacity_nonneg CHECK (max_capacity >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_program_intakes_enrollment_nonneg') THEN
        ALTER TABLE program_intakes
            ADD CONSTRAINT chk_program_intakes_enrollment_nonneg CHECK (current_enrollment >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_intakes_capacity_nonneg') THEN
        ALTER TABLE intakes
            ADD CONSTRAINT chk_intakes_capacity_nonneg CHECK (max_capacity >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_intakes_enrollment_nonneg') THEN
        ALTER TABLE intakes
            ADD CONSTRAINT chk_intakes_enrollment_nonneg CHECK (current_enrollment >= 0);
    END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3. ProgramFee — one active fee per (program_offering, fee_type, residency).
--    R7.4 "one active fee per offering, fee type, and residency"; DATA-05.
--    Partial unique: inactive rows (history) are unconstrained.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_program_fees_one_active
    ON program_fees (program_id, fee_type, residency_category)
    WHERE is_active;

-- ---------------------------------------------------------------------------
-- 4. AccessGrant — scope/target CHECK + per-scope active-duplicate uniqueness.
--    R6.7 "grant scope/target combinations and duplicates prevented by DB
--    constraints". The three partial uniques mirror the serializer's
--    (user, scope_type, target-id) active-duplicate guard exactly, so a
--    concurrent double-submit that races past the serializer fails closed.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_access_grants_scope_target') THEN
        ALTER TABLE access_grants
            ADD CONSTRAINT chk_access_grants_scope_target CHECK (
                scope_type IN ('institution', 'program_offering', 'application')
                AND (
                    (scope_type = 'institution' AND institution_id IS NOT NULL)
                    OR (scope_type = 'program_offering' AND program_id IS NOT NULL)
                    OR (scope_type = 'application' AND application_id IS NOT NULL)
                )
            );
    END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_access_grants_active_institution
    ON access_grants (user_id, institution_id)
    WHERE is_active AND scope_type = 'institution';

CREATE UNIQUE INDEX IF NOT EXISTS uq_access_grants_active_program
    ON access_grants (user_id, program_id)
    WHERE is_active AND scope_type = 'program_offering';

CREATE UNIQUE INDEX IF NOT EXISTS uq_access_grants_active_application
    ON access_grants (user_id, application_id)
    WHERE is_active AND scope_type = 'application';

-- ---------------------------------------------------------------------------
-- 5. InstitutionDocumentProfile — one row per (scope, version). R7 / R15.5;
--    DATA-06. Scope = (institution, document_type, program, canonical_program,
--    intake); NULLS NOT DISTINCT so an institution-default profile (all scope
--    FKs NULL) cannot have two rows at the same version — the exact tuple
--    next_version_for_scope() keys on, so a concurrent clone race fails closed.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_profiles_scope_version
    ON institution_document_profiles
       (institution_id, document_type, program_id, canonical_program_id, intake_id, version)
    NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- 6. CommunicationTemplate — tenant-scoped version uniqueness + one active
--    version per (key, institution). R5.6, R15.5; TEN-08. NULLS NOT DISTINCT
--    so Beanola platform rows (institution_id NULL) are still constrained.
--    The legacy global UNIQUE(template_key) is dropped in script 02 — these
--    stricter tenant-aware uniques are established first so the two never
--    leave a window with no uniqueness at all.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_templates_key_inst_version
    ON communication_templates (template_key, institution_id, version)
    NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_templates_one_active
    ON communication_templates (template_key, institution_id)
    NULLS NOT DISTINCT
    WHERE is_active;

-- ---------------------------------------------------------------------------
-- 7. Application waitlist — unique position within an Intake_Offering.
--    R7.6/R7.7, design §7.1 "unique waitlist position within an
--    Intake_Offering"; DATA-02/DATA-03. Keyed on the canonical
--    (program_offering_id, intake_id) pair, NOT the legacy display strings.
--    Partial WHERE all three are non-null: it fails closed for canonical rows
--    (task 5.3's ID-based waitlist) while leaving today's not-yet-backfilled
--    string-based rows (canonical IDs still NULL) unconstrained, so it cannot
--    break the current WaitlistManager before 5.2 backfills the IDs.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_waitlist_position
    ON applications (program_offering_id, intake_id, waitlist_position)
    WHERE waitlist_position IS NOT NULL
      AND program_offering_id IS NOT NULL
      AND intake_id IS NOT NULL;
