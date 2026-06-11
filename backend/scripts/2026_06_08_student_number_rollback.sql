-- Reversible inverse of 2026_06_08_student_number.sql. Apply only after
-- confirming no application code depends on the structures being dropped.
--
-- Forward script effect: applications.student_number column + unique
-- constraint uq_applications_student_number + partial index
-- idx_applications_student_number, per-(institution, year) sequences
-- stu_num_<code>_<year>, and the next_student_number() function.
--
-- This rollback drops them in the reverse of creation order using IF EXISTS
-- so the rollback is idempotent on re-run and does not error on a partial
-- state. Dropping the column removes already-assigned student numbers — only
-- run this if that data loss is intended.

DROP FUNCTION IF EXISTS next_student_number(TEXT, INT);

DROP SEQUENCE IF EXISTS stu_num_mihas_2025;
DROP SEQUENCE IF EXISTS stu_num_mihas_2026;
DROP SEQUENCE IF EXISTS stu_num_mihas_2027;
DROP SEQUENCE IF EXISTS stu_num_mihas_2028;
DROP SEQUENCE IF EXISTS stu_num_katc_2025;
DROP SEQUENCE IF EXISTS stu_num_katc_2026;
DROP SEQUENCE IF EXISTS stu_num_katc_2027;
DROP SEQUENCE IF EXISTS stu_num_katc_2028;

DROP INDEX IF EXISTS idx_applications_student_number;

ALTER TABLE IF EXISTS public.applications
    DROP CONSTRAINT IF EXISTS uq_applications_student_number;

ALTER TABLE IF EXISTS public.applications
    DROP COLUMN IF EXISTS student_number;
