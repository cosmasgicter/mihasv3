# Bugfix Design Document

## Overview

This design eliminates two real drift defects surfaced by the live Neon
alignment audit, both isolated to the jobs-ops domain. Neither touches the
already-aligned admissions surfaces (frontend↔backend canonical drift guards,
admissions backend↔DB mapping, FK index coverage), all of which are treated as
preservation targets.

The fix is **code + drift-checker configuration only**. It ships **no schema
migration**, sets **no feature flag**, and applies **no destructive script**.
Rollback is a plain code revert.

| Defect | Root cause | Chosen fix |
|--------|-----------|------------|
| 1 — jobs-ops ORM endpoints raise `ProgrammingError` → HTTP 500 | A few authenticated `jobs` views query `managed=False` models whose tables do not exist in the live DB | Graceful degradation in the ORM-touching handlers, forward-compatible with future real persistence |
| 2 — `check_schema_drift` reports two scripts as `STALE_UNRECORDED_MIGRATION` | A bootstrap snapshot and a future-scheduled destructive drop are committed >7 days ago but (correctly) absent from `migration_history` | Declarative, exact-filename exemption set in the checker — never inserts the scripts, never applies them |

## Glossary

| Term | Meaning |
|------|---------|
| `managed=False` model | A Django model whose table is NOT created/altered by `migrate`; schema is owned by hand-written SQL in `backend/scripts/` (see `docs/schema-ownership.md`). |
| Scaffold / seed data | Static sample payloads served by `apps.common.jobs_ops_seed` while a domain's real persistence is unbuilt. |
| Graceful degradation | Catching the missing-table error and falling back to seed data or a skipped write, never raising an unhandled 500. |
| Coverage exemption | An explicit, exact-filename allowlist telling the drift checker a script is intentionally absent from `migration_history`. |
| Drift guard | A CI-blocking test that fails when two sources of truth diverge (`docs/canonical-truth-map.md`). |

## Bug Details

Both defects live in the jobs-ops domain and were found by running
`check_schema_drift --strict --check-fk-indexes --check-migration-history-coverage`
against the live Neon database (project `wild-bar-37055823`, branch
`br-floral-scene-aha2ybfd`).

### Defect 1 — ORM queries against non-existent tables (HTTP 500)

`backend/apps/jobs/models.py` declares 28 `managed = False` models (e.g.
`JobPosting → jobs_postings`, `JobMatchScore → jobs_match_scores`,
`JobApplication → job_applications`). None of these tables exist in the live
Neon database — they are scaffold models for a not-yet-provisioned domain.

Most jobs-ops views safely serve seed data from `apps.common.jobs_ops_seed`. The
leak is in `backend/apps/jobs/views.py`:

- `JobScoreView.post` → `JobPosting.objects.select_related('company','source').get(id=job_id)` then `JobMatchScore.objects.update_or_create(...)` (bugfix.md 1.1, 1.2).
- `JobTailorDocumentsView.post` → `JobPosting.objects.select_related('company','source').get(id=job_id)` (bugfix.md 1.3).
- `JobApplicationListCreateView.get_queryset` / `JobApplicationDetailView.get_queryset` → `JobApplication.objects.select_related('job_posting','candidate')` (bugfix.md 1.4 — latent; the `get()` handlers serve seed data and never evaluate these querysets today).

When the first three run against the live DB, Postgres raises
`ProgrammingError: relation "<table>" does not exist`, surfacing as an unhandled
HTTP 500.

### Defect 2 — migration_history coverage gaps

`check_schema_drift --check-migration-history-coverage` flags every top-level
`backend/scripts/*.sql` forward script committed more than `--commit-window-days`
(default 7) ago with no row in `migration_history`. Two scripts trip it
(bugfix.md 1.5–1.7):

- `00_full_schema.sql` — a canonical **full-schema bootstrap snapshot** (`docs/canonical-truth-map.md` marks it `TODO: pg_dump from prod`), not an incremental applied migration.
- `legacy_columns_drop_2026_08_15.sql` — a **Day-90 future-scheduled destructive drop** (`docs/runbooks/legacy-column-deprecation.md`) that must NOT be applied yet.

## Expected Behavior

- `POST /api/v1/jobs/{id}/score/`, `POST /api/v1/jobs/{id}/tailor-documents/`, and the `JobApplication` queryset paths must never raise an unhandled `ProgrammingError`. Status codes stay within `{200, 202, 400, 404}` (bugfix.md 2.1–2.4).
- `check_schema_drift --check-migration-history-coverage` must not report the two exempt scripts as stale, and must achieve this **without applying them** — exiting zero with the clean `OK: schema-drift=<n> fk-indexes=<m> migration-history=<k>` line when no genuine drift remains (bugfix.md 2.5–2.7).
- Everything currently aligned stays aligned (bugfix.md 3.1–3.8): seed-backed reads, scaffold actions, the 32 frontend↔backend drift guards, admissions zero-drift, clean FK indexes, recorded backfills, continued detection of genuinely stale migrations, and the unapplied Day-90 drop.

