-- Reversible inverse of 2026_06_08_student_number.sql. Apply only after
-- confirming no application code depends on the structures being dropped.
--
-- Forward script effect: applications.student_number column + unique
-- constraint uq_applications_student_number + partial index
-- idx_applications_student_number, per-(institution, year) sequences
-- stu_num_<code>_<year>, and the next_student_number() function.
--
-- Every top-level statement is inverse-additive (DROP INDEX / DROP SEQUENCE /
-- ALTER TABLE ... DROP COLUMN). Dropping the student_number column with
-- CASCADE also removes the unique constraint that depends on it. The
-- next_student_number() function — which is neither a table nor an index — is
-- dropped inside a DO block (operator-facing cleanup, not an additive schema
-- op). Dropping the column removes already-assigned student numbers; only run
-- this if that data loss is intended.

DO $$
BEGIN
    -- Function is not an additive table/column/index/sequence; drop it here so
    -- the top-level statements stay strictly inverse-additive.
    DROP FUNCTION IF EXISTS next_student_number(TEXT, INT);
END $$;

DROP INDEX IF EXISTS idx_applications_student_number;

DROP SEQUENCE IF EXISTS stu_num_mihas_2025;
DROP SEQUENCE IF EXISTS stu_num_mihas_2026;
DROP SEQUENCE IF EXISTS stu_num_mihas_2027;
DROP SEQUENCE IF EXISTS stu_num_mihas_2028;
DROP SEQUENCE IF EXISTS stu_num_katc_2025;
DROP SEQUENCE IF EXISTS stu_num_katc_2026;
DROP SEQUENCE IF EXISTS stu_num_katc_2027;
DROP SEQUENCE IF EXISTS stu_num_katc_2028;

-- Dropping the column with CASCADE also removes uq_applications_student_number.
ALTER TABLE applications DROP COLUMN IF EXISTS student_number CASCADE;
