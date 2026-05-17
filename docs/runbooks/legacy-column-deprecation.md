# Legacy Column Deprecation Runbook

90-day deprecation cycle for columns identified in AUDIT-REPORT-2026-04-24.md (SSP-001, SSP-002, SSP-003).

## Timeline

| Day | Date | Action |
|-----|------|--------|
| 0 | 2026-05-17 | Deprecation declared; `legacy_columns.py` committed; no-writes test active |
| 30 | 2026-06-16 | Verification checkpoint — confirm zero writes in production logs |
| 60 | 2026-07-16 | Final review — confirm no new code references; notify stakeholders |
| 90 | 2026-08-15 | Execute drop migration (`legacy_columns_drop_2026_08_15.sql`) |

## Affected Tables

### applications (9 columns)

| Column | Replacement |
|--------|-------------|
| `payment_method` | `payments.method` |
| `payer_name` | Removed (PII) |
| `payer_phone` | `payments.phone_hash` / `payments.phone_last4` |
| `amount` | `payments.amount` |
| `paid_at` | `payments.paid_at` |
| `momo_ref` | `payments.transaction_reference` |
| `pop_url` | Removed (Lenco is source of truth) |
| `payment_verified_at` | `payments.verified_at` |
| `payment_verified_by` | `payments.verified_by_id` / `audit_logs` |

### profiles (3 columns)

| Column | Replacement |
|--------|-------------|
| `refresh_token_hash` | Redis JTI blacklisting |
| `failed_login_attempts` | DRF throttle classes |
| `locked_until` | DRF throttle classes |

### error_logs (entire table)

Replaced by GlitchTip (Sentry-compatible) error monitoring. Table preserved but no longer written to.

## Day 0 — Deprecation Start (2026-05-17)

- [x] `backend/apps/common/legacy_columns.py` committed with full inventory
- [x] `backend/tests/unit/test_legacy_columns_no_writes.py` active in CI
- [x] `backend/tests/property/test_schema_drift_strict.py` excludes deprecated columns
- [x] `backend/scripts/legacy_columns_drop_2026_08_15.sql` prepared with date guard
- [x] This runbook created

## Day 30 — Verification (2026-06-16)

- [ ] Run `test_legacy_columns_no_writes.py` — must pass
- [ ] Query production: confirm zero writes to deprecated columns in last 30 days
  ```sql
  -- Example: check if any application has non-null deprecated columns updated recently
  SELECT id, updated_at FROM applications
  WHERE updated_at > '2026-05-17'
    AND (payment_method IS NOT NULL OR payer_name IS NOT NULL OR payer_phone IS NOT NULL)
  LIMIT 10;
  ```
- [ ] Review any new PRs that might reference deprecated columns
- [ ] Document findings in this section

## Day 60 — Final Review (2026-07-16)

- [ ] Confirm no code references to deprecated columns (grep + AST test)
- [ ] Notify team: drop migration scheduled for 2026-08-15
- [ ] Confirm backup strategy (Neon point-in-time recovery covers rollback)
- [ ] Review any downstream consumers (analytics, exports) that read these columns

## Day 90 — Drop Migration (2026-08-15)

### Pre-execution

1. Confirm date guard will pass: `SELECT current_date >= '2026-08-15';`
2. Take a Neon branch snapshot for rollback
3. Notify team of maintenance window

### Execution

```bash
psql "$DATABASE_URL" -f backend/scripts/legacy_columns_drop_2026_08_15.sql
```

### Post-execution

1. Verify columns are gone:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'applications'
     AND column_name IN ('payment_method','payer_name','payer_phone','amount','paid_at','momo_ref','pop_url','payment_verified_at','payment_verified_by');
   -- Should return 0 rows
   ```
2. Verify `error_logs` table is gone:
   ```sql
   SELECT 1 FROM information_schema.tables WHERE table_name = 'error_logs';
   -- Should return 0 rows
   ```
3. Remove `legacy_columns.py` entries for dropped columns
4. Move `legacy_columns_drop_2026_08_15.sql` to `backend/scripts/applied/`
5. Update `test_schema_drift_strict.py` to remove exclusions

### Rollback

If issues arise after drop:
1. Restore from Neon branch snapshot taken pre-execution
2. Or re-add columns (they will be NULL — no data recovery possible)

## Registry Location

- Column inventory: `backend/apps/common/legacy_columns.py`
- Drop script: `backend/scripts/legacy_columns_drop_2026_08_15.sql`
- No-writes test: `backend/tests/unit/test_legacy_columns_no_writes.py`
- Schema drift test: `backend/tests/property/test_schema_drift_strict.py`
