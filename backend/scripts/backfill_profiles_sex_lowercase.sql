-- Backfill: Normalize profiles.sex to canonical lowercase ('male' / 'female')
-- Idempotent: re-running is a no-op since already-lowercase rows are excluded by the WHERE clause.
-- Date: 2026-05-27

BEGIN;

DO $$
DECLARE
  affected bigint;
BEGIN
  UPDATE profiles
  SET sex = lower(sex)
  WHERE sex IS NOT NULL
    AND lower(sex) IN ('male', 'female')
    AND sex != lower(sex);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE 'backfill_profiles_sex_lowercase: % rows updated', affected;
END $$;

COMMIT;

-- Verification:
-- SELECT sex, count(*) FROM profiles WHERE sex IS NOT NULL GROUP BY sex;
-- Expected: only 'male' and 'female' (lowercase) plus any unrecognized values left untouched.
