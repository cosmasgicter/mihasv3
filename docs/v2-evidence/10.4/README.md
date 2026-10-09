# Task 10.4 — Make official-document work durable and historically readable

Evidence index for task **10.4** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 10.4 Make official-document work durable and historically readable
  - Persist a DB job before 202, dispatch/retry from outbox, expose terminal
    failure/retry, and never report phantom queued work.
  - Separate issue eligibility from read-existing policy.
  - Implement canonical email, neutral student recovery, and staff setup alerts.
  - Move all first-party slip/letter/receipt calls to official-document services.
  - _Requirements: R13.2, R13.5, R13.7, R13.11, R17.1-R17.4_
  - _Findings: STU-18, API-04_
  - _Evidence: broker-down recovery, terminal artifact read, email/download E2E_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-09 (UTC). The README was written in a follow-up session after
  the run was interrupted; §10.9 records exactly which gates were **re-run** then
  and which are read from the artifacts captured with the change.
- **STU-18 is four defects in one sentence**, and each clause is a separate part
  of this task: enqueue failure still answered `202 queued`; existing documents
  were hidden once the application became terminal; there was no generic
  official-document email; and the student's error state printed the tenant's
  setup checklist. API-04 is the fifth thing — duplicate legacy and official
  document paths on both sides of the wire.
- It reuses, rather than re-implements: task **3.4**'s `outbox_events` job table
  and its `create_notifications_bulk` fan-out; task **4.4**'s beat-sweep shape for
  a committed backlog; task **7.3**'s staged-object + immutable-version render
  command and its `_current_official_version` / `official_document_matches_current_inputs`
  fingerprint; task **7.5**'s deletion/retention state; task **8.3**'s
  `resolveTenantSupportContact`; task **9.5**'s `TenantStaffRecipientService`; and
  task **10.1**'s `deliver_message` gate, `staff_delivery_metadata` and category
  catalogue.
- PBT: task 10.4 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`, and no fast-check or Hypothesis property was added here —
  the task's own suites are example-based (§9).
- Schema: **no migration.** No table, column, index, capability, role or route
  outside `/api/v1/applications/.../official-documents/{type}/email/` was added,
  and **no SQL script ships under `backend/scripts/`** (§3;
  `test_no_migration_ships_with_this_task` asserts it, and `find backend/scripts
  -newermt <window>` returns nothing). **No Neon branch was created**, and neither
  Neon nor production was touched — the only databases used were the throwaway
  `mihas_localtest` Postgres and the task-0.4 harness.

## The Required_Evidence claim

The `_Evidence:` line names **three** things. Each has a backend class, and each
has a browser journey.

| Claim | Backend | Browser |
|---|---|---|
| **broker-down recovery** | [`test_official_document_durability_10_4.py::TestBrokerDownRecovery`](../../../backend/tests/unit/test_official_document_durability_10_4.py) (7) — an outage still records the request; the sweep re-dispatches the committed backlog; a `dispatched` job whose worker never answered is reopened after 15 min; a settled job is not swept; the sweep never touches a delivered communication row; it is bounded and fail-safe; and it is on the beat schedule | journey 1 |
| **terminal artifact read** | `…::TestIssueVersusRead` (15) — an issued slip stays readable across all five terminal statuses (parameterised); a terminal application still may not *issue*; a terminal application with nothing issued is still masked; a never-issued type is not reachable through the policy; a retired artifact is absent rather than historical; a student upload of the same type is not reachable; a live application still regenerates rather than serving a stale file; a failure is reported *before* a historical artifact; both masking cases; and the two policies are separate functions | journey 2 |
| **email/download** | `…::TestCanonicalEmail` (15) — three document types parameterised over their eligible status; the send goes through 10.1's delivery gate; the body is `render_message("official_document", …)`; the type is registered in the category catalogue and classified for the gate; a document that is not ready sends nothing (409); an official document is not redirectable (400 `RECIPIENT_NOT_PERMITTED`); the owner's own address is accepted explicitly; a repeated send of the same artifact converges; another student is masked; the audit carries no recipient address; the legacy `/email-slip/` route proxies onto the canonical one; and the route does not shadow the detail route | journeys 1 and 3 |

Plus the parts the `_Evidence:` line does not name but the task body does:
`TestDurableJob` (6), `TestNoPhantomQueue` (5), `TestTerminalFailureAndRetry` (6),
`TestStaffSetupAlert` (6), `TestOneAuthority` (7) — **67 collected cases** in total.

Why the browser is required and not only endpoint tests: **two of the four
defects were only visible as a surface.** A terminal application was offered *no
document control at all*, because the client mirrored the issuance gate and
applied its answer to both questions — so an endpoint test proving the read
succeeds says nothing about whether a student is ever shown the button. And the
setup-failure copy STU-18 objects to is rendered text: the assertion that the
tenant's checklist is *gone* and a route to a human is *present* can only be made
against the rendered page.

### The 4 required journeys

[`official-document-durability.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/official-document-durability.spec.ts)
— **4 journeys × 2 viewports = 8, all passing on a freshly wiped harness with zero
skips** ([`raw/harness-doc-journeys.txt`](raw/harness-doc-journeys.txt)):

