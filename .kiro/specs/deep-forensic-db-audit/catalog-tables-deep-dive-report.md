# Catalog Tables Deep-Dive Audit Report

**Date:** 2026-03-10
**Task:** 7.6 — Deep-dive catalog tables
**Requirements:** 19.1–19.7
**Tables Audited:** programs, intakes, subjects, institutions, program_intakes, course_requirements

---

## 1. Live Schema Summary

### programs (14 columns)
| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | name | varchar(255) | NO | — |
| 3 | code | varchar(50) | NO | — |
| 4 | description | text | YES | — |
| 5 | duration_months | integer | YES | — |
| 6 | application_fee | numeric | YES | 153.00 |
| 7 | tuition_fee | numeric | YES | — |
| 8 | requirements | jsonb | YES | — |
| 9 | regulatory_body | varchar(100) | YES | — |
| 10 | accreditation_status | varchar(50) | YES | — |
| 11 | is_active | boolean | YES | true |
| 12 | created_at | timestamptz | YES | now() |
| 13 | updated_at | timestamptz | YES | now() |
| 14 | institution_id | uuid | YES | — |

### intakes (13 columns)
| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | name | varchar(255) | NO | — |
| 3 | year | integer | YES | — |
| 4 | semester | varchar(50) | YES | — |
| 5 | start_date | date | YES | — |
| 6 | end_date | date | YES | — |
| 7 | application_start_date | date | YES | — |
| 8 | application_deadline | date | YES | — |
| 9 | max_capacity | integer | YES | — |
| 10 | current_enrollment | integer | YES | 0 |
| 11 | is_active | boolean | YES | true |
| 12 | created_at | timestamptz | YES | now() |
| 13 | updated_at | timestamptz | YES | now() |

**⚠️ CONFIRMED: intakes table does NOT have a `program_id` column.**

### subjects (7 columns)
| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | name | varchar(255) | NO | — |
| 3 | code | varchar(50) | YES | — |
| 4 | category | varchar(100) | YES | — |
| 5 | is_core | boolean | YES | false |
| 6 | is_active | boolean | YES | true |
| 7 | created_at | timestamptz | YES | now() |

### institutions (14 columns)
| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | name | varchar(255) | NO | — |
| 3 | code | varchar(50) | NO | — |
| 4 | type | varchar(100) | YES | — |
| 5 | address | text | YES | — |
| 6 | phone | varchar(20) | YES | — |
| 7 | email | varchar(255) | YES | — |
| 8 | website | varchar(255) | YES | — |
| 9 | accreditation_status | varchar(50) | YES | — |
| 10 | is_active | boolean | YES | true |
| 11 | created_at | timestamptz | YES | now() |
| 12 | updated_at | timestamptz | YES | now() |
| 13 | full_name | varchar(500) | YES | — |
| 14 | description | text | YES | — |

### program_intakes (6 columns)
| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | program_id | uuid | NO | — |
| 3 | intake_id | uuid | NO | — |
| 4 | max_capacity | integer | YES | — |
| 5 | current_enrollment | integer | YES | 0 |
| 6 | created_at | timestamptz | YES | now() |

### course_requirements (8 columns)
| # | Column | Type | Nullable | Default |
|---|--------|------|----------|---------|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | program_id | uuid | YES | — |
| 3 | subject_id | uuid | YES | — |
| 4 | is_mandatory | boolean | YES | true |
| 5 | minimum_grade | integer | NO | — |
| 6 | weight | numeric | YES | 1.0 |
| 7 | requirement_type | varchar(50) | YES | 'core' |
| 8 | created_at | timestamptz | YES | now() |

---

## 2. Constraints & Indexes

### Foreign Keys
| Constraint | Table | Column | References | ON DELETE |
|-----------|-------|--------|------------|----------|
| programs_institution_id_fkey | programs | institution_id | institutions.id | NO ACTION |
| program_intakes_program_id_fkey | program_intakes | program_id | programs.id | CASCADE |
| program_intakes_intake_id_fkey | program_intakes | intake_id | intakes.id | CASCADE |
| course_requirements_program_id_fkey | course_requirements | program_id | programs.id | CASCADE |
| course_requirements_subject_id_fkey | course_requirements | subject_id | subjects.id | NO ACTION |

