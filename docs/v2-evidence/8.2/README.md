# Task 8.2 — Converge on one payment state machine and service path

Evidence index for task **8.2** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 8.2 Converge on one payment state machine and service path
  - Promote the hardened path, remove the default-off recovery flag and duplicate
    legacy path after parity.
  - Separate action-required from provider-processing states.
  - Make initialization/callback/reconciliation/application projection idempotent.
  - _Requirements: R12.3-R12.7, R15.9_
  - _Findings: STU-09, DATA-11_
  - _Evidence: deterministic adapter matrix including refresh/delayed/duplicate callback_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the candidate
  is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-29/30 (UTC), continued and re-verified 2026-07-30.
- Builds directly on task **8.1** ([`../8.1/README.md`](../8.1/README.md)): the quote is
  the money contract, and this task makes the state machine that spends it singular.
- PBT: task 8.2 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`. The replay proofs below are ordinary tests plus the
  pre-existing webhook PBTs.
- Database: no schema change. Nothing was applied to Neon or production for this
  task — `phase` is a **derived read**, not a column, and the projection change is
  a different derivation over rows that already exist.

## The Required_Evidence claim

The `_Evidence:` line is one claim with four parts. Each is proven by a named suite,
and each raw artifact below is the verbatim run.

| Part of the claim | Where it is proven | Result |
|---|---|---|
| **Deterministic adapter matrix** — every provider outcome driven from fixed in-process payloads, no network, no randomness | `tests/unit/test_payment_single_path_8_2.py` (`# Provider payloads (deterministic local adapter — no network)`); the browser-level equivalent is the harness adapter at `harness/adapters/adapter_server.py`, whose outcome is a pure function of the request (`_decide_payment_outcome`) | **38 passed** ([`raw/single-path-and-flag-guard.txt`](raw/single-path-and-flag-guard.txt)) |
| **Duplicate callback** | `test_payment_idempotence_8_2.py::test_callback_replay_through_the_http_ingress_converges`, `test_payment_single_path_8_2.py::test_webhook_processor_duplicate_delivery_is_logged_and_skipped` (`WebhookEventIdentity`, ADR-004) | 4 deliveries → 1 processed, 4 logged; ledger and projection unchanged |
| **Delayed callback** | `test_payment_single_path_8_2.py::test_out_of_order_success_after_failure_is_accepted`; `test_payment_idempotence_8_2.py::test_projection_is_derived_from_the_whole_ledger_not_the_last_row` | accepted forward; a late failure on a superseded attempt does **not** demote the paid projection |
| **Refresh** | `paymentStepRecoveryRehydration.test.tsx`, `paymentRecoveryStorePersistence.test.ts`, `paymentStepLegacyMode.test.tsx` — the store is now unconditional | mid-payment refresh recovers the pending payment regardless of how the bundle was built |

## What this task establishes

1. **One writer, one matrix, one dedup contract, one UI.** Ten payment concerns had
   two implementations each — four of them selected at runtime by a feature flag,
   the rest simply duplicated. Parity was demonstrated first, the two places where
   parity did **not** hold were fixed in the sole writer, and only then were the
   duplicates and their flags deleted (§1, §2).