| Journey | The claim it settles |
|---|---|
| **broker-down recovery** | a permitted document nobody requested reads `not_requested` with `job.state: none` **and no row exists** — the status is not merely honest, it is true; the durable record then commits with nothing dispatched (the platform's own `request_generation(..., dispatch=False)`, §8.1); the envelope reads `queued` **and** the row is there, on the `document` channel; the platform's own sweep serves it; the artifact becomes downloadable and the browser opens the **backend-signed stored object**, never a `blob:` |
| **terminal artifact read** | a live application issues the slip with `historical: false`; the **student's own** withdrawal makes the application terminal; the same `document_id` is still `ready` with `historical: true` and a working download; the list read publishes it; re-issuance is refused with the same masked 404 and code `NOT_FOUND`; and the page shows the control, labelled "Issued copy on record", where pre-10.4 it showed nothing |
| **email/download** | the one canonical route sends the stored record; the response echoes no recipient address; the message lands in the student's **communications history** with category `application_updates` and a stated email channel; the owner may name their own address explicitly; any other address is 400 `RECIPIENT_NOT_PERMITTED` |
| **staff setup alert / neutral recovery** | a school with no `InstitutionDocumentProfile` settles the job **terminally** (`setup_required`, `job.terminal: true`, so the poll ends); the applicant is told the office has been notified, with the words "document profile", "template" and "signature" counted at **zero**; no retry button the server said would not help; exactly one support affordance, either the resolved school address or the neutral `/contact` route and never a platform or example-tenant address; and *this school's own* authorized staff — read as the staff member — hold the work item that names the configuration |

## What this task establishes

1. **"Queued" means a committed durable record exists.** Design §17's sentence, now
   true in both directions: a published `queued` is backed by a row, and the
   absence of a row publishes `not_requested`. Pre-10.4 `_enqueue_generation`
   swallowed every dispatch failure and the POST answered 202 regardless, so with
   the broker down a student polled work that nothing anywhere had recorded (§1,
   §2).
2. **Commit, then dispatch — and the order is asserted structurally.** The row
   commits or the caller gets `503 GENERATION_UNAVAILABLE`, which is R13.11's own
   named alternative to a dishonest 202 (§2.1).
3. **The dispatcher is what makes the record a promise.** Committing before
   answering only makes the platform *honest*; `sweep_pending_official_document_jobs_task`
   (beat, every 5 min) is what makes the recorded request actually get served, and
   it also reopens a `dispatched` job whose worker was killed mid-render (§2.3).
4. **Retry is the same command, not a second endpoint.** A `failed` job returns to
   `pending` with its attempt history intact, so no new route, capability or
   authority was introduced for it (§4.1).
5. **A terminal failure is terminal.** Every early return in the renderer now
   settles the job — application gone, status ineligible, no settled payment,
   unconfigured tenant, retries exhausted — so no committed row is abandoned in
   `pending` for a client to poll forever (§4.2).
6. **Issuance and read-existing are two policies.** One decides whether a *new*
   artifact may be minted from today's state; the other whether an artifact the
   platform *already issued* may be read. Pre-10.4 one gate answered both, and
   `enrolled` — the successful outcome — lost the student their offer letter (§5).
7. **The read-existing policy widens nothing else.** A stored, platform-issued,
   non-retired row is the whole condition: a never-issued type is still a masked
   404, a student upload of the same type is not reachable through it, and another
   tenant's admin is masked identically (§5.2).
8. **A failure outranks a historical artifact.** If the platform tried and failed
   to refresh a document, the requester is told that, rather than handed a silently
   older file as though nothing happened (§5.3).
9. **One official-document email, for every type, through the one delivery gate.**
   `EmailSlipView` was a parallel implementation: inline authorization, an inline
   HTML table, and `queue_email` called directly — so the message appeared in no
   communications history and its delivery state read `unknown`. It is now a
   deprecated proxy onto the canonical route (§6, §7).
10. **An official record is not redirectable.** The recipient is the application
    owner's own account address; any other address is refused (§6.2).
11. **The student's error state stopped being the school's runbook.** A neutral
    sentence, the fact that the office was told, and a tenant-resolved route to a
    human — with the school's half delivered to *its own* capability-holding staff
    as an inbox work item (§7).
12. **No migration was needed, and that was checked rather than assumed** (§3).

## Files

```
docs/v2-evidence/10.4/
├── README.md                                  ← this index
└── raw/
    ├── candidate.txt                              (55 files: 2 failed / 693 passed / 4 skipped / 6 errors)
    ├── baseline.txt                               (the SAME selection before this task: 2 / 623 / 4 / 6)
    ├── candidate-failing-set.txt                  (8 sorted entries)
    ├── baseline-failing-set.txt                   (8 sorted entries — comm -23 and comm -13 both empty)
    ├── selection.txt                              (the 55 selected files)
    ├── authority-matrix.txt                       (the same 1 stale entry and the same 38 unclassified views)
    ├── frontend-test.txt                          (1 pre-existing failure / 4195 passed / 1 skipped, 478 files)
    ├── frontend-lint.txt                          (18 errors)
    ├── frontend-lint-files.txt                    (the 15 files — byte-identical to 10.2's and 10.3's set)
    ├── frontend-build.txt                         (exit 0, incl. tsc + the CSP gate)
    ├── django-check.txt                           (no issues)
    ├── spectacular.txt                            (3 warnings / 116 errors — unchanged)
    ├── harness-doc-journeys.txt                   (8 passed — 4 journeys × desktop + mobile, freshly wiped harness)
    └── harness-required-suite.txt                 (the whole required profile: 134 passed / the 2 pre-existing tenant-launch failures)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/applications/official_document_jobs.py` | **new** — the durable job. Outbox coordinates (`JOB_CHANNEL="document"`, `JOB_EVENT_TYPE`, the `official_document:{app}:{type}` idempotency key), the four states, the stable failure codes, `OfficialDocumentJob` (+ `is_open` / `is_failed` / `setup_required` / `can_retry(is_staff=)` / `to_payload`), `NO_JOB_PAYLOAD`, `read_job` / `read_jobs`, `request_generation`, `_dispatch` / `mark_dispatched` / `mark_succeeded` / `mark_failed`, and `pending_jobs` / `sweep_pending_jobs` |
| `backend/apps/applications/tasks/official_document_sweep.py` | **new** — `sweep_pending_official_document_jobs_task`, the beat entry point over `sweep_pending_jobs` |
| `backend/apps/applications/official_document_views.py` | the five published statuses declared once; `_student_gate_open` kept byte-for-byte as the **issuance** policy and `_may_read_issued` added beside it; `_authorize_and_gate(for_issue=…)`; `_generation_status` as the one status derivation; `_request_generation` (commit → dispatch, `GenerationUnavailable` → 503); `historical` / `can_retry` / `job` on the envelope; `OfficialDocumentEmailView` (**new**) with `_application_owner_contact`, `_deliver_official_document_email` and `_audit_official_document_emailed`; the list read batching every job in one query |
| `backend/apps/applications/tasks/pdf_generation.py` | every early return and every failure path settles the job (`mark_succeeded` / `mark_failed(terminal=…)`), plus `_alert_staff_of_setup_failure` and `SETUP_ALERT_CAPABILITY = "tenant.profile.read"` |
| `backend/apps/applications/student_document_views.py` | `EmailSlipView` reduced to a **deprecated proxy** onto the canonical route, preserving the legacy `{"queued_id": …}` shape and adding deprecation headers |
| `backend/apps/applications/urls.py` | the one new route, declared **before** the `<str:document_type>` detail route so the converter cannot swallow `email/` |
| `backend/apps/common/email/messages/official_document.py` | **new** — the official-document email body |
| `backend/apps/common/email/render.py` | `official_document` registered in `_REGISTRY` |
| `backend/apps/common/notification_preferences.py` | `"official_document": CATEGORY_APPLICATION_UPDATES.key` in `TEMPLATE_CATEGORIES`, so the history states the class instead of `unknown` |
| `backend/config/settings/base.py` | `sweep-pending-official-document-jobs` on `CELERY_BEAT_SCHEDULE`, every 300 s |
| `scripts/authority_matrix_registry.py` | the email route registered; the detail route's `state_precondition` updated to name both policies |
| `backend/tests/unit/test_official_document_durability_10_4.py` | **new** — 67 cases (§9) |
| `backend/tests/unit/test_official_document_signed_download.py` | one case renamed onto the new truth: a stale, unrequested document is **not** a queue |
| `backend/tests/unit/test_email_slip_endpoint.py` | two legacy cases replaced by the proxy's actual contract (§9.1) |
| `backend/tests/unit/test_email_messages.py` | the message-type count assertion made registry-driven |
| `backend/tests/unit/test_view_auth_classification.py` | `OfficialDocumentEmailView` classified |
| `apps/admissions/src/services/officialDocuments.ts` | the `job` / `historical` / `can_retry` fields, the five statuses, and the canonical email call for **any** type |
| `apps/admissions/src/hooks/useOfficialDocument.ts` | `not_requested` maps to `idle`/`generating`, never `queued`; audience-aware copy (`OFFICIAL_DOCUMENT_STUDENT_UNAVAILABLE_MESSAGE`, `OFFICIAL_DOCUMENT_STUDENT_RETRY_MESSAGE`); `canRetry` / `isHistorical` / `job` from the server |
| `apps/admissions/src/hooks/useIssuedOfficialDocuments.ts` | **new** — asks the server what has been issued, because the read-existing policy is not computable in a browser |
| `apps/admissions/src/components/student/documents/OfficialDocumentRecovery.tsx` | **new** — the neutral student failure state: what happened, who is dealing with it, and a tenant-resolved route to a human |
| `apps/admissions/src/components/student/ApplicationSlipActions.tsx`, `DocumentButtons.tsx` | the recovery component, the `historical` affordance ("Issued copy on record", `data-historical`), the server's `can_retry`, and an action offered when **issuance permits it OR the server reports an artifact**. `DownloadReceiptButton.tsx` and `lib/officialDocumentGate.ts` were **not** changed here — the receipt button already consumed `useOfficialDocument` (task 8.3) and the gate mirror is still exactly the issuance policy |
| `apps/admissions/src/lib/tenantSupport.ts` | an `official_document` purpose on 8.3's resolver |
| `apps/admissions/tests/unit/officialDocumentDurability.test.tsx` | **new** — 22 cases |
| `apps/admissions/tests/unit/documentUiStates.test.tsx` | a router wrapper + brand stub for the new recovery state; **no case added or removed** |
| `apps/admissions/tests/harness-e2e/helpers/ops.ts` | `commitUndispatchedOfficialDocumentJob`, `sweepOfficialDocumentJobs`, `readOfficialDocumentJobRow` (§8.1) |
| `apps/admissions/tests/harness-e2e/required/official-document-durability.spec.ts` | **new** — the 4 required browser journeys, desktop and mobile |
| `docs/canonical-truth-map.md` | the official-document job states, the two policies, the canonical email route, and the Drift Guard Inventory entries |

---

## 1. What was wrong (STU-18, API-04)

STU-18:

> Official-document task enqueue failures can still return 202 queued, leaving
> permanent polling. Existing documents are hidden after terminal status, generic
> email is missing, and student errors expose tenant setup instructions.

The first clause was four lines of code:

```python
except Exception:
    # No reachable broker (brokerless env) or transient dispatch failure.
    logger.info("… returning derived queued status")
    return None
```

The caller answered `202 {"status": "queued"}` on that `None`. So with the broker
down the platform told the student *queued* while **nothing anywhere had recorded
that any work was wanted** — nobody would render it, no sweep could find it, and
the client polled a status that could never change. The GET path had the same
defect from the other direction: a permitted document that had never been
requested *at all* also read `queued`.

API-04 is the other half, on both sides of the wire:

> Frontend and backend expose duplicate legacy and official document paths.

## 2. The durable job (R13.11, R17.1, R17.4)

Design §17 states the rule:

> "Queued" means a committed durable record exists.

and §11.3 the consequence:

> A 202 response is returned only after a durable generation job is committed.
> Broker outage after commit is recovered by the dispatcher; failure before commit
> returns 503.

The record is a row in `outbox_events` — the table design §3 already names as the
platform's committed-job mechanism, and whose columns already are a job's
(`status`, `retry_count`, `error_message`, `processed_at`, a unique
`idempotency_key`). Identity is `(application, document_type)`, carried in the key
as `official_document:{application_id}:{document_type}`, so one live job per
document type makes every command fall out of it:

| Request arrives while… | What happens |
|---|---|
| no job exists | insert `pending` |
| `pending` / `dispatched` | the **same** job, untouched — the double-tap and the browser retry converge, and no attempt count is reset |
| `failed` | the same row returns to `pending` with its attempt count preserved — **retry is the same command** |
| `succeeded`, fingerprint moved | back to `pending`; the renderer itself decides reuse vs regenerate |

Four states, each fitting the stored `varchar(20)`:

```
pending     committed, not yet handed to a worker  → the ONLY "queued"
dispatched  handed to the broker                   → also "queued"
succeeded   the renderer finished (or reused)      → read the document
failed      terminal; error_message holds the stable code
```

`published` — what `apps.common.outbox` writes for a delivered notification or
email — is deliberately **not** part of this machine: those rows record something
that *has happened*, this one records work that is *wanted*.

### 2.1 Commit, then dispatch

```python
job = jobs.request_generation(application, document_type, dispatch=False)   # commits or raises
…
task_id = _enqueue_generation(application, document_type)                   # best-effort
```

`GenerationUnavailable` becomes `503 GENERATION_UNAVAILABLE` with
`retryable: true` and a message that says plainly that nothing was queued — which
is R13.11's own named alternative to a 202.

The order is asserted **structurally**, over the parsed AST of
`_request_generation` rather than over its text
(`test_the_dispatch_happens_after_the_commit`), for the reason 10.2 §10 recorded:
a grep guard can be satisfied by the module's own prose about the defect it fixed.

### 2.2 Why the dispatch failure is *not* an error the caller sees

Because the row is already committed. A dispatch failure costs a delay; the
reverse — dispatching work that was not recorded — is the defect. `mark_dispatched`
is conditional on `pending` for the same class of reason: a fast worker can finish
before the bookkeeping update lands, and an unconditional write would overwrite
`succeeded` with `dispatched` and put a finished job back in the queued set.

### 2.3 The dispatcher

`sweep_pending_official_document_jobs_task`, on the beat schedule every 300 s, in
the shape task 4.4 established for the domain-verification backlog. It picks up
two things:

- `pending` — committed but never dispatched (the broker-down path);
- `dispatched` older than `JOB_REDISPATCH_AFTER_SECONDS` (900) — handed to a worker
  that never answered, e.g. killed mid-render, which otherwise leaves a job that is
  neither finished nor recoverable.

The `idempotency_key__startswith` prefix filter comes **first**, so the scan uses
the `text_pattern_ops` index Postgres already has on that column rather than
walking every notification and email event the outbox has ever written — and
`test_the_sweep_never_touches_a_delivered_communication_row` pins that a delivered
communication is not swept.

## 3. Schema: nothing to migrate, and that was checked

No table, column, index, capability or role was added. The job reuses
`outbox_events` (`managed = False`), whose `status` is `varchar(20)` with no CHECK
— `test_every_job_state_fits_the_stored_column` asserts all four values fit, and
`test_the_job_reuses_the_existing_outbox_table` pins the table name and the
unmanaged flag.

`test_no_migration_ships_with_this_task` globs `backend/scripts/*.sql` for a `10_4`
or `official_document_job` script and asserts the list is empty. Independently:
`find backend/scripts -newermt "<the 10.4 window>"` returns nothing.

The one thing that *is* new on the wire is a route
(`…/official-documents/{document_type}/email/`), registered in
`scripts/authority_matrix_registry.py` and classified in
`test_view_auth_classification.py` (§10.2).

## 4. Terminal failure, and retry as the same command (R13.11)

### 4.1 Retry

There is no retry endpoint. `request_generation` returns a `failed` job to
`pending` with `retry_count` intact, so the POST the client already makes *is* the
retry — no second route, no second authority, no second audit action. The
affordance is the server's answer, not the client's guess:

```python
def can_retry(self, *, is_staff: bool) -> bool:
    if not self.is_failed:            return False
    if is_staff:                      return True
    return self.error_code in STUDENT_RETRYABLE_CODES
```

A tenant **setup** failure is not in `STUDENT_RETRYABLE_CODES`, because retrying it
changes nothing until a staff member configures the profile — offering it would be
the loop STU-18 describes with a nicer label on it. Staff get it, because they (or
a platform operator they escalate to) can fix the configuration first.

### 4.2 Every early return settles the job

`test_the_renderer_settles_every_early_return` walks the renderer's exits:

| Exit | Job outcome |
|---|---|
| application gone | `failed` / `APPLICATION_NOT_FOUND` |
| status no longer permits the type | `failed` / `STATUS_NOT_ELIGIBLE` |
| receipt with no settled payment | `failed` / `PAYMENT_NOT_FOUND` |
| current version reused | `succeeded` (reuse is a success, not a skip — the client stops polling) |
| rendered and committed | `succeeded` with `target_id` |
| unconfigured tenant profile | `failed` / the profile code, **terminal** |
| render error, retries remain | stays `pending` with the attempt count recorded — the work genuinely *is* outstanding, so `queued` is still true |
| render error, retries exhausted | `failed` / `RENDER_FAILED` |

## 5. Two policies, not one gate (R13.11, R13.2, design §11.3)

> "A terminal application may not create a new artifact, but the owner can
> continue to read a previously issued lawful document according to retention
> policy."

`_student_gate_open` is unchanged, byte-for-byte, and is now **only** the issuance
policy. `_may_read_issued` sits beside it, and `_authorize_and_gate(for_issue=…)`
picks which one applies: POST issuance, GET (and the email) read-existing.

Pre-10.4 the same gate answered both questions, and two facts made that bite
harder than it sounds:

- **`enrolled` is terminal.** The student who accepted their place — the successful
  outcome — lost the ability to re-read the offer letter that got them there;
- even without a terminal status, application `status` and `updated_at` are
  `Document_Fingerprint` inputs, so *any* later change made the stored artifact
  "not current". With the issue gate closed there was nothing to regenerate it
  with, so the read said `queued` **forever**.

### 5.1 What the read-existing policy admits

Exactly one condition — a stored artifact exists — and each clause of that is
load-bearing:

- **a stored artifact must exist.** It conjures nothing and widens no *types*: an
  application that was never approved has no acceptance letter to read;
- **it must be platform-issued.** `document` comes from `_current_official_version`,
  which selects `system_generated`, non-deleted rows only — so a student upload of
  the same type is not reachable
  (`test_a_student_upload_of_the_same_type_is_not_reachable`);
- **retention is the deletion state.** The platform records its retention decision
  by deleting/soft-deleting the row (task 7.5), which
  `_current_official_version` already honours. A retained row is a lawful read; a
  retired one is simply absent, not "historical"
  (`test_a_retired_artifact_is_absent_rather_than_historical`).

### 5.2 Nothing else is relaxed

`test_another_student_is_masked_identically_to_an_unknown_id` and
`test_another_tenants_admin_is_masked_on_the_historical_read`: the read-existing
path returns the same masked 404 the issuance path does. A terminal application
with nothing issued is still a masked 404, and re-issuance from a terminal
application is still refused.

### 5.3 Precedence

`_generation_status` is the one place a status is derived, and the order is:

1. a **current** artifact → `ready`;
2. an **open job** → `queued` (the only honest one);
3. a **terminal failure** → `failed` / `setup_required`;
4. a **previously issued** artifact when issuance is refused → `ready` +
   `historical: true`;
5. nothing → `not_requested`.

Step 4 sits **below** step 3 deliberately: if the platform tried and failed to
refresh a document, the requester is told that, not handed a silently older file
(`test_a_failure_is_reported_before_a_historical_artifact`).

`test_there_is_no_second_generation_status_vocabulary` AST-parses the module and
pins the declared `STATUS_*` set to exactly those five.

## 6. One official-document email (R13.5, API-04)

`OfficialDocumentEmailView` is type-agnostic: it takes `document_type` from the
path and runs the same authorize-and-gate the read runs, so it serves all five
types where the pre-10.4 service could only email the slip. The test parameterises
**three** of them (slip / acceptance letter / conditional offer, each at its
eligible status); the two receipt types are exercised through the status and
gating suites rather than a fourth email case. Three things make it canonical
rather than a second copy of `EmailSlipView`:

- **the same eligibility the read uses.** It reuses `_authorize_and_gate` with
  `for_issue=False`, so an issued document can be emailed even once the application
  is terminal — the read-existing policy applies to reading a document out to
  yourself, which is what an email is. A document that is not ready is `409
  DOCUMENT_NOT_READY` and **nothing is sent**, rather than an email arriving that
  points at a document that is not there;
- **it goes through the one delivery gate.** 10.1's `deliver_message` writes the
  inbox record, decides the email channel, and attaches the delivery record — so
  the history shows this message's category (`application_updates`, registered in
  `TEMPLATE_CATEGORIES`) and per-channel state instead of `unknown`. `EmailSlipView`
  called `queue_email` directly and therefore appeared in no history at all;
