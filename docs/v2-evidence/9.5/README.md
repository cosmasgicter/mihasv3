# Task 9.5 — Correct tenant audit and amendment notification scope

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Evidence index for task **9.5** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 9.5 Correct tenant audit and amendment notification scope
  - Bind the audit UI to the selected tenant endpoint and capability.
  - Scope amendment recipients through institution memberships/capabilities and
    durable communication outbox; lock review transitions.
  - _Requirements: R3, R6.6, R13.10_
  - _Findings: ADM-05, AUTH-06_
  - _Evidence: cross-tenant event/recipient negative tests and audit export E2E_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-08 (UTC).
- **Closes the two things [9.4 §15](../9.4/README.md) deferred**, and nothing else
  from 9.4 is redone. 9.4 moved the amendment *review command* onto the capability
  model and audits it through `TenantAuditService`; this task owns who is
  **notified** (AUTH-06) and the tenant audit **UI binding** (ADM-05). It reuses
  2.3's `visible_institution_queryset` as the scope-before-lookup seam, 8.4's
  `EXPORT_ROW_LIMIT` / `csv_bytes` / `downloadExport` as the one export path,
  9.1/9.3's "the server owns the filters, the page and the totals, and a definition
  travels with every number", and 9.4's `COMMAND_CAPABILITIES` as the answer to
  *which* capability a recipient must hold. What is new is the **recipient
  resolver** — the platform had no authority model for "who at this school should
  be told".
- PBT: task 9.5 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`.
- Schema: **no migration.** No table, column, index, or capability was added. No
  route was added either — `/api/v1/admin/institutions/{id}/audit/` already
  existed and was rebuilt. Two audit **action** strings were added
  (`amendment.requested`, `audit.exported`), which are values in the existing
  `audit_logs.action` column. The capability catalogue stays at 17 `platform.*` +
  17 `tenant.*`. Neon and production were not touched; the only databases used were
  the throwaway `mihas_localtest` Postgres and the task-0.4 harness.

## The Required_Evidence claim

The `_Evidence:` line names **three** things, and each maps to a different half of
the two findings.

**Cross-tenant *event* negative tests — ADM-05.**

| Where | What it proves |
|---|---|
| journeys 1 and 4 (below) | the panel's request names the **selected** school in its path and the generic feed is called **zero** times; and a Tenant_Admin scoped to A is answered a byte-identical 404 for B's feed and for an unknown id, with A's own feed containing none of B's events |
| [`test_tenant_audit_amendment_scope_9_5.py::TestAuditCrossTenantIsolation`](../../../backend/tests/unit/test_tenant_audit_amendment_scope_9_5.py) | the endpoint's half (7 cases): the mask, the indistinguishability, the malformed id, the excluded events, **the facets that do not count B's volume**, the recorded probe, and the multi-school bulk event each school sees its own share of |
| [`tenantAuditServerOwned.test.tsx`](../../../apps/admissions/tests/unit/tenantAuditServerOwned.test.tsx) | the wiring's half: the institution reaches the request, selecting the other school asks a *different* question, and a refusal renders no audit data and nothing about the school it named |

**Cross-tenant *recipient* negative tests — AUTH-06.**

| Where | What it proves |
|---|---|
| journey 5 | school A's reviewer is notified about A's amendment; school B's reviewer's notification list is **empty** of it and does not contain the amended value |
| `test_tenant_audit_amendment_scope_9_5.py::TestAmendmentRecipientsAreTenantAuthorized` (9 cases) | only the owning school's reviewer is notified; a view-only member of the right school is not; a platform operator is not broadcast to; a school with no authorized reviewer records the gap instead of widening; a legacy row with no institution notifies nobody; the fan-out is durable and idempotent; the request is audited with the recipient decision and no PII |
| `…::TestRecipientResolverContract` (6 cases) | the resolver itself: capability required, inactive membership excluded, deactivated profile excluded, ids not addresses, bounded and truncation-reporting, and **a resolution failure is empty, not wide** |

**Audit export E2E — R6.5/R6.6.**

| Where | What it proves |
|---|---|
| journey 3 | standing on **page 2**, the CSV holds every matching event, the request carries no paging, the file downloads, and the export appears in the feed it exported |
| journey "a reader without the export capability" | the read works, the control is absent, and the endpoint refuses it — the frontend is never the boundary |
| `…::TestAuditExportIsOnePath` (7 cases) | read access does not imply export, `can_export` is published on the read, page-independence, tenant scoping, the audit record with counts and filters and **not** the rows, the recorded refusal, and the JSON-parseable payload cell |

Why the browser is required, and not only an API test: **ADM-05 was invisible to
the backend.** The correct per-institution endpoint already existed and already
answered correctly; the panel called a *different* one and never sent the school it
was rendering. No endpoint test can fail on a request the frontend does not make.
The same is true of the export — the tenant audit surface had none, so "the export
covers the whole filtered set" is a claim about a control that has to exist on
screen. And running the browser found one further defect that nothing else could
have (§10).

### The 6 required journeys

[`tenant-audit-amendment-scope.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/tenant-audit-amendment-scope.spec.ts)
— **6 journeys × 2 viewports = 12, all passing on a freshly wiped harness with zero
skips** ([`raw/harness-tenant-audit-journeys.txt`](raw/harness-tenant-audit-journeys.txt)):

