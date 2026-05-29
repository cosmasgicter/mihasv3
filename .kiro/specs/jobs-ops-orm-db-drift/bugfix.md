# Bugfix Requirements Document

## Introduction

A full alignment audit of the MIHAS platform against the live Neon production
database (project `mihasApplication`, id `wild-bar-37055823`, Postgres 17,
branch `br-floral-scene-aha2ybfd`) surfaced two distinct drift defects in the
jobs-ops domain. Both are real divergences between the code's assumptions and
the actual database state, and both are currently latent — they do not affect
the passing frontend↔backend canonical drift guards or the admissions
backend↔DB alignment, all of which remain correct and must stay correct.

**Defect 1 — jobs-ops ORM queries against non-existent tables.**
28 jobs-ops models across `backend/apps/jobs/models.py`, `outreach/models.py`,
`automation/models.py`, `integrations/models.py`, and `analytics/models.py` are
declared `managed = False`, but their backing tables (e.g. `jobs_postings`,
`jobs_match_scores`, `job_applications`, `outreach_contacts`, `automation_rules`,
`integration_accounts`, `analytics_snapshots`) do not exist in the live Neon
database. Most jobs-ops views safely serve seed data from
`apps.common.jobs_ops_seed`, but a small number of authenticated endpoints in
`backend/apps/jobs/views.py` issue ORM queries directly. When invoked, those
queries raise `ProgrammingError: relation "<table>" does not exist`, which
surfaces as an HTTP 500 in production. The affected endpoints are:

- `JobScoreView.post` — `POST /api/v1/jobs/{job_id}/score/` — queries
  `JobPosting.objects.select_related(...).get(id=job_id)` and writes via
  `JobMatchScore.objects.update_or_create(...)`.
- `JobTailorDocumentsView.post` — `POST /api/v1/jobs/{job_id}/tailor-documents/`
  — queries `JobPosting.objects.select_related(...).get(id=job_id)`.
- `JobApplicationListCreateView.get_queryset` and
  `JobApplicationDetailView.get_queryset` reference `JobApplication.objects`.
  These are currently dead code (the `get()` handlers serve seed data), but they
  are latent traps that will 500 if any future handler calls them.

**Defect 2 — migration_history coverage gaps.**
The strict drift checker
(`check_schema_drift --check-migration-history-coverage`) reports two top-level
`backend/scripts/*.sql` scripts committed more than 7 days ago that are absent
from the `migration_history` table, producing `STALE_UNRECORDED_MIGRATION`
findings and a non-zero exit:

- `00_full_schema.sql` — a canonical bootstrap placeholder
  (`docs/canonical-truth-map.md` "Database Schema" row marks it
  `TODO: pg_dump from prod`); it is not an applied migration.
- `legacy_columns_drop_2026_08_15.sql` — a Day-90 future-scheduled destructive
  drop migration (`docs/runbooks/legacy-column-deprecation.md`) that must NOT be
  applied yet.

The fix must let the checker report a clean "no drift" result for these two
files without prematurely applying the future-dated destructive migration.

This document defines the bug conditions, the current (defective) versus
expected (correct) behavior, and the existing aligned behavior that must be
preserved (regression prevention). It deliberately does not choose between
candidate fixes; that decision belongs to the design phase. The two candidate
directions for Defect 1 are: (a) provision the missing jobs-ops tables via
forward SQL migrations so the ORM calls have backing tables, or (b) make the
ORM-querying endpoints degrade gracefully (guard against missing tables and fall
back to seed data or a 202-pending response) so they cannot 500.

## Bug Analysis

### Current Behavior (Defect)

What currently happens when each bug is triggered.

1.1 WHEN an authenticated operator calls `POST /api/v1/jobs/{job_id}/score/` (`JobScoreView.post`) THEN the system queries `JobPosting.objects.select_related('company', 'source').get(id=job_id)` against the non-existent `jobs_postings` table and raises `ProgrammingError: relation "jobs_postings" does not exist`, returning HTTP 500.

1.2 WHEN AI scoring succeeds inside `JobScoreView.post` and the system calls `JobMatchScore.objects.update_or_create(...)` THEN the write targets the non-existent `jobs_match_scores` table and raises `ProgrammingError: relation "jobs_match_scores" does not exist`, returning HTTP 500.

