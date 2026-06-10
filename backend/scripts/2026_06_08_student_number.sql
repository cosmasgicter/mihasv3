-- Student-number column + per-(institution_code, year) sequences.
--
-- A student number is assigned when an application reaches FULL acceptance
-- (status -> 'enrolled'). It is distinct from the application_number (issued
-- at submission) and from the public_tracking_code.
--
-- This migration adds:
--   - applications.student_number  VARCHAR(30) UNIQUE  (nullable; only enrolled
--     applications carry one).
--   - One Postgres sequence per (institution_code, year), auto-created on first
--     use via the helper function below.
--   - A SQL function next_student_number(p_code, p_year) that advances the
--     right sequence and returns the formatted number:
--       {CODE}/{YY}/{5-digit-seq}   e.g.  MIHAS/26/00001
--     The slash-separated 2-digit-year form is deliberately different from the
--     application_number (MIHAS202600042) so the two are never confused.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE SEQUENCE IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, CREATE INDEX IF NOT EXISTS. Safe to re-run.

-- 1. Column + unique constraint + partial index.
ALTER TABLE public.applications
    ADD COLUMN IF NOT EXISTS student_number VARCHAR(30);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_applications_student_number'
    ) THEN
        ALTER TABLE public.applications
            ADD CONSTRAINT uq_applications_student_number UNIQUE (student_number);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_applications_student_number
    ON public.applications (student_number)
    WHERE student_number IS NOT NULL;

-- 2. Pre-create the most-likely sequences for current institutions + years.
--    (The function auto-creates any missing sequence on first use.)
CREATE SEQUENCE IF NOT EXISTS stu_num_mihas_2025 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS stu_num_mihas_2026 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS stu_num_mihas_2027 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS stu_num_mihas_2028 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS stu_num_katc_2025 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS stu_num_katc_2026 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS stu_num_katc_2027 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS stu_num_katc_2028 START WITH 1;

-- 3. Helper: advance the right sequence and return the formatted number.
--    Format: {CODE}/{2-digit-year}/{5-digit-zero-padded-seq}, e.g. MIHAS/26/00001.
CREATE OR REPLACE FUNCTION next_student_number(p_code TEXT, p_year INT)
RETURNS TEXT AS $$
DECLARE
    seq_name TEXT;
    seq_val  BIGINT;
    yy       TEXT;
BEGIN
    IF p_code IS NULL OR length(p_code) = 0 THEN
        RAISE EXCEPTION 'next_student_number: p_code must be a non-empty institution code';
    END IF;

    seq_name := format('stu_num_%s_%s', lower(p_code), p_year);

    -- Auto-create the sequence on first use for a previously-unseen institution+year.
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START WITH 1', seq_name);

    EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq_val;

    yy := lpad((p_year % 100)::TEXT, 2, '0');

    RETURN format('%s/%s/%s', upper(p_code), yy, lpad(seq_val::TEXT, 5, '0'));
END;
$$ LANGUAGE plpgsql;

-- 4. Backfill block: align each per-(institution, year) sequence with the
--    current max student_number for already-enrolled applications, so the next
--    generated number does not collide. Re-runnable.
DO $$
DECLARE
    rec      RECORD;
    seq_name TEXT;
    max_seq  INT;
BEGIN
    FOR rec IN
        SELECT
            split_part(student_number, '/', 1) AS code,
            split_part(student_number, '/', 2) AS yy
        FROM public.applications
        WHERE student_number ~ '^[A-Z]+/\d{2}/\d{5}$'
        GROUP BY 1, 2
    LOOP
        -- Reconstruct the 4-digit year from the 2-digit code (assumes 2000s).
        seq_name := format('stu_num_%s_20%s', lower(rec.code), rec.yy);
        EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START WITH 1', seq_name);

        EXECUTE format(
            'SELECT max(split_part(student_number, ''/'', 3)::int) + 1 '
            'FROM public.applications WHERE student_number LIKE %L',
            rec.code || '/' || rec.yy || '/%'
        ) INTO max_seq;

        IF max_seq IS NOT NULL THEN
            EXECUTE format('ALTER SEQUENCE %I RESTART WITH %s', seq_name, max_seq);
        END IF;
    END LOOP;
END $$;

-- Verification queries (run manually after applying):
--
--   SELECT next_student_number('MIHAS', 2026);  -- e.g. MIHAS/26/00001
--   SELECT next_student_number('KATC', 2026);   -- different sequence
--   \d+ applications  -- confirm student_number column + unique constraint
