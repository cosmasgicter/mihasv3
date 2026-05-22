-- Per-(institution_code, year) sequences for application numbers.
--
-- The original generator at backend/apps/applications/_view_helpers.py used a
-- count+attempt loop with a random hex fallback. Under burst load this races:
-- two concurrent submissions for the same institution+year may COUNT the same
-- N and produce the same candidate, leading to either a unique-constraint
-- collision or a fallback to the random format that breaks the application
-- number invariant (MIHAS{YEAR}{5 digits}).
--
-- This migration adds:
--   - One Postgres sequence per (institution_code, year), auto-created on
--     first use via the helper function below.
--   - A SQL function next_application_number(p_code, p_year) that advances
--     the right sequence and returns the formatted number.
--
-- Idempotent: CREATE SEQUENCE IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- Safe to re-run.
--
-- Backfill consideration:
-- After applying, run the start-value backfill block at the bottom to align
-- each per-(institution, year) sequence with its current max in the
-- applications table.

-- Pre-create the most-likely sequences for current institutions + years.
-- (The function will auto-create any missing sequence on first use.)
CREATE SEQUENCE IF NOT EXISTS app_num_mihas_2025 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS app_num_mihas_2026 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS app_num_mihas_2027 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS app_num_katc_2025 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS app_num_katc_2026 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS app_num_katc_2027 START WITH 1;


-- Helper function: advance the right sequence and return the formatted number.
-- Format: {CODE}{YEAR}{5-digit-zero-padded-sequence}, e.g. MIHAS202600042.
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

    -- Auto-create the sequence on first use for a previously-unseen institution+year.
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START WITH 1', seq_name);

    EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq_val;

    RETURN format('%s%s%s', upper(p_code), p_year, lpad(seq_val::TEXT, 5, '0'));
END;
$$ LANGUAGE plpgsql;


-- Backfill block: align each existing sequence's start value with the current
-- max(seq) in the applications table for that (institution, year). Run AFTER
-- the sequences exist but BEFORE switching application code over to the new
-- helper, so the first new application doesn't collide with an existing
-- application_number.
--
-- Re-runnable: DO blocks are idempotent.
DO $$
DECLARE
    rec     RECORD;
    seq_name TEXT;
    max_seq INT;
BEGIN
    FOR rec IN
        SELECT
            substring(application_number FROM '^([A-Z]+)') AS code,
            substring(application_number FROM '\d{4}') AS yr
        FROM public.applications
        WHERE application_number ~ '^[A-Z]+\d{9}$'
        GROUP BY 1, 2
    LOOP
        seq_name := format('app_num_%s_%s', lower(rec.code), rec.yr);
        EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START WITH 1', seq_name);

        EXECUTE format(
            'SELECT max(substring(application_number FROM ''\d{5}$'')::int) + 1 '
            'FROM public.applications WHERE application_number LIKE %L',
            rec.code || rec.yr || '%'
        ) INTO max_seq;

        IF max_seq IS NOT NULL THEN
            -- ALTER SEQUENCE RESTART WITH N is idempotent and atomic.
            EXECUTE format('ALTER SEQUENCE %I RESTART WITH %s', seq_name, max_seq);
        END IF;
    END LOOP;
END $$;


-- Verification queries (run manually after applying):
--
--   SELECT next_application_number('MIHAS', 2026);  -- returns next number
--   SELECT next_application_number('KATC', 2026);   -- different sequence
--   SELECT sequence_name, last_value FROM pg_sequences
--    WHERE sequence_name LIKE 'app_num_%' ORDER BY sequence_name;
