-- ROLLBACK for 2026_07_25_01_canonical_subject_catalog.sql
-- Admissions V2 — task 7.1 (canonical subject catalogue).
--
-- Data-correction rollback policy
-- -------------------------------
-- The forward migration does three things, none of which can be safely undone
-- without restoring the database from its pre-migration backup:
--
--   1. Catalogue upsert (names/categories/is_core/is_active/curriculum_type on
--      the canonical codes) — reversible in effect but not in content: the
--      previous values were the pre-7.1 drifted values (title-case categories,
--      PHYS.is_core = true). Restoring drift is not a desirable rollback, so this
--      file leaves the canonical rows canonical.
--   2. Reference repointing (application_grades / course_requirements moved off
--      ADD_MATH / MUS / PHYS) — NOT reversible per row: after the move there is
--      no record of which rows came from which duplicate. Rolling this back is a
--      restore-from-backup operation (deploy/backup-db.sh), not a script.
--   3. Deactivation of the three duplicate rows — technically reversible, but
--      reactivating them deliberately restores the duplicate-identity defect
--      that let four real subjects satisfy a five-subject readiness rule.
--
-- The corrected catalogue and references therefore remain intact. The only
-- inverse-additive operation is removing this script's migration-history marker,
-- which lets the idempotent forward correction be re-applied after an application
-- rollback. Reverting the corrected data itself is backup/restore work.

BEGIN;

DELETE FROM migration_history
WHERE migration_name = '2026_07_25_01_canonical_subject_catalog.sql';

COMMIT;