1.3 WHEN an authenticated operator calls `POST /api/v1/jobs/{job_id}/tailor-documents/` (`JobTailorDocumentsView.post`) THEN the system queries `JobPosting.objects.select_related('company', 'source').get(id=job_id)` against the non-existent `jobs_postings` table and raises `ProgrammingError: relation "jobs_postings" does not exist`, returning HTTP 500.

1.4 WHEN any caller invokes `JobApplicationListCreateView.get_queryset` or `JobApplicationDetailView.get_queryset` THEN the system evaluates `JobApplication.objects.select_related('job_posting', 'candidate')` against the non-existent `job_applications` table and would raise `ProgrammingError: relation "job_applications" does not exist` (currently a latent trap, since the `get()` handlers serve seed data instead).

1.5 WHEN `check_schema_drift --check-migration-history-coverage` runs against the live database THEN the system emits `STALE_UNRECORDED_MIGRATION: 00_full_schema.sql committed=<iso8601>` because the top-level bootstrap placeholder script committed more than 7 days ago has no row in `migration_history`.

1.6 WHEN `check_schema_drift --check-migration-history-coverage` runs against the live database THEN the system emits `STALE_UNRECORDED_MIGRATION: legacy_columns_drop_2026_08_15.sql committed=<iso8601>` because the future-scheduled destructive drop script committed more than 7 days ago has no row in `migration_history`.

1.7 WHEN the migration-history coverage check reports the two findings above THEN the system exits non-zero, blocking the clean "no drift" signal even though no real schema action is pending.

### Expected Behavior (Correct)

What should happen instead, for each corresponding condition above.

2.1 WHEN an authenticated operator calls `POST /api/v1/jobs/{job_id}/score/` (`JobScoreView.post`) THEN the system SHALL respond without raising an unhandled `ProgrammingError` — either by querying a provisioned `jobs_postings` table successfully, or by detecting the missing table and degrading gracefully (seed-backed result, a documented 404 for an unknown job, or a 202-pending response).

2.2 WHEN AI scoring succeeds inside `JobScoreView.post` THEN the system SHALL persist or skip the match-score write without raising an unhandled `ProgrammingError` — either by writing to a provisioned `jobs_match_scores` table, or by skipping persistence gracefully while still returning a successful scoring response to the operator.

2.3 WHEN an authenticated operator calls `POST /api/v1/jobs/{job_id}/tailor-documents/` (`JobTailorDocumentsView.post`) THEN the system SHALL respond without raising an unhandled `ProgrammingError` — either by querying a provisioned `jobs_postings` table successfully, or by detecting the missing table and degrading gracefully (seed-backed result, documented 404, or 202-pending response).

2.4 WHEN `JobApplicationListCreateView.get_queryset` or `JobApplicationDetailView.get_queryset` is invoked THEN the system SHALL NOT raise an unhandled `ProgrammingError` — either the `job_applications` table SHALL be provisioned, or the queryset path SHALL be guarded so it cannot reach a non-existent table.

2.5 WHEN `check_schema_drift --check-migration-history-coverage` runs against the live database THEN the system SHALL NOT report `00_full_schema.sql` as a `STALE_UNRECORDED_MIGRATION`, via an explicit classification or recorded exemption that marks it as a non-applied bootstrap placeholder.

2.6 WHEN `check_schema_drift --check-migration-history-coverage` runs against the live database THEN the system SHALL NOT report `legacy_columns_drop_2026_08_15.sql` as a `STALE_UNRECORDED_MIGRATION`, via an explicit classification or recorded exemption that marks it as a future-scheduled migration, WITHOUT the script being applied to the database.

2.7 WHEN the migration-history coverage check runs with no genuine unrecorded migrations present THEN the system SHALL exit zero and emit the clean `OK: schema-drift=<n> fk-indexes=<m> migration-history=<k>` success line.

### Unchanged Behavior (Regression Prevention)

Existing aligned behavior that must be preserved. Everything currently passing in the audit stays passing.

3.1 WHEN an unauthenticated or authenticated client calls the jobs-ops list and detail endpoints (`GET /api/v1/jobs/`, `GET /api/v1/jobs/{job_id}/`, `GET /api/v1/job-applications/`, `GET /api/v1/job-applications/{application_id}/`) THEN the system SHALL CONTINUE TO serve seed data from `apps.common.jobs_ops_seed` in the existing `{"success": true, "data": ...}` envelope shape.

