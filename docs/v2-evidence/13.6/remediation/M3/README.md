# Task 13.6 remediation — M3

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · remediation item **M3** of
[`docs/v2-evidence/13.6/README.md`](../../README.md) Part II §18.1
Requirements: **R1.3, R2.1, R2.4** (the Capability_Endpoint payload and its
disclosure contract), **R3.1–R3.2** (capability-derived authority, scope before
lookup), **R8.6 / R17.3–R17.6** (the truthful dashboard contract task 9.2
shipped), **R13.4 / R13.8** (the communications-history contract task 10.1
shipped), **R9.2** (the rollback closed set), **R11.1** (no admissions generative
AI), **R14.1 / R15.5 / R5.6** (canonical error codes, tenant-scoped template
uniqueness)
Findings: **GOV-04** (P0 — its exit criterion is the backend failure population),
**MAINT-02** and **ADM-02** (the dashboard relabel and the invented zeros),
**TEN-08** (template uniqueness), **STU-14** (delivery state), **AUTH-01/AUTH-02**
(capability-derived authority), plus the 13.1 cluster-E setup error

---

## THE VERDICT: 50 OF 94 CLOSED · THE CAPABILITY 404 IS A LIVE DEFECT, NOT A TEST BUG · THE ERROR IS CLOSED

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  backend, whole tree, SERIAL, same invocation as every prior batch        │
  │                                                                          │
  │     94 failed / 5302 passed / 102 skipped / 2 xfailed / 1 xpassed / 1 ERR │
  │  -> 44 failed / 5372 passed / 102 skipped / 2 xfailed / 1 xpassed / 0 err │
  │                                                                          │
  │     -50 failures   +70 passes   0 skips added   ERROR COUNT 1 -> 0        │
  │     ZERO new failures (measured header by header, not netted)             │
  │                                                                          │
  │  THE EARLIER MAP NAMED 8 CLUSTERS. THE POPULATION HAS 21.                 │
  │  The two largest were not on it at all: 13 scope/disclosure failures and  │
  │  11 that asserted a view must carry the retired raw-role `IsAdmin` gate.  │
  │                                                                          │
  │  CAPABILITY-ENDPOINT 404: neither of the two options the brief offered.   │
  │  The route RESOLVES (`resolve()` returns `AdminCapabilitiesView`) and the │
  │  test is RIGHT. It is an AUTHORITY defect: the self-description endpoint  │
  │  sat behind the tenant-DATA masked-404, so an unassigned staff actor was  │
  │  REFUSED instead of being told its scope is empty -- and that payload is  │
  │  the only honest source for `CapabilityContext.noAccess`.                 │
  │                                                                          │
  │  PERF GOLDENS: every regenerated field attributed BEFORE regenerating.    │
  │  And the earlier map was WRONG about half of it -- task 9.2 never touched │
  │  notifications; all 35 notification divergences are task 10.1's.          │
  │  8 more were fixture INSTABILITY and 1 was a live SERIALIZER DRIFT.       │
  │                                                                          │
  │  ROLLBACK LINT: too narrow in 3 of its 4 classes. 26 violations -> 2.     │
  │  The 2 that remain are the genuine R9.2 gap. NOT allow-listed.            │
  │                                                                          │
  │  frontend 0 failed / 4620 passed / 1 skipped over 495 files  (was 1 fail) │
  │  lint 0 errors · type-check exit 0 · manage.py check exit 0               │
  │  spec validator exit 0, 0 errors, 20/20 self-tests OK                     │
  │                                                                          │
  │  NOT closed: 44, in 10 clusters, each attributed to a lane in §9.         │
  │  M4 M5 M6 M7, B1 B2 B3 — untouched, by design.                            │
  └──────────────────────────────────────────────────────────────────────────┘
