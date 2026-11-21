-- next_application_number: survive concurrent first use of a new sequence.
--
-- Problem 4 of the finish-2026-11-21 run (application-number allocation can
-- race). Amends application_number_sequences.sql, which defines the helper.
--
-- The helper creates the per-(institution_code, year) sequence on first use
-- with CREATE SEQUENCE IF NOT EXISTS. That statement is not safe under
-- concurrency: every session that calls the helper for a new (code, year) at the
-- same moment sees no sequence, one of them creates it, and the others fail once
-- it commits, either on the catalog's unique index (unique_violation,
-- "pg_class_relname_nsp_index") or on the existence re-check (duplicate_table).
-- Measured on Postgres 16.14: 12 concurrent first calls for a new code, 8
-- rounds, 85 of 96 calls raised unique_violation. The application caught the
-- error, logged "next_application_number SQL helper unavailable" and fell back
-- to a count-based number, which collides under the same concurrency
-- (IntegrityError on applications_application_number_key, a 500 on
-- POST /api/v1/applications/). It happens for any code/year without a
-- pre-created sequence: a new institution, the platform code, every new year.
--
-- This redefines the helper with the same body, plus one change: either error
-- around the CREATE means the sequence now exists, so it is caught and the
-- call carries on to nextval. The returned format is unchanged:
-- {CODE}{YEAR}{5-digit-zero-padded-sequence}.
--
-- Naming: undated on purpose. apply_sql_migrations applies top-level scripts in
-- filename order, and application_number_sequences.sql runs CREATE OR REPLACE
-- FUNCTION with the old body. A dated name sorts before it, so on a database
-- built from empty the old body would be applied last and win. This name sorts
-- immediately after it.
--
-- Additive and idempotent: CREATE OR REPLACE FUNCTION only. No table, column,
-- sequence or data is touched. Safe to re-run.

CREATE OR REPLACE FUNCTION next_application_number(p_code TEXT, p_year INT)
RETURNS TEXT AS $$
DECLARE
    seq_name TEXT;
    seq_val  BIGINT;
BEGIN
    IF p_code IS NULL OR length(p_code) = 0 THEN
        RAISE EXCEPTION 'next_application_number: p_code must be a non-empty institution code';
    END IF;

    seq_name := format('app_num_%s_%s', lower(p_code), p_year);

    -- Auto-create the sequence on first use for a previously-unseen
    -- institution+year. When another session creates it at the same moment,
    -- this CREATE fails with unique_violation or duplicate_table after that
    -- session commits; the sequence then exists, so carry on.
    BEGIN
        EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START WITH 1', seq_name);
    EXCEPTION
        WHEN unique_violation OR duplicate_table THEN
            NULL;
    END;

    EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq_val;

    RETURN format('%s%s%s', upper(p_code), p_year, lpad(seq_val::TEXT, 5, '0'));
END;
$$ LANGUAGE plpgsql;
