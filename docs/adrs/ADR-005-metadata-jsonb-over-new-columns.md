# ADR-005: `metadata` JSONB Over New Columns For Snapshot, Risk Flags, And Override Fields

Status: Accepted
Date: 2026-05-09
Related spec: .kiro/specs/payment-hardening/
Requirements satisfied: R22.7

## Context

Phase 2 needs to persist several new pieces of structured information on each Payment row: the fee snapshot captured at initiate (`expected_amount`, `currency`, `residency_category`, `program_code`, `intake_id`, `waiver_applied`, `original_amount`, `fee_source`), the provider-initiation record (`status`, `operator`, `phone_hash`, `phone_last4`, `provider_data`, `error`, `updated_at`), an append-only list of risk flags, the settlement record from `collection.settled` webhooks, and the override fields (`override`, `reviewed_by`, `reviewed_at`, `reason`, `actor_role`) used by `force_approved` and super-admin corrections.

The `payments` table is `managed = False` in Django, which means schema changes do not go through Django migrations. They are applied via SQL scripts under `backend/scripts/` with preflight and rollback pairs, against the live Neon database. Neon MCP inspection confirmed the live `payments` row is already 19 columns wide, and the existing `metadata` column is a nullable `jsonb`. Adding half a dozen new typed columns would require one preflight-rollback pair per column, plus coordinated frontend work to read them, plus ongoing migration of historical rows that do not have the new columns filled in.

## Decision

No new physical columns are added to `payments` for Phase 2. The new structured data lives inside the existing `metadata` jsonb column under well-known keys: `snapshot`, `provider_initiation`, `risk_flags`, `settlement`, and the override fields (`override`, `reviewed_by`, `reviewed_at`, `reason`, `actor_role`, `provider_event_id`, `lenco_response`). The shape of the jsonb document is documented in `design.md` under "Data Models" and validated at the service layer by `PaymentService` before write.

Uniqueness constraints where they are needed (receipt number, transaction reference, active payment per application) are enforced by partial unique indexes added with `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS`. These are cheap, non-blocking, and idempotent. They do not add columns.

Hypothesis-driven property tests in `backend/tests/property/` generate realistic metadata payloads and assert round-trip read/write, append-only behaviour for `risk_flags`, and immutability of `snapshot` after first write.

## Consequences

Positive: no column-addition migrations against a `managed = False` production table. Rollback is trivial because nothing about the column set changed. Existing legacy Payment rows remain fully readable because their `metadata` is either empty or already carries legacy fields. The snapshot-backfill script populates missing snapshots where the application and fee data still exist, and logs a warning otherwise.

Negative: jsonb reads are slightly more verbose in Python and SQL than typed column reads, and jsonb fields do not participate in column-level constraints. The service layer compensates by validating the shape on write.

Operational: ad-hoc analytics queries that need one of the new fields use `metadata -> 'snapshot' ->> 'expected_amount'` style expressions. Where a field is queried often enough to matter, a jsonb functional index is added (the webhook dedup `provider_event_id` index is the existing precedent).