```

| | before | after |
|---|---|---|
| backend whole tree, serial | **94** failed / 5302 passed / 102 skipped / 2 xf / 1 xp / **1 error** | **44** / **5372** / **102** / 2 / 1 / **0** |
| unique failure headers | 94 | **44** — 50 closed, **0 new** |
| distinct clusters | **21** (the earlier map named 8) | **10** |
| `test_drift_bug6_fix` + `test_migration_properties` — `EXPECTED_TABLES` drift | **10** failures | **0** |
| `test_error_codes_canonical` — catalogue gap | 1 (10 codes) | **0** |
| `test_admin_endpoint_auth` — `IsAdmin` assertions | **11** | **0**, with a **stronger** predicate + 2 negative controls |
| perf goldens + divergence + equivalence + dashboard contract | **16** | **0**, stable over **three** identical runs |
| capability endpoint (`shape` / `scope` / `csrf` / `invalidation`) | **5** × 404 | **0** — 16-case guard added, proven to discriminate |
| `test_accounts_error_handling` — bare `except: pass` | 3 | **0** |
| `test_applications_serializers` — imports task 7.4 deleted | 2 | **0**, retirement now pinned |
| fixture defects (raw-insert NOT NULL, `uq_comm_templates_one_active`, `ON CONFLICT`) | 5 + **1 error** | **0** |
| `property/test_ip_address_column.py::setUpClass` | **ERROR** | **closed** |
| rollback-lint violations | **26** across 9 files | **2** across 2 files (the R9.2 gap; tests still fail) |
| frontend `bun run test` | 1 failed / 4619 passed / 1 skipped / 495 files | **0 failed / 4620 passed / 1 skipped / 495 files** |
| `bun run lint` · `type-check` | 0 errors · exit 0 | **0 errors · exit 0** |
| `manage.py check` (real `.env`) | exit 0 | **exit 0**, byte-identical warnings |
| OpenAPI schema SHA-256 | `35fe05d4…` is the brief's reference and was **already stale** | **`686d53d4…`** — M3's own delta is the dashboard blocks, and it is a correction (§4.4) |
| spec validator + self-tests | exit 0, 20/20 | **exit 0, 20/20** |

Sources, in order:
[`raw/00-baseline-backend-whole-tree.txt`](raw/00-baseline-backend-whole-tree.txt) ·
[`raw/01-baseline-failure-inventory.txt`](raw/01-baseline-failure-inventory.txt) ·
[`raw/02-baseline-clusters.txt`](raw/02-baseline-clusters.txt) ·
[`raw/10-cluster-F-expected-tables.txt`](raw/10-cluster-F-expected-tables.txt) ·
[`raw/11-cluster-G-error-codes.txt`](raw/11-cluster-G-error-codes.txt) ·
[`raw/12-cluster-H-fixture-defects.txt`](raw/12-cluster-H-fixture-defects.txt) ·
[`raw/20-cluster-B-capability-404-diagnosis.txt`](raw/20-cluster-B-capability-404-diagnosis.txt) ·
[`raw/21-cluster-B-discrimination.txt`](raw/21-cluster-B-discrimination.txt) ·
[`raw/30-cluster-K-real-authority.txt`](raw/30-cluster-K-real-authority.txt) ·
[`raw/31-cluster-K-after.txt`](raw/31-cluster-K-after.txt) ·
[`raw/40-cluster-A-golden-divergences-before.txt`](raw/40-cluster-A-golden-divergences-before.txt) ·
[`raw/41-cluster-A-field-attribution.md`](raw/41-cluster-A-field-attribution.md) ·
[`raw/42-cluster-A-regeneration.txt`](raw/42-cluster-A-regeneration.txt) ·
[`raw/43-cluster-A-after-two-runs.txt`](raw/43-cluster-A-after-two-runs.txt) ·
[`raw/44-cluster-A-final.txt`](raw/44-cluster-A-final.txt) ·
[`raw/50-cluster-I-rollback-lint.txt`](raw/50-cluster-I-rollback-lint.txt) ·
[`raw/90-after-backend-whole-tree.txt`](raw/90-after-backend-whole-tree.txt) ·
[`raw/91-django-check.txt`](raw/91-django-check.txt) ·
[`raw/92-openapi-schema-sha.txt`](raw/92-openapi-schema-sha.txt) ·
[`raw/93-frontend-gates.txt`](raw/93-frontend-gates.txt) ·
[`raw/94-after-clusters.txt`](raw/94-after-clusters.txt) ·
[`raw/95-spec-validator.txt`](raw/95-spec-validator.txt) ·
[`raw/96-whole-tree-delta.txt`](raw/96-whole-tree-delta.txt) ·
[`raw/97-new-failure-attribution.txt`](raw/97-new-failure-attribution.txt) ·
[`raw/98-final-backend-whole-tree.txt`](raw/98-final-backend-whole-tree.txt) ·
[`raw/99-evidence-isolation.txt`](raw/99-evidence-isolation.txt) ·
plus one reusable instrument, [`raw/cluster.py`](raw/cluster.py).

The backend "before" column is **M3's own fresh baseline**, not a carried number
(§1.1 records that it disagrees with M1-M2's by one). The frontend and lint
"before" columns are cited from
[`../M1-M2/raw/40-frontend-gates.txt`](../M1-M2/raw/40-frontend-gates.txt).

---

## 1. Measure before you fix — the population, and what the earlier map got wrong

### 1.1 The baseline is M3's own, and it disagrees with the carried one

13.6 §18.1 and M1-M2 both report **93 failed / 5303 passed / 102 skipped / 1
error**. M3 re-ran the same invocation, serially, on the same local stack and
measured **94 failed / 5302 passed / 102 skipped / 1 error**
([`raw/00`](raw/00-baseline-backend-whole-tree.txt)).

The one-failure difference is **run-to-run instability in the perf suite**, which
§4.5 identifies precisely (eight divergences that were wall-clock timestamps, one
of them a `REF-PAID` unique collision that fires only when a fixture is built
twice in one test). M3's before column is its own measurement, so the before/after
delta is taken between two runs of the same tree rather than across a carried
figure — and the instability is now fixed rather than left to move the number
again.

### 1.2 The cluster table, published before the fixes

Derived from the artifact by [`raw/cluster.py`](raw/cluster.py), which groups every
failure header by **cause** (first `E ` line + test file) and reports anything it
cannot classify under `UNCLUSTERED` rather than folding it into a neighbour. Full
output: [`raw/02`](raw/02-baseline-clusters.txt).

| cluster | what it actually was | n | on the earlier map? |
|---|---|--:|:--:|
| `O-scope` | scope / disclosure: masked-vs-permitted, 403-vs-404 | **13** | **no** |
| `K-isadmin` | a test asserting a view must carry the **retired** raw-role `IsAdmin` gate | **11** | **no** |
| `A-golden` | committed goldens holding a pre-contract-change shape | **11** | yes |
| `F-tables` | `EXPECTED_TABLES` drift — 6 `managed=False` models unregistered | **10** | yes |
| `P-other` | other | **9** | — |
| `M-v2mock` | `/api/v2/` contract suite: mock-based test vs the real view | **6** | **no** |
| `B-cap404` | the capability endpoint 404 | **5** | yes |
| `E-spectacular` | drf-spectacular errors / warnings / tags | **4** | yes |
| `A-golden-unstable` | run-to-run **instability** inside the perf suite | **3** | partly |
| `H-fixture` | hypothesis-generated duplicate (unique constraint / `ON CONFLICT`) | **3** | yes |
| `L-bareexcept` | a real bare `except: pass` in an accounts view | **3** | **no** |
| `N-mock` | a mock patching a symbol the view no longer calls | **3** | **no** |
| `B-cap-cache` | the Capability_Cache is not serving a primed entry | **2** | **no** |
| `H-fixture` | raw-insert factory omitting a `NOT NULL` column | **2** | yes |
| `I-rollback` | rollback lint | **2** | yes |
| `J-migreport` | migration-report freshness (**item M4**, not M3) | **2** | — |
| `N-retired` | a test importing a view **task 7.4 deleted** | **2** | **no** |
| `A-golden` | the `users.active` → `users.enabled` contract change | **1** | yes |
| `C-viewauth` | 38 unclassified `APIView` subclasses | **1** | yes |
| `D-allowany` | unclassified `AllowAny` views | **1** | yes |
| `G-errcodes` | `ERROR_CODES` catalogue gap — 10 codes | **1** | yes |
| | **total failure headers** | **94** | |
| | setup errors | **1** | yes |

**The earlier map named 8 clusters; the population has 21.** Every cluster it named
was real, and it missed the two largest — 13 scope/disclosure failures and the 11
that require an anti-pattern. It also mis-attributed one cluster's cause (§4.1).
This is not a criticism of the earlier tasks: none of them ran the whole tree with
grouping as its purpose. It is the reason this batch measured first.

---

## 2. Cluster B — the capability-endpoint 404 is a live authority defect

**The brief offers two possibilities: a routing regression, or a test with the
wrong path. It is neither.**

### 2.1 The route resolves

[`raw/20`](raw/20-cluster-B-capability-404-diagnosis.txt):

```
/api/v1/admin/capabilities/ -> apps.accounts.admin_user_views.AdminCapabilitiesView (name=admin-capabilities)  RESOLVES
/api/v1/admin/scope/        -> apps.accounts.admin_user_views.AdminScopeView        (name=admin-scope)         RESOLVES
```

Both are mounted at `config/urls.py:51` through `apps/accounts/admin_urls.py:36`
and `:35`. **Not a routing regression.**

### 2.2 The tests are right, and three independent populations say so

The 404 is returned only to a **staff actor with no active membership or grant**.
Three unrelated test populations require a **200** for exactly that actor:

| source | what it requires |
|---|---|
| `tests/unit/test_admin_scope_endpoint.py::test_scoped_admin_with_no_membership_gets_empty_list` | 200, `all_access` false, `institutions == []` |
| `tests/property/test_capability_endpoint_shape.py` (R2.1 / R2.4, Property 2) | the envelope + full shape *"for **every** actor that can reach the endpoint (super-admin, scoped tenant-admin, multi-institution admin, **no-scope admin**)"* |
| `tests/unit/test_no_scope_empty.py::TestDashboardNoScope` — **task 9.2's own docstring** | the no-access state *"is rendered from their **own** capability payload (`CapabilityContext.noAccess`, derived from `GET /api/v1/admin/capabilities/`), which is the honest source for a statement about the actor's own authority — **not from a masked error**"* |

The third is decisive. Task 9.2 strengthened the **dashboard** to mask a no-scope
admin, and justified it in writing by pointing at the capability endpoint as the
place that answer comes from instead. The capability endpoint was not answering.

**Not a test defect.**

### 2.3 What it actually was

`AdminCapabilitiesView` and `AdminScopeView` carry
`[IsAuthenticated, HasTenantCapability]`, and `HasTenantCapability` delegates to
`authorize_tenant_surface`, which masks **any** actor with an empty
`institution_capabilities` as 404. That contract is correct for a tenant **data**
surface — a dashboard, a roster, an export — where confirming the surface exists
leaks that a tenant does. It is wrong for the two endpoints whose entire payload
is a statement about the **caller's own** authority: for an unassigned staff actor
they return `capabilities: []` and `institutions: []`, which contains no tenant
identifier, name, count or attribute. There was nothing there to mask, and the
mask cost the platform its one honest source for *"No school access assigned"*.

The consequence in the browser is worse than a failing test. `CapabilityContext`
computes `noAccess = !isSuperAdmin && scopedInstitutionIds.length === 0`. A 404
makes the React Query call **error**, `capabilitySet` stays `undefined`, and
`noAccess` comes out `true` — so an operator whose backend is down and an operator
with no school assignment are shown the same screen. That is the ADM-02 failure
mode (a reassuring answer where there is no measurement) reappearing in the
authority layer.

### 2.4 The fix, and the half of it that matters

`authorize_tenant_surface` gains an explicit `self_description=True` mode, opted
into by exactly the two Capability_Endpoints via
`capability_self_description = True`:

* a **staff-tier** actor (reviewer or above, by the platform's one
  `ROLE_HIERARCHY`) is **answered** with its own possibly-empty capability set;
* **everyone else — a Student above all — is still masked 404.**

The second bullet is the point. `CapabilityContext.tsx` already documents that it
does not even ask on a student's behalf *"because the endpoint masks them as a
404"*, and the task 2.1 matrix requires *"student not in tenant admin scope
(not-found mask)"*. Both stay true.

This reads `role`, deliberately and in one bounded place, with the reasoning next
to it: **capabilities cannot make this distinction.** An unassigned `admin` and a
`student` both resolve to zero platform and zero tenant capabilities, so the only
thing separating them is the role the capability derivation itself takes as input.
It is an explicit named policy **composed with** the capability service — the same
shape as `_is_assignment_scoped_reviewer` two functions above it — and it decides
disclosure for a payload that grants nothing. Every tenant-data decision on every
other surface still resolves through `AdminCapabilityService` alone.

### 2.5 The guard, proven to discriminate

`backend/tests/unit/test_capability_self_description_m3.py` — 16 cases, both
directions. With the branch removed and nothing else changed
([`raw/21`](raw/21-cluster-B-discrimination.txt)):

```
FAILED …test_unassigned_staff_actor_is_answered_with_an_empty_set[admin-/api/v1/admin/capabilities/]
FAILED …test_unassigned_staff_actor_is_answered_with_an_empty_set[admin-/api/v1/admin/scope/]
FAILED …test_unassigned_staff_actor_is_answered_with_an_empty_set[reviewer-/api/v1/admin/capabilities/]
FAILED …test_unassigned_staff_actor_is_answered_with_an_empty_set[reviewer-/api/v1/admin/scope/]
4 failed, 12 passed
```

Restored: `16 passed`. **Exactly the four cases the fix is for fail; the twelve
masking and scoping cases pass in both states**, which is the measurement that the
mask was not weakened. Among the twelve: a Student is 404 on both paths with no
tenant id or name in the body, an unknown role is 404 (so the gate is a hierarchy
check rather than "anything that is not a student"), a scoped admin still sees only
its own institution, the **dashboard still masks** an unassigned admin, and
`test_exactly_two_views_declare_the_opt_in` walks the whole URL resolver so a third
view adopting the flag has to justify itself here.

### 2.6 One cluster-B failure was a different bug wearing the same 404

`test_perf_csrf_preservation.py`'s Property 17 asserts a cookie-authenticated
admin gets 200 on three read endpoints, using 200 as proof that DRF resolved
`request.user`. After the fix it still failed — on `dashboard`, not
`capabilities`. Its generated `admin` has no membership, and task 9.2
**deliberately** masks that actor on the dashboard. The property's subject is
authentication; authorization was an ambient variable. The generated admin now
gets a real membership (a `super_admin` gets none — platform authority is not
derived from one, R1.4), and the endpoint list, the strategies, the 200 assertion
and the role-echo assertion are **unchanged**. Same class of fix as M2's rate pin.

### 2.7 What cluster B did *not* close, and the finding under it

Four failures remain in `test_perf_capability_invalidation.py`, all on
`assert q_hit == 0, "primed entry must be served from cache (R5.1)"`. The 404 was
masking them: the file went **5 failed / 0 passed → 4 failed / 1 passed**.

The mechanism is worth filing. `authorize_tenant_surface` calls
`AdminCapabilityService().get_capabilities()` on **every** request, uncached, in
front of a view whose *payload* is cached by task 12.1's Capability_Cache. So the
cache saves the payload computation and the request still pays for a full scope
resolution — `assert 4 == 0` and `assert 2 == 0` are those queries. R5.1's
end-to-end claim ("a cache hit issues zero ORM queries") is **not true**, and the
test is measuring honestly.

**M3 stops here rather than fixing it.** Making the authorization path share the
cache means caching an authorization decision, and "fail closed" and "stale
authority" are the properties at stake; R5.x's language is about the read payload,
not the permission check. That is a design decision for the perf + authority
lanes, not a remediation batch's. Attributed in §9.

---

## 3. Cluster K — the lint was too narrow, and it demanded the anti-pattern

Eleven failures, all of the form:

```
AssertionError: <class 'apps.accounts.permissions.IsAdmin'> not found in
    [<class 'rest_framework.permissions.IsAuthenticated'>,
     <class 'apps.catalog.permissions.HasTenantCapability'>]
