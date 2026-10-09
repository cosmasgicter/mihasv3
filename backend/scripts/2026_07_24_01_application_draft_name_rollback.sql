-- Rollback for 2026_07_24_01_application_draft_name.sql (admissions-v2 task 6.2).
--
-- CONTRACT phase. Drops the additive ``applications.draft_name`` label column.
-- Safe to run only after every client stops reading/writing ``draft_name`` and
-- the canonical draft-start/rename paths are rolled back. Idempotent
-- (DROP COLUMN IF EXISTS). No data is migrated out — ``draft_name`` is an
-- optional cosmetic label, not authority.

ALTER TABLE applications
    DROP COLUMN IF EXISTS draft_name;
