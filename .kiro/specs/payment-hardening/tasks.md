# Implementation Plan: Payment Hardening

## Overview

This plan hardens the MIHAS Lenco payment flow into a ledger-first, race-safe, forward-only state machine without breaking existing routes, filenames, envelope shape, widget integration, or mobile-money-first UX. It follows the five-phase additive rollout from the design: schema + snapshot backfill (Phase 1), `PaymentService._transition()` forward-only guard (Phase 2), webhook dedup strict + stable error codes (Phase 3), frontend recovery store + UI state matrix (Phase 4), and rate limiting + force-approved + dev-bypass lockout + risk-flag inspection (Phase 5).

Task 1 is an exploration pass: one property-based test per correctness property (P1–P23) against the current code, so the implementation direction is driven by observed failures. Core state-machine work in Phase 2 is test-first (TDD): the transition matrix tests and sole-authority grep test are written **before** the new `_transition()` entry point. Subsequent phases place tests immediately after the code they validate.

Every sub-task references requirements via `_Requirements: R#.#_`; every property-based test references the property number and the file path from the design's "Correctness Property Testing Harness" section, with a success criterion pinned to `hypothesis --hypothesis-seed=0` running ≥100 examples (backend) or `fc.assert(prop, { numRuns: 100 })` (frontend) without shrink-failure.

Sub-tasks marked with `*` are optional — they either cover operational rollout steps (staging soak, prod enable, rollback drills), or test coverage that can be skipped for a faster MVP without breaking the core guarantee. Core implementation and mandatory property tests for shipped behavior are never optional.

## Tasks

- [ ] 1. Exploration property tests — confirm current payment code state against all 23 correctness properties
  - Stand up the four backend and three frontend property test files referenced in the design's "Correctness Property Testing Harness" so every property either (a) passes against the current implementation or (b) fails with a minimised counter-example that will guide the Phase 2–5 implementation. No production code changes in this task.
  - _Requirements: R20.1, R20.2, R20.3, R20.4, R20.5, R20.6, R20.7, R20.8, R20.9, R20.10, R20.11, R20.12, R21.2, R21.4_

  - [ ]* 1.1 Scaffold the backend property test files with shared fixtures
    - Create `backend/tests/property/test_payment_state_machine_properties.py`, `test_payment_webhook_properties.py`, `test_payment_fee_resolver_properties.py`, and `test_payment_receipt_properties.py`.
    - Each file imports `hypothesis.strategies as st`, `from hypothesis import given, settings, HealthCheck`, wires `@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])`, and tags tests with the comment `# Feature: payment-hardening, Property N: <text>`.
    - Add a shared `conftest.py`-level fixture `payment_factory` that builds a Payment + Application + ProgramFee triple against the test DB.
    - Success criterion: `cd backend && python3 -m pytest backend/tests/property/ -k payment --collect-only` lists at least 23 test ids.
    - _Requirements: R20.1_

  - [ ]* 1.2 Scaffold the frontend property test files
    - Create `apps/admissions/tests/property/paymentStateMachine.property.test.ts`, `paymentRecoveryStore.property.test.ts`, and `paymentErrorCodes.property.test.ts`.
    - Each file imports `fc from 'fast-check'` and wraps assertions in `fc.assert(..., { numRuns: 100, seed: 0 })`.
    - Tag tests with `// Feature: payment-hardening, Property N: <text>`.
    - Success criterion: `cd apps/admissions && bun run test -- --run tests/property/payment` collects at least 3 suites.
    - _Requirements: R20.1_

  - [ ]* 1.3 Exploration PBT — Property 1: Race-Safe Concurrent Initiation
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - Generator: `@given(n=st.integers(min_value=2, max_value=8))` plus `threading.Thread` spawning `N` concurrent `PaymentService().initiate(app_id, user_id)` calls.
    - Invariant: `COUNT(active payments) == 1` and all returned `payment_id` values are equal.
    - Success criterion: `pytest backend/tests/property/test_payment_state_machine_properties.py::test_property_1_race_safety --hypothesis-seed=0` runs ≥100 examples; record pass or minimised failing example.
    - _Requirements: R3.1, R3.2, R3.3, R20.1_

  - [ ]* 1.4 Exploration PBT — Property 2: Terminal Stability
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - Generator: `st.sampled_from(["successful", "failed", "expired", "force_approved"])` × random verify / webhook / admin-review payloads built with `st.fixed_dictionaries`.
    - Invariant: `p.status`, `p.metadata.snapshot`, `p.receipt_number`, and `Application.payment_status` unchanged after applying any non-`super_admin_correction` input.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R1.3, R1.4, R2.1, R9.1, R10.1, R20.2_

  - [ ]* 1.5 Exploration PBT — Property 3: Out-Of-Order Webhook Safety
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - Generator: `st.permutations([successful, failed, settled, failed, settled])` of `collection.*` events that include ≥1 integrity-passing `collection.successful`.
    - Invariant: final Payment status == `successful`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R9.1, R20.3_

  - [ ]* 1.6 Exploration PBT — Property 4: Webhook Idempotence
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - Generator: any `(event_type, reference, payload)` triple via `st.fixed_dictionaries` over `collection.successful|failed|settled`.
    - Invariant: Payment state, `Application.payment_status`, audit rows, and `receipt_number` after `process(e); process(e)` are identical to a single `process(e)`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R8.5, R8.6, R9.3, R20.4_

  - [ ]* 1.7 Exploration PBT — Property 5: Amount, Currency, and Provider Reference Integrity
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - Generator: `st.tuples(snapshot_strategy, provider_response_strategy)` with independently mutated `amount` (±0.01, zero, negative, unparseable), `currency` (lowercase, empty, mismatched ISO), and `reference` (empty, whitespace).
    - Invariant: `_transition(p, successful)` never executes; `p.status` stays `pending`; exactly one `risk_flag` entry with the appropriate type is appended.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R7.1, R7.2, R7.3, R7.5, R7.6, R10.5, R20.5_

  - [ ]* 1.8 Exploration PBT — Property 6: Receipt Idempotence
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - Generator: `st.integers(min_value=1, max_value=20)` repeat counts over a successful Payment, plus threaded concurrent generation.
    - Invariant: exactly one `receipt_number` allocated; all `k` returned Receipt payloads byte-identical.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R13.1, R13.2, R20.6_

  - [ ]* 1.9 Exploration PBT — Property 7: Single-Active Database Invariant
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - Generator: hypothesis-driven attempts to `INSERT` a second Payment row with the same `application_id` and status in `{pending, deferred}`.
    - Invariant: second insert raises `IntegrityError` from `uq_payments_one_active_per_application`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R3.3, R12.1, R20.7_

  - [ ]* 1.10 Exploration PBT — Property 8: Transaction Reference Uniqueness
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - Generator: `st.text(min_size=1, max_size=100)` reference strings; attempt duplicate insert.
    - Invariant: second insert raises `IntegrityError`; NULL and empty-string references permit duplicates (partial index semantics).
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R3.4, R12.2, R20.8_

  - [ ]* 1.11 Exploration PBT — Property 9: Receipt Number Uniqueness
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - Generator: `st.text(alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", min_size=12, max_size=12)` receipt numbers; attempt duplicate insert.
    - Invariant: second insert raises `IntegrityError` once `uq_payments_receipt_number` is in place; NULL permits duplicates.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure. Expected to fail pre-Phase-1 (index does not exist yet) — record failure as a guide for Phase 1 completion.
    - _Requirements: R13.3, R12.3, R20.9_

  - [ ]* 1.12 Exploration PBT — Property 10: Fee Resolver Determinism
    - File: `backend/tests/property/test_payment_fee_resolver_properties.py`.
    - Generator: `(program_code, nationality, country, waiver_state)` tuples with seeded `ProgramFee` rows.
    - Invariant: two consecutive `FeeResolver().resolve_fee(...)` calls return equal `(amount, currency, residency_category, source)`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R6.1, R20.10_

  - [ ]* 1.13 Exploration PBT — Property 11: Tamper-Resistance
    - File: `backend/tests/property/test_payment_fee_resolver_properties.py`.
    - Generator: request body dictionaries with injected `amount`, `currency`, `reference`, `status`, `payment_id`, and `operator` fields of arbitrary types.
    - Invariant: resulting Payment row carries server-derived values only.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R4.6, R6.1, R20.11_

  - [ ]* 1.14 Exploration PBT — Property 12: Provider Uncertainty Keeps Pending
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - Generator: mock `requests.post` behaviors drawn from `st.sampled_from([Timeout, ConnectionError, 500, 502, 504])`.
    - Invariant: Payment stays `pending`; `metadata.provider_initiation.status == "unknown"`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R11.1, R11.2, R11.4, R20.12_

  - [ ]* 1.15 Exploration PBT — Property 13: Application Summary Consistency
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - Generator: random sequences drawn from `ALLOWED_TRANSITIONS` per source.
    - Invariant: after each commit, `Application.payment_status == PAYMENT_TO_APP_MAP[p.status]` for the latest Payment.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R1.1, R1.6_

  - [ ]* 1.16 Exploration PBT — Property 14: Forward-Only Transition Closure
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - Generator: `st.tuples(st.sampled_from(statuses), st.sampled_from(statuses), st.sampled_from(sources))` enumerating all `6 × 6 × 4 = 144` combinations.
    - Invariant: `_transition(...)` applies a mutation iff `(source, target)` ∈ `ALLOWED_TRANSITIONS[source]`; otherwise emits a no-op `TransitionResult` and a `payment.transition_blocked` audit entry.
    - Success criterion: ≥100 examples (explicit enumeration also acceptable), `--hypothesis-seed=0`, no shrink-failure. Expected to fail pre-Phase-2 (no single `_transition()`). Record failure.
    - _Requirements: R1.2, R1.7_

  - [ ]* 1.17 Exploration PBT — Property 15: Payment-Sensitive Fields Locked
    - File: `backend/tests/property/test_payment_fee_resolver_properties.py`.
    - Generator: random PATCH bodies touching Payment_Sensitive_Fields against applications with random Payment status mixes.
    - Invariant: PATCH returns 409 + `PAYMENT_SENSITIVE_FIELDS_LOCKED` iff any active/non-expired Payment exists; otherwise the PATCH succeeds.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R5.1, R5.2_

  - [ ]* 1.18 Exploration PBT — Property 16: Phone Normalization Idempotence And Operator Derivation
    - File: `backend/tests/property/test_payment_fee_resolver_properties.py`.
    - Generator: Zambian phone generator across `+260…`, `0…`, 9-digit bare, with optional whitespace and mixed separators.
    - Invariant: `normalize_phone_e164(normalize_phone_e164(x)) == normalize_phone_e164(x)`; `derive_operator(x)` depends only on the two-digit MSISDN prefix after `+260`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R11.5, R14.5_

  - [ ]* 1.19 Exploration PBT — Property 17: PII Redaction
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - Generator: recursive audit payloads containing synthetic phone, NRC, passport, PAN, and document-body markers.
    - Invariant: serialized audit rows and log records contain only `{phone_hash, phone_last4}` and `sha256(pii)[:16]`; never plaintext PII.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R17.4, R22.4_

  - [ ]* 1.20 Exploration PBT — Property 18: UI State Matrix Determinism
    - File: `apps/admissions/tests/property/paymentStateMachine.property.test.ts`.
    - Generator: `fc.record({ backendStatus: fc.oneof(...), inflight: fc.boolean(), stableCode: fc.oneof(...), pollingExceededTimeout: fc.boolean() })`.
    - Invariant: `derivePaymentUiState(...)` returns exactly one `PaymentUiState` member; same inputs yield equal outputs (pure function).
    - Success criterion: `fc.assert(prop, { numRuns: 100, seed: 0 })` — no counter-example. Expected to fail pre-Phase-4 (`derivePaymentUiState` does not exist yet). Record failure.
    - _Requirements: R14.1, R14.3, R14.6, R14.7_

  - [ ]* 1.21 Exploration PBT — Property 19: Retry Limit Threshold
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - Generator: `st.integers(min_value=0, max_value=10)` prior attempt counts with random mix of expired-old rows (>7 days).
    - Invariant: `initiate(...)` returns `MAX_PAYMENT_ATTEMPTS_EXCEEDED` iff non-excluded `n >= 5`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R3.5, R3.6_

  - [ ]* 1.22 Exploration PBT — Property 20: Canonical JSON Round-Trip
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - Generator: `st.recursive(st.none() | st.booleans() | st.integers() | st.floats(allow_nan=False, allow_infinity=False) | st.text(), lambda children: st.lists(children) | st.dictionaries(st.text(), children))`.
    - Invariant: `canonical_json(parse(canonical_json(d))) == canonical_json(d)`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure. Expected to fail pre-Phase-3 (`canonical_json` not exported). Record failure.
    - _Requirements: R8.1, R21.1, R21.2, R20.4_

  - [ ]* 1.23 Exploration PBT — Property 21: Webhook Identity Round-Trip
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - Generator: `st.builds(WebhookEventIdentity, provider_event_id=st.text(), event_type=st.sampled_from([...]), reference=st.text(), payload_hash=st.text(min_size=64, max_size=64))`.
    - Invariant: `WebhookEventIdentity.parse(WebhookEventIdentity.print(i)) == i`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure. Expected to fail pre-Phase-3 (dataclass not yet added). Record failure.
    - _Requirements: R21.3, R21.4_

  - [ ]* 1.24 Exploration PBT — Property 22: Provider Event Id Preferred In Identity
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - Generator: payload dictionaries with and without `data.id` / `data.eventId` / `data.event_id`.
    - Invariant: `compute_identity(event_type, p).provider_event_id` equals the provided id when non-empty; otherwise `""` and dedup falls back to `(event_type, reference, payload_hash)`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R8.3, R8.4_

  - [ ]* 1.25 Exploration PBT — Property 23: Snapshot Immutability
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - Generator: random sequences of `_transition(...)`, `mark_provider_initiation(...)`, and arbitrary `metadata` merges.
    - Invariant: the `metadata.snapshot` dict observed at `t0` equals the dict observed at any `t1 > t0`.
    - Success criterion: ≥100 examples, `--hypothesis-seed=0`, no shrink-failure.
    - _Requirements: R6.2, R6.3_

  - [ ]* 1.26 Record exploration results and triage into phase plan
    - For each exploration test (1.3–1.25), capture pass/fail status plus any minimised counter-example in `.kiro/specs/payment-hardening/exploration-results.md`.
    - Triage each failing property against Phases 1–5 so the corresponding phase task has a pre-recorded regression reproducer.
    - _Requirements: R20.1, R20.2, R20.3, R20.4, R20.5, R20.6, R20.7, R20.8, R20.9, R20.10, R20.11, R20.12_

- [ ] 2. Checkpoint — Exploration baseline
  - Ensure all tests pass, ask the user if questions arise.
  - Verify exploration pass records for all 23 properties exist in `.kiro/specs/payment-hardening/exploration-results.md` and that each failing property is mapped to the phase task that will make it pass.
  - _Requirements: R20.1, R20.2, R20.3, R20.4, R20.5, R20.6, R20.7, R20.8, R20.9, R20.10, R20.11, R20.12_

## Phase 1 — Additive Schema and Snapshot Backfill

