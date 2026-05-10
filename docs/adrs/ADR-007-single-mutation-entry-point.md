# ADR-007: `PaymentService._transition()` Is The Sole Mutation Entry Point

Status: Accepted
Date: 2026-05-09
Related spec: .kiro/specs/payment-hardening/
Requirements satisfied: R1.7

## Context

Previous payment incidents traced back to `UPDATE payments SET status = ...` writes issued outside `PaymentService`. A reviewer view updated the row inline, a webhook path wrote directly without acquiring a row lock, and a one-off data fix script set a status without emitting an audit row. Each write was correct in isolation, but together they made it impossible to reason about the set of legal transitions, the set of locks held, or the set of audit events emitted. The `ApplicationReviewView` code path and the legacy verify code path were the two biggest offenders.

For Phase 2 to deliver forward-only semantics, transaction-scoped audit emission, and the derived-summary guarantee in ADR-001, the set of writes must be narrow enough that each one can be read and reviewed.

## Decision

Every mutation of `payments.status` goes through `PaymentService._transition(payment, target_status, *, source, actor, reason=None, provider_data=None)`. The method acquires `SELECT FOR UPDATE` on the Payment row, validates the transition against the state machine declared in `design.md`, writes the audit event via `PaymentAuditService`, and updates `applications.payment_status` via `_update_application_payment_status()` in the same transaction. The public entry points (`initiate`, `initiate_mobile_money`, `verify`, `apply_webhook_event`, `force_approve`, `super_admin_correct`, `expire_stale`, `mark_provider_initiation`) are the only callers of `_transition()`, and they are the only callers permitted to mutate Payment rows.

A CI-time regression test at `backend/tests/unit/test_payment_service_sole_authority.py` uses a grep-based check over the backend source tree. It fails the build if it finds any `UPDATE payments SET status` outside `backend/apps/documents/payment_service.py`, or any ORM write to `Payment.status` outside `_transition()`. The same test covers writes to `applications.payment_status` outside `PaymentService._update_application_payment_status()`.

## Consequences

Positive: the set of legal payment transitions is defined in exactly one place, and the audit-and-summary invariants are enforced by construction rather than convention. Callers state their intent through the public methods (`force_approve`, `verify`, `apply_webhook_event`), and the service decides whether the transition is legal, what to audit, and how to update the derived summary.

Negative: one extra CI second for the grep regression test, and one extra indirection for callers that used to write Payment rows inline. Both are cheap.

Operational: the grep test is a safety net, not a substitute for code review. New service methods that need to mutate Payment rows add themselves to the allow-list inside `_transition()` rather than bypassing it. Data-fix scripts, when they are unavoidable, import `PaymentService` and call the appropriate public method so they inherit the audit and locking behaviour. The test failure message points the author at this ADR.
