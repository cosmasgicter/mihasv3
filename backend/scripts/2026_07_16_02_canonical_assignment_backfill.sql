-- Admissions V2 — task 3.2 (canonical assignment remediation), BACKFILL phase.
--
-- Spec:        .kiro/specs/admissions-v2-canonical-rebuild/
-- Requirements: R7.1-R7.2, R15.3-R15.7
-- Findings:    DATA-01, DATA-02, DATA-07, DATA-10, STU-01
-- Sequence:    design.md §15.2 step (4) "backfill in bounded idempotent batches
--              with checkpoints + exception ledger" and step (5) "verify zero
--              mismatches, repair/quarantine explicitly". Run AFTER the 01_ expand
--              script (needs canonical_assignment_exceptions + assignment_quarantined)
--              and BEFORE the 03_ validate script.
--
-- Scope:       APPLICATIONS ONLY. This script performs NO catalog writes — it
--              never creates canonical_programs or links offerings. Deriving
--              application.program_id (canonical) therefore depends on the tenant
--              offering already carrying a canonical_program_id; where it does not,
--              the row is quarantined fail-closed as 'offering_missing_canonical'
--              (owner: task 5.1 canonical catalog). This keeps 3.2 off task 5.1's
--              turf and honours R7.5 ("fail closed on canonical configuration").
--
-- Determinism contract (design.md §7.2, §19 "deterministic resolver, exception
-- ledger, snapshot comparison"):
--   * institution matched by institutions.name OR institutions.code (ci) vs the
--     applications.institution display snapshot;
--   * the tenant offering matched by programs.name (ci) scoped to that
--     institution vs the applications.program snapshot;
--   * the intake matched by intakes.name (ci) vs the applications.intake snapshot;
--   * canonical_program_id DERIVED from the resolved offering (never guessed).
-- A row is backfilled ONLY when it resolves to exactly ONE offering AND exactly
-- ONE intake AND the offering carries a canonical link. Everything else (zero
-- match, >1 match, offering with no canonical link, dangling FK) is quarantined
-- into the ledger with an owner + removal_path and is NOT force-resolved.
--
-- Idempotent: every statement is WHERE-scoped to rows that still need work, and
-- the ledger upserts via ON CONFLICT DO NOTHING, so a re-run converges and a row
-- that later becomes fully assigned is un-quarantined by the final step. Data
-- volume is tens of rows; a single WHERE-scoped UPDATE is the "batch". For a
-- large table this same statement would be wrapped in a keyset LIMIT loop with
-- checkpoints — the resolution predicate is unchanged.

-- --------------------------------------------------------------------------
-- Step 1 — Dangling FK sweep. A non-null canonical id that points to a missing
-- row is an integrity fault; record it, then clear the id to NULL so the row is
-- re-classified and (if non-draft) quarantined. On a validated-FK database this
-- is a no-op; it only fires where the June FKs were added NOT VALID.
-- --------------------------------------------------------------------------
INSERT INTO canonical_assignment_exceptions (application_id, reason_code, details, owner, removal_path)
SELECT a.id, 'dangling_fk',
       jsonb_build_object(
           'dangling_institution', a.institution_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM institutions i WHERE i.id = a.institution_id),
           'dangling_canonical',   a.program_id      IS NOT NULL AND NOT EXISTS (SELECT 1 FROM canonical_programs c WHERE c.id = a.program_id),
           'dangling_offering',    a.program_offering_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM programs p WHERE p.id = a.program_offering_id),
           'dangling_intake',      a.intake_id       IS NOT NULL AND NOT EXISTS (SELECT 1 FROM intakes t WHERE t.id = a.intake_id)
       ),
       'admissions-data-remediation',
       'A canonical FK pointed to a missing row; the id was cleared to NULL and the row re-quarantined. Re-derive from the display snapshot or archive the legacy row, then re-run the backfill.'
FROM applications a
WHERE (a.institution_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM institutions i WHERE i.id = a.institution_id))
   OR (a.program_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM canonical_programs c WHERE c.id = a.program_id))
   OR (a.program_offering_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM programs p WHERE p.id = a.program_offering_id))
   OR (a.intake_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM intakes t WHERE t.id = a.intake_id))
ON CONFLICT (application_id, reason_code) DO NOTHING;

UPDATE applications a SET institution_id = NULL
WHERE a.institution_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM institutions i WHERE i.id = a.institution_id);
UPDATE applications a SET program_id = NULL
WHERE a.program_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM canonical_programs c WHERE c.id = a.program_id);
UPDATE applications a SET program_offering_id = NULL
WHERE a.program_offering_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM programs p WHERE p.id = a.program_offering_id);
UPDATE applications a SET intake_id = NULL
WHERE a.intake_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM intakes t WHERE t.id = a.intake_id);

-- --------------------------------------------------------------------------
-- Step 2 — Deterministic backfill of uniquely-resolvable rows. institution_id is
-- derived from the resolved offering (programs.institution_id) so it can never
-- disagree with the offering; program_id is the offering's canonical link.
-- --------------------------------------------------------------------------
WITH off AS (
    SELECT a.id AS app_id,
           min(p.id::text)::uuid AS offering_id,
           min(p.canonical_program_id::text)::uuid AS canonical_id,
           min(p.institution_id::text)::uuid AS institution_id,
           count(*) AS c
    FROM applications a
    JOIN institutions i
      ON (lower(i.name) = lower(a.institution) OR lower(i.code) = lower(a.institution))
    JOIN programs p
      ON p.institution_id = i.id AND lower(p.name) = lower(a.program)
    GROUP BY a.id
),
intk AS (
    SELECT a.id AS app_id, min(t.id::text)::uuid AS intake_id, count(*) AS c
    FROM applications a
    JOIN intakes t ON lower(t.name) = lower(a.intake)
    GROUP BY a.id
)
UPDATE applications a
SET institution_id      = off.institution_id,
    program_offering_id = off.offering_id,
    program_id          = off.canonical_id,
    intake_id           = intk.intake_id