| Journey | The claim it settles |
|---|---|
| **the selected school is on the wire** | opening the Audit tab issues a request to `/admin/institutions/{selected}/audit/` and the generic `/admin/audit-logs/` feed is counted and asserted **zero**. Naming the retired endpoint individually is the point: "it asks about the right school" is the absence of that call |
| **page 2 keeps the server's totals** | the rows change, `page=2` is on the wire, and the event count is byte-identical before and after. A count that moved when a page turned would be a per-page count wearing a whole-set label |
| **the export is the whole filtered set** | issued from **page 2**: the CSV row count is ≥ the server's total (≥ rather than = because the export audits itself, so the feed legitimately grows), the request carries no `page`/`pageSize`, and one `audit.exported` row records `page_independent: true`, the filters and the row count — with no applicant in it |
| **a reader without the export capability** | a reviewer holding the read bundle plus `review` reads the feed, is offered no export control, and is **403** with `INSUFFICIENT_PERMISSIONS` when they call the export directly |
| **a cross-tenant query is masked** | school B's feed and an unknown id return byte-identical 404s that name neither B's id nor its name; and A's own 100-row feed contains no B institution id. The refusals are declared to the request gate — R18.4's asserted error path |
| **tenant recipient isolation** | a student's amendment on A notifies A's reviewer; **B's reviewer's notification list is empty of it**; and the `amendment.requested` event records the capability, the recipient count and the school, with the amended phone number absent |

## What this task establishes

1. **The tenant audit panel asks about the selected school.** It took an
   `institutionId`, put it in its React Query cache key, and then called the
   *generic* feed without it — a cache that distinguished answers the request never
   distinguished (§1).
2. **Two endpoints answer two different questions, and that is now written down.**
   `/admin/audit-logs/` narrows by **actor**; the tenant feed matches the
   **institution the event records**. The actor-scoped question is wrong in both
   directions for a school panel (§1.2).
3. **The audit read is a capability, per institution.** `IsAdmin` plus an inline
   scope-id set became `tenant.audit.read` resolved for *that* school through
   `AdminCapabilityService`, with the institution resolved through
   `visible_institution_queryset` **before** any audit query (§2).
4. **The category is the server's, and it ships a definition.** The browser used to
   derive it with a regex over the action string, so a label depended on the client
   build (§3).
5. **The facets are computed over the whole filtered set**, and the category totals
   are computed over *every* distinct action rather than the top 25, so they cannot
   quietly disagree with the event count (§3.2).
6. **The audit surface has an export, and it is a command.** Page-independent,
   bounded by the platform's one export ceiling, gated on the explicit
   `tenant.application.export` capability, and audited — so **the export appears in
   the feed it exported** (§4).
7. **Amendment recipients are resolved, not broadcast.** A student's phone-number
   change used to send their name and application number to every `admin` /
   `super_admin` row on the platform. Recipients are now the staff holding
   `tenant.application.review` for that application's **own** institution (§5).
8. **The capability a recipient must hold is the review command's own**, so who is
   notified cannot drift from who may act (§5.2).
9. **A school with no authorized reviewer is a recorded gap, not a wider fan-out.**
   Zero recipients produces a durable outbox row with `recipient_count: 0` and a
   stated reason (§5.3).
10. **The fan-out is durable and idempotent.** One `Notification` + one committed
    `OutboxEvent` per recipient, keyed `amendment:{id}:recipient:{user}`, so a
    replay converges (§5.4).
11. **The amendment review transition is declared and locked.** Both rows are
    locked, the status is re-read *under* the lock, and the transition is asserted
    against that value — so two reviewers produce one decision (§6).

## Files

```
docs/v2-evidence/9.5/
├── README.md                                     ← this index
└── raw/
    ├── audit-amendment-suites.txt                    (55 failed / 1171 passed / 7 skipped / 39 errors)
    ├── audit-amendment-suites-baseline.txt           (the SAME 130-file selection, 9.5's implementation removed: 55 / 1114 / 7 / 39)
    ├── frontend-test.txt                             (whole suite: 1 pre-existing failure / 4065 passed / 1 skipped; the per-file pass list elided)
    ├── frontend-lint.txt                             (18 errors)
    ├── frontend-lint-files.txt                       (the 15 files those errors are in — none of them this task's)
    ├── frontend-build.txt                            (exit 0, incl. tsc + CSP gate)
    ├── django-check.txt                              (no issues)
    ├── spectacular.txt                               (3 warnings / 116 errors — unchanged)
    └── harness-tenant-audit-journeys.txt             (12 passed — 6 journeys × desktop + mobile, freshly wiped harness)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/catalog/tenant_audit_query_service.py` | **new** (497 lines) — `TenantAuditQueryService`: scope-before-lookup (`resolve_institution_id`), `require_read`, `may_export`, the `CATEGORY_PREFIXES` / `CATEGORIES` / `CATEGORY_DEFINITIONS` vocabulary with `categorize`, server-side filters (`TenantAuditFilters`), the institution↔event match, `facets` over the whole filtered set, `rows_for`, `export_rows`, and `EXPORT_COLUMNS`. `EXPORT_ROW_LIMIT` is **read from** 8.4's settlement service, not restated |
