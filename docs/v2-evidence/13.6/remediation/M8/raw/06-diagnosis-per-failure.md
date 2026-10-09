# M8 — diagnosis, one row per in-scope failure

Written **before** any fix. Every verdict names the artifact or document it was
read from, and every "the code is right" / "the test is right" call cites the
owning task's own evidence rather than a summary that quotes it.

Baseline: [`01-baseline-backend-whole-tree.txt`](01-baseline-backend-whole-tree.txt)
(42 failed / 5374 passed / 102 skipped / 0 errors, serial).
Clusters: [`02-baseline-clusters.txt`](02-baseline-clusters.txt).
Per-failure tracebacks: [`04-scope-selection-before.txt`](04-scope-selection-before.txt).

## The population is 24, not 25

| cluster | brief says | instrument says | difference |
|---|--:|--:|---|
| `O-scope` | 13 | **13** | — |
| `P-other` | 9 | **8** | the brief inherited an arithmetic slip in M3 §9's README table, which sums to **45** against a 44 population. M3's own raw artifact reads `P-other (8)` / `E-spectacular (4)` and puts `api_quality.sh` in **E-spectacular** — which the brief also lists under `E-spectacular` ("and the `api_quality.sh` baseline"), so it is counted twice in the README table and is **out of scope** either way |
| `N-mock` | 3 | **3** | — |
| | **25** | **24** | |

## Cause classes