3.2 WHEN jobs-ops scaffold action endpoints that already return seed/scaffold responses are invoked (e.g. `JobDismissView`, `JobWatchView`, discovery-run endpoints, `JobApplicationSubmit/Pause/Resume/Approve/Reject` views) THEN the system SHALL CONTINUE TO return their current scaffold payloads and status codes unchanged.

3.3 WHEN the frontend↔backend canonical drift-guard suite runs (the 32 tests covering application status enum/transitions, payment status mapping, payment error codes, error code catalog, role hierarchy, sanitizer, and submission gates) THEN the system SHALL CONTINUE TO pass all of them.

3.4 WHEN `check_schema_drift` runs over the admissions core managed=False models in accounts/applications/documents/catalog/common THEN the system SHALL CONTINUE TO report zero missing-column drift.

3.5 WHEN `check_schema_drift --check-fk-indexes` runs against the live database THEN the system SHALL CONTINUE TO report every foreign-key column as covered by a btree index (clean FK index check).

3.6 WHEN the migration-history coverage check evaluates the two backfills committed today (`backfill_application_documents_from_legacy_urls.sql`, `backfill_profiles_sex_lowercase.sql`) THEN the system SHALL CONTINUE TO treat them as recorded in `migration_history` and SHALL NOT report them as stale.

3.7 WHEN the migration-history coverage check encounters a genuinely stale, unrecorded, non-exempt top-level forward migration script THEN the system SHALL CONTINUE TO report it as `STALE_UNRECORDED_MIGRATION` and exit non-zero (the exemption mechanism must not weaken detection of real drift).

3.8 WHEN the platform operates after the fix THEN the system SHALL CONTINUE TO leave `legacy_columns_drop_2026_08_15.sql` unapplied (its Day-90 destructive drops are not executed early) and SHALL CONTINUE TO follow the hand-written SQL migration policy (forward script plus `*_rollback.sql` sibling, recorded in `migration_history`) for any managed=False schema change.

## Bug Condition Derivation

The following structured pseudocode derives the bug conditions and properties
from the requirements above. **F** is the original (unfixed) behavior; **F'** is
the fixed behavior.

### Defect 1 — ORM queries against non-existent tables

```pascal
FUNCTION isBugCondition_orm(X)
  INPUT: X = an inbound request to a jobs-ops endpoint
  OUTPUT: boolean

  // True when the endpoint handler evaluates an ORM query whose
  // managed=False backing table is absent from the live database.
  RETURN  X.endpoint IN {
            "POST /api/v1/jobs/{job_id}/score/",
            "POST /api/v1/jobs/{job_id}/tailor-documents/"
          }
       OR  X.invokes IN {
            "JobApplicationListCreateView.get_queryset",
            "JobApplicationDetailView.get_queryset"
          }
END FUNCTION
```

```pascal
// Property: Fix Checking - no unhandled relation-missing 500
FOR ALL X WHERE isBugCondition_orm(X) DO
  result ← F'(X)
  ASSERT NOT raises_unhandled(result, ProgrammingError "relation does not exist")
  ASSERT http_status(result) IN {200, 202, 400, 404}  // never an un-guarded 500
END FOR
```

### Defect 2 — migration_history coverage gaps

```pascal
FUNCTION isBugCondition_migration(S)
  INPUT: S = a top-level backend/scripts/*.sql forward script
  OUTPUT: boolean

  // True when S is a non-applied / future-scheduled script that is
  // committed > commit_window_days ago and absent from migration_history,
  // yet should NOT be treated as real drift.
  RETURN  S.name IN {
            "00_full_schema.sql",            // bootstrap placeholder
            "legacy_columns_drop_2026_08_15.sql"  // Day-90 scheduled drop
          }
END FUNCTION
```

```pascal
// Property: Fix Checking - exempt scripts are not flagged
FOR ALL S WHERE isBugCondition_migration(S) DO
  findings ← F'(check_migration_history_coverage)
  ASSERT S.name NOT IN findings.stale_unrecorded
  ASSERT NOT applied_to_database(S)   // exemption must not apply the script
END FOR
```

### Preservation goal (both defects)

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_orm(X) DO
  ASSERT F(X) = F'(X)   // seed-backed reads, scaffold actions, envelopes unchanged
END FOR

FOR ALL S WHERE NOT isBugCondition_migration(S) DO
  ASSERT F(check_coverage, S) = F'(check_coverage, S)  // real drift still flagged;
                                                       // recorded backfills still clean
END FOR
```
