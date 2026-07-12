# Payment Hardening — Exploration Baseline

**Spec**: `.kiro/specs/payment-hardening/`
**Checkpoint task**: Task 2 — Exploration baseline
**Captured**: at Task 2 checkpoint time (before Phase 1 work begins)

## Status

All of Task 1's sub-tasks (1.1–1.26) in `tasks.md` are marked **optional** (`[ ]*`).
The orchestrator's execution profile for this spec is configured to skip optional
sub-tasks, so none of the 23 exploration property-based tests (1.3–1.25) were
written or executed. No new files were created under `backend/tests/property/` or
`apps/admissions/tests/property/` for the exploration pass. No production code
was modified by Task 1.

This file is the explicit record of that decision so downstream phase tasks and
auditors can see which properties are covered only by later enforcement PBTs and
not by an exploration baseline.

## Why the gap does not block downstream phases

Every one of the 23 correctness properties (P1–P23) has a dedicated **enforcement**
property-based test elsewhere in `tasks.md`. The enforcement PBTs are **not**
optional — they are the quality gate each phase must satisfy before moving on:

| Phase | Task | Enforcement PBT coverage |
|-------|------|--------------------------|
| Phase 2 | Task 16.1–16.12 | P1, P2, P5, P10, P11, P12, P13, P14, P15, P16, P19, P23 |
| Phase 2 | Task 12.3        | P17 (promoted from exploration to enforcement inside `PaymentAuditService`) |
| Phase 3 | Task 24.1–24.10 | P3, P4, P6, P7, P8, P9, P17, P20, P21, P22 |
| Phase 4 | Task 35.1        | P18 (frontend UI state matrix determinism) |

P17 appears in both Phase 2 (Task 12.3) and Phase 3 (Task 24.10) because the
redaction invariant is defensible independently at the audit-service boundary and
at the receipt-path boundary.

Because every property is asserted by at least one enforcement PBT, the absence of
an exploration-phase reproducer does not put any requirement at risk. The
enforcement PBTs are written immediately after the code they validate, so the
first time each property gets exercised is when the phase that introduces its
supporting behaviour runs its verification block.

## Per-property register

Each row records the property's current state, the requirement(s) it maps to, and
the phase task that will produce the enforcement PBT that makes it pass.

| # | Property | Status | Requirements | Enforced by (phase task) |
|---|----------|--------|--------------|--------------------------|
| P1  | Race-Safe Concurrent Initiation                                | not_explored | R3.1, R3.2, R3.3, R20.1              | Phase 2 — Task 16.1 |
| P2  | Terminal Stability                                             | not_explored | R1.3, R1.4, R2.1, R9.1, R10.1, R20.2 | Phase 2 — Task 16.2 |
| P3  | Out-Of-Order Webhook Safety                                    | not_explored | R9.1, R20.3                          | Phase 3 — Task 24.1 |
| P4  | Webhook Idempotence                                            | not_explored | R8.5, R8.6, R9.3, R20.4              | Phase 3 — Task 24.2 |
| P5  | Amount, Currency, and Provider Reference Integrity             | not_explored | R7.1, R7.2, R7.3, R7.5, R7.6, R10.5, R20.5 | Phase 2 — Task 16.3 |
| P6  | Receipt Idempotence                                            | not_explored | R13.1, R13.2, R20.6                  | Phase 3 — Task 24.6 |
| P7  | Single-Active Database Invariant                               | not_explored | R3.3, R12.1, R20.7                   | Phase 3 — Task 24.7 |
| P8  | Transaction Reference Uniqueness                               | not_explored | R3.4, R12.2, R20.8                   | Phase 3 — Task 24.8 |
| P9  | Receipt Number Uniqueness                                      | not_explored | R13.3, R12.3, R20.9                  | Phase 3 — Task 24.9 |
| P10 | Fee Resolver Determinism                                       | not_explored | R6.1, R20.10                         | Phase 2 — Task 16.8 |
| P11 | Tamper-Resistance                                              | not_explored | R4.6, R6.1, R20.11                   | Phase 2 — Task 16.9 |
| P12 | Provider Uncertainty Keeps Pending                             | not_explored | R11.1, R11.2, R11.4, R20.12          | Phase 2 — Task 16.10 |
| P13 | Application Summary Consistency                                | not_explored | R1.1, R1.6                           | Phase 2 — Task 16.4 |
| P14 | Forward-Only Transition Closure                                | not_explored | R1.2, R1.7                           | Phase 2 — Task 16.5 |
| P15 | Payment-Sensitive Fields Locked                                | not_explored | R5.1, R5.2                           | Phase 2 — Task 16.12 |
| P16 | Phone Normalization Idempotence And Operator Derivation        | not_explored | R11.5, R14.5                         | Phase 2 — Task 16.11 |
| P17 | PII Redaction                                                  | not_explored | R17.4, R22.4                         | Phase 2 — Task 12.3 (audit side) + Phase 3 — Task 24.10 (receipt side) |
| P18 | UI State Matrix Determinism                                    | not_explored | R14.1, R14.3, R14.6, R14.7           | Phase 4 — Task 35.1 |
| P19 | Retry Limit Threshold                                          | not_explored | R3.5, R3.6                           | Phase 2 — Task 16.6 |
| P20 | Canonical JSON Round-Trip                                      | not_explored | R8.1, R21.1, R21.2, R20.4            | Phase 3 — Task 24.3 |
| P21 | Webhook Identity Round-Trip                                    | not_explored | R21.3, R21.4                         | Phase 3 — Task 24.4 |
| P22 | Provider Event Id Preferred In Identity                        | not_explored | R8.3, R8.4                           | Phase 3 — Task 24.5 |
| P23 | Snapshot Immutability                                          | not_explored | R6.2, R6.3                           | Phase 2 — Task 16.7 |

