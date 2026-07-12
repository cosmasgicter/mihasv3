-- Schema Cleanup: Add a sensible database-level default to device_sessions.expires_at
-- Spec: full-platform-remediation-2026-07, Phase 5, Task 5.3
-- Context: device_sessions.expires_at has no DB-level default, so any INSERT
-- that omits it gets NULL (effectively an immortal session until the cleanup
-- task sweeps it). A 7-day default matches the refresh token lifetime
-- (settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"] = 7 days) and aligns with
-- cleanup_stale_sessions_task's expectation.
-- Rollback: backend/scripts/schema_cleanup_device_session_default_rollback.sql

ALTER TABLE device_sessions
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');
