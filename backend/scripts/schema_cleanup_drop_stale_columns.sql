-- Schema Cleanup: Drop stale columns from profiles table
-- Spec: full-platform-remediation-2026-07, Phase 5, Task 5.2
-- Context: These columns were flagged in backend/apps/common/legacy_columns.py
-- with a sunset date. They have zero runtime references in active code:
--   - refresh_token_hash: replaced by Redis JTI blacklisting
--   - failed_login_attempts: replaced by DRF throttle classes
--   - locked_until: replaced by DRF throttle classes
-- Verified via grep: no ORM filter/annotation/access in backend/apps/ (excluding tests).
-- Rollback: backend/scripts/schema_cleanup_drop_stale_columns_rollback.sql

ALTER TABLE profiles DROP COLUMN IF EXISTS refresh_token_hash;
ALTER TABLE profiles DROP COLUMN IF EXISTS failed_login_attempts;
ALTER TABLE profiles DROP COLUMN IF EXISTS locked_until;
