# Task 4.5 — Implement tenant change requests end to end

**Spec:** `admissions-v2-canonical-rebuild` · **Requirements:** R5.4, R5.5 ·
**Findings:** TEN-06 ·
**Design:** §6.4 (TenantChangeRequest state machine + typed payloads +
canonical-command apply with before/after versions), §5.2 (authority),
§14.1 (V2 envelope), §17 (durable committed outbox).

Closes TEN-06: the tenant console's dead "request change" text becomes a durable
**submit → review → apply** workflow. A Tenant_Admin who cannot directly mutate
protected configuration SUBMITS a typed profile/program/domain change; a
Platform_Admin reviews it and, on approval, the backend applies it
**transactionally through the same canonical configuration command a
Platform_Admin uses directly** (never a raw JSON patch), recording redacted
before/after snapshots.

## What changed

### Backend — canonical command reuse (no duplication)

| File | Change |
|------|--------|
| `backend/apps/catalog/canonical_config_commands.py` | **New.** The single implementation of the three protected tenant-config writes — `apply_institution_profile_change`, `apply_program_offering_change`, `create_institution_domain` — plus the shared `config_change_verb` / `audit_config_change` / DNS helpers (moved out of `admin_views.py`). Each does the serializer-validated write, the canonical `tenant.<resource>.<verb>` audit event, and catalog-cache invalidation. |
| `backend/apps/catalog/admin_views.py` | `AdminTenantDetailView.patch` (institution profile), `AdminTenantProgramDetailView.patch` (program offering), and `AdminTenantDomainListCreateView.post` (domain create) now **delegate** to the shared commands. Behavior-preserving refactor; the moved `_verb_for_payload` / `_audit_config_change` names are re-imported so `staff_invitation_views.py` and the other 17 call sites are unchanged. |
| `backend/apps/catalog/models.py` | **New** `TenantChangeRequest` (`managed = False`, table `tenant_change_requests`) — states `draft/submitted/approved/applied/rejected/cancelled`, typed `payload`, `before_data`/`after_data`, `configuration_version`, `requested_by`/`reviewed_by`, timestamps. |
| `backend/apps/catalog/change_request_service.py` | **New** `TenantChangeRequestService` + `TenantChangeRequestStateMachine` (6 edges) + `ChangeRequestError`. Commands: `create`(+submit, idempotent), `submit`, `cancel`, `reject`, `approve`. `approve` runs `submitted → approved → applied` in one transaction, dispatching to the canonical command and recording redacted before/after; apply-time revalidation failure rolls back to `submitted` with `last_error`. Every command emits a `tenant.change_request.<verb>` Audit_Event **and** a durable committed `outbox_events` row (design §17). |
| `backend/apps/catalog/change_request_v2_views.py` | **New** 6 V2 views (`V2APIView` + canonical envelope). Submit/cancel require the tenant `tenant.<kind>.request_change` capability; approve/reject require the platform capability of the underlying command. List/detail scope through `visible_institution_queryset` **before** lookup (non-revealing 404). New V2 codes: `CHANGE_REQUEST_INVALID_STATE` (409), `CHANGE_REQUEST_APPLY_FAILED` (422), `HOSTNAME_CONFLICT` (409). |
| `backend/apps/catalog/change_request_v2_urls.py` | **New** routes; mounted at `/api/v2/admin/change-requests/` from `apps/common/v2/urls.py`. |
| `backend/scripts/2026_07_22_01_tenant_change_requests.sql` (+ `_rollback.sql`) | **New** additive, idempotent migration (mirrors the 4.1/4.2 pattern). `sha256 = 8f83fb165767901f060c3a4dd972a71a8a5d00e4a042a2b8114d98b37b7f5792`. |
| `scripts/authority_matrix_registry.py` | Registered all 6 new `/api/v2/admin/change-requests/...` routes (tenant `request_change` for list/create/submit/cancel; platform for approve/reject; `not_found_mask` disclosure on the tenant surface). |

### Capability model (reused, not invented)

- **Submit / cancel** (Tenant_Admin): `tenant.profile.request_change` /
  `tenant.program.request_change` / `tenant.domain.request_change`, enforced
  per-institution via `AdminCapabilityService.require_institution_capability`.
- **Approve / reject** (Platform_Admin): the platform capability of the
  underlying canonical command — `platform.tenant.update` (profile),
  `platform.program_assignment.manage` (program), `platform.domain.manage`
  (domain).

All six strings already exist in the canonical `AdminCapabilityService`
catalogue — no new capability was invented.

### Steering / truth map

