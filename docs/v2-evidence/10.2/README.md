# Task 10.2 — Implement condition evidence and amendment history

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Evidence index for task **10.2** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 10.2 Implement condition evidence and amendment history
  - Add condition-specific upload/comment/replace/status/reason/reminder workflow.
  - Add owner-scoped amendment list/detail/status and same-field pending uniqueness.
  - _Requirements: R13.2-R13.4, R13.9-R13.10_
  - _Findings: STU-16, STU-17, AUTH-06_
  - _Evidence: condition rejection/replacement and amendment approve/reject journeys_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-08 (UTC).
- **Closes the two things [9.5 §12](../9.5/README.md) deferred by name**, and
  redoes nothing else from it. 9.5 took the amendment *recipient scope* and the
  *review transition lock*; this task takes the **same-field pending uniqueness**
  and the **owner-scoped list/detail/status**. `MAX_PENDING_AMENDMENTS` stays **3**,
  application-wide. It reuses, rather than re-implements: task **7.3**'s staged
  evidence command (immutable versions, one-current provenance, checksum, storage
  compensation) and its append-only `document_verification_events`; task **10.1**'s
  `deliver_message` gate, published categories and `staff_delivery_metadata`; 9.5's
  `TenantStaffRecipientService` fan-out; 9.4's `resolve_scoped_application` +
  versioned-command seam; and 2.2's `authorize_owned_application` 404 mask.
- PBT: task 10.2 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`.
- Schema: **no migration.** No table, column, index, capability or role was added,
  and no SQL script ships under `backend/scripts/`. §3 records how that was
  achieved and how the claim is verified. Neon and production were not touched; the
  only databases used were the throwaway `mihas_localtest` Postgres and the task-0.4
  harness. **No Neon branch was created** (the branch limit is exceeded and nothing
  needed proving) — the two facts the design *would* have needed a branch to check
  were read **read-only** from the Neon default branch (`wild-bar-37055823`).

## The Required_Evidence claim

The `_Evidence:` line names **four** journeys, two per finding.

**Condition rejection and replacement — STU-16.**

| Where | What it proves |
|---|---|
| journeys 1 and 2 (below) | a student attaches evidence, is asked for something different **with a reason they can read on their own page**, is offered a replacement control rather than a dead end, and the replacement supersedes version 1 without destroying it — then the school accepts it and the condition offers nothing further |
| [`test_condition_evidence_amendment_history_10_2.py::TestStudentEvidenceCommand`](../../../backend/tests/unit/test_condition_evidence_amendment_history_10_2.py) (7 cases) | the endpoint's half: the transition, the comment on the version's own history row, the two immutable versions with exactly one current, the full rejection→replacement→acceptance sequence, a terminal condition refusing evidence **before the file is read**, an unsupported type, and an `Idempotency-Key` replay that does not become version 2 |
| `…::TestConditionReviewCommand` (7) | three outcomes; `changes_required` and `waived` refused without a reason; an unknown outcome refused by the contract; a second decision on a decided condition is a 409; the review re-reads under a lock; and the decision is audited with the reason and no applicant field |
| [`conditionEvidenceAmendmentHistory.test.tsx`](../../../apps/admissions/tests/unit/conditionEvidenceAmendmentHistory.test.tsx) (13 of 23) | the rendering: the reviewer's reason and a replacement control on a rejected condition, the server's own definition rendered rather than derived copy, nothing offered on a satisfied one, a status never by colour alone, and the file + note passed straight through |

**Amendment approve and reject — STU-17.**

| Where | What it proves |
|---|---|
| journeys 3 and 4 | a request appears in the student's **own** history as pending, is approved, and the history says so with the value applied; then a second pending request for the same field is refused (409, naming the request in flight), the school declines the first, the student sees "rejected", and the field is requestable again |
| `…::TestAmendmentHistory` (7) | the registered `{page, pageSize, totalCount, results}` envelope, the status definition travelling with each row, **no reviewer identity**, the detail's extra fields, another student's amendment masked identically to an unknown id, staff not reading the student surface, and a list scoped to its own application |
| `…::TestSameFieldPendingUniqueness` (6) | the 409 and its `pending_amendment_id`, a different field unaffected, the same field requestable once reviewed, the application-wide cap still 3, the check running **inside** the lock, and the service raising a conflict rather than a validation error |

Why the browser is required, and not only an API test: **STU-16 is a missing
surface.** "A student can send evidence, be told what was wrong with it, and send a
replacement" is a claim about controls that have to exist on screen — before this
task the conditions card rendered a description, a deadline and an upper-cased
status, with no write path at all. An endpoint test can prove a command works; only
the browser can prove the student is offered it. STU-17 is the same shape from the
other direction: the amendment *form* already existed, and the defect was that
nothing showed the student what happened afterwards.

### The 4 required journeys

[`condition-evidence-amendment-history.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/condition-evidence-amendment-history.spec.ts)
— **4 journeys × 2 viewports = 8, all passing on a freshly wiped harness with zero
skips** ([`raw/harness-condition-amendment-journeys.txt`](raw/harness-condition-amendment-journeys.txt)):

| Journey | The claim it settles |
|---|---|
| **rejection** | the student's own page carries an upload control for an open condition; after a reviewer asks for something different, the page shows `CHANGES REQUIRED`, **the reviewer's sentence**, and a control to send a replacement — and the outcome also arrived as a durable message |
| **replacement** | the replacement becomes version 2, the page says an earlier version is kept, the server reports `evidence_versions: 2` with one superseded row, the append-only history holds **both** submissions and the rejection, and after acceptance the condition is `met` with `allowed_actions: []` and no control on screen |
| **amendment approved** | the request submitted through the real form appears in the student's history as `PENDING` with the server's definition of pending; after approval the history reads `APPROVED`, and the detail read confirms `is_terminal`, a `reviewed_at`, the original reason — and **no `reviewed_by` key** |
| **amendment rejected + duplicate pending** | a second pending request for `residence_town` is **409 `AMENDMENT_ALREADY_PENDING`** naming the first request's id, a *different* field is still accepted, the declined request renders as `REJECTED` with its definition, and the same field is then requestable again |