FROM off
JOIN intk ON intk.app_id = off.app_id
WHERE a.id = off.app_id
  AND off.c = 1
  AND intk.c = 1
  AND off.canonical_id IS NOT NULL
  AND (a.institution_id IS NULL
       OR a.program_offering_id IS NULL
       OR a.program_id IS NULL
       OR a.intake_id IS NULL);

-- --------------------------------------------------------------------------
-- Step 3 — Quarantine every non-draft row still missing any canonical id,
-- classifying the reason from the candidate counts. Ambiguous rows are NEVER
-- force-resolved (design.md §7.2 / §19).
-- --------------------------------------------------------------------------
WITH inst AS (
    SELECT a.id AS app_id, count(*) AS c
    FROM applications a
    JOIN institutions i
      ON (lower(i.name) = lower(a.institution) OR lower(i.code) = lower(a.institution))
    GROUP BY a.id
),
off AS (
    SELECT a.id AS app_id, min(p.canonical_program_id::text)::uuid AS canonical_id, count(*) AS c
    FROM applications a
    JOIN institutions i
      ON (lower(i.name) = lower(a.institution) OR lower(i.code) = lower(a.institution))
    JOIN programs p
      ON p.institution_id = i.id AND lower(p.name) = lower(a.program)
    GROUP BY a.id
),
intk AS (
    SELECT a.id AS app_id, count(*) AS c
    FROM applications a
    JOIN intakes t ON lower(t.name) = lower(a.intake)
    GROUP BY a.id
),
cand AS (
    SELECT a.id AS app_id, a.status, a.institution, a.program, a.intake,
           COALESCE(inst.c, 0) AS inst_c,
           COALESCE(off.c, 0) AS off_c,
           off.canonical_id,
           COALESCE(intk.c, 0) AS int_c,
           (a.institution_id IS NULL OR a.program_id IS NULL
            OR a.program_offering_id IS NULL OR a.intake_id IS NULL) AS incomplete
    FROM applications a
    LEFT JOIN inst ON inst.app_id = a.id
    LEFT JOIN off  ON off.app_id = a.id
    LEFT JOIN intk ON intk.app_id = a.id
)
INSERT INTO canonical_assignment_exceptions (application_id, reason_code, details, owner, removal_path)
SELECT app_id,
       CASE
           WHEN off_c = 0 THEN 'no_offering_match'
           WHEN off_c > 1 THEN 'ambiguous_offering'
           WHEN int_c = 0 THEN 'no_intake_match'
           WHEN int_c > 1 THEN 'ambiguous_intake'
           WHEN canonical_id IS NULL THEN 'offering_missing_canonical'
           ELSE 'unresolved'
       END,
       jsonb_build_object(
           'institution', institution, 'program', program, 'intake', intake,
           'institution_candidates', inst_c, 'offering_candidates', off_c,
           'intake_candidates', int_c
       ),
       'admissions-data-remediation',
       CASE
           WHEN off_c = 0 THEN 'No tenant offering matches the (institution, program) display snapshot. Create/link the offering (task 5.1) or archive the legacy row, then re-run the backfill.'
           WHEN off_c > 1 THEN 'The (institution, program) display snapshot matches more than one offering (same-name collision). Disambiguate from the student record / audit trail, then set the canonical IDs explicitly.'
           WHEN int_c = 0 THEN 'No intake matches the intake display snapshot. Create/link the intake, then re-run the backfill.'
           WHEN int_c > 1 THEN 'The intake display snapshot matches more than one intake. Disambiguate, then set intake_id explicitly.'
           WHEN canonical_id IS NULL THEN 'The resolved offering has no canonical_program_id. Canonicalise the catalog (task 5.1), then re-run the backfill.'
           ELSE 'Unresolved for an unknown reason; investigate manually.'
       END
FROM cand
WHERE status <> 'draft' AND incomplete
ON CONFLICT (application_id, reason_code) DO NOTHING;

UPDATE applications a
SET assignment_quarantined = true
WHERE a.status <> 'draft'
  AND (a.institution_id IS NULL OR a.program_id IS NULL
       OR a.program_offering_id IS NULL OR a.intake_id IS NULL)
  AND a.assignment_quarantined = false;

-- --------------------------------------------------------------------------
-- Step 4 — Self-heal: any row that is now fully assigned has its open exceptions
-- marked resolved and its quarantine flag cleared, so re-running after an
-- upstream fix (e.g. task 5.1 canonicalisation) converges without manual edits.
-- --------------------------------------------------------------------------
UPDATE canonical_assignment_exceptions e
SET resolved = true, resolved_at = now(), updated_at = now()
FROM applications a
WHERE e.application_id = a.id
  AND e.resolved = false
  AND a.institution_id IS NOT NULL AND a.program_id IS NOT NULL
  AND a.program_offering_id IS NOT NULL AND a.intake_id IS NOT NULL;

UPDATE applications a
SET assignment_quarantined = false
WHERE a.assignment_quarantined = true
  AND a.institution_id IS NOT NULL AND a.program_id IS NOT NULL
  AND a.program_offering_id IS NOT NULL AND a.intake_id IS NOT NULL;