```

`IsAdmin` is a **raw role-level check** (`_has_role_level(user, ROLE_HIERARCHY["admin"])`).
Admissions-v2 task 2.2 replaced those gates with capability gates, and the steering
rule is explicit: *"Every backend authorization decision evaluates capabilities …
never a raw role-string comparison in endpoint code."* The test had inverted into
an assertion that the platform's own anti-pattern is present.

### 3.1 Each of the eleven views' real authority, verified

Before deciding anything, [`raw/30`](raw/30-cluster-K-real-authority.txt) reports
what each view actually resolves:

| view | permission classes | the capability it resolves |
|---|---|---|
| `AdminDashboardView` | `IsAuthenticated, HasTenantCapability` | `tenant.application.read` |
| `AdminAuditLogView` | `IsAuthenticated, HasTenantCapability` | `tenant.audit.read` + `AccessScopeService` |
| `AdminUserListView` | `IsAuthenticated, HasTenantCapability` | `AdminCapabilityService`, `_may_export` |
| `AdminUserDetailView` | `IsAuthenticated, HasTenantCapability` | `require_capability` |
| `AdminUserExportView` | `IsAuthenticated, HasTenantCapability` | `tenant.staff.read` |
| `ApplicationExportView` | `IsAuthenticated, HasTenantCapability` | `tenant.application.export` |
| `ApplicationReviewView` | `IsAuthenticated` | `resolve_scoped_application` + `require_application_capability` |
| `ApplicationBulkStatusView` | `IsAuthenticated` | `authorize_tenant_surface` + `filter_applications` |
| `ApplicationVerifyDocumentView` | `IsAuthenticated` | `_get_scoped_application(…, "tenant.document.verify")` |
| `AcceptanceLetterView` | `IsAuthenticated` | `_get_scoped_application(…, "tenant.application.review")` |
| `FinanceReceiptView` | `IsAuthenticated` | `_get_scoped_application(…, "tenant.payment.read")` |

The last five carry only `IsAuthenticated` at the class level, which looked like
five unguarded admin endpoints — worth stopping on. They are not:
`_get_scoped_application` delegates to `resolve_scoped_application`, which scopes
through `AccessScopeService.filter_applications` **before** the `.get()` and then
enforces the named per-institution capability. **All eleven enforce real,
per-institution, capability-derived authority. No view's authority is wrong.**

### 3.2 So the instrument was replaced, not the allow-list widened

The property — *"an admin endpoint requires admin-level authority"* — is unchanged.
Three things changed about how it is measured:

1. **The hand-transcribed `permission_classes` string tuples are gone.** They were
   a registry, and this one had drifted into describing views that no longer looked
   anything like it. Every check now reads the **live view class**, and
   `test_every_listed_view_class_still_exists` fails on a renamed view — which a
   stale string never could.
2. **The predicate is stronger than `IsAdmin` was.** It is satisfied only by a
   capability permission class, or a named `tenant.*` / `platform.*` capability
   resolved through one of the canonical resolvers. `IsAdmin` admitted any actor at
   role level `admin` **without asking which tenant's data was in play** — a view
   that passed the old assertion could still serve another school's application.
3. **Two negative controls**, so a green file is not a vacuous one:
   `test_the_predicate_rejects_an_unguarded_view` (an `[IsAuthenticated]` view with
   no resolution fails) and `test_is_admin_alone_does_not_satisfy_the_predicate`
   (the retired gate is **not** accepted). A third,
   `test_no_admin_endpoint_relies_on_a_raw_role_permission_class`, is the steering
   rule as a test — the exact inverse of what this file used to assert.

`CAPABILITY_RESOLVERS` names two module-local wrapper functions, which could have
become a way to look guarded without being guarded, so
`test_local_capability_wrappers_delegate_to_a_canonical_resolver` reads each
wrapper's source and requires it to delegate and to pass a capability.

11 failures → **11 passes** ([`raw/31`](raw/31-cluster-K-after.txt)).

---

## 4. Cluster A — the perf goldens, attributed field by field before regenerating

The goldens print *"(re-run with `PERF_BASELINE_UPDATE=1` only if this contract
change is intended)"*. [`raw/41`](raw/41-cluster-A-field-attribution.md) is the
answer, taken from the **full** divergence list
([`raw/40`](raw/40-cluster-A-golden-divergences-before.txt)) rather than from the
cluster summary. It was written **before** any regeneration.

### 4.1 A correction: task 9.2 never touched notifications

13.6 §18.1 and the earlier cluster notes say *"the admin dashboard and
notifications contracts changed deliberately in task 9.2"*. Half of that is wrong.
`docs/v2-evidence/9.2/README.md` contains **zero** occurrences of "notification".

All **35** notification divergences belong to **task 10.1** (R13.4 / R13.8, finding
**STU-14**), whose evidence states the new payload in one sentence —
`docs/v2-evidence/10.1/slice-1-backend.md:293`: *"It now publishes, per message:
`category`, `kind`, `audience`, and per channel `{state, attempts,
last_attempt_at, can_retry}`."* Following the map would have meant hunting for
five field names in a README that does not mention them.

### 4.2 The dashboard's 15, each with its source sentence

Seven added top-level keys — `metrics` (9.2 §1.2, the registry), `health` (§4 *"the
health grade is measured or absent"*), `sources` (§3.2, exactly the three sources
`applications` / `accounts` / `activity`), `activity_state` (§3.2), `freshness`
(§1 + `STALE_AFTER_SECONDS`), `scope` (§5 *"who it counts"*), `windows` (§1.2 +
§13). Three added exception counters — `overdue_reviews`, `deadline_pressure`,
`payment_review` — are §2's *"three counters that were rendered but never
computed"*. `users.enabled` added and `users.active` removed is §8 / MAINT-02, and
the old key is deliberately **not** re-published under an alias, because an alias
re-publishes the claim that the platform measures presence.

### 4.3 The two fields 9.2 does **not** explain, and what was done about them

`data.applications.today_created` and `today_submitted` disappeared from the legacy
block **while their source was healthy** — which is not the omission rule 9.2
documents. So they were not absorbed as though 9.2 covered them. Measured instead:

* **Consumers: zero.** `grep` over `apps/admissions/src` and `backend/apps` returns
  nothing — no field, no serializer, no generated client type.
* **Superseded, not lost.** 9.2's `today_activity` — *"Created, updated, or
  submitted since midnight in the platform timezone"* — subsumes both and is
  verified against hand-written SQL by `TestEachNumberEqualsAnIndependentCount`.

The removal is safe but was **undeclared**, and an undeclared narrowing is what
lets the next reader mistake a regression for a cleanup. It is now declared where
the API documents itself (§4.4) and cross-checked in both directions.

### 4.4 One divergence was not a stale golden at all — it was a live contract drift

`test_serializer_response_contract.py` reported
`{'label': 'dashboard.users', 'missing': ['active']}`.
`AdminDashboardSerializer` — the view's own `serializer_class`, and therefore what
drf-spectacular **publishes** — still declared `users.active` and
`needs_attention.pending_payments` long after the view stopped returning them. The
response was right and the **declaration** was wrong, so the fix is in
`apps/accounts/admin_serializers.py`, not in a baseline: the blocks now declare
what the view returns, every field is `required=False` (9.2 made omission
meaningful), and the two retired keys are documented as retired rather than
aliased.

The contract test's own key sets were a **third** hand-transcribed registry, so
they were realigned **and** a new
`test_legacy_blocks_agree_with_the_declared_serializer` compares the response
against the declared serializer in **both** directions. That is the check whose
absence let 9.2's drift live: nothing compared the payload to the declaration.

This is the whole of M3's OpenAPI delta, and it is a correction — see §7.3.

### 4.5 Eight divergences were fixture instability, and were fixed rather than baked in

| divergence | n | verdict |
|---|--:|---|
| `data.results[n].channels[0].last_attempt_at` differing by microseconds between two captures of the same behaviour | **7** | a wall-clock timestamp task 10.1 published after `DEFAULT_VOLATILE_KEYS` was last extended |
| `data.freshness.generated_at` likewise | **1** | 9.2's read timestamp, same class |
| `uq_payments_transaction_reference_present` on the literal `REF-PAID` / `REF-MULTI` | 1 error | the fixture is built **twice** in one test; `receipt_number` was already uniquified and `transaction_reference` was not |

`last_attempt_at` and `generated_at` were added to `DEFAULT_VOLATILE_KEYS`, whose
own docstring already names "timestamps" as its subject. **Widening that set does
not stop the fields being compared** — they are compared as `<volatile>` against
`<volatile>`, so a field going missing or changing type is still a divergence, and
the regenerated goldens store `"<volatile>"` rather than a value.

Two more were added only *after being measured*, not predicted:
`windows.last_activity_at` diverged on the **regenerated** golden and was caught by
running the suite again rather than by reasoning; `windows.next_deadline_at` is the
same class (`now + offset` from a condition row) and is added with the instability
**stated rather than observed**, because the dashboard fixture has no deadline row
and the next fixture that adds one turns the suite flaky.

### 4.6 One instrument registry had drifted the same way as the others

After regeneration, `test_property_6_admin_dashboard_shape_equivalent` failed with
`field-name mismatch at data.windows.by_status: missing=['approved', 'submitted']`.
`_DASHBOARD_DYNAMIC_MAPS` declared `data.applications.by_status` as a data-keyed
map; task 9.2 published a **second** status→count map inside `windows` and the
registry did not move, so the shape check was comparing two fixtures' status names.
The new path is declared alongside its sibling, and the dynamic-map branch still
asserts the value **type** of every entry.

### 4.7 Verified over three identical runs

[`raw/44`](raw/44-cluster-A-final.txt): regenerate once, then **three** runs of the
same five suites with no `PERF_BASELINE_UPDATE`:

```
regenerate         45 passed
verification run 1 45 passed
verification run 2 45 passed
verification run 3 45 passed
```

Three runs, not one, because the failure mode being fixed *is* run-to-run
variation, and a single green run cannot distinguish a fixed suite from a lucky one.
An intermediate state is recorded in full in
[`raw/42`](raw/42-cluster-A-regeneration.txt) and
[`raw/43`](raw/43-cluster-A-after-two-runs.txt) — 6 failures then 4, both times
**identical across two runs**, which is how the residue was known to be
deterministic rather than flaky.

---

## 5. Clusters F, G, H, L, N — registry drift and real fixture defects

### 5.1 `EXPECTED_TABLES` — 6 tables, 10 failures, and a blind guard

All six are real `managed = False` models backed by real additive scripts, verified
one by one; zero extras in either direction
([`raw/10`](raw/10-cluster-F-expected-tables.txt)):

| table | created by |
|---|---|
| `admin_saved_filters` | `2026_08_06_01_admin_saved_filters.sql` (task 9.1) |
| `document_upload_stages`, `document_verification_events` | `2026_07_26_01_document_evidence_lifecycle.sql` (task 7.3, R11.7–R11.8, STU-19) |
| `tenant_onboarding` | `2026_07_20_01_tenant_onboarding.sql` |
| `tenant_staff_invitations` | `2026_07_21_01_tenant_staff_invitations.sql` |
| `tenant_change_requests` | `2026_07_22_01_tenant_change_requests.sql` (TEN-06) |

`test_migration_properties.py`'s `EXPECTED_TABLE_MAPPING` was missing exactly one,
`admin_saved_filters`, which is why its model count read 49 against 50.

Registering them is what makes the static verifier **able to see them**: an
unlisted table is never checked for a model, an FK, or an index, so the guard was
blind to six tables rather than tolerant of them. `verify_schema_static.py` now
exits 0 with all six present and **0 errors** — which is also the proof that all
six have models and their FKs resolve. 10 failures → **0**.

### 5.2 `ERROR_CODES` — 10 codes, and a three-file change nobody would predict

Each of the ten was transcribed from its emission site rather than invented: the
`http_status` is the status that site returns and the message is that site's own
sentence. `TRACKING_LINK_UNAVAILABLE` is **503** and retryable because issuing a
tracking link depends on writing a secret; `DOCUMENT_NOT_READY` and
`VERSION_CONFLICT` are **409**; the other seven are 400.

Measuring first is what revealed the shape of this fix. Registering a code in the
backend catalogue **breaks two frontend tests**, because
`errorCodesDriftGuard.test.ts` requires the frontend map to be a *superset* of the
backend and the fixture to match it exactly. So this is a three-file change:
`backend/apps/common/error_codes.py`,
`apps/admissions/tests/unit/__fixtures__/errorCodesBackendMirror.ts`, and
`apps/admissions/src/lib/errorMessages.ts` — where the copy is the browser's, not
the backend's: the backend message states what the platform refused, the frontend
copy states what the person can do next.

### 5.3 A correction: M3 destroyed an untracked file and rebuilt it

While reverting a bad append, M3 ran `git checkout --` on
`apps/admissions/tests/unit/__fixtures__/errorCodesBackendMirror.ts`. The file was
tracked but **carried uncommitted rows from earlier V2 tasks**, and the checkout
restored the `HEAD` version, silently dropping them.

It was caught immediately, because the drift guard went from green (M1-M2 recorded
`1 failed | 493 passed | 1 skipped` — this file's tests among the passes) to
failing on **26** missing codes when M3's own additions were only 10. Two of the
lost rows (`DUPLICATE_ACTIVE_FEE`, `MINIMUM_SELECTION_REQUIRED`) were visible in
this session's own earlier terminal output, which is how the loss was confirmed
rather than assumed.

The rebuild is deterministic: the file is a **mirror**, and the drift guard defines
exactly what it must contain, so all 26 rows were regenerated from
`backend/apps/common/error_codes.py` — every `http_status`, `message` and
`category` read out of the catalogue rather than retyped. The one thing not
recoverable is the earlier tasks' comment wording. Recorded here rather than
quietly repaired: 13.3 §9 and 13.6's own residual note set the precedent that an
instrument being wrong is part of the evidence.

### 5.4 The one error, and three raw-insert factories

`property/test_ip_address_column.py::setUpClass` — 13.1 cluster E, the single
`error` in every whole-tree run since — inserts into `applications` with raw SQL
and omits `assignment_version`. That column is `NOT NULL` with a **Python-level**
default of 1 (`models.py:171`), and Django keeps such defaults in Python rather than
in the column, so a raw insert gets nothing. Not a schema defect: the local schema
is built by `schema_editor.create_model` from the models, and Django never writes a
DB default for a Python one.

The same defect, twice more: `test_unique_constraints.py` (two inserts, so the
unique constraint under test was never reached — the `NOT NULL` fired first) and
`test_schema_reconciliation_invariants.py` (`payments.application_quarantined`,
same class). All three now supply the value the ORM would have written. **The error
count is 1 → 0.**

### 5.5 A property that contradicted a deliberate constraint

`test_communication_template_properties.py`'s Property 22 created `num_versions`
**active** rows for one `(template_key, institution_id)`.
`uq_comm_templates_one_active` is a partial unique index on exactly that pair
`WHERE is_active` — task 3.3, R5.6/R15.5, TEN-08, *"one active version per (key,
institution)"*. The database refused the second row, the property never resolved
anything, and the aborted transaction produced the `TransactionManagementError`
follow-on the earlier map noted.

Superseding a template in the real system deactivates the row it replaces, so
versions below the top are now written inactive. That is a legal state and it makes
the property **stronger**: the resolver must pick the one active row out of several
versions rather than out of a set where every row qualifies.

### 5.6 A seed replay broken by two later schema changes

`test_communication_template_coverage.py` applies
`2026_05_19_seed_communication_templates.sql` to a fresh test database. Task 3.3
**dropped** the legacy global `UNIQUE(template_key)` that the seed's
`ON CONFLICT (template_key)` targets, and the tenant migration added a `NOT NULL`
`version` the seed does not name. The SQLite branch had recognised the first fact
since it was written (*"`template_key` is intentionally not unique in the Django
model"*); it is simply true of both vendors now.

Both adaptations moved to the vendor-independent path with the reasoning attached,
and the seed script itself was **not edited** — it is an applied, checksummed
migration, and a fresh bootstrap still runs it *before* 3.3 in filename order.
Instead, `test_the_seed_upsert_target_no_longer_exists` introspects `pg_indexes`
and fails if a single-column unique on `template_key` ever returns, which would
mean the tenant model has been broken. The drift is recorded, not papered over.

### 5.7 A real bare `except: pass`, and two imports of deleted code

`AdminDashboardView.get` swallowed an audit-write failure with **no log line** —
the only audit swallow in the accounts views without one, so a lost `scope.denied`
event left no trace at all, which is the opposite of what a cross-tenant-probing
detector is for. Swallowing is correct (an audit write must never turn a masked 404
into a 500); swallowing silently is not. It now logs, matching the sibling swallows
in `user_directory_views.py`. 3 failures → 0.

`test_applications_serializers.py` imported `ApplicationPreviewSummaryView`,
`ApplicationAdminSummaryView` and `ApplicationAiSummaryResponseSerializer` — all
removed by task 7.4 under R11.1. The references are gone, and
`test_the_retired_ai_summary_wiring_stays_retired` pins the retirement: deleting an
assertion that names a retired symbol should leave a statement that the symbol is
retired, not a silence.

---

## 6. Cluster I — the lint was too narrow in 3 of its 4 classes

13.4 §6.1 classified the 26 violations by cause. M3 reproduced that classification
exactly and acted on it ([`raw/50`](raw/50-cluster-I-rollback-lint.txt)):

| group | n | cause | M3 |
|---|--:|---|---|
| INSTRUMENT-A | 16 / 4 files | the `DO $$ … END $$;` regex demanded **whitespace** around the dollar quotes; four files write `END$$;`, which Postgres accepts, so the guard block was split on `;` like ordinary SQL and 16 fragments of a Requirement-9.4-sanctioned block were reported | **fixed** — whitespace optional, and the dollar-quote **tag** is now honoured with a backreference, which is *stricter* about pairing than the pattern it replaced |
| INSTRUMENT-B | 6 / 1 file | `(?:ONLY\s+)?` admitted `ALTER TABLE ONLY t` but not `ALTER TABLE IF EXISTS t`, which is standard Postgres and strictly **more** defensive — it makes the rollback idempotent | **fixed** — one shared `_ALTER_TABLE_TARGET` so the two allowed forms cannot drift apart again |
| INSTRUMENT-C | 2 / 2 files | an inert `SELECT 1` rollback was rejected. The forward scripts only *validated* an already-present constraint; a validation has no inverse worth writing, so the file documents that on purpose instead of being empty | **fixed** — a strictly **read-only** statement is allowed |
| **SPEC-GAP** | **2 / 2 files** | genuinely data-restoring rollbacks (an `UPDATE`, a CTE) | **left failing, attributed** |

**Violations 26 → 2. Tests 2 failed → 2 failed: the cluster is not closed and the
instrument is.**

**No file was allow-listed**, and five discrimination tests were added so the
widening is distinguishable from a weakening. The one that matters is
`test_a_select_wrapping_dml_is_still_rejected`: Postgres lets
`WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x` destroy rows while
beginning with `WITH`, so the read-only branch requires the absence of
`INSERT` / `UPDATE` / `DELETE` / `MERGE` anywhere in the statement. The full
rejected set (`TRUNCATE`, unbounded `DELETE`, `INSERT`, `CREATE`, `UPDATE`,
`ALTER … ADD`, a mixed `DROP COLUMN, ADD COLUMN`) is re-asserted after the change.

**The two that remain are the scripts being right about something R9.2 does not
cover.** `2026_07_25_01_canonical_subject_catalog_rollback.sql` (subject-catalog
lane) reactivates three subjects its forward script deactivated;
`2026_07_26_02_document_current_slot_alignment_rollback.sql` (document lane)
restores a slot assignment with a CTE. Both are **correct as rollbacks** and both
are outside R9.2's closed set, because the forward scripts they undo changed
**data**, and the inverse of a data change is a data change. R9.2's closed set
presumes an additive-schema forward script. Closing that means either widening the
requirement for data-migration rollbacks or rewriting two other lanes' scripts to
abandon the restore — and **an acceptance criterion is not edited without input**.
This is the tension 13.1 suspected and 13.4 located, now narrowed from 26
statements to the 2 that actually carry it.

---

## 7. Verification

### 7.1 Backend whole tree, serial

Same invocation as every prior batch (`pytest tests/ -q -p no:cacheprovider
-p no:randomly -rs`), both runs serial, both on the isolated local stack.

```
before  94 failed, 5302 passed, 102 skipped, 2 xfailed, 1 xpassed, 1 error   (250.44s)
after   44 failed, 5372 passed, 102 skipped, 2 xfailed, 1 xpassed            (273.56s)
```

Diffed **header by header**, not netted
([`raw/96`](raw/96-whole-tree-delta.txt)): **50 closed, 0 new.**

**Skips did not rise: 102 → 102**, 31 `SKIPPED` lines and 31 distinct reasons on
both sides. One reason *appears* only in the after run —
`test_schema_reconciliation_invariants.py:477` → `:488` — which is the **same skip
eleven lines lower**, moved by the comment M3 added above it. Recorded rather than
netted away, because that is exactly the shape a genuinely added skip would have
and the only way to tell them apart is to read both strings.

**The error count is 1 → 0** (§5.4).

### 7.2 The one failure that appeared mid-batch, and why it is not a regression

M3's first after-run showed one new failure:
`TestTheCommunicationsHistory.test_the_history_never_publishes_provider_text_or_the_address`,
`assert "535" not in body`. It passes in isolation. The assertion output shows what
it matched ([`raw/97`](raw/97-new-failure-attribution.txt)):

```
E  '535' is contained here:
E    :30:37.942535Z', 'category': 'application_updates', …
```

`535` is an SMTP response code the history must never publish. It matched the
**six-digit microsecond fraction of a timestamp** in the same payload. The test is
flaky by construction — a bare three-digit substring search over a body containing
rendered time — and it fails on the wall clock, which is why it appeared in one run
and not the other. Nothing in M3 touches that module, endpoint or payload.

The property is unchanged and its coverage is now wider: the full provider sentence
(`Both SMTP and Resend failed`), the code as it is actually written (`535 auth`),
both provider names, the recipient address, and the raw field name `error_message`
are all asserted absent. The final run ([`raw/98`](raw/98-final-backend-whole-tree.txt))
carries the fix and reports **0 new failures**.

### 7.3 `manage.py check` and the OpenAPI schema

[`raw/91`](raw/91-django-check.txt), with the real `backend/.env`, `TESTING` **not**
exported and `REDIS_URL` **not** substituted (either produces a spurious
`django_ratelimit.E003`):

```
System check identified no issues (1 silenced).      exit=0
```

The two warnings (`SECRET_KEY not set`, `LENCO_API_SECRET_KEY is not set`) are
byte-identical to M1-M2's and L2-L3's recordings of the same command.

**The schema SHA moved, and it had already moved before M3**
([`raw/92`](raw/92-openapi-schema-sha.txt)):

```
reference in the brief             35fe05d4cd3fa69ddfa9b0f0b3f9370c4649fa83b8258f29dc9100231cc3ef58
with M3's serializer edit REVERTED 4563bf35692ab964f81474f96a5c2b5e128a8e3964ed784faa5eec0e7942d415
with M3's serializer edit (final)  686d53d4ac28b7d15b3532a0bf9027ed49a440e3d47faa2fc81ad53bd64ce9e6
```

The middle line is the measurement that matters: with M3's one substantive contract
edit reverted the SHA **still** does not match the brief's reference, so the
reference was stale on arrival. M1's `intake` widen (`maxLength: 100 → 255`,
recorded in M1-M2 §4.2) is one prior cause and M3 does not claim to know all of
them — the V2 tree is uncommitted and several lanes have touched serializers.

**M3's own delta is exactly the admin-dashboard legacy blocks, and it is a
correction**: the schema stopped promising two keys the view has not returned since
task 9.2 (`users.active`, `needs_attention.pending_payments`) and started declaring
the five it does (`users.enabled`, `needs_attention.payment_review` /
`overdue_reviews` / `deadline_pressure`, `applications.today_activity`). No other
operation, path or component changed.

### 7.4 Frontend

| gate | result |
|---|---|
| `bun run test` | **0 failed / 4620 passed / 1 skipped over 495 files** — the baseline's one failure is closed, file count identical |
| `bun run lint` | **exit 0** (`--max-warnings 0`, so a warning fails it too) — L12's close, not regressed |
| `bun run type-check` | **exit 0** |

The one frontend failure was in M3's scope, and **task 1.6's evidence decides it
against the test**. `docs/v2-evidence/1.6/README.md` §2 row 7 records the copy
`"We'll verify this address."` as *deliberately removed* → `"We'll send account
updates here."`, alongside the same promise being removed from the landing page and
the register response, because **the platform performs no email verification at
all**. So the page is correct and the expectation was pre-1.6 — and the two were in
direct contradiction, since a test named *"uses honest helper copy"* was requiring a
sentence that promises a step the platform never takes. The shipped copy is
asserted and `verify this address` is now asserted **absent**, so removing a stale
string leaves a guard for 1.6's decision rather than a gap.

