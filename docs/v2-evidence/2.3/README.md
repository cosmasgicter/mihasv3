# Task 2.3 — Make tenant host resolution fail closed (Required_Evidence)

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec: `admissions-v2-canonical-rebuild` · Requirements: **R2.2–R2.4, R5.2–R5.3** ·
Findings: **TEN-09, TEN-10, STU-24**

Candidate commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
Schema hash: **N/A** — this task changes no schema and no backend API surface.

## Scope

Task 2.3 has three sub-goals, all of which the production resolver already
implements in the working tree. This task supplies the Required_Evidence
("tenant A/B host, query override, cache, and unknown-host tests") and corrects
one stale test that still encoded the pre-TEN-10 behavior.

| Sub-goal | Canonical mechanism (unchanged production code) |
|---|---|
| Prevent explicit institution filters from overriding a trusted tenant host | `OfferingDirectoryService.resolved_institution_id` returns the host-resolved tenant whenever `portal_context.institution` is set; the `?institution=` selector is never consulted in that branch. |
| Permit explicit selection only on registered neutral shared-portal queries | Selector honored **iff** no trusted host **and** endpoint ∈ `EXPLICIT_INSTITUTION_SELECTION_ENDPOINTS` (`canonical_programs`, `assignment_preview`) **and** `InstitutionContextService.is_registered_shared_portal_host(host)` (the `SHARED_PORTAL_HOSTS` allowlist). |
| Partition caches and background task context by canonical institution ID | Catalog cache scope signature (`_catalog_scope_signature` → `catalog_institution_scope(id)`) keys on the resolved host tenant / honored selection; a conflicting `?institution=` on a trusted host never repartitions. Background tasks carry the canonical institution id on the record they process and have no host/query, so any per-institution cache/context is keyed by that canonical id. |

## What shipped

**No production code changed.** Task 2.3 is evidence-and-test work on top of the
already-implemented fail-closed resolver:

| Change | File |
|---|---|
| Corrected stale test that asserted the pre-TEN-10 "explicit selector wins over resolved host" behavior (it failed against the fail-closed resolver). Renamed to `test_resolved_institution_id_trusted_host_wins_and_fails_closed` and inverted to the canonical behavior. | `backend/tests/property/test_offering_visibility.py` |
| **New** — fail-closed resolution property (200 examples) + background-task-context partition property (200 examples). | `backend/tests/property/test_tenant_host_query_override.py` |
| **New** — end-to-end acceptance scenario through the real `GET /api/v1/catalog/canonical-programs/` endpoint: tenant A/B host, query override rejected, shared-portal explicit selection, unknown-host fail-closed, and cache-scope partition. | `backend/tests/unit/test_scenario_query_override_fail_closed.py` |

## Evidence artifacts

| Artifact | Purpose |
|---|---|
| `pytest-output.txt` | Raw commands + pass/fail record for the required suite and the domain regression sweep. |
| `fail-closed-summary.json` | Structured sub-goal → mechanism → test mapping and result counts. |

## Verification (real repo commands)

```
cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest \
  tests/property/test_tenant_host_query_override.py \
  tests/unit/test_scenario_query_override_fail_closed.py \
  "tests/property/test_offering_visibility.py::TestOfferingVisibilityExamples::test_resolved_institution_id_trusted_host_wins_and_fails_closed" -v
# 12 passed
```

Domain regression sweep (offering visibility, institution context, domain
fail-closed, domain routing scenario, catalog cache, cross-tenant cache
isolation, tenant isolation scenario, plus the two new modules):

```
# 60 passed, 0 failed, 0 skipped
```

## What was verified vs not

- **Verified:** trusted host wins over any conflicting `?institution=` selector
  (TEN-10) at both the service layer and through the real catalog endpoint;
  explicit selection honored only on the allow-listed endpoints served from a
  registered neutral shared-portal host; unknown/unregistered hosts never become
  tenant selectors; the catalog cache scope never repartitions off a trusted
  host under a query override; background-task per-institution context is
  partitioned by canonical institution id with no cross-serve. All on the SQLite
  fast suite with **zero required skips** (R1.4).
- **Not run here:** Postgres-only DB-constraint checks (unrelated to resolution
  behavior) and the browser E2E harness. No schema or OpenAPI change was made, so
  neither a Neon branch nor a schema regeneration was required for this task.
