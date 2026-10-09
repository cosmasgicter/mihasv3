-- Rollback for 2026_08_06_01_admin_saved_filters.sql (admissions-v2 task 9.1).
--
-- The forward migration is purely additive: it creates one new table and its
-- indexes and touches nothing that existed before. The rollback is therefore a
-- clean drop — no other table references admin_saved_filters, so removing it
-- cannot orphan or corrupt anything.
--
-- WHAT IS LOST: operators' named applications views. Those are convenience
-- records, not admissions data — no application, payment, document, or audit row
-- lives here, and the roster works identically without them (the frontend falls
-- back to unsaved filters). Nothing else in the platform reads this table.
--
-- Per the repository's infrastructure rules a rollback is still an operator
-- step: prove it on Neon first, take a backup, and never run it as the first
-- action on production.

DROP INDEX IF EXISTS idx_admin_saved_filters_institution;
DROP INDEX IF EXISTS idx_admin_saved_filters_owner_updated;
DROP INDEX IF EXISTS uq_admin_saved_filters_owner_name;
DROP TABLE IF EXISTS admin_saved_filters;
