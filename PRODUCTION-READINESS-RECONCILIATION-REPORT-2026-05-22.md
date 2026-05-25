# Production Readiness Reconciliation Report — 2026-05-22

This report supersedes the corresponding sections of
`PRODUCTION-READINESS-FIX-REPORT-2026-05-19.md` with verified
`information_schema` reality after the schema-reconciliation spec
landed. Source of truth for every claim below: the production Neon
database (project `wild-bar-37055823`, default branch
`br-floral-scene-aha2ybfd`) at the time of the 2026-05-25 maintenance
window.

Spec: `.kiro/specs/production-schema-reconciliation/`
Runbook: `docs/runbooks/schema-reconciliation-runbook.md`

## Verified table count

The previous readiness report claimed **72 tables**. Verified count
on production at maintenance-window completion: **35 tables**.

Source query:

```sql
SELECT count(*)
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
-- Returns: 35
```

The 28-table delta vs the previous claim was the
jobs-ops/outreach/automation/integrations/analytics surface. Those
models exist in `apps/jobs/`, `apps/outreach/`, `apps/automation/`,
`apps/integrations/`, and `apps/analytics/` with `Meta.managed = False`
but their tables are not provisioned on this Neon project — the
project is admissions-only. The drift-guard's default check now
correctly reports them as "missing tables" with a non-strict warning
(see Component 6 of the spec design).

## FK index coverage

The previous readiness report claimed **all FK columns indexed**.
Live audit on 2026-05-22 found 15 FK columns lacking covering btree
indexes. The reconciliation closed the gap; verified state on
production:

| Table                            | Column                | Index name                                     | Applied at (UTC)       |
| -------------------------------- | --------------------- | ---------------------------------------------- | ---------------------- |
| `applications`                   | `admin_feedback_by`   | `idx_applications_admin_feedback_by`           | 2026-05-25T13:47:46Z   |
| `applications`                   | `assigned_reviewer_id`| `idx_applications_assigned_reviewer_id`        | 2026-05-25T13:47:46Z   |
| `applications`                   | `payment_verified_by` | `idx_applications_payment_verified_by`         | 2026-05-25T13:47:46Z   |
| `applications`                   | `reviewed_by`         | `idx_applications_reviewed_by`                 | 2026-05-25T13:47:46Z   |
| `application_amendments`         | `reviewed_by`         | `idx_application_amendments_reviewed_by`       | 2026-05-25T13:47:46Z   |
| `application_conditions`         | `verified_by`         | `idx_application_conditions_verified_by`       | 2026-05-25T13:47:46Z   |
| `application_documents`          | `verified_by`         | `idx_application_documents_verified_by`        | 2026-05-25T13:47:46Z   |
| `application_drafts`             | `application_id`      | `idx_application_drafts_application_id`        | 2026-05-25T13:47:46Z   |
| `application_interviews`         | `created_by`          | `idx_application_interviews_created_by`        | 2026-05-25T13:47:46Z   |
| `application_interviews`         | `updated_by`          | `idx_application_interviews_updated_by`        | 2026-05-25T13:47:46Z   |
| `application_status_history`    | `changed_by`          | `idx_application_status_history_changed_by`    | 2026-05-25T13:47:46Z   |
| `fee_waivers`                    | `approved_by`         | `idx_fee_waivers_approved_by`                  | 2026-05-25T13:47:46Z   |
| `payments`                       | `verified_by`         | `idx_payments_verified_by`                     | 2026-05-25T13:47:46Z   |
| `programs`                       | `institution_id`      | `idx_programs_institution_id`                  | 2026-05-25T13:47:46Z   |
| `settings`                       | `updated_by`          | `idx_settings_updated_by`                      | 2026-05-25T13:47:46Z   |

All 15 indexes built via `CREATE INDEX CONCURRENTLY IF NOT EXISTS`
during the maintenance window. Sub-second per index against the
27-application / 15-payment dataset. Verified post-condition:
`fk_index_gaps = 0` against the verification query in
`docs/runbooks/schema-reconciliation-runbook.md`.