**Counts**: 23 properties total. 12 enforced in Phase 2, 10 enforced in Phase 3
(with P17 double-covered from Phase 2), 1 enforced in Phase 4. 0 properties left
without enforcement coverage.

## Baseline test run (sanity snapshot)

This is a best-effort snapshot of the current tree so Phase 1 changes can be
diffed against it. Pre-existing failures are listed but not fixed — the goal is a
baseline, not a cleanup.

### Frontend — existing payment-related tests

Command: `cd apps/admissions && bun run test -- --run tests/unit/usePaymentStatus.test.ts tests/unit/paymentStep.test.ts tests/property/paymentPageExtraction.property.test.ts tests/property/paymentStatusFiltering.property.test.ts`

Result: 3 files pass, 1 file fails. 11 of 12 tests pass.

| File | Status |
|------|--------|
| `tests/property/paymentPageExtraction.property.test.ts` | 4 pass |
| `tests/property/paymentStatusFiltering.property.test.ts` | 5 pass |
| `tests/unit/paymentStep.test.ts` | 2 pass |
| `tests/unit/usePaymentStatus.test.ts` | **1 fail** |

Pre-existing failure (not caused by this spec, not in scope for this checkpoint):

- `tests/unit/usePaymentStatus.test.ts > usePaymentStatus > verifies the latest pending payment and promotes it to successful`
  - `AssertionError: expected 2nd "vi.fn()" call to have been called with [ '/payments/payment-1/verify/', … ], but called only 1 times`
  - Root cause to be investigated when Phase 4 touches `usePaymentStatus` (Task 37). Until then, this failure is the accepted baseline.

### Backend — existing payment-related tests

Command (as specified in the checkpoint brief): `cd backend && python3 -m pytest backend/tests/ -k payment`

Result: **could not execute in this environment**. The system Python (`/usr/bin/python3`, 3.14.4) does not have Django installed and there is no active virtualenv reachable from the task runner (`ModuleNotFoundError: No module named 'django'`). `backend/tests/conftest.py` imports Django at collection time, so pytest cannot even enumerate tests.

The existing backend payment test modules that will be the authoritative pre-Phase-1 baseline once the environment is set up:

- `backend/tests/unit/test_application_review_payment_gate.py`
- `backend/tests/unit/test_document_payment_envelopes.py`
- `backend/tests/unit/test_draft_delete_payment_protection.py`
- `backend/tests/unit/test_payment_expiry.py`
- `backend/tests/unit/test_payment_rate_limiting.py`
- `backend/tests/unit/test_payment_resilience.py`
- `backend/tests/unit/test_payment_throttling.py`
- `backend/tests/unit/test_payments_serializers.py`
- `backend/tests/unit/test_amount_mismatch.py`
- `backend/tests/unit/test_admin_override.py`

Action item for the operator running Phase 1: after activating the backend virtualenv (or `pip install -r backend/requirements.txt`), rerun `python3 -m pytest backend/tests/ -k payment` and paste the summary below. Any test failing at that baseline that is **not** in the list above is a real regression introduced between the last green run and now and must be triaged before Phase 1 is enabled.

```text
(baseline pytest summary goes here once the environment is provisioned)
```

## Triage notes for Phase 1–5 implementers

- **No exploration counter-examples exist** for any property, so phase tasks must not assume a pre-recorded reproducer. Each enforcement PBT must stand on its own and carry its own generator and invariant.
- **Five properties were explicitly flagged in `tasks.md`** (P9, P14, P18, P20, P21) as "expected to fail pre-Phase-X". Those flags still hold: the enforcement PBT for each will start red and turn green once the corresponding phase ships. This is the intended TDD flow for those properties and is not a regression.
- **Frontend `usePaymentStatus` unit failure** is the only currently-visible pre-existing red. It is unrelated to the hardening spec and should be picked up when Task 37 rewires `usePaymentStatus` for the `still_confirming` state.
- **Backend baseline is un-runnable in this environment.** Phase 1 must re-establish a runnable baseline before applying any schema change.

## Checkpoint decision

Task 2 is satisfied by this document. The exploration pass was explicitly skipped
by design (all sub-tasks optional). Every property has a downstream enforcement
PBT that blocks its phase from completing, so there is no coverage gap that
downstream phases need to absorb.