- **the body is the platform's** — `render_message("official_document", …)`, not an
  inline HTML table built in a view.

Idempotency is per issued artifact per recipient
(`official_document_email:{document_id}:{recipient}`), so a double-tapped "Email it
to me" converges; a **regenerated** document is a different artifact and gets its
own delivery.

### 6.1 The legacy route is a proxy, not a second implementation

`POST /applications/{id}/email-slip/` still exists — R13.5 asks for legacy callers
to be measured and removed after **zero use**, so removing it here would skip the
measurement. It is marked `deprecated=True` in the schema, answers with
`Deprecation: true` and a `Link: …; rel="successor-version"` naming the canonical
route, delegates to it, and preserves the legacy `{"queued_id": …}` shape with the
canonical `delivery` record alongside.

### 6.2 An official record is not redirectable

The recipient is the application **owner's** account address, read from the
`Profile` behind `application.user_id` rather than the application's own `email`
snapshot (a snapshot can be stale by exactly the amount of time that makes a
misdelivery possible). A caller may pass `email` to be explicit, and the owner's
own address is accepted; anything else is `400 RECIPIENT_NOT_PERMITTED`. Pre-10.4
any in-scope staff member could have a student's official document mailed to an
address of their choosing.

The audit records ids and the document type only —
`test_the_email_is_audited_without_the_recipient_address` asserts the address is
absent.

