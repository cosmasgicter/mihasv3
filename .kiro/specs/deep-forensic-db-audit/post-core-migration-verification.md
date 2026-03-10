# Post-Core Migration Verification Report — Task 2.3

## Summary

All 9 post-core migration files verified against the live Neon database (project: `wild-bar-37055823`).

| # | Migration File | In migration_history? | Live Schema Status | Assessment |
|---|---|---|---|---|
| 1 | `add_csrf_tokens_table.sql` | ✅ Yes | ✅ All columns, indexes, FKs match | **Applied (recorded)** |
| 2 | `add_password_reset_tokens_table.sql` | ✅ Yes | ✅ All columns, indexes, FKs match | **Applied (recorded)** |
| 3 | `add_login_attempts_table.sql` | ✅ Yes | ✅ All columns, indexes match | **Applied (recorded)** |
| 4 | `add_audit_retention_category.sql` | ✅ Yes | ✅ Column, CHECK constraint, index match | **Applied (recorded)** |
| 5 | `add_idempotency_and_status_history.sql` | ❌ Ghost | ⚠️ Partially applied — column conflict | **Partially applied out-of-band** |
| 6 | `add_version_and_nationality.sql` | ❌ Ghost | ⚠️ Partially applied — type mismatch | **Partially applied out-of-band** |
| 7 | `normalize_data.sql` | ❌ Ghost | ❌ Would fail on `intakes.program_id` | **NOT applied (bug)** |
| 8 | `seed_and_normalize_data.sql` | ❌ Ghost | ✅ All effects present | **Applied out-of-band (fully)** |
| 9 | `seed_program_intakes_and_requirements.sql` | ❌ Ghost | ✅ All effects present | **Applied out-of-band (fully)** |

---

## Migration 1: `add_csrf_tokens_table.sql` — ✅ APPLIED (RECORDED)

**In migration_history**: Yes

### Columns Verified
| Column | Migration Expects | Live Schema | Match |
|--------|------------------|-------------|-------|
| id | UUID PK DEFAULT gen_random_uuid() | uuid NOT NULL DEFAULT gen_random_uuid() | ✅ |
| user_id | UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE | uuid NOT NULL FK→profiles(id) CASCADE | ✅ |
| token_hash | VARCHAR(64) NOT NULL | varchar(64) NOT NULL | ✅ |
| expires_at | TIMESTAMPTZ NOT NULL | timestamptz NOT NULL | ✅ |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | timestamptz NOT NULL DEFAULT now() | ✅ |

### Indexes Verified
| Index | Migration Expects | Live Schema | Match |
|-------|------------------|-------------|-------|
| csrf_tokens_pkey | UNIQUE btree (id) | ✅ EXISTS | ✅ |
| idx_csrf_tokens_user_id | btree (user_id) | ✅ EXISTS | ✅ |
| idx_csrf_tokens_token_hash | btree (token_hash) | ✅ EXISTS | ✅ |

### Foreign Keys Verified
| Constraint | Column | References | ON DELETE | Match |
|-----------|--------|-----------|-----------|-------|
| csrf_tokens_user_id_fkey | user_id | profiles(id) | CASCADE | ✅ |

---

## Migration 2: `add_password_reset_tokens_table.sql` — ✅ APPLIED (RECORDED)

**In migration_history**: Yes

### Columns Verified
| Column | Migration Expects | Live Schema | Match |
|--------|------------------|-------------|-------|
| id | UUID PK DEFAULT gen_random_uuid() | uuid NOT NULL DEFAULT gen_random_uuid() | ✅ |
| user_id | UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE | uuid NOT NULL FK→profiles(id) CASCADE | ✅ |
| token_hash | VARCHAR(64) NOT NULL | varchar(64) NOT NULL | ✅ |
| expires_at | TIMESTAMPTZ NOT NULL | timestamptz NOT NULL | ✅ |
| used_at | TIMESTAMPTZ (nullable) | timestamptz YES (nullable) | ✅ |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | timestamptz NOT NULL DEFAULT now() | ✅ |

### Indexes Verified
| Index | Migration Expects | Live Schema | Match |
|-------|------------------|-------------|-------|
| password_reset_tokens_pkey | UNIQUE btree (id) | ✅ EXISTS | ✅ |
| idx_prt_user_id | btree (user_id) | ✅ EXISTS | ✅ |
| idx_prt_token_hash | btree (token_hash) | ✅ EXISTS | ✅ |

### Foreign Keys Verified
| Constraint | Column | References | ON DELETE | Match |
|-----------|--------|-----------|-----------|-------|
| password_reset_tokens_user_id_fkey | user_id | profiles(id) | CASCADE | ✅ |

---

## Migration 3: `add_login_attempts_table.sql` — ✅ APPLIED (RECORDED)

**In migration_history**: Yes