## What this task establishes

1. **A conditional offer is something a student can act on.** Per-condition
   evidence, an optional note, replacement, a review with three outcomes, a
   rejection reason the student reads, a history, and a reminder that arrives
   *before* the deadline rather than after it (§1).
2. **Condition evidence is a document version, not a new pipeline.** Task 7.3
   already owns immutable versions, checksums, staged writes and compensation, so
   this task adds a per-condition `document_type` and inherits all of it —
   including the database-enforced one-current slot, which now means *one current
   evidence version per condition* (§2).
3. **The condition lifecycle is design §11.2, declared once**, and spelled with
   the values the platform already stores (§2.1). The pre-existing two-outcome
   `verify` route now consults the same table, so the two front doors cannot
   disagree about which conditions may be decided (§6).
4. **A rejection without a reason is not a decision.** `changes_required` and
   `waived` require one, and it commits in the same lock as the status — so a
   student cannot read "changes required" without being able to read why (§3).
5. **The condition read is server-authored, including its copy and its
   permissions.** Each state ships a definition, who it is waiting on, and the
   actions *this* reader may take — different for the owner and for staff (§4).
6. **`evidence_submitted` is not expirable.** The deadline sweep chases the states
   the **student** owes; auto-rejecting an applicant because the school has not
   reviewed their evidence yet is the platform punishing its own queue (§5.2).
7. **Two pending amendments for one field are two answers to one question**, and
   the second is now refused with the id of the first (§7).
8. **A student can see what they asked for and where it stands** — with the
   status definition published, and without being told which member of staff
   decided (§8).
9. **Every condition message goes through task 10.1's one gate** with a published
   category: a student outcome is mandatory `application_updates` and may use
   email, a staff work item is inbox-only *and says so* (§9).
10. **No migration was needed, and that was checked rather than assumed** (§3).

## Files