- `docs/canonical-truth-map.md` — new "Tenant change requests (R5.4-R5.5,
  TEN-06)" subsection: the service/views/commands, the 6 routes, the state
  machine, per-kind capabilities, audit + outbox, and the 3 new V2 error codes.
- `.kiro/steering/enterprise-tenancy.md` — new "Tenant Change Requests" section
  (state machine, submit/review capabilities, canonical-command apply, tenant
  isolation, audit + notify).

## Required_Evidence

### 1. Backend suite results (executed — SQLite fast suite, `config.settings.test`)

```
tests/property/test_tenant_change_request_state_machine.py   \
tests/unit/test_tenant_change_request_service.py             \
tests/unit/test_tenant_change_request_endpoints.py
                                              => 32 passed in ~1.0s
```

Coverage of the required paths:

- **state machine** — `test_tenant_change_request_state_machine.py` (hypothesis,
  `max_examples=200`): `can_transition` is true *iff* the pair is one of the six
  design §6.4 edges; terminal states have no outbound edge; self-transitions
  rejected; a table-integrity drift guard pins exactly 6 edges; and a guard that
  the machine's status domain equals the model's `STATUS_CHOICES`.
- **submit / list / detail / cancel / review / apply / notify / audit** —
  `test_tenant_change_request_service.py`: create+submit (durable, typed,
  notified), idempotent submit, invalid-payload rejection per kind; **approve
  applies via the canonical command** for profile (institution row mutated),
  program (offering row mutated), and domain (a `pending_dns` domain created);
  before/after snapshots + `configuration_version` bump; **both** the canonical
  `tenant.<resource>.<verb>` audit event and the `tenant.change_request.applied`
  lifecycle event; a durable `outbox_events` row for every command; reject/cancel
  leave the canonical row untouched; invalid-state approve rejected; apply-time
  revalidation failure rolls back to `submitted` with `last_error`.
- **cross-tenant isolation + capability policy** —
  `test_tenant_change_request_endpoints.py`: a Tenant_Admin with
  `request_change` can submit; a read-only Tenant_Admin cannot (403); anonymous
  401; submitting against another tenant's institution is a non-revealing 403;
  detail of another tenant's request is 404; list returns only own-tenant
  requests; a Platform_Admin sees all; approve/reject require the platform
  capability (Tenant_Admin 403), and approval mutates the canonical row.

### 2. Authority-matrix gate result (executed — proves the 6 new routes are registered)

```
tests/unit/test_authority_matrix_v2.py   => 16 passed
```

The zero-unclassified gate, no-stale-registry, no-unregistered-route, and
canonical-capability checks all pass with the 6 new routes registered. This is
the just-repaired gate — it stays green (no unregistered route was
reintroduced). Broader regression around the refactor also passed:
`test_tenant_api_contract_preservation.py`, `test_domain_lifecycle_endpoints.py`,
`test_tenant_admin_endpoints.py`, `test_domain_creation_init.py`,
`test_scenario_super_admin_onboarding.py`, `test_scenario_domain_*`,
`test_tenant_config_authorization_boundaries.py`,
`test_tenant_audit_observability.py`, and
`tests/integration/test_tenant_onboarding_workflow.py` (**151 + 65 passed**).

`manage.py check` → no issues. `spectacular` → schema generates; the 6 new
`/api/v2/admin/change-requests/...` paths are present. The "unable to guess
serializer" notices are the same graceful `APIView` fallbacks the existing V2
onboarding/demo command views already emit (they are `APIView`, not
`GenericAPIView`); no fatal errors, consistent with tasks 4.1/4.4.

### 3. Schema — Neon-first validation

