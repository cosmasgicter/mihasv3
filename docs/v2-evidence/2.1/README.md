# Task 2.1 — Approved Endpoint Authority Matrix (Required_Evidence)

Spec: `admissions-v2-canonical-rebuild` · Requirement: **R3** (esp. R3.2, R3.6) ·
Findings: **AUTH-01, AUTH-02, AUTH-05, AUTH-07, ADM-05, ADM-06**

This directory is the Required_Evidence for task 2.1: it turns the raw task-0.3
route inventory into an **approved authority matrix** — every backend endpoint
classified into exactly one design §5.2 authority class, with its full
registry-entry shape and object-disclosure policy — plus the generated
allow/deny **case matrix** task 2.2 will enforce.

## What was produced

| Artifact | Purpose |
|---|---|
| `zero-unclassified-endpoint-report.md` / `.json` | **The executable gate.** FAILS unless every live route resolves to a §5.2 authority class (target-seven) or an approved boundary (infra / jobs_ops) — zero routes left in the task-0.3 weak `authenticated` bucket, no registry↔route drift. |
| `authority-matrix.json` / `.csv` | Every live route (the 0.3 catalogue) **extended** with its approved §5.2 entry (auth, capability, tenant object path, state precondition, idempotency, audit event, disclosure) + reconciliation (heuristic vs approved class). |
| `authority-case-matrix.json` | The generated allow/deny cases for the five actors × two institutions (incl. cross-tenant ids) — the test-generation input for task 2.2 (R3.6). |
| `disclosure-policy.json` | The per-class object-disclosure (404 vs non-revealing 403) policy (R3.2). |
| `authority-matrix-summary.json` | Index + counts + generation metadata (commit, timestamp). |
| `pytest-output.txt` | Raw run output of the matrix tests (21 passed). |

Tooling (extends the 0.3 inventory, not a parallel artifact):
- `scripts/authority_matrix_registry.py` — the **approved, human-reviewed**
  per-endpoint registry + per-class disclosure policy + actor contexts.
- `scripts/authority_matrix_v2.py` — generator/gate/case-matrix; reuses
  `inventory_admissions_v2.build_backend_route_catalogue` for the live URLConf walk.
- `backend/tests/unit/test_authority_matrix_v2.py` — the pytest gate (live).
- `backend/tests/property/test_authority_matrix_properties.py` — universal
  authority-model invariants.

## Classification approach

The task-0.3 classifier is a static heuristic: it read `permission_classes` and
scanned the view body, so it left **60** endpoints in a weak `authenticated`
bucket ("authority-matrix assignment pending — task 2.1") and mis-classified
several endpoints whose real authority is decided by a `get_permissions()`
override or an in-body ownership/role check a regex cannot see. Task 2.1
**approves** the matrix by an explicit registry decision per endpoint:

- Every admissions/shared/platform/tenant/public/callback route is an
  **explicit, reviewed registry entry** (path → §5.2 entry). Endpoints whose
  methods carry different authority (public read + capability write) use a
  per-method override.
- Infrastructure (health/schema/docs/root/django-admin) and the separate
  jobs-ops product surface (gated behind `ENABLE_JOBS_OPS_ROUTES`) are
  classified by a **reviewed boundary rule** — they are out of the admissions
  authority model, never left in the weak bucket.
- All capabilities the registry references are validated against the canonical
  `AdminCapabilityService` (17 `platform.*` / 17 `tenant.*`) — no invented
  capabilities (test `test_registry_capabilities_are_canonical`).

Heuristic corrections the approved review made (examples): `LoginView` /
`RefreshView` (tagged `internal_callback` because the module contains "hmac") →
**public**; institution/program/intake CRUD (tagged `tenant_capability`) →
**platform_capability** (institution management is platform authority);
`CommunicationTemplateUpdateView` (`get_permissions()`→`IsAdmin`, invisible to
the scan) → **tenant_capability**.

**60 weak-bucket endpoints resolved · 67 heuristic classes corrected.**

## Per-class object-disclosure / 404-vs-403 policy (R3.2)

