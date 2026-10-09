# Task 4.4 — Complete domain verification and lifecycle

**Spec:** `admissions-v2-canonical-rebuild` · **Requirements:** R5.1, R5.2, R5.3 ·
**Findings:** TEN-04 (primary), TEN-10 (fail-closed resolver preserved) ·
**Design:** §6.3 Domain State Machine, §5.1 Trusted Tenant Resolution, §17 durable outbox.

Completes the domain lifecycle on the **one** `DomainStatusMachine`: creation now
commits a durable verification job before returning accepted, and retry, pending
review, approve/reject, activate, disable, and reactivate are all real,
capability-gated, audited transitions that update the resolver/cache.

## What changed

### Backend (canonical authority)

| File | Change |
|------|--------|
| `backend/apps/catalog/models.py` | `InstitutionDomain.STATUS_REJECTED = "rejected"` + choice. No schema change — `institution_domains.status` is `varchar(20)` with no CHECK, so `rejected` is storable as-is. |
| `backend/apps/catalog/services.py` | Extended the canonical `DomainStatusMachine` from 7 → **9** edges: added `pending_review → rejected` and `rejected → pending_dns` (design §6.3 `pending_review → rejected → pending_verification`). The other 7 edges are unchanged. |
| `backend/apps/catalog/tasks.py` | `enqueue_domain_verification()` — commit-then-dispatch helper (`transaction.on_commit`, broker-outage-safe). `sweep_pending_domain_verifications_task` — periodic broker-down recovery + DNS-propagation retry for `pending_dns` rows never checked / stale. |
| `backend/apps/catalog/admin_views.py` | Create now commits a verification job before returning 201. New views: `AdminTenantDomainRetryView` (202), `…ApproveView`, `…RejectView`, `…ReactivateView`. All gated on `platform.domain.manage`, machine-guarded, audited (`tenant.domain.<verb>`), and invalidate the tenant/catalog cache. Invalid-for-status → `DOMAIN_TRANSITION_REJECTED` (409); hostname collision on reactivate → `HOSTNAME_CONFLICT` (409). |
| `backend/apps/catalog/admin_urls.py` | 4 new routes: `domains/<id>/{retry,approve,reject,reactivate}/`. |
| `backend/config/settings/base.py` | `CELERY_BEAT_SCHEDULE["sweep-pending-domain-verifications"]` every 300s. |
| `scripts/authority_matrix_registry.py` | Registered the 4 new routes (`platform.domain.manage`, `tenant_object_path=institution_id`). |

The fail-closed `InstitutionContextService.resolve` (TEN-10) is unchanged and
was **not** weakened: only `status=active` + `is_active` + active institution
resolves a tenant; `rejected`/`disabled`/etc. fail closed to Neutral Beanola.

### Frontend (closes TEN-04 API/UI divergence)

| File | Change |
|------|--------|
| `apps/admissions/src/services/admin/tenants.ts` | `TenantDomainStatus` gains `'rejected'`; new service methods `retryDomain`/`approveDomain`/`rejectDomain`/`reactivateDomain` mirroring the backend routes. |
| `apps/admissions/src/pages/admin/tenants/domainStatus.ts` | `rejected` label + tone. |
| `apps/admissions/src/pages/admin/tenants/TenantDomainPanel.tsx` | Each control maps to exactly one allowed state-machine edge (retry ⇒ pending/failed/rejected; approve+reject ⇒ pending_review; activate ⇒ verified; deactivate ⇒ active; reactivate ⇒ disabled), so the panel and backend lifecycle no longer diverge. |

### Steering / truth map

- `.kiro/steering/enterprise-tenancy.md` — domain section updated to the 9-edge
  machine, the `rejected` state, and the retry/approve/reject/reactivate commands
  + durable-enqueue-on-create semantics.
- `docs/canonical-truth-map.md` — `DomainStatusMachine` row + tenant API path
  list updated (new routes, `rejected`, `DOMAIN_TRANSITION_REJECTED`).

## Required_Evidence

### 1. Domain state-machine property test (hypothesis) — every allowed & forbidden transition

`backend/tests/property/test_domain_status_machine.py` (updated to the 7-status /
9-edge specification; independently re-declares the expected table so it pins the
spec, not the implementation). Exercises `can_transition`/`assert_transition`/
`allowed_targets` for **all 7×7 = 49** ordered pairs (`max_examples=200`), the
activation rule, self-transition rejection, and the table-integrity drift guard
(`len == 9`).

