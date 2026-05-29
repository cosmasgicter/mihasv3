# fix(jobs-ops): eliminate ORM-vs-missing-table 500s and migration-history drift

## Summary

A full frontend ↔ backend ↔ DB alignment audit against the live Neon database
(`mihasApplication` / `wild-bar-37055823`) using the Neon MCP plus the repo's
own drift-guard machinery surfaced two real, latent drift defects in the
jobs-ops domain. This PR fixes both. **Code-only — no schema migration, no
feature flag, rollback = revert.**

Everything already aligned stayed aligned: the 32 frontend↔backend canonical
drift guards, admissions backend↔DB column mapping, and FK-index coverage.

## What was wrong

1. **ORM queries against non-existent tables (HTTP 500).** `JobScoreView.post`
   and `JobTailorDocumentsView.post` queried `managed=False` models
   (`jobs_postings`, `jobs_match_scores`) whose tables don't exist in the live
   DB, raising `ProgrammingError: relation ... does not exist`. Two
   `JobApplication` `get_queryset` methods were latent traps.

2. **migration-history coverage gaps.** `check_schema_drift
   --check-migration-history-coverage` flagged `00_full_schema.sql` (bootstrap
   snapshot) and `legacy_columns_drop_2026_08_15.sql` (Day-90 scheduled
   destructive drop) as `STALE_UNRECORDED_MIGRATION`, failing the CI
   drift-guard job.

## What changed

- **`backend/apps/jobs/_persistence.py`** (new): `resolve_job_posting()` returns
  the ORM instance when the table exists, else `None`; `persist_match_score_safe()`
  makes the match-score write best-effort. Neither raises.
- **`backend/apps/jobs/views.py`**: both endpoints now resolve via the guards
  and fall back to `sample_job_detail` seed data; persistence only attempted
  when a real instance is resolved. Forward-compatible — when the tables are
  later provisioned, the same path persists. The `get_queryset` methods are
  unchanged (stay lazy + `select_related`, so `test_query_optimization.py`
  stays green).
- **`check_schema_drift.py`**: exact-filename `_COVERAGE_EXEMPT_SCRIPTS` frozenset
  skipped in `_find_stale_unrecorded_migrations` — exempt scripts are never
  flagged, never applied, never recorded. Real-drift detection preserved.
- **`docs/canonical-truth-map.md`**: registered both new invariants.

## Tests

- `backend/tests/unit/test_jobs_orm_degradation.py` — guard + endpoint non-500 behaviour.
- `backend/tests/unit/test_jobs_ops_drift.py` — seed-read invariant + lazy queryset.
- `backend/tests/unit/test_check_schema_drift_migration_history_coverage.py` — exemption + real-drift-still-flagged.
- `backend/tests/property/test_jobs_orm_drift_properties.py` — P1 (no 500) + P3 (preservation).
- `backend/tests/property/test_jobs_migration_exemption_properties.py` — P2 + P4.

## Verification

- New + preserved backend suites: **86 passed, 3 skipped** (FK-index Postgres-only skips).
- `python manage.py check` — no issues.
- Frontend canonical drift guards: **32 passed**.
- **Live Neon (read-only):** `check_schema_drift --check-fk-indexes
  --check-migration-history-coverage` →
  `OK: schema-drift=35 fk-indexes=41 migration-history=13` (exit 0). No stale
  migrations, no missing FK indexes. The CI drift-guard job
  (`.github/workflows/backend-governance.yml`) runs exactly this command.

## Notes

- The `--strict` "Missing tables (28)" warning for the jobs-ops scaffold tables
  is expected and unchanged — neither CI nor container startup uses `--strict`,
  so it was never fatal. The 28 tables remain intentionally absent
  (`managed=False` scaffold) and are no longer a 500 risk.
- `legacy_columns_drop_2026_08_15.sql` remains **unapplied** (Day-90 schedule).

Spec: `.kiro/specs/jobs-ops-orm-db-drift/`
