# Task 10.1 — Consolidate notifications and communications (slice 1: backend)

Evidence index for the **backend half** of task **10.1** of
`.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 10.1 Consolidate notifications and communications
  - Define the supported preference schema and implement real GET/PUT controls.
  - Reject unknown whatsapp/in-app fields unless actually implemented.
  - Merge duplicate inbox/history concepts and add Communications to mobile More.
  - _Requirements: R13.3-R13.4, R13.8_
  - _Findings: STU-14, STU-24_
  - _Evidence: preference persistence, mandatory-message, delivery/retry, mobile-nav E2E_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in flight/uncommitted; the orchestrator owns the commit).
- **The task of record stays 10.1 and its checkbox is not flipped.** This file
  covers slice 1 only. §11 states exactly what slice 2 (frontend) still owes.
- PBT: task 10.1 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`.
- **Schema: no migration.** No table, column, index, capability or role was added.
  `notifications.metadata` is an existing `jsonb` column and it carries the whole
  delivery record; `notifications.idempotency_key` already exists. Confirmed
  **read-only** on the Neon default branch (`wild-bar-37055823`) as well as on the
  throwaway `mihas_localtest` Postgres — §7. **No Neon branch was created** (the
  branch limit is exceeded and nothing needed proving), and production was not
  touched.
- Reuses, rather than re-implements: 9.5's `TenantStaffRecipientService` and its
  `create_notifications_bulk` fan-out, 9.5's `TenantAuditService.record_event`,
  the platform's existing `apps/common/outbox.py` (`create_notification` /
  `queue_email`), 8.3's `resolveTenantSupportContact` on the frontend side, and
  9.1/9.4's rule that **a definition travels with every label**.

---

## 1. The Required_Evidence claim, and which half is here

The `_Evidence:` line names four things. Three are settled by an endpoint or a
service and are in this slice; the fourth is a navigation item, which no endpoint
test can observe.

| Required evidence | Where | Slice |
|---|---|---|
| **preference persistence** | `TestPreferenceEndpoint` (10 cases) — GET publishes the schema and says the values are defaults; PUT persists and the next GET reads it back; PUT is idempotent; one student's write does not reach another; a pre-10.1 row holding retired values still reads | 1 (here) |
| **mandatory-message** | `TestWriteValidation` (14) + `TestTheDeliveryGate` (10) — a mandatory category cannot be switched off, and no stored setting suppresses it on any channel its audience allows | 1 (here) |
| **delivery/retry** | `TestTheCommunicationsHistory` (11) + `TestRetryIsAnAuthorizedAuditedDurableCommand` (11) — per-channel state with no provider payload, and a retry that is owner-scoped, state-guarded, bounded, durable through the outbox and audited | 1 (here) |
| **mobile-nav E2E** | a required browser journey | **2 (owed)** — §11 |

## 2. What was wrong (STU-14)

The platform held **three disagreeing answers** to *"what can a student
control?"*, and **nothing read any of them**:

| Layer | What it said |
|---|---|
| `user_notification_preferences` | nine columns: `email_enabled`, `sms_enabled`, `application_updates`, `payment_reminders`, `interview_reminders`, `marketing_emails`, `quiet_hours_start`, `quiet_hours_end`, `timezone` |
| `NotificationPreferenceSerializer` | accepted all nine and **persisted every one** |
| `NotificationSettings.tsx` | rendered three read-only tiles — "Always on", "Always on", "Coming soon" — and declared `whatsapp_enabled` / `in_app_enabled`, which the backend has never had |

And the delivery path:

```python
# communication_service.py, before
channel = template.channel if template else "both"
if channel in ("notification", "both"):
    create_notification(...)          # no preference consulted
if channel in ("email", "both"):
    queue_email(...)                  # no preference consulted
```

`CommunicationService.send` dispatched on the **template's** own `channel`
column. It never once read a student's stored row. So a student who saved "quiet
hours 21:00–06:00" was told the platform would hold messages back overnight, when
the platform has no deferral scheduler at all; a student who turned off
`marketing_emails` was consenting about mail the platform never sends; and a
student who turned off `email_enabled` still received every email.

That is the shape of the finding: not a rendering bug, a **drift** bug. Three
field lists, one of them in a browser, none of them connected to a delivery
decision.

## 3. The rule now enforced

> **The published schema is derived from what the platform can actually send.**

- a **channel** is offered only when a delivery implementation exists, and is
  *configurable* only when turning it off is a real outcome;
- a **category** is offered only when at least one real producer sends it, and is
  *configurable* only when it is **optional** — a mandatory transactional message
  is not a preference (R13.3);