- [x] 3. Add new SQL scripts for receipt uniqueness and user-status index
  - Extend the existing `backend/scripts/payment_hardening_*.sql` set with the two additional indexes the design calls for (`uq_payments_receipt_number`, `idx_payments_user_status`), each gated by a preflight query and paired with a rollback file.
  - Follow the CONCURRENTLY IF NOT EXISTS pattern used by `backend/scripts/payment_hardening_indexes.sql` and the preflight + rollback pattern used by `backend/scripts/business_logic_densification.sql`.
  - _Requirements: R12.3, R12.5, R12.6, R12.7_

  - [x] 3.1 Write `backend/scripts/payment_hardening_receipt_indexes.sql`
    - Preflight `SELECT receipt_number, COUNT(*) FROM payments WHERE receipt_number IS NOT NULL AND receipt_number <> '' GROUP BY receipt_number HAVING COUNT(*) > 1` that aborts deploy with a descriptive error if duplicates exist.
    - `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_payments_receipt_number ON payments(receipt_number) WHERE receipt_number IS NOT NULL AND receipt_number <> '';`
    - `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);`
    - Header comment referencing this spec and the matching rollback file.
    - _Requirements: R12.3, R12.5, R12.6_

  - [x] 3.2 Write `backend/scripts/payment_hardening_receipt_indexes_rollback.sql`
    - `DROP INDEX CONCURRENTLY IF EXISTS uq_payments_receipt_number;`
    - `DROP INDEX CONCURRENTLY IF EXISTS idx_payments_user_status;`
    - _Requirements: R12.7_

  - [x] 3.3 Unit test — migration indexes exist
    - File: `backend/tests/unit/test_payment_migration_indexes.py`.
    - Assert (via `pg_indexes`) that the seven Phase 1 indexes from the design's "Migration Strategy" are present: `uq_payments_one_active_per_application`, `uq_payments_transaction_reference_present`, `uq_payments_receipt_number`, `uq_webhook_processed_reference_event`, `idx_webhook_provider_event_id`, `idx_payments_application_status`, `idx_payments_user_status`, `idx_payments_status_created_at`.
    - _Requirements: R12.1, R12.2, R12.3, R12.4, R12.5_

  - [ ]* 3.4 Unit test — preflight aborts on duplicates
    - File: `backend/tests/unit/test_payment_migration_preflight.py`.
    - Seed two Payment rows sharing the same `receipt_number`; run the preflight `SELECT`; assert rows are returned so a deploy pipeline can reject the migration.
    - _Requirements: R12.6_

- [x] 4. Write the Payment_Snapshot backfill script
  - Backfill `metadata.snapshot` on legacy Payment rows that lack it so downstream integrity gates have a frozen expected amount/currency to compare against.
  - _Requirements: R6.2, R6.3, R22.7_

  - [x] 4.1 Write `backend/scripts/payment_snapshot_backfill.py`
    - Iterate Payment rows where `metadata` is NULL or `metadata->'snapshot'` is NULL; resolve the program + residency via `FeeResolver.resolve_for_payment_snapshot(application)`; write the snapshot dict into `metadata.snapshot` only when absent; skip ambiguous rows and emit a WARNING to stdout with the payment id.
    - Batch in groups of 200 rows; use `transaction.atomic()` per batch to keep Neon lock hold times low.
    - Expose a `--dry-run` flag that prints planned writes without mutating.
    - Header comment cross-referencing Phase 1 and the rollback strategy (the script is purely additive, rollback is to leave it in place).
    - _Requirements: R6.2, R6.3, R22.7_

  - [x] 4.2 Unit test — backfill idempotence and ambiguous-row skip
    - File: `backend/tests/unit/test_payment_snapshot_backfill.py`.
    - Seed three Payment rows: one with a snapshot already present (must not be overwritten — R6.3), one missing snapshot with a resolvable program/residency (must be populated), and one missing snapshot with an ambiguous program (must be skipped with a WARNING).
    - Run the script twice; assert state after the second run equals state after the first (idempotent).
    - _Requirements: R6.2, R6.3_

- [ ] 5. Apply Phase 1 schema and backfill in staging
  - _Requirements: R12.1, R12.2, R12.3, R12.4, R12.5, R12.6, R12.7_

  - [ ]* 5.1 Rehearse migration on a Neon branch
    - Create a Neon branch from `main`, apply `payment_hardening_preflight.sql`, `payment_hardening_indexes.sql`, `payment_hardening_receipt_indexes.sql`, and run `payment_snapshot_backfill.py --dry-run` then live.
    - Capture the branch id and migration log for the release PR.
    - _Requirements: R12.6, R12.7_

  - [x]* 5.2 Document rollback procedure for Phase 1
    - Update the Phase 1 section of `docs/runbooks/secrets-rotation.md` (or create `docs/runbooks/payment-hardening-rollout.md` if preferred) with explicit rollback commands: run `payment_hardening_receipt_indexes_rollback.sql` then `payment_hardening_indexes_rollback.sql` against the affected branch.
    - Note that the backfill is additive inside `metadata` jsonb and safe to leave in place on rollback.
    - _Requirements: R12.7, R22.7_

- [x] 6. Regression preservation — Phase 1
  - _Requirements: R22.6, R22.7_

  - [x] 6.1 Regression test — existing Payment rows remain readable
    - File: `backend/tests/unit/test_payment_backward_compatibility.py`.
    - Load 50 anonymized Payment row fixtures (mirroring production schema: columns with `verified`, `paid`, `successful`, legacy `metadata` shapes) and assert that `Payment.objects.all().order_by('-created_at')[:50]` serialises without errors and preserves field access.
    - _Requirements: R22.7_

  - [x] 6.2 Regression test — no API route, filename, or envelope drift
    - File: `backend/tests/unit/test_payment_api_contract_preservation.py`.
    - Assert the URL patterns for `/api/v1/payments/initiate/`, `/api/v1/payments/mobile-money/`, `/api/v1/payments/{id}/verify/`, `/api/v1/payments/webhook/lenco/`, and `/api/v1/payments/resolve-fee/` still resolve to `PaymentInitiateView`, `MobileMoneyInitiateView`, `PaymentVerifyView`, `LencoWebhookView`, and `FeeResolverView` respectively, and that each returns the `{"success": …, "data": …}` envelope on a minimal happy-path hit.
    - _Requirements: R22.6_

- [x] 7. Phase 1 verification block
  - Run the design's verification commands in order and confirm no regressions.
  - _Requirements: R22.6, R22.7_

  - [x] 7.1 Run `cd apps/admissions && bun run type-check`
    - _Requirements: R22.6_

  - [x] 7.2 Run `cd apps/admissions && bun run lint`
    - _Requirements: R22.6_

  - [x] 7.3 Run `cd backend && python3 -m pytest backend/tests/ -k payment`
    - _Requirements: R22.6_

  - [x] 7.4 Run `cd backend && python3 -m pytest backend/tests/property/ -k payment`
    - _Requirements: R20.1, R20.2, R20.3, R20.4, R20.5, R20.6, R20.7, R20.8, R20.9, R20.10, R20.11, R20.12_

  - [x] 7.5 Run `cd apps/admissions && bun run build`
    - _Requirements: R22.6_

  - [x] 7.6 Run `bun audit`
    - _Requirements: R22.6_

- [x] 8. Checkpoint — Phase 1 complete
  - Ensure all tests pass, ask the user if questions arise. Confirm receipt uniqueness and user-status indexes are live; snapshot backfill has no pending ambiguous rows blocking Phase 2.
  - _Requirements: R12.1, R12.2, R12.3, R12.4, R12.5, R6.2_

## Phase 2 — PaymentService Forward-Only Guard

- [x] 9. File ADR-1 through ADR-7 before Phase 2 ships
  - Capture the seven design decisions so they survive future refactors. Each ADR is a short markdown file under `docs/adrs/` referencing this spec. This task blocks Phase 2 enablement.
  - _Requirements: R1.1, R1.7, R2.3, R2.4, R8.1, R8.3, R8.4, R17.1, R12.1, R12.2, R12.3, R22.7_

  - [x] 9.1 File `docs/adrs/ADR-001-payment-is-source-of-truth.md`
    - Context, decision, consequences per the design's ADR-1 section. State that `payments.status` is canonical and `applications.payment_status` is a derived summary.
    - _Requirements: R1.1, R1.6_

  - [x] 9.2 File `docs/adrs/ADR-002-force-approved-distinct-status.md`
    - Per design ADR-2: `force_approved` is a ledger status, not a flavour of `successful`; `normalizePaymentStatus` continues to map both to "verified" for student reads.
    - _Requirements: R2.3, R2.4_

  - [x] 9.3 File `docs/adrs/ADR-003-reuse-audit-logs.md`
    - Per design ADR-3: payment corrections, force-approved overrides, and risk-flag history reuse `audit_logs` with `entity_type='payment'`.
    - _Requirements: R17.1_

  - [x] 9.4 File `docs/adrs/ADR-004-canonical-json-webhook-dedup.md`
    - Per design ADR-4: canonical JSON (`sort_keys=True`, `separators=(',',':')`, `default=str`, `ensure_ascii=False`) plus the `WebhookEventIdentity` tuple as the dedup primitive.
    - _Requirements: R8.1, R8.3, R8.4_

  - [x] 9.5 File `docs/adrs/ADR-005-metadata-jsonb-over-new-columns.md`
    - Per design ADR-5: `payments` is `managed=False`; snapshot, risk_flags, provider_initiation, settlement, and override fields live in `metadata` jsonb.
    - _Requirements: R22.7_

  - [x] 9.6 File `docs/adrs/ADR-006-feature-flagged-additive-rollout.md`
    - Per design ADR-6: the five Phase flags and the Vercel build-time flag; schema is additive with preflight + rollback.
    - _Requirements: R12.6, R12.7_

  - [x] 9.7 File `docs/adrs/ADR-007-single-mutation-entry-point.md`
    - Per design ADR-7: `PaymentService._transition()` is the sole mutation entry point; grep regression test enforces it.
    - _Requirements: R1.7_

- [x] 10. TDD — write `_transition()` transition-matrix tests before refactoring `payment_service.py`
  - The design places `_transition()` at the centre of every money-state mutation. Write the enforcement tests first so the refactor is driven by concrete failures.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.6, R1.7, R2.1, R2.2, R7.1, R7.2, R7.3, R7.5, R7.6, R9.1, R9.3, R9.4_

  - [x] 10.1 Unit test — explicit allowed/blocked transitions per source
    - File: `backend/tests/unit/test_payment_service_transitions.py`.
    - Parametrise over the design's State Machine (Formal) table: for each `(from_status, target_status, source)` tuple, assert allowed transitions persist a status change and write an audit row; blocked transitions leave the Payment unchanged and write a `payment.transition_blocked` audit row.
    - _Requirements: R1.2, R1.3, R1.4, R1.7, R9.1, R9.4_

  - [x] 10.2 Unit test — application-summary sync occurs inside the same atomic
    - File: `backend/tests/unit/test_payment_service_transitions.py`.
    - Assert that after every successful `_transition(...)`, `Application.payment_status` reflects `PAYMENT_TO_APP_MAP[p.status]`, and the audit row and application update share the same DB `xid`/savepoint (via a pytest fixture that inspects `pg_stat_activity` or wraps in a single `atomic()` sentinel).
    - _Requirements: R1.1, R1.6_

  - [x] 10.3 Unit test — sole authority grep guard
    - File: `backend/tests/unit/test_payment_service_sole_authority.py`.
    - Walk every `.py` file under `backend/apps/` (excluding `payment_service.py`); `grep` for `UPDATE payments SET status` and `Payment.objects.*.update(status=`. Assert no hits.
    - _Requirements: R1.7_

  - [x] 10.4 Unit test — admin review cannot reverse a successful Payment
    - File: `backend/tests/unit/test_application_review_payment_gate.py` (extend existing).
    - Seed a successful Payment; POST to `/api/v1/applications/{id}/review/` with a payload that would demote the payment; assert 409 + `CANNOT_REVERSE_SUCCESSFUL_PAYMENT`, Payment and Application unchanged.
    - _Requirements: R2.1, R2.2_

  - [x] 10.5 Unit test — integrity gate blocks mismatched successful transitions
    - File: `backend/tests/unit/test_payment_service_transitions.py`.
    - For `amount mismatch`, `currency mismatch`, `invalid amount`, and `missing_provider_reference` inputs, assert `_transition(p, successful, source='webhook')` and `source='verify'` both (a) leave status `pending`, (b) append exactly one matching `risk_flag`, (c) emit a `payment.risk_flag` audit row.
    - _Requirements: R7.1, R7.2, R7.3, R7.5, R7.6_