## 7. The student's failure state, and the school's (R13.5, STU-18)

The pre-10.4 student error was the tenant's runbook:

> "Tenant document setup is incomplete. Configure the document profile, template,
> logo, and signature before generating this document."

Two things are wrong with showing that to an applicant: it asks them to do work
only a school operator can do, and it discloses that the school's configuration is
incomplete. The split is now by **audience** — the same failure, two messages:

| Audience | Message | Retry offered |
|---|---|---|
| staff | names the configuration to fix (the sentence above, unchanged) | yes |
| student | "This document is not available to download yet. The admissions office has been notified and will make it available." | no |

`OfficialDocumentRecovery` renders the student half as three things and no more:
what happened, that the office was told, and a route to a human resolved by 8.3's
`resolveTenantSupportContact` — the resolved school's own admissions address, or
the neutral in-app `/contact` route. Never a hardcoded address and never an
example tenant's (STU-24).

The school's half is not dropped. `_alert_staff_of_setup_failure` delivers an inbox
work item to **that application's own** institution's staff, and it introduces no
new machinery:

- **recipients** come from 9.5's `TenantStaffRecipientService` — active
  membership/grant holders of `SETUP_ALERT_CAPABILITY = "tenant.profile.read"`,
  resolved through `AdminCapabilityService`, never a global admin broadcast, and
  Super_Admins excluded by that service on purpose;