### 7.5 The spec validator

[`raw/95`](raw/95-spec-validator.txt): `Errors: 0  Warnings: 0`, `RESULT: PASS`,
exit 0; self-tests `Ran 20 tests … OK`. **Unchanged and still green.**

### 7.6 Local databases

Postgres `mihas_localtest` (`127.0.0.1:5433`) and Redis (`127.0.0.1:6380`), via the
isolated `backend/.env.local.test` stack so the Neon DSN cannot reach a test run.
`test_%` verified **empty before** the batch and **empty after**. Containers left
**running**; `down -v` was never used. Every backend run was **serial**.

---

## 8. What is NOT claimed

1. **Production was not contacted in any way** — no SSH, no `.pem` read, no query,
   no write, no deploy, no restart, no migration.
2. **No Neon database was touched.** `v2_snap_13_4`, `v2_fresh_13_4`,
   `v2_batch_13_4` and `v2_snap_13_6` had no session opened on them; the default
   branch was neither read nor written. M3 is entirely local — no schema change,
   no SQL script, no rehearsal.
3. **No SQL script was written or edited**, including
   `2026_05_19_seed_communication_templates.sql` (§5.6) and
   `00_full_schema.sql`. `backend/scripts/verify_schema_static.py` is a **verifier**,
   not a migration.
