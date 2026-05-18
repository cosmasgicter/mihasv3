# Archived SQL Scripts

This directory contains SQL scripts that were archived after application to
production. Only files physically present in this directory can currently be
verified from the checkout.

## Archived Scripts

| Script | Purpose | Applied |
|--------|---------|---------|
| `add_missing_payment_columns.sql` | Added payment-related columns to the applications table (redundant with `lenco_payment_integration.sql`) | Pre-Lenco migration |
Only `add_missing_payment_columns.sql` is present in this checkout on
2026-05-18.

## Historical Scripts Referenced But Missing

The following files are referenced by prior audits/manifests but are not
currently present on disk, so they cannot truthfully be described as archived
until recovered:

- `lenco_payment_integration.sql`
- `business_logic_densification.sql`
- `add_audit_log_encrypted_network_context.sql`
- `drop_program_fee_full_unique.sql`
- `add_outbox_events.sql`
- `create_error_logs_table.sql`

## Why These Are Archived

The April 2026 full repository audit (SSP-008 through SSP-014 in
`AUDIT-REPORT-2026-04-24.md`) identifies the historical scripts above as
applied/stale. Because six source files are missing from the present checkout,
the next database archaeology pass should recover them from git history or
Neon executed-DDL logs before this archive is considered complete.

## Active Scripts

Active scripts remain in `backend/scripts/`. See that directory for scripts that are still relevant for schema verification, seeding, or pending migrations.
