# Task 10.3 — Make enrollment readiness and confirmation transactional

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Evidence index for task **10.3** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 10.3 Make enrollment readiness and confirmation transactional
  - Add deadline/readiness to list/detail contracts.
  - Support conditionally approved applications only after verified conditions.
  - Recheck conditions/deadline/capacity/existing enrollment under lock.
  - _Requirements: R13.2, R13.9, R17.1_
  - _Findings: STU-15, DATA-03_
  - _Evidence: concurrent confirm, deadline, missing-condition, and success tests_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-09 (UTC).
- **This is the sentence [10.2 §13](../10.2/README.md) handed over by name.** R13.9's
  second half — "Enrollment readiness/deadline SHALL be server-authored and
  rechecked under the enrollment lock before confirmation" — was explicitly not
  10.2's: it published condition state without adding a readiness contract, and it
  did not change `EnrollmentService`. So the condition vocabulary, the per-condition
  state machine and `CONDITION_TERMINAL_STATES` were **read** here, not restated.
- It reuses, rather than re-implements: task **6.5**'s readiness shape and its
  `ReadinessBlocker` payload (and `evaluate_capacity`); task **5.3**'s
  `CapacityService`, its canonical `(program_offering_id, intake_ref_id)` keying and
  its **fixed lock order**; task **10.2**'s condition state machine; task 2.2's
  `authorize_owned_application` 404 mask; and the `_payment_summary_cache` /
  `_grade_summary_cache` batching pattern already in `serializers.py`.
- PBT: task 10.3 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`. The five fast-check invariants in
  `enrollmentReadiness.property.test.ts` are **task** invariants, and §9.2 says so.
- Schema: **no migration.** No table, column, index, capability, role or route was
  added, and no SQL script ships under `backend/scripts/`. §3 records why, and
  `test_no_migration_ships_with_this_task` asserts it. **No Neon branch was
  created** (the branch limit is exceeded, and 10.1 and 10.2 both needed no
  migration either — which is why the first question here was whether one was
  needed at all). Neon and production were not touched; the only databases used
  were the throwaway `mihas_localtest` Postgres and the task-0.4 harness.

## The Required_Evidence claim

The `_Evidence:` line names **four** things. Each has a backend class, and each has
a browser journey.

| Claim | Backend | Browser |
|---|---|---|
| **success** | [`test_enrollment_readiness_10_3.py::TestSuccessfulConfirmation`](../../../backend/tests/unit/test_enrollment_readiness_10_3.py) (5) — an approved offer enrolls; a **conditional** offer with every condition accepted enrolls; the readiness afterwards reads `confirmed`; a second confirmation is idempotent with **one** history row; the endpoint answers the envelope carrying the readiness | journey 1 |
| **missing condition** | `…::TestMissingCondition` (7) — each of the three non-terminal condition states blocks, parameterised; the outstanding set is derived from 10.2's machine rather than named again; an outstanding condition says who it waits on; accepted/waived do not block; `expired` is terminal here and the auto-rejection owns that decision; an unconditional offer is unaffected by a stray condition row | journey 2 |
| **deadline** | `…::TestDeadline` (5) — a passed deadline refuses; the countdown is server-authored; overdue is **negative**, not clamped; no deadline is not a passed deadline; and a deadline shortened **after** the pre-check still refuses | journey 3 |
| **concurrent confirm** | `…::TestConcurrentConfirmation` (2, Postgres-only) — six parallel confirmations produce exactly **one** transition and six successes; and a confirmation racing a condition rejection loses | journey 4 |

Plus the contract and the surfaces it feeds: `TestReadinessContract` (7),
`TestCapacityAndExistingEnrollment` (6), `TestReadContract` (5),
`TestConfirmAuthority` (3), `TestOneEvaluator` (7), `TestCounterIsUntouched` (1).

Why the browser is required and not only endpoint tests: **STU-15 is half a
missing surface.** The deadline was absent from both serializers while
`ApplicationListItem` was already reading `enrollment_confirmation_deadline` off
the list row — so the field was permanently `undefined` and the enrollment card
could not render at all. The only rule that survived was a client-side
`status === 'approved'` test, and that rule is *narrower* than the backend's: a
conditionally approved student who had satisfied every condition was shown nothing
to do. An endpoint test can prove the command accepts them; only the browser can
prove they are offered it.

### The 4 required journeys

[`enrollment-readiness-confirmation.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/enrollment-readiness-confirmation.spec.ts)
— **4 journeys × 2 viewports = 8, all passing on a freshly wiped harness with zero
skips** ([`raw/harness-enrollment-journeys.txt`](raw/harness-enrollment-journeys.txt)):

| Journey | The claim it settles |
|---|---|
| **success** | the detail read publishes `state: confirmable`, a server-computed deadline, a positive countdown, an empty blocker list and the platform's own definition; the **dashboard row** renders the card at all, with "Confirm enrollment by …" and a countdown; the application page offers the control; the student confirms and the platform reads back `enrolled` with `state: confirmed`; and a **replayed** confirmation is a 200 carrying `enrolled`, not an error |
| **missing condition** | an outstanding condition gives `state: blocked`, `CONDITIONS_NOT_MET`, and a non-empty `allowed_actions`; the page shows the reason and the action with **no** confirm button; the command refuses 400; the school accepts the condition; the same `conditionally_approved` application then reads `confirmable`, the control appears, and it enrolls |
| **deadline** | the offer starts confirmable with a positive countdown; the deadline is brought into the past through the platform's own column (§8.2); the readiness flips to `deadline_passed` with a **negative** countdown and `DEADLINE_PASSED`; the page says the deadline *passed* rather than showing time remaining; and the command refuses 400 |
| **concurrent confirm** | six simultaneous POSTs all answer 200 with `enrolled`, and the student's own timeline holds **exactly one** `enrolled` transition for that application — so one student number, one notification, one audit trail; afterwards the page offers no control that would invite a seventh attempt |

## What this task establishes

1. **Enrollment readiness is a value, not three scattered checks.** One evaluator
   answers status, every mandatory condition, the deadline, capacity and existing
   enrollment; the list read, the detail read and the confirmation command all
   consume it, so there is nothing for them to disagree about (§1).