## Hypothesized Root Cause

### Defect 1

The jobs-ops domain was built as a seed-backed scaffold (per `product.md`, it is
a real operator dashboard whose backend persistence "remains to be completed").
The list/detail handlers correctly serve seed data, but `JobScoreView` and
`JobTailorDocumentsView` were written assuming the `jobs_postings` /
`jobs_match_scores` tables would exist, and they query the ORM directly. Because
those `managed=False` tables were never provisioned in any live environment, the
ORM calls hit non-existent relations. The two `get_queryset` methods are the same
mistake caught one step earlier — they are defined but not yet evaluated.

The neighbouring code already shows the correct pattern: `JobDetailView.get`
returns `sample_job_detail(job_id)` (never 404s, falls back to a sample), and
`ai_service.py` is explicitly best-effort (returns `None` on failure; callers
treat `None` as "AI unavailable, degrade"). The outlier write/score paths simply
did not adopt it.

### Defect 2

The migration-history coverage check assumes every top-level forward script is an
incremental migration that should eventually be recorded in `migration_history`.
That assumption does not hold for a full-schema snapshot (`00_full_schema.sql`)
or a deliberately-deferred destructive drop (`legacy_columns_drop_2026_08_15.sql`).
The checker has subdirectory exclusions (`applied/`, `archive/`, `migrations/`)
and a `_rollback.sql` filter, but no concept of a top-level script that is
legitimately never recorded. That missing concept is the root cause.

## Correctness Properties

Derived from `bugfix.md`. **F** = unfixed behavior, **F'** = fixed behavior.
`isBugCondition_orm(X)` = a request to `jobs score` / `tailor-documents`, or
evaluation of the two `JobApplication` querysets. `isBugCondition_migration(S)` =
filename in `{00_full_schema.sql, legacy_columns_drop_2026_08_15.sql}`.

Property 1: Fix-Checking (ORM) — no unhandled relation-missing 500.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

```pascal
FOR ALL X WHERE isBugCondition_orm(X) DO
  result <- F'(X)
  ASSERT NOT raises_unhandled(result, ProgrammingError "relation does not exist")
  ASSERT http_status(result) IN {200, 202, 400, 404}
END FOR
```

Property 2: Migration exemption — exempt scripts are neither flagged nor applied.

**Validates: Requirements 2.5, 2.6, 2.7**

```pascal
FOR ALL S WHERE isBugCondition_migration(S) DO
  findings <- F'(check_migration_history_coverage)
  ASSERT S.name NOT IN findings.stale_unrecorded
  ASSERT NOT applied_to_database(S)
END FOR
```

Property 3: Preservation (ORM) — non-bug requests are byte-identical.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

```pascal
FOR ALL X WHERE NOT isBugCondition_orm(X) DO
  ASSERT F(X) = F'(X)            // seed reads, scaffold actions, envelopes
END FOR
```

Property 4: Preservation (migration) — real drift still caught, recorded scripts still clean.

**Validates: Requirements 3.6, 3.7, 3.8**

```pascal
FOR ALL S WHERE NOT isBugCondition_migration(S) DO
  ASSERT F(check_coverage, S) = F'(check_coverage, S)
END FOR
```

## Fix Implementation

The fix is code-only, plus one canonical-truth-map registration. No schema
migration ships.

### Chosen approach vs rejected alternatives

**Defect 1 — graceful degradation, forward-compatible (chosen).** Resolve the
`JobPosting` through a guard helper that returns `None` when the table is absent,
fall back to the existing seed source, and make the match-score write
best-effort. When the tables are later provisioned with real rows, the *same*
code path uses the ORM instance and persists — no second rewrite.

- *Rejected — provision the 28 tables now.* Adds no real data; the endpoints would `404` against empty tables instead of `500`; commits a speculative schema surface and a 28-table forward+rollback migration purely to satisfy a checker. The helper design keeps this path open for later.

**Defect 2 — declarative exemption set (chosen).** An exact-filename `frozenset`
in the checker, mirroring `_EXCLUDED_MIGRATION_SUBDIRS`, skipped inside
`_find_stale_unrecorded_migrations`.

- *Rejected — insert rows into `migration_history`.* Misleading for the snapshot, dangerous for the drop (implies it ran). *Rejected — widen `--commit-window-days`.* Masks genuinely stale scripts. *Rejected — move files into an excluded subdir.* They are legitimate top-level canonical artifacts.