Five of the six classes below are the same shape in different clothes: **a claim
whose subject is X, measured through an actor or a mock whose authority became a
variable after task 2.2 / 9.4 changed how authority is derived.** M3 §2.6 fixed
one instance of this ("its subject is authentication; authorization was an
ambient variable"); these are eighteen more.

| class | n | verdict | citation |
|---|--:|---|---|
| **A — correlation id in an indistinguishability comparison** | 4 | **code right, expectation too strong** | `docs/canonical-truth-map.md:462` ("byte-identical, `request_id` aside"); `docs/v2-evidence/9.4/README.md` ("byte-identical to an unknown id's 404 (`request_id` stripped)"), guarded by `test_review_workspace_9_4.py::_without_request_id`; and the **sibling matrix file in the same spec** already drops it — `tests/unit/test_scoped_access_matrix.py::_capture` |
| **B — mock actor with no canonical role** | 3 | **code right, mock incomplete** | `apps/catalog/services.py::get_capabilities` R1.1: a role outside `ROLE_HIERARCHY` resolves to zero capabilities. An unset `MagicMock` attribute is not a role. The sibling property `test_application_properties.py::_make_mock_user(role="admin")` already names it and passes |
| **C — read-only fixture actor issuing a command or an export** | 4 | **code right, fixture read-only** | `services.py::_DEFAULT_TENANT_READ_CAPABILITIES` + `_GRANTED_MUTATION_CAPABILITIES` ("read by default, mutate only when granted"); `docs/v2-evidence/8.4/README.md` ("an export requires the explicit `tenant.application.export` capability rather than being implied by read access"); the pattern is `test_review_workspace_9_4.py::_grant` |
| **D — mock patching a seam a later task replaced** | 5 | **code right, patch target retired** | 13.6 §5.3's own precedent: "patch the seam that replaced them". Here: 9.4's `resolve_scoped_application` / `assert_version` / `bump_version`, 7.3's `document_evidence.delete_document` and its replay lookups, and 9.4's `objects.all().select_for_update().get()` chain |
| **E — a global sweep measured against a local expectation** | 1 | **code right, assertion mis-scoped** | `reviewer_assignment_service.auto_assign` has no id filter by design |
| **F — a drill that skips a step the platform now requires** | 1 | **code right, drill incomplete** | `catalog/program_views.py` (task 5.4, R7.5): "Fail closed AND name the readiness blocker … never substitute a default amount" |
| **G — not M8's to decide** | 4 | see below | — |

## Row by row

### Class A — the correlation id (4, all closed)

| test | what actually differed |
|---|---|
| `test_production_scope_masking_properties::test_app_endpoint_in_scope_permitted_out_of_scope_masked` | `{... 'request_id': 'bc72ad1b…'} != {... 'request_id': '5838008c…'}` — status, code and message identical |
| `…::test_expired_grant_masks_previously_granted_resource` | same |
| `…::test_scoped_grant_does_not_widen_to_sibling` | same |
| `test_admissions_v2_authority_policies::test_student_staff_mutation_is_masked_as_not_found` | same |

Only `interviews-crud (GAP-6)` falsifies the property, and that is the tell: it is
the one endpoint of the six whose masked 404 is **raised** (`NotFound` via
`resolve_owner_or_scoped_application`) and rendered by
`envelope_exception_handler`, which stamps `request_id`. The other five hand-build
their 404 bodies. So the field arrived with task 9.4's consolidation onto one
disclosure decision — the *stronger* shape — and the property's whole-body
equality was written before it.

Discrimination: [`10-request-id-discrimination.txt`](10-request-id-discrimination.txt).

### Class B — the mock actor's role (3, all closed)

| test | trace |
|---|---|
| `test_application_hardening::test_force_bypass_approval_creates_audit_trail` | `require_institution_capability` → `PermissionDenied` at `services.py:1229` |
| `test_application_hardening::test_non_force_bypass_does_not_add_force_marker` | same |
| `test_bulk_status_atomic::test_failure_mid_batch_rolls_back_all_changes` | `authorize_tenant_surface` → `NotFound` at `tenant_authorization.py:273` |

### Class C — the read-only fixture actor (4, all closed)

| test | refusal | capability the command/export requires |
|---|---|---|
| `test_scoped_access_matrix::test_bulk_status_out_of_scope_reported_not_found` | 403 `INSUFFICIENT_PERMISSIONS` | `tenant.application.review` |
| `test_cross_tenant_isolation::test_export_excludes_other_school_application_number` | 403 | `tenant.application.export` |
| `test_cross_tenant_invisibility::test_no_tenant_b_token_on_any_scoped_surface` | 403 on `applications_export`, so the tenant-A witness was absent | `tenant.application.export` |
| `test_batch_operations::test_exceeds_25_rejected` / `::test_invalid_token_rejected` | masked 404 (bare `JWTUser`, no membership) | `tenant.application.review` |

The last two are worth separating: their actor had **no** membership at all, so
they are converted to real rows rather than given a grant —
`docs/v2-evidence/9.3/README.md` §13.3 is the precedent ("The three guarantees
moved to real rows in the new suite").

### Class D — the retired patch target (5, all closed)

| test | patched | the view now calls |
|---|---|---|
| `test_amendments::test_approve_succeeds` | `admin_amendment_views.Application.objects.get`, `_staff_can_access_application` | `resolve_scoped_application` + `assert_version` + `bump_version` + `allowed_transitions` (9.4) |
| `test_drift_bug3_endpoints::test_delete_soft_deletes_valid_document` | `views.ApplicationDocument.objects` | `document_evidence.delete_document` (7.3) |
| `test_drift_bug3_preservation::test_upload_persists_application_document_url_fields` | blanket `ApplicationDocument.objects` → the **replay** lookups answered truthy, so the view returned an existing version with 201 and never reached the legacy projection | `find_replay_by_idempotency_key` / `find_identical_current_version` (7.3) |
| `test_application_properties::test_non_approval_status_skips_payment_check` | `.get()` and `.select_for_update().get()` | `objects.all()` → `filter_applications` → `.select_for_update().get()` (9.4) |
| `test_application_student_flow_views::test_admin_list_without_mine_is_scope_narrowed` | `interview_views.AccessScopeService` only | also `AdminCapabilityService.get_capabilities` decides which branch runs (2.2) |

### Class E — the global sweep (1, closed)

`test_reviewer_assignment_concurrency::test_concurrent_auto_assign_never_exceeds_max_workload`
— `assert 8 == 3`. The first two assertions are scoped (`id__in=app_ids`) and
**pass**; the third sums `assigned_count`, which `auto_assign` reports over the
whole unassigned population. It passes in isolation and fails in every whole-tree
recording (M3, M4-M5-M6, M8) — the signature of a leaked row, not a lock defect.

### Class F — the drill's missing step (1, closed)

`test_tenant_lifecycle_drill::test_full_tenant_lifecycle` — `pdata["fee"] is not
None` fails, and the platform says why in the same run's log: *"Assignment preview
fee blocker for offering OFFER-…: FEE_NOT_CONFIGURED"*. The drill walks 14 steps
of onboarding and never configures a fee.

### Class G — NOT closed here (4)

| test | why it is not M8's |
|---|---|
| `test_admin_journey_drill::test_full_admin_journey` | an **offering**-scoped `AccessGrant` puts the offering in `AccessScopeService` scope but `_derive_institution_capabilities` keys only `filters.institution_ids`, so the actor holds **zero** capabilities and the applications list falls to the student branch. Fixing it means deriving capabilities from offering/application grants, which at the capability layer is **institution-wide** — every aggregate surface (dashboard, settlement, audit feed, staff list) checks the capability without a row filter, so an offering grant would leak the whole school. That is an authority-model change, not a remediation batch's |
| `test_cross_tenant_isolation::test_application_grant_does_not_widen_to_sibling` | the same root cause, with an **application**-scoped grant |
| `test_admissions_v2_authority_policies::test_tenant_admin_cannot_reach_platform_tenant_directory` | the test transcribes task **2.1**'s approved matrix verbatim (`docs/v2-evidence/2.1/authority-case-matrix.json`: `tenant_admin_A` → `deny`, `403`, "missing platform capability"). Task **2.2**'s own conformance summary already records this exact case as a reported non-conformance and names it *"tracked task-2.2 follow-up"* — one of **135**, across `assets/`, `document-profiles/`, `domains/`, `programs/`, `required-documents/`, `templates/` and the directory. And the shipped `TenantAdminSchoolConsole.tsx` **depends** on the 200: its own docstring says "The backend scopes `GET /api/v1/admin/institutions/` to the actor's memberships/grants". Closing 1 of 135 while breaking a `[x]` task's product surface is not a close |
| `test_capability_gated_writes::test_super_admin_or_global_admin_creation_requires_super_admin` | two specs pin two different registered codes for one refusal. `enterprise-tenant-authority` task 5.4 requires `PRIVILEGE_ESCALATION`; `admissions-v2` task 9.3 pins `INSUFFICIENT_PRIVILEGES` three times (`test_user_directory_9_3.py:523, :538, :1127`) for the same sentence on PATCH and bulk. Both codes are in the canonical catalogue, and `PRIVILEGE_ESCALATION`'s registered message is that sentence verbatim — so the catalogue favours the property, and 9.3's pins favour the code. Choosing either breaks the other spec's assertion or leaves the platform emitting two codes for one message |