| `backend/apps/catalog/tenant_recipients.py` | **new** (323 lines) — `TenantStaffRecipientService.recipients_for_institution` + `ResolvedRecipients` + `RECIPIENT_LIMIT`: candidates from active memberships/grants, authority confirmed through `AdminCapabilityService`, Super_Admins excluded by design, fail-closed on a resolution failure, bounded and truncation-reporting, and a non-PII `as_payload()` |
| `backend/apps/catalog/admin_views.py` | `AdminInstitutionAuditView` rewritten: `IsAdmin` → `IsAuthenticated` + the capability, the inline scope-id set → `visible_institution_queryset`, `?action=` → seven server filters, `_paginate` → an explicit page with server `totalPages`, plus `facets` / `filters` / `categories` / `definitions` / `can_export`, the `?export=csv` command, and `_masked_not_found` recording `scope.denied`. The view holds **no** query logic |
| `backend/apps/catalog/tenant_audit_service.py` | `ACTION_AMENDMENT_REQUESTED` + `ACTION_AUDIT_EXPORTED`, and the four 9.4 action constants that were missing from `__all__` added alongside them |
| `backend/apps/applications/amendment_service.py` | `AmendmentStateMachine` (the transition table + `assert_transition`); `review_amendment` wrapped in one transaction with `select_for_update()` on **both** rows and the transition asserted against the re-read status; `_notify_admins_of_amendment` rewritten onto `TenantStaffRecipientService` + `create_notifications_bulk` with per-recipient idempotency keys; `_record_amendment_request_event` (the durable outbox row via `get_or_create` + the tenant Audit_Event) |
| `apps/admissions/src/services/admin/tenantAudit.ts` | **new** — `tenantAuditService.list` / `exportPath` / `download`, the typed payload, and `tenantAuditEndpoint` (the institution in the **path**). Derives nothing: no total, no breakdown, no category |
| `apps/admissions/src/hooks/admin/useTenantAudit.ts` | **new** — `useTenantAudit` (key = the whole server query, `keepPreviousData` so a page turn does not blank the totals) and `useTenantAuditExport` |
| `apps/admissions/src/pages/admin/tenants/AuditPanel.tsx` | rewritten: the selected institution is the endpoint, the category is a server filter, the counts are the server's facets, the definition renders with the event, paging follows the server's `totalPages`, and the export follows `can_export` **and** the capability set |
| `apps/admissions/src/services/admin/settlement.ts` | `downloadExport` no longer sends `Accept: text/csv` — the latent 406 the browser run found (§10) |
| `scripts/authority_matrix_registry.py` | both entries re-registered: the audit route with its scope seam, its disclosure contract and `audit.exported`; the amendment-request route with the recipient contract and `amendment.requested` |
| `backend/tests/unit/test_tenant_audit_amendment_scope_9_5.py` | **new** — 57 cases (§8) |
| `backend/tests/unit/test_amendments.py` | the two mock-based review cases moved onto the **locked** call shape, using the `nullcontext` transaction seam the file's own `request_amendment` cases already use (§9.2) |
| `apps/admissions/tests/unit/tenantAuditServerOwned.test.tsx` | **new** — 21 cases |
| `apps/admissions/tests/harness-e2e/required/tenant-audit-amendment-scope.spec.ts` | **new** — the 6 required browser journeys, desktop and mobile |
| `docs/canonical-truth-map.md` | "Tenant audit feed and amendment recipients" — the two questions, the query authority, the event↔school match, the category vocabulary, the facets, the export contract, the recipient authority and its capability, the fan-out durability, the two new actions, the transition machine, the lock, the disclosure contract, and the drift guards |

---

## 1. The panel was asking a different question (ADM-05, R6.6)

### 1.1 What the browser used to do

```tsx
// pages/admin/tenants/AuditPanel.tsx, before
export function AuditPanel({ institutionId }: { institutionId: string }) {
  const auditQuery = useQuery({
    queryKey: ['admin', 'tenants', 'audit', institutionId],
    queryFn: () => adminAuditService.list({ targetTable: 'institutions', pageSize: 15 }),
  })
```

`institutionId` is in the **cache key** and not in the **request**. Four
consequences, all of them visible on screen:

- a card titled "Configuration audit" for the selected school rendered a
  platform-wide list of every `entity_type='institutions'` row the caller could
  read;
- switching schools produced a new cache entry holding the *same* list, so the
  panel looked like it had refetched and had not;
- there was no paging past the first fifteen rows and no filter;
- the category label was produced by a regex over the action string **in the
  browser** (`getAuditCategory`), so the label depended on the client build rather
  than on the platform's action vocabulary.

### 1.2 The generic endpoint answers a different question

`GET /api/v1/admin/audit-logs/` narrows a non-super-admin like this:

```python
scoped_actor_ids = UserInstitutionMembership.objects.filter(
    institution_id__in=scope_filters.institution_ids, is_active=True
).values_list("user_id", flat=True)
queryset = queryset.filter(actor_id__in=list(scoped_actor_ids))
```

That is *"events written by someone who shares a school with you"*. It is a
reasonable scoping for the **platform-wide** audit trail page, and it is wrong for
a school panel in **both** directions:

- a **Platform_Admin's change to your school is invisible** — they hold no
  membership in it, so their actor id is not in the set. The operator most likely
  to have reconfigured your tenant is the one you cannot see;
- **a colleague's change to a school you are not in is visible** — they are in your
  actor set, and the filter never looks at which institution the event was about.

The right question was already implemented: `AdminInstitutionAuditView` matches
`changes.institution_id`, the field every `TenantAuditService` write records. The
panel simply called the other one. Both endpoints remain — this task did not
collapse them, because the platform-wide trail is a real surface with a real
audience (§11).

### 1.3 What runs now

```
GET /api/v1/admin/institutions/{institution_id}/audit/
      ?category=&action=&entity_type=&actor_id=&date_from=&date_to=&search=&page=&pageSize=
   →  data: { institution_id, page, pageSize, totalCount, totalPages, results,
              facets, filters, categories, definitions, can_export }
```

The journey does not assert "the right number of requests" — it names the retired
endpoint and counts it:

```ts
if (url.pathname === GENERIC_AUDIT_API) { genericReads.push(...); return; }
if (url.pathname === AUDIT_API(world.institutionAId)) { scopedReads.push(...); }
…
expect(scopedReads.length).toBeGreaterThan(0);
expect(genericReads).toEqual([]);   // none
```