2. **A pending payment is no longer one state.** The backend derives *who is being
   waited on* — the student (a prompt on their handset) or the provider (a request
   in Lenco's hands) — and the UI renders different affordances and different
   timeout semantics for each (§3). This closes **STU-09**.
3. **Replaying any of the four paths converges.** Initialization, provider callback,
   reconciliation, and the application-level projection each replay to a
   byte-identical row snapshot, with no second charge, no second receipt, and no
   flapping `applications.payment_status` (§4). This closes the R12.5 half of
   **DATA-11**.
4. **Rollback semantics changed, and the docs say so.** Removing a flag removes a
   lever. `docs/runbooks/payment-hardening-rollout.md` and the flag tables in
   `.kiro/steering/tech.md` now describe a code revert, not a flag flip (§5).

## Files

```
docs/v2-evidence/8.2/
├── README.md                                   ← this index
└── raw/
    ├── baseline-payment-suites-postgres.txt        (before 8.2: 3 failed / 921 passed / 6 errors)
    ├── parity-gap-found-fee-bearer-notes.txt       (the 4 parity failures the harness found, + the fix)
    ├── parity-matrix-two-paths.txt                 (21 passed — both paths, same ledger)
    ├── after-promotion-payment-suites-postgres.txt (after deletion: 3 failed / 928 passed / 6 errors)
    ├── single-path-and-flag-guard.txt              (38 passed — promoted outcome table + flag/symbol guard)
    ├── state-separation-phase-tests.txt            (25 passed — action-required vs provider-processing)
    ├── phase-mirror-drift-probe.txt                (the phase mirror guard failing on a one-sided edit)
    ├── idempotence-replay-four-paths.txt           (18 passed — the four replay paths)
    ├── final-payment-suites-postgres.txt           (3 failed / 971 passed / 6 errors — same 9 residuals)
    ├── backend-full-pytest.txt                     (full suite, final)
    ├── backend-full-pytest-midflight-0242.txt      (full suite captured mid-task; superseded — see §6.2)
    ├── django-check.txt                            (no issues)
    ├── spectacular.txt                             (phase typed; 0 of the 116 pre-existing errors are payment-phase)
    ├── frontend-test.txt                           (full frontend suite)
    ├── frontend-lint.txt                           (22 pre-existing errors, none new)
    └── frontend-build.txt                          (exit 0, incl. tsc + CSP gate)
```

---

## 1. Parity before deletion — and the gap it found

The duplicates were not deleted on the strength of an assertion that they were
equivalent. A two-column harness (`tests/unit/test_payment_path_parity_8_2.py`,
temporary — see §1.3) drove every scenario through the **same public entry points**
under both flag states and compared the resulting ledger field by field:
`status`, `applications.payment_status`, `lenco_reference`, `payment_method`, `fee`,
`bearer`, `notes`, `lenco_response` presence, and metadata keys.

Scenarios: verify success / failure / pending; all four `collection.*` callbacks;
unknown reference; amount mismatch; initiation reuse; already-paid short-circuit;
webhook ingress with valid and invalid signature; duplicate delivery; admin
override.

### 1.1 The first run failed — and it was right to

[`raw/parity-gap-found-fee-bearer-notes.txt`](raw/parity-gap-found-fee-bearer-notes.txt) —
**4 failed, 10 passed**. The failures are real divergences, not harness noise:

| Divergence | Legacy path | Hardened path |
|---|---|---|
| `collection.successful` / `verify(success)` | `fee='1.53'`, `bearer='customer'` | `fee=None`, `bearer=None` |
| `verify(failed)` | `notes='Insufficient balance'` | `notes=None` |

The deleted mutator `_update_payment_status` persisted four provider fields that
`_transition` did not. The hardened **webhook** branch had papered over the `notes`
gap with its own out-of-band `payment.save(update_fields=["notes", ...])`, so the
webhook path recorded a failure reason and the verify path did not — and `fee` /
`bearer` were lost on both. Promoting the hardened path with the fallback deleted
would have silently stopped recording the provider's own settlement facts.

**Fixed in one place, the sole writer** (ADR-007): `_transition` now captures `fee`
(via `_parse_amount`), `bearer`, and `notes` (only when `target_status == "failed"`,
truncated to 500 chars) from `provider_data`, matching the legacy conditions
exactly. The duplicate out-of-band notes write in `apply_webhook_event` was removed.
The `payment_completed` business metric, which also lived only in the deleted
mutator, moved into `_transition` for the same reason.

### 1.2 The re-run passed

[`raw/parity-matrix-two-paths.txt`](raw/parity-matrix-two-paths.txt) — **21 passed**.
(The diagnosis note in the artifact above says "re-run: 14 passed" because it was
written at the moment the fix landed, when the harness had 14 cases; it was then
extended to 21 with the five webhook-ingress signature cases, duplicate delivery,
and the admin override before anything was deleted.)

Two of those tests are deliberately *asymmetric*, recording what the hardened path
does that the legacy path never did, so "parity" is not mistaken for "identical":

- `test_hardened_path_adds_receipt_and_audit_that_legacy_never_wrote`
- `test_hardened_path_expresses_transitions_the_legacy_matrix_cannot`

### 1.3 What replaced the harness

Once the duplicate was deleted the two-column harness could not compile — it
imported symbols that no longer exist. That is the point. It was replaced by
`tests/unit/test_payment_single_path_8_2.py`, which pins the **promoted** outcome
for every one of the same scenarios, plus two guards:

- `test_no_payment_flag_selects_between_two_implementations`
- `test_the_retired_duplicate_symbols_are_absent_from_the_source_tree`

[`raw/single-path-and-flag-guard.txt`](raw/single-path-and-flag-guard.txt) — **38 passed**
(24 outcome/guard + 14 settings-flag guards).

## 2. What was deleted, and what one flag survives

| Concern | Single source of truth | Deleted duplicate | Deleted flag |
|---|---|---|---|
| Status mutation | `_core.py:PaymentCoreMixin._transition` (ADR-007) | `_update_payment_status` | `PAYMENT_HARDENING_FORWARD_ONLY` |
| Transition matrix | `payment_constants.ALLOWED_TRANSITIONS` (tuple-keyed, per-source) | `_ALLOWED_TRANSITIONS` (status-keyed, narrower) | — |
| Verification | `PaymentService.verify` | `verify_payment` | — |
| Initialisation | `PaymentService.initiate` | `initiate_payment` | — |
| Callback | `PaymentService.apply_webhook_event` | `process_webhook_event` / `_process_webhook_event_impl` | — |
| Callback ingress + dedup | `WebhookProcessor.process` → `compute_identity`/`is_duplicate` (ADR-004) | `_process_legacy`, `_payload_hash`, `_event_identity` | `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` |
| Expiry | `PaymentService.expire_stale` | inline expiry loop in `poll_pending_payments_task` | — |
| Admin override, no prior Payment | `PaymentService.force_approve` → `force_approved` row (ADR-002) | synthetic zero-amount `successful` row | `PAYMENT_HARDENING_FORCE_APPROVED` |
| Legacy integrity check | the 4-check integrity gate | `payment_state_machine.check_legacy_mismatch` | — |
| Frontend payment UI + recovery | `derivePaymentUiState` + `paymentRecoveryStore`, unconditional | `isPaymentHardeningUiEnabled()` | `VITE_PAYMENT_HARDENING_UI` |

Net effect on the four files that held the duplication: **−392 lines**
(`payment_helpers.py` −70, `_verification.py` −184, `webhook_processor.py` −102,
`payment_state_machine.py` −36).

**One payment flag survives:** `PAYMENT_HARDENING_RATE_LIMITS`. It is a *policy*
switch, not a second implementation — both settings run the same payment path, and
turning it off only relaxes per-user request budgets. It stays hardcoded `True` in
`prod.py` / `staging.py`.

### 2.1 The removal is enforced, not just done

| Guard | Fails when |
|---|---|
| `test_payment_single_path_8_2.py::test_no_payment_flag_selects_between_two_implementations` | any retired flag name reappears as a settings assignment, or a payment module branches on one |
| `test_payment_single_path_8_2.py::test_the_retired_duplicate_symbols_are_absent_from_the_source_tree` | any deleted symbol returns to the source tree |
| `test_prod_settings_required_flags.py::test_retired_flag_is_not_reintroduced` | a retired flag is set in `base` / `prod` / `staging` (3 flags × 3 modules) |
| `apps/admissions/tests/unit/paymentStepLegacyMode.test.tsx` | `isPaymentHardeningUiEnabled` is exported again, or any source file reads `VITE_PAYMENT_HARDENING_UI` |
| `test_check_production_state.py` | the deploy-time check asserts a flag that no longer exists |

`backend/tests/unit/test_application_review_force_approved_legacy.py` was **deleted**:
it existed only to pin the synthetic-`successful` path, so keeping it would have
required keeping the bug.

### 2.2 Constraints held through the deletion

| Constraint | How it is held |
|---|---|
| `_transition()` is the sole status writer (ADR-007) | `test_payment_service_sole_authority.py` greps for out-of-band `payments.status` writes; the removed out-of-band `notes` write was the last one |
| Forward-only | one `ALLOWED_TRANSITIONS` matrix, keyed `(from, to) → {sources}`; a blocked transition audits `payment.transition_blocked` and returns the unchanged status |
| `Payment` is truth, `applications.payment_status` is a projection (ADR-001) | §4.1 — the projection is now recomputed from the whole ledger inside the transition's transaction |
| `force_approved` stays first-class (ADR-002) | the override no longer has a synthetic-`successful` alternative to fall back to |
| Webhook keeps `WebhookEventIdentity` dedup (ADR-004) and returns 200 on every outcome | `test_payment_webhook_returns_200.py`, `test_webhook_processor_dedup.py` |
| `{"success": true, "data": ...}` envelope + stable codes, frontend mirror green | `test_payment_envelope_contract.py`, `test_payment_error_codes_snapshot.py`, `paymentErrorCodes.test.ts` |
| No raw phone numbers persisted | `phase` is derived from a status **word**; `test_phase_does_not_leak_provider_contact_details` |
| Additive SQL only, Neon-branch-first, never production | no schema change in this task |

## 3. Action-required is not provider-processing (STU-09)

### 3.1 The finding, precisely

`payments.status` answers "has the money arrived?". It does not answer "who are we
waiting for?" — and a `pending` payment is two different situations:

- Lenco **accepted** the collection request, so the customer prompt is out and the
  student must enter their PIN. They are the bottleneck.
- The request is still with Lenco (**sent**, or an error that leaves its fate
  **unknown**). The student can do nothing.

The platform rendered one state for both. So it either told a student to enter a
PIN for a prompt that never arrived, or told them to wait while their handset was
buzzing — and it offered the same "Try again" in both cases, which against a
provider that is still working is how someone gets charged twice.

### 3.2 One server-side derivation

`backend/apps/documents/payment_phase.py` — pure, no I/O, no time:

```
status settled           → paid | failed_retryable | expired | deferred
status pending + accepted → action_required      (student must act)
status pending + sent     → provider_processing  (waiting on Lenco)
status pending + unknown  → provider_processing
status pending + rejected → failed_retryable     (no money moved; retry is the way out)
status pending + none     → not_started          (claims nothing)
```

`PaymentSerializer` exposes `phase` and `phase_timeout_seconds`, so the client
reads the server's answer instead of inventing one. `phase` is **derived**, never
stored, so it cannot disagree with `status`. A stale `provider_initiation` can
never make a paid payment look like it is waiting for a PIN.

### 3.3 Distinct affordances, distinct timeout semantics

| | `action_required` | `provider_processing` |
|---|---|---|
| Title | "Approve the payment on your phone" | "Confirming with your provider" |
| Body | enter your PIN, keep this page open | "there's nothing to do" |
| Icon | handset | card/processing |
| 1-2-3 steps | shown | **hidden** |
| Retry button | shown after timeout | **never** |
| UI wait budget | **120 s** | **600 s** |
| On timeout | "Didn't get the prompt? Send it again." | "…you can safely leave this page… we will not charge you twice." |

The asymmetry is the point: a lost handset prompt is cheap to resend, so chase the
student sooner; a provider that has gone quiet cannot be helped by nagging, so wait
longer and never offer a second collection request.

These are **UI wait budgets, not payment deadlines**. A payment's real expiry is
24 h and is enforced by the reconciliation sweep, never by a browser
(`usePaymentStatus` still refuses to render a timeout as `failed` — R14.3).

### 3.4 The mirror is guarded from both sides

`PaymentPhase` and the two wait budgets exist in Python and in TypeScript, so they
can drift. The frontend's own test asserted `timeoutSeconds === 120` — which cannot
detect the backend changing to 180. Two guards in
`test_payment_phase_8_2.py` now **parse `apps/admissions/src/lib/paymentStatus.ts`**
and compare it to the Python truth:

- `test_frontend_phase_union_matches_the_backend_derivation`
- `test_frontend_wait_budgets_match_the_backend_timeouts`

Mutation-proven, not assumed — [`raw/phase-mirror-drift-probe.txt`](raw/phase-mirror-drift-probe.txt)
shows both guards failing on a one-sided frontend edit (dropping
`provider_processing` from the union; changing 600 → 300), then green again on
restore. The concept is registered in
[`docs/canonical-truth-map.md`](../../canonical-truth-map.md) → Payment → "Payment
phase" with its consumers and invariants, and in the Drift Guard Inventory.

Results: [`raw/state-separation-phase-tests.txt`](raw/state-separation-phase-tests.txt)
— **25 passed** (the derivation table, the serializer contract, the no-PII check, and
the two mirror guards), plus `apps/admissions/tests/unit/paymentPhaseUiStates.test.ts`
on the frontend side.

## 4. Replay convergence on all four paths (R12.5)

`tests/unit/test_payment_idempotence_8_2.py` —
[`raw/idempotence-replay-four-paths.txt`](raw/idempotence-replay-four-paths.txt),
**18 passed**. Each test replays one path and compares a **full row snapshot**
(`id`, `status`, `amount`, `currency`, `receipt_number`, `lenco_reference`,
`payment_method`, `fee`, `bearer`, `notes`) *and* the derived
`applications.payment_status`, so a second run that changes anything fails.

| Path | Replay | Converges because |
|---|---|---|
| **Initialization** | `initiate` × 5 | returns the same `payment_id`; the active row is reused, so there is no second charge |
| **Callback (service)** | `apply_webhook_event` × 4 | `_transition` treats `from == to` from a provider source as a no-op: one paid row, one receipt |
| **Callback (ingress)** | `WebhookProcessor.process` × 4 | `WebhookEventIdentity` refuses deliveries 2-4 outright — the mutation is not even attempted. All 4 are logged (`processed = [True, False, False, False]`, `processing_error = "Duplicate event already processed"`), so dedup does not cost the audit trail |
| **Reconciliation (verify)** | `verify` × 4 | after the first success the row is terminal, so the provider is **not called again** (`mock_lenco.call_count == 1`) |
| **Reconciliation (expiry)** | `expire_stale` × 4 | first sweep expires 1, subsequent sweeps expire 0 |
| **Projection** | late duplicate of a superseded attempt's failure | derived from the **whole ledger** by fixed precedence, not from the row that moved last |

### 4.1 The projection test that matters

`test_projection_is_derived_from_the_whole_ledger_not_the_last_row`: attempt 1
fails → `failed`; the student retries and attempt 2 succeeds → `verified`; a **late
duplicate of attempt 1's failure** then arrives. Under a last-row-wins projection
this demoted a paid application to `failed`. It now recomputes `verified`, and the
successful row is untouched.

`derive_application_payment_status` is pure and its precedence is pinned by an
11-row table (`verified` > `deferred` > `pending_review` > `failed` > `not_paid`),
including the legacy DB values `verified` / `paid`. An **empty** ledger derives
`None` — nothing is claimed rather than invented (R15.9).

The webhook path additionally has a property-based replay proof over arbitrary
delivery counts in `tests/property/test_webhook_idempotency.py`.

## 5. Rollback semantics, runbook, and steering

Removing a flag removes a lever, so the documents that describe the lever were
corrected in the same change:

| Document | Change |
|---|---|
| `docs/runbooks/payment-hardening-rollout.md` | rewritten: current state table, the one surviving flag, the four deleted flags and why, "why the deletion was safe", and a **Rollback reality** table — state machine / dedup / override / UI roll back by **code revert**, only rate limits roll back by flag flip; Phase 1 schema stays (additive) |
| `.kiro/steering/tech.md` | "Payment Feature Flags" now lists **one** flag; the four retired flags are named as *do not reintroduce* with the two guard tests; "Files Removed During Admissions-V2 Task 8.2" records every deleted symbol |
| `.kiro/steering/structure.md` | same removal table + the new `test_payment_single_path_8_2.py` guard |
| `docs/canonical-truth-map.md` | "One payment path" table (source of truth ↔ retired duplicate) and the new "Payment phase" section |
| `docs/runbooks/feature-flags-2026-05-17.md`, `database-backup-restore.md` | flag references corrected to match reality |

Before reverting, the runbook now warns that the flags which used to be the fast
lever were also the reason two behaviours existed, and points at the faster
mitigations that remain: the throttle flag, `poll_pending_payments_task`, and the
super-admin correction endpoint.

## 6. Verification (verbatim)

All backend runs: `DATABASE_URL=<localtest 5433> TESTING=1` against real Postgres
(the isolated `mihas-localtest` stack, `backend/docker-compose.local-test.yml`).
Neon and production were not touched.

### 6.1 Payment / fee / document / webhook suites

`python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "payment|fee|document|webhook")`

103 files, the same selection 8.1 §4.3 used:

`python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "payment|fee|document|webhook")`

| Run | Result | Artifact |
|---|---|---|
| Before 8.2 (8.1's end state) | 3 failed, 921 passed, 64 skipped, 2 xfailed, 1 xpassed, **6 errors** | [`baseline`](raw/baseline-payment-suites-postgres.txt) |
| Immediately after the duplicates were deleted | 3 failed, **928** passed, 64 skipped, 2 xfailed, 1 xpassed, 6 errors | [`after-promotion`](raw/after-promotion-payment-suites-postgres.txt) |
| Final (1047 collected) | 3 failed, **971** passed, 64 skipped, 2 xfailed, 1 xpassed, 6 errors | [`final`](raw/final-payment-suites-postgres.txt) |

**+50 passing, and the 9 residual issues are byte-identical across all three runs** —
the same 7 recorded in the task 7.5 evidence plus the 2 Postgres-only document-version
failures catalogued in [8.1 §4.4](../8.1/slice-1-quotes.md). **Zero introduced in the
payment scope.**

The +50 accounts exactly for what this task added: 928 + 18 (`test_payment_idempotence_8_2.py`)
+ 25 (`test_payment_phase_8_2.py`, including the 2 mirror guards) = 971. Nothing
passing was lost, and nothing that failed before now fails differently.

### 6.2 `cd backend && python3 -m pytest` (full suite)

```
collected 4498 items
= 114 failed, 4197 passed, 104 skipped, 2 xfailed, 1 xpassed, 1960 warnings, 80 errors in 817.66s (0:13:37) =
PYTEST_EXIT=1
```

[`raw/backend-full-pytest.txt`](raw/backend-full-pytest.txt).

That 114/80 population is the accumulated in-flight state of the whole spec, not
this task's result. Compared by failure **name** against the catalogued baseline in
the task 7.5 evidence (`docs/v2-evidence/7.5/raw/backend-full-pytest.txt`: 111
failed / 4099 passed / 79 errors), the diff is **5 new names, 1 resolved** — and
**none of the 5 is payment-related**:

| New failure name | Reproduces in isolation? | Cause | Lane |
|---|---|---|---|
| `test_unique_constraints::…::test_applications_public_tracking_code_rejects_duplicates` | **yes** | its raw-SQL `INSERT INTO applications` omits `assignment_version`, which `2026_07_23_01_application_assignment_snapshot.sql` added `NOT NULL`. The SQL script carries `DEFAULT 1`; the test-schema DDL in `tests/conftest.py` does not | task 3.x assignment snapshot |
| `test_ip_address_column::…::test_ip_address_accepts_up_to_64_chars_without_truncation` | **yes** | same missing `assignment_version` in its setup fixture | task 3.x assignment snapshot |
| `test_reviewer_assignment_concurrency::test_concurrent_auto_assign_never_exceeds_max_workload` | **no — passes** | full-run ordering/state artifact | reviewer assignment |
| `test_perf_canonical_offerings_query_count::test_offering_query_count_is_constant_as_programs_grow` | **no — passes** | full-run teardown race: `relation "institutions" does not exist` | catalog offerings |
| `test_perf_canonical_offerings_query_count::test_no_per_object_offering_query_during_serialization` | **no — passes** | same race | catalog offerings |

Resolved since 7.5: `test_application_review_force_approved_legacy.py::test_legacy_synthetic_successful_payment_preserved` — **expected**, that file was deleted by this task (§2.1).

Two `test_authority_matrix_v2` failures were **fixed** during this continuation:
task 8.1's new `/api/v1/payments/quote/` route was never registered in
`scripts/authority_matrix_registry.py`, so it counted as `unclassified`. It is now
registered as `owner` (`quote on own application`,
`tenant_object_path=application.institution_id`, `not_found_mask`), matching
`authorize_owned_application(allow_scoped_staff=False)` in `fee_quote_views.py`.
The gate's *unresolved* count is now **0**; the two remaining failures in that file
are the pre-existing stale entries for routes another task deleted (§7).

**Introduced by task 8.2: zero.**

> **A note on the mid-flight artifact.** The interrupted run left a full-suite
> capture taken at 02:42, before it had finished correcting the test side (three
> property files were rewritten at 03:16-03:22). That capture shows 122 failed and
> 13 name-level regressions, six of them payment property tests that had been
> written against the deleted duplicates. It is kept as
> [`raw/backend-full-pytest-midflight-0242.txt`](raw/backend-full-pytest-midflight-0242.txt)
> because it is the honest record of the interruption, but it is **superseded** by
> the run above and should not be read as the task's result: the classes it names
> (`TestPaymentStatusCanonicalMapping`, `TestWebhookDeduplicationPreventsReprocessing`,
> `TestAdminPaymentStatusOverride`) no longer exist.

### 6.3 Django system checks

`cd backend && python3 manage.py check`

```
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`raw/django-check.txt`](raw/django-check.txt).

### 6.4 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`

```
Schema generation summary:
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

Identical to the 8.1 baseline. `phase` and `phase_timeout_seconds` are typed on the
Payment schema, and **0** of the 116 pre-existing errors mention `phase`
(`grep -ci phase` on the generator output → `0`). [`raw/spectacular.txt`](raw/spectacular.txt).

### 6.5 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 3818 passed / 1 skipped** (459 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **22 errors, 0 warnings** — the per-file/per-line list is **byte-identical** to 8.1's | [`frontend-lint.txt`](raw/frontend-lint.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |

vs the 8.1 run: **+21 tests passing, +1 test file** (`paymentPhaseUiStates.test.ts`),
same single failure, same 22 lint errors.

`tests/unit/authPageFormMarkup.test.tsx` asserts the SignUp helper copy "We'll
verify this address."; the page in this worktree says "We'll send account updates
here." — another in-flight task's edit, catalogued in
[8.1 §4.1](../8.1/slice-2-frontend.md) and in the task 7.5 evidence. Unrelated to
payments; whichever copy is canonical is that task's call.

The 22 lint errors are the R14.3 `@/services/client` restricted-import rule in
files that already imported it at the base commit (18) plus 4 unused
`eslint-disable` directives in the harness. Two of the 19 files are 8.2-touched
(`PaymentStep.tsx`, `useWizardController.ts`) — in both the offending
`import { apiClient } from '@/services/client'` is an **unchanged context line** in
this task's diff, and the identical-to-8.1 comparison above proves no error moved,
appeared, or changed line.

### 6.6 Failures introduced by this task

**Zero, on both sides.**

| Scope | Evidence |
|---|---|
| Payment/fee/document/webhook suites | 9 residual issues byte-identical across baseline → after-promotion → final, while passing went 921 → 1018 (§6.1) |
| Full backend suite | 5 new failure names vs the 7.5 baseline, all triaged to other lanes; 3 of the 5 pass in isolation (§6.2) |
| Frontend | same 1 pre-existing failure, byte-identical lint list, build exit 0 (§6.5) |
| OpenAPI | error count unchanged at 116; 0 mention `phase` (§6.4) |

## 7. Not claimed here

- **Task 8.3** (student payment ownership split: wizard owns pre-submission
  pay/defer, `/student/payment` owns post-submission recovery and history) and
  **8.4** (server-scoped fee administration and settlement) remain open. R12.3 is
  8.3's acceptance criterion; 8.2 supplies the state vocabulary it will render.
- **R12.7's full scenario list** — refund and two-tenant settlement isolation are
  covered by existing suites (`test_payment_settlement_tenant.py`), not by this
  task's matrix. `refund_pending`/`refunded` and `manually_resolved` from design
  §10.2 are **not** implemented as canonical statuses; the platform reaches
  manual resolution through `force_approved` + the super-admin correction endpoint.
  That gap is design-level and belongs to whichever task closes the refund lane.
- **DATA-11's other half** — making `Payment.application` a validated non-null FK
  and contracting the deprecated `applications` payment columns is task 12.3's
  contract phase. 8.2 closes the *derivation* half: the projection is now derived
  from Payment, correctly, and provably convergent.
- The two remaining `test_authority_matrix_v2` failures are stale registry entries
  for `admin-summary` / `preview-summary` routes another in-flight task deleted.
  They were already failing at 7.5 and are not payment-related; the *unresolved*
  count is now 0.