2. **It is the shape task 6.5 established, not a fork of it.** 6.5 owns
   *submission* readiness (`evaluate_readiness` + the in-lock `submission_blockers`);
   9.4 reused it rather than writing a second one. This task does the same for the
   *enrollment* gate: one evaluator, three consumers, 6.5's `ReadinessBlocker`
   payload, and 6.5's `evaluate_capacity` for the capacity section. There is no
   second submission evaluator, and a test asserts it (§1.2).
3. **"All conditions resolved" is read from 10.2's state machine.** The pre-10.3
   gate asked two questions — is any condition `pending`, is any `expired` — so
   10.2's `evidence_submitted` and `changes_required` were **invisible** and counted
   as satisfied. A student whose evidence had just been rejected could confirm
   (§4).
4. **The recheck happens under the locks, in task 5.3's order.** The capacity row
   first, then the application row, then the *same* evaluation re-run on the locked
   rows. Pre-10.3 the condition and deadline reads happened before
   `transaction.atomic()` opened (§5).
5. **Confirmation is idempotent without an `Idempotency-Key`.** An already-enrolled
   application returns unchanged, so a retried request after a dropped response
   never tells a student their confirmed place is invalid — design §11.2's "commits
   idempotently" (§5.2).
6. **Capacity asks "is there room for me".** The same predicate submission
   evaluates under its own lock. This is the gate that actually bites for a
   conditional offer, which holds no seat (§6).
7. **Existing enrollment is keyed canonically.** A same-name offering at another
   tenant is a different cohort, so a student enrolled at one school is not
   "already enrolled" at the other (§6.2).
8. **The browser decides nothing.** `state`, `definition`, the countdown, the
   blocker message and the permitted actions all arrive on the response; the client
   helper adds no vocabulary and no rules (§7).
9. **A readiness that cannot be evaluated is absent, not empty** — R11.6's
   fail-closed-but-honest rule applied to a read (§7.3).
10. **No migration was needed, and that was checked rather than assumed** (§3).

## Files