- **the fan-out** is 10.1's staff shape: `create_notifications_bulk` with a
  per-recipient idempotency key, plus `staff_delivery_metadata` so the history says
  email was *not applicable* rather than `unknown`;
- **the applicant is excluded** from a work item about their own application's
  configuration;
- **idempotent per (document type, error code, recipient)** — the same failure twice
  is one work item, a *different* failure is a new one;
- **a school with no authorized recipient leaves a logged gap** rather than
  broadcasting wider (`test_a_school_with_no_authorized_recipient_leaves_a_logged_gap`
  asserts the log, not a fallback).

Why `tenant.profile.read` and not `tenant.application.review`: this is a
configuration problem with the school, not a decision about one applicant, and read
authority over the school's profile is what makes the alert actionable.
`test_the_alert_capability_is_a_published_tenant_capability` pins it to the
catalogue.

## 8. Part 4: the legacy callers (API-04)

Every first-party slip / letter / receipt path now goes through
`services/officialDocuments.ts`:

| Surface | Path |
|---|---|
| student slip (status page, wizard) | `ApplicationSlipActions` → `useOfficialDocument('application_slip')` |
| student receipt | `DownloadReceiptButton` → `useOfficialDocument('payment_receipt')` (already so since 8.3) |
| student letters / all types | `DocumentButtons` + `useIssuedOfficialDocuments` |
| admin | `AdminOfficialDocumentsPanel` → `useAdminOfficialDocuments` |
| slip email | the canonical email route |

Measured, not asserted:

- `applicationService.generate{ApplicationSlip,AcceptanceLetter,ConditionalOffer,PaymentReceipt,FinanceReceipt}`
  — **zero call sites** outside `services/applications.ts` itself (the only remaining
  references are in `tests/property/services.property.test.ts`, which pins their URL
  construction). They are kept for the R13.5 measurement window, like the email
  route;
- `slipService.createApplicationSlip` (the client `@/lib/pdf` renderer) — **zero
  production call sites**; the only caller left is its own unit test;
- `@/lib/pdf` is imported from `src/pages/dev/*` and `src/lib/slipService.ts` only —
  no student or admin official path reaches it, which is what
  `documentFlowDriftGuard.test.ts` already enforces.

### 8.1 The three harness levers

The broker-down journey needs a broker outage, and the honest way to produce one is
not to break a container:

| Lever | What it is |
|---|---|
| `commitUndispatchedOfficialDocumentJob` | calls the platform's **own** `official_document_jobs.request_generation(..., dispatch=False)` — literally the function the view calls, with the flag the view passes, because the view dispatches separately precisely so commit and dispatch are two observable steps. Nothing is written by hand and no status is faked |
| `sweepOfficialDocumentJobs` | the platform's own `sweep_pending_jobs()`, i.e. the beat task, run on demand |
| `readOfficialDocumentJobRow` | reads the `outbox_events` row through the container, **not** the published envelope — the whole claim of R13.11 is that the two agree, and asserting the envelope against itself would prove nothing |

A dead-broker container was the alternative and it is worse evidence: stopping the
worker leaves dispatch *succeeding*, which proves the wrong thing, and stopping
Redis takes the cache and the session store down with it.

## 9. The task's own suites

`backend/tests/unit/test_official_document_durability_10_4.py` — **67 cases**, all
passing:

| Class | Cases | What it holds |
|---|---|---|
| `TestDurableJob` | 6 | the record commits before the answer; a commit failure is a 503 that queues nothing; idempotent while open; one identity per (application, type); every state fits the column; the payload carries no applicant data |
| `TestBrokerDownRecovery` | 7 | §2.3 |
| `TestNoPhantomQueue` | 5 | an unrequested document is not queued; `queued` only while a job is open; the vocabulary is exactly the five; the list omits types with nothing to report; the list reads every job in **one** query |
| `TestTerminalFailureAndRetry` | 6 | §4 |
| `TestIssueVersusRead` | 15 | §5 (10 functions, one parameterised over the five terminal statuses) |
| `TestCanonicalEmail` | 15 | §6 (13 functions, one parameterised over three document types) |
| `TestStaffSetupAlert` | 6 | §7 |
| `TestOneAuthority` | 7 | no migration; the outbox table reused; no second status vocabulary; the setup-code set shared not restated; no role string compared in the job service; dispatch after commit; the views hold no render logic |

`apps/admissions/tests/unit/officialDocumentDurability.test.tsx` — **22 cases**: the
`not_requested` → `idle`/`generating` mapping, the audience-aware copy, the absent
retry for a setup failure, the historical affordance, and the neutral support
resolution.

### 9.1 Pre-existing tests moved onto the new truth

Four edits, all of them a test that pinned the *old* behaviour:

- `test_official_document_signed_download.py::test_status_reports_queued_when_current_document_is_stale`
  → `…test_status_reports_no_queue_when_current_document_is_stale_and_unrequested`.
  The old name **was** the defect: a stale, unrequested document reported `queued`;
- `test_email_slip_endpoint.py` — `test_in_scope_staff_can_queue_email_slip` and the
  tracking-code-fallback case replaced by
  `test_nothing_is_emailed_for_a_slip_that_was_never_issued` and
  `test_an_official_slip_is_not_redirectable_through_the_legacy_route`. Both old
  cases asserted properties the canonical route deliberately removed: emailing a
  slip that was never issued, and emailing it to an arbitrary address;
- `test_email_messages.py::test_available_message_types_exposes_seven_messages`
  → `…exposes_the_registered_messages`, driven by the registry rather than a
  hardcoded count, because there are now eight;
- `documentUiStates.test.tsx` — a router wrapper and a `usePortalBrand` stub for the
  new recovery state. **No case added or removed.**

### 9.2 No property test was added

There is no numbered PBT sub-task for 10.4, and unlike 10.3 (5 fast-check
invariants) or 8.3 (6) this task added none. The invariants that would be natural
candidates — job identity, request idempotence, the `can_retry` implication — are
covered as example cases in `TestDurableJob` and `TestTerminalFailureAndRetry`. This
is a gap named rather than papered over: a fast-check pass over the
`(state, error_code, is_staff)` space would strengthen §4.1.

## 10. Verification (verbatim)

### 10.1 Backend suites, against a measured baseline

```
cd backend && DATABASE_URL=<mihas_localtest 5433> TESTING=1 .venv/bin/python3 -m pytest \
  $(cat raw/selection.txt) -q --tb=no -rfE -p no:randomly
```

against the isolated `mihas_localtest` Postgres (the `backend-postgres-1` container
on `127.0.0.1:5433`). Neon and production were not touched. The selection is the
document / official-document / email / notification / communication lane —
[`selection.txt`](raw/selection.txt).

| Run | Files | Result |
|---|---|---|
| **baseline** — the same selection, measured **before** any of this task's code existed | 54 | **2 failed, 623 passed**, 4 skipped, 6 errors |
| **10.4 (candidate)** | 55 | **2 failed, 693 passed**, 4 skipped, 6 errors |

[`candidate.txt`](raw/candidate.txt) / [`baseline.txt`](raw/baseline.txt), with the
sorted failing+erroring sets in
[`candidate-failing-set.txt`](raw/candidate-failing-set.txt) and
[`baseline-failing-set.txt`](raw/baseline-failing-set.txt).

- **New failures: 0.** `comm -23` over the two sorted sets (**8 entries each**) is
  empty. `comm -13` is also empty — nothing was fixed either, which is the honest
  reading: this task claims no repair of another lane's failure.
- **+70 passing**: the task's own 67-case suite, plus 3 net cases in the four
  pre-existing files §9.1 moved onto the new truth.
- The candidate's selection differs from the baseline's by exactly one file — this
  task's own new suite.

The 2 failures and 6 errors present in **both** runs are the pre-existing clusters
catalogued from [9.1](../9.1/README.md) onward, and they are **not** this task's:

```
FAILED tests/property/test_communication_template_properties.py::TestCommunicationTemplateProperty22::test_resolution_priority
FAILED tests/integration/test_communication_template_coverage.py::TestCommunicationTemplateCoverage::test_all_keys_seeded
6 ERROR tests/unit/test_review_notifications.py  (3 approval + 3 rejection setups)
```

They are the communication-template seeding/resolution cluster and the
`test_review_notifications` setup cluster. They appear byte-identically in
`baseline-failing-set.txt`, which is what makes them attributable elsewhere rather
than here — and it matters for this lane specifically, because 10.4 touches
`apps/common/email/render.py` and `notification_preferences.py`. The neighbouring
suites that would have caught a regression there —
`test_communication_service.py`, `test_communications_history.py`,
`test_notification_preferences_10_1.py`, `test_email_component_system.py`,
`test_email_wiring.py`, `test_outbox_helpers.py` — appear in **neither** set: they
pass on both sides.

### 10.2 The authority matrix and the view classification