- [x] 11. Refactor `payment_service.py` so `_transition()` is the sole mutation entry point
  - Keep all existing public methods (`initiate_payment`, `verify_payment`, `process_webhook_event`) callable so current tests pass, but route every `payments.status` write through the new `_transition()`. Gate the stricter behaviour behind `PAYMENT_HARDENING_FORWARD_ONLY` (default `False`).
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.6, R1.7, R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R3.1, R3.2, R3.5, R3.6, R4.1, R4.2, R4.3, R4.4, R4.5, R4.6, R6.1, R6.2, R6.3, R7.1, R7.2, R7.3, R7.4, R7.5, R7.6, R9.1, R9.2, R9.3, R9.4, R10.1, R10.2, R10.3, R10.4, R10.5, R10.6, R10.7, R11.1, R11.2, R11.3, R11.4, R11.5, R11.6_

  - [x] 11.1 Add `PaymentSnapshot` and `TransitionResult` dataclasses
    - In `backend/apps/documents/payment_service.py`, add `@dataclass(frozen=True)` `PaymentSnapshot` and `TransitionResult` per the design's Interface Signatures section.
    - Add `CanonicalStatus` and `ProviderInitiationStatus` `Literal` types.
    - _Requirements: R6.2, R6.3_

  - [x] 11.2 Implement `_transition(payment, target_status, *, source, actor, reason=None, provider_data=None)`
    - Open `transaction.atomic()`; re-read the Payment under `SELECT FOR UPDATE`; validate the `(from, target, source)` tuple against the `ALLOWED_TRANSITIONS` map; for `successful` targets run the 4-check integrity gate (amount at 2dp via `Decimal`, currency case-insensitive, non-empty provider reference, snapshot equality); write the status change; sync `Application.payment_status` atomically; for `successful`/`force_approved` call `_generate_receipt_idempotent(payment)`; emit an audit event via `_emit_audit`.
    - Gate forward-only enforcement on `settings.PAYMENT_HARDENING_FORWARD_ONLY`; when `False`, preserve the current pre-hardening behaviour with clear inline `# LEGACY:` markers.
    - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.6, R1.7, R7.1, R7.2, R7.3, R7.5, R7.6, R9.1, R9.4_

  - [x] 11.3 Implement `_emit_audit(event_type, payment, actor, metadata)`
    - Delegate to the new `PaymentAuditService.record_payment_event(...)` (added in a later sub-task) using the standard action prefixes (`payment.initiated`, `payment.transitioned`, `payment.force_approved`, `payment.risk_flag`, `payment.late_failed_webhook_ignored`, `payment.expired_by_reconciliation`, `payment.webhook.duplicate`, `payment.webhook.invalid_signature`, `payment.receipt.generated`, `payment.transition_blocked`, `payment.admin_override_rejected`, `payment.dev_bypass_used`, `payment.rate_limited`, `payment.sensitive_fields_unlocked`).
    - _Requirements: R17.1_

  - [x] 11.4 Implement `_generate_receipt_idempotent(payment)`
    - Return the existing `receipt_number` when present (R13.2). Otherwise allocate a 12-char base32 string (~60 bits entropy) and persist it; uniqueness is enforced by `uq_payments_receipt_number` (R13.3).
    - Emit `payment.receipt.generated` audit + metric.
    - _Requirements: R13.1, R13.2, R13.3, R13.4, R13.5, R13.6_

  - [x] 11.5 Refactor `initiate(application_id, user_id)` onto `_transition`
    - Resolve Application from `user_id` + `application_id`; re-check ownership inside the lock (R4.1, R4.2); enforce retry limit (R3.5, R3.6); compute `FeeResolver.resolve_for_payment_snapshot(application)` (R6.1, R6.2, R6.3); `SELECT FOR UPDATE` the existing Active_Payment (R3.1, R3.2); handle `IntegrityError` on `uq_payments_one_active_per_application` by falling back to the existing row (R3.3); ignore client-supplied `amount`/`currency`/`reference`/`status`/`operator` (R4.6).
    - _Requirements: R3.1, R3.2, R3.3, R3.5, R3.6, R4.1, R4.2, R4.3, R4.4, R4.5, R4.6, R6.1, R6.2, R6.3_

  - [x] 11.6 Implement `initiate_mobile_money(application_id, user_id, phone_raw)`
    - Wrap `initiate(...)`; normalise phone to E.164 via a new `normalize_phone_e164` helper; derive operator from the two-digit MSISDN prefix after `+260` (`95`/`96`/`75`/`77` → airtel; `97`/`76` → mtn; else reject with `PROVIDER_UNAVAILABLE` 503 per design); call Lenco **outside** any `atomic()` block; route outcome through `mark_provider_initiation(status=accepted|rejected|unknown, operator, phone_hash=sha256(phone), phone_last4=phone[-4:])`; never transition to `failed` on provider timeout/5xx (R11.4); always leave Payment in `pending`.
    - _Requirements: R11.1, R11.2, R11.3, R11.4, R11.5, R11.6_

  - [x] 11.7 Implement `verify(payment_id, actor_id)`
    - Terminal → return cached state without calling Lenco (R10.1); Lenco unreachable on `pending` → leave `pending` + stable code `PROVIDER_UNAVAILABLE` (R10.2); Lenco `pay-offline`/`otp-required`/`pending` → leave `pending` + `PAYMENT_PENDING` (R10.3); integrity-clean `successful`/`paid` → `_transition(pending → successful)` + `PAYMENT_CONFIRMED` (R10.4); amount/currency/reference mismatch → risk flag + leave `pending` + `AMOUNT_MISMATCH`/`CURRENCY_MISMATCH`/`MISSING_PROVIDER_REFERENCE` (R10.5).
    - _Requirements: R10.1, R10.2, R10.3, R10.4, R10.5, R10.6, R10.7_

  - [x] 11.8 Implement `apply_webhook_event(event_type, reference, payload)`
    - Lookup Payment by reference under `SELECT FOR UPDATE`; for `collection.successful` run the integrity gate and `_transition(pending → successful, source='webhook')` (R9.3); for `collection.failed` transition `pending → failed` only and persist reason in `notes` (truncated 500 chars) (R9.4); for `collection.settled` merge `metadata.settlement` only (R9.2); log `payment.late_failed_webhook_ignored` for late failed events (R9.1); treat unknown `event_type` as log-and-skip (R8.7).
    - _Requirements: R8.7, R9.1, R9.2, R9.3, R9.4_

  - [x] 11.9 Implement `force_approve(application_id, actor_id, actor_role, reason)`
    - Reject with `CANNOT_REVERSE_SUCCESSFUL_PAYMENT` when a successful Payment already exists (R2.1, R2.2); require `reason ≥ 10 chars` else `OVERRIDE_REASON_REQUIRED` (R2.5); write `reviewed_by`, `reviewed_at`, `reason`, `actor_role`, `override=true` to `metadata` (R2.4); emit `payment.force_approved` audit (R2.6); generate receipt idempotently (R13.1, R13.5, R13.6).
    - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6_

  - [x] 11.10 Implement `expire_stale(older_than_hours=24, batch_cap=50)`
    - Transition `pending` Payments older than 24h to `expired` via `_transition(pending → expired, source='reconciliation')`; emit `payment.expired_by_reconciliation`; idempotent by construction (R18.5).
    - _Requirements: R18.2, R18.5_

  - [x] 11.11 Unit test — `initiate_mobile_money` phone normalisation edge cases
    - File: `backend/tests/unit/test_mobile_money_view_normalization.py`.
    - Parametrise over `+260…`, `0…`, 9-digit bare, whitespace, mixed separators, and non-Zambian prefixes; assert normalised MSISDN, operator, and that client-supplied `operator`/`amount`/`currency` are ignored.
    - _Requirements: R11.5, R11.6, R4.6_

  - [x] 11.12 Unit test — `force_approve` happy path and guards
    - File: `backend/tests/unit/test_payment_service_force_approve.py`.
    - Assert: (a) successful Payment pre-existing → `CANNOT_REVERSE_SUCCESSFUL_PAYMENT`; (b) reason < 10 chars → `OVERRIDE_REASON_REQUIRED`; (c) no prior Payment → new row with status `force_approved`, override metadata, audit row, receipt generated.
    - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R13.1, R13.5, R13.6_

  - [x] 11.13 Unit test — `expire_stale` idempotence
    - File: `backend/tests/unit/test_payment_reconciliation_task.py`.
    - Seed 10 `pending` Payments older than 24h; run `expire_stale()` twice; assert all rows transition to `expired` exactly once; audit rows count equals 10.
    - _Requirements: R18.2, R18.5_

- [x] 12. Write the `PaymentAuditService` wrapper module
  - Centralise payment audit-row shape and PII redaction so every emitter inherits the same redaction rules.
  - _Requirements: R17.1, R17.4, R22.4, R22.5_

  - [x] 12.1 Create `backend/apps/documents/payment_audit_service.py`
    - Implement `PaymentAuditService.record_payment_event(*, action, payment_id, application_id, actor_id, actor_role, metadata, retention_category='standard', request=None)` per the design's Service Design section.
    - Call a private `_redact_pii(metadata)` that recursively replaces phone/msisdn/mobile keys with `{phone_hash, phone_last4}`, NRC/passport/PAN/CVV/card_number keys with `sha256(value)[:16]`, and strips `document_body`, `file_content`, `raw_payload`.
    - Populate `entity_type='payment'`, `entity_id=payment_id`, `ip_address_encrypted` and `user_agent_encrypted` from `request`, leaving plaintext columns empty.
    - Set `retention_category='security'` for `payment.force_approved`, `payment.super_admin_corrected`, `payment.dev_bypass_used`, and `payment.rate_limited`; default `standard` otherwise.
    - Never raise except inside the same `atomic()` block as the mutation.
    - _Requirements: R17.1, R17.4, R22.4_

  - [x] 12.2 Unit test — audit row shape and retention category
    - File: `backend/tests/unit/test_payment_audit_service.py`.
    - Assert every standard action writes `entity_type='payment'`; `payment.force_approved` gets `retention_category='security'`; ip/user-agent always land in the encrypted columns.
    - _Requirements: R17.1, R22.4, R22.5_

  - [x] 12.3 Unit test — PII redaction property
    - File: `backend/tests/property/test_payment_receipt_properties.py` (extend Property 17 from Task 1.19).
    - Switch from exploration to enforcement: `PaymentAuditService._redact_pii` output must not contain any plaintext PII marker, across 100 generated payloads.
    - _Requirements: R17.4, R22.4_

- [x] 13. Write the `MetricsService` counter registry
  - Provide a single registry of payment counters so the smoke test can assert every counter referenced in service/view code is declared.
  - _Requirements: R17.2, R17.3, R17.4_

  - [x] 13.1 Create `backend/apps/documents/payment_metrics.py`
    - Define the `PAYMENT_COUNTERS` tuple per the design's Service Design section.
    - Implement `increment(counter, *, amount=1, tags=None)` and `observe_latency(histogram, *, value_ms, tags=None)` wrappers over `sentry_sdk.metrics.incr` / structured log emission.
    - Reject any tag value that is not in the design's fixed enumerations (endpoint, user_role, risk_type, source, provider_status, outcome) — never accept `user_id`, `application_id`, `payment_id`, phone, or NRC as label values.
    - _Requirements: R17.2, R17.3, R17.4_

  - [x] 13.2 Unit test — counter registry completeness
    - File: `backend/tests/unit/test_payment_metrics_registry.py`.
    - Parse `payment_service.py`, `webhook_processor.py`, `views.py` for `increment("payment.…")` call sites via `ast`; assert every name appears in `PAYMENT_COUNTERS`.
    - _Requirements: R17.2_

  - [x] 13.3 Unit test — PII guardrail on label values
    - File: `backend/tests/unit/test_payment_metrics_registry.py`.
    - Attempt to emit `increment("payment.risk.amount_mismatch", tags={"user_id": "abc"})` and assert it raises or drops the tag; attempt `tags={"risk_type": "amount_mismatch"}` and assert it passes.
    - _Requirements: R17.4, R22.4_