```
docs/v2-evidence/10.3/
├── README.md                                  ← this index
└── raw/
    ├── candidate.txt                              (54 files: 19 failed / 512 passed / 18 skipped / 50 errors)
    ├── baseline.txt                               (the SAME selection before this task: 19 / 462 / 18 / 50)
    ├── candidate-failing-set.txt                  (69 sorted entries)
    ├── baseline-failing-set.txt                   (69 sorted entries — comm -23 and comm -13 both empty)
    ├── authority-matrix.txt                       (the same 1 stale entry and the same 38 unclassified views)
    ├── frontend-test.txt                          (1 pre-existing failure / 4173 passed / 1 skipped, 477 files)
    ├── frontend-lint.txt                          (18 errors)
    ├── frontend-lint-files.txt                    (the 15 files — byte-identical to 10.2's set)
    ├── frontend-build.txt                         (exit 0, incl. tsc + the CSP gate)
    ├── django-check.txt                           (no issues)
    ├── spectacular.txt                            (3 warnings / 116 errors — unchanged)
    ├── harness-enrollment-journeys.txt            (8 passed — 4 journeys × desktop + mobile, freshly wiped harness)
    └── harness-required-suite.txt                 (the whole required profile: 126 passed / the 2 pre-existing tenant-launch failures)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/applications/enrollment_service.py` | rewritten around one readiness value: `ENROLLABLE_STATUSES`, the six stable blocker codes, `_NEXT_ACTION_BY_CODE`, `ENROLLMENT_STATE_DEFINITIONS`, the frozen `EnrollmentReadiness` (+ `allowed_actions()` / `to_payload()`), `condition_tally` (over 10.2's `CONDITION_TERMINAL_STATES`), `_existing_enrollment`, `evaluate_enrollment_readiness`, the page-batched `enrollment_readiness_map` + `_capacity_for`, and `_raise_for` (the refusal precedence, declared once). `confirm_enrollment` now locks the capacity row then the application row and re-runs the evaluator **inside** the transaction; `EnrollmentError` gained an optional `status_code` defaulting to the pre-10.3 400. `compute_deadline` and the notification helper are unchanged |
| `backend/apps/applications/serializers.py` | **new** `ApplicationEnrollmentReadinessMixin` — one readiness map per serializer instance, `many=True` and a single object on the same path, and a failure reported as an absent readiness rather than a 500 or an empty checklist. `ApplicationSerializer` and `ApplicationListSerializer` both publish `enrollment_confirmation_deadline` **and** `enrollment`, both read-only |
| `backend/apps/applications/student_withdrawal_views.py` | `ApplicationConfirmEnrollmentView` maps `EnrollmentError.status_code` (so a conflict with committed state answers 409 and every pre-10.3 refusal keeps its 400). The view still holds no lifecycle logic |
| `backend/tests/unit/test_enrollment.py` | one mock-based case moved onto the new call shape (§9.1) |
| `backend/tests/unit/test_enrollment_readiness_10_3.py` | **new** — 50 cases (§9) |
| `apps/admissions/src/types/database.ts` | `EnrollmentReadiness` / `EnrollmentBlocker` / `EnrollmentAllowedAction`, plus `enrollment_confirmation_deadline` and `enrollment` on `Application` |
| `apps/admissions/src/services/applications.ts` | re-exports the three types, so callers have one import for the student application contract |
| `apps/admissions/src/lib/enrollmentReadiness.ts` | **new** — `enrollmentReadinessOf` (absent ⇒ `null`), `canConfirmEnrollment`, `formatEnrollmentCountdown`, `enrollmentMessage`. Adds **no** vocabulary and **no** rules (§7) |
| `apps/admissions/src/components/student/ApplicationListItem.tsx` | the enrollment card is driven by the server's `can_confirm`, shows the countdown, and re-renders when the readiness state changes (a condition being accepted is exactly that) |
| `apps/admissions/src/components/student/applicationStatus/NextActionCards.tsx` | `showEnrollButton: boolean` replaced by `enrollment: EnrollmentReadiness | null`; a new section renders the confirmable **and** the blocked state, with the platform's definition, the countdown, the first blocker's message and the server's `allowed_actions` |
| `apps/admissions/src/pages/student/ApplicationStatus.tsx` | passes the readiness, and the two "next move" strings read `can_confirm` instead of `status === 'approved'` |
| `apps/admissions/tests/unit/enrollmentReadiness.test.tsx` | **new** — 22 cases |
| `apps/admissions/tests/property/enrollmentReadiness.property.test.ts` | **new** — 5 fast-check task invariants (§9.2) |
| `apps/admissions/tests/harness-e2e/helpers/ops.ts` | **new** `expireEnrollmentDeadline` — the deadline lever, in `runReconciliationExpirySweep`'s established shape (§8.2) |
| `apps/admissions/tests/harness-e2e/required/enrollment-readiness-confirmation.spec.ts` | **new** — the 4 required browser journeys, desktop and mobile |
| `docs/canonical-truth-map.md` | "Enrollment readiness and confirmation" + the Drift Guard Inventory entry |

---

## 1. What was missing (STU-15, R13.9)

STU-15 names three defects in one sentence:

> Enrollment deadline is absent from serializers; UI only offers confirmation for
> approved status although the backend can allow conditionally approved
> applications, and conditions are not rechecked under the enrollment lock.

All three share one cause: **there was no readiness contract.** The status gate,
the deadline gate and the condition gate each lived at a different point in the
call path, two of them outside the transaction, and none of them was published —
so the browser had to invent its own rule, and invented a different one.

Concretely, before this task:

- `ApplicationSerializer.Meta.fields` and `ApplicationListSerializer.Meta.fields`
  contained **no** `enrollment_confirmation_deadline`, while
  [`ApplicationListItem.tsx`](../../../apps/admissions/src/components/student/ApplicationListItem.tsx)
  read `application.enrollment_confirmation_deadline as string | undefined` and
  gated the whole enrollment card on `!!enrollmentDeadline`. The field was
  permanently `undefined`, so **the card never rendered**. It compiled only because
  `Application` carries an `[key: string]: unknown` index signature — a type that
  cannot tell a missing field from an absent value;
- `NextActionCards` received `showEnrollButton={application.status === 'approved'}`
  and rendered the confirm control inside an `applicationStatus === 'approved'`
  branch. `confirm_enrollment` accepted `conditionally_approved` — and still does —
  so a student who had satisfied every condition had **no control at all**;
- the condition check was two `.exists()` queries (`status="pending"`,
  `status="expired"`) and the deadline check a single `if`, both **above**
  `with transaction.atomic():`. Only the status and the deadline were re-read under
  the lock;
- design §11.2's other two rechecks — **capacity** and **existing enrollment** —
  had no implementation anywhere.

### 1.1 The condition gate had gone stale under 10.2

This is the sharpest form of the defect, and it is new since 10.2. The gate asked:

```python
pending = ApplicationCondition.objects.filter(status="pending").exists()
expired = ApplicationCondition.objects.filter(status="expired").exists()
```

Task 10.2 added two states to that column — `evidence_submitted` (the school owes
a review) and `changes_required` (the student owes a replacement). Neither is
`pending` and neither is `expired`, so **both were read as satisfied**: a student
whose evidence had just been rejected with a reason could confirm their
enrollment. Naming statuses again is how a gate goes stale, which is why
`condition_tally` derives the outstanding set from
`CONDITION_TERMINAL_STATES` instead:

```python
if state in CONDITION_TERMINAL_STATES:   # met | waived | expired
    ...                                   # resolved
else:
    outstanding.append(...)               # pending | evidence_submitted | changes_required
```

`test_the_outstanding_set_is_derived_from_the_state_machine` walks **every** state
in `CONDITION_STATES` and asserts the split equals
`set(CONDITION_STATES) - CONDITION_TERMINAL_STATES`, so a seventh state is covered
the day it is added rather than the day someone remembers this gate.

### 1.2 One evaluator, because 6.5 already owns the other one

Task 6.5 owns *submission* readiness: `evaluate_readiness` (the query) plus
`submission_blockers` (the same gates re-evaluated on the locked row inside
`submit_application`). Task 9.4 consumed it rather than writing a second one.

Enrollment readiness is a different question — a different lifecycle point, a
different set of gates — but it is deliberately built to the **same shape** and
out of the same parts:

| Part | Where it comes from |
|---|---|
| the blocker payload | 6.5's `ReadinessBlocker` (`code`, `category`, `message`, `retryable`, `fields`, `details`) |
| the capacity section | 6.5's `evaluate_capacity`, over 5.3's `CapacityService` |
| the condition vocabulary | 10.2's `CONDITION_TERMINAL_STATES` / `CONDITION_STATE_DEFINITIONS` |
| the lock order | 5.3's: capacity row, then application row |
| "one evaluator, N consumers" | 6.5's structure, applied to the enrollment gate |

Three tests hold that line:
`test_there_is_no_second_submission_readiness_evaluator` (no
`def evaluate_readiness` / `def submission_blockers` in this module, and the
blockers really are `ReadinessBlocker` instances),
`test_there_is_no_second_condition_state_vocabulary`, and
`test_the_seat_status_set_is_not_redefined_here`.

## 2. The readiness contract (R13.2, R13.9)

`evaluate_enrollment_readiness(application) -> EnrollmentReadiness` publishes:

```text
state              confirmable | blocked | confirmed | not_applicable
definition         the platform's sentence for that state
deadline           ISO, or null
deadline_passed    bool
seconds_remaining  the server's number — negative once spent
days_remaining     floor(seconds / 86400)
conditions         {total, accepted, expired, outstanding, outstanding_conditions, satisfied}
capacity           {canonical, limit, occupied, seats_available, satisfied, code}
existing_enrollment{this_application, other_application_id, canonical}
blockers           [ReadinessBlocker] — in refusal precedence
can_confirm        bool
allowed_actions    [{action, label, blocker_code}] — never empty while blocked
evaluated_at       ISO
```

Four deliberate properties:

- **the copy is the platform's.** `definition` comes from
  `ENROLLMENT_STATE_DEFINITIONS`, not from a browser table keyed on a status
  string. This is 9.1/9.4/10.2's rule, and STU-14 is the cautionary tale — a
  client-side vocabulary is how the notification settings drifted away from the
  delivery path;
- **`not_applicable` is not `blocked`.** "It is not your turn yet" and "you are
  stuck" are different facts, and an under-review application is the first, not the
  second. `test_a_non_offer_status_is_not_applicable_rather_than_blocked` pins it;
- **no blocker is advertised as `retryable`.** Each one is either work the student
  must do, a decision only the school can change, or already-committed state. None
  clears by trying again, and saying otherwise would send the student into a loop;
- **`ALREADY_ENROLLED` is a readiness blocker but not a command failure.** "Confirm
  enrollment" is not an action a confirmed student still has to take, so the
  readiness says so — while the command treats the same state as success (§5.2).

What is **not** published: any reviewer or verifier identity. The student needs
the decision and its timing; who made it is the school's internal record and lives
in the tenant audit feed — 10.2 §8's rule, restated here because the same
temptation exists on this surface.
`test_the_payload_is_json_serialisable_and_carries_no_reviewer_identity` asserts
neither key appears anywhere in the serialised payload.

## 3. Schema: nothing to migrate, and that was checked

Three facts made a migration unnecessary, and each was verified rather than
assumed:

| What was needed | What already exists | How it was checked |
|---|---|---|
| somewhere to store the deadline | `applications.enrollment_confirmation_deadline` (`DateTimeField`, nullable) — written by `transition_application_status` on entry to an offer status since the business-logic densification | the model field, and every journey reads a deadline the *platform* computed |
| somewhere to read condition state | `application_conditions.status` — 10.2 already put `evidence_submitted` / `changes_required` in it, in a `varchar(20)` with no CHECK | 10.2 §3 measured that column; this task adds no value to it |
| somewhere to read capacity | `program_intakes` + the canonical `(program_offering_id, intake_ref_id)` assignment IDs from task 5.2, and 5.3's `CapacityService` over them | 5.3's own suite; re-exercised by `TestCapacityAndExistingEnrollment` |

The readiness itself is **derived, never stored** — which is the point: a stored
readiness is a second source of truth that goes stale the moment a condition is
reviewed. `test_no_migration_ships_with_this_task` globs `backend/scripts/*.sql`
and asserts no 10.3 script exists, so the claim is a test rather than a sentence.

### 3.1 Why `SEAT_STATUSES` was not widened

The obvious-looking change is to add `enrolled` to
`capacity_service.SEAT_STATUSES`, and it was deliberately **not** made. Task 5.3
recorded the question as open in its own module docstring — *"Redefining occupancy
— e.g. whether `enrolled` should count — is deliberately out of scope"* — and it is
a change to a constant that **every** submission capacity decision on the platform
reads, plus the six literal copies of the same tuple inside the legacy
`IntakeEnforcer` that 5.3 keeps deliberately identical so `reconcile` and
`sync_enrollment` cannot fight.

Widening it from inside the enrollment lane would change how every applicant's
submission is gated, as a side effect of a task about confirmation. So this task
does the narrow, correct thing instead:

- it **rechecks** capacity at confirmation with the same predicate submission uses
  (§6), which is what design §11.2 asks for;
- it leaves the counter untouched across the transition — an approved application
  already claimed its seat at submission, so incrementing again would double-count
  it and releasing it would hand a confirmed student's place to the waitlist.
  `test_confirmation_does_not_change_the_capacity_counter` pins that;
- and it records the open question here rather than closing it silently.
  `test_the_seat_status_set_is_not_redefined_here` asserts the tuple, so the next
  engineer to widen it does so on purpose. Design §7.1's invariant ("enrolled not
  greater than capacity when overbooking is disabled") says the widening is
  eventually right; it belongs to whoever owns occupancy, with the submission
  suites re-measured.

## 4. A conditional offer enrolls only once its conditions are resolved (R13.9)

The status gate is `ENROLLABLE_STATUSES = ("approved", "conditionally_approved")`
— unchanged from what `confirm_enrollment` already accepted — and the condition
gate now covers every non-terminal state (§1.1).

Two decisions worth naming, because each could reasonably have gone the other way:

- **`expired` is terminal here, and does not block.** A condition that expired is
  resolved as far as *this* gate is concerned; the application-level consequence is
  `ConditionManager.auto_promote_if_all_met`'s auto-rejection, which owns that
  decision. Duplicating it as a second enrollment blocker would give the platform
  two answers to one question. `test_an_expired_condition_is_resolved_but_counted_separately`
  pins the behaviour *and* the separate `expired` count that makes it visible;
- **an unconditional offer is unaffected by a stray condition row.** The condition
  gate applies to a conditional offer, exactly as it always did. Widening it to
  `approved` would be a new refusal, not a fix.

## 5. The recheck happens under the locks (R13.9, R17.1, DATA-03)

```python
application = Application.objects.get(id=application_id)          # advisory
if status == "enrolled": return application                        # idempotent
advisory = evaluate_enrollment_readiness(application)
if not advisory.can_confirm: _raise_for(advisory)

with transaction.atomic():
    CapacityService.lock_capacity_row(offering_id, intake_id)      # 5.3's order: capacity first
    locked_app = Application.objects.select_for_update().get(...)  # then the application
    if locked_app.status == "enrolled": return locked_app          # a concurrent winner
    readiness = evaluate_enrollment_readiness(locked_app)          # the SAME evaluation
    if not readiness.can_confirm: _raise_for(readiness)
    transition_application_status(locked_app, "enrolled", ...)
```

- **the advisory pre-check exists to avoid paying for a lock** on an obviously
  ineligible application — the same advisory/authoritative split task 5.3 uses for
  its pre-lock capacity check. The authoritative answer is always the in-lock one;
- **`test_the_command_re_runs_the_evaluator_inside_the_transaction` parses the
  function** and asserts both `evaluate_enrollment_readiness` and
  `transition_application_status` are called inside the `with` body. That is the
  STU-15 defect expressed as a structural claim, so a refactor cannot quietly move
  the evaluation back outside;
- **`test_the_capacity_row_is_locked_before_the_application_row`** asserts the
  order by source position. Task 5.3 fixed *capacity row, then application* for
  submission, withdrawal, promotion and expiry; a command that took them the other
  way round would deadlock against all four;
- **the in-lock re-read is proven twice**: deterministically by
  `test_a_deadline_shortened_after_the_pre_check_still_refuses` (which moves the
  deadline at the instant the application row is locked) and concurrently by
  `test_a_confirmation_racing_a_condition_rejection_loses` (a real second thread
  rejecting the condition between the pre-check and the lock).

### 5.1 The refusal precedence is declared once

The blocker order inside `evaluate_enrollment_readiness` **is** the refusal
precedence — status, conditions, deadline, duplicate enrollment, capacity — and
`_raise_for` raises the first one. So the code the command returns and the message
the page shows are the same choice, made in one place.
`test_the_refusal_precedence_is_declared_once` builds an application that trips
three blockers at once and asserts both sides pick `CONDITIONS_NOT_MET`.

Pre-10.3 callers branch on `INVALID_STATUS_FOR_ENROLLMENT` / `CONDITIONS_NOT_MET`
/ `DEADLINE_PASSED` and still see exactly those codes with a **400**;
`EnrollmentError.status_code` defaults to 400 so no existing refusal changed shape.
The two new codes are conflicts with committed state and answer **409**.

### 5.2 Confirmation is idempotent — a documented contract strengthening

Design §11.2 says confirmation "commits idempotently". Before this task, a second
confirmation of an enrolled application raised
`INVALID_STATUS_FOR_ENROLLMENT` — because `enrolled` is terminal in
`ALLOWED_TRANSITIONS` — which tells a student whose response was dropped in transit
that their confirmed place is invalid. It now returns the application unchanged.

This is a **behaviour change**, recorded here rather than buried:

- the endpoint already carries `@idempotent`, but that only helps a caller who
  sends an `Idempotency-Key`. Natural idempotence covers the browser retry, the
  double-tap and the concurrent race;
- it is checked **twice** — once before the lock and once on the locked row — so the
  loser of a genuine race observes the winner's commit instead of failing;
- `test_a_second_confirmation_is_idempotent_rather_than_an_error` asserts both
  callers see `enrolled` and the status history holds **one** row, which is what
  keeps the student number, the notification and the audit trail single;
- no existing test asserted the old refusal; the whole of `test_enrollment.py`
  passes (§9.1).

## 6. Capacity and existing enrollment (design §11.2)

Both gates are new — they had no implementation at all.

**Capacity** is the same predicate `CapacityService.take_seat_for_submission`
evaluates under its own row lock: *"is there room for me"*, never *"is the intake
full including me"*.

```python
others = occupied - 1 if this_application_holds_a_seat else occupied
satisfied = others < limit
```

An application already in `SEAT_STATUSES` subtracts its own seat; a
`conditionally_approved` offer — which `SEAT_STATUSES` does **not** include — is
compared against the whole cohort, because it genuinely still needs a place. That
asymmetry is the point: the conditional case is where this gate bites, and
`test_a_conditional_offer_is_refused_when_the_offering_has_no_seat` proves it while
`test_an_approved_application_is_measured_without_its_own_seat` proves the
approved case is not refused its own place.

### 6.1 Two same-name tenants are two cohorts

**Existing enrollment** answers two questions, deliberately separated:

- `this_application` — is *this* application already enrolled? (§5.2's idempotence);
- `other_application_id` — does the same student already hold an enrolled
  application on the **same canonical Intake_Offering**? Keyed on
  `(program_offering_id, intake_ref_id)` (task 5.3, DATA-02), never the display
  strings. `test_a_same_name_offering_at_another_tenant_is_not_a_duplicate` builds
  two tenants sharing one canonical program and asserts a student enrolled at one
  is not blocked at the other.

### 6.2 A legacy row is not constrained

An application without a full canonical offering + intake identity (a pre-5.2 row)
reports `canonical: false` on both sections and is not gated by either — strictly
additive, exactly like the 5.2/5.3 seams this reuses.

## 7. The read contracts, and a browser that decides nothing (R13.2)

Both serializers publish `enrollment_confirmation_deadline` **and** `enrollment`,
both **read-only**: the deadline is computed by `EnrollmentService.compute_deadline`
when the offer is made and the readiness is derived, so neither is ever accepted
from a request body (`test_the_readiness_is_never_accepted_from_a_request_body`).

The client helper (`src/lib/enrollmentReadiness.ts`) owns exactly two things a
browser genuinely does own, and adds no vocabulary:

- **`enrollmentReadinessOf`** — read the contract, and answer `null` when the
  server published nothing. `null` means *unknown*, and is deliberately **not**
  collapsed into a synthetic `can_confirm: false`: a caller that cannot tell
  "blocked" from "unevaluable" will eventually present one as the other;
- **`formatEnrollmentCountdown`** — phrase the server's own `seconds_remaining`.
  Never re-derived from `deadline` against the browser clock, which is how a device
  with a wrong clock talks a student out of a place they still have. The case
  *"reads the server countdown rather than re-deriving it from the deadline"* hands
  it a deadline in the year 2000 with five days remaining and asserts the server
  wins.

`NextActionCards` renders `state`, the platform's `definition`, the countdown, the
first blocker's message and the server's `allowed_actions`. The confirm control
exists exactly when `can_confirm` is true; a blocked student sees the reason and at
least one labelled action, never a silently missing button. Both the confirmable
and blocked sections pair every status colour with an icon **and** text.

### 7.1 List query cost

The readiness for a whole page is resolved once per serializer instance by
`enrollment_readiness_map`: conditions for every row in **one** query, capacity rows
one per **distinct** Intake_Offering (there are far fewer offerings than
applications on a page), live seat counts in one grouped aggregate, and
enrolled-elsewhere rows in one query. `many=True` and a single object take the same
path, so there is one code path and one cost model.
`test_the_list_read_does_not_query_once_per_application` serialises five
applications and counts the readiness queries with `CaptureQueriesContext`.

### 7.2 An unevaluable readiness is absent, not empty

If the canonical configuration cannot be resolved, the mixin logs and publishes
`enrollment: null`. It does **not** 500 (a student reading their own application
must not be locked out by a configuration outage) and it does **not** answer a
zeroed "nothing to do" — which is the defect shape STU-13 and STU-15 share, and the
same choice 9.4 made for the reviewer readiness panel.
`test_an_unevaluable_readiness_is_absent_rather_than_empty` asserts it.

## 8. Authority, and the one harness lever

Confirmation stays **owner-only** through 2.2's
`authorize_owned_application(..., allow_scoped_staff=False)`: enrollment is the
student's decision, so scoped staff get the same masked 404 as another student and
as an unknown id — asserted byte-for-byte by
`test_another_student_is_masked_identically_to_an_unknown_id`.
`test_no_role_string_is_compared_in_the_enrollment_service` **parses** the module
and reports a role literal only where it appears in an `ast.Compare` or as a
`role…` keyword to `.filter()` / `.exclude()` / `.get()` — which is precisely what
R3.1 forbids — for 9.5 §9.1 / 10.2 §10's reason: the module documents the authority
model in prose, and a grep guard fails on its own documentation.

No new capability and no new route: the catalogue stays at 17 `platform.*` + 17
`tenant.*`, `scripts/authority_matrix_registry.py` is untouched, and the four new
browser journeys exercise routes that already existed.

### 8.1 The AST guard that had to learn a second exemption

`test_there_is_no_second_condition_state_vocabulary` failed twice before it was
right, and both failures are worth recording because they are the same lesson at
two depths:

1. as a **grep**, it failed on the module's own docstring, which quotes the
   `status="pending"` query it replaces. That is 10.2 §10's warning, met in
   practice;
2. as an **AST walk ignoring docstrings**, it failed on `"expired"` — a *dict key*
   in `condition_tally`'s published payload, where it is the name of a count, not a
   status compared against a row.

The guard now exempts docstrings and dict keys and flags everything else, so it
catches the shapes that actually constitute a second vocabulary (a comparison, a
set/list literal, an ORM filter value) and nothing else.

### 8.2 `expireEnrollmentDeadline` — compressing the wait, not the behaviour

The deadline journey needs a **spent** deadline. `compute_deadline` puts it 14 days
out (or on the intake's academic-calendar event), and the field is deliberately
server-authored — read-only on the serializer, with no operator write route — so
there is no HTTP lever and a required test cannot wait a fortnight.

So `helpers/ops.ts` gained `expireEnrollmentDeadline`, in exactly the shape 8.3
established for `runReconciliationExpirySweep`: it runs inside the harness `web`
container and moves the **stored** deadline back. What is compressed is the *wait*,
not the behaviour — the column is the one the platform wrote, and every gate the
confirmation then runs is the platform's own, under the platform's own locks. Per
that helper's contract, the caller's docstring names the production timer it stands
in for.

The first draft of this journey instead tried two operator HTTP routes and branched
on whether either worked. That is weak evidence — a test that passes either way
proves nothing — and it was replaced.

## 9. The task's own suites

`backend/tests/unit/test_enrollment_readiness_10_3.py` — **50 passed**, every
DB-backed test under the `production_scope` fixture so what is measured is the real
membership/grant-derived capability model and never a test-settings shortcut:

| Class | Cases | What it settles |
|---|---|---|
| `TestReadinessContract` | 7 | §2 — confirmable, every state has a definition, `not_applicable` ≠ `blocked`, an enrolled application reads `confirmed`, every blocker has an action, nothing is `retryable`, no reviewer identity |
| `TestMissingCondition` | 7 | §4 / §1.1 — the three non-terminal states parameterised, the set derived from the machine, `waiting_on`, accepted/waived, `expired` counted separately, an unconditional offer unaffected |
| `TestDeadline` | 5 | §5 — passed refuses, the countdown is the server's, overdue is negative, no deadline ≠ passed deadline, and an in-lock shortening still refuses |
| `TestSuccessfulConfirmation` | 5 | both offer shapes, the readiness afterwards, idempotence with one history row, the envelope |
| `TestCapacityAndExistingEnrollment` | 6 | §6 — the conditional-offer refusal, "room for me", unlimited, the duplicate 409, the same-name tenant, the legacy row |
| `TestConcurrentConfirmation` | 2 | §5 — six parallel confirmations, and the condition-rejection race. Postgres-only, `@skipif` with a reason (row locks are a Postgres guarantee) |
| `TestReadContract` | 5 | §7 — the detail read, the list row, the query budget, read-only, and absent-not-empty |
| `TestConfirmAuthority` | 3 | §8 — the identical mask, staff refused, no role string compared (AST) |
| `TestOneEvaluator` | 7 | §1.2 / §5 — the evaluator inside the transaction (AST), the lock order, no second submission evaluator, no second condition vocabulary (AST), the precedence, no migration, `SEAT_STATUSES` unchanged |
| `TestCounterIsUntouched` | 1 | §3.1 — a confirmation neither claims nor releases a counted seat |

Frontend: [`enrollmentReadiness.test.tsx`](../../../apps/admissions/tests/unit/enrollmentReadiness.test.tsx)
— **22 passed**: reading the contract (4), the countdown (4), the one message (2),
the status-page section (7), and the dashboard row (4). The two surface groups are
the ones no endpoint test can reach: the control existing for a conditional offer,
and a blocked student getting a reason plus an action rather than a missing button.

### 9.1 One pre-existing test moved onto the new call shape

`test_enrollment.py::TestEnrollmentServiceValidation::test_conditions_not_met_raises_error`
mocked `ApplicationCondition.objects.filter(...).exists()` twice — the pre-10.3
call shape. This task reads the condition **set** once as rows (§1.1), so the mock
now supplies a row instead of two booleans. Its behavioural claim ("a conditional
offer with an unresolved condition raises `CONDITIONS_NOT_MET`") is unchanged, and
the real-row version of it is `TestMissingCondition`.

This is the same class of change [10.2 §11](../10.2/README.md) and
[9.5 §9.2](../9.5/README.md) recorded: a test that fakes the ORM pins a call shape
rather than a behaviour. Nothing else in that file moved — all 10 cases pass.

### 9.2 The property test is a task invariant, not a numbered property

`tasks.meta.json` → `pbtResults` is `{}` for task 10.3, so there is no numbered
property-based-testing sub-task and nothing is recorded through
`update_pbt_status`. The five fast-check invariants in
[`enrollmentReadiness.property.test.ts`](../../../apps/admissions/tests/property/enrollmentReadiness.property.test.ts)
exist because the readiness payload is a product space — four states × the blocker
catalogue × a countdown dense on both sides of zero × a payload that may be absent
or malformed — and the dangerous cases are the corners rather than the examples a
table test happens to pick:

1. only a payload the server actually published is recognised, and it is returned
   **by identity** — so *unknown* stays distinguishable from *blocked*;
2. confirmability is exactly the server's `can_confirm`;
3. the countdown phrase never contradicts the sign of the server's number, at any
   magnitude;
4. there is exactly one message and it is the server's — the first blocker, else
   the state definition;
5. the helpers are pure and mutate nothing.

## 10. Verification (verbatim)

### 10.1 Backend suites, against a measured baseline

```
cd backend && DATABASE_URL=<mihas_localtest 5433> TESTING=1 .venv/bin/python3 -m pytest \
  $(ls tests/unit/*.py tests/property/*.py tests/integration/*.py \
    | grep -iE "enroll|condition|capacit|waitlist|withdraw|applicat|readiness|intake|submission|expiry|serializ") \
  -q --tb=no -rfE -p no:randomly
```

against the isolated `mihas_localtest` Postgres (the `backend-postgres-1`
container on `127.0.0.1:5433`). Neon and production were not touched.

| Run | Files | Result |
|---|---|---|
| **baseline** — the same selection, measured **before** any of this task's code existed | 53 | **19 failed, 462 passed**, 18 skipped, 50 errors |
| **10.3 (candidate)** | 54 | **19 failed, 512 passed**, 18 skipped, 50 errors |

[`candidate.txt`](raw/candidate.txt) / [`baseline.txt`](raw/baseline.txt), with the
sorted failing+erroring sets in
[`candidate-failing-set.txt`](raw/candidate-failing-set.txt) and
[`baseline-failing-set.txt`](raw/baseline-failing-set.txt).

- **New failures: 0.** `comm -23` over the two sorted sets (**69 entries each**) is
  empty. `comm -13` is also empty — nothing was fixed either, which is the honest
  reading: this task claims no repair of another lane's failure.
- **+50 passing**: exactly the task's own suite, which on its own reports
  **50 passed**.
- The baseline is a genuine before-measurement rather than a reconstruction: it was
  captured **first**, before any file was edited, over the same selection pattern.
  The candidate's selection was diffed against the baseline's and is identical
  apart from the task's own new file.

The 19 failures and 50 errors present in **both** runs are the pre-existing
clusters catalogued in [9.1 §8.1–8.3](../9.1/README.md),
[9.2 §11.1–11.2](../9.2/README.md), [9.3 §15.1](../9.3/README.md),
[9.4 §14.1](../9.4/README.md), [10.1 §10.1](../10.1/slice-1-backend.md) and
[10.2 §12.1](../10.2/README.md) — by file:

```
22 ERROR  tests/unit/test_application_endpoints.py            13 FAILED tests/property/test_application_endpoints.py
20 ERROR  tests/unit/test_waitlist.py                          2 FAILED tests/unit/test_applications_serializers.py
 3 ERROR  tests/unit/test_application_review_payment_gate.py   2 FAILED tests/property/test_application_hardening.py
 3 ERROR  tests/unit/test_application_number_generator.py      1 FAILED tests/unit/test_application_student_flow_views.py
 2 ERROR  tests/unit/test_application_review_force_approved.py 1 FAILED tests/property/test_application_properties.py
```

Three are worth naming because they sit closest to this lane and are **not** ours:

- `test_waitlist.py`'s 20 setup errors are the `document_views.AccessScopeService`
  patch drift [task 5.2/5.3](../5.3/README.md) documented — a test that patches a
  symbol another lane's refactor stopped exporting. In both sets, unchanged;
- `test_applications_serializers.py`'s 2 failures are in **both** sets, which
  matters here because this task edits `serializers.py`. They fail identically on
  both sides;
- `test_enrollment.py`, `test_capacity_concurrency_5_3.py`,
  `test_capacity_waitlist_canonical_5_3.py` and
  `test_condition_evidence_amendment_history_10_2.py` — the four suites closest to
  what changed — appear in **neither** set: all pass on both sides.

### 10.2 The authority matrix and the view classification

`tests/unit/test_authority_matrix_v2.py` fails on **one stale entry**,
`/api/v1/applications/<uuid:application_id>/preview-summary/` — a route **task 7.4
deleted** whose registry entry its lane left behind, already recorded by
[9.5 §11.1](../9.5/README.md) and [10.2 §12.2](../10.2/README.md). Unresolved and
weak-bucket are both **0**. This task adds **no** route, so the registry needed no
edit; retiring another lane's stale pin here would hide that it was left.

`test_view_auth_classification.py::test_all_api_views_are_classified` reports
**38** unclassified views — the same number as before this task, and the same list.
They belong to other lanes and deliberately were not registered here.
[`authority-matrix.txt`](raw/authority-matrix.txt).

### 10.3 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 4173 passed / 1 skipped** (477 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **18 errors, 0 warnings** across **15 files** — `diff` against 10.2's file list is **empty**. The one error in a file this task touched (`ApplicationStatus.tsx` line 11, the `@/services/client` import for `AuthenticationError`) is at `HEAD` and was not introduced here | [`frontend-lint.txt`](raw/frontend-lint.txt), [`frontend-lint-files.txt`](raw/frontend-lint-files.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |

The pre-10.3 frontend baseline is [10.2 §12.3](../10.2/README.md): **1 failed /
4146 passed / 1 skipped** across 475 files, 18 lint errors across 15 files. So:
**+27 passing, +2 test files, the same single pre-existing failure, and an
identical lint file set** — and the +27 is exactly this task's 22 unit + 5 property
cases. The pre-existing failure is
[`authPageFormMarkup.test.tsx`](../../../apps/admissions/tests/unit/authPageFormMarkup.test.tsx),
the SignUp helper-copy conflict catalogued from 8.1 onward.

### 10.4 Django system checks

`cd backend && .venv/bin/python3 manage.py check`

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
> 9.4 §14.3, 9.5 §11.3, 10.1 §10.3 and 10.2 §12.4; re-confirmed here).

### 10.5 OpenAPI schema

`cd backend && .venv/bin/python3 manage.py spectacular --file /tmp/schema-103.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — **identical counts** to 8.2 through 10.2.
No operation was added or removed (this task adds no route), and the two new
serializer fields introduce no new warning: `enrollment` is annotated with
`@extend_schema_field(serializers.JSONField(allow_null=True))`, so the generator
does not have to guess at a `SerializerMethodField` and produce a fourth warning.
The three remaining warnings are the pre-existing collisions on
`/api/v1/admin/intakes/`, `/api/v2/admin/change-requests/` and
`/api/v2/admin/onboarding/`.

### 10.6 Browser journeys

`cd apps/admissions && HARNESS_PW_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:8090 bunx playwright test -c playwright.harness.config.ts --project=chromium-required --project=mobile-required tests/harness-e2e/required/enrollment-readiness-confirmation.spec.ts`

```
Running 8 tests using 1 worker
  … 8 passed (29.2s)
```

[`harness-enrollment-journeys.txt`](raw/harness-enrollment-journeys.txt). Run
against the task-0.4 isolated harness brought up **fresh**
(`harness/bin/harness up`, which wipes volumes, rebuilds the backend image and runs
`bun run build` for the SPA), with the strict `harness-fixtures.ts` gates active:
zero skips, no console errors, no unhandled exceptions, no unasserted failed
requests.

`HARNESS_PW_CHANNEL=chrome` is the config's documented escape hatch: Playwright's
bundled Chromium has no build for this machine, so the required projects run
against the system Chrome. It changes the browser binary, not the assertions.

Four harness details worth recording:

- **the harness serves the built SPA** (`apps/admissions/dist`) and runs the backend
  from a **built image**, so a source change needs `bun run build` (and a backend
  change needs `harness up`) before it is under test. Both were done before these
  runs, and §10.3's frontend gates were re-run afterwards;
- **every offer is reached through the platform's own state machine**:
  `draft → submitted → under_review → approved | conditionally_approved`, each step a
  real `POST /applications/{id}/review/`, with the deadline computed by
  `EnrollmentService.compute_deadline` on the transition. Nothing is written into
  `applications` directly — an offer the platform did not make would prove only that
  the column exists;
- **the unconditional approval passes `force: true`.** An `approved` transition is
  payment-gated (`PAYMENT_UNVERIFIED`) and the fee is not this task's subject;
  `force` is the platform's own documented, audited override for exactly that, not a
  bypass of the enrollment gates under test. The conditional offer needs no such
  flag, which is itself worth noticing;
- **the two refusals declare their error paths** with `gate.allowRequest(...)` — the
  declaration **is** R18.4's asserted error path.

### 10.7 The whole required browser profile

`… --project=chromium-required --project=mobile-required` (no spec filter)

```
2 failed
  [chromium-required] › required/tenant-launch.spec.ts:139:5 › … the wizard exposes program / intake / fee / routing steps on mobile
  [mobile-required]   › required/tenant-launch.spec.ts:139:5 › … the wizard exposes program / intake / fee / routing steps on mobile
126 passed (8.5m)
```

[`harness-required-suite.txt`](raw/harness-required-suite.txt). The two failures are
the locator-ambiguity failures [10.1 §6.5](../10.1/slice-2-frontend.md) already
**measured** as pre-existing (`getByText('Fees', …).first()` resolving to the admin
sidebar's hidden "Program Fees" item). 10.2's profile was **118 passed / the same 2
failed**; this one is **126 passed / the same 2 failed** — the +8 being this task's
journeys. 10.2's four condition/amendment journeys were re-run as part of this
profile and all eight (both viewports) pass, which matters because this task edits
`serializers.py` and `ApplicationStatus.tsx`.

The harness was torn down (`harness/bin/harness down`, which wipes volumes) after
the runs above.

### 10.8 Failures introduced by this task

**Zero**, against measured baselines rather than assertion:

| Scope | Evidence |
|---|---|
| Backend enrollment/condition/capacity/application/serializer suites | baseline 19 failed / 462 passed → 19 / **512**; the new-failure diff is empty over 69 entries each side (§10.1) |
| Authority matrix / view classification | the same single stale entry (0 unresolved, 0 weak-bucket) and the same 38 unclassified views as before, none of them this task's (§10.2) |
| Frontend | the same single pre-existing failure; **18** lint errors across an **identical** 15-file set, none introduced (§10.3) |
| Build / check / schema | exit 0, no issues, **3 warnings / 116 errors** unchanged, no operation added or removed (§10.3–10.5) |
| Browser | 8/8 on a freshly wiped harness, both viewports, zero skips; the whole required profile 126 passed with the same 2 pre-existing failures (§10.6–10.7) |

The four failures this lane deliberately did **not** touch, because they belong
elsewhere: the pre-existing `authPageFormMarkup` frontend failure, the 18 lint
errors, the stale `preview-summary` registry entry, and the 38 unclassified views.

## 11. Not claimed here

- **`SEAT_STATUSES` is not widened.** Whether `enrolled` (or
  `conditionally_approved`) occupies a seat is task **5.3's** explicitly deferred
  question, and it is a change every submission capacity decision on the platform
  reads. §3.1 states the reasoning, the consequence, and the condition under which
  the widening becomes right; a test pins the tuple so the next change to it is
  deliberate.
- **The enrollment counter is not adjusted by a confirmation.** An approved
  application claimed its seat at submission; incrementing again would double-count
  it and releasing it would hand a confirmed student's place to the waitlist. Pinned
  by `TestCounterIsUntouched`.
- **`enrollment_confirmation_expiry_task` is unchanged.** The expiry sweep, its
  reminder cohort and its waitlist promotion are the same code, and its
  `["approved", "conditionally_approved"]` cohort already matched
  `ENROLLABLE_STATUSES`. Making the sweep consult the readiness evaluator would be
  a second behaviour change in one task; it is a reasonable follow-up and it is
  named here rather than done quietly.
- **No enrollment notification change.** The confirmation still sends through
  `CommunicationService.send("enrollment_confirmed", …)`. Routing it through task
  10.1's `deliver_message` gate with a published category is the right eventual
  shape — 10.1 §12 asked for exactly that for **new** messages — but this is a
  pre-existing producer, and moving it is a communications-lane change with its own
  category and audience decisions.
- **No `EnrollmentReadiness` on the admin review workspace.** Task 9.4 owns that
  surface and its own readiness panel; adding a second readiness block to it here
  would be editing another lane's contract.
- **No V2 route for the readiness.** It is published **on** the application, on the
  reads a student already makes, rather than as a fifth request — which is R13.13 /
  task 10.6's direction, not a new endpoint's.
- **The duplicate-enrollment rule has no unique index.** The service-level rule is
  race-free (the check runs under the capacity + application locks, and
  `transition_application_status` is the only writer of `enrolled`), and
  `CREATE UNIQUE INDEX` on a partial predicate would depend on production data this
  lane cannot inspect — the same reasoning [10.2 §3.1](../10.2/README.md) recorded
  for the amendment rule, and the same condition applies: if a second writer of
  `enrolled` ever appears, the index is the right addition.
- **No new capability, route, or registry entry.** Confirmation is owner-only
  through the existing object-authorization helper; the catalogue stays at 17
  `platform.*` + 17 `tenant.*`.
- **The `days_remaining` on the readiness is computed at read time**, not stored,
  and is `None` when there is no deadline. It is a convenience for rendering
  alongside `seconds_remaining`, not a second source of truth about the deadline.
