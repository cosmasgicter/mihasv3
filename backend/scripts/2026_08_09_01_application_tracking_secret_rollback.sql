-- Rollback for 2026_08_09_01_application_tracking_secret.sql
-- (admissions-v2 task 10.5).
--
-- CONTRACT phase. Drops the partial unique index and the four additive
-- ``applications`` tracking-secret columns. Idempotent (DROP ... IF EXISTS).
--
-- Safe to run only after the code that reads them is rolled back — i.e. after
-- ``apps/applications/tracking_secret.py``, ``ApplicationTrackView``'s secret
-- path, and ``ApplicationTrackingLinkView`` are gone. Running it while that code
-- is live turns every public tracking lookup into a ``ProgrammingError``, not a
-- graceful degradation.
--
-- No data is migrated out, and nothing is lost that could have been kept: the
-- only irreversible content here is a set of SHA-256 hashes whose plaintexts the
-- platform never held. Dropping them revokes every issued tracking link, which
-- is the intended meaning of rolling this back. ``application_number`` and
-- ``public_tracking_code`` are untouched by both directions.

DROP INDEX IF EXISTS uq_applications_tracking_selector;

ALTER TABLE applications
    DROP COLUMN IF EXISTS tracking_secret_revoked_at;

ALTER TABLE applications
    DROP COLUMN IF EXISTS tracking_secret_issued_at;

ALTER TABLE applications
    DROP COLUMN IF EXISTS tracking_secret_hash;

ALTER TABLE applications
    DROP COLUMN IF EXISTS tracking_selector;
