# ADR-003: Reuse `audit_logs` For Payment Corrections — No New `payment_corrections` Table

Status: Accepted
Date: 2026-05-09
Related spec: .kiro/specs/payment-hardening/
Requirements satisfied: R17.1

## Context

Phase 2 introduces three new classes of payment event that need governance-grade history: admin `force_approved` overrides, super-admin corrections of terminal Payments, and risk flags raised by the verify / webhook paths (amount mismatch, currency mismatch, missing provider reference, and similar). An obvious option was to add a dedicated `payment_corrections` table, with its own actor columns, reason column, retention policy, and indexes.

Inspection of the live Neon schema shows that the existing `audit_logs` table already covers the surface area. It has `entity_type`, `entity_id`, `action`, `changes` jsonb, `actor_id`, `retention_category` with a 365-day security tier, `ip_address_encrypted` / `user_agent_encrypted` for compliance, and the partial index `idx_audit_logs_payment_entity_created_at` on `(entity_type, entity_id, created_at DESC) WHERE entity_type = 'payment'`, which is specifically tuned for payment audit reads. Adding a parallel `payment_corrections` table would duplicate the actor schema, the retention machinery, the encrypted network context columns, and the index, without delivering any capability that `audit_logs` does not already deliver.

## Decision

Payment corrections, force-approved overrides, and risk-flag history all reuse `audit_logs` with `entity_type = 'payment'` and `entity_id = payment.id`. Writes go through a thin `PaymentAuditService` wrapper so callers do not need to know the exact shape of the `changes` jsonb payload.

Risk flags are also denormalised into `payments.metadata.risk_flags` for fast inline reads from the verify and review paths; the authoritative, queryable, retention-governed copy is the `audit_logs` row written in the same transaction. Super-admin corrections are written with `retention_category = 'security'` so they fall under the 365-day retention tier rather than the 90-day default. Standard overrides use the default retention tier.

No new `payment_corrections` table is created. The snapshot-backfill script does not emit audit rows for historical overrides; a marker row with `action = 'payment.backfill'` is sufficient.

## Consequences

Positive: all payment audit flows go through one table, one retention policy, one set of indexes, and one permission model. `PaymentAuditService` is a thin wrapper, not a new subsystem. The governance story for payments inherits the existing audit-log governance story rather than forking it.

Negative: the `changes` jsonb payload now carries payment-specific keys (`risk_flag_type`, `override`, `actor_role`, `reason`, `previous_status`, `target_status`). These are documented in `PaymentAuditService` and validated by unit tests.

Operational: audit reads for a specific Payment use the existing partial index `idx_audit_logs_payment_entity_created_at`, so performance is predictable even as the table grows. Risk-flag reads for display inside the review panel hit `payments.metadata.risk_flags` and never require a cross-table join.
