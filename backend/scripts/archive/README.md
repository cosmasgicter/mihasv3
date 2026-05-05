# Archived SQL Scripts

These SQL scripts have been **fully applied to production** and are kept here for historical reference only. They should **not** be re-run against any environment.

## Archived Scripts

| Script | Purpose | Applied |
|--------|---------|---------|
| `add_missing_payment_columns.sql` | Added payment-related columns to the applications table (redundant with `lenco_payment_integration.sql`) | Pre-Lenco migration |
| `lenco_payment_integration.sql` | Created `program_fees` and `webhook_event_logs` tables, added payment columns to `payments` and `applications` | Lenco payment integration |
| `business_logic_densification.sql` | Created `application_conditions`, `communication_templates`, `academic_calendar_events`, `fee_waivers`, `application_amendments` tables with indexes and seed data | Business logic densification phase |
| `add_audit_log_encrypted_network_context.sql` | Added encrypted network context column to `audit_logs` | Security hardening audit |
| `drop_program_fee_full_unique.sql` | Dropped a unique constraint on `program_fees` | Fee model refinement |
| `add_outbox_events.sql` | Created the `outbox_events` table for transactional outbox pattern | Outbox pattern implementation |
| `create_error_logs_table.sql` | Created the `error_logs` table (now deprecated — replaced by GlitchTip) | Error monitoring setup |

## Why These Are Archived

These scripts were identified during the April 2026 full repository audit (SSP-008 through SSP-014 in `AUDIT-REPORT-2026-04-24.md`) as fully applied and stale. Moving them here reduces confusion about which scripts are active and prevents accidental re-execution.

## Active Scripts

Active scripts remain in `backend/scripts/`. See that directory for scripts that are still relevant for schema verification, seeding, or pending migrations.
