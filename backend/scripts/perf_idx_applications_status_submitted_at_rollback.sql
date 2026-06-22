-- Rollback sibling for perf_idx_applications_status_submitted_at.sql.
--
-- Spec: .kiro/specs/system-performance-hardening/
-- Requirement: 7 (Database Index Additions)
--
-- The forward script is strictly additive — it only creates the composite
-- index idx_applications_status_submitted_at on applications(status,
-- submitted_at). The inverse is therefore to drop that index. DROP INDEX
-- CONCURRENTLY avoids taking an exclusive lock on the applications table, and
-- IF EXISTS makes the rollback idempotent and safe to re-run. CONCURRENTLY
-- cannot run inside a transaction, so this file is executed in autocommit mode
-- by the same split-phase handling apply_sql_migrations uses for the forward
-- script.
--
-- Rollback siblings are NOT auto-applied by apply_sql_migrations (the runner
-- skips *_rollback.sql); this file exists for the operator-driven rollback
-- path and to satisfy the every-forward-script-has-a-rollback-sibling
-- invariant (production-schema-reconciliation R9.1).

DROP INDEX CONCURRENTLY IF EXISTS idx_applications_status_submitted_at;