### Unique Constraints
| Constraint | Table | Columns |
|-----------|-------|---------|
| programs_code_key | programs | (code) |
| institutions_code_key | institutions | (code) |
| program_intakes_program_id_intake_id_key | program_intakes | (program_id, intake_id) ✅ |

### Indexes
| Table | Index | Columns | Unique |
|-------|-------|---------|--------|
| programs | programs_pkey | (id) | YES |
| programs | programs_code_key | (code) | YES |
| programs | idx_programs_code | (code) | NO |
| programs | idx_programs_active | (is_active) WHERE is_active=true | NO |
| intakes | intakes_pkey | (id) | YES |
| intakes | idx_intakes_active | (is_active) WHERE is_active=true | NO |
| intakes | idx_intakes_deadline | (application_deadline) | NO |
| subjects | subjects_pkey | (id) | YES |
| subjects | idx_subjects_active | (is_active) WHERE is_active=true | NO |
| subjects | idx_subjects_category | (category) | NO |
| institutions | institutions_pkey | (id) | YES |
| institutions | institutions_code_key | (code) | YES |
| program_intakes | program_intakes_pkey | (id) | YES |
| program_intakes | program_intakes_program_id_intake_id_key | (program_id, intake_id) | YES |
| program_intakes | idx_prog_intakes_program | (program_id) | NO |
| program_intakes | idx_prog_intakes_intake | (intake_id) | NO |
| course_requirements | course_requirements_pkey | (id) | YES |
| course_requirements | idx_course_req_program | (program_id) | NO |
| course_requirements | idx_course_req_subject | (subject_id) | NO |

---

## 3. Interface vs Live Schema Comparison

### 3.1 ProgramRow (api-src/catalog.ts) vs programs table

| ProgramRow Field | In Live Schema? | Notes |
|-----------------|-----------------|-------|
| id: string | ✅ id (uuid) | OK |
| name: string | ✅ name (varchar) | OK |
| code: string | ✅ code (varchar) | OK |
| description: string \| null | ✅ description (text, nullable) | OK |
| duration_months: number \| null | ✅ duration_months (integer, nullable) | OK |
| application_fee: number \| null | ✅ application_fee (numeric, nullable) | OK |
| tuition_fee: number \| null | ✅ tuition_fee (numeric, nullable) | OK |
| regulatory_body: string \| null | ✅ regulatory_body (varchar, nullable) | OK |
| accreditation_status: string \| null | ✅ accreditation_status (varchar, nullable) | OK |
| institution_id: string \| null | ✅ institution_id (uuid, nullable) | OK |
| institution_name: string \| null | ✅ (JOIN alias from institutions.name) | OK — comes from LEFT JOIN |
| institution_full_name: string \| null | ✅ (JOIN alias from institutions.full_name) | OK — comes from LEFT JOIN |
| is_active: boolean \| null | ✅ is_active (boolean, nullable) | OK |
| created_at: string | ✅ created_at (timestamptz) | OK |
| updated_at: string | ✅ updated_at (timestamptz) | OK |

**Missing from ProgramRow (in live schema but not in interface):**
- `requirements` (jsonb) — intentionally omitted from listPrograms query

**Verdict: ✅ ProgramRow is CORRECT** — all fields match, `requirements` is intentionally excluded from the list query (but included in ProgramRecord in lib/queries.ts).

### 3.2 ProgramRecord (lib/queries.ts) vs programs table

