# ADR-001: Payment Is The Source Of Truth; `applications.payment_status` Is Derived

Status: Accepted
Date: 2026-05-09
Related spec: .kiro/specs/payment-hardening/
Requirements satisfied: R1.1, R1.6

## Context

The `applications.payment_status` column has historically been written from multiple code paths — `ApplicationReviewView`, inline submission helpers, and the legacy payment verify path. Each path encoded its own idea of what a "paid" application looked like, and the column drifted away from the canonical `payments` ledger. Drift produced two observable bugs in production: applications marked `paid` on the application row with no matching Payment in `successful` / `force_approved`, and the reverse case where a verified Payment never flipped the application summary. Because the ledger and the summary are both read by reviewers, admins, and students, the inconsistency was user-visible and audit-visible.

The Phase 2 hardening work wants one canonical place where money state lives, and a mechanical, transaction-scoped way to keep the application summary in sync with it.

## Decision

`payments.status` is the single canonical record of payment state. `applications.payment_status` is a **derived summary** that is written exclusively by `PaymentService._update_application_payment_status()` in the same database transaction as the Payment mutation that caused the change.

The derivation mapping is:

| `payments.status` | `applications.payment_status` |
|-------------------|-------------------------------|
| `successful` | `verified` |
| `force_approved` | `verified` |
| `failed` | `failed` |
| `expired` | `not_paid` |
| `deferred` | `deferred` |
| `pending` | `pending_review` |

No other code path is permitted to write `applications.payment_status`. Admin review flows call `PaymentService.force_approve()` instead of updating the application row directly.

## Consequences

Positive: reviewers and students see a single consistent story across the ledger and the application summary. Reconciliation, reporting, and audit queries can trust `payments.status` as the source of truth. The `normalizePaymentStatus` helper on the frontend continues to map the legacy `verified` / `paid` values on `applications.payment_status` to the student-facing verified state, so the UI contract is preserved during the rollout.

Negative: admin code that previously flipped `applications.payment_status` inline must now go through the service. This is a small migration inside `backend/apps/applications/admin_views.py`.

Operational: the grep regression test `backend/tests/unit/test_payment_service_sole_authority.py` (see ADR-007) fails the build if any code outside `PaymentService` writes `payments.status` or `applications.payment_status`. This turns ADR-001 into an enforced invariant, not an aspiration.