### Columns Verified
| Column | Migration Expects | Live Schema | Match |
|--------|------------------|-------------|-------|
| id | UUID PK DEFAULT gen_random_uuid() | uuid NOT NULL DEFAULT gen_random_uuid() | ✅ |
| email_hash | VARCHAR(64) NOT NULL | varchar(64) NOT NULL | ✅ |
| ip_hash | VARCHAR(64) NOT NULL | varchar(64) NOT NULL | ✅ |
| attempted_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | timestamptz NOT NULL DEFAULT now() | ✅ |
| success | BOOLEAN NOT NULL DEFAULT FALSE | boolean NOT NULL DEFAULT false | ✅ |

### Indexes Verified
| Index | Migration Expects | Live Schema | Match |
|-------|------------------|-------------|-------|
| login_attempts_pkey | UNIQUE btree (id) | ✅ EXISTS | ✅ |
| idx_login_attempts_email_hash | btree (email_hash) | ✅ EXISTS | ✅ |
| idx_login_attempts_attempted_at | btree (attempted_at) | ✅ EXISTS | ✅ |
| idx_login_attempts_email_time | btree (email_hash, attempted_at DESC) | ✅ EXISTS | ✅ |

### Foreign Keys
None expected, none present. ✅

---

## Migration 4: `add_audit_retention_category.sql` — ✅ APPLIED (RECORDED)

**In migration_history**: Yes

### Column Verified
| Column | Migration Expects | Live Schema | Match |
|--------|------------------|-------------|-------|
| retention_category | VARCHAR(20) NOT NULL DEFAULT 'standard' | varchar(20) NOT NULL DEFAULT 'standard' | ✅ |

### CHECK Constraint Verified
| Constraint | Migration Expects | Live Schema | Match |
|-----------|------------------|-------------|-------|
| chk_retention_category | CHECK (retention_category IN ('standard', 'security')) | ✅ EXISTS — `CHECK (retention_category IN ('standard', 'security'))` | ✅ |

### Index Verified
| Index | Migration Expects | Live Schema | Match |
|-------|------------------|-------------|-------|
| idx_audit_logs_retention | btree (retention_category, created_at) | ✅ EXISTS | ✅ |

---

## Migration 5: `add_idempotency_and_status_history.sql` — ⚠️ PARTIALLY APPLIED OUT-OF-BAND

**In migration_history**: ❌ No (Ghost Migration)

### `idempotency_keys` Table — ✅ FULLY MATCHES

| Column | Migration Expects | Live Schema | Match |
|--------|------------------|-------------|-------|
| key | TEXT PRIMARY KEY | text NOT NULL PK | ✅ |
| endpoint | TEXT NOT NULL | text NOT NULL | ✅ |
| response_json | JSONB NOT NULL | jsonb NOT NULL | ✅ |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | timestamptz NOT NULL DEFAULT now() | ✅ |

**Indexes**:
| Index | Migration Expects | Live Schema | Match |
|-------|------------------|-------------|-------|
| idempotency_keys_pkey | UNIQUE btree (key) | ✅ EXISTS | ✅ |
| idx_idempotency_keys_created | btree (created_at) | ✅ EXISTS | ✅ |

### `application_status_history` Table — ⚠️ COLUMN CONFLICT

The table was originally created by `003_supporting_tables.sql` (core schema). The ghost migration attempted to `CREATE TABLE IF NOT EXISTS` which was a no-op. The `old_status` and `new_status` columns were added out-of-band via ALTER TABLE.

**Full Live Schema (11 columns)**:
| Column | Data Type | Nullable | Default | Source |
|--------|-----------|----------|---------|--------|
| id | uuid | NO | gen_random_uuid() | Core (003) |
| application_id | uuid | NO | — | Core (003) |
| **status** | **varchar(20)** | **NO** | — | **Core (003)** |
| changed_by | uuid | YES | — | Core (003) |
| notes | text | YES | — | Core (003) |
| changes | jsonb | YES | — | Core (003) |
| ip_address | varchar(45) | YES | — | Core (003) |
| user_agent | text | YES | — | Core (003) |
| created_at | timestamptz | YES | now() | Core (003) |
| **old_status** | **text** | **YES** | — | **Out-of-band (ghost migration effect)** |
| **new_status** | **text** | **YES** | — | **Out-of-band (ghost migration effect)** |

### ⚠️ COLUMN CONFLICT DETAIL

The table has ALL THREE status-related columns:

1. **`status`** (VARCHAR(20) NOT NULL) — from `003_supporting_tables.sql` core schema
2. **`old_status`** (TEXT, nullable) — added out-of-band, matches ghost migration intent
3. **`new_status`** (TEXT, nullable) — added out-of-band, BUT ghost migration says NOT NULL

**Nullability Mismatches**:
| Column | Ghost Migration Defines | Live Schema | Conflict |
|--------|------------------------|-------------|----------|
| new_status | TEXT NOT NULL | TEXT nullable | ⚠️ Relaxed from NOT NULL to nullable |
| changed_by | UUID NOT NULL REFERENCES profiles(id) | UUID nullable | ⚠️ Core schema is nullable, ghost migration wanted NOT NULL |