| ProgramRecord Field | In Live Schema? | Notes |
|--------------------|-----------------|-------|
| id: string | ✅ | OK |
| name: string | ✅ | OK |
| code: string | ✅ | OK |
| description: string \| null | ✅ | OK |
| duration_months: number \| null | ✅ | OK |
| application_fee: number \| null | ✅ | OK |
| tuition_fee: number \| null | ✅ | OK |
| requirements: unknown \| null | ✅ requirements (jsonb) | OK |
| regulatory_body: string \| null | ✅ | OK |
| accreditation_status: string \| null | ✅ | OK |
| institution_id: string \| null | ✅ | OK |
| is_active: boolean | ✅ (nullable in DB, non-nullable in interface) | ⚠️ MINOR nullability mismatch |
| created_at: string | ✅ | OK |
| updated_at: string | ✅ | OK |
| institution_name?: string | N/A — JOIN alias | OK (optional) |
| institution_slug?: string | ❌ NO `slug` column on institutions | 🔴 PHANTOM FIELD |
| institution_full_name?: string | N/A — JOIN alias | OK (optional) |

**Issues Found:**
1. **🔴 HIGH — `institution_slug` phantom field**: `ProgramRecord` has `institution_slug?: string` but the `institutions` table has NO `slug` column. This field can never be populated from any query.
2. **⚠️ LOW — `is_active` nullability**: Interface says `boolean` (non-nullable) but DB column is `boolean DEFAULT true` (nullable). Practically safe since default ensures non-null.

**CRITICAL BUG — CatalogQueries omits institution_id:**
The `CatalogQueries.getPrograms()`, `getActivePrograms()`, and `getProgramById()` queries in `lib/queries.ts` explicitly list columns but **omit `institution_id`** from the SELECT list. The comment says "Programs table doesn't have institution_id" — **this is factually wrong**. The `programs` table DOES have `institution_id` (confirmed in live schema, ordinal position 14).

Meanwhile, `api-src/catalog.ts` `listPrograms()` correctly includes `p.institution_id` and JOINs to institutions. So the inline SQL in catalog.ts is correct, but the CatalogQueries query builder is wrong.

### 3.3 IntakeRow (api-src/catalog.ts) vs intakes table

| IntakeRow Field | In Live Schema? | Notes |
|----------------|-----------------|-------|
| id: string | ✅ id (uuid) | OK |
| name: string | ✅ name (varchar) | OK |
| year: number \| null | ✅ year (integer, nullable) | OK |
| semester: string \| null | ✅ semester (varchar, nullable) | OK |
| start_date: string | ✅ start_date (date, nullable) | ⚠️ DB is nullable, interface is non-nullable |
| end_date: string | ✅ end_date (date, nullable) | ⚠️ DB is nullable, interface is non-nullable |
| application_start_date: string \| null | ✅ application_start_date (date, nullable) | OK |
| application_deadline: string | ✅ application_deadline (date, nullable) | ⚠️ DB is nullable, interface is non-nullable |
| max_capacity: number \| null | ✅ max_capacity (integer, nullable) | OK |
| current_enrollment: number \| null | ✅ current_enrollment (integer, nullable) | OK |
| is_active: boolean \| null | ✅ is_active (boolean, nullable) | OK |
| created_at: string | ✅ created_at (timestamptz) | OK |
| updated_at: string | ✅ updated_at (timestamptz) | OK |

**Verdict: ✅ IntakeRow is CORRECT** — all 13 fields match all 13 columns. Minor nullability differences on start_date/end_date/application_deadline are practically safe (these should always be set for valid intakes).

### 3.4 IntakeRecord (lib/queries.ts) vs intakes table

| IntakeRecord Field | In Live Schema? | Notes |
|-------------------|-----------------|-------|
| id: string | ✅ | OK |
| name: string | ✅ | OK |
| year: number | ✅ (nullable in DB) | ⚠️ Minor nullability mismatch |
| semester: string \| null | ✅ | OK |
| start_date: string | ✅ | OK |
| end_date: string | ✅ | OK |
| application_start_date: string \| null | ✅ | OK |
| application_deadline: string | ✅ | OK |
| max_capacity: number | ✅ (nullable in DB) | ⚠️ Minor nullability mismatch |
| current_enrollment: number | ✅ (nullable in DB) | ⚠️ Minor nullability mismatch |
| is_active: boolean | ✅ (nullable in DB) | ⚠️ Minor nullability mismatch |
| created_at: string | ✅ | OK |
| updated_at: string | ✅ | OK |

