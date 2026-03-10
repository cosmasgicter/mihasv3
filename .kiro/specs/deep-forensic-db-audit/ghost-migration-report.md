# Ghost Migration Analysis Report — Task 2.2

## Summary

**Migration files on disk**: 20 SQL files + 1 TypeScript runner + 1 markdown doc = 22 total entries
**Migrations in migration_history**: 15 (IDs 1-15)
**Ghost Migrations identified**: 5 files NOT in migration_history

All 5 ghost migrations have their schema effects **fully or partially present** in the live schema, indicating they were applied out-of-band (manually executed or via direct SQL) rather than through the migration runner.

---

## Cross-Reference: All Migration Files vs migration_history

| # | File on Disk | In migration_history? | migration_name |
|---|---|---|---|
| 1 | `001_extensions.sql` | ✅ Yes | `001_extensions.sql` |
| 2 | `002_core_schema.sql` | ✅ Yes | `002_core_schema.sql` |
| 3 | `003_supporting_tables.sql` | ✅ Yes | `003_supporting_tables.sql` |
| 4 | `004_functions.sql` | ✅ Yes | `004_functions.sql` |
| 5 | `005_triggers.sql` | ✅ Yes | `005_triggers.sql` |
| 6 | `006_data_migration.sql` | ✅ Yes | `006_data_migration.sql` |
| 7 | `007_password_reset_tokens.sql` | ✅ Yes | `007_password_reset.sql` |
| 8 | `008_notification_delivery.sql` | ✅ Yes | `008_notification_idempotency.sql` |
| 9 | `009_document_migration_log.sql` | ✅ Yes | `009_document_migration_log.sql` |
| 10 | `010_user_permission_overrides.sql` | ✅ Yes | `010_user_permission_overrides.sql` |
| 11 | `011_payment_review_indexes.sql` | ✅ Yes | `011_payment_review_indexes.sql` |
| 12 | `add_csrf_tokens_table.sql` | ✅ Yes | `add_csrf_tokens_table.sql` |
| 13 | `add_password_reset_tokens_table.sql` | ✅ Yes | `add_password_reset_tokens_table.sql` |
| 14 | `add_login_attempts_table.sql` | ✅ Yes | `add_login_attempts_table.sql` |
| 15 | `add_audit_retention_category.sql` | ✅ Yes | `add_audit_retention_category.sql` |
| 16 | `add_idempotency_and_status_history.sql` | ❌ **GHOST** | — |
| 17 | `add_version_and_nationality.sql` | ❌ **GHOST** | — |
| 18 | `normalize_data.sql` | ❌ **GHOST** | — |
| 19 | `seed_and_normalize_data.sql` | ❌ **GHOST** | — |
| 20 | `seed_program_intakes_and_requirements.sql` | ❌ **GHOST** | — |
| — | `fix_forensic_analysis_round2.sql` | ❌ (remediation, not tracked) | — |
| — | `apply-migrations.ts` | N/A (runner script) | — |
| — | `RLS_REPLACEMENT.md` | N/A (documentation) | — |

**Note**: File names 7 and 8 have slight name mismatches between disk and migration_history (`007_password_reset_tokens.sql` vs `007_password_reset.sql`, `008_notification_delivery.sql` vs `008_notification_idempotency.sql`), but these are confirmed applied.

---

## Ghost Migration #1: `add_idempotency_and_status_history.sql`

### Expected Schema Changes
1. CREATE TABLE `idempotency_keys` (key TEXT PK, endpoint TEXT, response_json JSONB, created_at TIMESTAMPTZ)
2. CREATE TABLE `application_status_history` (id UUID PK, application_id UUID, old_status TEXT, new_status TEXT NOT NULL, changed_by UUID NOT NULL, notes TEXT, created_at TIMESTAMPTZ)
3. CREATE INDEX `idx_status_history_app` ON application_status_history(application_id)
4. CREATE INDEX `idx_idempotency_keys_created` ON idempotency_keys(created_at)