**Data Evidence** (all 10 rows sampled):
- `status` always equals `new_status` (redundant data)
- `old_status` is always `'submitted'` (backfilled by `seed_and_normalize_data.sql`)
- `new_status` is always populated (no NULLs despite nullable column)

**Indexes**:
| Index | Migration Expects | Live Schema | Match |
|-------|------------------|-------------|-------|
| idx_status_history_app | btree (application_id) | ✅ EXISTS | ✅ |
| idx_status_history_created | — (not in this migration) | EXISTS (from core) | N/A |

---

## Migration 6: `add_version_and_nationality.sql` — ⚠️ PARTIALLY APPLIED OUT-OF-BAND

**In migration_history**: ❌ No (Ghost Migration)

| Change | Migration Expects | Live Schema | Match |
|--------|------------------|-------------|-------|
| applications.version | INTEGER NOT NULL DEFAULT 1 | integer NOT NULL DEFAULT 1 | ✅ |
| profiles.nationality | TEXT (no default) | VARCHAR(100) DEFAULT 'Zambian' | ⚠️ Type/default mismatch |

**Analysis**: `applications.version` was successfully added (either by this migration or manually). `profiles.nationality` already existed from `002_core_schema.sql` with VARCHAR(100) and DEFAULT 'Zambian', so the ghost migration's `ADD COLUMN IF NOT EXISTS nationality TEXT` was a no-op.

---

## Migration 7: `normalize_data.sql` — ❌ NOT APPLIED (BUG)

**In migration_history**: ❌ No (Ghost Migration)

**CRITICAL BUG**: The migration contains `DELETE FROM intakes WHERE program_id NOT IN (SELECT id FROM programs)`. The `intakes` table has NEVER had a `program_id` column (confirmed: 13 columns, none named `program_id`). This statement would cause a runtime SQL error, and since the migration is wrapped in `BEGIN...COMMIT`, the entire transaction would roll back — meaning NONE of the normalization steps were applied.

**However**, the data appears normalized (phones in +260 format, no NULL nationalities, valid statuses). This is because `seed_and_normalize_data.sql` (Ghost #4) performed overlapping normalization that was applied out-of-band.

---

## Migration 8: `seed_and_normalize_data.sql` — ✅ APPLIED OUT-OF-BAND (FULLY)

**In migration_history**: ❌ No (Ghost Migration)

| Effect | Evidence | Applied? |
|--------|----------|----------|
| institutions.description column | ✅ Column exists | ✅ |
| institutions.full_name column | Already in core schema | No-op |
| programs.institution_id column | Already in core schema | No-op |
| 10 default settings seeded | 10 rows in settings table | ✅ |
| Status history backfill (new_status = status) | All rows have old_status + new_status | ✅ |
| Nationality normalization | All values 'Zambian' or 'Zimbabwean' | ✅ |

---

## Migration 9: `seed_program_intakes_and_requirements.sql` — ✅ APPLIED OUT-OF-BAND (FULLY)

**In migration_history**: ❌ No (Ghost Migration)

| Effect | Expected | Live | Applied? |
|--------|----------|------|----------|
| program_intakes rows | 12 (4 programs × 3 intakes) | 12 rows | ✅ |
| course_requirements rows | 18 (5+5+5+3 across 4 programs) | 18 rows | ✅ |

---

## Key Findings

### CRITICAL: `application_status_history` Column Conflict

The table has THREE status columns that create redundancy and confusion:

1. **`status`** (VARCHAR(20) NOT NULL) — original column from core schema, used by some code paths
2. **`old_status`** (TEXT nullable) — added out-of-band for transition tracking
3. **`new_status`** (TEXT nullable) — added out-of-band for transition tracking, `status` == `new_status` in all rows

**Code references BOTH patterns**:
- Some code writes to `status` column (core pattern)
- Some code writes to `old_status`/`new_status` columns (ghost migration pattern)
- `seed_and_normalize_data.sql` backfilled `new_status = status` to sync them

**Resolution needed**: Either:
- (a) Drop `status` column and use only `old_status`/`new_status` (breaking change for code using `status`)
- (b) Drop `old_status`/`new_status` and keep `status` (loses transition tracking)
- (c) Keep all three but ensure code consistently writes to all (current state, fragile)
- (d) **Recommended**: Keep `old_status`/`new_status` as the canonical columns, add a trigger or code-level enforcement to keep `status` in sync with `new_status` for backward compatibility, then deprecate `status` over time

### CRITICAL: `normalize_data.sql` Cannot Run

The `intakes.program_id` reference is invalid. The migration needs a corrected version that removes this statement. The normalization it was supposed to perform was already done by `seed_and_normalize_data.sql`.

### HIGH: 5 Ghost Migrations Not in migration_history

All 5 ghost migrations should be recorded in `migration_history` to prevent re-application attempts and maintain audit trail integrity.