**Verdict: ✅ IntakeRecord is CORRECT** — all 13 fields match. Minor nullability differences are practically safe.

### 3.5 InstitutionRecord (api-src/catalog.ts) vs institutions table

| InstitutionRecord Field | In Live Schema? | Notes |
|------------------------|-----------------|-------|
| id: string | ✅ id (uuid) | OK |
| name: string | ✅ name (varchar) | OK |
| full_name?: string | ✅ full_name (varchar, nullable) | OK |
| code?: string | ✅ code (varchar, NOT NULL) | ⚠️ DB is NOT NULL, interface is optional |
| description?: string | ✅ description (text, nullable) | OK |
| is_active: boolean | ✅ is_active (boolean, nullable) | OK |
| created_at?: string | ✅ created_at (timestamptz) | OK |
| updated_at?: string | ✅ updated_at (timestamptz) | OK |

**Missing from InstitutionRecord (in live schema but not in interface):**
- `type` (varchar(100), nullable)
- `address` (text, nullable)
- `phone` (varchar(20), nullable)
- `email` (varchar(255), nullable)
- `website` (varchar(255), nullable)
- `accreditation_status` (varchar(50), nullable)

**Verdict: ⚠️ MEDIUM — InstitutionRecord is INCOMPLETE** — 6 columns from the live schema are not represented. These are intentionally omitted from the catalog API (the SELECT query only fetches id, name, full_name, code, description, is_active, created_at, updated_at), so this is a design choice, not a bug. However, the interface should document this.

### 3.6 SubjectRecord (lib/queries.ts) vs subjects table

| SubjectRecord Field | In Live Schema? | Notes |
|--------------------|-----------------|-------|
| id: string | ✅ | OK |
| name: string | ✅ | OK |
| code: string \| null | ✅ code (varchar, nullable) | OK |
| category: string \| null | ✅ category (varchar, nullable) | OK |
| is_core: boolean | ✅ is_core (boolean, nullable) | OK |
| is_active: boolean | ✅ is_active (boolean, nullable) | OK |
| created_at: string | ✅ created_at (timestamptz) | OK |

**Verdict: ✅ SubjectRecord is CORRECT** — all 7 fields match all 7 columns.

---

## 4. CatalogQueries SQL Audit (lib/queries.ts)

### 4.1 getPrograms() — 🔴 CRITICAL BUG
```sql
SELECT id, name, code, description, duration_months,
       application_fee, tuition_fee, requirements,
       regulatory_body, accreditation_status, is_active,
       created_at, updated_at
FROM programs
```
**Missing column: `institution_id`** — The query omits `institution_id` despite it existing in the live schema. The comment above says "Programs table doesn't have institution_id" which is **factually incorrect**.

**Impact:** Any code using `CatalogQueries.getPrograms()` will get programs without `institution_id`, making it impossible to determine which institution a program belongs to. The `ProgramRecord.institution_id` field will always be `undefined`.

### 4.2 getActivePrograms() — 🔴 SAME BUG
Same missing `institution_id` column.

### 4.3 getProgramById() — 🔴 SAME BUG
Same missing `institution_id` column.

### 4.4 getIntakes() — ⚠️ Uses SELECT *
```sql
SELECT * FROM intakes ORDER BY created_at DESC
```
Fragile to schema changes but currently correct (all 13 columns returned).

### 4.5 getActiveIntakes() — ⚠️ Uses SELECT *
Same SELECT * pattern.

### 4.6 getIntakeById() — ⚠️ Uses SELECT *
Same SELECT * pattern.

### 4.7 getSubjects() — ⚠️ Uses SELECT *
```sql
SELECT * FROM subjects WHERE is_active = true ORDER BY name ASC
```
Same SELECT * pattern.

### 4.8 getSubjectById() — ⚠️ Uses SELECT *
Same SELECT * pattern.

---

## 5. api-src/catalog.ts SQL Audit

### 5.1 listPrograms() — ✅ CORRECT
The inline SQL correctly includes `p.institution_id` and JOINs to institutions for `institution_name` and `institution_full_name`. All referenced columns exist in the live schema.