`tests/unit/test_authority_matrix_v2.py` fails on **one stale entry**,
`/api/v1/applications/<uuid:application_id>/preview-summary/` — a route **task 7.4
deleted** whose registry entry its lane left behind, already recorded by
[9.5 §11.1](../9.5/README.md), [10.2 §12.2](../10.2/README.md) and
[10.3 §10.2](../10.3/README.md). Unresolved and weak-bucket are both **0**,
including the route this task adds: the email route is registered with `owner(...)`,
its two policies named in `state_precondition`, and
`audit_event="official_document.emailed"`.

`test_view_auth_classification.py::test_all_api_views_are_classified` reports **38**
unclassified views — the same number and the same list as before this task, because
`OfficialDocumentEmailView` **was** classified here (owner + shared scope path with
404 masking, the same bucket as the detail read it reuses). The 38 belong to other
lanes. [`authority-matrix.txt`](raw/authority-matrix.txt).

### 10.3 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 4195 passed / 1 skipped** (478 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **18 errors, 0 warnings** across **15 files** — `diff` against 10.3's file list is **empty** | [`frontend-lint.txt`](raw/frontend-lint.txt), [`frontend-lint-files.txt`](raw/frontend-lint-files.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |

The pre-10.4 frontend baseline is [10.3 §10.3](../10.3/README.md): **1 failed /
4173 passed / 1 skipped** across 477 files, 18 lint errors across 15 files. So:
**+22 passing, +1 test file, the same single pre-existing failure, and an identical
lint file set** — and the +22 is exactly `officialDocumentDurability.test.tsx`
(§9). The pre-existing failure is
[`authPageFormMarkup.test.tsx`](../../../apps/admissions/tests/unit/authPageFormMarkup.test.tsx),
the SignUp helper-copy conflict catalogued from 8.1 onward. None of the 15 lint
files is one this task created; the two harness files in the list
(`harness-fixtures.ts`, `helpers/ops.ts`) carry unused-eslint-disable errors that
predate this task's additions to `ops.ts`.

### 10.4 Django system checks

`cd backend && .venv/bin/python3 manage.py check`

```
LENCO_API_SECRET_KEY is not set — payment processing will be unavailable.
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`django-check.txt`](raw/django-check.txt). The LENCO line is the expected local-dev
notice — this machine holds no provider credential.

> **`manage.py check` must run with the repo's own environment.** Exporting a
> `TESTING=1` or a substitute `REDIS_URL` first flips `CACHES` to `LocMemCache`
> (`base.py` `_is_testing`) and the check then reports
> `django_ratelimit.E003 — not a shared cache`. That is the override talking, not
> the platform (recorded by 8.3 §7.7 through 10.3 §10.4; re-confirmed here).

### 10.5 OpenAPI schema

`cd backend && .venv/bin/python3 manage.py spectacular --file /tmp/schema-104.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — **identical counts** to 8.2 through 10.3,
despite this task adding an operation. The new
`applications_official_document_email` is fully annotated (path parameters, request
serializer, and the 200/400/404/409 responses), so it introduces no warning;
`applications_email_slip` is now `deprecated: true` with its request/response shape
unchanged. The three remaining warnings are the pre-existing collisions on
`/api/v1/admin/intakes/`, `/api/v2/admin/change-requests/` and
`/api/v2/admin/onboarding/`.

### 10.6 Browser journeys

`cd apps/admissions && HARNESS_PW_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:8090 bunx playwright test -c playwright.harness.config.ts --project=chromium-required --project=mobile-required tests/harness-e2e/required/official-document-durability.spec.ts`

```
Running 8 tests using 1 worker
  … 8 passed (44.1s)
```

[`harness-doc-journeys.txt`](raw/harness-doc-journeys.txt). Run against the task-0.4
isolated harness brought up **fresh** (`harness/bin/harness up`, which wipes
volumes, rebuilds the backend image and runs `bun run build` for the SPA), with the
strict `harness-fixtures.ts` gates active: zero skips, no console errors, no
unhandled exceptions, no unasserted failed requests.

`HARNESS_PW_CHANNEL=chrome` is the config's documented escape hatch: Playwright's
bundled Chromium has no build for this machine, so the required projects run against
the system Chrome. It changes the browser binary, not the assertions.

Four harness details worth recording:

- **the harness serves the built SPA** (`apps/admissions/dist`) and runs the backend
  from a **built image**, so a source change needs `bun run build` (and a backend
  change needs `harness up`) before it is under test. Both were done before these
  runs;
- **every state is reached through the platform's own commands**: the slip is issued
  through the canonical POST, the terminal status through the **student's own**
  withdrawal (`withdrawn` is the one terminal status a student can reach
  themselves, so nothing here is an operator writing a status), and the outage
  through the platform's own commit call (§8.1);
- **the download assertion is on the popup's settled URL**, because a
  `target="_blank"` download's `url()` is `about:blank` for the instant between the
  window opening and the navigation committing. What is stubbed is the object
  store's *reachability* (`route.fulfill` on the signed host), not the URL — the
  claim is that the browser went to the backend-signed object rather than to a
  `blob:` a client renderer produced;
- **the setup-failure journey reads the staff work item as the staff member**, from
  a separate API context — because *who receives it* is the claim, and 9.5's
  resolver excludes Super_Admins on purpose, so a platform operator's inbox would
  prove the opposite of what is wanted.

### 10.7 The whole required browser profile

`… --project=chromium-required --project=mobile-required` (no spec filter)

```
2 failed
  [chromium-required] › required/tenant-launch.spec.ts:139:5 › … the wizard exposes program / intake / fee / routing steps on mobile
  [mobile-required]   › required/tenant-launch.spec.ts:139:5 › … the wizard exposes program / intake / fee / routing steps on mobile
134 passed (8.8m)
```