### New file: `backend/apps/jobs/_persistence.py`

```python
"""Persistence guards for jobs-ops scaffold endpoints.

The jobs-ops domain models are managed=False and their tables are not yet
provisioned in every environment. These helpers let endpoints use the ORM
when the tables exist and degrade gracefully (return None / skip the write)
when they do not — never raising an unhandled ProgrammingError.
"""
import logging
from django.db import OperationalError, ProgrammingError
from apps.jobs.models import JobPosting, JobMatchScore

logger = logging.getLogger(__name__)


def resolve_job_posting(job_id):
    """Return the JobPosting instance, or None when the row/table is absent.

    Catches the not-yet-provisioned table case (ProgrammingError /
    OperationalError) and the not-found case (DoesNotExist) uniformly so
    callers can fall back to seed data. Never raises, never logs PII.
    """
    try:
        return JobPosting.objects.select_related("company", "source").get(id=job_id)
    except (ProgrammingError, OperationalError):
        logger.debug("jobs_postings table unavailable; degrading to seed path")
        return None
    except JobPosting.DoesNotExist:
        return None


def persist_match_score_safe(*, job_posting, candidate, defaults) -> bool:
    """Best-effort JobMatchScore upsert. Returns True on write, False if skipped.

    Skips silently when the jobs_match_scores table is absent so AI scoring
    still returns a result to the operator. Never raises.
    """
    try:
        JobMatchScore.objects.update_or_create(
            job_posting=job_posting, candidate=candidate, defaults=defaults
        )
        return True
    except (ProgrammingError, OperationalError):
        logger.debug("jobs_match_scores table unavailable; skipping persistence")
        return False
```

### Change: `backend/apps/jobs/views.py`

`JobScoreView.post`:

- Replace `JobPosting.objects...get(id=job_id)` + bare `DoesNotExist` 404 with `job = resolve_job_posting(job_id)`.
- Build `job_data` from the ORM instance when `job is not None`; otherwise from `sample_job_detail(str(job_id))` (consistent with `JobDetailView`, which never 404s). This removes the unconditional 404 path — the endpoint always has a job to score, matching the seed-backed contract of the domain.
- Call `score_job_match(job_data, candidate_data)` unchanged.
- On AI success, attempt persistence **only when a real instance was resolved**, via `persist_match_score_safe(job_posting=job, candidate=request.user, defaults={...})`. When degraded (`job is None` or write skipped), return the AI result without persisting.
- Preserve the existing "AI unavailable → 202 pending" branch (`self.build_response(...)`).

`JobTailorDocumentsView.post`:

- Replace the ORM `get()` + 404 with `resolve_job_posting(job_id)` + seed fallback for `job_data`.
- Preserve the existing `resume_text` required → 400 branch and the AI-unavailable → 202 pending branch. No persistence write here.

`JobApplicationListCreateView.get_queryset` / `JobApplicationDetailView.get_queryset`:

- **Unchanged signature and body.** They return a *lazy* `JobApplication.objects.select_related('job_posting','candidate')...` queryset. Django builds this without touching the DB, so `test_query_optimization.py` (which inspects `qs.query.select_related` without evaluating) stays green.
- **Invariant (documented, test-enforced):** no jobs GET/POST handler may *evaluate* these querysets while the backing table is absent. The GET handlers continue to serve seed data. A regression test asserts the list/detail GET endpoints return HTTP 200 seed payloads without raising.

`ai_service.py` is unchanged.

### Change: `backend/apps/common/management/commands/check_schema_drift.py`

Add a module-level exemption set near `_EXCLUDED_MIGRATION_SUBDIRS`:

```python
# Top-level scripts that are intentionally NOT in migration_history and must
# NOT be reported as stale, because recording them would be misleading or
# dangerous. Exact-filename match so this can never mask a genuinely stale
# script with a different name (preserves real-drift detection, R3.7).
_COVERAGE_EXEMPT_SCRIPTS: frozenset[str] = frozenset({
    "00_full_schema.sql",                 # full-schema bootstrap snapshot, not an incremental migration
    "legacy_columns_drop_2026_08_15.sql", # Day-90 future-scheduled destructive drop — must stay unapplied
})
```

In `_find_stale_unrecorded_migrations`, after enumerating scripts:

```python
for path in scripts:
    if path.name in _COVERAGE_EXEMPT_SCRIPTS:
        continue
    if path.name in recorded:
        continue
    ...
```

**Success-line count semantics:** exempt scripts remain *enumerated* (still
counted in the `migration-history=<k>` inspected total) but are excluded from the
gap list only. Stated in the helper docstring so the count stays meaningful
("inspected N, all covered or exempt").

### Change: `docs/canonical-truth-map.md`