4. **44 backend failures remain**, in 10 clusters, each attributed in §9. No skip,
   `xfail`, `eslint-disable`, allow-list entry or deleted assertion was used
   anywhere in this batch.
5. **The rollback-lint cluster is not closed.** 26 violations → 2, and the 2 tests
   still fail. §6.
6. **R5.1's end-to-end cache claim is reported as false, not fixed.** §2.7. The
   four remaining `test_perf_capability_invalidation` failures are honest
   measurements of an uncached authorization path, and caching an authorization
   decision is not a remediation batch's call.
7. **The 38 unclassified views and the unclassified `AllowAny` views were not
   classified.** Each is an authority decision requiring per-view verification
   against `AdminCapabilityService` and the 2.1 matrix — the work §3.1 did for
   eleven views, at three and a half times the scale. Deferred whole rather than
   done partly, because a half-classified list is worse than an unclassified one.
8. **drf-spectacular's 116 errors and 3 `operationId` collisions were not
   touched.** §9. No warning class was silenced.
9. **`findings.md`, `tasks.md`, `.config.kiro` and `docs/canonical-truth-map.md`
   were not edited.** State changes are reported in §10 for the closure pass to
   record. GOV-04's exit criterion is **advanced, not met**: 44 failures remain.
10. **`docs/v2-evidence/3.6/` was not regenerated** (item **M4**) and the harness
    base-profile timeout was not raised (item **M5**). The migration-report
    freshness failures are among the 44 and are attributed to M4, not fixed.
