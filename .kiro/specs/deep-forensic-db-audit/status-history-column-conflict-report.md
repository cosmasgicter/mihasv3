# application_status_history Column Conflict Report — Task 5.4

## Live Schema (Verified via Neon MCP)

The table has ALL THREE status columns:

| Column | Type | Nullable | Default | Origin |
|--------|------|----------|---------|--------|
| status | varchar(20) | NOT NULL | (none) | 003_supporting_tables.sql (core) |
| old_status | text | YES | (none) | add_idempotency_and_status_history.sql |
| new_status | text | YES | (none) | add_idempotency_and_status_history.sql |

Plus 8 other columns: id, application_id, changed_by, notes, changes, ip_address, user_agent, created_at.

## How This Happened

1. **003_supporting_tables.sql** created the table with `status VARCHAR(20) NOT NULL`
2. **add_idempotency_and_status_history.sql** used `CREATE TABLE IF NOT EXISTS` with `old_status TEXT` and `new_status TEXT NOT NULL` — but since the table already existed, this CREATE was a no-op
3. The `old_status` and `new_status` columns were added separately (likely via ALTER TABLE in a ghost migration or manual DDL)
4. In the live DB, `new_status` is nullable (TEXT NULL) — different from the migration's `NOT NULL` spec
5. The legacy `status` column remains as VARCHAR(20) NOT NULL with no default

## Code References Analysis

### StatusHistoryQueries.create() — 🔴 CRITICAL BUG
```sql
INSERT INTO application_status_history (
  id, application_id, old_status, new_status, changed_by, notes, created_at
)
VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
```
**Missing `status` column** — `status` is NOT NULL with no default. This INSERT will fail with:
`ERROR: null value in column "status" of relation "application_status_history" violates not-null constraint`

### api-src/applications.ts (handleReviewApplication) — ✅ WORKS (by accident)
```sql
INSERT INTO application_status_history (id, application_id, old_status, new_status, changed_by, notes, created_at)
SELECT gen_random_uuid(), id, $8, $2, $3, $4, NOW() FROM updated_application
```
Same bug — omits `status` column. Will fail at runtime.

### api-src/admin.ts (bulk status update) — ⚠️ INCLUDES `status`
```sql
INSERT INTO application_status_history (id, application_id, status, new_status, changed_by, notes, created_at)
VALUES (gen_random_uuid(), $1, $2, $2, $3, $4, NOW())
```
This one DOES include `status` and sets it to the same value as `new_status`. This will succeed.
But it omits `old_status` (nullable, so OK).

### Test files — ❌ Use legacy pattern
```sql
INSERT INTO application_status_history (application_id, status, changed_by) VALUES ($1, $2, $3)
```
Tests use the legacy `status` column only, no old_status/new_status. These would succeed since `status` is provided.

### seed_and_normalize_data.sql backfill — ✅ CORRECT
```sql
UPDATE application_status_history SET new_status = status WHERE new_status IS NULL;
UPDATE application_status_history SET old_status = 'submitted'
  WHERE old_status IS NULL AND new_status IN ('approved', 'rejected', 'under_review');
```
Copies legacy `status` → `new_status`, infers `old_status`. Logic is sound.

## Resolution Options

### Option A: Add DEFAULT to `status` column (recommended)
```sql
ALTER TABLE application_status_history ALTER COLUMN status SET DEFAULT 'unknown';
```
- Pros: Non-breaking, all existing INSERTs continue to work
- Cons: `status` column becomes redundant data (duplicates `new_status`)

### Option B: Make `status` nullable
```sql
ALTER TABLE application_status_history ALTER COLUMN status DROP NOT NULL;
```
- Pros: Allows code to omit `status` in INSERT
- Cons: Existing rows have `status` values, new rows would have NULL — inconsistent

### Option C: Fix all INSERT statements to include `status` (set to `new_status` value)
- Pros: No schema change needed
- Cons: Redundant data, must update multiple files

### Option D: Drop `status` column entirely (cleanest)
```sql
ALTER TABLE application_status_history DROP COLUMN status;
```
- Pros: Eliminates redundancy, `old_status`/`new_status` is the canonical pattern
- Cons: Must verify no code reads from `status` column (seed migration already backfilled `new_status` from `status`)

## Recommendation

**Option A** for immediate fix (unblocks StatusHistoryQueries.create()), then **Option D** in Phase 6 cleanup after verifying all code uses old_status/new_status.

## Summary

| Finding | Severity | Details |
|---------|----------|---------|
| `status` NOT NULL with no default | 🔴 CRITICAL | StatusHistoryQueries.create() and applications.ts handleReviewApplication will fail |
| admin.ts includes `status` | ✅ OK | Only code path that works correctly |
| Tests use legacy pattern | ⚠️ MEDIUM | Tests won't catch the bug since they use `status` directly |
| Backfill logic | ✅ CORRECT | seed_and_normalize_data.sql properly copies status→new_status |
| Column redundancy | LOW | `status` duplicates `new_status` — should be dropped eventually |