### 2. Broker-down / retry E2E spec using the deterministic adapter

`apps/admissions/tests/harness-e2e/deferred/domain-lifecycle.spec.ts` — full
lifecycle over the admin API + deterministic DNS adapter
(create → publish DNS + retry → pending_review → approve → activate → resolve →
disable → fail-closed → reactivate → resolve), plus a forbidden-transition case.
Placed under `deferred/` (not `required/`) on purpose: the strict required
Playwright projects forbid `test.skip` and the literal broker-outage phase needs
the harness worker-pause lever. **Deferred to task 13.2** (two-tenant adversarial
matrix / broker-outage injection).

The durable-record + retry-re-dispatch semantics the E2E would prove under a real
broker outage are proven **now** at the backend integration level (see below).

## Verified now (executed)

```
tests/property/test_domain_status_machine.py            6 passed
tests/unit/test_domain_lifecycle_endpoints.py          40 passed
tests/property/test_domain_creation_init.py            (regression) passed
tests/property/test_domain_verification_outcome.py     (regression) passed
tests/property/test_domain_resolution_fail_closed.py   (regression) passed
tests/property/test_domain_migration_invariants.py     (regression) passed
tests/unit/test_scenario_domain_fail_closed.py         (regression) passed
                                        => 59 passed in ~3.5s
python manage.py check                  => no issues
python manage.py spectacular            => schema generates; 4 new domain paths present;
                                           no new warnings (pre-existing 20 unique are V2 demo/onboarding views)
tests/unit/test_intake_manager_task.py  => 8 passed (beat schedule intact)
```

`test_domain_lifecycle_endpoints.py` covers: create commits the verification job;
**broker-down create persists `pending_dns` and the sweeper re-dispatches once the
broker recovers**; `enqueue_domain_verification` dispatches only after commit and
swallows broker failure; the sweeper only re-dispatches never-checked/stale
`pending_dns`; retry/approve/reject/reactivate happy paths + invalid-status 409s;
`platform.domain.manage` capability gate (403) on every command; 404 for unknown
domains; and resolver update (reactivated domain routes, disabled fails closed).

Frontend: `get_diagnostics` clean on the 3 edited files; no existing test
references the domain panel/service/status helper.

## Deferred (honest)

- **Full harness E2E run** (`domain-lifecycle.spec.ts`) → **task 13.2** (needs the
  harness worker-pause lever for the literal broker-outage phase; two-tenant
  adversarial matrix).
- **Full admissions frontend build / type-check / lint** → **task 13.1** gate
  (working tree carries in-flight tasks 1.x–4.3; my changes are additive and
  diagnostics-clean).
- **OpenAPI candidate + generated TS client regeneration** to include the 4 new
  paths and the `rejected` enum value → the client-generation step (task 1.5 /
  13.1). Schema generates cleanly today; no consumer of the generated domain
  enum was broken (the hand-written `TenantDomainStatus` union was extended).

## Pre-existing failure (NOT introduced by 4.4)

`backend/tests/unit/test_authority_matrix_v2.py` fails on **15 unresolved routes**
that all belong to in-flight tasks **4.1** (`/api/v2/admin/onboarding/*`, 10) and
**4.2** (`/api/v1/admin/staff/*` + `/api/v1/auth/staff-invitation/accept/`, 5),
which never registered their routes in the authority matrix. **0 of task 4.4's 4
routes are unresolved** — they are all registered. This gap is owned by tasks
4.1/4.2, not 4.4.

## Candidate commit & schema hash

- **Candidate:** working tree atop `bae29a28d9657f288b3339062adb31285959c966`
  (the spec baseline). Per the established per-task pattern for this spec, no git
  commit was created — the working tree carries all in-flight V2 tasks (0.x–4.3)
  and evidence lives untracked under `docs/v2-evidence/`; bundling everything into
  one commit is a spec-level step, not a per-task one.
- **Schema hash:** **unchanged.** Task 4.4 is code-only. `rejected` is an
  application-level status value on an existing `varchar(20)` column with no CHECK
  constraint, and the 4 new routes/tasks add no DB objects. No Neon branch or
  migration was required.
