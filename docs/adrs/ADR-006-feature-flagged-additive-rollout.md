# ADR-006: Feature-Flagged, Additive Rollout

Status: Accepted
Date: 2026-05-09
Related spec: .kiro/specs/payment-hardening/
Requirements satisfied: R12.6, R12.7

## Context

Phase 2 of the payment hardening touches the production money flow: initiate, verify, webhook, reconciliation, admin override, and super-admin correction. A monolithic flip that turned on forward-only transitions, stricter webhook dedup, per-user rate limits, the distinct `force_approved` ledger status, and the new wizard UI all at once would leave no safe way to stop a regression partway through the release. At the same time, the schema changes (partial unique indexes on `payments`, webhook identity uniqueness, user-status index) need to be rehearsed against a realistic data volume before touching `main`.

We need independently-toggleable phases, an always-additive schema path with explicit rollback, and a rehearsal environment that mirrors production data shape.

## Decision

Rollout is split into five independently-gated phases, controlled by environment flags:

| Flag | Scope | Gates |
|------|-------|-------|
| `PAYMENT_HARDENING_FORWARD_ONLY` | Backend | The `_transition()` forward-only guard and the sole-authority test |
| `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` | Backend | Canonical-JSON dedup and the `WebhookEventIdentity` primitive |
| `PAYMENT_HARDENING_RATE_LIMITS` | Backend | Per-user scope on authenticated payment views |
| `PAYMENT_HARDENING_FORCE_APPROVED` | Backend | `force_approved` as a distinct ledger status on the override paths |
| `VITE_PAYMENT_HARDENING_UI` | Frontend (Vercel build-time) | The new PaymentStep UI state matrix, stable error codes, and recovery store |

Each flag can be flipped independently in minutes via the platform environment without a redeploy on the backend, and via a Vercel env change plus a build on the frontend. Schema changes are always additive: every new index is added with `CREATE ... CONCURRENTLY IF NOT EXISTS`, every matching rollback uses `DROP ... CONCURRENTLY IF EXISTS`, and every preflight query is a read-only `SELECT` that aborts the deploy on duplicates. Neon branches are used to rehearse the schema steps (`backend/scripts/payment_hardening_*.sql`) against a cloned dataset before the script is run on the default branch.

## Consequences

Positive: any single phase can be rolled back in minutes by flipping a flag. Rollback does not require a code revert, a database migration, or coordinated frontend and backend deploys. The snapshot-backfill script is purely additive inside `metadata` jsonb, so even the one-shot data fill has no reverse schema requirement.

Negative: five flags means five combinations to reason about during the rollout window. The test matrix explicitly covers all five flags on and all five off, plus the four "one flag flipped" partial states. Flags are removed once the phase has been stable in production for an agreed window.

Operational: the runbook under `docs/runbooks/` records the flip order, the observability signals to watch after each flip, and the specific rollback command for each phase. Neon branching is the rehearsal primitive for schema changes, so the first run of a SQL script against `main` is never the first run ever.