### 5.2 listIntakes() — ✅ CORRECT
All referenced columns (id, name, year, semester, start_date, end_date, application_start_date, application_deadline, max_capacity, current_enrollment, is_active, created_at, updated_at) exist in the intakes table.

### 5.3 createProgram() — ✅ CORRECT
INSERT columns: name, code, description, duration_months, application_fee, tuition_fee, regulatory_body, institution_id, is_active, created_at, updated_at — all exist.

### 5.4 updateProgram() — ✅ CORRECT
SET columns: name, code, description, duration_months, application_fee, tuition_fee, regulatory_body, institution_id, is_active, updated_at — all exist.

### 5.5 deleteProgram() — ✅ CORRECT
Updates is_active and updated_at — both exist.

### 5.6 listInstitutions() — ✅ CORRECT
SELECT columns: id, name, full_name, code, description, is_active, created_at, updated_at — all exist.

### 5.7 createInstitution() — ✅ CORRECT
INSERT columns: name, full_name, code, description, is_active, created_at, updated_at — all exist.

### 5.8 updateInstitution() — ✅ CORRECT
SET columns: name, full_name, code, description, is_active, updated_at — all exist.

### 5.9 deleteInstitution() — ✅ CORRECT
References institution_id on programs table (for active program check) — exists. Updates is_active and updated_at — both exist.

### 5.10 createIntake() — ✅ CORRECT
INSERT columns: name, year, semester, start_date, end_date, application_deadline, max_capacity, current_enrollment, is_active, created_at, updated_at — all exist.
**Note:** `application_start_date` is NOT included in the INSERT — this is intentional (not required on creation).

### 5.11 updateIntake() — ✅ CORRECT
SET columns: name, year, semester, start_date, end_date, application_deadline, max_capacity, current_enrollment, is_active, updated_at — all exist.

### 5.12 deleteIntake() — ✅ CORRECT
Updates is_active and updated_at — both exist.

---

## 6. Requirement Verification

### Req 19.1 — programs.institution_id ✅ VERIFIED
The `programs` table has `institution_id` (uuid, nullable, ordinal position 14) with FK to `institutions.id` (ON DELETE NO ACTION). The `api-src/catalog.ts` inline SQL correctly references it. The `CatalogQueries` in `lib/queries.ts` incorrectly omits it.

### Req 19.2 — ProgramRow interface ✅ VERIFIED
`ProgramRow` in `api-src/catalog.ts` correctly matches the live schema. All 15 fields (including JOIN aliases) are valid.

### Req 19.3 — IntakeRow interface ✅ VERIFIED
`IntakeRow` in `api-src/catalog.ts` correctly matches all 13 intakes columns.

### Req 19.4 — InstitutionRecord interface ✅ VERIFIED
`InstitutionRecord` in `api-src/catalog.ts` matches the 8 columns it selects. 6 additional columns (type, address, phone, email, website, accreditation_status) are intentionally omitted from the catalog API.

### Req 19.5 — program_intakes UNIQUE constraint ✅ VERIFIED
`program_intakes` has UNIQUE constraint `program_intakes_program_id_intake_id_key` on `(program_id, intake_id)`. Both FK constraints use ON DELETE CASCADE. No code references `program_intakes` directly — it's only populated via the seed migration.

### Req 19.6 — course_requirements columns ✅ VERIFIED
All columns referenced by `seed_program_intakes_and_requirements.sql` exist in the live schema:
- `program_id` ✅ (uuid, nullable)
- `subject_id` ✅ (uuid, nullable)
- `is_mandatory` ✅ (boolean, nullable, default true)
- `minimum_grade` ✅ (integer, NOT NULL)
- `weight` ✅ (numeric, nullable, default 1.0)
- `requirement_type` ✅ (varchar(50), nullable, default 'core')

No code references `course_requirements` directly — it's only populated via the seed migration.