A 16th post-reconciliation addition closed an unrelated gap found
during pre-flight: `device_sessions.refresh_jti` (varchar(64), NULL)
plus partial index `idx_device_sessions_refresh_jti` (`WHERE refresh_jti
IS NOT NULL`) per Requirement 1.3.

## Settings module reference

The previous readiness report referenced `production.py`. The actual
Django settings module path used in production is
`config.settings.dev` (the `dev` module is configured for production
deployment via `DJANGO_SETTINGS_MODULE`). No production-specific
settings module was added during reconciliation.

## `payments.receipt_number` uniqueness

The previous readiness report described
`payments.receipt_number` uniqueness as a `UNIQUE` table constraint.
The implementation on production is the partial unique index
`uq_payments_receipt_number` from `payment_hardening_indexes.sql`,
defined as:

```sql
CREATE UNIQUE INDEX uq_payments_receipt_number
    ON payments (receipt_number)
    WHERE receipt_number IS NOT NULL
      AND receipt_number <> '';
```

The two formulations are functionally equivalent for non-null,
non-empty values: both reject duplicates. The partial index admits
multiple rows with `NULL` or empty receipt_number (as required by
the pending-payment lifecycle) without giving up uniqueness for
issued receipts.

## migration_history reconciliation

The `migration_history` table has been extended with `checksum` and
`notes` columns plus a unique index on `migration_name` (forward
script: `2026_05_22_migration_history_extend.sql`). 11 rows were
recorded during the maintenance window:

| Migration                                              | Notes                                            |
| ------------------------------------------------------ | ------------------------------------------------ |
| `2026_05_22_migration_history_extend.sql`              |                                                  |
| `2026_05_18_expand_application_status_columns.sql`     |                                                  |
| `2026_05_18_hot_query_indexes.sql`                     |                                                  |
| `2026_05_19_seed_communication_templates.sql`          |                                                  |
| `payment_hardening_indexes.sql`                        | reconciled-on-2026-05-22; original applied_at not recorded |
| `payment_hardening_preflight.sql`                      | reconciled-on-2026-05-22; original applied_at not recorded |
| `2026_05_22_migration_history_reconcile.sql`           |                                                  |
| `application_number_sequences.sql`                     |                                                  |
| `system_actor_seed.sql`                                |                                                  |
| `2026_05_22_fk_index_backfill.sql`                     |                                                  |
| `2026_05_22_device_sessions_refresh_jti.sql`           |                                                  |

After reconciliation, `migration_history` is the single source of
truth for what schema is on production. `backend/scripts/MIGRATION_HISTORY.md`
is the human-readable mirror, regenerated from this table.

## Snapshot backfill

Pre-reconciliation: 2 of 15 production payments lacked
`metadata.snapshot`. Post-reconciliation:
`payment_snapshot_backfill.py --verify` reports
`verify: count_without_snapshot=0` and exits 0. Both backfilled
rows carry `fee_source: "backfill"` per Requirement 3.1.

## Drift-guard

`python3 manage.py check_schema_drift --check-fk-indexes
--check-migration-history-coverage` against the production
connection prints a single structured success line:

```
OK: schema-drift=35 fk-indexes=41 migration-history=11
```

This is now wired into CI via the `drift-guard` job in
`.github/workflows/backend-governance.yml` (Component 7 of the
spec design). The `NEON_API_KEY` repository secret governs branch-fork
creation against the production project. The cleanup step runs with
`if: always()` so a transient failure cannot leak forks.

## What did NOT change

- No table dropped, no column renamed, no data deleted.
- 27 applications + 15 payments unchanged at the row level.
- API contract unchanged.
- Auth / CSRF / cookie semantics unchanged.
- Response envelope unchanged.
- Observability / GlitchTip integration unchanged.
- Celery beat schedule unchanged.

## Reversibility

Every forward script applied during reconciliation ships with a
sibling `_rollback.sql` under `backend/scripts/`. The rollback
contract is enforced structurally by:

- `backend/tests/property/test_rollback_pairing.py` — every forward
  script has a sibling rollback file.
- `backend/tests/property/test_rollback_safe_operations.py` — every
  rollback file contains only inverse-additive operations.

Per-script rollback effects are documented in
`docs/runbooks/schema-reconciliation-runbook.md` §"Rollback plan".