## 2. The audit read is a capability, per institution (ADM-05, R3.1, R6.6)

Before: `permission_classes = [IsAdmin]`, then an inline
`if not is_super_admin(...)` branch over a set of scope ids. Two problems in four
lines — a role tier standing in for authority (so a scoped **Reviewer** with a real
membership was refused a feed the capability model grants them), and a second scope
computation living in the endpoint.

Now, in order:

```python
resolved_id = service.resolve_institution_id(request.user, institution_id)  # scope BEFORE lookup
service.require_read(request.user, resolved_id)                            # tenant.audit.read
```

- `resolve_institution_id` checks the id against
  `AdminCapabilityService.visible_institution_queryset` **before** it reaches any
  audit query, so an out-of-scope id, an unknown id and a malformed id are one
  indistinguishable `TenantAuditScopeDenied` → masked 404. An actor with no tenant
  scope resolves nothing, so the surface's existence is not confirmed to them.
- `require_read` delegates to `require_institution_capability`, so a Super_Admin
  passes on platform authority — R6.6's "or platform equivalent" — and **no role
  string is compared**. `test_no_role_string_is_compared_on_the_audit_surface`
  parses the service and the view with `ast` and finds none (§9.1).

Order matters and is deliberate: scope first, then capability. An in-scope actor
missing `tenant.audit.read` gets a non-revealing 403 (they already know the school
exists — they are scoped to it); an out-of-scope actor gets a 404 (they must not
learn that).

## 3. The labels and the numbers are the server's (R6.6, R8.6)

### 3.1 The category comes from the action vocabulary