11. **`docs/v2-evidence/13.5/sign-off.md` was not signed, filled, or opened for
    writing**, and no other task's or batch's evidence directory was written —
    fingerprinted before and after, and re-measured against M3's own first write
    when the first window proved too wide (§10.3, [`raw/99`](raw/99-evidence-isolation.txt)).
12. **The perf goldens' *values* are not claimed to be correct** — only that every
    **field** in the diff is explained by a named task's stated intent (§4), that
    the eight unstable ones were fixed rather than absorbed (§4.5), and that the
    result holds over three identical runs (§4.7).
13. **M3 destroyed an untracked file's uncommitted content and rebuilt it from the
    catalogue it mirrors.** §5.3. The rebuild is deterministic; the earlier tasks'
    comment wording is not recoverable.
14. **Nothing was committed or staged.** The pre-existing staged deletions in the
    index are the de-AI work's and were not touched; `git stash list` is empty.

---

## 9. The 44 that remain, by cluster and owner

From [`raw/94`](raw/94-after-clusters.txt), same instrument as the before table:

| cluster | n | what it is | owner |
|---|--:|---|---|
| `O-scope` | **13** | scope / disclosure disagreements: `interviews-crud (GAP-6)` masked-vs-permitted (3), cross-tenant grant fidelity (3), bulk-status 403-vs-404 (3), force-bypass `PermissionDenied` (2), the two drills (2) | admin-query + capacity lanes |
| `P-other` | **9** | mixed: amendment review 500, reviewer-assignment concurrency `8 == 3`, document delete 500, unverified-payment guard `400 != 200`, `api_quality.sh` baseline, and 4 more | several |
| `M-v2mock` | **6** | the `/api/v2/` contract suite mocks views that have since changed shape (`KeyError: 'success'`, `MagicMock` returned where a `Response` is required, `models.Document` gone) | V2 API lane |
| `B-cap-cache` | **4** | R5.1's end-to-end cache claim is false: the authorization path re-resolves capabilities uncached in front of a cached payload (§2.7) | perf (12.1/12.2) + authority lanes |
| `E-spectacular` | **4** | `116 != 0` errors (mostly *unable to guess serializer* on `APIView` subclasses), `3 != 0` warnings (three genuine `operationId` collisions, incl. `api_v2_admin_onboarding_retrieve`), 23 operations tagged only `api`, and the `api_quality.sh` baseline | API-schema lane |
| `N-mock` | **3** | mocks patching symbols the views no longer call (`filter_applications` not called, `objects.get()` MagicMock, institution passthrough) | applications lane |
| `I-rollback` | **2** | the genuine R9.2 gap, narrowed from 26 statements to 2 (§6) | subject-catalog + document lanes, and whoever owns R9.2 |
| `J-migreport` | **2** | migration-report freshness — **item M4**, count now 7 | whoever owns 3.6 |
| `C-viewauth` | **1** | 38 `APIView` subclasses in no classification list | the lanes owning those 38 views |
| `D-allowany` | **1** | unclassified `AllowAny` views, incl. `V2SessionView` | public-endpoint-policy lane |

