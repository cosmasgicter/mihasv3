-- Admissions V2 - task 13.6 remediation M1: widen the LAST application
-- display-snapshot column that is still narrower than its canonical source.
-- EXPAND phase (additive, idempotent, metadata-only).
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 13.6 §18.1 M1
-- Requirements: R15.3-R15.4 (additive expand, no rewrite, bounded locks),
--               R18.7 (rehearsed before it reaches production),
--               R9.2 (rollback contract - see the paired *_rollback.sql)
-- Findings:     GATE-13.3-13 (a legally-named long intake returns HTTP 500 on
--               every application create - the last unfixed 13.3 finding),
--               STU-13 (code half), GATE-13.5-01 (gate 20's surviving WARN)
-- Design:       15.2 step 6, 19 risk "Constraint creation blocks production"
--               control ("bounded locks")
-- Evidence:     docs/v2-evidence/13.6/remediation/M1-M2/README.md
-- Precedent:    2026_08_13_01_widen_application_snapshot_columns.sql (task 13.6
--               remediation L2) - same header shape, same information_schema
--               guard, same idempotence contract, same ledger-row-only rollback.
--               This script is its missing fourth line.
--
-- What this does
-- --------------
--   applications.intake : varchar(100) -> varchar(255)
--
-- Why this is a SECOND widen and not a correction of the first
-- -----------------------------------------------------------
-- L2 converged all three snapshot columns on the widths
-- ``apps.applications.models.Application`` DECLARED at the time: 255 / 100 / 255.
-- That was the right call for a data-migration lane - it invented no number, and
-- afterwards the column matched the model EXACTLY, which is why
-- ``docs/v2-evidence/13.5/raw/width-drift-probe.py`` reported 0 narrower AND 0
-- wider (docs/v2-evidence/13.6/remediation/L2-L3/raw/10-width-probe-after.txt).
--
-- But the model was itself wrong, and L2-L3 §6.1 said so and handed it forward.
-- The snapshot's SOURCE is ``intakes.name``, which is ``varchar(255)``
-- (``backend/apps/catalog/models.py:114``, and ``00_full_schema.sql``). So:
--
--   intakes.name         varchar(255)  <- a Platform_Admin may legally store this
--   Application.intake   max_length=100  <- and the snapshot could not hold it
--
-- Django does not validate ``max_length`` on ``.save()``. The whole value reached
-- Postgres, which raised ``value too long for type character varying(100)``, and
-- ``envelope_exception_handler`` answered HTTP 500. Not a validated 400 naming
-- the field, not a truncated snapshot - an unhandled ``DataError`` on EVERY
-- application create against that intake, for as long as the name exists.
-- Measured at the write layer on the restored production lineage, after L2's
-- widen had already landed:
-- docs/v2-evidence/13.6/remediation/L2-L3/raw/18-residual-intake-ceiling.txt.
--
-- So M1 is deliberately TWO coordinated changes, and either alone is useless:
--   1. ``Application.intake`` ``max_length`` 100 -> 255 (the model), and
--   2. this script (the column), so the database agrees with the model.
-- Shipping only (1) moves the 500 from Postgres to nowhere - Django still would
-- not validate, and the column would still reject the value. Shipping only (2)
-- leaves the width probe reporting a WIDER column than the model declares, which
-- is the drift the probe exists to catch. Both, or neither.
--
-- Why only ``intake``, and how that was established rather than assumed
-- --------------------------------------------------------------------
-- All three snapshot/source pairs were re-checked, not just the one the finding
-- names:
--
--   applications.institution  255  <-  institutions.name  255   agree
--   applications.intake       100  <-  intakes.name       255   MISMATCH
--   applications.program      255  <-  programs.name      255   agree
--
-- ``intake`` is the only mismatch, in the model and in ``00_full_schema.sql``
-- alike. That is also exactly the shape of 13.5 preflight gate 20's output after
-- L2: two PASS lines and one WARN
-- (docs/v2-evidence/13.6/remediation/L2-L3/raw/11-preflight-after.txt).
--
-- Online-safety (design 19 "bounded locks")
-- -----------------------------------------
-- Increasing a varchar's length limit is METADATA-ONLY on PG 9.2+: no table
-- rewrite, no index rebuild, no data movement, regardless of table size. The
-- statement takes ACCESS EXCLUSIVE on ``applications`` for the duration of a
-- catalogue update, not a scan of 33 - or 33 million - rows. The two btree
-- indexes on this column (``applications_intake_5b7fa111_like`` and
-- ``idx_applications_intake``) are NOT rebuilt. Transaction-safe, so it runs in
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
-- The widen fires only while the column EXISTS and is still NARROWER than 255,
-- so:
--   * a re-run is a complete no-op (not even a lock),
--   * a from-empty / Django-built database on the NEW model - already 255 - is a
--     complete no-op,
--   * a database still on the OLD 100 (or the pre-L2 50) is brought to 255 in one
--     step, so the two widens compose in either order,
--   * a hypothetical database wider than 255 is left alone rather than narrowed.
--     Narrowing is the one thing this must never do; it would truncate a real
--     applicant's stored record.
-- The guard reads ``information_schema`` rather than assuming 100, so it is
-- correct on any width this lineage happens to carry.
--
-- The column stays a display snapshot
-- -----------------------------------
-- ``docs/canonical-truth-map.md`` is explicit that ``applications.institution /
-- program / intake`` are read-only display mirrors and NEVER the authority for
-- business logic - the canonical ids are. Widening does not promote them. It only
-- stops a *display* column from rejecting a legal value its own source column
-- already accepts.
DO $$
DECLARE
    current_width integer;
BEGIN
    SELECT c.character_maximum_length
      INTO current_width
      FROM information_schema.columns c
     WHERE c.table_schema = current_schema()
       AND c.table_name = 'applications'
       AND c.column_name = 'intake';

    IF current_width IS NULL THEN
        -- Either the column is absent (a database not far enough forward - the
        -- boot gate owns that) or it is already an unbounded text type, which is
        -- wider than 255 and must not be narrowed.
        RAISE NOTICE 'applications.intake: no bounded varchar width found; leaving it alone';
    ELSIF current_width < 255 THEN
        ALTER TABLE applications ALTER COLUMN intake TYPE varchar(255);
        RAISE NOTICE 'widened applications.intake from varchar(%) to varchar(255)', current_width;
    ELSE
        RAISE NOTICE 'applications.intake already varchar(%); nothing to do', current_width;
    END IF;
END $$;

COMMENT ON COLUMN applications.intake IS
    'Display snapshot of the intake name at create time (canonical authority is intake_id). Widened to varchar(255) by task 13.6 remediation M1 so the snapshot matches its source intakes.name and can never reject a name the catalogue accepted - GATE-13.3-13 / STU-13. Superseded the varchar(100) that remediation L2 set from the then-current model.';
