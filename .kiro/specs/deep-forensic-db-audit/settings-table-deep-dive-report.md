# Settings Table Deep-Dive Audit Report

**Date:** 2026-03-10
**Task:** 7.7 — Deep-dive settings table
**Requirements:** 18.1–18.4

---

## 1. Live Schema

### settings (9 columns)
| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | key | varchar(100) | NO | — |
| 3 | value | jsonb | NO | — |
| 4 | description | text | YES | — |
| 5 | category | varchar(50) | YES | — |
| 6 | is_public | boolean | YES | false |
| 7 | updated_by | uuid | YES | — |
| 8 | created_at | timestamptz | YES | now() |
| 9 | updated_at | timestamptz | YES | now() |

### Constraints
| Constraint | Type | Column(s) |
|-----------|------|-----------|
| settings_pkey | PRIMARY KEY | id |
| settings_key_key | UNIQUE | key |
| settings_updated_by_fkey | FOREIGN KEY | updated_by → profiles.id |

### Live Data (10 rows)
| Key | Category | Is Public |
|-----|----------|-----------|
| allowed_file_types | documents | true |
| application_fee | payments | true |
| auto_save_interval | application | true |
| contact_email | general | true |
| contact_phone | general | true |
| maintenance_mode | general | false |
| max_applications_per_intake | application | true |
| max_file_size_mb | documents | true |
| registration_enabled | auth | true |
| site_name | general | true |

---

## 2. SystemSetting Interface vs Live Schema

### SystemSetting (api-src/admin.ts)
```typescript
interface SystemSetting {
  id?: string;
  key: string;
  value: unknown;
  description?: string;
  category?: string;
  is_public?: boolean;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}
```

| Interface Field | In Live Schema? | Notes |
|----------------|-----------------|-------|
| id?: string | ✅ id (uuid) | OK — optional matches auto-generated |
| key: string | ✅ key (varchar(100), NOT NULL) | OK |
| value: unknown | ✅ value (jsonb, NOT NULL) | OK — `unknown` is appropriate for jsonb |
| description?: string | ✅ description (text, nullable) | OK |
| category?: string | ✅ category (varchar(50), nullable) | OK |
| is_public?: boolean | ✅ is_public (boolean, nullable) | OK |
| updated_by?: string | ✅ updated_by (uuid, nullable, FK→profiles.id) | OK |
| created_at?: string | ✅ created_at (timestamptz) | OK |
| updated_at?: string | ✅ updated_at (timestamptz) | OK |

**Verdict: ✅ SystemSetting interface is CORRECT** — all 9 fields match all 9 columns perfectly.

---

## 3. SQL Statement Audit

### 3.1 handleGetSettings() — ✅ CORRECT
```sql
SELECT * FROM settings ORDER BY key ASC
```
Uses SELECT * — fragile but currently correct (all 9 columns returned).

### 3.2 handleCreateSetting() — ✅ CORRECT
```sql
INSERT INTO settings (key, value, description, category, is_public, updated_by, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
RETURNING *
```
All 8 columns (excluding auto-generated `id`) exist. Parameter count matches (6 values + 2 NOW()). Uses proper `$1`–`$6` placeholders.

### 3.3 handleUpdateSetting() — 🔴 CRITICAL BUG: Missing $ prefix
```typescript
updates.push(`value = ${paramIndex}`);     // Generates: value = 2
updates.push(`category = ${paramIndex}`);  // Generates: category = 3
updates.push(`description = ${paramIndex}`); // Generates: description = 4
updates.push(`is_public = ${paramIndex}`);   // Generates: is_public = 5
whereClause = `id = ${paramIndex}`;          // Generates: id = 6
whereClause = `key = ${paramIndex}`;         // Generates: key = 6
```

**Bug:** Uses JavaScript template literal `${paramIndex}` instead of SQL parameter placeholder `$${paramIndex}`. This generates SQL like:
```sql
UPDATE settings SET updated_by = $1, updated_at = NOW(), value = 2 WHERE id = 3 RETURNING *
```
Instead of the correct:
```sql
UPDATE settings SET updated_by = $1, updated_at = NOW(), value = $2 WHERE id = $3 RETURNING *
```

