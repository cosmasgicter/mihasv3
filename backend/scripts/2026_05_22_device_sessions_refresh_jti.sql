-- Add the missing refresh_jti column and supporting partial index to
-- device_sessions per Requirement 1.3 of the
-- production-schema-reconciliation spec. The DeviceSession Django model
-- (managed=False) already declares this column with max_length=64,
-- null=True; production has been emitting "column does not exist"
-- errors on every refresh-token call until this lands.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Requirements: 1.3
--
-- Fully additive: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- The partial-unique-index style follows the existing payments
-- receipt-number-uniqueness pattern. Using a partial INDEX (not UNIQUE)
-- because an active refresh JTI must be unique per row but reused JTIs
-- across deactivated sessions are tolerated; partial-unique would
-- block the JTI rotation flow.
--
-- Forward-only; the reversible inverse lives in
-- 2026_05_22_device_sessions_refresh_jti_rollback.sql.

ALTER TABLE device_sessions
    ADD COLUMN IF NOT EXISTS refresh_jti VARCHAR(64) NULL;

CREATE INDEX IF NOT EXISTS idx_device_sessions_refresh_jti
    ON device_sessions (refresh_jti)
    WHERE refresh_jti IS NOT NULL;
