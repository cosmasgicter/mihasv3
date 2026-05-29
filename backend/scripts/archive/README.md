# Archived SQL Scripts

Scripts referenced by the April 2026 audit (SSP-008 through SSP-014,
BUG-016, R-001) that were applied directly to production via Neon SQL
console and never committed to the repository.

## Present in This Directory

| Script | Purpose | Status |
|--------|---------|--------|
| `add_missing_payment_columns.sql` | Added payment columns to applications table (redundant with lenco_payment_integration.sql) | Archived (R-001) |

## Never Committed — Confirmed Non-Recoverable

The following scripts were executed against production Neon but were never
committed to git (verified via `git rev-list --all` search on 2026-05-27).
Their effects are captured in `backend/scripts/00_full_schema.sql` which
represents the canonical production schema.

| Script | Purpose | Audit Finding |
|--------|---------|---------------|
| `lenco_payment_integration.sql` | `program_fees`, `webhook_event_logs` tables, `payments` columns, `applications.payment_status` default | SSP-008 |
| `business_logic_densification.sql` | `application_conditions`, `communication_templates`, `academic_calendar_events`, `fee_waivers`, `application_amendments` tables + indexes + seed data | SSP-009 |
| `add_audit_log_encrypted_network_context.sql` | `encrypted_network_context` column on `audit_logs` | SSP-010 |
| `drop_program_fee_full_unique.sql` | Dropped overly-strict unique constraint on `program_fees` | SSP-011 |
| `add_outbox_events.sql` | `outbox_events` table | SSP-012 |
| `create_error_logs_table.sql` | `error_logs` table (now deprecated — GlitchTip replaced it) | SSP-013 |
| `idempotency_redesign.sql` | Recreated `idempotency_keys` table with new schema (BUG-016: contained unguarded `DROP TABLE`) | BUG-016 |

## Resolution

- **SSP-008 through SSP-014**: No action needed — scripts don't exist on disk.
  Their schema effects are already in production and documented in
  `00_full_schema.sql`.
- **BUG-016 (idempotency_redesign.sql)**: Risk is moot — the file was never
  committed, so it cannot be accidentally re-run from the repo. The
  `idempotency_keys` table is in its final schema state in production.
- **R-001 (add_missing_payment_columns.sql)**: Archived here for reference.

## Active Scripts

Active scripts remain in `backend/scripts/`. See that directory for scripts
that are still relevant for schema verification, seeding, or pending
migrations.