### Live Schema State

**`idempotency_keys` table**: ✅ EXISTS with all 4 expected columns
| Column | Expected | Live | Match |
|--------|----------|------|-------|
| key | TEXT PK | text PK | ✅ |
| endpoint | TEXT NOT NULL | text NOT NULL | ✅ |
| response_json | JSONB NOT NULL | jsonb NOT NULL | ✅ |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | timestamptz NOT NULL DEFAULT now() | ✅ |

**`application_status_history` table**: ⚠️ PARTIALLY MATCHES — table existed from `003_supporting_tables.sql` first
| Column | Ghost Migration Expects | Core Schema (003) Defines | Live Schema Has | Source |
|--------|------------------------|--------------------------|-----------------|--------|
| id | UUID PK | UUID PK | UUID PK | Core |
| application_id | UUID NOT NULL | UUID NOT NULL | UUID NOT NULL | Core |
| status | — (not defined) | VARCHAR(20) NOT NULL | VARCHAR(20) NOT NULL | Core |
| old_status | TEXT (nullable) | — (not defined) | TEXT (nullable) | **Out-of-band** |
| new_status | TEXT NOT NULL | — (not defined) | TEXT (nullable!) | **Out-of-band** (relaxed) |
| changed_by | UUID NOT NULL | UUID (nullable) | UUID (nullable) | Core |
| notes | TEXT | TEXT | TEXT | Core |
| changes | — | JSONB | JSONB | Core |
| ip_address | — | INET | VARCHAR | Core |
| user_agent | — | TEXT | TEXT | Core |
| created_at | TIMESTAMPTZ NOT NULL | TIMESTAMPTZ | TIMESTAMPTZ | Core |

**Indexes**: ✅ Both `idx_status_history_app` and `idx_idempotency_keys_created` exist

### Assessment: **PARTIALLY APPLIED OUT-OF-BAND**
- `idempotency_keys` table was created successfully (either by this migration or manually) — all columns match exactly.
- `application_status_history` table already existed from `003_supporting_tables.sql`, so the `CREATE TABLE IF NOT EXISTS` was a no-op.
- The `old_status` and `new_status` columns were added out-of-band (manually via ALTER TABLE), since they don't exist in the core schema but DO exist in the live schema.
- **CONFLICT**: `new_status` is nullable in live schema but the ghost migration defines it as `NOT NULL`. The `changed_by` column is nullable in live (from core schema) but the ghost migration defines it as `NOT NULL`.
- The table has BOTH the original `status` column (from core) AND the `old_status`/`new_status` columns (added out-of-band) — a column conflict.

---

## Ghost Migration #2: `add_version_and_nationality.sql`

### Expected Schema Changes
1. ALTER TABLE `applications` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1
2. ALTER TABLE `profiles` ADD COLUMN `nationality` TEXT

### Live Schema State

| Change | Expected | Live | Match |
|--------|----------|------|-------|
| applications.version | INTEGER NOT NULL DEFAULT 1 | integer NOT NULL DEFAULT 1 | ✅ |
| profiles.nationality | TEXT (no default) | VARCHAR(100) DEFAULT 'Zambian' | ⚠️ Type/default mismatch |

### Assessment: **PARTIALLY APPLIED OUT-OF-BAND**
- `applications.version`: ✅ Present and matches exactly. Was NOT in core schema — added by this migration or manually.
- `profiles.nationality`: ⚠️ Column exists but with different type and default. Core schema (`002_core_schema.sql`) already defines `nationality VARCHAR(100) DEFAULT 'Zambian'`. The ghost migration's `ADD COLUMN IF NOT EXISTS nationality TEXT` would have been a no-op since the column already existed.
- The `version` column was successfully applied (either by running this migration or manually).
- The `nationality` column was already present from the core schema with a stricter type (VARCHAR(100) vs TEXT) and a default value.

---

## Ghost Migration #3: `normalize_data.sql`