**Impact:** 
- `value = 2` sets the value column to the literal integer 2 (or fails with type mismatch since value is jsonb)
- `WHERE id = 3` looks for id = integer 3 instead of using the parameterized UUID
- This is effectively **SQL injection via broken parameterization** — the actual values from the request body are pushed to the `values` array but never referenced by the SQL
- The query will either fail at runtime (type mismatch) or silently corrupt data

### 3.4 handleDeleteSetting() — ✅ CORRECT
```sql
DELETE FROM settings WHERE id = $1
DELETE FROM settings WHERE key = $1
```
Proper parameterized queries.

### 3.5 handleImportSettings() — 🔴 CRITICAL BUG: Missing $ prefix
```typescript
placeholders.push(`(${offset + 1}, ${offset + 2}, ${offset + 3}, ${offset + 4}, ${offset + 5}, ${offset + 6}, NOW(), NOW())`);
```

**Bug:** Same issue — generates `(1, 2, 3, 4, 5, 6, NOW(), NOW())` instead of `($1, $2, $3, $4, $5, $6, NOW(), NOW())`.

**Impact:** The INSERT would try to insert literal integers 1-6 instead of the actual setting values. For the first row this would be `key = 1` which fails because key is varchar. For subsequent rows, the offsets would be `(7, 8, 9, ...)` — all literal integers.

### 3.6 handleResetSettings() — 🔴 CRITICAL BUG: Missing $ prefix
```typescript
placeholders.push(`(${offset + 1}, ${offset + 2}, ${offset + 3}, ${offset + 4}, ${offset + 5}, ${offset + 6}, NOW(), NOW())`);
```

**Bug:** Identical to handleImportSettings — missing `$` prefix on all parameter placeholders.

---

## 4. Seed Migration Audit (seed_and_normalize_data.sql)

### Column names used:
```sql
INSERT INTO settings (key, value, description, category, is_public) VALUES ...
```

| Seed Column | In Live Schema? | Notes |
|------------|-----------------|-------|
| key | ✅ | OK |
| value | ✅ | OK — values are JSON strings cast to jsonb |
| description | ✅ | OK |
| category | ✅ | OK |
| is_public | ✅ | OK |

**Missing from seed:** `updated_by` — not set, defaults to NULL (acceptable for system-seeded values).

**Verdict: ✅ Seed migration column names are CORRECT.**

**ON CONFLICT (key) DO NOTHING** — relies on the `settings_key_key` UNIQUE constraint, which exists. ✅

---

## 5. Issues Summary

### 🔴 CRITICAL

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| C1 | handleUpdateSetting missing `$` prefix on parameter placeholders | api-src/admin.ts ~L397-418 | SQL sets literal integers instead of parameterized values — data corruption or runtime error |
| C2 | handleImportSettings missing `$` prefix on parameter placeholders | api-src/admin.ts ~L1699 | INSERT uses literal integers instead of parameterized values — runtime error |
| C3 | handleResetSettings missing `$` prefix on parameter placeholders | api-src/admin.ts ~L1818 | INSERT uses literal integers instead of parameterized values — runtime error |

### ⚠️ MEDIUM

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| M1 | handleGetSettings uses SELECT * | api-src/admin.ts ~L330 | Fragile to schema changes |

### ℹ️ LOW

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| L1 | handleResetSettings has different default values than seed migration | api-src/admin.ts vs seed_and_normalize_data.sql | Inconsistent defaults (e.g., application_fee: '50.00' vs '153', contact_email differs) |

---

## 6. Recommended Fixes

### CRITICAL — Fix missing $ prefix in handleUpdateSetting
```typescript
// BEFORE (broken):
updates.push(`value = ${paramIndex}`);

// AFTER (correct):
updates.push(`value = $${paramIndex}`);
```
Apply to ALL dynamic placeholder constructions in:
- `handleUpdateSetting` (value, category, description, is_public, WHERE clause)
- `handleImportSettings` (all 6 placeholders per row)
- `handleResetSettings` (all 6 placeholders per row)

### MEDIUM — Replace SELECT * with explicit columns
```sql
-- BEFORE:
SELECT * FROM settings ORDER BY key ASC

-- AFTER:
SELECT id, key, value, description, category, is_public, updated_by, created_at, updated_at
FROM settings ORDER BY key ASC
```