`CATEGORY_PREFIXES` maps eight categories onto the platform's own action prefixes,
longest-prefix wins, and `categorize(action)` is the one implementation. It lives
next to the vocabulary it maps (`tenant_audit_service`'s action constants) rather
than in a browser regex, and it travels **per row** with a definition:

```python
CATEGORIES = ("configuration", "authorization", "review", "document",
              "payment", "export", "communication", "other")
```

`test_every_category_is_defined` asserts `CATEGORY_DEFINITIONS` covers
`CATEGORIES`, so a new category cannot ship undefined — 9.1/9.4's "a definition
travels with every number", applied to a label.

An unknown `?category=` is **dropped** rather than 400'd or silently narrowed to
zero rows, and the echoed `filters` says so — the same handling the roster gives an
unparseable filter.

### 3.2 The facets are the whole filtered set

`facets` returns `event_count`, `actor_count`, `by_action` (top 25) and
`by_category` from SQL over the filtered queryset. The category totals are computed
over **every** distinct action (`by_action_all`), not over the top 25, because a
truncated input would make the category counts quietly disagree with
`event_count`.

`test_the_facets_count_only_own_events` is the cross-tenant half of the same
claim: a count is an inference, so B's volume must not reach A's totals.

### 3.3 Network hashes stay behind

`rows_for` publishes `action`, `category`, `entity_type`, `entity_id`, `actor_id`,
`institution_id`, `retention_category`, `created_at` and `changes` — and not
`ip_address` / `user_agent`. Those two are SHA-256 hashes of personal request
context, and an operator reviewing configuration history has no use for them.
`changes` is returned verbatim because it was **already redacted at write time** by
`TenantAuditService._redact` (the shared payment redactor), so there is one place
that decides what an audit payload may contain and this is not a second one.

## 4. The export is one command (R6.5, R6.6)

`?export=csv`, and every property of it is deliberate:

- **page-independent** — `exportPath` drops `page`/`pageSize` in the client, and the
  server reads the whole filtered set regardless. The journey issues it from
  **page 2**;
- **bounded** — `EXPORT_ROW_LIMIT` is *imported* from
  `apps/documents/settlement_service.py` rather than restated, so the platform has
  one export ceiling; over it is `EXPORT_TOO_LARGE` (400);
- **capability-gated** — the explicit `tenant.application.export`, not implied by
  read access. This is 8.4 §12.2 and 9.3 §10's contract applied to a third surface;
- **audited** — `audit.exported` via `record_export`: actor, institution scope,
  filters, row count against the ceiling, `security` retention, and **not the
  events**. So the export appears in the feed it exported, which is the property an
  operator actually wants months later;
- **refusals are recorded too** — `auth.denied` with
  `resource_type: "audit.export"`.

`changes` is serialised with `json.dumps` in `export_rows`, because a CSV cell
holding a Python `dict` repr is not machine-readable and the redacted payload is
the most useful column on the file.

**No new capability was invented for this.** `tenant.application.export` is the
platform's only tenant export grant; using it here keeps the catalogue at 17 + 17
and keeps "read is not extraction" consistent across settlement, fees, the roster,
the user directory and now the audit feed.

## 5. Amendment recipients are resolved, not broadcast (AUTH-06, R13.10)

### 5.1 What ran before

```python
admins = Profile.objects.filter(role__in=["admin", "super_admin"], is_active=True)
for admin in admins:
    create_notification(
        user_id=admin.id,
        message=f"Student {application.full_name} has requested an amendment "
                f"to field '{amendment.field_name}' on application {application.application_number}.",
        …)
```

Three defects in four lines:

- **it is a role-string comparison**, which R3.1 forbids in favour of
  `AdminCapabilityService`;
- **it is platform-wide**, so a Tenant_Admin at one school was told that an
  applicant at *another* school wanted to change their phone number — and the
  applicant's **name and application number** travelled with it. That is the
  cross-tenant disclosure R3.2 exists to prevent, arriving through the notification
  channel instead of an endpoint;
- **it ignores capabilities**, so a view-only member of the right school was
  notified about work they may not do, while the school's actual reviewer was
  notified only if they happened to hold the `admin` role string.

### 5.2 The capability is the review command's own

```python
AMENDMENT_RECIPIENT_CAPABILITY = "tenant.application.review"
```

and `test_the_recipient_capability_is_the_review_commands_own` asserts it equals
task 9.4's `COMMAND_CAPABILITIES["review_amendment"]`. That coupling is the point:
the platform notifies exactly the people who can act — not a wider audience, and
not a narrower one — and the two cannot drift apart silently.

Candidates come from the same two tables the capability service derives authority
from (active `UserInstitutionMembership` + active non-expired `AccessGrant` for that
institution), and each candidate's authority is then **confirmed** through
`AdminCapabilityService.get_institution_capabilities`. The membership query narrows;
the capability service decides.

**Super_Admins are excluded by design.** A Beanola operator holds every tenant
capability, so including them would restore the broadcast this module deletes — one
notification per school per amendment, to every platform operator. A Super_Admin
reads tenant work through the console and the audit feed, which is a pull.

### 5.3 Zero recipients is a recorded gap, not a wider fan-out

If a school has no staff holding the review capability — or the application has no
resolvable institution, or the capability service cannot answer — the resolver
returns an **empty** set with a stated reason (`no_members` / `no_capability` /
`no_institution` / `resolution_failed`), and the caller writes the durable outbox
row anyway:

```json
{"capability": "tenant.application.review", "institution_id": "…",
 "recipient_count": 0, "recipient_ids": [], "empty_reason": "no_capability", …}
```

This is a deliberate contract decision and it is worth stating plainly: R13.10 says
notify **only** tenant-authorized recipients, and if a school has none then there is
no one to notify. Falling back to "all platform operators" would re-introduce
exactly the broadcast being removed. So the platform fails closed and stays
**observable** — the gap is a queryable row in `outbox_events` and an
`amendment.requested` Audit_Event in the school's own feed, which is what design
§17's operational queues consume. A silently dropped notification would be the
worse outcome; a silently widened one would be the defect.

### 5.4 The fan-out is durable and idempotent

`create_notifications_bulk` writes one `Notification` **and** one committed
`OutboxEvent` per recipient in one insert each, with a per-recipient idempotency key
`amendment:{amendment}:recipient:{user}`. `test_the_fanout_is_durable_and_idempotent`
calls the notifier a second time and asserts the count stays at one.

The command-level outbox row uses `get_or_create` inside its own savepoint rather
than `create` in a `try/except`: the key is unique, so a replay must **converge**
on the one row, not raise an `IntegrityError` that would poison an enclosing
transaction. Idempotence is the contract, not the exception handler.

Recipient **ids** travel in the audit payload; names and email addresses do not. An
id is already what the audit trail keys on; an address is contact PII.

## 6. The amendment review transition is declared and locked (AUTH-06)

### 6.1 The hazard

```python
amendment = ApplicationAmendment.objects.get(id=amendment_id)   # no lock
if amendment.status != "pending":
    raise AmendmentError("AMENDMENT_ALREADY_REVIEWED", …)
amendment.status = status
amendment.save(...)
if status == "approved":
    application = Application.objects.get(id=amendment.application_id)
    setattr(application, amendment.field_name, amendment.new_value)
    application.save(...)
```

Two reviewers could both read `pending`, both pass the check, and both write — and
the field write was outside any transaction, so an approved amendment that never
reached the application was a reachable state.

### 6.2 The guard

`AmendmentStateMachine` states the transitions as a table
(`pending → {approved, rejected}`, both terminal), and `review_amendment` now:

1. opens one `transaction.atomic()`;
2. locks the **amendment** row with `select_for_update()`;
3. locks the **application** row too — an approval writes one of its fields, and
   9.4's version counter is checked against the same row, so locking only the
   amendment would leave the write it authorises unprotected;
4. asserts the transition against the status **as re-read under the lock**, not
   against the copy the caller held;
5. commits the status write, the field change and the history row **together**.

The stable code `AMENDMENT_ALREADY_REVIEWED` is preserved, because the admin UI and
existing callers branch on it; an unsupported outcome is the new
`AMENDMENT_TRANSITION_REJECTED`.

`test_the_review_locks_both_rows` parses the method and asserts two
`select_for_update()` calls with the two managers named, so a future refactor cannot
quietly drop one.

## 7. Contract strengthenings, and what they cost

### 7.1 The audit feed moved from a role tier to a tenant capability

An actor whose authority came only from the `admin` role string — no membership, no
grant — previously received a 200 with an empty list from
`/admin/institutions/{id}/audit/`; they now receive a masked 404. That is the
ADM-05/R3.2 contract, not a regression: an empty page confirms the school exists
*and* that you have no visibility into it, which is two facts more than a
no-scope actor should learn. Symmetrically, a scoped **Reviewer** now reads the feed
their membership always granted.

### 7.2 The audit export requires the export capability explicitly

New behaviour on a surface that previously had no export at all, so nothing is
taken away. Consistent with 8.4, 9.1 and 9.3.

### 7.3 A school with no authorized reviewer is no longer notified at all

Previously every platform admin was; now nobody is, and the gap is recorded (§5.3).
For a tenant that has staff with the review grant, the change is strictly narrower
and strictly more correct. For a tenant that has none, an operator must look at the
`amendment.requested` event or the outbox row — which is why both exist.

### 7.4 `Accept: text/csv` removed from the shared export download

A one-line fix to `settlementAdminService.downloadExport`, found by this task's
browser run (§10). It affects the settlement and fee exports too — those two
buttons could not have worked in a browser before it. Strictly a fix: DRF's content
negotiation was rejecting the request before the view ran.

### 7.5 Two test cases moved onto the locked call shape

`test_amendments.py`'s two mock-based review cases patched
`ApplicationAmendment.objects` / `Application.objects` and asserted the *unlocked*
call shape. They now mock `select_for_update().get()` and fake the transaction with
the `nullcontext` seam **the same file already uses** for its `request_amendment`
cases, so they stay DB-free unit tests. Their behavioural claims are unchanged
(§9.2).

## 8. The task's own backend suite

`tests/unit/test_tenant_audit_amendment_scope_9_5.py` — **57 passed**, every case
under the `production_scope` fixture so what is measured is the real
membership/grant-derived capability model and never a test-settings shortcut:

| Class | Cases | What it settles |
|---|---|---|
| `TestAuditAuthorityIsCapabilityDerived` | 9 | scoped staff read their own school; **a scoped Reviewer can too**; a student and a no-scope admin are masked 404; a Super_Admin reads any school; anonymous is denied; both capabilities are canonical; **no role is compared on the surface**; and `IsAdmin` is gone from the view |
| `TestAuditCrossTenantIsolation` | 7 | §2 / the Required_Evidence table above |
| `TestAuditListIsServerOwned` | 8 | paging is page-independent and the totals are the whole set; the action and category filters are SQL; an unknown category is dropped; the vocabulary ships definitions; every category is defined; categories derive from the action vocabulary; no network hash is published |
| `TestAuditExportIsOnePath` | 7 | §4 |
| `TestAmendmentRecipientsAreTenantAuthorized` | 9 | §5 |
| `TestRecipientResolverContract` | 6 | the resolver's own contract, independent of the amendment path |
| `TestAmendmentReviewTransitionIsLocked` | 7 | §6 |
| `TestTheServiceIsTheOneAuthority` | 4 | the view holds no query logic; the feed matches the institution **not the actor** (a Super_Admin's change to a school appears in that school's feed); the export columns are declared once; the export ceiling is the platform's one limit |

## 9. Two guards that had to parse rather than grep

### 9.1 A docstring that quotes the defect it replaced

`tenant_recipients.py` and `amendment_service.py` deliberately **quote** the
`Profile.objects.filter(role__in=["admin", "super_admin"])` they deleted, and
`tenant_audit_query_service.py` quotes the panel's old `queryFn`. Recording what was
wrong is part of the fix — but it means a `grep` guard fails on its own
documentation, which is a guard that can only be satisfied by deleting the record.

So the guards parse. `_role_comparisons(source)` walks the AST and reports a role
string literal only where it appears in an `ast.Compare` or as a keyword to
`.filter()` / `.exclude()` / `.get()` — which is precisely what R3.1 forbids.
`tags=["admin"]` on an OpenAPI decorator is documentation and is not flagged.
`_called_functions` distinguishes **calling** `is_super_admin(user)` (a role
predicate) from **reading** `capability_set.is_super_admin` (the capability
service's own resolved answer — exactly what 8.4's `_may_export` reads).

The frontend guard does the same thing more cheaply: it strips block comments before
scanning, for the same reason.

Both are recorded because the first version of each guard failed on the
documentation, and the temptation in that moment is to weaken the documentation.

### 9.2 Two tests that pinned the unlocked call shape

`test_amendments.py::TestApprovalAppliesFieldChange` and
`::TestRejectionLeavesApplicationUnchanged` failed once the lock landed, because
they patch the ORM with `MagicMock` and the service began calling
`select_for_update()` and `transaction.atomic()`. They were the **only** two entries
in the introduced-failure diff (§11.1), and they are the same class of case
[9.4 §14.1](../9.4/README.md) named: a test that fakes the ORM cannot express a
lock, so it pins a call shape rather than a behaviour.

Fixed by wiring the mocks to the locked shape and reusing the file's own
`nullcontext` transaction patch — not by marking them `django_db`, which was tried
first and produced a deferred foreign-key violation at teardown when the unpatched
notification path wrote a real row for a fake user id. Recorded because the failed
attempt is informative: giving a fully-mocked test a real connection makes it a
half-real test, which is worse than either.

## 10. One defect only the browser found

The audit export returned **406 Not Acceptable** and the download never started:

```
console.error: Failed to load resource: the server responded with a status of 406 (Not Acceptable)
failed request [406]: …/audit/?export=csv
```

`settlementAdminService.downloadExport` — 8.4's shared helper, which this task
reuses rather than writing a third download path — sends `Accept: text/csv`. DRF
performs content negotiation in `initial()`, **before** the view runs, and the
project configures exactly one renderer (`EnvelopeRenderer`), so asking for
`text/csv` is refused by the framework and the handler is never entered.

Task 9.3 had already found and documented this for the user-directory export and
fixed it *there* (`userDirectoryService.downloadExport` carries the comment). The
same header was still in the money-surface helper, where **no browser journey had
ever exercised it** — so 8.4's settlement and fee export buttons could not have
worked in a browser either. Fixed once, in the shared helper, with the reason
written next to it.

This is what the "audit export E2E" in the Required_Evidence line is for. No
endpoint test could produce it: `APIClient` does not send that header, and the
backend code is correct.

## 11. Verification (verbatim)

### 11.1 Backend audit / amendment / tenant / authority suites, against a measured baseline

`cd backend && DATABASE_URL=<localtest 5433> TESTING=1 python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "audit|amendment|tenant|catalog|capabilit|permission|scope|notification|communication|outbox|admin|applicat|account|review|export|authority|classification") -q --tb=no -rfE -p no:randomly`
— **130 suite files**, against the isolated `mihas-localtest` Postgres. Neon and
production were not touched.

| Run | Result |
|---|---|
| **baseline** — the same command over the same selection with **9.5's implementation removed**: the two new backend modules deleted, the three edited files restored to their pre-9.5 content, and the two registry entries reverted. The task's own suite is **absent** from the run (`test_tenant_audit_amendment_scope_9_5` appears 0 times in the log, and the run reports 129 files to the candidate's 130) | **55 failed, 1114 passed**, 7 skipped, 39 errors |
| **9.5** | **55 failed, 1171 passed**, 7 skipped, 39 errors |

[`audit-amendment-suites.txt`](raw/audit-amendment-suites.txt) /
[`…-baseline.txt`](raw/audit-amendment-suites-baseline.txt).

A *measured* baseline, and worth saying exactly how it was produced, because the
working tree is not in git (the whole spec is in flight) so `git show` could not
supply it: each of this task's three edits to tracked files was **reversed with the
same strings** into a separate tree, and the reconstruction was verified by
confirming it contains none of the task's markers and still parses. The two new
modules and the task's own suite were moved aside; everything was restored
afterwards and the restoration was diffed file-by-file.

- **New failures: 0.** `comm -13` over the two sorted failing+erroring sets (94
  entries each) is empty.
- **+57 passing**: exactly the task's own suite.
- The first candidate run had **2** introduced failures, both in
  `test_amendments.py`, both pinning the pre-lock call shape. They were fixed (§9.2)
  and the diff re-measured to empty — the number above is the re-measured one.
- One entry (`test_accounts_error_handling.py::TestNoBarExceptPassInAccountsViews::test_every_handler_index_has_logger_call`)
  appeared to be *resolved* by 9.5 in an intermediate run. It is not: run in
  isolation it fails on the candidate too, alongside its two siblings which fail in
  both runs. It is a pre-existing order-dependent failure in a suite this task does
  not touch, and it is **not** claimed as a fix.

The remaining 55 failures and 39 errors are the pre-existing clusters catalogued in
[9.1 §8.1–8.3](../9.1/README.md), [9.2 §11.1–11.2](../9.2/README.md),
[9.3 §15.1](../9.3/README.md) and [9.4 §14.1](../9.4/README.md). Two are worth
naming because this task's selection is the first to include them:

- `test_authority_matrix_v2.py::test_no_stale_registry_entries` /
  `::test_zero_unclassified_gate_passes_on_live_surface` fail in **both** runs on a
  single stale entry: `/api/v1/applications/<uuid:application_id>/preview-summary/`,
  a route **task 7.4 deleted** whose registry entry its lane left behind. This task
  registered no route and removed none, so the failure is structurally not ours.
  Retiring another lane's stale pin here would hide that it was left.
- `test_view_auth_classification.py::test_all_api_views_are_classified` fails in
  both runs on **38** unclassified view classes belonging to other lanes.
  `AdminInstitutionAuditView` is already classified as protected and stays
  protected, so this task adds nothing to that list — and deliberately registers
  nobody else's view.

A targeted re-run confirms the candidate numbers are current:
`test_tenant_audit_amendment_scope_9_5.py` + `test_amendments.py` →
**70 passed, 1 failed** (`TestAmendmentReviewEndpoint::test_approve_succeeds`, which
is in the measured baseline's failing set).

### 11.2 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 4065 passed / 1 skipped** (471 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **18 errors, 0 warnings** across **15 files** — the same count as 9.4. **None of the 18 is in a file this task touched** | [`frontend-lint.txt`](raw/frontend-lint.txt), [`frontend-lint-files.txt`](raw/frontend-lint-files.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |

The pre-9.5 frontend baseline is [9.4 §14.2](../9.4/README.md): **1 failed / 4044
passed / 1 skipped** across 470 files. So: **+21 passing, +1 test file, and the same
single pre-existing failure** — and the +21 is exactly this task's new suite
(`tenantAuditServerOwned`). The pre-existing failure is
[`authPageFormMarkup.test.tsx`](../../../apps/admissions/tests/unit/authPageFormMarkup.test.tsx),
the SignUp helper-copy conflict catalogued in [8.1 §4.1](../8.1/slice-2-frontend.md),
[8.3 §7.1](../8.3/README.md), [8.4 §7.3](../8.4/README.md),
[9.1 §8.4](../9.1/README.md), [9.2 §11.3](../9.2/README.md),
[9.3 §15.2](../9.3/README.md) and [9.4 §14.2](../9.4/README.md). Unrelated to the
audit feed.

### 11.3 Django system checks

`cd backend && python3 manage.py check`

```
LENCO_API_SECRET_KEY is not set — payment processing will be unavailable.
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`django-check.txt`](raw/django-check.txt). The LENCO line is the expected local-dev
notice — this machine holds no provider credential. (The run also emits the
`SECRET_KEY not set` dev warning, because it uses the repo venv without a `.env`
export; it is not a check failure.)

> **`manage.py check` must run with the repo's own environment.** Exporting a
> `TESTING=1` or a substitute `REDIS_URL` first flips `CACHES` to `LocMemCache`
> (`base.py` `_is_testing`) and the check then reports
> `django_ratelimit.E003 — not a shared cache`. That is the override talking, not the
> platform (recorded by 8.3 §7.7, 8.4 §7.5, 9.1 §8.5, 9.2 §11.4, 9.3 §15.3 and
> 9.4 §14.3; re-confirmed here).

### 11.4 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema-95.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — **identical counts** to 8.2, 8.3, 8.4,
9.1, 9.2, 9.3 and 9.4. This task adds **no** operation (the route already existed)
and no new schema error: `admin_institution_audit_list` is present at
`/api/v1/admin/institutions/{institution_id}/audit/` with its eleven documented
parameters, and it does not appear in the error list. The three warnings are the
pre-existing `operationId` collisions on `/api/v1/admin/intakes/`,
`/api/v2/admin/change-requests/` and `/api/v2/admin/onboarding/`.

### 11.5 Browser journeys

`cd apps/admissions && HARNESS_PW_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:8090 bunx playwright test -c playwright.harness.config.ts --project=chromium-required --project=mobile-required tests/harness-e2e/required/tenant-audit-amendment-scope.spec.ts`

```
Running 12 tests using 1 worker
  … 12 passed (56.5s)
PW_EXIT=0
```

[`harness-tenant-audit-journeys.txt`](raw/harness-tenant-audit-journeys.txt).
Run against the task-0.4 isolated harness brought up **fresh**
(`harness/bin/harness up` wipes volumes and rebuilds both the backend image and the
SPA), with the strict `harness-fixtures.ts` gates active: zero skips, no console
errors, no unasserted failed requests.

`HARNESS_PW_CHANNEL=chrome` is the config's documented escape hatch: Playwright's
bundled Chromium has no build for this machine, so the required projects run against
the system Chrome. It changes the browser binary, not the assertions.

Four harness details worth recording:

- **the harness serves the built SPA** (`apps/admissions/dist`) and runs the backend
  from a **built image**, so a source change needs `bun run build` (and a backend
  change needs `harness up`) before it is under test. The §10 `Accept` fix was
  invisible to the harness until the SPA was rebuilt, for exactly this reason.
- **every audit event in the journeys is produced by a platform command.** The seed
  issues real `PATCH /api/v1/admin/institutions/{id}/` updates, each of which emits
  a `tenant.institution.updated` Audit_Event. Nothing is inserted into `audit_logs`
  directly: an audit-feed test that writes its own audit rows proves only that the
  table exists.
- **the application reaches `submitted` through the review command**, because
  `ALLOWED_TRANSITIONS` has no shortcut and an amendment is a *post-submission*
  command. Journey setup through a real capability-gated command, not a row edit.
- **the refusal journeys declare their errors** with `gate.allowRequest(...)`; the
  declaration **is** R18.4's asserted error path.

### 11.6 Failures introduced by this task

**Zero**, against measured baselines rather than assertion:

| Scope | Evidence |
|---|---|
| Backend audit/amendment/tenant/authority suites | baseline 55 failed / 1114 passed → 55 / **1171**; the new-failure diff is empty over 94 entries each side (§11.1) |
| Frontend | the same single pre-existing failure; **18** lint errors across **15** files, the same as 9.4, none in this task's files (§11.2) |
| Build / check / schema | exit 0, no issues, unchanged counts, no new operation and no new error (§11.2–11.4) |
| Browser | 12/12 on a freshly wiped harness, zero skips (§11.5) |

## 12. Not claimed here

- **The platform-wide audit trail page still exports its loaded page.**
  `pages/admin/AuditTrail.tsx` builds its CSV/JSON/PDF from `response.entries` — the
  rows it currently holds — which is R6.5's "the frontend shall not export only its
  loaded page". R6.6 scopes this task to the **tenant** audit list and export, and
  that page is a different surface with a different audience (`/admin/audit-logs/`,
  the platform-wide feed). It is named, not fixed.
- **`/api/v1/admin/audit-logs/` was not changed or retired.** Its actor-based
  scoping is the wrong answer for a school panel (§1.2) and a defensible one for a
  platform-wide trail. Collapsing the two feeds is a decision about that page, not
  about this one.
- **Amendment same-field pending uniqueness and the owner-scoped
  list/detail/status are task 10.2.** 10.2's bullet names them explicitly and also
  carries AUTH-06; this task took the *recipient scope* and the *review transition
  lock*. `MAX_PENDING_AMENDMENTS` (3, application-wide) is unchanged.
- **Amendment notifications remain in-app only.** No email was added; the existing
  `CommunicationService.send('amendment_reviewed', …)` to the **student** on review
  is untouched. Which channels an amendment should use belongs to task 10.1's
  notification-preference schema.
- **The recipient resolver issues one capability resolution per candidate.** A
  school's authorized reviewer set is small and `RECIPIENT_LIMIT` bounds the
  fan-out, but this is O(candidates) capability resolutions, stated rather than
  measured against a target. Batching it would mean a second derivation path, which
  is the thing R3.1 forbids. The perf lane owns budgets.
- **The multi-school bulk-event match is PostgreSQL-only.** `institution_ids`
  containment (`changes__institution_ids__contains`) is added by connection vendor;
  on a non-Postgres backend a school still sees the event recorded under its own
  `institution_id`. Production and the harness are both Postgres.
- **No rate limit was added.** The export ceiling is enforced; per-user throttling on
  admin surfaces is the throttling lane's centralised concern
  (`apps/common/throttling.py`, currently payment- and AI-scoped). A fourth ad-hoc
  scope here would be a parallel implementation.
- **`ip_address` / `user_agent` are omitted from this surface, not deleted.** The
  hashes are still written by `TenantAuditService` and still readable by a
  forensic path; the tenant audit feed simply does not publish them (§3.3).
- **The audit feed shows tenant Audit_Events, not every row in `audit_logs`.** It
  matches events that recorded an institution, which is what `TenantAuditService`
  writes. A row written by another audit path without an institution is not a
  tenant event and does not appear — an honest omission, and the reason
  `categorize` has an `other` bucket rather than a silent drop.