Register the exemption set as a source of truth in the "Database Schema" row, per
the map's "add a new domain concept" rule:

> Migration-history coverage exemptions | `check_schema_drift.py:_COVERAGE_EXEMPT_SCRIPTS` | drift guard `test_migration_history_coverage_exemptions`

## Testing Strategy

### Backend unit tests (`backend/tests/unit/`)

| Test | Asserts | Property / clause |
|------|---------|-------------------|
| `test_jobs_score_endpoint_no_table` | score endpoint returns 200 (AI result) or 202 (pending), never 500, when `resolve_job_posting` yields `None`/`ProgrammingError` | P1 / 2.1, 2.2 |
| `test_jobs_tailor_endpoint_no_table` | tailor endpoint returns 200/202/400, never 500, with missing table | P1 / 2.3 |
| `test_persist_match_score_safe_missing_table` | returns `False`, does not raise, when `jobs_match_scores` absent | P1 / 2.2 |
| `test_resolve_job_posting_fallback` | returns `None` on `ProgrammingError`/`DoesNotExist` | P1 / 2.1 |
| `test_jobs_score_persists_when_table_present` | with a real instance + AI success, `persist_match_score_safe` is called (forward-compat) | P1 / 2.2 |
| `test_migration_coverage_exempts_known_scripts` | the two exempt scripts are not reported stale; neither is applied | P2 / 2.5, 2.6, 2.7 |
| `test_migration_coverage_still_flags_real_stale` | a synthetic genuinely-stale non-exempt script IS reported `STALE_UNRECORDED_MIGRATION` and fails | P4 / 3.7 |
| `test_jobs_seed_reads_unchanged` | `GET /api/v1/jobs/`, `/{id}/`, `/job-applications/`, `/{id}/` return 200 seed envelopes without raising | P3 / 3.1 |

### Property tests (`backend/tests/property/`)

- **P1 Fix-Checking (ORM):** ∀ X in `isBugCondition_orm` → no unhandled `ProgrammingError`; status ∈ `{200, 202, 400, 404}`.
- **P2 Migration exemption:** ∀ S in `isBugCondition_migration` → not flagged AND `not applied_to_database(S)`.
- **P3/P4 Preservation:** seed-backed reads, scaffold actions, and `{"success": true, "data": ...}` envelopes unchanged; recorded backfills still clean; FK index check clean; admissions zero missing-column drift; real stale migrations still flagged.

### Preserved existing suites (must stay green)

- `backend/tests/unit/test_query_optimization.py` — `get_queryset` `select_related` inspection (signature unchanged).
- `backend/tests/unit/test_jobs_ops_endpoints.py`, `test_view_auth_classification.py`.
- The 32 frontend↔backend canonical drift guards in `apps/admissions/tests/unit/` (status, payment mapping, payment error codes, error codes, roles, sanitizer, submission gates).

## Verification and Rollout

1. Affected backend suites: `cd backend && python3 -m pytest tests/unit/test_jobs* tests/unit/test_query_optimization.py tests/unit/test_schema_drift* tests/property/` (plus the new tests).
2. Re-run the frontend canonical drift guards to confirm no regression.
3. **Live re-verification (read-only)** against Neon `wild-bar-37055823`:
   `check_schema_drift --strict --check-fk-indexes --check-migration-history-coverage`. Expected after fix:
   - No `STALE_UNRECORDED_MIGRATION` / `UNTRACKED_MIGRATION_SCRIPT` lines for the two exempt scripts.
   - FK index check stays clean; admissions models stay zero-drift.
   - The `--strict` "Missing tables (28)" warning for jobs-ops scaffold tables **remains and is expected/acceptable** — the checker fails only on missing *columns* of existing tables, FK-index gaps, or stale migrations, none of which now apply. The 28 tables are intentionally absent (`managed=False` scaffold) and no longer a 500 risk because the ORM endpoints degrade gracefully. The design does not aim to remove that warning.

**Rollout:** code-only, no schema change, no migration, no feature flag.
**Rollback:** revert the commit (delete `_persistence.py`, restore the two view
handlers, remove `_COVERAGE_EXEMPT_SCRIPTS`, revert the canonical-truth-map row).

## Why This Is the Smallest Correct Fix

- Removes every unhandled-500 path the audit found without provisioning speculative schema.
- Forward-compatible: provisioning the jobs-ops tables later (with real data) upgrades the same code path to real persistence with no further change.
- Keeps the drift checker honest — exempting only two exact, documented filenames, so genuine stale-migration detection (P4 / R3.7) is fully preserved.
- Ships zero schema mutation, honoring the managed=False migration policy and the hard constraint that `legacy_columns_drop_2026_08_15.sql` stays unapplied.