| Class | Disclosure policy |
|---|---|
| `public` | No auth; body is public. No existence concern. |
| `owner` | **404 not-found mask** — a request for another user's (or another tenant's) object is indistinguishable from a non-existent one; existence is never confirmed to a non-owner. |
| `reviewer_assignment` | **404 not-found mask** — unassigned / out-of-tenant object is 404. |
| `tenant_capability` | **Scope BEFORE lookup**: out-of-scope (other-tenant) object → indistinguishable **404**; in-scope but missing `tenant.*` capability → **non-revealing 403** (no tenant id/name/count/attribute). |
| `platform_capability` | Missing `platform.*` capability → **non-revealing 403** (platform sees all tenants; no cross-tenant masking). |
| `internal_callback` | Signature/HMAC-verified; **200 on every outcome** so internal state cannot be probed. |
| `infra` / `jobs_ops` | Out of the admissions authority matrix. |

Canonical baseline: `GET /api/v1/applications/{id}/official-documents/…` and
`GET /api/v2/applications/{id}/` already 404-mask non-owners. **AUTH-07** (new,
this task) records that several owner-scoped write endpoints
(`payments/initiate|mobile-money|defer`, `applications/{id}/withdraw|
confirm-enrollment|amendments`) currently return a distinguishable `403`
`NOT_OWNER` instead — task 2.2 aligns them to the 404 mask.

## Endpoint count and breakdown by class

**185** live backend endpoints (full surface, jobs-ops routes enabled) — gate **PASS**:

| Approved class | Count | Kind |
|---|---|---|
| `owner` | 50 | §5.2 target-7 |
| `platform_capability` | 44 | §5.2 target-7 |
| `jobs_ops` | 39 | approved boundary (separate product) |
| `tenant_capability` | 26 | §5.2 target-7 |
| `public` | 15 | §5.2 target-7 |
| `infra` | 8 | approved boundary (infra/meta) |
| `internal_callback` | 3 | §5.2 target-7 |

138 in a §5.2 target class · 47 in an approved boundary · **0 unresolved · 0 weak-bucket · 0 stale**.

## How the zero-unclassified gate is enforced

The gate lives in `scripts/authority_matrix_v2.build_zero_unclassified_report`
and is run over the **live** URLConf by
`backend/tests/unit/test_authority_matrix_v2.py::test_zero_unclassified_gate_passes_on_live_surface`.
It fails on any of: an unresolved route, a route still in the weak
`authenticated` bucket, or a stale registry entry (registered path with no live
route). Its **teeth** are proven executably: `test_gate_fails_on_synthetic_unclassified_route`
feeds a fabricated unregistered route and asserts the gate FAILS; `test_gate_fails_on_stale_registry_entry`
asserts a registry entry with no live route FAILS the gate. The generator CLI
exits `2` when the gate fails, `0` when it passes.

## Case-matrix shape and how task 2.2 consumes it

For every protected endpoint+method (168 method-level entries → **1610 cases**),
`authority-case-matrix.json` lists, per actor (anonymous, `student_A`,
`reviewer_A`, `tenant_admin_A`, `platform_admin`) and per object variant
(owned/in-scope in tenant A, non-owned in A, **cross-tenant in B**), the
expected `{expect: allow|deny, status, reason}`. Example (`POST …/review/`,
`tenant.application.review`): `tenant_admin_A` in-scope → allow 200;
`tenant_admin_A` cross-tenant B → deny **404** (scope-before-lookup mask);
`reviewer_A` in-scope → deny **403** (lacks review capability); `student_A` →
deny 404; `platform_admin` → allow 200; anonymous → 401.

Task 2.2 iterates these cases: build a request as each actor against an object
in tenant A, a non-owned object in A, and an object in tenant B (a cross-tenant
id), then assert the listed allow/deny + HTTP status — enforcing R3.6's
"generated authority-matrix test exercising every protected endpoint for those
contexts including cross-tenant IDs", with cross-tenant denials held to the
non-leaking 404/403 disclosure.

## Verification (real repo commands)

Generate the matrix + gate (exit 0 = gate PASS):

```
backend/.venv/bin/python scripts/authority_matrix_v2.py
# ZERO-UNCLASSIFIED GATE: PASS (0 unresolved, 0 weak, 0 stale)
```

Run the gate + matrix tests via backend pytest (SQLite fast suite — the sandbox
has no local Postgres; Postgres-only schema checks are unaffected):

```
cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
  .venv/bin/python -m pytest \
  tests/unit/test_authority_matrix_v2.py \
  tests/property/test_authority_matrix_properties.py \
  -o "DJANGO_SETTINGS_MODULE=config.settings.test" -q
# 21 passed  (full output: pytest-output.txt)
```

The 0.3 inventory tooling still reproduces identically after the additive
`build_backend_route_catalogue` extraction (185 routes, PASS).