[`harness-required-suite.txt`](raw/harness-required-suite.txt). The two failures are
the locator-ambiguity failures [10.1 §6.5](../10.1/slice-2-frontend.md) already
**measured** as pre-existing (`getByText('Fees', …).first()` resolving to the admin
sidebar's hidden "Program Fees" item). 10.3's profile was **126 passed / the same 2
failed**; this one is **134 passed / the same 2 failed** — the +8 being this task's
journeys. Every earlier lane's journeys were re-run as part of this profile and
pass, which matters here because this task edits `DocumentButtons`,
`ApplicationSlipActions`, `DownloadReceiptButton`, `useOfficialDocument` and the
email path that 10.1's communications journeys read.

The harness was torn down (`harness/bin/harness down`, which wipes volumes) after
the runs above.

### 10.8 Failures introduced by this task

**Zero**, against measured baselines rather than assertion:

| Scope | Evidence |
|---|---|
| Backend document/official-document/email/notification suites | baseline 2 failed / 623 passed → 2 / **693**; the new-failure diff is empty over 8 entries each side (§10.1) |
| Authority matrix / view classification | the same single stale entry (0 unresolved, 0 weak-bucket, **including this task's new route**) and the same 38 unclassified views (§10.2) |
| Frontend | the same single pre-existing failure; **18** lint errors across an **identical** 15-file set, none introduced (§10.3) |
| Build / check / schema | exit 0, no issues, **3 warnings / 116 errors** unchanged with one operation added and one deprecated (§10.3–10.5) |
| Browser | 8/8 on a freshly wiped harness, both viewports, zero skips; the whole required profile 134 passed with the same 2 pre-existing failures (§10.6–10.7) |

The four failures this lane deliberately did **not** touch, because they belong
elsewhere: the pre-existing `authPageFormMarkup` frontend failure, the 18 lint
errors, the stale `preview-summary` registry entry, and the 38 unclassified views.

### 10.9 What was re-run when this README was written

The run was interrupted before the README existed, so the gates below were **re-run
against the current working tree** to confirm the artifacts still describe it. The
rest of §10 is read from the artifacts captured with the change.

| Re-run | Result |
|---|---|
| `pytest tests/unit/test_official_document_durability_10_4.py` | **67 passed** |
| `pytest` over the 11 neighbouring official-document / email / slip suites (incl. all four §9.1 edits) | **123 passed** |
| `pytest tests/unit/test_authority_matrix_v2.py tests/unit/test_view_auth_classification.py` | **3 failed / 37 passed** — the same 3 as [`authority-matrix.txt`](raw/authority-matrix.txt) |
| `manage.py spectacular` | **3 warnings / 116 errors**, and `/api/v1/applications/{application_id}/official-documents/{document_type}/email/` present with `applications_email_slip` marked deprecated |
| `bun run test -- --run officialDocumentDurability documentUiStates documentFlowDriftGuard slipServiceEmail` | **52 passed** (4 files) |
| `find backend/scripts -newermt <10.4 window>` | empty — no SQL script ships with this task |

The browser journeys were **not** re-run: they passed and are recorded
([`harness-doc-journeys.txt`](raw/harness-doc-journeys.txt),
[`harness-required-suite.txt`](raw/harness-required-suite.txt)), and re-running them
would require bringing the harness up and tearing it down again without changing
what is claimed. The full backend selection, the full frontend suite, `bun run
lint`, `bun run build` and `manage.py check` were also not re-run.

## 11. Not claimed here

- **The legacy paths are deprecated, not deleted.** `POST …/email-slip/` and the
  five `applicationService.generate*` methods still exist. R13.5 asks for legacy
  callers to be *measured* and removed after zero use, and §8 is that measurement
  (zero production call sites) — deleting them in the same task would remove the
  window the requirement asks for. The removal belongs to task **10.6**, which owns
  the route consolidation.
- **`slipService.ts` and `@/lib/pdf` are not removed.** They are unreachable from
  every first-party official path (§8) and `documentFlowDriftGuard.test.ts` keeps
  them that way, but `src/pages/dev/*` still uses them for non-official previews,
  which the steering rules explicitly permit.
- **The job is not a general-purpose queue.** It records document generation only,
  on its own `document` channel. Other work that would benefit from the same
  commit-before-answer shape — bulk exports, for instance — is untouched.
- **`_get_authorized_application` fetches, then scopes.** The row is loaded with
  `.get()` before `AccessScopeService.filter_applications` is applied, so this is
  not literally "scope before lookup". Nothing is disclosed by it: the refusal is
  the byte-identical masked 404 that a genuinely unknown id produces, and
  `test_another_student_is_masked_identically_to_an_unknown_id` /
  `test_another_tenants_admin_is_masked_on_the_historical_read` pin that from both
  sides. The shape is the pre-10.4 module's, mirroring
  `document_storage_views._get_authorized_document`; converting it to a scoped
  queryset would change the authorization path of the *whole* official-document
  surface, which is not this task's subject.
- **A role string still selects the actor class in the views.** `role in ("admin",
  "reviewer")` picks *which* policy applies (staff → scope only; student → the
  per-type gate) and, in `_is_staff_requester`, which failure copy and retry
  affordance to render. It grants nothing: staff visibility comes from
  `AccessScopeService` (memberships and grants), a bare `admin` with no membership
  gets an empty scope and a masked 404, and the recipients of the staff alert
  resolve through `AdminCapabilityService`. Both reads are carried over unchanged
  from the pre-10.4 module. The **job service** compares no role string at all, and
  `test_no_role_string_is_compared_in_the_job_service` AST-asserts it.
- **R13.7's whole student journey is not claimed here.** R13.7 asks for one browser
  journey covering payment recovery, amendment, interview, communication, decision,
  official-document download and terminal tracking end to end. This task adds the
  **official-document** half of it (download, the terminal read, and the email
  landing in the communications history) on desktop and mobile; the single
  golden-lifecycle journey belongs to task **10.6**, which owns the canonical
  workspace those surfaces will be reached from.
- **The document-generation metrics R17.3 names are not added.** Failures are
  observable through the job row's terminal state, the audit events, and the logs;
  a `document_jobs` counter family is a metrics-lane change with its own label
  policy (`payment_metrics`' PII guardrail is the precedent).
- **No new capability or route beyond the email one.** The catalogue stays at 17
  `platform.*` + 17 `tenant.*`; `SETUP_ALERT_CAPABILITY` reuses the published
  `tenant.profile.read`.
- **`finance_receipt` is still not student-issuable.** `_student_gate_open` returns
  `False` for it, as before; it is reachable by in-scope staff and readable
  historically once issued. Whether a student should ever be able to request one is
  a fee-administration question, not this task's.
- **The renderer's own retry policy is unchanged.** `max_retries=3` with the 60 s ×
  2ⁿ backoff is the same; `MAX_RENDER_ATTEMPTS = 4` in the job module is read from
  it rather than declared as a second policy.
- **No property-based test** (§9.2), and no numbered spec property is claimed.