### Req 19.7 — intakes.program_id non-existence ✅ CONFIRMED
The `intakes` table does **NOT** have a `program_id` column. The `normalize_data.sql` migration contains:
```sql
DELETE FROM intakes
WHERE program_id IS NOT NULL
  AND program_id NOT IN (SELECT id FROM programs);
```
This statement would **fail at runtime** with `ERROR: column "program_id" does not exist`. This confirms the migration was either never applied or failed during execution.

---

## 7. Documentation Discrepancies

### tech.md / steering documentation
The documentation in `.kiro/steering/tech.md` describes:
- `program_intakes` as having `spots_available` — **WRONG**, actual column is `max_capacity` and `current_enrollment`
- `course_requirements` as having `min_grade` — **WRONG**, actual column is `minimum_grade`

---

## 8. Issues Summary

### 🔴 CRITICAL

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| C1 | CatalogQueries.getPrograms() omits `institution_id` | lib/queries.ts | Programs returned via query builder have no institution link |
| C2 | CatalogQueries.getActivePrograms() omits `institution_id` | lib/queries.ts | Same as C1 |
| C3 | CatalogQueries.getProgramById() omits `institution_id` | lib/queries.ts | Same as C1 |
| C4 | Incorrect comment: "Programs table doesn't have institution_id" | lib/queries.ts | Misleads developers |

### 🔴 HIGH

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| H1 | ProgramRecord has phantom `institution_slug` field | lib/queries.ts:1719 | Field can never be populated — no `slug` column on institutions |
| H2 | normalize_data.sql references `intakes.program_id` which doesn't exist | migrations/normalize_data.sql | Migration would fail at runtime |

### ⚠️ MEDIUM

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| M1 | InstitutionRecord omits 6 live schema columns | api-src/catalog.ts | Intentional but undocumented |
| M2 | CatalogQueries uses SELECT * for intakes (3 queries) | lib/queries.ts | Fragile to schema changes |
| M3 | CatalogQueries uses SELECT * for subjects (2 queries) | lib/queries.ts | Fragile to schema changes |
| M4 | Documentation says `spots_available` for program_intakes | .kiro/steering/tech.md | Misleading — actual columns are max_capacity + current_enrollment |
| M5 | Documentation says `min_grade` for course_requirements | .kiro/steering/tech.md | Misleading — actual column is `minimum_grade` |

### ℹ️ LOW

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| L1 | ProgramRecord.is_active is non-nullable but DB column is nullable | lib/queries.ts | Practically safe (default true) |
| L2 | IntakeRecord has 4 non-nullable fields that are nullable in DB | lib/queries.ts | Practically safe |
| L3 | program_intakes and course_requirements have no code references | api-src/, lib/ | Only populated via seed migration — no runtime CRUD |
| L4 | Redundant index: idx_programs_code duplicates programs_code_key | DB schema | Minor storage waste |

---

## 9. Recommended Fixes

### CRITICAL — Fix CatalogQueries (lib/queries.ts)
Add `institution_id` to all three program query builders and remove the incorrect comment:
```typescript
// BEFORE (incorrect):
// Note: Programs table doesn't have institution_id
getPrograms: (): QueryConfig => ({
  text: `SELECT id, name, code, description, duration_months,
         application_fee, tuition_fee, requirements,
         regulatory_body, accreditation_status, is_active,
         created_at, updated_at
         FROM programs ...`

// AFTER (correct):
getPrograms: (): QueryConfig => ({
  text: `SELECT id, name, code, description, duration_months,
         application_fee, tuition_fee, requirements,
         regulatory_body, accreditation_status, institution_id,
         is_active, created_at, updated_at
         FROM programs ...`
```

### HIGH — Remove phantom institution_slug from ProgramRecord
```typescript
// REMOVE this line from ProgramRecord:
institution_slug?: string;
```

### HIGH — Fix normalize_data.sql
Remove or correct the `DELETE FROM intakes WHERE program_id ...` statement. The intakes table has no `program_id` column — programs are linked to intakes via the `program_intakes` junction table.

### MEDIUM — Update documentation
Fix tech.md to use correct column names:
- `program_intakes`: `max_capacity`, `current_enrollment` (not `spots_available`)
- `course_requirements`: `minimum_grade` (not `min_grade`)
