-- Admissions V2 — task 10.5 (secure and correct public tracking), hashed
-- tracking secret. EXPAND phase (additive, idempotent).
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/
-- Requirements: R13.12 (public tracking SHALL require a random non-PII tracking
--               secret or a second factor, bind results to trusted tenant
--               context, rate-limit attempts, and share a contract-valid URL;
--               sequential application numbers alone SHALL NOT authorize public
--               disclosure), R2.3-R2.4 (fail closed to neutral context; a
--               trusted tenant host overrides any conflicting explicit filter),
--               R17.2 (never log secrets), R17.7 (rate limits, object-level
--               tenant substitution).
-- Findings:     STU-22 (guessable application numbers used as credentials,
--               unreliable host binding, frontend/backend field drift),
--               TEN-10 (tenant host must win).
-- Design:       design.md §12 — "Public tracking uses a random, revocable,
--               hashed tracking secret and minimal response."
--
-- What this adds
-- --------------
-- Four additive, nullable columns on ``applications`` so public tracking
-- authority is a **random secret the platform stores only as a hash**, instead
-- of an identifier printed on every document.
--
-- Before this migration the only public tracking credentials were:
--
--   * ``applications.application_number`` — ``{CODE}{YEAR}{SEQ5}``, a per-tenant
--     **sequential counter**. Knowing one valid number yields its neighbours,
--     so the whole submitted cohort of a school was enumerable from a single
--     leaked slip. This is the first clause of STU-22.
--   * ``applications.public_tracking_code`` — ``TRK-{CODE}{YEAR}{6 hex}``. The
--     prefix is derivable from the school and the year, leaving 24 bits of
--     entropy (16.7M) behind a guessable stem.
--
-- Both remain in the table and keep every non-authority use they already have
-- (display on slips and letters, admin search, the ``tracking_code`` template
-- variable). What changes is that neither is a **credential** any more.
--
--   * tracking_selector          — the non-secret half of a split token. Random,
--                                  unique, indexed: it is what the lookup runs
--                                  on, so the query plan never depends on the
--                                  secret half and the comparison that does can
--                                  be constant-time in Python.
--   * tracking_secret_hash       — SHA-256 (hex, 64 chars) of the secret half.
--                                  The plaintext is returned to the owner once,
--                                  at issue time, and is never stored, logged,
--                                  or recoverable. A database reader cannot
--                                  track an application.
--   * tracking_secret_issued_at  — when the live secret was issued.
--   * tracking_secret_revoked_at — when it was revoked. Issuing a new link
--                                  revokes the previous one, which is the
--                                  "revocable" half of design §12; a revoked
--                                  secret resolves to the same masked 404 an
--                                  unknown one does.
--
-- Backward compatibility: every column is nullable with no default and no
-- backfill. Legacy rows keep four NULLs, which means exactly "this application
-- has no tracking secret yet" — they stay fully readable by every existing
-- query, and their owner can issue a link at any time through
-- ``POST /api/v1/applications/{id}/tracking-link/``. Nothing is migrated out and
-- no existing column is altered or dropped.
--
-- Online-safety: ADD COLUMN with no default (NULL) is metadata-only on PG 11+.
-- The partial unique index is created on a brand-new, entirely-NULL column, so
-- it builds against zero rows. Every statement is guarded (``IF NOT EXISTS``) so
-- a re-run after a tracking-table wipe converges rather than failing.

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS tracking_selector varchar(16) NULL;

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS tracking_secret_hash varchar(64) NULL;

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS tracking_secret_issued_at timestamptz NULL;

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS tracking_secret_revoked_at timestamptz NULL;

-- The public lookup is "find the one application whose selector is this", and it
-- must not be able to fall back to a scan: an unauthenticated endpoint that
-- sequential-scans ``applications`` is a denial-of-service lever as well as a
-- slow read. Partial (WHERE NOT NULL) so the index holds only issued secrets and
-- the millions of legacy NULL rows cost nothing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_tracking_selector
    ON applications (tracking_selector)
    WHERE tracking_selector IS NOT NULL;

COMMENT ON COLUMN applications.tracking_selector IS
    'Admissions V2 task 10.5 (R13.12, STU-22): non-secret random lookup half of the public tracking token. NULL until a link is issued.';
COMMENT ON COLUMN applications.tracking_secret_hash IS
    'SHA-256 hex of the secret half of the public tracking token. The plaintext is shown to the owner once and never stored — a database reader cannot track an application.';
COMMENT ON COLUMN applications.tracking_secret_issued_at IS
    'When the live public tracking secret was issued.';
COMMENT ON COLUMN applications.tracking_secret_revoked_at IS
    'When the public tracking secret was revoked. Issuing a new link revokes the previous one; a revoked secret resolves to the same masked 404 an unknown one does.';