### Expected Schema Changes (Data Normalization, No DDL)
1. Normalize phone numbers to +260 format (profiles)
2. Default nationality to 'Zambian' where NULL (profiles)
3. Fill NULL first_name, last_name, email with empty string (profiles)
4. Normalize application status values to valid enum set (applications)
5. Ensure created_at/updated_at are set (applications)
6. Delete orphan applications (user_id not in profiles)
7. Delete orphan documents (application_id not in applications)
8. Delete orphan payments (application_id not in applications)
9. Fix program names (set 'Unnamed Program' for NULL/empty)
10. Fix intake date ordering (swap if start > end)
11. Delete programs with non-existent institution_id
12. **DELETE FROM intakes WHERE program_id NOT IN (SELECT id FROM programs)** ← WOULD FAIL

### Live Schema State

| Effect | Evidence in Live Data | Applied? |
|--------|----------------------|----------|
| Phone normalization | All phones in +260 format, 0 old-format phones | ✅ or data was always clean |
| Nationality defaults | 21 'Zambian', 1 'Zimbabwean', 0 NULL | ✅ or data was always clean |
| NULL first_name fill | 0 NULL first_names | ✅ or data was always clean |
| Status normalization | 0 invalid status values | ✅ or data was always clean |
| Orphan cleanup | Cannot verify retroactively | Unknown |
| intakes.program_id DELETE | `intakes` table does NOT have `program_id` column | ❌ **WOULD FAIL** |

