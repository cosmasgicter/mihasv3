# Schema Reconciliation Runbook

Spec: `.kiro/specs/production-schema-reconciliation/`
Target: production Neon project `wild-bar-37055823`, default branch
`production` (`br-floral-scene-aha2ybfd`).

This runbook governs the one-shot schema reconciliation that aligns
the production database with the schema the Django code in `backend/`
expects, plus a permanent CI drift-guard so the same drift cannot
silently re-accumulate.

All schema changes are additive and reversible. Every forward script
ships with a sibling `_rollback.sql` under `backend/scripts/` per
Requirement 9.1 of the spec.

## Pre-flight checklist

Before touching production:

1. Create a Neon branch fork from `production` named
   `pre-prod-reconcile-2026-05-22` via the Neon MCP `create_branch`
   tool. Free, copy-on-write; isolates writes from production.
2. Apply every pending Migration_Script to the fork in lexical order
   via `apply_sql_migrations` (or `psql -f` for each file when running
   without Django on the operator's laptop).
3. Run `python3 manage.py check_schema_drift --check-fk-indexes
   --check-migration-history-coverage` against the fork. Must exit 0
   with the structured `OK: schema-drift=<n> fk-indexes=<m>
   migration-history=<k>` line.
4. Run `python3 backend/scripts/payment_snapshot_backfill.py
   --dry-run` against the fork. Confirm exactly 2 planned writes.
5. Run `python3 backend/scripts/payment_snapshot_backfill.py` against
   the fork and verify `updated=2, skipped_ambiguous=0`.
6. Run `python3 backend/scripts/payment_snapshot_backfill.py --verify`
   against the fork. Must print `verify: count_without_snapshot=0`
   and exit 0.
7. Capture `EXPLAIN ANALYZE` plans for one representative join per
   FK-indexed table and record them under §FK\_Index\_Invariant.
8. If anything fails on the fork, do not proceed. Re-author the
   offending Migration\_Script and re-fork.

## Maintenance windows

Recorded entries — pre-announce on the operator's standard channel
before each.

### 2026-05-25 reconciliation window

- Start: `2026-05-25T13:41:43Z` (UTC)
- Expected duration: ~30 minutes (most of which is the FK-index
  CONCURRENTLY builds against small tables — sub-second per index)
- Scripts applied in this order:
  1. `2026_05_22_migration_history_extend.sql`
  2. `2026_05_18_expand_application_status_columns.sql`
  3. `2026_05_18_hot_query_indexes.sql`
  4. `2026_05_19_seed_communication_templates.sql`
  5. `2026_05_22_migration_history_reconcile.sql`
  6. `application_number_sequences.sql`
  7. `system_actor_seed.sql`
  8. `2026_05_22_fk_index_backfill.sql` (autocommit; CONCURRENTLY)
  9. `2026_05_22_device_sessions_refresh_jti.sql` (added during
     pre-flight to close the `device_sessions.refresh_jti` gap from
     R1.3)

## Rollback plan (per script)

Every forward script has a sibling `_rollback.sql` under
`backend/scripts/`. Apply manually with `psql` in autocommit; never
via `apply_sql_migrations` (rollback files are not in the lexical
sweep per R9.5). Pass `--allow-non-additive` to any tooling that
lints the rollback because `DROP COLUMN` / `DROP TABLE` patterns are
flagged as non-additive by the apply\_sql\_migrations lint.

| Forward                                          | Rollback                                                  | Effect of rollback                            |
| ------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------- |
| `2026_05_22_migration_history_extend.sql`        | `2026_05_22_migration_history_extend_rollback.sql`        | Drops `checksum`, `notes`, unique index       |
| `2026_05_22_migration_history_reconcile.sql`     | `2026_05_22_migration_history_reconcile_rollback.sql`     | Removes only the rows tagged `reconciled-on-2026-05-22%`           |
| `2026_05_22_fk_index_backfill.sql`               | `2026_05_22_fk_index_backfill_rollback.sql`               | Drops the 15 FK indexes in reverse order      |
| `2026_05_22_device_sessions_refresh_jti.sql`     | `2026_05_22_device_sessions_refresh_jti_rollback.sql`     | Drops the column + partial index              |
| `2026_05_18_expand_application_status_columns.sql` | `2026_05_18_expand_application_status_columns_rollback.sql` | Removes the migration\_history row only (varchar widening is not narrowable under the inverse-additive contract) |
| `2026_05_18_hot_query_indexes.sql`               | `2026_05_18_hot_query_indexes_rollback.sql`               | Drops the 8 hot-query indexes in reverse      |
| `2026_05_19_seed_communication_templates.sql`    | `2026_05_19_seed_communication_templates_rollback.sql`    | Deletes the 19 seeded `template_key` rows     |
| `application_number_sequences.sql`               | `application_number_sequences_rollback.sql`               | Drops the 6 deterministic sequences           |
| `system_actor_seed.sql`                          | `system_actor_seed_rollback.sql`                          | Deletes the seeded system\_actor profile row  |

## Verification queries

Operators can copy-paste these against any fork or production
connection. All must return zero rows / `0` count for the gap
queries; they restate the four spec invariants from
`requirements.md`.

### Coverage_Invariant

Every concrete field on a `managed=False` Django model maps to an
existing column. Owned by `check_schema_drift` (default check).

```sql
-- Sanity replacement: every column the Django models declare must be
-- present on the live table. Run via the management command rather
-- than ad-hoc SQL because the source of truth is the model
-- declarations:
--   python manage.py check_schema_drift --strict
```

### FK_Index_Invariant

Every FK column has a btree index whose first attribute matches it.

```sql
SELECT
  tc.table_name AS source_table,
  kcu.column_name AS source_column,
  ccu.table_name AS ref_table,
  ccu.column_name AS ref_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
 AND tc.table_schema = ccu.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = current_schema()
  AND NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_am am ON am.oid = idx.relam
    WHERE am.amname = 'btree'
      AND i.indisvalid = true
      AND t.relname = tc.table_name
      AND a.attname = kcu.column_name
  );
-- Expected: zero rows.
```

#### EXPLAIN ANALYZE plans (captured 2026-05-25 on
#### `pre-prod-reconcile-2026-05-22` fork after FK index backfill)

`payments.verified_by → profiles.id`:

```text
Hash Join  (cost=1.04..5.23 rows=15 width=16) (actual time=0.021..0.025 rows=2 loops=1)
  Hash Cond: (p.verified_by = pr.id)
  -> Seq Scan on payments p (15 rows, 0.012 ms)
  -> Hash on profiles pr (8 rows, 9 kB)
Planning Time: 0.170 ms
Execution Time: 0.039 ms
```

`programs.institution_id → institutions.id`:

```text
Hash Join  (cost=1.09..11.54 rows=4 width=16) (actual time=1.789..1.791 rows=4 loops=1)
  Hash Cond: (i.id = pr.institution_id)
  -> Seq Scan on institutions i (2 rows, 1.767 ms)
  -> Hash on programs pr (4 rows, 9 kB)
Planning Time: 5.127 ms
Execution Time: 1.815 ms
```

`applications.assigned_reviewer_id → profiles.id`:

```text
Hash Join  (cost=1.04..7.38 rows=14 width=16) (actual time=0.022..0.023 rows=0 loops=1)
  Hash Cond: (a.assigned_reviewer_id = p.id)
  -> Seq Scan on applications a (27 rows, 0.010 ms)
  -> Hash on profiles p (filtered to role='reviewer'; 0 rows, 8 kB)
Planning Time: 10.482 ms
Execution Time: 0.043 ms
```

The planner currently chooses Hash Join because every joined table is
small (≤ 27 rows, 8 profiles, 2 institutions). The new FK indexes are
not used by these particular plans, but they correctly satisfy
`FK_Index_Invariant` for future scale (admin queries that filter by
`reviewer_id`, payment-recovery joins by `verified_by`, etc.). The
Postgres planner will fall over to index nested-loop joins
automatically once the row counts grow beyond the seq-scan cost
threshold.

### Snapshot_Invariant

Every row in `payments` carries `metadata.snapshot`.

```sql
SELECT count(*) FILTER (WHERE NOT (metadata ? 'snapshot') OR metadata IS NULL)
FROM payments;
-- Expected: 0.
```

The `--verify` mode of `payment_snapshot_backfill.py` is the
canonical operator-facing command — it prints
`verify: count_without_snapshot=<n>` and exits 0 only when the count
is zero.

### Receipt_Uniqueness_Invariant

`payments.receipt_number` is unique for all non-null, non-empty
values, enforced by the partial unique index
`uq_payments_receipt_number`. Verified by:

```sql
SELECT
  CASE
    WHEN COUNT(*) FILTER (
      WHERE receipt_number IS NOT NULL AND receipt_number <> ''
    ) = COUNT(DISTINCT receipt_number) FILTER (
      WHERE receipt_number IS NOT NULL AND receipt_number <> ''
    )
    THEN 'OK'
    ELSE 'DUPLICATE_RECEIPT_NUMBER'
  END AS receipt_uniqueness_status
FROM payments;
-- Expected: receipt_uniqueness_status = 'OK'.
```

### migration\_history coverage

```sql
SELECT count(*) FROM migration_history;
-- Expected: ≥ 11 reconciliation rows on top of the pre-existing
-- baseline, all visible to apply_sql_migrations and the drift-guard.
```

## Post-deployment communication template

```
Subject: ✅ MIHAS schema reconciliation — production updated <YYYY-MM-DD>

Audience: admissions ops + reviewers
Status: complete
Window: <ISO8601-start> → <ISO8601-end>

What changed
- migration_history extended with checksum + notes + unique index
- 5 pending reconciliation scripts applied (status varchar widening,
  hot-query indexes, communication template seed, application-number
  sequences, system actor seed)
- 15 FK columns indexed (no full-table locks; CONCURRENTLY builds)
- `device_sessions.refresh_jti` column + partial index added
- Out-of-band scripts (`payment_hardening_indexes.sql`,
  `payment_hardening_preflight.sql`) recorded in migration_history
- 2 legacy payments backfilled with metadata.snapshot

What did NOT change
- No table dropped, no column renamed, no data deleted
- Auth / CSRF / cookie semantics unchanged
- API contract unchanged
- 27 applications + 15 payments unchanged at the row level

Verification
- check_schema_drift exits 0 with all flags set
- payment_snapshot_backfill.py --verify reports 0 rows missing
- All 4 invariants documented in
  docs/runbooks/schema-reconciliation-runbook.md hold

Known no-ops
- The 28 jobs-ops/outreach/automation/integrations/analytics tables
  remain unprovisioned on this Neon project; they are deliberately
  scoped out of admissions and tracked via the canonical-truth-map.

Operator on call: <name>
Rollback contact: <name>
```

## Rollback log

Append rows here when a rollback file is applied (per Requirement
9.6):

| Timestamp (UTC) | Rollback file | Reason | Resulting migration_history state |
| --------------- | ------------- | ------ | --------------------------------- |
| _none yet_      |               |        |                                   |
