-- Admissions V2 - task 13.6 remediation L2: widen the three application
-- display-snapshot columns to match the model. EXPAND phase (additive,
-- idempotent, metadata-only).
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 13.6 §8.1 L2
-- Requirements: R15.3-R15.4 (additive expand, no rewrite, bounded locks),
--               R18.7 (the change is rehearsed before it reaches production),
--               R9.2 (rollback contract - see the paired *_rollback.sql)
-- Findings:     GATE-13.5-01 (three columns narrower than the model, invisible
--               to the boot gate), GATE-13.3-13 (a legally-named long intake
--               returns HTTP 500 on every application create), STU-13
-- Design:       15.2 step 6, 19 risk "Constraint creation blocks production"
--               control ("bounded locks")
-- Evidence:     docs/v2-evidence/13.6/remediation/L2-L3/README.md
-- Precedent:    2026_08_12_01_tenant_new_table_fk_validate.sql (task 13.4) -
--               same header shape, same DO-block guard, same idempotence
--               contract, same ledger-row-only rollback.
--
-- What this does
-- --------------
--   applications.institution : varchar(50) -> varchar(255)
--   applications.intake      : varchar(50) -> varchar(100)
--   applications.program     : varchar(50) -> varchar(255)
--
-- The target widths are not new numbers. They are exactly what
-- ``apps.applications.models.Application`` declares (``max_length`` 255 / 100 /
-- 255) and exactly what ``00_full_schema.sql`` creates on a from-empty build
-- (measured on v2_fresh_13_4: 255 / 100 / 255). This script converges the
-- inherited production lineage onto the shape a fresh build already has; it
-- invents nothing.
--
-- Why the boot gate never caught it
-- ---------------------------------
-- ``manage.py check_schema_drift`` states, in its own docstring, under "What it
-- does NOT check (intentionally)":
--
--     * Type compatibility (VARCHAR vs TEXT etc.): not a 500 risk in practice
--       - Postgres auto-coerces most compatible types.
--
-- That is true for a column WIDER than the model and false for one NARROWER.
-- Django sends the whole value; Postgres raises ``DataError: value too long for
-- type character varying(50)``; ``envelope_exception_handler`` answers HTTP 500.
-- The column EXISTS, so the gate passes and reports the schema as fine. The gate
-- is not wrong to skip the class - it is wrong about the direction, and this
-- script removes the instance rather than arguing with the gate.
--
-- Why this is urgent rather than tidy
-- -----------------------------------
-- The headroom is FOUR characters. 13.5 preflight gate 20, on the restored
-- production-lineage snapshot, found the longest ``institutions.name`` at 46 of
-- 50 ("Mukuba Institute of Health and Allied Sciences"). One tenant rename - a
-- campus qualifier, a fully spelt legal name, a new school - and EVERY
-- application create 500s for that tenant, with the boot gate having just said
-- the schema was correct. Measured, at the write layer, on this batch's scratch
-- copy of that snapshot: all three columns raise DataError at 51 characters
-- (docs/v2-evidence/13.6/remediation/L2-L3/raw/04-long-value-before.txt).
--
-- The columns themselves stay display snapshots
-- --------------------------------------------
-- docs/canonical-truth-map.md is explicit that ``applications.institution /
-- program / intake`` are read-only display mirrors and NEVER the authority for
-- business logic - the canonical ids are. Widening them does not promote them.
-- It only stops a *display* column from being able to reject a legal value that
-- its own source column already accepts (``institutions.name`` is varchar(255)
-- here; the snapshot was varchar(50)).
--
-- Online-safety (design 19 "bounded locks")
-- -----------------------------------------
-- Increasing the length limit of a varchar is METADATA-ONLY on PG 9.2+: no table
-- rewrite, no index rebuild, no data movement, regardless of table size. The
-- statement takes ACCESS EXCLUSIVE on ``applications`` for the duration of the
-- catalogue update, which is why it is worth stating that the duration is a
-- catalogue write and not a scan of 33 - or 33 million - rows. The two btree
-- indexes that exist on these columns (``idx_applications_intake``,
-- ``idx_applications_program``) are NOT rebuilt. Transaction-safe, so it runs in
-- the ordinary transactional ``apply_sql_migrations`` path.
--
-- Additive-only-lint clean: the runner rejects ``ALTER TABLE ... ALTER COLUMN
-- ... TYPE ... USING`` (a narrowing conversion needs an explicit cast
-- expression). A widening varchar conversion needs no ``USING``, which is the
-- exact distinction the lint draws, and the spec permits it by name
-- ("widening ``ALTER COLUMN ... TYPE`` conversions").
--
-- Idempotent + environment-safe
-- -----------------------------
-- Each widen fires only while the column EXISTS and is still NARROWER than the
-- target, so:
--   * a re-run is a complete no-op (not even a lock),
--   * a from-empty / Django-built database - already 255 / 100 / 255 - is a
--     complete no-op,
--   * a hypothetical database where someone widened further than the model is
--     left alone rather than narrowed (narrowing is the one thing this must
--     never do; it would truncate real applicant data).
-- The guard reads ``information_schema`` rather than assuming 50, so it is
-- correct on any width this lineage happens to carry.

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.column_name AS name, t.target
        FROM (VALUES
                 ('institution', 255),
                 ('intake',      100),
                 ('program',     255)
             ) AS t(column_name, target)
        JOIN information_schema.columns c
          ON c.table_schema = current_schema()
         AND c.table_name = 'applications'
         AND c.column_name = t.column_name
        WHERE c.character_maximum_length IS NOT NULL
          AND c.character_maximum_length < t.target
    LOOP
        EXECUTE format(
            'ALTER TABLE applications ALTER COLUMN %I TYPE varchar(%s)',
            r.name, r.target
        );
        RAISE NOTICE 'widened applications.% to varchar(%)', r.name, r.target;
    END LOOP;
END $$;

COMMENT ON COLUMN applications.institution IS
    'Display snapshot of the institution name at create time (canonical authority is institution_id). Widened to varchar(255) by task 13.6 remediation L2 to match the model and institutions.name - GATE-13.5-01 / GATE-13.3-13.';
COMMENT ON COLUMN applications.intake IS
    'Display snapshot of the intake name at create time (canonical authority is intake_id). Widened to varchar(100) by task 13.6 remediation L2 to match the model - GATE-13.5-01 / GATE-13.3-13.';
COMMENT ON COLUMN applications.program IS
    'Display snapshot of the programme name at create time (canonical authority is program_id / program_offering_id). Widened to varchar(255) by task 13.6 remediation L2 to match the model - GATE-13.5-01 / GATE-13.3-13.';