```
docs/v2-evidence/10.2/
├── README.md                                     ← this index
└── raw/
    ├── candidate.txt                                 (68 files: 25 failed / 821 passed / 36 errors)
    ├── baseline.txt                                  (the SAME selection before this task: 25 / 760 / 36)
    ├── candidate-failing-set.txt                     (61 sorted entries)
    ├── baseline-failing-set.txt                      (61 sorted entries — comm -23 and comm -13 both empty)
    ├── frontend-test.txt                             (1 pre-existing failure / 4146 passed / 1 skipped, 475 files)
    ├── frontend-lint.txt                             (18 errors)
    ├── frontend-lint-files.txt                       (the 15 files those errors are in — none of them this task's)
    ├── frontend-build.txt                            (exit 0, incl. tsc + the CSP gate)
    ├── django-check.txt                              (no issues)
    ├── spectacular.txt                               (3 warnings / 116 errors — unchanged)
    ├── harness-condition-amendment-journeys.txt      (8 passed — 4 journeys × desktop + mobile, freshly wiped harness)
    └── harness-required-suite.txt                    (the whole required profile: 118 passed / the 2 pre-existing tenant-launch failures)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/applications/condition_evidence_service.py` | **new** (1319 lines) — the one condition authority: `ConditionStateMachine` (design §11.2 over the stored values), the state vocabulary with a definition and a `waiting_on` per state, `evidence_document_type`, `submit_evidence` (task 7.3's command + the condition transition under a lock + the comment on the version's history row), `review_condition` (three outcomes, reason-required, locked, audited), `condition_payload` / `conditions_payload` / `condition_vocabulary` / `allowed_actions`, the two audit actions, `notify_student_of_condition_review` and `notify_staff_of_condition_evidence` (both through 10.1's gate), and the reminder windows + `conditions_due_for_reminder` / `send_condition_reminder` / `already_reminded` |
| `backend/apps/applications/condition_views.py` | **new** (253 lines) — `ApplicationConditionDetailView` (owner or scoped staff), `ApplicationConditionEvidenceView` (owner-only, multipart), `ApplicationConditionReviewView` (`tenant.application.review`, scope before lookup, versioned command). The views hold **no** lifecycle logic — asserted |
| `backend/apps/applications/tasks/condition_reminder.py` | **new** — `condition_reminder_task`: bounded, task-locked, one reminder per `(condition, window)` through `Notification.idempotency_key` |
| `backend/apps/applications/amendment_service.py` | same-field pending uniqueness (`AMENDMENT_ALREADY_PENDING`, 409, naming the pending id) read from **one** pending-set query under the existing application lock; `AmendmentError` gained an optional `status_code` / `details` (both defaulting to the pre-10.2 behaviour); `AMENDMENT_STATUS_DEFINITIONS` + `amendment_history_payload` — the owner-scoped read shape |
| `backend/apps/applications/student_amendment_views.py` | `GET` added to `ApplicationAmendmentView` (owner-only, paginated in the registered envelope); **new** `ApplicationAmendmentDetailView`; the `POST` now maps a conflict to 409 with its details |
| `backend/apps/applications/student_withdrawal_views.py` | `ApplicationConditionsView` publishes the richer per-condition payload (additive; two extra queries for the whole list, never one per condition) |
| `backend/apps/applications/condition_manager.py` | `verify_condition`'s inline `status != "pending"` guard replaced by `ConditionStateMachine.can_transition`, so the legacy two-outcome route shares the one table and can decide a condition that now carries evidence. Stable code and message unchanged |
| `backend/apps/applications/tasks/condition_expiry.py` | expires the states the **student** owes (`CONDITION_STUDENT_OWED_STATES`), read from the state machine rather than a second list |
| `backend/apps/applications/tasks/__init__.py`, `backend/config/settings/base.py` | the `condition_reminder_task` export and its `condition-reminder` beat entry (daily 06:30 UTC, an hour after the expiry sweep) |
| `backend/apps/common/notification_preferences.py` | `DIRECT_PRODUCER_CATEGORIES["condition_reminder"] → application_updates` — **mandatory**, unlike the interview reminder, because a missed condition deadline auto-rejects the application |
| `backend/apps/applications/urls.py` | the three condition routes and the amendment detail route |
| `apps/admissions/src/services/applications.ts` | `StudentCondition` / `StudentConditionEvidence` / `StudentConditionHistoryEntry` / `StudentAmendment` / `StudentAmendmentPage` types + `getCondition`, `submitConditionEvidence` (multipart), `listAmendments`, `getAmendment`. Publishes the **shape**; every state name, definition and permitted action arrives on the response |
| `apps/admissions/src/components/student/applicationStatus/ConditionsTimeline.tsx` | rewritten: the state definition, the reviewer's reason, the current evidence and how many earlier versions are kept, and a per-condition upload/replace form gated on the server's `allowed_actions` |
| `apps/admissions/src/components/student/applicationStatus/AmendmentHistory.tsx` | **new** — the student's own requests with the server's status definitions, an empty state, a polite loading announcement, and no reviewer identity |
| `apps/admissions/src/pages/student/ApplicationStatus.tsx` | the evidence mutation (invalidates the conditions read so the new state comes from the server), the amendment-history query, and the "Your amendment requests" section. The local `ApplicationCondition` interface is deleted in favour of the service contract |
| `scripts/authority_matrix_registry.py` | four new entries (condition detail / evidence / review, amendment detail) and three updated (conditions list, amendments, condition verify) |
| `backend/tests/unit/test_view_auth_classification.py` | the four new views classified `_PROTECTED` |
| `backend/tests/unit/test_condition_evidence_amendment_history_10_2.py` | **new** — 61 cases (§10) |
| `backend/tests/unit/test_amendments.py` | one mock-based case moved onto the new pending-set read (§11) |
| `apps/admissions/tests/unit/conditionEvidenceAmendmentHistory.test.tsx` | **new** — 23 cases |
| `apps/admissions/tests/harness-e2e/required/condition-evidence-amendment-history.spec.ts` | **new** — the 4 required browser journeys, desktop and mobile |
| `docs/canonical-truth-map.md` | "Offer conditions: evidence, review, and amendment history" + the Drift Guard Inventory entry |

---

## 1. What was missing (STU-16, R13.9)

A conditionally approved student was told what they owed and given nowhere to put
it. `GET /applications/{id}/conditions/` published

```json
{"id": "…", "description": "…", "condition_type": "document",
 "deadline": "2026-09-30", "status": "pending", "met_at": null}
```

and the **only** condition command was the staff
`POST .../conditions/{cid}/verify/`, whose serializer accepts exactly
`status: met | waived`. Five things were missing, and each one is a dead end:

- **evidence** — nowhere to attach the transcript / receipt / letter the condition
  asks for. The generic upload endpoint could not stand in for it: it refuses a
  non-`draft` application for a student caller, and it resolves `document_type`
  against the *submission* requirement contract (task 7.2), which has no entry for
  "the thing this offer condition asks for";
- **a comment** — a condition is often satisfied by a document *plus* an
  explanation, and there was no field for either;
- **replacement** — with no upload there was nothing to replace, so a student who
  sent the wrong page had no second attempt;
- **a rejection reason** — the staff command had two outcomes, both final. A
  reviewer who found the evidence insufficient could only leave the condition
  `pending`, which tells the student nothing;
- **a reminder** — `condition_expiry_task` was the only scheduled work and it runs
  *after* the deadline. The first thing the platform ever said about a condition
  deadline was that it had been missed — and a missed condition
  [auto-rejects the application](../../../backend/apps/applications/condition_manager.py).

## 2. Condition evidence is a document version (R13.9, R11.8, R17.1)

The evidence pipeline is **not** re-implemented. A condition's evidence is an
`ApplicationDocument` whose `document_type` is
`condition_evidence:{condition_id}`, and `submit_evidence` runs task 7.3's
ordering unchanged:

```text
hash → replay short-circuit → COMMIT a stage row → write the object
     → VERIFY the object → COMMIT metadata in one transaction
     → on failure: compensating delete, else the sweeper
```

`test_the_evidence_write_reuses_the_7_3_command` parses the function and asserts
those four calls appear **in that order**, so a future edit cannot quietly move the
commit before the verification.

The per-condition `document_type` is the load-bearing choice. The platform's
partial unique index is

```sql
uq_application_documents_one_current UNIQUE (application_id, document_type) WHERE is_current
```

so a type that carries the condition id makes *"exactly one current evidence
version per condition"* an invariant **the database enforces**, and a replacement
supersedes the previous version through `commit_version` (wiring `supersedes_id`,
appending a history event) rather than overwriting it. `document_type` is
`varchar(100)`; the prefix plus a UUID is 53 characters, and
`test_the_document_type_fits_the_stored_column` reads the field's own
`max_length` rather than trusting that arithmetic.

### 2.1 The state machine is design §11.2, spelled with the stored values

Design §11.2 names the lifecycle conceptually:

```text
open -> evidence_submitted -> verified
                          \-> changes_required -> evidence_submitted
open/evidence_submitted -> waived (explicit authorized reason)
```

The platform has stored `pending` / `met` since the business-logic densification
and those rows are live, so the machine is spelled with the stored values and the
conceptual name travels next to it in `CONDITION_STATE_DEFINITIONS[state]
["design_name"]`. This is exactly what task 4.4 did for the domain machine
(`pending_dns` for the design's `pending_verification`), and it is recorded here for
the same reason: a reader of either document has to be able to follow.

Two states are new — `evidence_submitted` (18 chars) and `changes_required`
(16) — and both are **values** in the existing `varchar(20)` column with no CHECK
constraint. `test_the_condition_states_fit_the_stored_column` asserts the fit.

### 2.2 The history is the table 7.3 already appends to

`document_verification_events` is append-only by contract (7.3 §1.5) and carries
`details` jsonb, so the student's comment, the reviewer's reason and every status
change are recorded there **against the evidence version they concern**. Two
consequences worth stating:

- a **superseded** version keeps its own review outcome and its own reviewer's
  words, which is R11.8's "preserve prior evidence history" applied to conditions;
- the comment lives with the *version*, not on the condition row, so a replacement
  does not overwrite what the student said about the file it replaced.

## 3. Schema: nothing to migrate, and that was checked

Three facts made a migration unnecessary, and each was verified rather than
assumed:

| What was needed | What already exists | How it was checked |
|---|---|---|
| somewhere to store per-condition evidence, versioned, one-current | `application_documents` + `uq_application_documents_one_current` on `(application_id, document_type)` | `\d application_documents` on the isolated `mihas_localtest` Postgres; the index predicate is `WHERE is_current` |
| somewhere to store the comment, the reason and the history | `document_verification_events.details` **jsonb**, append-only | `\d document_verification_events` |
| two new condition states | `application_conditions.status` is `varchar(20)` with **no CHECK constraint** | `information_schema.columns` on the **Neon default branch** (`wild-bar-37055823`, read-only) *and* `\d application_conditions` locally |

Read-only on Neon, and worth recording as data:

```
application_conditions.status      character varying(20)
application_conditions.notes       text
application_amendments.field_name  character varying(50)
application_amendments.status      character varying(20)
conditions=0  amendments=0  pending_amendments=0  dup_same_field_pending=0
```

So: **no SQL script under `backend/scripts/`, no Neon branch, no production
touch.** `test_no_migration_ships_with_this_task` globs `backend/scripts/*.sql`
and asserts no 10.2 script exists, so the claim is a test rather than a sentence.

### 3.1 Why the amendment uniqueness rule has no partial unique index

The obvious expression of "one pending amendment per field" is

```sql
CREATE UNIQUE INDEX … ON application_amendments (application_id, field_name)
  WHERE status = 'pending';
```

and it was deliberately **not** shipped. Two reasons, in order of weight:

1. **the service-level rule is already race-free.** `request_amendment` is the
   *only* creator of a `pending` row (the review command transitions existing
   rows and creates none), and it already takes `select_for_update()` on the
   **application** row before it reads the pending set. Two concurrent same-field
   requests therefore serialise and the second sees the first.
   `test_the_uniqueness_check_runs_under_the_application_lock` asserts the lock
   precedes the check in the source, so a refactor cannot reorder them silently.
2. **the index's creation depends on data this lane cannot inspect.**
   `CREATE UNIQUE INDEX` fails if duplicate pending rows already exist. Neon's
   default branch has **zero** amendments (measured, above), but production is a
   different database behind SSH, and `apply_sql_migrations` runs on container
   boot — so a script whose success depends on an unverified precondition trades a
   guarantee the platform already has for a boot-time failure mode it does not.

This is a stated decision, not an omission: **if a second creator of pending rows
ever appears, the index is the right addition**, and the module docstring says so
where the next engineer will read it.

## 4. The read is server-authored, including its copy and its permissions (R13.2)

Each condition now publishes, additively over the pre-10.2 keys:

```text
state, state_design_name, waiting_on, state_definition, days_remaining,
review_reason (= the notes column, named for what it now means),
evidence (the current version), evidence_versions, superseded_evidence,
history (append-only), allowed_actions, evidence_document_type
```

Three deliberate properties:

- **the copy is the platform's.** `state_definition` and `waiting_on` come from
  `CONDITION_STATE_DEFINITIONS`, not from a browser table keyed on a status
  string. This is 9.1/9.4's "a definition travels with every label", and STU-14 is
  the cautionary tale: a client-side vocabulary is how the notification settings
  drifted away from the delivery path;
- **`allowed_actions` differs by reader.** The owner of an open condition gets
  `["submit_evidence"]`; the owner of one under review gets
  `["replace_evidence"]`; staff get `["review:changes_required", "review:met",
  "review:waived"]`; a terminal condition gets `[]`, for everyone.
  `test_the_read_publishes_different_actions_to_each_reader` pins all of it;
- **the list costs two extra queries, never one per condition.** `_evidence_rows`
  and `_history_events` each resolve the whole page with one `filter(...__in=…)`,
  and `test_the_list_does_not_query_once_per_condition` counts the queries that
  mention `condition_evidence:` with `CaptureQueriesContext`.

What is **not** published: the checksum and the storage key (internal locators),
and `_iso` is total over what a timestamp can be handed as — 10.1 §6's lesson,
where assuming `datetime` made the student's own inbox answer 500.

## 5. Reminders arrive before the deadline (R13.9)

`CONDITION_REMINDER_WINDOWS = (7, 3, 1)` days, one reminder per
`(condition, window)`, keyed `condition:{id}:reminder:{window}` through
`Notification.idempotency_key` — which is why the reminder needs no new column to
remember what it has already sent. `test_a_reminder_is_sent_once_per_window` calls
`send_condition_reminder` twice and asserts the notification count stays at one.

The category is the **mandatory** `application_updates`, registered as a direct
producer (`DIRECT_PRODUCER_CATEGORIES["condition_reminder"]`). That differs from
the interview reminder — which is *optional*, and is the only producer of the one
category a student can switch off — and the difference is the point: a missed
condition deadline auto-rejects the application, so this is a transactional message
about the student's own place, not a courtesy.

### 5.1 A passed deadline is not a reminder

`reminder_window_for(days_remaining)` returns `None` for a negative value. An
overdue condition is the expiry sweep's business, and a "reminder" that arrives
after the deadline is the defect STU-16 names, not the fix.

### 5.2 `evidence_submitted` is not expirable — a contract decision

`condition_expiry_task` used to expire `status="pending"`. It now expires
`CONDITION_STUDENT_OWED_STATES` = `{pending, changes_required}`:

- `changes_required` **is** expirable — a reviewer sent it back, so the student
  owes a replacement and the deadline still bites;
- `evidence_submitted` is **not** — the student did their part on time and the
  school owes a review. Expiring it would auto-reject an applicant because of the
  platform's own queue, which is a decision worth making explicitly rather than
  inheriting from a status filter.

The same set drives `conditions_due_for_reminder`, so a student is never chased for
something they have already sent.

## 6. One authority for the lifecycle, two front doors (R17.1)

There are now two staff commands that write a condition's status, and only one
place that says which writes are legal.

`ConditionManager.verify_condition` (the pre-existing two-outcome route) had an
inline `if condition.status != "pending"` guard. It now asks
`ConditionStateMachine.can_transition(condition.status, status)` — the same table
`review_condition` asserts against. Widening matters in practice: a condition that
carries submitted evidence sits in `evidence_submitted`, and refusing to verify it
would make the evidence workflow **block** the decision it exists to support.

The stable code and message are unchanged (`CONDITION_NOT_PENDING`), because
callers branch on it and a property suite pins it:
`test_approval_flow_preservation.py` asserts that `met` / `waived` / `expired` all
raise `CONDITION_NOT_PENDING`, and they still do —
`ALLOWED_TRANSITIONS[terminal]` is empty.

**Collapsing the two routes into one is task 10.6's**, not this one's: 10.6 owns
"choose one canonical route … and remove duplicate data/action logic after usage
and browser parity proof". Naming that here is deliberate — the alternative would
be to retire another lane's route without its measured usage gate.

## 7. Same-field pending uniqueness (STU-17, R13.10)

```python
existing = next((row for row in pending if row["field_name"] == field_name), None)
if existing is not None:
    raise AmendmentError("AMENDMENT_ALREADY_PENDING", …, status_code=409,
                         details={"field_name": …, "pending_amendment_id": …})
```

Three properties, each chosen rather than inherited:

- **409, not 400.** This is a conflict with an existing request, not a malformed
  one. `AmendmentError` gained an optional `status_code` and `details`, both
  defaulting to the pre-10.2 behaviour, so every other refusal still answers 400
  exactly as before and no existing caller changes;
- **it names the request in flight.** `details.pending_amendment_id` is what lets a
  client say "you already asked for this — here it is" instead of leaving the
  student to guess. Journey 4 asserts the id matches the first request's;
- **`MAX_PENDING_AMENDMENTS` stays 3, application-wide.** The two rules answer
  different questions ("how many open requests" vs "the same question twice"), and
  `test_the_application_wide_cap_is_unchanged` walks three different fields to 201
  and the fourth to `MAX_PENDING_AMENDMENTS`.

The pending set is read **once**, under the lock, and both questions are answered
from it — one query where the pre-10.2 code did a `.count()` and this task needed
a field list.

## 8. The owner-scoped amendment read (STU-17, R13.10)

```
GET /api/v1/applications/{id}/amendments/        → {page, pageSize, totalCount, results}
GET /api/v1/applications/{id}/amendments/{aid}/  → one request (+ old_value, reason)
```

- **owner-only**, through `resolve_owned_application(allow_scoped_staff=False)`.
  The staff view of the same work is the review workspace (task 9.4) under its own
  capability; reusing that surface here would give one endpoint two authorities.
  `test_staff_do_not_read_the_student_amendment_surface` asserts a scoped reviewer
  gets the 404 mask;
- **two scopes in order** on the detail: the *application* through the owner
  policy, then the amendment **within** that application — so another student's
  amendment id, an amendment belonging to a different application, and an unknown
  id are one indistinguishable 404 (asserted byte-for-byte);
- **the status travels with its definition** (`AMENDMENT_STATUS_DEFINITIONS`) and
  with `is_terminal`, so the browser cannot disagree with the platform about
  whether a request is still open;
- **the reviewer's identity is not published.** A student needs the decision and
  its timing; which member of staff made it is the school's internal record, and it
  is in the tenant audit feed (`amendment.review_decided`) for the people who may
  read it. `test_the_list_does_not_publish_the_reviewer` asserts the id does not
  appear anywhere in the row.

## 9. Every condition message goes through the one gate (R13.3, R13.4)

Task 10.1 §12 required this explicitly: any new message must go through
`deliver_message` with a published category, not a fire-and-forget call.

| Message | Category | Audience | Channels |
|---|---|---|---|
| condition review outcome → the **student** | `application_updates` (mandatory) | student | inbox **and** email |
| condition deadline reminder → the **student** | `application_updates` (mandatory), via `DIRECT_PRODUCER_CATEGORIES` | student | inbox and email |
| "evidence is waiting" → the **school's reviewers** | `staff_action_required` (mandatory) | staff | inbox **only**, with `not_in_audience_channels` on email |

The staff fan-out reuses 9.5's resolver and its bulk insert verbatim: recipients
are the staff holding `tenant.application.review` for **this application's own
institution**, with a per-recipient idempotency key, and a school with no
authorized reviewer leaves a logged gap rather than a wider fan-out.
`test_another_tenants_reviewer_is_not_told` asserts the other school's reviewer has
no notification at all, and `test_the_staff_work_item_is_inbox_only_and_says_so`
asserts the delivery record says `not_applicable` on email rather than `unknown`
(10.1 §5.2's distinction).

Both audits carry the reason and **not** the applicant: the student's comment is
their own words about their own evidence, so the audit records `has_comment: true`
instead of the text.

## 10. The task's own backend suite

`tests/unit/test_condition_evidence_amendment_history_10_2.py` — **61 passed**,
every DB-backed test under the `production_scope` fixture so what is measured is
the real membership/grant-derived capability model and never a test-settings
shortcut:

| Class | Cases | What it settles |
|---|---|---|
| `TestConditionStateMachine` | 7 | design §11.2 is expressible; terminal states have no outbound edge; a terminal condition is a **409 conflict**; `expired` is not a review outcome; every state ships a definition and a `waiting_on`; the vocabulary covers every state; the student-owed set is exactly the expirable set |
| `TestEvidenceIdentity` | 3 | the type carries the condition id, fits `varchar(100)`, and does not claim a non-condition type |
| `TestStudentEvidenceCommand` | 7 | §2 / the Required_Evidence table |
| `TestConditionReviewCommand` | 7 | §3, §6 — including the lock (AST-parsed) and the two audit records |
| `TestConditionAuthority` | 7 | another student masked byte-identically to an unknown id; **staff may not post evidence as the student**; another tenant's reviewer masked; a condition from another application not found; an in-scope reader without `review` is 403; **no role string compared** (AST); and `allowed_actions` differs per reader |
| `TestConditionListRead` | 3 | the pre-10.2 keys unchanged, no query per condition, `days_remaining` server-authored |
| `TestAmendmentHistory` | 7 | §8 |
| `TestSameFieldPendingUniqueness` | 6 | §7 |
| `TestConditionCommunication` | 6 | §9, plus reminder idempotence, the school-owed state not being chased, and a passed deadline not producing one |
| `TestOneAuthority` | 8 | §6 — the legacy route shares the machine and keeps its code, it can now decide a condition carrying evidence, the 7.3 ordering is preserved, the views hold no lifecycle logic, the expiry sweep reads the shared set, **no 10.2 SQL script exists**, and every state fits the column |

Two guards deserve naming because they had to **parse** rather than grep, for
[9.5 §9.1](../9.5/README.md)'s reason — the modules deliberately document the
authority model and the defect they replace in prose, and a grep guard fails on its
own documentation:

- `test_no_role_string_is_compared_in_the_condition_surface` walks the AST of the
  service **and** the views and reports a role literal only where it appears in an
  `ast.Compare` or as a `role…` keyword to `.filter()` / `.exclude()` / `.get()` —
  which is precisely what R3.1 forbids;
- `test_the_review_locks_the_condition_row` and
  `test_the_evidence_write_reuses_the_7_3_command` assert *call shapes and their
  order* rather than the presence of a string.

### 10.1 The storage double is real storage, not a mock

The 7.3 integration suite patches `apps.common.storage.MediaStorage` with a
`MagicMock`. That is right for injecting provider *failures*, and wrong for this
suite: the whole point of routing condition evidence through the 7.3 command is
that the object is **verified** before the database calls it evidence, and a
`MagicMock` answers `exists()` and `size()` with truthy mocks — proving nothing.
So `local_object_storage` substitutes Django's own `FileSystemStorage` bound to
`tmp_path`, which really writes the bytes and really answers the probes. Only the
provider is replaced; every step of the command runs.

## 11. One pre-existing test moved onto the new call shape

`test_amendments.py::TestPendingAmendmentLimit::test_max_pending_exceeded` mocked
`ApplicationAmendment.objects.filter(...).count()`. This task reads the pending
**set** once (§7), so the mock now supplies three rows on *other* fields — which
also makes the case sharper: it is about the cap, and the same-field rule has its
own test. This is the same class of change [9.5 §9.2](../9.5/README.md) recorded: a
test that fakes the ORM pins a call shape rather than a behaviour, and its
behavioural claim here is unchanged.

Nothing else in that file moved. `MagicMock` supports `__iter__` (returning an
empty iterator), which is why `test_amendable_field_accepted` continued to pass
untouched — worth recording, because it looks like an accident and is not: an empty
pending set is exactly what that case means.

## 12. Verification (verbatim)

### 12.1 Backend suites, against a measured baseline

```
cd backend && DATABASE_URL=<mihas_localtest 5433> TESTING=1 python3 -m pytest \
  $(ls tests/unit/*.py tests/property/*.py \
    | grep -iE "amendment|condition|interview|notification|communication|applicat|account|outbox|document") \
  -q --tb=no -rfE -p no:randomly
```

against the isolated `mihas-localtest` Postgres. Neon and production were not
touched.

| Run | Files | Result |
|---|---|---|
| **baseline** — the same selection, measured **before** any of this task's code existed | 67 | **25 failed, 760 passed**, 36 errors |
| **10.2 (candidate)** | 68 | **25 failed, 821 passed**, 36 errors |

[`candidate.txt`](raw/candidate.txt) / [`baseline.txt`](raw/baseline.txt), with the
sorted failing+erroring sets in
[`candidate-failing-set.txt`](raw/candidate-failing-set.txt) and
[`baseline-failing-set.txt`](raw/baseline-failing-set.txt).

- **New failures: 0.** `comm -23` over the two sorted sets (**61 entries each**) is
  empty. `comm -13` is also empty — nothing was fixed either, which is the honest
  reading: this task claims no repair of another lane's failure.
- **+61 passing**: exactly the task's own suite, which on its own reports
  **61 passed**.
- The baseline is a genuine before-measurement rather than a reconstruction: it was
  captured **first**, before any file was edited, over the same selection pattern.
  The only difference in the candidate's file count is the task's own new suite
  (`test_condition_evidence_amendment_history_10_2` appears **0** times in the
  baseline log and once in the candidate's).

The 25 failures and 36 errors present in **both** runs are the pre-existing
clusters catalogued in [9.1 §8.1–8.3](../9.1/README.md),
[9.2 §11.1–11.2](../9.2/README.md), [9.3 §15.1](../9.3/README.md),
[9.4 §14.1](../9.4/README.md) and [10.1 §10.1](../10.1/slice-1-backend.md) — by
file:

```
22 ERROR  tests/unit/test_application_endpoints.py       13 FAILED tests/property/test_application_endpoints.py
 6 ERROR  tests/unit/test_review_notifications.py         3 FAILED tests/property/test_accounts_error_handling.py
 3 ERROR  tests/unit/test_application_review_payment_gate.py  2 FAILED tests/unit/test_applications_serializers.py
 3 ERROR  tests/unit/test_application_number_generator.py     2 FAILED tests/property/test_application_hardening.py
 2 ERROR  tests/unit/test_application_review_force_approved.py 1 FAILED tests/unit/test_application_student_flow_views.py
                                                              1 FAILED tests/unit/test_amendments.py
                                                              1 FAILED tests/property/test_interview_status_validation.py
                                                              1 FAILED tests/property/test_communication_template_properties.py
                                                              1 FAILED tests/property/test_application_properties.py
```

Two are worth naming because they sit closest to this lane and are **not** ours:

- `test_amendments.py::TestAmendmentReviewEndpoint::test_approve_succeeds` is in
  **both** sets. It is in 9.5's and 10.1's measured baselines too, and this task
  changed neither the review endpoint nor the review path;
- `test_communication_template_properties.py` and `test_review_notifications.py`
  fail identically on both sides. They are in the communication area but fail on the
  pre-existing fixture/DB clusters, not on the gate — and this task adds a producer
  to that gate, so their being unchanged is the useful observation.

### 12.2 The authority matrix and the view classification

`tests/unit/test_authority_matrix_v2.py` fails on **one stale entry**,
`/api/v1/applications/<uuid:application_id>/preview-summary/` — a route **task 7.4
deleted** whose registry entry its lane left behind, in both runs and already
recorded by [9.5 §11.1](../9.5/README.md). This task's four new routes are
registered and none appears in the unresolved list. Retiring another lane's stale
pin here would hide that it was left.

`test_view_auth_classification.py::test_all_api_views_are_classified` reports **38**
unclassified views — the same number as before this task. The four new views are
classified `_PROTECTED`; the 38 belong to other lanes and deliberately were not
registered here.

### 12.3 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 4146 passed / 1 skipped** (475 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **18 errors, 0 warnings** across **15 files** — the same count as 9.4, 9.5 and 10.1. The one error in a file this task touched (`ApplicationStatus.tsx` line 11, the `@/services/client` import for `AuthenticationError`) is at `HEAD` and was not introduced here | [`frontend-lint.txt`](raw/frontend-lint.txt), [`frontend-lint-files.txt`](raw/frontend-lint-files.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |

The pre-10.2 frontend baseline is
[10.1 §6.1](../10.1/slice-2-frontend.md): **1 failed / 4123 passed / 1 skipped**
across 474 files, 18 lint errors across 15 files. So: **+23 passing, +1 test file,
the same single pre-existing failure, and the same lint count** — and the +23 is
exactly this task's new suite. The pre-existing failure is
[`authPageFormMarkup.test.tsx`](../../../apps/admissions/tests/unit/authPageFormMarkup.test.tsx),
the SignUp helper-copy conflict catalogued from 8.1 onward.

### 12.4 Django system checks

`cd backend && python3 manage.py check`

```
LENCO_API_SECRET_KEY is not set — payment processing will be unavailable.
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`django-check.txt`](raw/django-check.txt). The LENCO line is the expected local-dev
notice — this machine holds no provider credential. (The run also emits the
`SECRET_KEY not set` dev warning because it uses the repo venv without a `.env`
export; it is not a check failure.)

> **`manage.py check` must run with the repo's own environment.** Exporting a
> `TESTING=1` or a substitute `REDIS_URL` first flips `CACHES` to `LocMemCache`
> (`base.py` `_is_testing`) and the check then reports
> `django_ratelimit.E003 — not a shared cache`. That is the override talking, not
> the platform (recorded by 8.3 §7.7, 8.4 §7.5, 9.1 §8.5, 9.2 §11.4, 9.3 §15.3,
> 9.4 §14.3, 9.5 §11.3 and 10.1 §10.3; re-confirmed here).

### 12.5 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema-102.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — **identical counts** to 8.2 through 10.1.
Four operations were added and all four are named explicitly:

```
applications_amendments_list          GET  /api/v1/applications/{id}/amendments/
applications_amendment_retrieve       GET  /api/v1/applications/{id}/amendments/{aid}/
applications_condition_retrieve       GET  /api/v1/applications/{id}/conditions/{cid}/
applications_condition_evidence_submit POST /api/v1/applications/{id}/conditions/{cid}/evidence/
applications_condition_review          POST /api/v1/applications/{id}/conditions/{cid}/review/
```

**Worth recording, because the first run got it wrong.** Left to
drf-spectacular's generator, the two new GETs collided with their list siblings
(`api_v1_applications_amendments_retrieve`,
`api_v1_applications_conditions_retrieve`) and were resolved "with numeral
suffixes" — 5 warnings instead of 3. A numeral-suffixed `operationId` describes
nothing, which is exactly the schema drift R14.2 forbids, so each new operation
names itself and the count returned to the pre-existing 3. The three remaining
warnings are the pre-existing collisions on `/api/v1/admin/intakes/`,
`/api/v2/admin/change-requests/` and `/api/v2/admin/onboarding/`.

### 12.6 Browser journeys

`cd apps/admissions && HARNESS_PW_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:8090 bunx playwright test -c playwright.harness.config.ts --project=chromium-required --project=mobile-required tests/harness-e2e/required/condition-evidence-amendment-history.spec.ts`

```
Running 8 tests using 1 worker
  … 8 passed (25.0s)
```

[`harness-condition-amendment-journeys.txt`](raw/harness-condition-amendment-journeys.txt).
Run against the task-0.4 isolated harness brought up **fresh**
(`harness/bin/harness up`, which wipes volumes, rebuilds the backend image and runs
`bun run build` for the SPA), with the strict `harness-fixtures.ts` gates active:
zero skips, no console errors, no unhandled exceptions, no unasserted failed
requests.

`HARNESS_PW_CHANNEL=chrome` is the config's documented escape hatch: Playwright's
bundled Chromium has no build for this machine, so the required projects run against
the system Chrome. It changes the browser binary, not the assertions.

Four harness details worth recording:

- **the harness serves the built SPA** (`apps/admissions/dist`) and runs the backend
  from a **built image**, so a source change needs `bun run build` (and a backend
  change needs `harness up`) before it is under test. Every frontend claim above was
  re-verified after the rebuild, for exactly that reason;
- **the conditional offer is reached through the platform's own state machine**:
  `draft → submitted → under_review → conditionally_approved` with `conditions: [...]`,
  every step a real `POST /applications/{id}/review/`. Nothing is inserted into
  `application_conditions` directly — a condition the platform did not assign would
  prove only that the table exists;
- **the evidence upload is a real multipart write** through the harness's MinIO, so
  the journeys exercise the same staged-write-and-verify path §2 describes;
- **the duplicate-amendment refusal declares its error** with
  `gate.allowRequest(...)` — the declaration **is** R18.4's asserted error path.

### 12.7 The whole required browser profile

`… --project=chromium-required --project=mobile-required` (no spec filter)

```
2 failed
  [chromium-required] › required/tenant-launch.spec.ts:139:5 › … the wizard exposes program / intake / fee / routing steps on mobile
  [mobile-required]   › required/tenant-launch.spec.ts:139:5 › … the wizard exposes program / intake / fee / routing steps on mobile
118 passed (8.2m)
```

[`harness-required-suite.txt`](raw/harness-required-suite.txt). The two failures are
the locator-ambiguity failures [10.1 §6.5](../10.1/slice-2-frontend.md) already
**measured** as pre-existing (`getByText('Fees', …).first()` resolving to the admin
sidebar's hidden "Program Fees" item). 10.1's profile was **110 passed / the same 2
failed**; this one is **118 passed / the same 2 failed** — the +8 being this task's
journeys. The 9.5 audit/amendment journeys were re-run explicitly and all six pass
on both viewports, which matters because this task edits `amendment_service.py`.

### 12.8 Failures introduced by this task

**Zero**, against measured baselines rather than assertion:

| Scope | Evidence |
|---|---|
| Backend condition/amendment/application/notification suites | baseline 25 failed / 760 passed → 25 / **821**; the new-failure diff is empty over 61 entries each side (§12.1) |
| Authority matrix / view classification | the same single stale entry and the same 38 unclassified views as before, none of them this task's (§12.2) |
| Frontend | the same single pre-existing failure; **18** lint errors across **15** files, unchanged, none introduced (§12.3) |
| Build / check / schema | exit 0, no issues, **3 warnings / 116 errors** unchanged, four named operations added (§12.3–12.5) |
| Browser | 8/8 on a freshly wiped harness, both viewports, zero skips; the whole required profile 118 passed with the same 2 pre-existing failures (§12.6–12.7) |

The harness was torn down (`harness/bin/harness down`, which wipes volumes) after
the runs above.

## 13. Not claimed here

- **The two staff front doors are not collapsed.** `.../conditions/{cid}/verify/`
  (two outcomes) and `.../conditions/{cid}/review/` (three) both exist. They share
  the one state machine, so they cannot disagree about legality, but choosing a
  single canonical route and removing the duplicate is **task 10.6**'s ("choose one
  canonical route … remove duplicate data/action logic after usage and browser
  parity proof"). Retiring a route without that measured usage gate is exactly what
  R2.5 forbids.
- **Enrollment readiness is untouched.** R13.9's second sentence — "enrollment
  readiness/deadline SHALL be server-authored and rechecked under the enrollment
  lock" — is **task 10.3**, which the task list names separately. This task
  publishes condition state; it does not add a readiness contract, and it does not
  change `EnrollmentService`.
- **No admin UI for the three-outcome review.** The new `/review/` command is
  exercised by the harness journeys and the backend suite; wiring it into the
  reviewer workspace belongs to the admin surface's own lane (9.4 owns that
  workspace, 10.6 owns the consolidation). The pre-existing admin "verify" control
  still works and now shares the state machine.
- **No condition-evidence document type in the required-documents contract.** Task
  7.2's contract describes *submission* requirements; a condition is a
  post-decision obligation, and adding it there would make the wizard render an
  upload control for a document the student does not yet owe.
- **No partial unique index on `(application_id, field_name) WHERE pending`** —
  §3.1 states the reasoning and the condition under which it becomes right.
- **No new capability.** Condition review uses `tenant.application.review`, the
  capability the amendment review command and the two-outcome verify already use.
  The catalogue stays at 17 `platform.*` + 17 `tenant.*`.
- **No `communication_templates` row for `condition_reviewed` / `condition_reminder`.**
  Both bodies are rendered by their producer and classified through the gate, which
  is what `DIRECT_PRODUCER_CATEGORIES` exists for. A seeded template would be a
  second place the copy lives.
- **The reminder is not audited as a tenant event.** The durable record is the
  committed `Notification` + `OutboxEvent` written through the gate; an
  `Audit_Event` per reminder would fill a school's configuration feed with
  scheduled work. Condition **commands** are audited (`condition.evidence_submitted`,
  `condition.reviewed`).
- **`ApplicationCondition.notes` now carries the reviewer's most recent reason.**
  Published under both `notes` (the readers that already expect it) and
  `review_reason` (what it now means). The full sequence of reasons lives in the
  append-only history; the column holds the latest, which is what the student needs
  to act on.
- **The `days_remaining` on a condition is computed at read time**, not stored, and
  it is `None` when the deadline is not a date. It is a convenience for rendering,
  not a second source of truth about the deadline.