- [x] 14. Wire PaymentService + AuditService + MetricsService into the existing views
  - The views keep their URL paths and class names; internally they delegate to `PaymentService` and emit envelope responses with stable `error.code` values.
  - _Requirements: R10.7, R15.1, R15.2, R15.4, R15.5, R22.6_

  - [x] 14.1 Refactor `PaymentInitiateView` in `backend/apps/documents/views.py`
    - Delegate to `PaymentService.initiate(application_id, request.user.id)`; preserve the `{success, data}` envelope; map service exceptions to stable codes (`NOT_OWNER`, `APPLICATION_NOT_FOUND`, `APPLICATION_NOT_PAYABLE`, `ALREADY_PAID`, `MAX_PAYMENT_ATTEMPTS_EXCEEDED`); keep `@idempotent` decorator for replay protection; add a `data.next_action` field where applicable (e.g., `already_paid`).
    - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5, R4.6, R15.1, R15.2, R15.4_

  - [x] 14.2 Refactor `MobileMoneyInitiateView`
    - Delegate to `PaymentService.initiate_mobile_money(application_id, request.user.id, phone)`; serializer white-lists only `application_id` and `phone`; status code 201 on `accepted`, 202 on `unknown` (`next_action=check_status`), 200 on `already_paid` (`next_action=already_paid`).
    - _Requirements: R4.6, R11.1, R11.2, R11.3, R11.4, R11.5, R11.6, R15.1, R15.2, R15.4_

  - [x] 14.3 Refactor `PaymentVerifyView`
    - Delegate to `PaymentService.verify(payment_id, request.user.id)`; populate `data.code` with the stable code (`PAYMENT_PENDING`, `PAYMENT_CONFIRMED`, `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `MISSING_PROVIDER_REFERENCE`, `PROVIDER_UNAVAILABLE`); preserve 403 + `NOT_OWNER` for non-owners (R10.6).
    - _Requirements: R10.1, R10.2, R10.3, R10.4, R10.5, R10.6, R10.7, R15.1, R15.2, R15.4_

  - [x] 14.4 Refactor `FeeResolverView`
    - Ensure `data.customer_total` is server-computed and returned verbatim (R6.4); map missing fee to 404 + `FEE_UNAVAILABLE` (R6.5).
    - _Requirements: R6.1, R6.4, R6.5, R15.1, R15.2_

  - [x] 14.5 Refactor `ApplicationReviewView` (admin override path)
    - Delegate payment changes exclusively to `PaymentService.force_approve()` / `PaymentService.review_application_payment()`; return 409 + `CANNOT_REVERSE_SUCCESSFUL_PAYMENT` when trying to demote a successful Payment; return 400 + `OVERRIDE_REASON_REQUIRED` when reason < 10 chars.
    - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6_

  - [x] 14.6 Refactor `poll_pending_payments_task` in `backend/apps/documents/tasks.py`
    - Call `PaymentService.expire_stale()` first, then iterate `pending` Payments older than `PAYMENT_RECONCILE_MIN_AGE_SECONDS` (default 300) in batches of 50, calling `PaymentService.verify_payment(payment_id)`; emit `payment.reconcile.processed` counter with `outcome` label; preserve idempotence (R18.5).
    - _Requirements: R18.1, R18.2, R18.3, R18.4, R18.5_

  - [x] 14.7 Unit test — envelope contract across all payment endpoints
    - File: `backend/tests/unit/test_payment_envelope_contract.py`.
    - Hit every payment endpoint with both success and representative failure payloads; assert the envelope keys `success`, `data`, `error.code`, `error.message` are present per the stable-code catalogue.
    - _Requirements: R15.1, R15.2, R15.4, R15.5_

- [x] 15. Add the `PAYMENT_HARDENING_FORWARD_ONLY` feature flag plumbing
  - _Requirements: R1.7, R22.6_

  - [x] 15.1 Declare `PAYMENT_HARDENING_FORWARD_ONLY` in `backend/config/settings/base.py`
    - Default `False`; read from `PAYMENT_HARDENING_FORWARD_ONLY` env var.
    - _Requirements: R1.7_

  - [x] 15.2 Gate `_transition()` enforcement on the flag
    - When `False`, the legacy pre-hardening code path runs; when `True`, every write must go through `_transition()` and the grep regression test is informative but not load-bearing in dev.
    - _Requirements: R1.7_

  - [ ]* 15.3 Enable `PAYMENT_HARDENING_FORWARD_ONLY=True` in staging, soak 48h
    - Flip in Koyeb staging env; monitor `payment.transition_blocked`, `payment.risk.*`, `payment.initiation.failure` counters for 48h.
    - _Requirements: R1.7_

  - [ ]* 15.4 Verify Phase 2 metrics in GlitchTip
    - Confirm no new GlitchTip errors tagged `domain=payment`; confirm counter volumes match expected baseline (± 10 %).
    - _Requirements: R17.1, R17.2_

  - [ ]* 15.5 Enable `PAYMENT_HARDENING_FORWARD_ONLY=True` in production
    - Flip in Koyeb prod env after staging soak passes.
    - _Requirements: R1.7_

  - [ ]* 15.6 Document Phase 2 rollback
    - Append a "Phase 2 rollback" subsection to `docs/runbooks/payment-hardening-rollout.md` (create if missing): set `PAYMENT_HARDENING_FORWARD_ONLY=False` and redeploy; schema remains in place.
    - _Requirements: R22.7_

- [x] 16. Enforcement PBTs for Phase 2
  - Convert the Task 1 exploration tests for state-machine properties into enforcement PBTs that must pass post-refactor.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.6, R1.7, R2.1, R3.1, R3.2, R3.3, R3.5, R3.6, R6.2, R6.3, R7.1, R7.2, R7.3, R7.5, R7.6, R9.1, R9.3, R20.1, R20.2, R20.5_

  - [x] 16.1 PBT — Property 1: Race-Safe Concurrent Initiation (enforcement)
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - **Property 1: Race-Safe Concurrent Initiation**. Generator: 2–10 threads calling `PaymentService().initiate`. Hypothesis strategies: `st.integers(min_value=2, max_value=10)`.
    - **Validates: Requirements R3.1, R3.2, R3.3, R20.1**.
    - Success criterion: `pytest backend/tests/property/test_payment_state_machine_properties.py::test_property_1_race_safety --hypothesis-seed=0` runs ≥100 examples without shrink-failure.
    - _Requirements: R3.1, R3.2, R3.3, R20.1_

  - [x] 16.2 PBT — Property 2: Terminal Stability (enforcement)
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - **Property 2: Terminal Stability**. Generator: `st.sampled_from(["successful","failed","expired","force_approved"])` × arbitrary verify/webhook/admin payloads.
    - **Validates: Requirements R1.3, R1.4, R2.1, R9.1, R10.1, R20.2**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R1.3, R1.4, R2.1, R9.1, R10.1, R20.2_

  - [x] 16.3 PBT — Property 5: Amount/Currency/Reference Integrity (enforcement)
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - **Property 5: Amount, Currency, and Provider Reference Integrity**. Generator: `st.tuples(snapshot, provider_response)` with independent mutations.
    - **Validates: Requirements R7.1, R7.2, R7.3, R7.5, R7.6, R10.5, R20.5**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R7.1, R7.2, R7.3, R7.5, R7.6, R10.5, R20.5_

  - [x] 16.4 PBT — Property 13: Application Summary Consistency (enforcement)
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - **Property 13: Application Summary Consistency**. Generator: sequences of allowed transitions.
    - **Validates: Requirements R1.1, R1.6**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R1.1, R1.6_

  - [x] 16.5 PBT — Property 14: Forward-Only Transition Closure (enforcement)
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - **Property 14: Forward-Only Transition Closure**. Generator: `product(statuses, statuses, sources)` — 144 combinations.
    - **Validates: Requirements R1.2, R1.7**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples (explicit enumeration accepted), no shrink-failure.
    - _Requirements: R1.2, R1.7_

  - [x] 16.6 PBT — Property 19: Retry Limit Threshold (enforcement)
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - **Property 19: Retry Limit Threshold**. Generator: `st.integers(0,10)` prior attempt counts with random mix of >7-day expired rows.
    - **Validates: Requirements R3.5, R3.6**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R3.5, R3.6_

  - [x] 16.7 PBT — Property 23: Snapshot Immutability (enforcement)
    - File: `backend/tests/property/test_payment_state_machine_properties.py`.
    - **Property 23: Snapshot Immutability**. Generator: random `_transition`/`mark_provider_initiation`/`metadata` merge sequences.
    - **Validates: Requirements R6.2, R6.3**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R6.2, R6.3_

  - [x] 16.8 PBT — Property 10: Fee Resolver Determinism (enforcement)
    - File: `backend/tests/property/test_payment_fee_resolver_properties.py`.
    - **Property 10: Fee Resolver Determinism**. Generator: `(program_code, nationality, country, waiver_state)`.
    - **Validates: Requirements R6.1, R20.10**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R6.1, R20.10_

  - [x] 16.9 PBT — Property 11: Tamper-Resistance (enforcement)
    - File: `backend/tests/property/test_payment_fee_resolver_properties.py`.
    - **Property 11: Tamper-Resistance**. Generator: request bodies with injected `amount`/`currency`/`reference`/`status`/`operator`.
    - **Validates: Requirements R4.6, R6.1, R20.11**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R4.6, R6.1, R20.11_

  - [x] 16.10 PBT — Property 12: Provider Uncertainty Keeps Pending (enforcement)
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - **Property 12: Provider Uncertainty Keeps Pending**. Generator: mocked `requests.post` behaviours: `Timeout`, `ConnectionError`, 500, 502, 504.
    - **Validates: Requirements R11.1, R11.2, R11.4, R20.12**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R11.1, R11.2, R11.4, R20.12_

  - [x] 16.11 PBT — Property 16: Phone Normalization Idempotence (enforcement)
    - File: `backend/tests/property/test_payment_fee_resolver_properties.py`.
    - **Property 16: Phone Normalization Idempotence And Operator Derivation**. Generator: Zambian phone formats.
    - **Validates: Requirements R11.5, R14.5**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R11.5, R14.5_

  - [x] 16.12 PBT — Property 15: Payment-Sensitive Fields Locked (enforcement)
    - File: `backend/tests/property/test_payment_fee_resolver_properties.py`.
    - **Property 15: Payment-Sensitive Fields Locked**. Generator: random PATCH field edits × random Payment status mixes.
    - **Validates: Requirements R5.1, R5.2**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R5.1, R5.2_

- [x] 17. Unit tests for Phase 2 supporting behaviour
  - _Requirements: R2.3, R5.1, R5.2, R5.3, R5.4, R10.1, R10.6, R13.1, R13.2, R13.4, R13.5, R13.6, R16.1, R16.2, R16.3, R18.1, R18.2, R18.3, R18.4, R18.5, R22.6_

  - [x] 17.1 Unit test — sensitive-field lock on application PATCH/DELETE
    - File: `backend/tests/unit/test_payment_sensitive_fields_lock.py`.
    - For each Payment_Sensitive_Field, assert PATCH returns 409 + `PAYMENT_SENSITIVE_FIELDS_LOCKED` when any `{pending, deferred, successful, force_approved}` Payment exists; draft DELETE returns 409 + `DRAFT_DELETE_BLOCKED_BY_PAYMENT` unless all Payments are expired.
    - _Requirements: R5.1, R5.2, R5.3, R5.4_

  - [x] 17.2 Unit test — receipt generation eligibility + force-approved label
    - File: `backend/tests/unit/test_payment_receipt_generation.py`.
    - Assert: receipt generated exactly once on `successful`/`force_approved`; second call returns the existing record; pending/failed/expired Payments return `RECEIPT_NOT_ELIGIBLE`; force-approved receipts carry "Administrative Override" label + actor role + timestamp.
    - _Requirements: R13.1, R13.2, R13.4, R13.5, R13.6_

  - [x] 17.3 Unit test — dev-bypass lockout under production settings
    - File: `backend/tests/unit/test_payment_dev_bypass_404.py`.
    - Parametrise over all five payment views × four bypass vectors (`?dev-bypass=*`, `X-Dev-Bypass-Auth` header, `DEV_BYPASS_AUTH` body field, `?dev=1`); under `DEBUG=False` / `DJANGO_ENV=production`, assert HTTP 404 with no body.
    - _Requirements: R16.1, R16.2, R16.3_

  - [x] 17.4 Unit test — reconciliation task behaviour
    - File: `backend/tests/unit/test_payment_reconciliation_task.py` (extend Task 11.13).
    - Assert: pending Payments < 5 minutes old are skipped; pending Payments ≥ 5 minutes call `verify_payment`; pending Payments ≥ 24h are transitioned to `expired`; re-running the task is idempotent; mismatches trigger a risk flag, not a transition.
    - _Requirements: R18.1, R18.2, R18.3, R18.4, R18.5_

- [x] 18. Regression preservation — Phase 2
  - _Requirements: R22.6_

  - [x] 18.1 Regression test — `normalizePaymentStatus` still maps legacy `verified` and `paid` to verified
    - File: `apps/admissions/tests/unit/paymentStatusLegacy.test.ts`.
    - Assert `normalizePaymentStatus('verified') === 'verified'` and `normalizePaymentStatus('paid') === 'verified'`; assert `isPaymentVerified({ status: 'force_approved' }) === true`.
    - _Requirements: R22.6_

  - [x] 18.2 Regression test — Lenco widget branch still invokes `LencoPay.getPaid`
    - File: `apps/admissions/tests/unit/paymentStepLegacyPath.test.tsx`.
    - Render the card-method path of `PaymentStep`; assert `LencoPay.getPaid` is called with the server-provided `reference` and `lenco_public_key`.
    - _Requirements: R22.6_

  - [x] 18.3 Regression test — mobile-money-first wizard UX preserved
    - File: `apps/admissions/tests/unit/paymentStepLegacyPath.test.tsx` (extend).
    - Assert the mobile-money option is displayed as the primary method (first tab) and the card widget is the secondary option; defer option remains accessible.
    - _Requirements: R22.6_

- [x] 19. Phase 2 verification block
  - _Requirements: R22.6, R22.7_

  - [x] 19.1 Run `cd apps/admissions && bun run type-check`
    - _Requirements: R22.6_

  - [x] 19.2 Run `cd apps/admissions && bun run lint`
    - _Requirements: R22.6_

  - [x] 19.3 Run `cd backend && python3 -m pytest backend/tests/ -k payment`
    - _Requirements: R22.6_

  - [x] 19.4 Run `cd backend && python3 -m pytest backend/tests/property/ -k payment`
    - _Requirements: R20.1, R20.2, R20.3, R20.4, R20.5, R20.6, R20.7, R20.8, R20.9, R20.10, R20.11, R20.12_

  - [x] 19.5 Run `cd apps/admissions && bun run build`
    - _Requirements: R22.6_

  - [x] 19.6 Run `bun audit`
    - _Requirements: R22.6_

- [x] 20. Checkpoint — Phase 2 complete
  - Ensure all tests pass, ask the user if questions arise. Confirm `_transition()` is the sole mutation entry point, the grep regression test passes, and `PAYMENT_HARDENING_FORWARD_ONLY` is enabled in staging.
  - _Requirements: R1.1, R1.2, R1.7_

## Phase 3 — Webhook Dedup Strict and Stable Error Codes

- [x] 21. Implement canonical JSON and `WebhookEventIdentity` in `webhook_processor.py`
  - The design pins `compute_identity(event_type, payload)` on canonical JSON plus provider event id preference. This task ports `WebhookProcessor` onto the new primitives without changing the HTTP surface.
  - _Requirements: R8.1, R8.2, R8.3, R8.4, R8.5, R8.6, R8.7, R21.1, R21.2, R21.3, R21.4, R21.5_

  - [x] 21.1 Add `canonical_json(payload)` helper
    - `json.dumps(payload, sort_keys=True, separators=(',',':'), default=str, ensure_ascii=False).encode('utf-8')`; wrap in a `try/except` that logs `processing_error='Canonical serialization failed'` and short-circuits the caller (R21.5).
    - _Requirements: R8.1, R21.1, R21.5_

  - [x] 21.2 Add frozen `WebhookEventIdentity` dataclass with `print()` / `parse()`
    - Fields: `provider_event_id`, `event_type`, `reference`, `payload_hash`. `print()` format: `wh:{provider_event_id}|{event_type}|{reference}|{payload_hash[:12]}`. `parse(s)` is the inverse.
    - Log-safe pretty-print: short hash prefix only; no raw payload leakage (R21.3).
    - _Requirements: R21.3, R21.4_

  - [x] 21.3 Implement `compute_identity(event_type, payload)`
    - Extract `payload.data.id | eventId | event_id` (empty string if none); extract `payload.data.reference`; compute `sha256(canonical_json(payload)).hexdigest()`; return `WebhookEventIdentity(provider_event_id, event_type, reference, payload_hash)` (R8.3, R8.4).
    - _Requirements: R8.3, R8.4_

  - [x] 21.4 Implement `is_duplicate(identity)`
    - Under `transaction.atomic()` + `SELECT FOR UPDATE`, query `webhook_event_logs` on `(reference, event_type)` where `processed=true`; also query `idx_webhook_provider_event_id` when `provider_event_id` is non-empty; return True on hit (R8.5, R8.6).
    - _Requirements: R8.5, R8.6_

  - [x] 21.5 Rewire `process(raw_body, signature, payload)`
    - Validate signature first (R8.1); on failure log `signature_valid=false, processing_error='Invalid webhook signature'`, never mutate a Payment, return HTTP 200 (R8.2); on success, compute identity → `is_duplicate` → delegate to `PaymentService.apply_webhook_event` (R8.5, R8.6); for unknown event types log with `processing_error='Unrecognised event type'` and skip (R8.7); stash `_webhook_identity` into `payload` before persisting to `webhook_event_logs`.
    - _Requirements: R8.1, R8.2, R8.5, R8.6, R8.7_

- [x] 22. Write stable error code catalogues for backend and frontend
  - The design requires a single source of truth for stable codes, keyed by HTTP status and user-facing message.
  - _Requirements: R15.1, R15.2, R15.3, R15.4, R15.5_

  - [x] 22.1 Create `backend/apps/documents/payment_error_codes.py`
    - Export `PAYMENT_ERROR_CODES: dict[str, PaymentErrorCode]` matching the design's Stable Code Catalog (code → HTTP status → user-facing message).
    - Include every code from R15.3 plus `RATE_LIMITED`, `PAYMENT_UNAVAILABLE`, `VALIDATION_ERROR`.
    - _Requirements: R15.1, R15.2, R15.3, R15.4, R15.5_

  - [x] 22.2 Create `apps/admissions/src/lib/paymentErrorCodes.ts`
    - Export the TypeScript union of stable codes plus a `PAYMENT_ERROR_COPY: Record<PaymentErrorCode, string>` map with user-facing copy.
    - Mirror exactly the backend catalogue (drift detected by snapshot tests).
    - _Requirements: R15.1, R15.2, R15.3, R15.4, R15.5_

  - [x] 22.3 Unit test — snapshot pin of stable codes (backend)
    - File: `backend/tests/unit/test_payment_error_codes_snapshot.py`.
    - Freeze the `{code: (status, message)}` map; fail CI on any accidental rename or repurpose (R15.5).
    - _Requirements: R15.5_

  - [x] 22.4 Unit test — frontend union matches backend catalogue
    - File: `apps/admissions/tests/unit/paymentErrorCodes.test.ts`.
    - Import the backend catalogue via a generated fixture (or hard-coded mirror list), assert every code in the backend list appears in the TypeScript union and vice versa.
    - _Requirements: R15.1, R15.2, R15.5_

- [x] 23. Add the `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` feature flag
  - _Requirements: R8.5, R8.6, R12.4_

  - [x] 23.1 Declare `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` in `backend/config/settings/base.py`
    - Default `False`; read from env var.
    - _Requirements: R8.5, R8.6_

  - [x] 23.2 Gate strict dedup behaviour on the flag
    - When `False`, behave per pre-hardening code (in-code dedup check only). When `True`, rely on the partial unique index `uq_webhook_processed_reference_event` to raise `IntegrityError` on duplicate processed events, plus the in-service `is_duplicate()` pre-check.
    - On `IntegrityError` from the uniqueness constraint, log a `payment.webhook.duplicate` event and return HTTP 200 to Lenco.
    - _Requirements: R8.5, R8.6, R12.4_

  - [ ]* 23.3 Enable `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True` in staging, soak 48h
    - Monitor `payment.webhook.duplicate` and `payment.webhook.invalid_signature` counters.
    - _Requirements: R8.5, R8.6_

  - [ ]* 23.4 Verify Phase 3 metrics
    - Confirm GlitchTip has no new webhook-tagged exceptions; counter volumes stable.
    - _Requirements: R17.2_

  - [ ]* 23.5 Enable `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True` in production
    - Flip after staging soak.
    - _Requirements: R8.5, R8.6_

  - [ ]* 23.6 Document Phase 3 rollback
    - Append a "Phase 3 rollback" subsection to `docs/runbooks/payment-hardening-rollout.md`: set the flag to `False`; the partial unique index stays in place.
    - _Requirements: R22.7_

- [x] 24. Enforcement PBTs for Phase 3
  - Convert exploration tests for webhook properties into enforcement PBTs that must pass post-refactor.
  - _Requirements: R8.1, R8.3, R8.4, R8.5, R8.6, R9.1, R9.3, R9.4, R20.3, R20.4, R20.9, R21.1, R21.2, R21.4_

  - [x] 24.1 PBT — Property 3: Out-Of-Order Webhook Safety (enforcement)
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - **Property 3: Out-Of-Order Webhook Safety**. Generator: `st.permutations([successful, failed, settled, failed, settled])`.
    - **Validates: Requirements R9.1, R20.3**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R9.1, R20.3_

  - [x] 24.2 PBT — Property 4: Webhook Idempotence (enforcement)
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - **Property 4: Webhook Idempotence**. Generator: `st.fixed_dictionaries` over valid `(event_type, reference, payload)` triples.
    - **Validates: Requirements R8.5, R8.6, R9.3, R20.4**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R8.5, R8.6, R9.3, R20.4_

  - [x] 24.3 PBT — Property 20: Canonical JSON Round-Trip (enforcement)
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - **Property 20: Canonical JSON Round-Trip**. Generator: `st.recursive(...)` producing JSON-compatible dicts.
    - **Validates: Requirements R8.1, R21.1, R21.2**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R8.1, R21.1, R21.2_

  - [x] 24.4 PBT — Property 21: Webhook Identity Round-Trip (enforcement)
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - **Property 21: Webhook Identity Round-Trip**. Generator: `st.builds(WebhookEventIdentity, …)`.
    - **Validates: Requirements R21.3, R21.4**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R21.3, R21.4_

  - [x] 24.5 PBT — Property 22: Provider Event Id Preferred In Identity (enforcement)
    - File: `backend/tests/property/test_payment_webhook_properties.py`.
    - **Property 22: Provider Event Id Preferred In Identity**. Generator: payloads with/without `id`/`eventId`/`event_id`.
    - **Validates: Requirements R8.3, R8.4**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R8.3, R8.4_

  - [x] 24.6 PBT — Property 6: Receipt Idempotence (enforcement)
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - **Property 6: Receipt Idempotence**. Generator: `st.integers(1,20)` repeats over successful Payment + threaded concurrent generation.
    - **Validates: Requirements R13.1, R13.2, R20.6**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R13.1, R13.2, R20.6_

  - [x] 24.7 PBT — Property 7: Single-Active DB Invariant (enforcement)
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - **Property 7: Single-Active Database Invariant**. Generator: hypothesis-driven second-active-row INSERT attempts.
    - **Validates: Requirements R3.3, R12.1, R20.7**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R3.3, R12.1, R20.7_

  - [x] 24.8 PBT — Property 8: Transaction Reference Uniqueness (enforcement)
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - **Property 8: Transaction Reference Uniqueness**. Generator: `st.text(min_size=1, max_size=100)` reference strings; attempt duplicate insert.
    - **Validates: Requirements R3.4, R12.2, R20.8**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R3.4, R12.2, R20.8_

  - [x] 24.9 PBT — Property 9: Receipt Number Uniqueness (enforcement)
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - **Property 9: Receipt Number Uniqueness**. Generator: `st.text(alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", min_size=12, max_size=12)`.
    - **Validates: Requirements R13.3, R12.3, R20.9**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R13.3, R12.3, R20.9_

  - [x] 24.10 PBT — Property 17: PII Redaction (enforcement)
    - File: `backend/tests/property/test_payment_receipt_properties.py`.
    - **Property 17: PII Redaction**. Generator: recursive audit payloads with synthetic PII markers.
    - **Validates: Requirements R17.4, R22.4**.
    - Success criterion: `--hypothesis-seed=0`, ≥100 examples, no shrink-failure.
    - _Requirements: R17.4, R22.4_

- [x] 25. Unit tests for Phase 3 supporting behaviour
  - _Requirements: R8.1, R8.2, R8.3, R8.4, R8.5, R8.6, R8.7, R9.1, R9.2, R9.3, R9.4, R21.5, R22.5_

  - [x] 25.1 Unit test — HMAC signature validation paths
    - File: `backend/tests/unit/test_webhook_processor_signature.py`.
    - Cases: valid signature, invalid signature, tampered body, empty key, constant-time comparison (monkeypatch `hmac.compare_digest` to count calls).
    - _Requirements: R8.1, R8.2_

  - [x] 25.2 Unit test — dedup provider-event-id preference and canonical fallback
    - File: `backend/tests/unit/test_webhook_processor_dedup.py`.
    - Cases: payload with `data.id` present → provider_event_id wins; missing → fallback to `(event_type, reference, payload_hash)`; duplicate markers written to `webhook_event_logs` with `processed=false` for dedup paths.
    - _Requirements: R8.3, R8.4, R8.5, R8.6_

  - [x] 25.3 Unit test — out-of-order webhook safety end-to-end
    - File: `backend/tests/unit/test_payment_webhook_out_of_order.py`.
    - Replay `collection.settled → collection.successful → collection.failed` out of order; assert final `successful`; assert late `collection.failed` produces `payment.late_failed_webhook_ignored`; `collection.settled` only merges settlement metadata (R9.2).
    - _Requirements: R9.1, R9.2, R9.3, R9.4_

  - [x] 25.4 Unit test — canonical serialization failure
    - File: `backend/tests/unit/test_webhook_processor_canonical_json.py`.
    - Inject a non-JSON-serialisable object; assert processor writes `WebhookEventLog` with `processing_error='Canonical serialization failed'` and mutates no Payment (R21.5).
    - _Requirements: R21.5_

  - [x] 25.5 Unit test — webhook unknown event type is logged, not mutating
    - File: `backend/tests/unit/test_webhook_processor_unknown_event.py`.
    - Send `event_type='collection.cancelled'` (not in known set); assert `WebhookEventLog.processed=true` with `processing_error='Unrecognised event type'`; no Payment mutation (R8.7).
    - _Requirements: R8.7_

  - [x] 25.6 Unit test — structured logging + GlitchTip tagging
    - File: `backend/tests/unit/test_payment_structured_logging.py`.
    - Assert every payment log record carries `extra={"type":"payment_event", "request_id":…, "user_id":…, "application_id":…, "payment_id":…, "event_type":…}` with absent fields omitted (not `None`).
    - _Requirements: R22.5_

- [x] 26. Standardize backend error envelope responses across payment endpoints
  - _Requirements: R10.7, R15.1, R15.2, R15.4, R15.5_

  - [x] 26.1 Apply the Stable Code Catalog to every payment endpoint's error paths
    - Every 4xx/5xx response sets `success=false`, `error.code`, `error.message`, optional `error.details`.
    - Every successful response sets `success=true` and places domain payload in `data`; optional `data.next_action` populated where relevant.
    - _Requirements: R10.7, R15.1, R15.2, R15.4, R15.5_

  - [x] 26.2 Unit test — stable-code coverage across payment endpoints
    - File: `backend/tests/unit/test_payment_envelope_contract.py` (extend Task 14.7).
    - Parametrise over each `(endpoint, error_scenario)` tuple derived from the Stable Code Catalog; assert code, status, and message match.
    - _Requirements: R15.1, R15.2, R15.3, R15.4, R15.5_

- [x] 27. Regression preservation — Phase 3
  - _Requirements: R22.6_

  - [x] 27.1 Regression test — existing `/api/v1/payments/webhook/lenco/` still returns 200 on any outcome
    - File: `backend/tests/unit/test_payment_webhook_returns_200.py`.
    - Cases: signature invalid, duplicate event, unknown event type, unrecognised payload shape; all return 200.
    - _Requirements: R8.2, R22.6_

  - [x] 27.2 Regression test — envelope shape unchanged on resolve-fee
    - File: `backend/tests/unit/test_payment_envelope_contract.py` (extend).
    - Assert `FeeResolverView` response preserves `{success, data: {amount_due, currency, residency_category, provider_fee_estimate, customer_total, fee_source}}` keys.
    - _Requirements: R6.4, R22.6_

- [x] 28. Phase 3 verification block
  - _Requirements: R22.6, R22.7_

  - [x] 28.1 Run `cd apps/admissions && bun run type-check`
    - _Requirements: R22.6_

  - [x] 28.2 Run `cd apps/admissions && bun run lint`
    - _Requirements: R22.6_

  - [x] 28.3 Run `cd backend && python3 -m pytest backend/tests/ -k payment`
    - _Requirements: R22.6_

  - [x] 28.4 Run `cd backend && python3 -m pytest backend/tests/property/ -k payment`
    - _Requirements: R20.1, R20.2, R20.3, R20.4, R20.5, R20.6, R20.7, R20.8, R20.9, R20.10, R20.11, R20.12, R21.2, R21.4_

  - [x] 28.5 Run `cd apps/admissions && bun run build`
    - _Requirements: R22.6_

  - [x] 28.6 Run `bun audit`
    - _Requirements: R22.6_

- [x] 29. Documentation updates after Phase 3
  - _Requirements: R22.5, R22.6, R22.7_

  - [x] 29.1 Update `.kiro/steering/tech.md`
    - Add new modules to the Lenco Payment Integration table: `PaymentAuditService` (`backend/apps/documents/payment_audit_service.py`), `MetricsService` (`backend/apps/documents/payment_metrics.py`), `payment_error_codes.py`, `risk_views.py`, and `backend/apps/common/dev_bypass.py`.
    - Document the five Phase feature flags (`PAYMENT_HARDENING_FORWARD_ONLY`, `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT`, `PAYMENT_HARDENING_RATE_LIMITS`, `PAYMENT_HARDENING_FORCE_APPROVED`, `VITE_PAYMENT_HARDENING_UI`) in the Conventions For New Code → Backend section.
    - _Requirements: R22.5, R22.6_

  - [x] 29.2 Update `.kiro/steering/structure.md`
    - Append the new payment-hardening files to a "Files Added During Payment Hardening" section mirroring the pattern used for prior hardening passes.
    - _Requirements: R22.6_

  - [x] 29.3 Update `docs/runbooks/secrets-rotation.md`
    - Add Lenco-specific steps: stage the new `LENCO_API_SECRET_KEY`, enable dual-signature validation during the cutover window (`validate_signature` accepts either key), flip primary, revoke old.
    - _Requirements: R22.6, R22.7_

  - [x] 29.4 Update `docs/redis-dependency-tiers.md`
    - Document the new DRF throttle scopes (`payment_initiate`, `payment_mobile_money`, `payment_verify`, `payment_resolve_fee`) and note that DRF fails open on Redis unavailability per platform degradation posture.
    - _Requirements: R19.2_

- [x] 30. Checkpoint — Phase 3 complete
  - Ensure all tests pass, ask the user if questions arise. Confirm webhook dedup strict is enabled in staging, stable-code catalogues agree across backend and frontend, and Phase 1–3 work can ship independently via feature flags.
  - _Requirements: R8.5, R8.6, R15.5, R22.6_

## Phase 4 — Frontend Recovery Store and Stable-Code Handling

- [x] 31. Create the `paymentErrorCodes.ts` stable-code module and user-facing copy map
  - The design pins `paymentErrorCodes.ts` as the single frontend source of truth for stable codes and user-facing copy. This task wires the module, the copy map, and the drift guard against the backend catalogue added in Phase 3 (Task 22).
  - _Requirements: R15.1, R15.2, R15.3, R15.4, R15.5, R22.6_

  - [x] 31.1 Create `apps/admissions/src/lib/paymentErrorCodes.ts`
    - Export a TypeScript string-literal union `PaymentStableCode` covering every code in the backend `PAYMENT_ERROR_CODES` catalogue: `NOT_OWNER`, `APPLICATION_NOT_FOUND`, `APPLICATION_NOT_PAYABLE`, `ALREADY_PAID`, `MAX_PAYMENT_ATTEMPTS_EXCEEDED`, `PAYMENT_PENDING`, `PAYMENT_CONFIRMED`, `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `MISSING_PROVIDER_REFERENCE`, `PROVIDER_UNAVAILABLE`, `FEE_UNAVAILABLE`, `PAYMENT_SENSITIVE_FIELDS_LOCKED`, `DRAFT_DELETE_BLOCKED_BY_PAYMENT`, `CANNOT_REVERSE_SUCCESSFUL_PAYMENT`, `OVERRIDE_REASON_REQUIRED`, `RECEIPT_NOT_ELIGIBLE`, `RATE_LIMITED`, `VALIDATION_ERROR`.
    - Export `PAYMENT_ERROR_COPY: Record<PaymentStableCode, { title: string; body: string; next_action_hint?: string }>` with student-safe wording (no internal references, no provider names in the body).
    - Export `isPaymentStableCode(code: unknown): code is PaymentStableCode` type guard for runtime narrowing from `data.code` / `error.code`.
    - _Requirements: R15.1, R15.2, R15.3, R15.4_

  - [x] 31.2 Create `apps/admissions/src/lib/paymentNextActions.ts`
    - Export `PaymentNextAction` string-literal union: `retry_with_different_number`, `check_status`, `already_paid`, `unavailable`, `contact_support`.
    - Export `PAYMENT_NEXT_ACTION_COPY: Record<PaymentNextAction, { label: string; guidance: string }>`.
    - _Requirements: R14.4, R15.4_

  - [x] 31.3 Unit test — stable-code coverage snapshot
    - File: `apps/admissions/tests/unit/paymentErrorCodesCoverage.test.ts`.
    - Import the backend catalogue mirror list (hard-coded constant fixture imported from `apps/admissions/tests/unit/__fixtures__/paymentErrorCodesBackendMirror.ts`); assert every backend code appears in the TypeScript union and every TypeScript union member is backed by a `PAYMENT_ERROR_COPY` entry.
    - Snapshot the `{code: copy}` map to detect silent copy drift.
    - _Requirements: R15.1, R15.5_

- [x] 32. Add the `zambianMsisdn.ts` Zod refinement
  - The design requires Zambian MSISDN format-level validation on the client (R14.5) without operator inference. This task adds a shared Zod refinement used by the payment form and any future form that collects Zambian phone numbers.
  - _Requirements: R11.5, R14.5, R22.6_

  - [x] 32.1 Create `apps/admissions/src/lib/zambianMsisdn.ts`
    - Export `zambianMsisdnSchema: z.ZodEffects<z.ZodString, string, string>` that accepts `+260XXXXXXXXX`, `0XXXXXXXXX`, or 9-digit bare forms with optional whitespace/dashes stripped.
    - Export `normalizeZambianMsisdn(input: string): string | null` returning the canonical `+260XXXXXXXXX` form or `null` on failure. Pure function, no I/O, idempotent.
    - DO NOT infer or return an operator — the backend is the sole authority on operator derivation (R11.5).
    - _Requirements: R11.5, R14.5_

  - [x] 32.2 Create `apps/admissions/tests/property/paymentErrorCodes.property.test.ts`
    - **Property 16 (frontend half): MSISDN Zod Idempotence**. Generator: `fc.oneof(fc.stringMatching(/^(\+260|0)?[79]\d{8}$/), fc.string())`.
    - Invariant: `normalizeZambianMsisdn(normalizeZambianMsisdn(x) ?? "") === normalizeZambianMsisdn(x)` (idempotent on valid inputs; null stays null).
    - **Property (stable-code coverage): Stable Code Copy Completeness**. Generator: `fc.constantFrom(...PAYMENT_STABLE_CODES)`.
    - Invariant: `PAYMENT_ERROR_COPY[code].title.length > 0 && PAYMENT_ERROR_COPY[code].body.length > 0`.
    - Success criterion: `cd apps/admissions && bun run test -- --run tests/property/paymentErrorCodes.property.test.ts` with `fc.assert(prop, { numRuns: 100, seed: 0 })` — no counter-example.
    - _Requirements: R11.5, R14.5, R15.1, R15.3, R20.1_

- [x] 33. Create the `paymentRecoveryStore` Zustand slice
  - The design pins `paymentRecoveryStore` as a localStorage-persisted Zustand slice keyed by `application_id` with a 24-hour TTL so a student who refreshes, switches devices, or closes the tab can resume their pending Payment without double-submitting (R14.2).
  - _Requirements: R14.2, R22.6, R22.8_

  - [x] 33.1 Create `apps/admissions/src/stores/paymentRecoveryStore.ts`
    - Implement the `PaymentRecoveryEntry` and `PaymentRecoveryStore` interfaces from the design's "Frontend Interface Signatures" section using `create<PaymentRecoveryStore>()(persist(..., { name: 'mihas-payment-recovery', version: 1, storage: createJSONStorage(() => localStorage) }))`.
    - `record(entry)` must compute `ttl_expires_at = entry.initiated_at + 24 * 60 * 60 * 1000` and upsert by `application_id` (writing wins replace prior entry for the same application).
    - `get(applicationId)` returns `null` when the stored entry's `ttl_expires_at < Date.now()`, preserving `entries[applicationId]` in state until the next `pruneExpired()` pass so concurrent tabs do not race on a lazy read.
    - `clear(applicationId)` removes the entry unconditionally.
    - `pruneExpired()` drops all entries where `ttl_expires_at < Date.now()`; safe to call repeatedly.
    - Register a rehydration callback via `onRehydrateStorage` that calls `pruneExpired()` on mount so expired entries never leak into the UI (R14.2).
    - _Requirements: R14.2, R22.8_

  - [x] 33.2 Create `apps/admissions/tests/property/paymentRecoveryStore.property.test.ts`
    - **Recovery Store Round-Trip PBT**. Generator: `fc.array(fc.record({ application_id: fc.uuidV(4), payment_id: fc.uuidV(4), reference: fc.string({ minLength: 1, maxLength: 100 }), method: fc.constantFrom('card', 'mobile_money'), initiated_at: fc.integer({ min: 0, max: 2 ** 48 }) }), { maxLength: 20 })`.
    - Invariant 1 (round-trip): for every recorded entry whose `ttl_expires_at > Date.now()`, `store.get(entry.application_id)` returns a value equal to the recorded entry.
    - Invariant 2 (TTL): if the mocked `Date.now()` advances past `ttl_expires_at`, `store.get(entry.application_id)` returns `null`.
    - **Prune Idempotence PBT**. `store.pruneExpired(); store.pruneExpired();` yields equal `entries` state after the first call.
    - Success criterion: `fc.assert(prop, { numRuns: 100, seed: 0 })` — no counter-example.
    - _Requirements: R14.2, R20.1_

  - [x] 33.3 Unit test — recovery store survives page refresh via localStorage
    - File: `apps/admissions/tests/unit/paymentRecoveryStorePersistence.test.ts`.
    - Use `happy-dom` localStorage to record an entry, simulate a page refresh by re-instantiating the store factory, assert `store.get(applicationId)` returns the same entry; assert `store.clear(applicationId)` removes it from both in-memory state and localStorage.
    - _Requirements: R14.2_

  - [x]* 33.4 Unit test — recovery store concurrent-tab safety
    - File: `apps/admissions/tests/unit/paymentRecoveryStoreConcurrentTabs.test.ts`.
    - Simulate two tabs writing to localStorage for the same `application_id`; assert the last writer wins and no duplicate entries accumulate.
    - _Requirements: R14.2_

- [x] 34. Implement the `derivePaymentUiState` pure function and UI state enum
  - The design pins `deriveUiState(backendStatus, inflight, stableCode, pollingExceededTimeout)` as the single mapper from backend inputs to the UI state matrix rendered by `PaymentStep`. This task lifts the logic out of the component so it is unit-testable and property-testable (Property 18) without React.
  - _Requirements: R14.1, R14.3, R14.6, R14.7, R22.6_

  - [x] 34.1 Extend `apps/admissions/src/lib/paymentStatus.ts`
    - Export the UI state enum `PaymentUiState` as a string-literal union: `idle`, `initiating`, `awaiting_provider`, `still_confirming`, `confirmed`, `already_paid`, `retry_with_different_number`, `unavailable`, `max_attempts_reached`, `sensitive_fields_locked`, `rate_limited`, `needs_admin_followup`, `expired`.
    - Export `derivePaymentUiState(input: { backendStatus: CanonicalPaymentStatus | null; inflight: boolean; stableCode: PaymentStableCode | null; pollingExceededTimeout: boolean }): PaymentUiState` as a pure, deterministic function (no Date, no Math.random, no hidden I/O).
    - Implement the matrix per the design's "Frontend UI State Matrix" table: `still_confirming` on polling timeout (never `failed` for pending — R14.3); `confirmed` on `successful` / `force_approved`; `already_paid` when the initiate call returns `ALREADY_PAID`; `retry_with_different_number` when `next_action=retry_with_different_number` is paired with `stableCode=PROVIDER_UNAVAILABLE`; `sensitive_fields_locked` on `PAYMENT_SENSITIVE_FIELDS_LOCKED`; `rate_limited` on `RATE_LIMITED`; `max_attempts_reached` on `MAX_PAYMENT_ATTEMPTS_EXCEEDED`; `expired` when backendStatus is `expired`.
    - Keep `normalizePaymentStatus` and `isPaymentVerified` unchanged (R22.6).
    - _Requirements: R14.1, R14.3, R14.6, R14.7_

  - [x] 34.2 Unit test — exhaustive UI state matrix table
    - File: `apps/admissions/tests/unit/derivePaymentUiState.test.ts`.
    - Hard-code the full matrix table from the design and assert `derivePaymentUiState(row.input) === row.expected` for every row.
    - _Requirements: R14.1, R14.3, R14.6, R14.7_

- [x] 35. Promote Property 18 to enforcement PBT in `paymentStateMachine.property.test.ts`
  - Task 1.20 created this file for exploration (expected to fail pre-Phase-4). This task converts it into a mandatory enforcement PBT that must pass after `derivePaymentUiState` exists.
  - _Requirements: R14.1, R14.3, R14.6, R14.7, R20.1_

  - [x] 35.1 Convert `apps/admissions/tests/property/paymentStateMachine.property.test.ts` to enforcement
    - **Property 18: UI State Matrix Determinism**. Generator: `fc.record({ backendStatus: fc.option(fc.constantFrom('pending','deferred','successful','failed','expired','force_approved'), { nil: null }), inflight: fc.boolean(), stableCode: fc.option(fc.constantFrom(...PAYMENT_STABLE_CODES), { nil: null }), pollingExceededTimeout: fc.boolean() })`.
    - **Validates: Requirements R14.1, R14.3, R14.6, R14.7**.
    - Invariant 1 (totality): the return value is a member of `PaymentUiState`.
    - Invariant 2 (determinism): two calls with structurally equal inputs return structurally equal outputs (pure function).
    - Invariant 3 (pending safety): when `backendStatus === 'pending' && pollingExceededTimeout === true`, the result is `still_confirming` — never `expired`, never any `failed`-adjacent state (R14.3).
    - Success criterion: `cd apps/admissions && bun run test -- --run tests/property/paymentStateMachine.property.test.ts` with `fc.assert(prop, { numRuns: 100, seed: 0 })` — no counter-example.
    - Remove the exploration-only "expected to fail pre-Phase-4" note recorded in `.kiro/specs/payment-hardening/exploration-results.md` once this enforcement run passes.
    - _Requirements: R14.1, R14.3, R14.6, R14.7, R20.1_

- [x] 36. Refactor `PaymentForm.tsx` for button-disable-while-inflight and idempotency-key header
  - The design pins `PaymentForm` as responsible for disabling the initiate button while a request is in flight or while the backend reports `pending`, and for sending an `idempotency-key` header per submission (R14.1, R15). This task routes both concerns through explicit state rather than inferring them from focus/blur.
  - _Requirements: R14.1, R14.5, R22.6_

  - [x] 36.1 Add `generateIdempotencyKey` helper
    - In `apps/admissions/src/lib/paymentStatus.ts`, export `generateIdempotencyKey(applicationId: string): string` returning a UUID v4 prefixed with `pay-${applicationId.slice(0, 8)}-`. Use `crypto.randomUUID()` with a fallback to `Math.random().toString(36)`-only for legacy browsers (flagged with `// LEGACY FALLBACK:`).
    - _Requirements: R14.1_

  - [x] 36.2 Refactor `apps/admissions/src/components/student/PaymentForm.tsx`
    - Add `inflight: boolean` and `pendingPaymentId: string | null` props driven from the parent `PaymentStep`.
    - Disable the primary initiate button when `inflight || pendingPaymentId !== null` (R14.1).
    - Generate a fresh idempotency key per submission attempt and pass it to the service layer via the new `idempotencyKey` option (Task 36.3).
    - Continue using `zambianMsisdnSchema` for local format validation; DO NOT derive operator on the client (R14.5).
    - Preserve existing mobile-money-first tab order and the Lenco widget option as secondary (R22.6).
    - Preserve focus-on-state-change and the `aria-live` region used by `ErrorDisplay` consumers (R22.8).
    - _Requirements: R14.1, R14.5, R22.6, R22.8_

  - [x] 36.3 Update `apps/admissions/src/services/payments.ts`
    - Extend `initiateMobileMoney(request, { idempotencyKey })` and `initiatePayment(request, { idempotencyKey })` to attach the header `idempotency-key: <key>` to each submission.
    - Typed return shape `{ success: true, data: { payment_id, reference, amount, currency, status, next_action? } } | { success: false, error: { code: PaymentStableCode, message, details? } }`.
    - _Requirements: R14.1, R15.1, R15.2_

  - [x] 36.4 Unit test — button disabled while inflight and while pending
    - File: `apps/admissions/tests/unit/paymentFormButtonDisable.test.tsx`.
    - Render with `inflight=false, pendingPaymentId=null` → button enabled; `inflight=true` → disabled; `pendingPaymentId='…'` → disabled; submitting twice in quick succession only triggers a single service call.
    - _Requirements: R14.1_

  - [x]* 36.5 Unit test — idempotency key header is present per submission
    - File: `apps/admissions/tests/unit/paymentFormIdempotencyHeader.test.tsx`.
    - Mock the fetch client; submit twice; assert each call carries a distinct `idempotency-key` header value matching the `pay-<app8>-<uuid>` shape.
    - _Requirements: R14.1_

- [x] 37. Refactor `usePaymentStatus` to emit `still_confirming` on polling timeout
  - The design pins `usePaymentStatus` as responsible for polling with a `POLL_TIMEOUT_MS` (default 120s), exposing `still_confirming`, and never transitioning the UI to `failed` when polling exceeds the timeout (R14.3).
  - _Requirements: R14.3, R22.6, R22.8_

  - [x] 37.1 Refactor `apps/admissions/src/hooks/usePaymentStatus.ts`
    - Add `POLL_TIMEOUT_MS` default 120000 configurable via `VITE_PAYMENT_POLL_TIMEOUT_MS` build-time var.
    - Return shape: `{ status: CanonicalPaymentStatus | null, stableCode: PaymentStableCode | null, pollingExceededTimeout: boolean, refetch: () => Promise<void>, lastUpdated: number | null }`.
    - When elapsed polling time exceeds `POLL_TIMEOUT_MS` while backend still returns `pending`, set `pollingExceededTimeout = true` and stop background polling; DO NOT set `status = 'failed'` (R14.3).
    - Expose `refetch()` for manual re-check affordance used by the still-confirming UI (R14.3).
    - Continue using React Query under the hood; add `retry: (count, err) => count < 3 && !isTimeoutReached` so provider unavailability is retried without transitioning to failed.
    - _Requirements: R14.3_

  - [x] 37.2 Unit test — polling timeout sets `pollingExceededTimeout`, not `failed`
    - File: `apps/admissions/tests/unit/usePaymentStatusTimeout.test.ts`.
    - Mock a server that always returns `pending`; advance fake timers past `POLL_TIMEOUT_MS`; assert `status === 'pending'`, `pollingExceededTimeout === true`, polling is stopped, `refetch()` triggers a single new request.
    - _Requirements: R14.3_

  - [x]* 37.3 Unit test — refetch resumes polling and clears timeout
    - File: `apps/admissions/tests/unit/usePaymentStatusRefetch.test.ts`.
    - After timeout, call `refetch()`; assert it makes one network call and does not flip `status` to a terminal non-successful state.
    - _Requirements: R14.3_

- [x] 38. Render the UI state matrix in `PaymentStep.tsx` behind `VITE_PAYMENT_HARDENING_UI`
  - The design pins `PaymentStep` as the component that renders one screen per `PaymentUiState` and consumes `next_action` from the backend envelope (R14.4, R14.6, R14.7). Gated behind `VITE_PAYMENT_HARDENING_UI` so the legacy mode is the default until staging soaks (R22.6).
  - _Requirements: R14.1, R14.2, R14.3, R14.4, R14.6, R14.7, R22.6, R22.8_

  - [x] 38.1 Add `VITE_PAYMENT_HARDENING_UI` environment wiring
    - Declare the flag in `apps/admissions/src/vite-env.d.ts` as `readonly VITE_PAYMENT_HARDENING_UI?: 'true' | 'false'`; export an `isPaymentHardeningUiEnabled()` helper from `apps/admissions/src/lib/paymentStatus.ts` that returns `import.meta.env.VITE_PAYMENT_HARDENING_UI === 'true'`.
    - Default `false` at build time; staging deploys set to `true`.
    - _Requirements: R22.6_

  - [x] 38.2 Refactor `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`
    - When `isPaymentHardeningUiEnabled()` is `false`, render the existing component tree verbatim (legacy mode — no behavioural drift, R22.6).
    - When enabled, drive rendering from `derivePaymentUiState({ backendStatus, inflight, stableCode, pollingExceededTimeout })` and a `switch` over `PaymentUiState` with one sub-component per state: `<Idle>`, `<Initiating>`, `<AwaitingProvider>`, `<StillConfirming onManualRecheck={...} onRetry={...}>`, `<Confirmed receipt={...}>`, `<AlreadyPaid payment={...}>`, `<RetryWithDifferentNumber />`, `<Unavailable />`, `<MaxAttemptsReached />`, `<SensitiveFieldsLocked />`, `<RateLimited />`, `<NeedsAdminFollowup />`, `<Expired />`.
    - On initiate success, call `paymentRecoveryStore.record({ application_id, payment_id, reference, method, initiated_at: Date.now() })` (R14.2).
    - On mount, call `paymentRecoveryStore.get(application_id)`; if non-null, skip re-initiation and rehydrate the `pending` state directly to `usePaymentStatus(entry.payment_id)` (R14.2).
    - Render `next_action` guidance copy from `PAYMENT_NEXT_ACTION_COPY` (R14.4).
    - Keep focus-on-state-change (a `ref.current?.focus()` inside a `useEffect` keyed on `uiState`) and the `aria-live="polite"` region for state announcements (R22.8).
    - DO NOT show a new initiate button in `already_paid` (R14.6) — render a receipt-access affordance instead.
    - _Requirements: R14.1, R14.2, R14.3, R14.4, R14.6, R14.7, R22.6, R22.8_

  - [x] 38.3 Component test — each `PaymentUiState` renders the correct affordances
    - File: `apps/admissions/tests/integration/paymentStepUiStateMatrix.test.tsx`.
    - For every `PaymentUiState` value, mount `PaymentStep` with `VITE_PAYMENT_HARDENING_UI=true`, stub the dependencies to produce that state, assert the distinguishing affordance is present (e.g., `still_confirming` shows a "Still confirming…" heading and an enabled manual re-check button; `already_paid` shows a receipt link and no initiate button; `retry_with_different_number` shows the phone-re-entry affordance; `rate_limited` shows a cooldown message).
    - _Requirements: R14.1, R14.3, R14.4, R14.6, R14.7_

  - [x] 38.4 Component test — mount rehydration from `paymentRecoveryStore`
    - File: `apps/admissions/tests/integration/paymentStepRecoveryRehydration.test.tsx`.
    - Seed `localStorage` with a recorded entry; mount `PaymentStep`; assert no re-initiation call is made and `usePaymentStatus(entry.payment_id)` is invoked.
    - _Requirements: R14.2_

- [x] 39. Regression preservation — Phase 4
  - Assert the legacy mode (`VITE_PAYMENT_HARDENING_UI=false`) preserves current behaviour for PaymentStep, auto-save, accessibility, and mobile-money-first UX.
  - _Requirements: R14.2, R22.6, R22.8_

  - [x] 39.1 Regression test — PaymentStep legacy mode unchanged
    - File: `apps/admissions/tests/unit/paymentStepLegacyMode.test.tsx`.
    - With `VITE_PAYMENT_HARDENING_UI=false`, mount `PaymentStep`; assert the existing component tree (mobile-money tab first, card widget second, defer option) renders identically to the pre-Phase-4 snapshot; assert `LencoPay.getPaid` is invoked for the card path.
    - _Requirements: R22.6_

  - [x] 39.2 Regression test — `usePaymentStatus` timeout never produces `failed`
    - File: `apps/admissions/tests/unit/usePaymentStatusNoFailedOnTimeout.test.ts`.
    - Simulate 180s of `pending` responses; assert `status` is never equal to `'failed'` at any tick, and `pollingExceededTimeout` becomes `true` exactly once.
    - _Requirements: R14.3_

  - [x] 39.3 Regression test — settings dirty-state protection preserved
    - File: `apps/admissions/tests/unit/settingsDirtyStatePhase4.test.tsx`.
    - Verify that Phase 4 additions do not import from or mutate `Settings.tsx`; the existing `isDirty` `beforeunload` and navigation guard still fire after a field edit.
    - _Requirements: R22.6_

  - [x] 39.4 Regression test — accessibility: focus-on-state-change, aria-live, ErrorDisplay semantics
    - File: `apps/admissions/tests/unit/paymentStepAccessibilityPhase4.test.tsx`.
    - Render `PaymentStep` through several state transitions; assert `document.activeElement` is the newly rendered primary heading/ref after each transition; assert `aria-live="polite"` region is present and announces the state label; assert `ErrorDisplay` continues to return `null` on empty messages (no empty `role="alert"` regressions).
    - _Requirements: R22.8_

  - [x] 39.5 Regression test — mobile-money tab is the primary tab
    - File: `apps/admissions/tests/unit/paymentStepMobileMoneyFirstPhase4.test.tsx`.
    - With hardening UI enabled, assert the mobile money tab is `[role='tab'][aria-selected='true']` on initial render and the card widget tab is the second tab.
    - _Requirements: R22.6_

- [x] 40. Phase 4 verification block
  - Run the six-command verification sequence and confirm no regressions.
  - _Requirements: R22.6, R22.7_

  - [x] 40.1 Run `cd apps/admissions && bun run type-check`
    - _Requirements: R22.6_

  - [x] 40.2 Run `cd apps/admissions && bun run lint`
    - _Requirements: R22.6_

  - [x] 40.3 Run `cd backend && python3 -m pytest backend/tests/ -k payment`
    - _Requirements: R22.6_

  - [x] 40.4 Run `cd apps/admissions && bun run test -- --run tests/property/payment && cd ../../backend && python3 -m pytest backend/tests/property/ -k payment`
    - _Requirements: R14.1, R14.2, R14.3, R14.6, R14.7, R20.1_

  - [x] 40.5 Run `cd apps/admissions && bun run build`
    - _Requirements: R22.6_

  - [x] 40.6 Run `bun audit`
    - _Requirements: R22.6_

- [x] 41. Phase 4 rollout
  - _Requirements: R14.1, R14.2, R14.3, R14.6, R14.7, R22.6_

  - [ ]* 41.1 Enable `VITE_PAYMENT_HARDENING_UI=true` in Vercel preview + staging, soak 48h
    - Flip the env var in the Vercel staging project; verify behaviour across Chrome, Safari mobile, and Firefox; monitor GlitchTip for any `PaymentStep`-tagged exceptions.
    - _Requirements: R14.1, R14.2, R14.3, R14.6, R14.7_

  - [ ]* 41.2 Verify Phase 4 metrics in GlitchTip
    - Confirm no new frontend exceptions tagged `PaymentStep`, `PaymentForm`, `usePaymentStatus`, or `paymentRecoveryStore`; confirm counter volumes for `payment.initiation.*` match expected baseline (± 10 %).
    - _Requirements: R17.2_

  - [ ]* 41.3 Enable `VITE_PAYMENT_HARDENING_UI=true` in production
    - Flip the env var in the Vercel production project after staging soak passes.
    - _Requirements: R14.1, R14.2, R14.3, R14.6, R14.7_

  - [ ]* 41.4 Document Phase 4 rollback
    - Append a "Phase 4 rollback" subsection to `docs/runbooks/payment-hardening-rollout.md`: set `VITE_PAYMENT_HARDENING_UI=false` in Vercel and trigger a rebuild; recovery store entries are self-clearing via 24-hour TTL so no data cleanup is required.
    - _Requirements: R22.7_

- [x] 42. Checkpoint — Phase 4 complete
  - Ensure all tests pass, ask the user if questions arise. Confirm `paymentRecoveryStore` round-trips through localStorage, `derivePaymentUiState` is deterministic under Property 18, `usePaymentStatus` never produces `failed` on polling timeout, and the hardening UI is enabled in staging.
  - _Requirements: R14.1, R14.2, R14.3, R14.6, R14.7, R22.6_

## Phase 5 — Rate Limiting, Force-Approved Path Cleanup, Dev-Bypass Lockout, Risk-Flag Inspection

- [x] 43. Implement `@require_not_dev_bypass_in_production` decorator and audit emission
  - The design pins `backend/apps/common/dev_bypass.py` as the sole source of dev-bypass lockout logic; every payment view wraps its dispatch handler with this decorator so production traffic can never reach a bypass branch (R16.1, R16.2).
  - _Requirements: R16.1, R16.2, R16.3_

  - [x] 43.1 Create `backend/apps/common/dev_bypass.py`
    - Export `DEV_BYPASS_PARAM_NAMES = frozenset({'dev-bypass', 'dev_bypass', 'DEV_BYPASS_AUTH', 'dev'})` and `DEV_BYPASS_HEADER_NAMES = frozenset({'X-Dev-Bypass-Auth', 'X-Dev-Bypass'})`.
    - Export `is_dev_bypass_attempted(request) -> bool` that scans query params, body (best-effort), and headers for any name in the sets.
    - Export `@require_not_dev_bypass_in_production` decorator for DRF view methods (`def get/post/put/delete(...)` and class-based `dispatch`). Behaviour: if `settings.DEBUG is False` or `settings.DJANGO_ENV == 'production'` AND `is_dev_bypass_attempted(request)`, return `HttpResponse(status=404)` with no body (R16.1).
    - In non-production, when a dev-bypass flag is supplied, emit a `PaymentAuditService.record_payment_event(action='payment.dev_bypass_used', …)` call including caller identity and `request.path` (R16.2). Dev-bypass in non-production does NOT affect routing (R16.1 clause — production lockout is the behaviour constraint).
    - _Requirements: R16.1, R16.2_

  - [x] 43.2 Apply the decorator to every payment view
    - Wrap `PaymentInitiateView.post`, `MobileMoneyInitiateView.post`, `PaymentVerifyView.post`, `LencoWebhookView.post`, and `FeeResolverView.get` (in `backend/apps/documents/views.py`) with `@require_not_dev_bypass_in_production`.
    - Do NOT alter URL routing — the decorator short-circuits at the view layer so the route continues to resolve and returns 404 only when a dev-bypass is attempted under production settings.
    - _Requirements: R16.1_

  - [x] 43.3 Unit test — production routing returns 404 on any dev-bypass vector
    - File: `backend/tests/unit/test_payment_dev_bypass_404_phase5.py` (complements Task 17.3 which asserts the baseline).
    - Parametrise over all five payment views × four bypass vectors; under `override_settings(DEBUG=False, DJANGO_ENV='production')`, assert HTTP 404, empty body, and no Payment row mutation; audit log remains empty (no PII leak into the audit trail for production 404s).
    - _Requirements: R16.1, R16.3_

  - [x] 43.4 Unit test — non-production emits `payment.dev_bypass_used` audit
    - File: `backend/tests/unit/test_payment_dev_bypass_audit.py`.
    - Under `override_settings(DEBUG=True, DJANGO_ENV='development')`, attempt a dev-bypass on each payment view; assert exactly one `payment.dev_bypass_used` audit row is written per attempt; assert `metadata` includes masked actor identity and `request.path`, never raw bypass values.
    - _Requirements: R16.2_

  - [x]* 43.5 Unit test — decorator never mutates non-production routing
    - File: `backend/tests/unit/test_payment_dev_bypass_dev_passthrough.py`.
    - Under `DEBUG=True`, assert that absent a dev-bypass flag the decorated view behaves identically to the undecorated view (response code, envelope shape, side effects).
    - _Requirements: R16.1_

- [x] 44. Configure DRF `ScopedRateThrottle` with per-scope budgets gated on `PAYMENT_HARDENING_RATE_LIMITS`
  - The design pins 6/min for `payment_initiate` + `payment_mobile_money` and 30/min for `payment_verify` + `payment_resolve_fee`; key by authenticated `user_id`; webhook ingress is gated by signature validation, not by DRF throttle (R19.1, R19.2, R19.4).
  - _Requirements: R19.1, R19.2, R19.3, R19.4_

  - [x] 44.1 Declare `PAYMENT_HARDENING_RATE_LIMITS` flag and throttle scopes in `backend/config/settings/base.py`
    - Default `False`; read from env var.
    - Add to `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`: `payment_initiate: 6/min`, `payment_mobile_money: 6/min`, `payment_verify: 30/min`, `payment_resolve_fee: 30/min`.
    - Add a `PaymentUserScopedRateThrottle(ScopedRateThrottle)` subclass in `backend/apps/common/throttling.py` that keys by `request.user.pk` for authenticated requests and `get_ident(request)` for anonymous — matching R19.2 (fall back to IP for unauthenticated endpoints).
    - _Requirements: R19.1, R19.2_

  - [x] 44.2 Wire `throttle_classes` and `throttle_scope` into payment views
    - `PaymentInitiateView`: `throttle_classes = [PaymentUserScopedRateThrottle]; throttle_scope = 'payment_initiate'`.
    - `MobileMoneyInitiateView`: `throttle_scope = 'payment_mobile_money'`.
    - `PaymentVerifyView`: `throttle_scope = 'payment_verify'`.
    - `FeeResolverView`: `throttle_scope = 'payment_resolve_fee'`.
    - `LencoWebhookView`: DO NOT add a throttle class (R19.4 — webhook ingress is gated by signature validation only).
    - Gate the throttle class registration behind `settings.PAYMENT_HARDENING_RATE_LIMITS`: when `False`, fall back to the pre-existing throttle configuration so current behaviour is preserved bit-exact.
    - _Requirements: R19.1, R19.4, R22.6_

  - [x] 44.3 Map 429 responses to the `RATE_LIMITED` stable code
    - In `backend/apps/common/exceptions.py` (or the payment-specific envelope handler), translate DRF `Throttled` exceptions raised under any `payment_*` scope into `{success: false, error: {code: 'RATE_LIMITED', message: '<scope-specific copy>', details: {retry_after: <s>, scope: <scope>}}}` with HTTP 429.
    - Emit `payment.rate_limited` audit (R19.3) with endpoint and user-role labels; increment `payment.rate_limited` counter with `endpoint` and `user_role` tags — no PII.
    - _Requirements: R19.1, R19.3, R15.2_

  - [x] 44.4 Unit test — per-scope rate limit enforcement
    - File: `backend/tests/unit/test_payment_rate_limiting.py`.
    - For each of `payment_initiate`, `payment_mobile_money`, `payment_verify`, `payment_resolve_fee`, issue `budget + 1` requests within 60s as the same authenticated user with `PAYMENT_HARDENING_RATE_LIMITS=True`; assert the `N+1`-th returns 429 + `RATE_LIMITED`; a second authenticated user is unaffected; IP-keyed anonymous hit on `resolve-fee` is independent of user-keyed budget (R19.2).
    - _Requirements: R19.1, R19.2_

  - [x] 44.5 Unit test — webhook is not throttled
    - File: `backend/tests/unit/test_payment_rate_limiting_webhook_exempt.py`.
    - Issue 100 valid-signature webhook POSTs in quick succession; assert none return 429; assert `payment.rate_limited` counter remains unchanged for the webhook scope (R19.4).
    - _Requirements: R19.4_

  - [x] 44.6 Unit test — flag default preserves current behaviour
    - File: `backend/tests/unit/test_payment_rate_limiting_flag_default.py`.
    - With `PAYMENT_HARDENING_RATE_LIMITS=False`, issue 50 requests/min against `PaymentInitiateView`; assert none return 429 (legacy pre-hardening throttle config remains in effect, R22.6).
    - _Requirements: R22.6_

  - [x] 44.7 Unit test — 429 envelope + audit + counter
    - File: `backend/tests/unit/test_payment_rate_limiting_envelope.py`.
    - Assert 429 response carries `{success: false, error: {code: 'RATE_LIMITED', …, details: {retry_after, scope}}}`; exactly one `payment.rate_limited` audit row is written per throttled request; counter is incremented with `endpoint` and `user_role` labels only.
    - _Requirements: R15.2, R19.3_

- [x] 45. Remove the synthetic zero-amount successful Payment path behind `PAYMENT_HARDENING_FORCE_APPROVED`
  - Per design § "Migration and Rollout" Phase 5, the legacy admin verification path that silently creates a synthetic zero-amount `successful` Payment when no prior Payment exists is replaced by `PaymentService.force_approve()` which creates a canonical `force_approved` row (R2.3, R2.4).
  - _Requirements: R2.3, R2.4, R2.5, R2.6, R22.6_

  - [x] 45.1 Declare `PAYMENT_HARDENING_FORCE_APPROVED` flag in `backend/config/settings/base.py`
    - Default `False`; read from env var. When `False`, the legacy synthetic zero-amount path remains callable for backward compatibility (R22.6).
    - _Requirements: R22.6_

  - [x] 45.2 Gate `ApplicationReviewView` admin verification path on the flag
    - In `backend/apps/applications/admin_views.py`, when `settings.PAYMENT_HARDENING_FORCE_APPROVED is True` and the admin submits a verification for an application with no prior Payment, delegate exclusively to `PaymentService.force_approve(application_id, actor_id, actor_role, reason)` (R2.3) and return the resulting `TransitionResult` through the standard envelope.
    - When `False`, preserve the existing synthetic zero-amount successful-Payment branch — guarded with a `# LEGACY:` comment block referencing this task.
    - In both modes, when a `successful` Payment already exists, return 409 + `CANNOT_REVERSE_SUCCESSFUL_PAYMENT` (R2.1, R2.2) — this guard is independent of the flag and was added in Phase 2.
    - _Requirements: R2.3, R2.4, R22.6_

  - [x] 45.3 Unit test — force-approved path creates canonical ledger row
    - File: `backend/tests/unit/test_application_review_force_approved.py`.
    - With `PAYMENT_HARDENING_FORCE_APPROVED=True`, submit an admin verification for an application with no prior Payment; assert a Payment row is created with status `force_approved` (not `successful`), `metadata.override=true`, `reviewed_by`/`reviewed_at`/`reason`/`actor_role` populated, an `Audit_Event` of type `payment.force_approved` is written, and a Receipt carries the "Administrative Override" label.
    - _Requirements: R2.3, R2.4, R2.6_

  - [x] 45.4 Unit test — reason < 10 chars rejected with `OVERRIDE_REASON_REQUIRED`
    - File: `backend/tests/unit/test_application_review_force_approved.py` (extend).
    - Submit the admin verification with `reason = 'ok'`; assert 400 + `OVERRIDE_REASON_REQUIRED` and no Payment row is created.
    - _Requirements: R2.5_

  - [x] 45.5 Unit test — legacy synthetic path preserved when flag is off
    - File: `backend/tests/unit/test_application_review_force_approved_legacy.py`.
    - With `PAYMENT_HARDENING_FORCE_APPROVED=False`, submit the admin verification; assert the legacy synthetic zero-amount `successful` Payment is created exactly as before (behavioural bit-parity, R22.6).
    - _Requirements: R22.6_

- [x] 46. Build the `SuperAdminPaymentCorrectionView` correction endpoint
  - The design pins `POST /api/v1/payments/{id}/correct/` as the Super_Admin_Correction_Path (R1.5, R2.5 extended to super-admins). Reason ≥ 10 chars; audit before transition; super-admin-only (R17.5 analogue).
  - _Requirements: R2.5, R2.6, R17.1_

  - [x] 46.1 Create `SuperAdminPaymentCorrectionView` in `backend/apps/documents/views.py`
    - Route: `POST /api/v1/payments/<uuid:payment_id>/correct/` — the path does not conflict with existing `/api/v1/payments/<id>/verify/` (verify is its own segment).
    - Permission: `IsAuthenticated` + custom `IsSuperAdmin` checker (actor role must equal `super_admin`).
    - Serializer: `{target_status: CanonicalStatus, reason: str (≥ 10 chars)}`. Reject with 400 + `OVERRIDE_REASON_REQUIRED` on short reason.
    - Delegate to `PaymentService.super_admin_correct(payment_id, target_status, actor_id, reason)`; audit is emitted **before** the transition persists (R1.5).
    - Apply `@require_not_dev_bypass_in_production` and `PaymentUserScopedRateThrottle` with new scope `payment_correct` at `3/min`.
    - Register in `backend/apps/documents/urls.py` alongside the existing verify route.
    - _Requirements: R2.5, R2.6, R17.1_

  - [x] 46.2 Unit test — super-admin-only access
    - File: `backend/tests/unit/test_super_admin_payment_correction.py`.
    - For actors with roles `student`, `reviewer`, `admin`, assert 403 + `NOT_OWNER`-style envelope; for `super_admin`, assert 200 + transition applied.
    - _Requirements: R2.5_

  - [x] 46.3 Unit test — reason guard and audit ordering
    - File: `backend/tests/unit/test_super_admin_payment_correction.py` (extend).
    - Reason < 10 chars → 400 + `OVERRIDE_REASON_REQUIRED`, no audit written; reason ≥ 10 chars → audit row persisted **before** the Payment mutation (assert via `created_at` ordering and `transaction.on_commit` hooks).
    - _Requirements: R2.5, R2.6_

  - [x] 46.4 Unit test — route does not conflict with `/verify/`
    - File: `backend/tests/unit/test_super_admin_payment_correction_routing.py`.
    - Resolve `/api/v1/payments/<uuid>/verify/` → `PaymentVerifyView`; resolve `/api/v1/payments/<uuid>/correct/` → `SuperAdminPaymentCorrectionView`; assert neither path collides with the other.
    - _Requirements: R22.6_

- [x] 47. Build the super-admin-only risk-flag inspection endpoint in `risk_views.py`
  - The design pins `GET /api/v1/payments/risk-flags/` (in new `backend/apps/documents/risk_views.py`) as a super-admin-only, paginated, filterable risk-flag review endpoint (R17.5).
  - _Requirements: R17.1, R17.2, R17.5_

  - [x] 47.1 Create `backend/apps/documents/risk_views.py`
    - `RiskFlagsListView(GenericAPIView)`: `GET /api/v1/payments/risk-flags/`.
    - Permission: `IsAuthenticated` + `IsSuperAdmin`.
    - Query params: `type` (one of `amount_mismatch`, `currency_mismatch`, `invalid_amount`, `missing_provider_reference`), `since` (ISO8601), `until` (ISO8601), `page` (int ≥ 1), `page_size` (int 1–100, default 25).
    - Response envelope: `{success: true, data: {page, pageSize, totalCount, results: [{payment_id, application_id, type, details, recorded_at}]}}` per the platform envelope convention.
    - Query source: scan `Payment.metadata.risk_flags` via `jsonb_array_elements` filtered by type and `recorded_at` range; results ordered by `recorded_at DESC`.
    - Apply `@require_not_dev_bypass_in_production`; apply `PaymentUserScopedRateThrottle` scope `payment_risk_flags` at `30/min`.
    - Redact PII from `details` (reuse `PaymentAuditService._redact_pii` on the details dict before serialisation).
    - _Requirements: R17.1, R17.5_

  - [x] 47.2 Register the URL in `backend/apps/documents/urls.py`
    - Add `path('risk-flags/', RiskFlagsListView.as_view(), name='payment-risk-flags')` under the existing `/api/v1/payments/` prefix.
    - _Requirements: R17.5_

  - [x] 47.3 Unit test — permission matrix
    - File: `backend/tests/unit/test_payment_risk_flags_endpoint.py`.
    - For actors `student`, `reviewer`, `admin`, assert 403; for `super_admin`, assert 200 + envelope shape; unauthenticated returns 401.
    - _Requirements: R17.5_

  - [x] 47.4 Unit test — filtering by type and date range
    - File: `backend/tests/unit/test_payment_risk_flags_endpoint.py` (extend).
    - Seed 3 payments with mixed risk flags; query `?type=amount_mismatch&since=...&until=...`; assert only matching rows are returned, ordered by `recorded_at DESC`, paginated at `page_size=25`.
    - _Requirements: R17.5_

  - [x]* 47.5 Unit test — details PII redaction
    - File: `backend/tests/unit/test_payment_risk_flags_endpoint.py` (extend).
    - Seed a risk flag with a synthetic phone number in `details.raw_payload`; assert the rendered response contains only `phone_hash` / `phone_last4` (no plaintext phone leak).
    - _Requirements: R17.4_

- [x] 48. Add the dev-bypass lockout assertion tests per `require_not_dev_bypass_in_production` surface
  - Extend Phase 5 coverage to assert the decorator correctly guards every new Phase 5 endpoint (`SuperAdminPaymentCorrectionView`, `RiskFlagsListView`) in addition to the existing payment views.
  - _Requirements: R16.1, R16.3_

  - [x] 48.1 Unit test — new Phase 5 endpoints return 404 on dev-bypass under production
    - File: `backend/tests/unit/test_phase5_endpoints_dev_bypass_404.py`.
    - Parametrise over `SuperAdminPaymentCorrectionView` and `RiskFlagsListView` × four bypass vectors; under `override_settings(DEBUG=False, DJANGO_ENV='production')`, assert HTTP 404 and empty body.
    - _Requirements: R16.1, R16.3_

- [x] 49. Regression preservation — Phase 5
  - Assert each Phase 5 flag defaults preserve current behaviour; dev-bypass lockout never affects production routing (always 404); `SuperAdminPaymentCorrectionView` route is non-conflicting.
  - _Requirements: R2.3, R16.1, R19.1, R22.6_

  - [x] 49.1 Regression test — rate-limit flag default preserves current behaviour
    - File: `backend/tests/unit/test_payment_rate_limiting_flag_default.py` (already in Task 44.6 — this sub-task asserts the additional cross-phase case).
    - With all Phase 5 flags `False`, run Phase 2–3 suites; assert no new 429s and no stable-code behaviour drift.
    - _Requirements: R19.1, R22.6_

  - [x] 49.2 Regression test — legacy synthetic admin verification preserved when `PAYMENT_HARDENING_FORCE_APPROVED=False`
    - File: `backend/tests/unit/test_application_review_force_approved_legacy.py` (complements Task 45.5).
    - Confirm behavioural bit-parity: same HTTP status, same envelope, same Payment row shape, same Application.payment_status write, same audit volume as pre-Phase-5.
    - _Requirements: R22.6_

  - [x] 49.3 Regression test — dev-bypass lockout never alters non-production behaviour absent a bypass flag
    - File: `backend/tests/unit/test_payment_dev_bypass_dev_passthrough_phase5.py`.
    - Under `DEBUG=True, DJANGO_ENV='development'`, and without any dev-bypass vector in the request, assert all Phase 5 endpoints behave identically to pre-Phase-5 for legitimate calls (response code, envelope, side effects).
    - _Requirements: R16.1, R22.6_

  - [x] 49.4 Regression test — `SuperAdminPaymentCorrectionView` path is non-conflicting
    - File: `backend/tests/unit/test_super_admin_payment_correction_routing.py` (complements Task 46.4).
    - Assert `/api/v1/payments/<uuid>/verify/` continues to resolve to `PaymentVerifyView`; `/api/v1/payments/<uuid>/correct/` resolves to `SuperAdminPaymentCorrectionView`; existing admin review endpoint `/api/v1/applications/<uuid>/review/` is untouched.
    - _Requirements: R22.6_

- [x] 50. Phase 5 verification block
  - Run the six-command verification sequence and confirm no regressions.
  - _Requirements: R22.6, R22.7_

  - [x] 50.1 Run `cd apps/admissions && bun run type-check`
    - _Requirements: R22.6_

  - [x] 50.2 Run `cd apps/admissions && bun run lint`
    - _Requirements: R22.6_

  - [x] 50.3 Run `cd backend && python3 -m pytest backend/tests/ -k payment`
    - _Requirements: R22.6_

  - [x] 50.4 Run `cd backend && python3 -m pytest backend/tests/property/ -k payment`
    - _Requirements: R20.1, R20.2, R20.3, R20.4, R20.5, R20.6, R20.7, R20.8, R20.9, R20.10, R20.11, R20.12, R21.2, R21.4_

  - [x] 50.5 Run `cd apps/admissions && bun run build`
    - _Requirements: R22.6_

  - [x] 50.6 Run `bun audit`
    - _Requirements: R22.6_

- [ ] 51. Phase 5 rollout
  - _Requirements: R2.3, R16.1, R19.1, R22.6_

  - [ ]* 51.1 Enable `PAYMENT_HARDENING_RATE_LIMITS=True`, `PAYMENT_HARDENING_FORCE_APPROVED=True` in staging, soak 48h
    - Flip both flags in Koyeb staging; monitor `payment.rate_limited`, `payment.force_approved`, `payment.super_admin_corrected`, and `payment.dev_bypass_used` counters for 48 hours; verify no student-facing disruption.
    - _Requirements: R2.3, R19.1_

  - [ ]* 51.2 Verify Phase 5 metrics in GlitchTip
    - Confirm no new GlitchTip errors tagged `domain=payment`, `risk_flags`, `force_approved`, or `rate_limited`; confirm counter volumes for the new Phase 5 counters are within expected baseline.
    - _Requirements: R17.2_

  - [ ]* 51.3 Enable `PAYMENT_HARDENING_RATE_LIMITS=True`, `PAYMENT_HARDENING_FORCE_APPROVED=True` in production
    - Flip both flags in Koyeb production after staging soak passes.
    - _Requirements: R2.3, R19.1_

  - [ ]* 51.4 Document Phase 5 rollback
    - Append a "Phase 5 rollback" subsection to `docs/runbooks/payment-hardening-rollout.md`: set both flags to `False` and redeploy; `SuperAdminPaymentCorrectionView` and `RiskFlagsListView` remain registered but are no longer load-bearing; dev-bypass lockout continues to apply because it is code-level, not flag-level (R16.1).
    - _Requirements: R22.7_

- [x] 52. Documentation updates after Phase 5
  - _Requirements: R22.5, R22.6, R22.7_

  - [x] 52.1 Update `.kiro/steering/tech.md`
    - Add the new Phase 4/5 modules to the Lenco Payment Integration table: `paymentRecoveryStore` (`apps/admissions/src/stores/paymentRecoveryStore.ts`), `paymentErrorCodes.ts`, `paymentNextActions.ts`, `zambianMsisdn.ts`, `derivePaymentUiState` (in `paymentStatus.ts`), `SuperAdminPaymentCorrectionView` (`POST /api/v1/payments/{id}/correct/` — reference the new route), `RiskFlagsListView` (`GET /api/v1/payments/risk-flags/`), and `backend/apps/common/dev_bypass.py`.
    - Document all five Phase feature flags (`PAYMENT_HARDENING_FORWARD_ONLY`, `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT`, `PAYMENT_HARDENING_RATE_LIMITS`, `PAYMENT_HARDENING_FORCE_APPROVED`, `VITE_PAYMENT_HARDENING_UI`) in the Conventions For New Code → Backend section.
    - Note that Phases 1–5 of payment hardening are complete.
    - _Requirements: R22.5, R22.6_

  - [x] 52.2 Update `.kiro/steering/structure.md`
    - Append a "Files Added During Payment Hardening Phases 4–5" subsection listing: `apps/admissions/src/stores/paymentRecoveryStore.ts`, `apps/admissions/src/lib/paymentErrorCodes.ts`, `apps/admissions/src/lib/paymentNextActions.ts`, `apps/admissions/src/lib/zambianMsisdn.ts`, `backend/apps/common/dev_bypass.py`, `backend/apps/common/throttling.py`, `backend/apps/documents/risk_views.py`, plus the new test files under `apps/admissions/tests/property/` and `backend/tests/unit/`.
    - Note that Phases 1–5 of payment hardening are complete.
    - _Requirements: R22.6_

  - [x] 52.3 Update `docs/runbooks/payment-hardening-rollout.md`
    - Ensure all five per-phase rollback subsections are present and consistent; add a "Phases 1–5 complete" summary at the top with enable/disable matrix for all five flags; document the order of rollback (flags flip back in reverse phase order) and confirm schema additions are safe to leave in place on any rollback.
    - _Requirements: R22.6, R22.7_

- [x] 53. Final checkpoint — Phase 5 complete, payment hardening fully shipped
  - Ensure all tests pass, ask the user if questions arise. Confirm all five phases (schema + snapshot backfill, forward-only state machine, webhook dedup + stable codes, frontend recovery store + UI state matrix, rate limiting + force-approved + dev-bypass + risk-flag inspection) are independently shippable via feature flags; every requirement R1–R22 is exercised by at least one task; every correctness property P1–P23 is exercised by at least one enforcement PBT; the Lenco widget integration, `{success, data}` envelope, route paths, mobile-money-first UX, auto-save behaviour, and accessibility semantics are preserved across all five phases.
  - _Requirements: R1.7, R2.3, R8.5, R14.1, R16.1, R19.1, R22.6_

## Notes

- Tasks marked with `*` are optional (operational rollout steps — staging soak, prod enable, metrics verification, rollback documentation drills — or test scaffolds that can be deferred for a faster MVP). Core implementation tasks and the enforcement property-based tests that validate each shipped behaviour are never marked optional.
- Every parent task and independently verifiable sub-task ends with a `_Requirements: R#.#_` line so traceability is preserved; every requirement R1–R22 appears in at least one reference across this plan, including the Phase 4 additions (R14.1–R14.7, R15.1–R15.5, R22.8) and Phase 5 additions (R2.3–R2.6, R16.1–R16.3, R17.1, R17.2, R17.5, R19.1–R19.4).
- Every correctness property P1–P23 from the design is exercised in at least one enforcement PBT: P1–P2, P5, P10–P19, P23 in Phase 2 (Tasks 16 and 17); P3–P4, P6–P9, P17, P20–P22 in Phase 3 (Task 24); P16 (frontend half) and P18 (UI state matrix determinism) in Phase 4 (Tasks 32.2 and 35).
- Phases 1–5 are self-contained and independently shippable via feature flags: Phase 1 is schema-only (preflight + rollback SQL); Phase 2 is gated on `PAYMENT_HARDENING_FORWARD_ONLY`; Phase 3 is gated on `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` with schema backing from Phase 1; Phase 4 is gated on the Vercel build-time `VITE_PAYMENT_HARDENING_UI` flag (default `false`, legacy PaymentStep preserved bit-exact); Phase 5 is gated on `PAYMENT_HARDENING_RATE_LIMITS` and `PAYMENT_HARDENING_FORCE_APPROVED` (dev-bypass lockout is code-level and always in effect in production per R16.1).
- Each phase ends with the same six-command verification sequence (`bun run type-check`, `bun run lint`, backend pytest, property pytest, `bun run build`, `bun audit`) so regressions surface before flag rollout.
- At the completion of Phase 5, `.kiro/steering/tech.md`, `.kiro/steering/structure.md`, and `docs/runbooks/payment-hardening-rollout.md` are updated to reflect all five phases complete, and the `SuperAdminPaymentCorrectionView` route (`POST /api/v1/payments/{id}/correct/`) is registered alongside the existing `/verify/` route without conflict.