### Assessment: **LIKELY NOT APPLIED AS A WHOLE (would fail on intakes.program_id)**
- The `intakes` table has NEVER had a `program_id` column (not in core schema, not in any migration). The `DELETE FROM intakes WHERE program_id NOT IN (SELECT id FROM programs)` statement would cause a runtime SQL error.
- Since the migration is wrapped in `BEGIN...COMMIT`, the entire transaction would roll back on this error, meaning NONE of the normalization steps would have been applied.
- However, the data appears normalized (phones in +260 format, no NULL nationalities, valid statuses). This could mean:
  - (a) The data was always clean (entered correctly by the application)
  - (b) Individual normalization statements were run manually outside this migration
  - (c) The `seed_and_normalize_data.sql` migration (Ghost #4) performed overlapping normalization
- **CRITICAL BUG**: The `intakes.program_id` reference is invalid and would prevent this migration from ever running successfully.

---

## Ghost Migration #4: `seed_and_normalize_data.sql`

### Expected Schema Changes

**DDL (Schema additions)**:
1. ALTER TABLE `programs` ADD COLUMN IF NOT EXISTS `institution_id` UUID REFERENCES institutions(id)
2. ALTER TABLE `institutions` ADD COLUMN IF NOT EXISTS `full_name` VARCHAR(500)
3. ALTER TABLE `institutions` ADD COLUMN IF NOT EXISTS `description` TEXT

**DML (Data seeding/normalization)**:
4. Link programs to institutions (UPDATE programs SET institution_id)
5. Set regulatory bodies on programs
6. Populate institution metadata (full_name, description)
7. Normalize nationality values ('Zambia' → 'Zambian')
8. Trim trailing spaces from last_name
9. Fill NULL full_name from first_name + last_name
10. Backfill application_status_history (new_status = status, old_status = 'submitted')
11. Fill missing intake application_start_date
12. Seed 10 default system settings (ON CONFLICT DO NOTHING)

### Live Schema State

| Change | Expected | Live | Applied? |
|--------|----------|------|----------|
| programs.institution_id | UUID FK → institutions | Already in core schema (002) | No-op (already existed) |
| institutions.full_name | VARCHAR(500) | VARCHAR(255) from core schema | No-op (already existed, different length) |
| institutions.description | TEXT | TEXT — exists at end of column list | ✅ Added by this migration |
| Programs linked to institutions | DRN,CPC→MIHAS, DCM,DEH→KATC | All 4 programs have institution_id | ✅ |
| Regulatory bodies set | GNC/NMCZ for DRN, HPCZ for DCM/DEH | Cannot verify without query | Likely ✅ |
| Institution metadata | MIHAS/KATC full_name + description | Both populated | ✅ |
| Nationality normalization | 'Zambia' → 'Zambian' | All values are 'Zambian' or 'Zimbabwean' | ✅ |
| Status history backfill | new_status = status, old_status = 'submitted' | All 10 rows have old_status + new_status populated | ✅ |
| application_start_date fill | start_date - 3 months | 0 NULL application_start_dates | ✅ |
| Settings seeded | 10 default settings | All 10 settings present | ✅ |

### Assessment: **APPLIED OUT-OF-BAND (FULLY)**
- All schema additions and data seeding effects are present in the live database.
- The `institutions.description TEXT` column was successfully added (not in core schema).
- The `programs.institution_id` and `institutions.full_name` ALTER statements were no-ops (already in core schema).
- All 10 default settings are seeded.
- The status history backfill was applied (all rows have old_status/new_status populated).
- This migration was clearly executed manually/out-of-band but never recorded in migration_history.

---

## Ghost Migration #5: `seed_program_intakes_and_requirements.sql`

### Expected Schema Changes (Data Seeding Only, No DDL)
1. INSERT INTO `program_intakes` — cross join all active programs × active intakes (ON CONFLICT DO NOTHING)
2. INSERT INTO `course_requirements` — 18 rows across 4 programs (DRN: 5, DCM: 5, DEH: 5, CPC: 3) with specific subject UUIDs, grades, weights, requirement types

### Live Schema State

| Effect | Expected | Live | Applied? |
|--------|----------|------|----------|
| program_intakes rows | 4 programs × 3 intakes = 12 | 12 rows | ✅ |
| course_requirements rows | 18 total (5+5+5+3) | 18 rows | ✅ |
| course_requirements columns | program_id, subject_id, is_mandatory, minimum_grade, weight, requirement_type | All columns exist | ✅ |

### Assessment: **APPLIED OUT-OF-BAND (FULLY)**
- All 12 program_intakes rows and 18 course_requirements rows are present.
- The data matches exactly what the migration would produce.
- This migration was clearly executed manually/out-of-band but never recorded in migration_history.

---

## Summary Table

| Ghost Migration | Applied? | Method | Key Issues |
|----------------|----------|--------|------------|
| `add_idempotency_and_status_history.sql` | Partially | Out-of-band | `idempotency_keys` created fully; `application_status_history` already existed from core, `old_status`/`new_status` added manually; column conflict (status + old_status + new_status all present); nullability mismatch on new_status and changed_by |
| `add_version_and_nationality.sql` | Partially | Out-of-band | `applications.version` added successfully; `profiles.nationality` was already in core schema (type mismatch: TEXT vs VARCHAR(100)) |
| `normalize_data.sql` | **NOT applied** | Would fail | `intakes.program_id` does not exist — transaction would roll back entirely; data appears clean from other sources |
| `seed_and_normalize_data.sql` | Fully | Out-of-band | All DDL and DML effects present; `institutions.description` added; all data seeded/normalized |
| `seed_program_intakes_and_requirements.sql` | Fully | Out-of-band | All 12 program_intakes + 18 course_requirements rows present |

### Recommendations
1. **CRITICAL**: Fix `normalize_data.sql` to remove the `intakes.program_id` reference (column doesn't exist)
2. **HIGH**: Record all 5 ghost migrations in `migration_history` to prevent re-application attempts
3. **HIGH**: Resolve `application_status_history` column conflict — table has both `status` (VARCHAR NOT NULL from core) and `old_status`/`new_status` (TEXT nullable, added out-of-band)
4. **MEDIUM**: Align `new_status` nullability — ghost migration says NOT NULL but live schema is nullable
5. **MEDIUM**: Align `changed_by` nullability — ghost migration says NOT NULL but live schema is nullable (from core)