The additive migration was validated on the **Neon authoring branch** of project
`mihasApplication` (`wild-bar-37055823`). An isolated child branch could not be
created (Neon **branches-limit-exceeded**, 422), so — the change being additive,
idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`, `pg_constraint`-guarded FKs/checks)
and non-destructive, and the default branch being the dev/authoring DB, never
production — the DDL was applied to and verified against the authoring default
branch. Introspection confirms the exact expected shape:

```
columns=19  indexes=6  fk_constraints=3  check_constraints=3
column_fingerprint (md5) = e6fa5e127cc0b5f486ddfb4c82e880b9
```

Production (self-hosted EC2 Postgres) apply is the standard operator step via
`apply_sql_migrations` (Neon → production), **not** performed here.

### 4. Tenant-request + platform-approval browser journey (deferred, with rationale)

The change-request workflow is delivered **backend-end-to-end** (durable records,
typed payloads, state machine, canonical-command apply, notify, audit, capability
gating, tenant isolation) and is fully API-ready for the tenant console to
consume — the six `/api/v2/admin/change-requests/...` routes are registered in
the authority matrix and the canonical truth map.

The **frontend surface** (a tenant-console "Change requests" panel with a submit
form on the branding/programs/domains panels, and a Platform_Admin approval
queue) and its **browser journey** are **deferred to the frontend / task 13.2**,
for two concrete reasons:

1. The admissions `apiClient` (`apps/admissions/src/services/client.ts`) is
   **V1-centric** (`toApiV1Path`, path normalization strips `/api/v1/`); a clean,
   reusable `/api/v2/` consumption path is not yet established in the frontend
   services, so a change-request panel would have to invent that plumbing ahead
   of the V2-client work (task 1.5 / 13.1).
2. The full admissions frontend gate (build / lint / type-check / vitest) is
   **already red from in-flight tasks 0.x–4.4** (baseline 0.5: 24 lint errors,
   3 vitest failures) and is owned by **task 13.1**; a new panel could not be
   brought green this session, and the required Playwright projects forbid
   `test.skip` (so the journey belongs in the 13.2 two-tenant seeded harness).

This matches the 4.2/4.3/4.4 pattern (backend proven now; browser journey to
13.2). The TEN-06 placeholder panels
(`TenantProgramsPanel.tsx` / `TenantDomainPanel.tsx` "requested through your
platform administrator" read-only notices) remain in place; wiring their submit
affordance to the new endpoints is the follow-on frontend step. The behaviours
the journey would prove are proven **now** at the service + endpoint level
(see §1): the full submit → review → apply lifecycle, the canonical-command
application, capability gating, and cross-tenant isolation.

## Verified vs. deferred

**Verified now (executed):** 32 change-request tests (state machine, submit,
list, detail, cancel, review, apply, notify, audit, cross-tenant isolation,
capability policy, apply-time rollback); the authority-matrix gate (6 routes
registered, 16 passed); the surrounding tenant/catalog/domain regression
(216 passed); `manage.py check`; OpenAPI generation with the 6 new paths; and the
Neon authoring-branch schema shape (19 cols / 6 idx / 3 FK / 3 CHECK).

**Deferred (honest):**
- **Frontend tenant-console panel + Platform_Admin approval queue UI** → the
  frontend / **task 13.1** gate. Rationale in §4: the `apiClient` is V1-centric
  (no established `/api/v2/` consumption path yet), and the full admissions
  frontend gate is already red from in-flight tasks 0.x–4.4. The backend contract
  is complete and registered; the placeholder read-only notices remain in place.
- Live tenant-request + platform-approval **Playwright journey → task 13.2**
  (needs the two-tenant seeded harness; strict projects forbid skips).
- Full admissions frontend build/type-check/lint + OpenAPI client regeneration
  → the **task 13.1** gate (the working tree carries in-flight tasks 0.x–4.4;
  this task's backend edits are diagnostics-clean).
- Neon **isolated child-branch** validation → blocked by the project
  branches-limit; validated on the authoring default branch instead (additive +
  idempotent). Production apply is the operator step.

**Two pre-existing failures** observed in the broader sweep —
`test_cross_tenant_isolation.py::TestEndpointExportIsolation::test_export_excludes_other_school_application_number`
and `...TestEndpointGrantScopeFidelityHttp::test_application_grant_does_not_widen_to_sibling`
— are in `/api/v1/applications/*` (application export authorization + application
list grant scope), a surface this task does not touch. They fail in isolation
and are owned by the in-flight applications-app tasks, not task 4.5.

## Candidate commit & schema hash

- **Candidate:** working tree atop `bae29a28d9657f288b3339062adb31285959c966`
  (the spec baseline). Per the established per-task pattern for this spec, no git
  commit was created — the working tree carries all in-flight V2 tasks (0.x–4.4)
  and evidence lives untracked under `docs/v2-evidence/`.
- **Schema changed:** yes — one additive table `tenant_change_requests`.
  Migration `sha256 = 8f83fb165767901f060c3a4dd972a71a8a5d00e4a042a2b8114d98b37b7f5792`;
  Neon authoring-branch column fingerprint (md5) `e6fa5e127cc0b5f486ddfb4c82e880b9`.

## PBT status

Task 4.5 has **no numbered PBT sub-task** in `tasks.md`, so there is no
`update_pbt_status` entry to record. A hypothesis-based state-machine property
test was nonetheless written and executed as part of the suite above
(`test_tenant_change_request_state_machine.py`, passing).