**GOV-04's exit criterion is the whole population, so it is advanced and not met.**
Ten of the twenty-one clusters are closed and the two largest remaining ones
(`O-scope`, `P-other`) are individual behavioural questions rather than a single
drifted registry — which is the useful thing to know about them: the mechanical
half of this population is done.

---

## 10. State left behind

### 10.1 Changed files — 30, of which 2 are new

Production code (5):

| file | change |
|---|---|
| `backend/apps/common/tenant_authorization.py` | `authorize_tenant_surface(self_description=…)` + `_is_staff_tier`, with the whole reasoning block above them (§2.4) |
| `backend/apps/catalog/permissions.py` | `HasTenantCapability` reads `capability_self_description` off the view and passes it through; docstring |
| `backend/apps/accounts/admin_user_views.py` | `capability_self_description = True` on the two Capability_Endpoints; the bare `except: pass` at the dashboard's audit swallow now logs (§5.7) |
| `backend/apps/accounts/admin_serializers.py` | the three legacy dashboard blocks realigned with the shipped payload, every field optional (§4.4) |
| `backend/apps/common/error_codes.py` | 10 codes registered from their emission sites (§5.2) |

Verifier + frontend contract (3):

| file | change |
|---|---|
| `backend/scripts/verify_schema_static.py` | 6 tables registered in `EXPECTED_TABLES` (§5.1) |
| `apps/admissions/src/lib/errorMessages.ts` | 9 new user-facing messages (`VERSION_CONFLICT` already existed) |
| `apps/admissions/tests/unit/__fixtures__/errorCodesBackendMirror.ts` | 26 mirror rows, 16 of them **reconstructed** (§5.3) |