- every other field name — **including one the database has a column for** — is
  rejected with a stable per-field code and a stated reason, never silently
  stored.

`WRITABLE_FIELDS` is therefore **derived**, not listed:

```python
WRITABLE_FIELDS: tuple[str, ...] = tuple(
    [c.column for c in CHANNELS   if c.configurable and c.column]
    + [c.column for c in CATEGORIES if c.configurable and c.column]
)
```

A channel or category that stops being configurable stops being writable in the
same commit, and `test_every_writable_field_belongs_to_a_configurable_channel_or_category`
asserts the set equality both ways.

### 3.1 What is published

| Channel | implemented | mandatory | column |
|---|---|---|---|
| `in_app` | yes | **yes** | — (the inbox is the platform's record of what you were told) |
| `email` | yes | no | `email_enabled` |

| Category | kind | column |
|---|---|---|
| `application_updates` | **mandatory** | — (a decision, a verification outcome, a deadline that forfeits a seat) |
| `payment_reminders` | optional | `payment_reminders` |
| `interview_reminders` | optional | `interview_reminders` |

### 3.2 What is refused, and why each one differently

`UNSUPPORTED_FIELD_TABLE` is published **on the read**, so a client can explain a
refusal without inventing copy:

| Field | Code | Why |
|---|---|---|
| `sms_enabled` | `CHANNEL_NOT_IMPLEMENTED` | no SMS provider is configured. **The column exists; the delivery does not** |
| `whatsapp_enabled` | `CHANNEL_NOT_IMPLEMENTED` | no integration and no column — it existed only in the frontend's types |
| `in_app_enabled` | `CHANNEL_MANDATORY` | implemented, but not the student's to switch off |
| `marketing_emails` | `CATEGORY_NOT_IMPLEMENTED` | the platform sends no marketing email, so there is nothing to govern |
| `application_updates` | `CATEGORY_MANDATORY` | missing one of these can cost a place |
| `quiet_hours_start` / `quiet_hours_end` | `FIELD_NOT_IMPLEMENTED` | no message-deferral scheduler exists, so a quiet window could only **drop** messages, not delay them |
| `timezone` | `FIELD_NOT_IMPLEMENTED` | no delivery path reads a stored timezone |

Three different refusals for what looks like one problem is the point: a reader
can tell **"not implemented"** from **"not yours"** from **"does not exist"**.
`test_whatsapp_and_in_app_are_refused_for_different_reasons` pins that they do not
collapse into one code.

One bad field refuses the **whole** write and stores nothing
(`test_put_refuses_an_unsupported_field_and_stores_nothing`) — a partial accept
would leave the student's screen disagreeing with their row, which is the class of
defect this task exists to remove.

**The retired columns are not rewritten.** `apply_write` touches only the writable
columns, so whatever the pre-10.1 endpoint left in `quiet_hours_*` / `timezone` /
`marketing_emails` stays there and still reads
(`test_a_pre_10_1_row_holding_retired_values_still_reads`). This task refuses to
*accept* those fields; it does not edit history in a student's row.

## 4. One delivery gate, and every producer goes through it

`resolve_delivery` is the single answer to *"will this message reach this person,
on which channel, and why"*, and `deliver_message` is the single place that
performs it.

```
resolve_delivery(user, category) -> DeliveryDecision
    in_app  : always used            (mandatory channel — it is the record)
    email   : used | not used + reason
                  not_in_audience_channels   (this message class has no email)
                  suppressed_by_preference   (the recipient's own setting)
                  no_recipient               (no address on file)
```

- a **mandatory** category ignores both the category toggle and the channel
  toggle;
- an **optional** category needs its own toggle *and* the channel's;
- an **unmapped** template key resolves to the mandatory category
  (`category_for_template`), so a new message type is **delivered**, never
  silently suppressed by a preference nobody mapped it to
  (`test_an_unclassified_template_is_delivered_not_suppressed`);
- a preference **lookup failure** resolves to the published defaults, because the
  platform must deliver when it cannot read a setting, not go silent.

Producers:

| Producer | Category | Goes through |
|---|---|---|
| every seeded template (19 keys) | `TEMPLATE_CATEGORIES`, total over `2026_05_19_seed_communication_templates.sql` | `CommunicationService.send` → `deliver_message` |
| `interview_reminder_task` | `DIRECT_PRODUCER_CATEGORIES["interview_reminder"]` → `interview_reminders` | `deliver_message` |
| amendment fan-out to staff (9.5) | `staff_action_required` | `staff_delivery_metadata` + `create_notifications_bulk` (§5) |

`TestEveryProducerGoesThroughTheGate` parses `communication_service.py` and
`tasks/interview.py` with `ast` and asserts `deliver_message` is actually called,
and `test_every_optional_category_has_a_real_producer` asserts the reverse: a
switch with nothing behind it is precisely the placeholder STU-14 names. The
interview reminder mattered here — it is the **only** producer of the one
category a student can switch off, so before this task the
`interview_reminders` switch governed nothing.

### 4.1 Delivery and retry run through the durable outbox

Both writes go through `apps/common/outbox.py`, so each commits an `OutboxEvent`
and the email **dispatches on commit** rather than inline. If the broker is down
the rows are still there and `process_pending_emails_task` (Celery Beat, every
120 s) sweeps them. `test_delivery_writes_a_durable_outbox_row_per_channel` and
`test_the_retry_is_durable_through_the_outbox_not_a_direct_send` pin it.

`deliver_message` **never raises**: a communication failure must not fail the
command that caused it. Where the gate itself fails, `CommunicationService.send`
falls back to writing the in-app notification directly — the inbox is the record,
so losing it is worse than losing the email.

## 5. Which channels a message may use — the question 9.5 deferred here

[9.5 §12](../9.5/README.md) recorded:

> **Amendment notifications remain in-app only.** […] Which channels an amendment
> should use belongs to task 10.1's notification-preference schema.

**The answer: audience decides the channel set, and preferences only narrow it.**

```python
AUDIENCE_CHANNELS = {
    AUDIENCE_STUDENT: (CHANNEL_IN_APP.key, CHANNEL_EMAIL.key),
    AUDIENCE_STAFF:   (CHANNEL_IN_APP.key,),
}
```

`Category.audience` makes this a property of the **message class**, not of the
call site, so a caller cannot hand a staff category to the gate and be given the
student channel set. The audience is checked **before** any preference
(`ResolvedPreferences.allows`), which is why
`test_a_preference_cannot_widen_an_audience_channel_set` holds even for a
*mandatory* category: mandatory means "no setting suppresses it", not "it may use
a channel its class does not have".

### 5.1 Why staff is inbox-only, and why that is structural rather than a taste

1. **There is no staff preference schema, and there must not be a decorative
   one.** The whole of STU-14 is that a published control has to be honoured by a
   delivery path. An emailed work item nobody can turn off would owe a
   staff-facing settings screen the platform does not have — which is how the
   student side got into this state.
2. **A staff work item is addressed by user id, not by address.** 9.5's resolver
   deliberately returns ids and never contact details ("ids not addresses" is one
   of its six resolver-contract cases). Emailing a resolved reviewer would mean
   reintroducing the address lookup that module refuses to perform, over exactly
   the cross-tenant staff roster R3.2 protects.

So it stays inbox-only — but as a **stated fact with a stated reason**
(`AUDIENCE_CHANNEL_REASONS`) rather than as an omission.

### 5.2 The defect that stating it fixes

Before this slice, a staff amendment notification carried **no delivery record at
all**, so the communications history reported its email channel as `unknown`,
whose published definition is:

> "This message predates delivery tracking, so the platform cannot state what
> happened on this channel."

That was false. The message did not predate anything — email was never
applicable. `staff_delivery_metadata` now attaches the same record shape the
student path writes, and the reason maps to a different published state:

| Reason | State | Meaning to a reader |
|---|---|---|
| `suppressed_by_preference` / `no_recipient` | `suppressed` | your own setting decided this, and you can reverse it |
| `not_in_audience_channels` | `not_applicable` | this message class has no such channel |
| *(no record)* | `unknown` | the platform genuinely cannot say |

`_UNUSED_REASON_STATES` is explicit rather than an `else` branch, and
`UNCLASSIFIED_UNUSED_REASONS` — computed from the gate's own
`CHANNEL_UNUSED_REASONS` rather than re-listed — must be empty, so a new reason
cannot silently fall through to a benign-looking state. This is the ADM-02 lesson
("never report an unknown as healthy") applied to a delivery label.

It is written as a value, not a per-recipient resolution, because 9.5's fan-out is
**one insert for the whole recipient set** and the record is identical for every
recipient. `staff_delivery_metadata` carries no recipient and no address
(`test_a_staff_record_carries_no_recipient_and_no_address`).

### 5.3 What the staff class does *not* do

`CATEGORY_STAFF_ACTION_REQUIRED` is in `ALL_CATEGORIES` and `CATEGORIES_BY_KEY`
so the history can name it, and deliberately **not** in `CATEGORIES` — the
published preference payload iterates `CATEGORIES` exactly, so the GET shape is
byte-unchanged and `SCHEMA_VERSION` stays at 1. That matters here specifically:
the frontend mirror pins the version, and slice 2 is a separate dispatch.

## 6. The communications history (R13.4)

R13.4 asks for three things the platform did not have.

**Delivery state and channel.** The inbox published
`{id, title, message, type, is_read, created_at}` and said nothing about whether
the email went out. It now publishes, per message: `category`, `kind`,
`audience`, and per channel `{state, attempts, last_attempt_at, can_retry}`.

**No secrets or internal provider payloads.** The raw material for delivery state
is `EmailQueue.error_message` — which holds provider text ("Both SMTP and Resend
failed", SMTP responses) — and `recipient_email`, which is contact PII. Neither is
published; a classified state, an attempt count and a timestamp are.
`test_the_history_never_publishes_provider_text_or_the_address` asserts both are
absent from the payload.

**Retry as an authorized audited command.** There was none, so a failed email was
a dead end for the student *and* the operator.

Three deliberate properties of the read:

- **one extra query for a whole page**, never one per row (`project_delivery`
  collects the referenced `EmailQueue` ids and resolves them in a single
  `filter(id__in=...)`). `test_the_page_costs_one_extra_query_not_one_per_row`
  counts queries with `CaptureQueriesContext`.
- **the registered envelope did not move.** The notification list still returns
  exactly `{page, pageSize, totalCount, results}` inside `data`
  (`test_the_notification_list_keeps_its_registered_envelope`), which is what
  `test_perf_notification_cursor.py` pins. So the **vocabulary** lives on
  `GET /api/v1/notifications/preferences/` — the one surface that already
  publishes the channel and category vocabulary — rather than being repeated on
  every page of the inbox. One authority for "what may this word mean", one round
  trip, and the pagination contract untouched.
- **a timestamp is not assumed to be a `datetime`.** `_as_iso` is total over what
  it can be handed (model field, jsonb string, serialized row), because assuming
  `datetime` made the student's own inbox answer **500** whenever a timestamp
  arrived as a string — a read failure on the surface R13.4 exists to make
  legible.

## 7. Retry: an authorized, audited, durable, bounded command

`POST /api/v1/notifications/{id}/retry/`

| Property | How |
|---|---|
| **authorized** | authority is **ownership**: the notification is fetched from the caller's own rows, so another user's id and an unknown id are the same 404. That is design §5.2's owner-authority row ("owned profile/application → object ownership") plus the platform's `not_found_mask` disclosure policy, which is why there is no separate permission class here |
| **state-guarded** | only a terminal `failed` latest attempt. Queued, retrying, already sent, suppressed by the student's own settings, or untracked → `RETRY_NOT_APPLICABLE` / `RETRY_UNTRACKED`, not a quiet second email |
| **idempotent** | by the state machine, not by a key: the first retry moves the message out of `failed`, so an immediate replay is refused (`test_an_immediate_replay_is_refused_by_the_state_machine`) |
| **bounded** | `COMMUNICATION_RETRY_LIMIT = 3` → `RETRY_LIMIT_REACHED`. An unbounded resend is an outbound-mail amplifier |
| **durable** | a **new** `EmailQueue` row plus its committed `OutboxEvent` through `queue_email`; dispatch on commit; the beat sweep is the backstop |
| **faithful** | subject and body come from the **failed row**, so the student is re-sent the message they were actually promised, not a re-render against a template that may have changed version since |
| **audited** | `communication.retried` via `TenantAuditService.record_event` — category, channel, attempts, the limit, template key, application id. Ids, never message content (`test_the_retry_is_audited_with_ids_and_no_message_content`) |

## 8. Schema: nothing to migrate, and that was verified

The delivery record lives on `Notification.metadata`, an existing `jsonb` column.
Confirmed **read-only** on the Neon default branch (`wild-bar-37055823`,
`information_schema.columns`) and on the isolated `mihas_localtest` Postgres:

```
notifications.metadata                        jsonb
notifications.idempotency_key                 text
user_notification_preferences.email_enabled   boolean
  … sms_enabled, application_updates, payment_reminders, interview_reminders,
    marketing_emails (boolean), quiet_hours_start/end (time), timezone (varchar)
```

So: **no SQL script under `backend/scripts/`, no Neon branch, no production
touch.** The nine columns confirm the "the column exists; the delivery does not"
refusal for `sms_enabled` is a statement about the platform and not a guess, and
`test_the_stored_columns_the_schema_refuses_are_named_explicitly` asserts every
model column is either writable or named in the refusal table — so a tenth column
cannot appear unaccounted for.

## 9. Canonical registration and the drift guard

`docs/canonical-truth-map.md` → **"Notification preferences, delivery gate, and
communications history (Admissions V2 task 10.1, R13.3/R13.4/R13.8)"**: the
schema, the audience→channel map, the staff message class, the refusal table, the
delivery gate, the delivery path, the template→category map, the delivery-state
vocabulary, the unused-reason mapping, the per-message projection, the retry
command, the frontend mirror and the guards. Also added to the **Drift Guard
Inventory**.

The frontend mirror (`apps/admissions/src/lib/notificationPreferences.ts`)
duplicates **exactly two** things, because the browser has to explain a 400 to a
student and cannot invent that copy: `PREFERENCE_SCHEMA_VERSION` and
`PREFERENCE_REJECTION_CODES` (plus `UNSUPPORTED_PREFERENCE`). Everything else —
which channels exist, which are mandatory, which categories are optional, what
each means, what is writable, what a delivery state means — is read from the
response.

`TestTheFrontendMirrorCannotDrift` (5 cases) reads that file and asserts:

1. the mirror pins the backend's `SCHEMA_VERSION`;
2. it pins `UNSUPPORTED_PREFERENCE`;
3. it lists every `REJECTION_CODES` entry **in the backend's order**;
4. it has a tone for **every** state the backend publishes;
5. it **names no channel and no category** — because a field list in the client
   is how the two sides drifted apart in the first place.

**The guard lives on the backend**, where the authority is. A guard that only ran
in the frontend suite would let a backend-only change ship green — the version
could move and no test would notice.

### 9.1 The guard had to strip comments, not grep

The mirror deliberately **documents** the fields STU-14 found in the client
(`whatsapp_enabled`, `in_app_enabled`, quiet hours), because recording what was
wrong is part of the fix. A raw `grep` guard fails on that documentation:

```
'in_app'           in raw source: True
'whatsapp_enabled' in raw source: True
```

…and the only way to satisfy it would be to delete the record. So `_strip_ts_comments`
removes block and line comments before scanning. This is the same reason
[9.5 §9.1](../9.5/README.md) made its role-comparison guards parse with `ast`
instead of grepping, and it is recorded for the same reason: the temptation in
that moment is to weaken the documentation.

## 10. Verification (verbatim)

### 10.1 Backend suites, against a measured baseline

```
cd backend && DATABASE_URL=<mihas_localtest 5433> TESTING=1 python3 -m pytest \
  $(ls tests/unit/*.py tests/property/*.py \
    | grep -iE "notification|communication|outbox|applicat|account") \
  -q --tb=no -rfE -p no:randomly
```

**37 suite files** — the notification, communication, outbox, applications and
accounts selection the dispatch names — against the isolated `mihas-localtest`
Postgres. Neon and production were not touched.

| Run | Result |
|---|---|
| **baseline** — the same selection with 10.1's backend implementation removed (the two new modules and the task's own suite moved aside; `notification_views.py`, `notification_urls.py` and `tasks/interview.py` restored from `HEAD`; the 10.1 hunks in `communication_service.py` and `amendment_service.py` reversed). 36 files, because the task's own suite is **absent** | **23 failed, 287 passed**, 36 errors |
| **10.1 (candidate)** | **23 failed, 379 passed**, 36 errors |

[`candidate.txt`](raw/candidate.txt) / [`baseline.txt`](raw/baseline.txt), with the
sorted failing+erroring sets in
[`candidate-failing-set.txt`](raw/candidate-failing-set.txt) and
[`baseline-failing-set.txt`](raw/baseline-failing-set.txt).

- **New failures: 0.** `comm -23` over the two sorted sets (**59 entries each**)
  is empty. `comm -13` is also empty — nothing was fixed either, which is the
  honest reading: this task claims no repair of another lane's failure.
- **+92 passing**: exactly the task's own suite
  ([`task-suite.txt`](raw/task-suite.txt) — 92 passed on its own).

A *measured* baseline, and worth saying how it was produced, because the working
tree is not in git (the whole spec is in flight) so `git show` alone could not
supply it:

- `notification_views.py`, `notification_urls.py` and `tasks/interview.py` were
  confirmed to be **100% task-10.1** against `HEAD` and restored wholesale;
- `communication_service.py` also carries an unrelated R9.7 change
  (`_default_portal_url` / `_derive_portal_url` delegating to
  `apps/common/email_links.py`), so only the `send()` method was swapped for
  `HEAD`'s — leaving the other lane's work standing;
- `amendment_service.py` is mostly 9.5's, so only the 10.1 import, comment and
  `"metadata"` key were reversed by the same strings;
- everything was restored afterwards and the restoration was **diffed
  file-by-file against a byte copy of the candidate** (empty).

The 23 failures and 36 errors present in **both** runs are the pre-existing
clusters catalogued in [9.1 §8.1–8.3](../9.1/README.md),
[9.2 §11.1–11.2](../9.2/README.md), [9.3 §15.1](../9.3/README.md) and
[9.4 §14.1](../9.4/README.md) — by file
([`preexisting-clusters.txt`](raw/preexisting-clusters.txt)):

```
13 FAILED tests/property/test_application_endpoints.py      22 ERROR tests/unit/test_application_endpoints.py
 3 FAILED tests/property/test_accounts_error_handling.py     6 ERROR tests/unit/test_review_notifications.py
 2 FAILED tests/unit/test_applications_serializers.py        3 ERROR tests/unit/test_application_review_payment_gate.py
 2 FAILED tests/property/test_application_hardening.py       3 ERROR tests/unit/test_application_number_generator.py
 1 FAILED tests/unit/test_application_student_flow_views.py  2 ERROR tests/unit/test_application_review_force_approved.py
 1 FAILED tests/property/test_communication_template_properties.py
 1 FAILED tests/property/test_application_properties.py
```

Two are worth naming because they sit closest to this lane and are **not** ours:

- `test_review_notifications.py` (6 errors) and
  `test_communication_template_properties.py` (1 failure) fail identically in
  both runs. They are in the communication area but fail on the pre-existing
  fixture/DB clusters, not on the gate — the delivery path was exercised on both
  sides of the baseline and produced the same set.
- `test_accounts_error_handling.py::…::test_every_handler_index_has_logger_call`
  is the order-dependent failure 9.5 §11.1 already declined to claim. It fails in
  both runs here too.

### 10.2 A supplementary measured run for the files this slice edits outside the selection

`test_amendments.py` and `test_tenant_audit_amendment_scope_9_5.py` do not match
the dispatch's selection pattern, but this slice edits `amendment_service.py` and
`tasks/interview.py`, so they were measured separately over
`amendment|condition|interview|tenant_audit` (10 files):

| Run | Result |
|---|---|
| baseline (the amendment + interview 10.1 hunks reversed) | **2 failed, 167 passed** |
| candidate | **2 failed, 167 passed** |

[`supp-candidate.txt`](raw/supp-candidate.txt) /
[`supp-baseline.txt`](raw/supp-baseline.txt). Byte-identical failing sets:
`test_amendments.py::TestAmendmentReviewEndpoint::test_approve_succeeds` (already
in 9.5's measured baseline) and
`test_interview_status_validation.py::test_generated_invalid_interview_statuses_are_rejected`.
**Zero introduced.** So routing the 9.5 fan-out through the declared staff channel
set changed no behaviour 9.5's own 57-case suite asserts — it all still passes.

### 10.3 Django system checks

`cd backend && python3 manage.py check`

```
LENCO_API_SECRET_KEY is not set — payment processing will be unavailable.
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`django-check.txt`](raw/django-check.txt). The LENCO line is the expected
local-dev notice — this machine holds no provider credential. (The run also emits
the `SECRET_KEY not set` dev warning because it uses the repo venv without a
`.env` export; it is not a check failure.)

> **`manage.py check` must run with the repo's own environment.** Exporting a
> `TESTING=1` or a substitute `REDIS_URL` first flips `CACHES` to `LocMemCache`
> (`base.py` `_is_testing`) and the check then reports
> `django_ratelimit.E003 — not a shared cache`. That is the override talking, not
> the platform (recorded by 8.3 §7.7, 8.4 §7.5, 9.1 §8.5, 9.2 §11.4, 9.3 §15.3,
> 9.4 §14.3 and 9.5 §11.3; re-confirmed here).

### 10.4 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt). **Identical to 9.5's recorded counts**
(3 / 116) — so the new route and the rewritten preference serializers introduced
**no** new warning and **no** new error. The new operation is present and named:

```
/api/v1/notifications/{id}/retry/:
  post:
    operationId: communications_retry_delivery
```

`NotificationPreferenceSerializer` documents the **read** shape and
`NotificationPreferenceWriteSerializer` documents the writable switches, so the
schema states the contract; the endpoint still validates through `validate_write`,
because a DRF serializer silently **ignores** unknown keys and the whole point of
R13.8 is that an unknown key must be **refused with a reason**.

### 10.5 Authority matrix and view classification

`/api/v1/notifications/<uuid:pk>/retry/` is registered in
`scripts/authority_matrix_registry.py` as an `owner` route with
`disclosure="not_found_mask"`, `audit_event="communication.retried"` and
`finding="STU-14"`; the `/preferences/` entry records the new contract.
`CommunicationRetryView` is classified `_PROTECTED` in
`tests/unit/test_view_auth_classification.py`. So this slice adds nothing to that
file's pre-existing unclassified list and registers nobody else's view.

## 11. What slice 2 (frontend) still owes

The frontend already reads the published schema
(`src/lib/notificationPreferences.ts`, `hooks/useNotificationPreferences.ts`,
`services/notifications.ts`), renders it (`pages/student/NotificationSettings.tsx`),
merges the two inboxes into `pages/student/Communications.tsx`, resolves support
and title from tenant context via 8.3's `resolveTenantSupportContact` (STU-24),
exposes the single inbox in `MobileBottomNav` (`student.communications`, "Inbox"),
and has `notificationPreferenceSchema.test.ts` +
`notificationSettingsControls.test.tsx`. **None of that is claimed here** — it is
slice 2's to verify and document.

Precisely what remains owed:

1. **The `mobile-nav` browser journey — the one Required_Evidence item no
   endpoint can produce.** There is no `required/*.spec.ts` for 10.1 yet
   (`required/` holds 10 specs, none of them this task's). Following 9.5's shape,
   it needs the four claims the `_Evidence:` line names, desktop **and** mobile:
   preference persistence survives a reload; a mandatory row renders as a stated
   fact and offers no switch; a refused field shows the **server's** reason; a
   failed message offers a retry and the retry is visible in the history
   afterwards; and Communications is reachable from mobile **More**, with the
   retired placeholder settings screen asserted **absent** (the 9.5 pattern of
   naming the retired surface and counting it zero).
2. **The frontend gates, recorded**: `bun run test`, `bun run lint`,
   `bun run build` in `apps/admissions`, measured against 9.5's frontend baseline
   (1 pre-existing `authPageFormMarkup` failure / 4065 passed / 1 skipped; 18 lint
   errors across 15 files). Not run in this slice.
3. **Consume `audience` and `not_applicable` in the inbox.**
   `components/student/communications/MessageDeliveryState.tsx` mentions neither
   today. A staff work item's email row should render the `not_applicable`
   definition the server publishes, and must not render `unknown`'s "predates
   delivery tracking" copy for it (§5.2). `DELIVERY_STATE_TONES` already has a
   `not_applicable` entry, so this is a rendering gap, not a vocabulary one.
4. **`slice-2-frontend.md`** in this directory, and only then the 10.1 checkbox.

Explicitly **not** owed by either slice, and named rather than implied:

- **No staff notification preference screen.** §5.1 is a decision that the staff
  channel set is a platform fact; publishing a staff switch would owe a delivery
  path that honours it. If that is ever wanted, it is a new task with a new
  category audience and a real settings surface.
- **No SMS, no WhatsApp, no quiet-hours scheduler.** They are refused, with
  reasons, precisely because implementing them is not this task.
- **No change to `/api/v1/notifications/user/{id}/`** (the admin history view) and
  no change to the notification cursor/polling contract.
- **A pre-existing unused `from django.utils import timezone` in
  `communication_service.py`** is at `HEAD` and was left alone; ruff is not a CI
  gate and it is not this task's.

## 12. Files

```
docs/v2-evidence/10.1/
├── slice-1-backend.md                  ← this index
└── raw/
    ├── candidate.txt                       (37 files: 23 failed / 379 passed / 36 errors)
    ├── baseline.txt                        (the SAME selection, 10.1's backend removed: 23 / 287 / 36)
    ├── candidate-failing-set.txt           (59 sorted entries)
    ├── baseline-failing-set.txt            (59 sorted entries — comm -23 and comm -13 both empty)
    ├── preexisting-clusters.txt            (the pre-existing failures/errors by file)
    ├── supp-candidate.txt                  (amendment/interview/tenant-audit: 2 failed / 167 passed)
    ├── supp-baseline.txt                   (the same, 10.1's hunks reversed: 2 / 167 — identical sets)
    ├── task-suite.txt                      (92 passed)
    ├── django-check.txt                    (no issues, exit 0)
    └── spectacular.txt                     (3 warnings / 116 errors — unchanged from 9.5)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/common/notification_preferences.py` | **new** — the one published schema **and** the one delivery gate in the same module, so a control exists only when a delivery path honours it: `Channel`/`CHANNELS`, `Category`/`CATEGORIES`, `AUDIENCE_CHANNELS` + `AUDIENCE_CHANNEL_REASONS` + `CATEGORY_STAFF_ACTION_REQUIRED` (§5), derived `WRITABLE_FIELDS`, `UNSUPPORTED_FIELD_TABLE`, `TEMPLATE_CATEGORIES` / `DIRECT_PRODUCER_CATEGORIES`, `resolve_preferences`, `validate_write` / `apply_write`, `resolve_delivery`, `deliver_message`, `staff_delivery_metadata` |
| `backend/apps/common/communication_history.py` | **new** — the delivery-state vocabulary with a definition each, `_UNUSED_REASON_STATES` + `UNCLASSIFIED_UNUSED_REASONS`, the one-query-per-page `project_delivery`, `history_vocabulary` (published on the schema surface, not on every inbox page), and `retry_email_delivery` + `ACTION_COMMUNICATION_RETRIED` |
| `backend/apps/common/notification_views.py` | `NotificationPreferenceView` rewritten onto `resolve_preferences` / `validate_write` / `apply_write`; the read/write serializers split; `_with_delivery` on all three list paths; `audience` added to `NotificationItemSerializer`; **new** `CommunicationRetryView`. The view holds no delivery logic (`TestOneAuthority`) |
| `backend/apps/common/notification_urls.py` | `POST /api/v1/notifications/<uuid:pk>/retry/` |
| `backend/apps/common/communication_service.py` | `send()` routed through `deliver_message` — the template's `channel` still decides which channels a *message type* uses; the student's preferences now decide which of those are used, and the decision is recorded. Email-only templates consult `resolve_delivery` directly. A gate failure still writes the in-app record |
| `backend/apps/applications/tasks/interview.py` | `interview_reminder_task` → `deliver_message` with `DIRECT_PRODUCER_CATEGORIES["interview_reminder"]`; the only producer of the only switchable category |
| `backend/apps/applications/amendment_service.py` | 9.5's staff fan-out now carries `staff_delivery_metadata(CATEGORY_STAFF_ACTION_REQUIRED, …)`, so its email channel reads `not_applicable` with a reason instead of `unknown` (§5.2). No recipient logic changed |
| `backend/tests/unit/test_notification_preferences_10_1.py` | **new** — 92 cases across 10 classes |
| `scripts/authority_matrix_registry.py` | the retry route and the rewritten `/preferences/` contract |
| `backend/tests/unit/test_view_auth_classification.py` | `CommunicationRetryView` classified protected |
| `docs/canonical-truth-map.md` | the 10.1 section (§9) + the Drift Guard Inventory entry |

## 13. The task's own backend suite

`tests/unit/test_notification_preferences_10_1.py` — **92 passed**:

| Class | Cases | What it settles |
|---|---|---|
| `TestThePublishedSchemaIsDerivedFromDelivery` | 9 | §3 — writable ⇔ configurable, in-app is not a toggle, every published item ships a definition, every optional category has a real producer, no refused field is writable, every refusal has a code and a reason, and every model column is accounted for |
| `TestWriteValidation` | 14 | §3.2 — each refusal by its own code, whatsapp vs in-app refused *differently*, a non-boolean refused, one bad field refuses the whole write, every writable field accepted, an empty body accepted |
| `TestPreferenceEndpoint` | 10 | §1 "preference persistence" — defaults flagged as defaults, no column echoed that is not accepted, every refusal explained on the read, persist/read-back, idempotence, refusal stores nothing, a mandatory category cannot be switched off, auth required, cross-student isolation, a pre-10.1 row still reads |
| `TestTheDeliveryGate` | 10 | §4 — mandatory ignores every setting; optional follows the channel *and* its own switch; the inbox is written even when email is off; a missing address is `no_recipient` not a preference; a durable outbox row per channel; idempotence on the key; an unclassified template is delivered; a missing row is the defaults; the record carries no address and no provider text |
| `TestEveryProducerGoesThroughTheGate` | 4 | §4 — the template service and the interview task actually call the gate; every direct producer names a published category; the template map is total over the seeded catalogue |
| `TestTheCommunicationsHistory` | 11 | §6 |
| `TestRetryIsAnAuthorizedAuditedDurableCommand` | 11 | §7 |
| `TestOneAuthority` | 4 | the view names no refused column and holds no delivery logic; `resolve_delivery` is defined once; the history reads the channel vocabulary rather than restating it |
| `TestAudienceDecidesTheChannelSet` | 14 | §5 — every category declares a published audience; every audience declares a channel set; the inbox is in all of them; staff is inbox-only *and says why*; a staff category is never published as a preference; the payload publishes student categories only; a preference cannot widen a channel set; a staff message is `not_applicable` not `unknown`; suppression ≠ inapplicable; every gate reason has a published state; the staff record carries no recipient; the amendment fan-out declares the set; the audience travels on the message; a pre-10.1 message is still a student message |
| `TestTheFrontendMirrorCannotDrift` | 5 | §9 |
