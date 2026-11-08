-- Schema Cleanup: Drop stale columns from profiles table
-- Spec: full-platform-remediation-2026-07, Phase 5, Task 5.2
-- Context: These columns were flagged in backend/apps/common/legacy_columns.py
-- with a sunset date. They have zero runtime references in active code:
--   - refresh_token_hash: replaced by Redis JTI blacklisting
--   - failed_login_attempts: replaced by DRF throttle classes
--   - locked_until: replaced by DRF throttle classes
-- Verified via grep: no ORM filter/annotation/access in backend/apps/ (excluding tests).
-- Rollback: backend/scripts/schema_cleanup_drop_stale_columns_rollback.sql
-- migration:allow-non-additive: reviewed sunset of 3 unused profile columns (refresh_token_hash, failed_login_attempts, locked_until); zero runtime refs, rollback script present. Lets the standard runner apply this one file without disabling the additive-only guard for the rest of the run (finding F3).

ALTER TABLE profiles DROP COLUMN IF EXISTS refresh_token_hash;
ALTER TABLE profiles DROP COLUMN IF EXISTS failed_login_attempts;
ALTER TABLE profiles DROP COLUMN IF EXISTS locked_until;
