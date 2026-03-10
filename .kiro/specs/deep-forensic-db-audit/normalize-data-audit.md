# normalize_data.sql Migration Correctness Audit — Task 2.4

## Summary

**Migration file**: `migrations/normalize_data.sql`
**Migration status**: Ghost Migration (NOT in `migration_history`)
**Would it run successfully?**: ❌ NO — contains a fatal error referencing `intakes.program_id` which does not exist
**Were its effects applied?**: ✅ YES — all normalization effects are present, applied by `seed_and_normalize_data.sql` (Ghost Migration #4) and/or clean data entry

---

## 1. Fatal Error: `intakes.program_id` Does Not Exist

### The Problem

Line in `normalize_data.sql` (Section 4):
```sql
DELETE FROM intakes
WHERE program_id IS NOT NULL
  AND program_id NOT IN (SELECT id FROM programs);
```

### Verification

**intakes table columns** (13 columns, confirmed via Neon MCP):
| # | Column |
|---|--------|
| 1 | id |
| 2 | name |
| 3 | year |
| 4 | semester |
| 5 | start_date |
| 6 | end_date |
| 7 | application_start_date |
| 8 | application_deadline |
| 9 | max_capacity |
| 10 | current_enrollment |
| 11 | is_active |
| 12 | created_at |
| 13 | updated_at |

**Result**: ❌ `program_id` is NOT a column in the `intakes` table. It has never existed — not in `002_core_schema.sql`, not in any migration. The relationship between programs and intakes is managed through the `program_intakes` junction table.

### Impact

Since `normalize_data.sql` is wrapped in `BEGIN...COMMIT`, the `DELETE FROM intakes WHERE program_id NOT IN...` statement would cause a runtime SQL error:
```
ERROR: column "program_id" does not exist
```
This would roll back the **entire transaction**, meaning ALL normalization steps (phone normalization, nationality defaults, orphan cleanup, etc.) would be skipped.

---

## 2. Step-by-Step Normalization Effect Verification

### Section 1: PROFILES Normalization

| Step | SQL in normalize_data.sql | Live Data Check | Effect Present? | Source |
|------|--------------------------|-----------------|-----------------|--------|
| Phone normalization (+260) | `UPDATE profiles SET phone = '+260' \|\| SUBSTRING(phone FROM 2) WHERE phone ~ '^0[0-9]{9}' AND phone NOT LIKE '+%'` | 0 non-+260 phones (all 22 profiles have +260 format or NULL) | ✅ | `seed_and_normalize_data.sql` Section 4 OR clean data entry |
| Nationality default | `UPDATE profiles SET nationality = 'Zambian' WHERE nationality IS NULL OR nationality = ''` | 0 NULL nationalities (21 Zambian, 1 Zimbabwean) | ✅ | `seed_and_normalize_data.sql` Section 4 (normalized 'Zambia' → 'Zambian') |
| NULL first_name fill | `UPDATE profiles SET first_name = '' WHERE first_name IS NULL` | 0 NULL first_names | ✅ | Clean data entry (all profiles have names) |
| NULL last_name fill | `UPDATE profiles SET last_name = '' WHERE last_name IS NULL` | 0 NULL last_names | ✅ | Clean data entry |
| NULL email fill | `UPDATE profiles SET email = '' WHERE email IS NULL` | 0 NULL emails | ✅ | Clean data entry (email required for registration) |

**Analysis**: Phone normalization was likely unnecessary (data entered correctly via the app's +260 validation). Nationality normalization was done by `seed_and_normalize_data.sql` which fixed 'Zambia' → 'Zambian'. The NULL name/email fills were unnecessary — the app requires these fields at registration.

### Section 2: APPLICATIONS Normalization

| Step | SQL in normalize_data.sql | Live Data Check | Effect Present? | Source |
|------|--------------------------|-----------------|-----------------|--------|
| Status normalization | `UPDATE applications SET status = 'draft' WHERE status NOT IN (valid set)` | All 44 applications have valid statuses: approved(27), draft(1), rejected(8), submitted(5), under_review(3) | ✅ | Clean data entry |
| created_at fill | `UPDATE applications SET created_at = NOW() WHERE created_at IS NULL` | Cannot verify retroactively | Unknown | Likely clean data entry |
| updated_at fill | `UPDATE applications SET updated_at = created_at WHERE updated_at IS NULL` | Cannot verify retroactively | Unknown | Likely clean data entry |

**Note**: The status normalization in `normalize_data.sql` is missing `pending_documents` from the valid set. The valid enum per the codebase is: `draft, submitted, under_review, pending_documents, approved, rejected, waitlisted`. This would incorrectly normalize `pending_documents` to `draft` if any existed.

### Section 3: ORPHAN CLEANUP

| Step | SQL in normalize_data.sql | Live Data Check | Effect Present? | Source |
|------|--------------------------|-----------------|-----------------|--------|
| Orphan applications | `DELETE FROM applications WHERE user_id NOT IN (SELECT id FROM profiles)` | 0 orphan applications | ✅ | Clean data (FK constraints enforce this) |
| Orphan documents (legacy) | `DELETE FROM documents WHERE application_id NOT IN (SELECT id FROM applications)` | documents table has 0 rows | ✅ Safe | Table was always empty |
| Orphan payments | `DELETE FROM payments WHERE application_id NOT IN (SELECT id FROM applications)` | 0 orphan payments | ✅ | Clean data (FK constraints enforce this) |

**Analysis**: The orphan cleanup targets are all clean. The `documents` table (legacy, unused) has 0 rows, making the DELETE a no-op regardless.

### Section 4: PROGRAMS / INTAKES Normalization

| Step | SQL in normalize_data.sql | Live Data Check | Effect Present? | Source |
|------|--------------------------|-----------------|-----------------|--------|
| Empty program names | `UPDATE programs SET name = 'Unnamed Program' WHERE name IS NULL OR TRIM(name) = ''` | All programs have names | ✅ | Clean data entry |
| Intake date ordering | `UPDATE intakes SET start_date = end_date, end_date = start_date WHERE start_date > end_date` | Cannot verify retroactively | Unknown | Likely clean data |
| Orphan programs | `DELETE FROM programs WHERE institution_id NOT IN (SELECT id FROM institutions)` | All programs linked to valid institutions | ✅ | `seed_and_normalize_data.sql` Section 2 |
| **Orphan intakes** | `DELETE FROM intakes WHERE program_id NOT IN (SELECT id FROM programs)` | ❌ **WOULD FAIL** — `intakes.program_id` does not exist | ❌ FATAL | Bug in migration |

---

## 3. Documents Table Cleanup Safety Assessment

The `normalize_data.sql` contains:
```sql
DELETE FROM documents
WHERE application_id IS NOT NULL
  AND application_id NOT IN (SELECT id FROM applications);
```

**Safety assessment**: ✅ SAFE
- The `documents` table has **0 rows** (confirmed via Neon MCP)
- It is a legacy table, never used by the current application
- The DELETE would be a no-op
- The `application_documents` table is the active document storage (not `documents`)

---

## 4. Which Normalization Steps Were Skipped?

Since `normalize_data.sql` would fail on the `intakes.program_id` reference and the entire transaction would roll back, **ALL steps were skipped**:

| Step | Skipped? | Covered Elsewhere? |
|------|----------|-------------------|
| Phone normalization (+260) | ✅ Skipped | ⚠️ Partially — `seed_and_normalize_data.sql` does NOT normalize phones, but data was entered correctly |
| Nationality default to 'Zambian' | ✅ Skipped | ✅ `seed_and_normalize_data.sql` Section 4 normalizes 'Zambia' → 'Zambian' |
| NULL first_name/last_name/email fill | ✅ Skipped | ⚠️ Not covered, but data is clean (app requires these fields) |
| Status normalization | ✅ Skipped | ⚠️ Not covered, but data is clean |
| Timestamp fill (created_at/updated_at) | ✅ Skipped | ⚠️ Not covered, but data is clean |
| Orphan application cleanup | ✅ Skipped | ⚠️ Not covered, but FK constraints prevent orphans |
| Orphan document cleanup | ✅ Skipped | ⚠️ Not covered, but table has 0 rows |
| Orphan payment cleanup | ✅ Skipped | ⚠️ Not covered, but FK constraints prevent orphans |
| Program name fill | ✅ Skipped | ⚠️ Not covered, but data is clean |
| Intake date ordering | ✅ Skipped | ⚠️ Not covered, but data is clean |
| Orphan program cleanup | ✅ Skipped | ✅ `seed_and_normalize_data.sql` Section 2 links all programs to institutions |
| Orphan intake cleanup (FATAL) | ❌ Would fail | N/A — `intakes.program_id` doesn't exist |

**Key finding**: The `seed_and_normalize_data.sql` migration (Ghost #4, confirmed fully applied out-of-band) covered the most critical normalization: nationality normalization, institution linking, and status history backfill. The remaining normalize_data.sql steps were either unnecessary (data was clean) or are safety nets that can be re-applied.

---

## 5. Additional Bug: Missing `pending_documents` Status

The status normalization in `normalize_data.sql`:
```sql
UPDATE applications SET status = 'draft'
WHERE status IS NULL
   OR status NOT IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'waitlisted');
```

This is missing `pending_documents` from the valid set. The codebase recognizes 7 valid statuses:
- `draft`, `submitted`, `under_review`, `pending_documents`, `approved`, `rejected`, `waitlisted`

If any application had `status = 'pending_documents'`, this migration would incorrectly reset it to `draft`.

---

## 6. Recommended Corrected Migration

The corrected `normalize_data.sql` should:
1. Remove the `intakes.program_id` reference entirely (use `program_intakes` junction table instead)
2. Add `pending_documents` to the valid status set
3. Keep all other normalization steps as safety nets
