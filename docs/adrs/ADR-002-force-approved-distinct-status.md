# ADR-002: `force_approved` Is A Distinct Ledger Status, Not A Flavour Of `successful`

Status: Accepted
Date: 2026-05-09
Related spec: .kiro/specs/payment-hardening/
Requirements satisfied: R2.3, R2.4

## Context

Before Phase 2, admin overrides were recorded by creating a zero-amount Payment row in `successful` status, or by flipping an existing row to `successful` without a provider event. This made overrides indistinguishable from provider-verified payments in analytics, audit logs, and financial reporting. Finance could not answer "how much cash did Lenco actually collect last month" without out-of-band knowledge, and audit reviewers could not tell a real payment from an override without reading free-text notes.

At the same time, the student-facing UX does not need to distinguish the two. A student whose fee was waived or paid offline should see the same "payment verified" affordance as a student who paid through Lenco. The distinction only matters to backend reasoning, finance, and audit.

## Decision

`force_approved` is a first-class ledger status on `payments.status`, alongside `pending`, `deferred`, `successful`, `failed`, and `expired`. Admin override flows (`PaymentService.force_approve()` and `PaymentService.super_admin_correct()` when the target is an override) transition the Payment row to `force_approved` and write the following fields into `metadata`: `override: true`, `reviewed_by`, `reviewed_at`, `reason` (≥ 10 characters), and `actor_role`.

For student-facing reads, `normalizePaymentStatus` continues to map both `successful` and `force_approved` to the single `verified` UI state. Receipts rendered for `force_approved` Payments carry a visible "Administrative Override" label and the redacted reason so the override is self-documenting in downstream artefacts.

Property 2 (terminal stability) in the PBT harness treats `force_approved` as terminal: no webhook, verify, reconciliation, or admin override can transition a `force_approved` Payment to any other status. Only a super-admin correction can, and only with a reason and a full audit trail.

## Consequences

Positive: finance queries can cleanly separate cash-in (`successful`) from overrides (`force_approved`) by filtering on `payments.status`. Audit reviewers see overrides as a distinct class of event with actor, reason, and timestamp attached. The student UX is unchanged because `normalizePaymentStatus` collapses both to `verified`.

Negative: any analytics query that previously grouped by `status = 'successful'` to mean "paid application" must be updated to include `force_approved`. The `_RESOLVED_PAYMENT_STATUSES` tuple used by the review gate already reflects this.

Operational: migration data that was historically recorded as zero-amount `successful` Payments is not retroactively relabelled. The snapshot-backfill script flags them for manual review. New overrides created after Phase 2 go out is enabled always use `force_approved`.