Tests (20 modified, 2 new) and 3 regenerated goldens:

| file | change |
|---|---|
| `backend/tests/property/test_admin_endpoint_auth.py` | **rewritten** — live view classes, a stronger predicate, 2 negative controls (§3) |
| `backend/tests/property/test_rollback_safe_operations.py` | 3 patterns widened + 5 discrimination tests (§6) |
| `backend/tests/perf_baseline/divergence.py` | 4 timestamps added to `DEFAULT_VOLATILE_KEYS` (§4.5) |
| `backend/tests/perf_baseline/fixtures/{admin_dashboard,notifications,notifications_cursor}.json` | regenerated after §4's attribution |
| `backend/tests/property/test_perf_output_equivalence.py` | `data.windows.by_status` declared a dynamic map (§4.6) |
| `backend/tests/integration/test_perf_{golden_snapshots,divergence_regression,payment_summary_regression}.py` | `transaction_reference` uniquified (§4.5) |
| `backend/tests/contract/test_serializer_response_contract.py` | key sets realigned + the both-directions serializer guard (§4.4) |
| `backend/tests/property/test_perf_csrf_preservation.py` | the generated admin gets scope so Property 17 measures authentication (§2.6) |
| `backend/tests/property/test_migration_properties.py` | `admin_saved_filters` registered (§5.1) |
| `backend/tests/property/test_ip_address_column.py`, `test_unique_constraints.py`, `test_schema_reconciliation_invariants.py` | raw-insert factories supply the `NOT NULL` columns (§5.4) |
| `backend/tests/property/test_communication_template_properties.py` | one active version per key+institution (§5.5) |
| `backend/tests/integration/test_communication_template_coverage.py` | vendor-independent seed adaptation + the index-introspection guard (§5.6) |
| `backend/tests/property/test_accounts_error_handling.py` | *(unchanged — closed by the production fix)* |
| `backend/tests/unit/test_applications_serializers.py` | task 7.4's retired symbols removed, retirement pinned (§5.7) |
| `backend/tests/unit/test_notification_preferences_10_1.py` | the `"535"` substring flake fixed and widened (§7.2) |
| `apps/admissions/tests/unit/authPageFormMarkup.test.tsx` | aligned with task 1.6's evidence (§7.4) |
| `backend/tests/unit/test_capability_self_description_m3.py` | **new** — 16 cases, both directions, proven to discriminate (§2.5) |

Evidence (this directory): this README, **19** numbered raw artifacts, one
attribution document (`raw/41`), and one reusable instrument (`raw/cluster.py`).

No settings, no URL, no middleware, no serializer outside the dashboard blocks, no
CI workflow, no dependency, no SQL.

### 10.2 Reported for the closure pass to record

* **GATE / register state.** GOV-04's exit criterion moved from 94 failures + 1
  error to **44 failures + 0 errors**; the finding is **not closed**. The 13.1
  cluster-E setup error **is** closed.
* **Three defects worth registering as classes, not instances:**
  1. **A self-description endpoint behind a data-surface disclosure contract.** The
     masked 404 protects tenant existence; on an endpoint whose payload is the
     caller's own authority there is nothing to protect and a real client contract
     to break. Now guarded in both directions by 16 cases.
  2. **A declared serializer drifting from the payload its own view returns.** 9.2
     changed the response and left `AdminDashboardSerializer` promising the old
     shape, so the **published schema** was wrong for months. Nothing compared the
     two; now something does, in both directions.
  3. **A substring assertion over a body containing rendered time.** `"535" not in
     body` matched a microsecond fraction. Any short numeric literal asserted
     absent from a serialized payload is a latent flake.
* **A correction to the earlier cluster map:** task 9.2 never touched
  notifications; all 35 notification golden divergences are task **10.1**'s (§4.1).
* **Two undeclared narrowings from 9.2**, now declared: `applications.today_created`
  and `today_submitted` (§4.3).
* **The R9.2 gap is now two statements, not twenty-six** (§6), in the
  subject-catalog and document lanes.

### 10.3 Untouched

| item | state |
|---|---|
| production Postgres / EC2 | **never contacted** |
| every Neon branch and database | **never opened** — M3 is entirely local |
| `.kiro/specs/admissions-v2-canonical-rebuild/tasks.md` · `findings.md` · `.config.kiro` | **unchanged** — no checkbox moved, no row edited |
| `docs/canonical-truth-map.md` | **unchanged.** M3 registers no new domain concept: the 10 error codes were already emitted and are now catalogued, and `capability_self_description` is a disclosure flag on two existing endpoints |
| `docs/v2-evidence/13.5/sign-off.md` | **unchanged**, not opened for writing |
| `docs/v2-evidence/13.6/README.md` | **unchanged** — §18.1's M3 row is not ticked off here |
| `docs/v2-evidence/3.6/**` · `9.2/**` · `10.1/**` · every other task's and batch's evidence | **read, never written.** Fingerprinted before and after; `0` files under `docs/` written outside this directory after M3's first artifact |
| `backend/scripts/**` (every `.sql`) · `00_full_schema.sql` · `MIGRATION_HISTORY.md` | **read, never written** |
| `playwright.harness.config.ts` · `harness/**` | **unchanged** — the harness was not run by this batch |
| local test stack | Postgres 5433 + Redis 6380 **left running**, `test_%` empty before and after |
| git | **nothing committed, nothing staged.** Branch `main` at `bae29a28d`, V2 tree dirty. The pre-existing staged deletions are the de-AI work's; `git stash list` is empty |
| secrets | no DSN, password, token or key appears in this directory |

---

## 11. For the next batch

**Closed outright:** clusters **F** (10), **K** (11), **A** (16 across goldens,
divergence, equivalence and the dashboard contract), **B-cap404** (5), **H** (5 + the
1 error), **L** (3), **G** (1), **N-retired** (2), and the one frontend failure. The
error count is 0 and skips are unchanged.

**Advanced, not closed:** **GOV-04** — 44 of 94 remain. **Cluster I** — the lint is
fixed (26 → 2) and the requirement gap is now visible in two statements instead of
buried in twenty-six.

**Two generalisations, since each cost this batch real time.**

**Measure the population before believing a map of it.** The earlier map named 8
clusters and every one was real — but the population has 21, the two largest were
absent, and one named cluster's cause was mis-attributed to the wrong task. Worse
than a missing cluster is a mis-attributed one: looking for five notification field
names in task 9.2's README finds nothing, and the natural next inference is that
they are unexplained and therefore a defect. They are fully explained, one document
over. **Re-derive attribution from the filing task's own evidence, not from the
summary that quotes it** — which is the same lesson 13.6 §21 item 4 drew from two
upward restatements, arrived at here from the opposite direction.

**A drifted registry and a drifted assertion look identical in a test report, and
have opposite fixes.** Six of this batch's clusters were one shape — a static list
the code outran: `EXPECTED_TABLES`, `EXPECTED_TABLE_MAPPING`, `ERROR_CODES` and its
two frontend mirrors, `_DASHBOARD_DYNAMIC_MAPS`, `DEFAULT_VOLATILE_KEYS`, the
contract test's key sets, and `test_admin_endpoint_auth`'s transcribed
`permission_classes`. Adding the missing entry is right for the first five and
**wrong** for the last two, where the answer was to stop transcribing and read the
live object. The way to tell them apart is to ask what the registry is *for*: a
catalogue of things that exist should be completed; a copy of something the code
already states should be deleted and derived. Every registry M3 completed now has a
guard that fails when the code moves; every one it derived cannot drift again.
