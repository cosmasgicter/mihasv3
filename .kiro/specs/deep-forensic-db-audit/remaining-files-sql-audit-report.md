# SQL Audit Report: documents.ts, email.ts, bootstrap.ts, catalog.ts, sessions.ts, payments.ts

## Task 4.5 — Phase 3 SQL Cross-Reference (Remaining 6 Files)

**Audit Date**: Phase 3 continuation
**Ground Truth**: Live Neon Postgres schema (project: `wild-bar-37055823`)
**Method**: Every SQL statement extracted, every column cross-referenced against live schema

---

## 1. api-src/documents.ts

### SQL Statements Found: 5

#### SQL #1 — SELECT from applications (line ~166)
```sql
SELECT id, user_id FROM applications WHERE application_number = $1 LIMIT 1
```
- **Table**: `applications`
- **Columns**: `id` ✅, `user_id` ✅, `application_number` ✅
- **Status**: PASS

#### SQL #2 — SELECT from application_documents (line ~178)
```sql
SELECT id FROM application_documents
WHERE application_id = $1 AND document_type = 'application_slip'
ORDER BY created_at DESC LIMIT 1
```
- **Table**: `application_documents`
- **Columns**: `id` ✅, `application_id` ✅, `document_type` ✅, `created_at` ✅
- **Status**: PASS

#### SQL #3 — UPDATE application_documents (line ~186)
```sql
UPDATE application_documents
SET document_name = $2, file_url = $3, system_generated = true, updated_at = NOW()
WHERE id = $1 RETURNING id
```
- **Table**: `application_documents`
- **Columns**: `document_name` ✅, `file_url` ✅, `system_generated` ✅, `updated_at` ✅, `id` ✅
- **Status**: PASS

#### SQL #4 — INSERT into application_documents (line ~194)
```sql
INSERT INTO application_documents (
  id, application_id, document_type, document_name,
  file_url, mime_type, system_generated,
  verification_status, uploaded_at, created_at, updated_at
) VALUES (gen_random_uuid(), $1, 'application_slip', $2, $3, 'application/pdf', true, 'pending', NOW(), NOW(), NOW())
RETURNING id
```
- **Table**: `application_documents`
- **Columns checked against live schema** (15 columns: id, application_id, document_type, document_name, file_url, file_size, mime_type, verification_status, verified_by, verified_at, verification_notes, system_generated, uploaded_at, created_at, updated_at):
  - `id` ✅
  - `application_id` ✅
  - `document_type` ✅
  - `document_name` ✅
  - `file_url` ✅
  - `mime_type` ✅
  - `system_generated` ✅
  - `verification_status` ✅
  - `uploaded_at` ✅
  - `created_at` ✅
  - `updated_at` ✅
- **Status**: PASS — all columns exist in live schema

#### SQL #5 — SELECT from applications (line ~260, handleUpload)
```sql
SELECT id FROM applications WHERE application_number = $1 LIMIT 1
```
- **Table**: `applications`
- **Columns**: `id` ✅, `application_number` ✅
- **Status**: PASS

### documents.ts Summary
| Metric | Count |
|--------|-------|
| Total SQL statements | 5 |
| Phantom columns found | 0 |
| Bugs found | 0 |
| SELECT * usages | 0 |

---

## 2. api-src/email.ts

### SQL Statements Found: 6

#### SQL #1 — INSERT into email_queue (handleSend, line ~100)
```sql
INSERT INTO email_queue (recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
RETURNING id
```
- **Table**: `email_queue`
- **Live schema columns** (15): id, recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority, retry_count, max_retries, error_message, sent_at, created_at
- **Columns checked**:
  - `recipient_email` ✅
  - `recipient_name` ✅
  - `subject` ✅
  - `body` ✅
  - `html_body` ✅
  - `template_name` ✅
  - `template_data` ✅
  - `status` ✅
  - `priority` ✅
- **Status**: PASS

#### SQL #2 — SELECT from email_queue (handleProcessQueue, line ~140)
```sql
SELECT id, recipient_email, subject, body, html_body, retry_count, max_retries
FROM email_queue
WHERE status = 'pending'
ORDER BY priority ASC, created_at ASC
LIMIT 10
```
- **Table**: `email_queue`
- **Columns**: `id` ✅, `recipient_email` ✅, `subject` ✅, `body` ✅, `html_body` ✅, `retry_count` ✅, `max_retries` ✅, `status` ✅, `priority` ✅, `created_at` ✅
- **Status**: PASS

#### SQL #3 — UPDATE email_queue (success path, line ~168)
```sql
UPDATE email_queue SET status = 'sent', sent_at = NOW() WHERE id = $1
```
- **Table**: `email_queue`
- **Columns**: `status` ✅, `sent_at` ✅, `id` ✅
- **Status**: PASS

#### SQL #4 — UPDATE email_queue (failure path, line ~174)
```sql
UPDATE email_queue SET retry_count = $1, error_message = $2, status = $3 WHERE id = $4
```
- **Table**: `email_queue`
- **Columns**: `retry_count` ✅, `error_message` ✅, `status` ✅, `id` ✅
- **Status**: PASS

#### SQL #5 — UPDATE email_queue (handleRetryFailed, line ~215)
```sql
WITH updated AS (
  UPDATE email_queue
  SET status = 'pending', retry_count = 0, error_message = NULL
  WHERE status = 'failed'
  RETURNING id
)
SELECT COUNT(*)::text AS count FROM updated
```
- **Table**: `email_queue`
- **Columns**: `status` ✅, `retry_count` ✅, `error_message` ✅, `id` ✅
- **Status**: PASS

#### SQL #6 — SELECT from email_queue (handleQueueStatus, line ~245)
```sql
SELECT status, COUNT(*)::text AS count FROM email_queue GROUP BY status
```
- **Table**: `email_queue`
- **Columns**: `status` ✅
- **Status**: PASS

### email.ts Summary
| Metric | Count |
|--------|-------|
| Total SQL statements | 6 |
| Phantom columns found | 0 |
| Bugs found | 0 |
| SELECT * usages | 0 |

---

## 3. api-src/bootstrap.ts

### SQL Statements Found: 2

#### SQL #1 — SELECT from profiles (line ~72)
```sql
SELECT id, email, role, first_name, last_name, password_hash
FROM profiles WHERE email = $1 LIMIT 1
```
- **Table**: `profiles`
- **Columns**: `id` ✅, `email` ✅, `role` ✅, `first_name` ✅, `last_name` ✅, `password_hash` ✅
- **Status**: PASS

#### SQL #2 — UPDATE profiles (line ~83)
```sql
UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2
```
- **Table**: `profiles`
- **Columns**: `password_hash` ✅, `updated_at` ✅, `id` ✅
- **Status**: PASS

### bootstrap.ts Summary
| Metric | Count |
|--------|-------|
| Total SQL statements | 2 |
| Phantom columns found | 0 |
| Bugs found | 0 |
| SELECT * usages | 0 |

---

## 4. api-src/catalog.ts

### Interfaces Audit

#### ProgramRow Interface
| Interface Field | Live Schema Column | Status |
|----------------|-------------------|--------|
| `id` | `id` (uuid) | ✅ |
| `name` | `name` (varchar) | ✅ |
| `code` | `code` (varchar) | ✅ |
| `description` | `description` (text) | ✅ |
| `duration_months` | `duration_months` (integer) | ✅ |
| `application_fee` | `application_fee` (numeric) | ✅ |
| `tuition_fee` | `tuition_fee` (numeric) | ✅ |
| `regulatory_body` | `regulatory_body` (varchar) | ✅ |
| `accreditation_status` | `accreditation_status` (varchar) | ✅ |
| `institution_id` | `institution_id` (uuid) | ✅ |
| `institution_name` | N/A — JOIN alias from `institutions.name` | ✅ (computed) |
| `institution_full_name` | N/A — JOIN alias from `institutions.full_name` | ✅ (computed) |
| `is_active` | `is_active` (boolean) | ✅ |
| `created_at` | `created_at` (timestamptz) | ✅ |
| `updated_at` | `updated_at` (timestamptz) | ✅ |

**Missing from ProgramRow** (live schema columns not in interface):
- `requirements` (jsonb) — intentionally omitted, not used in catalog listing
- `qualification_level` — NOT in live schema (task instructions listed it but it doesn't exist)

**Verdict**: ProgramRow is CORRECT. All fields map to real columns or valid JOIN aliases.

#### IntakeRow Interface
| Interface Field | Live Schema Column | Status |
|----------------|-------------------|--------|
| `id` | `id` (uuid) | ✅ |
| `name` | `name` (varchar) | ✅ |
| `year` | `year` (integer) | ✅ |
| `semester` | `semester` (varchar) | ✅ |
| `start_date` | `start_date` (date) | ✅ |
| `end_date` | `end_date` (date) | ✅ |
| `application_start_date` | `application_start_date` (date) | ✅ |
| `application_deadline` | `application_deadline` (date) | ✅ |
| `max_capacity` | `max_capacity` (integer) | ✅ |
| `current_enrollment` | `current_enrollment` (integer) | ✅ |
| `is_active` | `is_active` (boolean) | ✅ |
| `created_at` | `created_at` (timestamptz) | ✅ |
| `updated_at` | `updated_at` (timestamptz) | ✅ |

**Verdict**: IntakeRow is CORRECT. All fields match live schema.

#### InstitutionRecord Interface
| Interface Field | Live Schema Column | Status |
|----------------|-------------------|--------|
| `id` | `id` (uuid) | ✅ |
| `name` | `name` (varchar) | ✅ |
| `full_name` | `full_name` (varchar) | ✅ |
| `code` | `code` (varchar) | ✅ |
| `description` | `description` (text) | ✅ |
| `is_active` | `is_active` (boolean) | ✅ |
| `created_at` | `created_at` (timestamptz) | ✅ |
| `updated_at` | `updated_at` (timestamptz) | ✅ |

**Missing from InstitutionRecord** (live schema columns not in interface):
- `type` (varchar) — not used in catalog listing
- `address` (text) — not used in catalog listing
- `phone` (varchar) — not used in catalog listing
- `email` (varchar) — not used in catalog listing
- `website` (varchar) — not used in catalog listing
- `accreditation_status` (varchar) — not used in catalog listing

**Verdict**: InstitutionRecord is CORRECT for its purpose. Missing fields are intentionally omitted (not needed for catalog display).

### SQL Statements Found: 14

#### SQL #1 — SELECT programs with JOIN (listPrograms)
```sql
SELECT p.id, p.name, p.code, p.description, p.duration_months,
  p.application_fee, p.tuition_fee, p.regulatory_body, p.accreditation_status,
  p.institution_id, i.name AS institution_name, i.full_name AS institution_full_name,
  p.is_active, p.created_at, p.updated_at
FROM programs p LEFT JOIN institutions i ON i.id = p.institution_id
WHERE ($1::boolean = true OR p.is_active = true) ORDER BY p.name ASC
```
- **Tables**: `programs` ✅, `institutions` ✅
- **programs columns**: `id` ✅, `name` ✅, `code` ✅, `description` ✅, `duration_months` ✅, `application_fee` ✅, `tuition_fee` ✅, `regulatory_body` ✅, `accreditation_status` ✅, `institution_id` ✅, `is_active` ✅, `created_at` ✅, `updated_at` ✅
- **institutions columns**: `name` ✅, `full_name` ✅, `id` ✅
- **JOIN condition**: `i.id = p.institution_id` — valid FK relationship ✅
- **Status**: PASS

#### SQL #2 — SELECT intakes (listIntakes)
```sql
SELECT id, name, COALESCE(year, EXTRACT(YEAR FROM start_date)::int) AS year,
  semester, start_date, end_date, application_start_date, application_deadline,
  COALESCE(max_capacity, 0) AS max_capacity,
  COALESCE(current_enrollment, 0) AS current_enrollment,
  is_active, created_at, updated_at
FROM intakes WHERE ($1::boolean = true OR is_active = true)
ORDER BY year DESC, start_date DESC
```
- **Table**: `intakes`
- **Columns**: `id` ✅, `name` ✅, `year` ✅, `start_date` ✅, `semester` ✅, `end_date` ✅, `application_start_date` ✅, `application_deadline` ✅, `max_capacity` ✅, `current_enrollment` ✅, `is_active` ✅, `created_at` ✅, `updated_at` ✅
- **Status**: PASS

#### SQL #3 — INSERT into programs (createProgram)
```sql
INSERT INTO programs (name, code, description, duration_months, application_fee, tuition_fee, regulatory_body, institution_id, is_active, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW()) RETURNING *
```
- **Table**: `programs`
- **Columns**: `name` ✅, `code` ✅, `description` ✅, `duration_months` ✅, `application_fee` ✅, `tuition_fee` ✅, `regulatory_body` ✅, `institution_id` ✅, `is_active` ✅, `created_at` ✅, `updated_at` ✅
- **RETURNING ***: Flagged for review (fragile to schema changes)
- **Status**: PASS

#### SQL #4 — UPDATE programs (updateProgram)
```sql
UPDATE programs SET name=$2, code=$3, description=$4, duration_months=$5,
  application_fee=COALESCE($6, application_fee), tuition_fee=$7,
  regulatory_body=$8, institution_id=$9, is_active=COALESCE($10, is_active),
  updated_at=NOW() WHERE id=$1 RETURNING *
```
- **Table**: `programs`
- **Columns**: `name` ✅, `code` ✅, `description` ✅, `duration_months` ✅, `application_fee` ✅, `tuition_fee` ✅, `regulatory_body` ✅, `institution_id` ✅, `is_active` ✅, `updated_at` ✅, `id` ✅
- **RETURNING ***: Flagged for review
- **Status**: PASS

#### SQL #5 — UPDATE programs (deleteProgram — soft delete)
```sql
UPDATE programs SET is_active = false, updated_at = NOW()
WHERE id = $1 AND is_active = true RETURNING id
```
- **Table**: `programs`
- **Columns**: `is_active` ✅, `updated_at` ✅, `id` ✅
- **Status**: PASS

#### SQL #6 — SELECT institutions (listInstitutions)
```sql
SELECT id, name, full_name, code, description, is_active, created_at, updated_at
FROM institutions WHERE ($1::boolean = true OR is_active = true)
ORDER BY full_name ASC, name ASC
```
- **Table**: `institutions`
- **Columns**: `id` ✅, `name` ✅, `full_name` ✅, `code` ✅, `description` ✅, `is_active` ✅, `created_at` ✅, `updated_at` ✅
- **Status**: PASS

#### SQL #7 — INSERT into institutions (createInstitution)
```sql
INSERT INTO institutions (name, full_name, code, description, is_active, created_at, updated_at)
VALUES ($1, $2, $3, $4, true, NOW(), NOW())
RETURNING id, name, full_name, code, description, is_active, created_at, updated_at
```
- **Table**: `institutions`
- **Columns**: `name` ✅, `full_name` ✅, `code` ✅, `description` ✅, `is_active` ✅, `created_at` ✅, `updated_at` ✅
- **Status**: PASS

#### SQL #8 — UPDATE institutions (updateInstitution)
```sql
UPDATE institutions SET name=$2, full_name=$3, code=$4, description=$5,
  is_active=COALESCE($6, is_active), updated_at=NOW()
WHERE id=$1
RETURNING id, name, full_name, code, description, is_active, created_at, updated_at
```
- **Table**: `institutions`
- **Columns**: `name` ✅, `full_name` ✅, `code` ✅, `description` ✅, `is_active` ✅, `updated_at` ✅, `id` ✅, `created_at` ✅
- **Status**: PASS

#### SQL #9 — SELECT COUNT from programs (deleteInstitution guard)
```sql
SELECT COUNT(*)::text AS count FROM programs WHERE institution_id = $1 AND is_active = true
```
- **Table**: `programs`
- **Columns**: `institution_id` ✅, `is_active` ✅
- **Status**: PASS

#### SQL #10 — UPDATE institutions (deleteInstitution — soft delete)
```sql
UPDATE institutions SET is_active = false, updated_at = NOW()
WHERE id = $1 AND is_active = true RETURNING id
```
- **Table**: `institutions`
- **Columns**: `is_active` ✅, `updated_at` ✅, `id` ✅
- **Status**: PASS

#### SQL #11 — INSERT into intakes (createIntake)
```sql
INSERT INTO intakes (name, year, semester, start_date, end_date, application_deadline,
  max_capacity, current_enrollment, is_active, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, 0, true, NOW(), NOW()) RETURNING *
```
- **Table**: `intakes`
- **Columns**: `name` ✅, `year` ✅, `semester` ✅, `start_date` ✅, `end_date` ✅, `application_deadline` ✅, `max_capacity` ✅, `current_enrollment` ✅, `is_active` ✅, `created_at` ✅, `updated_at` ✅
- **RETURNING ***: Flagged for review
- **Status**: PASS

#### SQL #12 — UPDATE intakes (updateIntake)
```sql
UPDATE intakes SET name=$2, year=$3, semester=$4, start_date=$5, end_date=$6,
  application_deadline=$7, max_capacity=$8, current_enrollment=COALESCE($9, current_enrollment),
  is_active=COALESCE($10, is_active), updated_at=NOW()
WHERE id=$1 RETURNING *
```
- **Table**: `intakes`
- **Columns**: `name` ✅, `year` ✅, `semester` ✅, `start_date` ✅, `end_date` ✅, `application_deadline` ✅, `max_capacity` ✅, `current_enrollment` ✅, `is_active` ✅, `updated_at` ✅, `id` ✅
- **RETURNING ***: Flagged for review
- **Status**: PASS

#### SQL #13 — UPDATE intakes (deleteIntake — soft delete)
```sql
UPDATE intakes SET is_active = false, updated_at = NOW()
WHERE id = $1 AND is_active = true RETURNING id
```
- **Table**: `intakes`
- **Columns**: `is_active` ✅, `updated_at` ✅, `id` ✅
- **Status**: PASS

#### SQL #14 — CatalogQueries.getSubjects() (via lib/queries.ts)
- Delegated to `lib/queries.ts` — audited in task 4.6
- **Status**: Deferred to task 4.6

### catalog.ts Summary
| Metric | Count |
|--------|-------|
| Total SQL statements | 14 (13 inline + 1 via CatalogQueries) |
| Phantom columns found | 0 |
| Bugs found | 0 |
| SELECT * usages | 4 (RETURNING * in createProgram, updateProgram, createIntake, updateIntake) |
| Interface mismatches | 0 |

---

## 5. api-src/sessions.ts

### SQL Statements Found: 0 (inline)

This file delegates ALL database operations to `lib/sessions.ts` functions:
- `getActiveSessions()` — queries device_sessions
- `deactivateSession()` — updates device_sessions
- `deactivateAllSessions()` — updates device_sessions
- `deactivateOtherSessions()` — updates device_sessions
- `updateActivity()` — updates device_sessions
- `createSession()` — inserts into device_sessions

**No inline SQL** — all SQL is in `lib/sessions.ts`, which is audited in task 4.6.

### sessions.ts Summary
| Metric | Count |
|--------|-------|
| Total SQL statements (inline) | 0 |
| Phantom columns found | 0 |
| Bugs found | 0 |
| SELECT * usages | 0 |

---

## 6. api-src/payments.ts

### SQL Statements Found: 3

#### SQL #1 — SELECT * from applications (handleReceipt, line ~80)
```sql
SELECT * FROM applications WHERE id = $1 LIMIT 1
```
- **Table**: `applications`
- **Status**: ⚠️ SELECT * — fragile to schema changes, but valid

#### SQL #2 — UPDATE applications (handleReceipt, line ~112)
```sql
UPDATE applications SET receipt_number = $1 WHERE id = $2
```
- **Table**: `applications`
- **Columns**: `receipt_number` ✅, `id` ✅
- **Status**: PASS

#### SQL #3 — SELECT from profiles (handleReceipt, line ~119)
```sql
SELECT first_name, last_name FROM profiles WHERE id = $1 LIMIT 1
```
- **Table**: `profiles`
- **Columns**: `first_name` ✅, `last_name` ✅, `id` ✅
- **Status**: PASS

### Inline Type Annotation Audit (CRITICAL CHECK)

The `handleReceipt` function uses `SELECT *` but then accesses the result via an inline type annotation:

```typescript
const appResult = await query<{
  id: string;
  user_id: string;
  application_number: string;
  full_name: string;
  email: string;
  phone: string;
  program: string;
  institution: string;
  amount: number;
  payment_method: string;
  momo_ref: string;
  paid_at: string;
  payment_status: string;
  payment_verified_at: string;
  payment_verified_by: string;
  receipt_number: string;
  created_at: string;
}>(appQ.text, appQ.values);
```

**Cross-reference against live `applications` table (50 columns)**:

| Inline Type Field | Live Schema Column | Status |
|-------------------|-------------------|--------|
| `id` | `id` (uuid) | ✅ |
| `user_id` | `user_id` (uuid) | ✅ |
| `application_number` | `application_number` (varchar) | ✅ |
| `full_name` | `full_name` (varchar) | ✅ |
| `email` | `email` (varchar) | ✅ |
| `phone` | `phone` (varchar) | ✅ |
| `program` | `program` (varchar) | ✅ |
| `institution` | `institution` (varchar) | ✅ |
| `amount` | `amount` (numeric) | ✅ |
| `payment_method` | `payment_method` (varchar) | ✅ |
| `momo_ref` | `momo_ref` (varchar) | ✅ |
| `paid_at` | `paid_at` (timestamptz) | ✅ |
| `payment_status` | `payment_status` (varchar) | ✅ |
| `payment_verified_at` | `payment_verified_at` (timestamptz) | ✅ |
| `payment_verified_by` | `payment_verified_by` (uuid) | ✅ |
| `receipt_number` | `receipt_number` (varchar) | ✅ |
| `created_at` | `created_at` (timestamptz) | ✅ |

**Verdict**: ALL 17 fields in the inline type annotation exist as real columns in the live `applications` table. No phantom columns.

**Note**: The `program` and `institution` fields are stored as VARCHAR text values directly in the `applications` table (not as foreign key references to `programs`/`institutions` tables). This is a denormalized design — the application stores the program name and institution name as strings at submission time. This is valid.

### payments.ts Summary
| Metric | Count |
|--------|-------|
| Total SQL statements | 3 |
| Phantom columns found | 0 |
| Bugs found | 0 |
| SELECT * usages | 1 (SELECT * FROM applications) |
| Inline type annotation issues | 0 |

---

## Overall Summary — All 6 Files

### Aggregate Metrics

| File | SQL Statements | Phantom Columns | Bugs | SELECT * |
|------|---------------|-----------------|------|----------|
| documents.ts | 5 | 0 | 0 | 0 |
| email.ts | 6 | 0 | 0 | 0 |
| bootstrap.ts | 2 | 0 | 0 | 0 |
| catalog.ts | 14 | 0 | 0 | 4 (RETURNING *) |
| sessions.ts | 0 (delegated) | 0 | 0 | 0 |
| payments.ts | 3 | 0 | 0 | 1 |
| **TOTAL** | **30** | **0** | **0** | **5** |

### Interface Audit Summary

| Interface | File | Target Table | Status |
|-----------|------|-------------|--------|
| ProgramRow | catalog.ts | programs + institutions (JOIN) | ✅ CORRECT |
| IntakeRow | catalog.ts | intakes | ✅ CORRECT |
| InstitutionRecord | catalog.ts | institutions | ✅ CORRECT (subset) |
| Inline receipt type | payments.ts | applications | ✅ CORRECT |

### Key Findings

1. **ZERO phantom columns** across all 6 files — all SQL column references are valid against the live schema.

2. **ZERO bugs found** — no missing `$` prefix patterns, no references to non-existent columns.

3. **5 SELECT * / RETURNING * usages** flagged for review (fragile to schema changes):
   - `catalog.ts`: `RETURNING *` in createProgram, updateProgram, createIntake, updateIntake
   - `payments.ts`: `SELECT * FROM applications` in handleReceipt

4. **ProgramRow interface** correctly includes `application_fee` and `tuition_fee` which exist in the live `programs` table (confirmed via Neon MCP). The task instructions' live schema listing for programs omitted these columns, but they DO exist.

5. **InstitutionRecord interface** is a valid subset — it omits `type`, `address`, `phone`, `email`, `website`, `accreditation_status` which are not needed for catalog display purposes.

6. **payments.ts inline type annotation** is fully correct — all 17 fields map to real `applications` columns. The `program` and `institution` fields are denormalized VARCHAR columns (not FK references), which is the correct design for this table.

7. **sessions.ts** contains zero inline SQL — all database operations are delegated to `lib/sessions.ts` utility functions (audited separately in task 4.6).

### Recommendations

1. **LOW priority**: Consider replacing `RETURNING *` with explicit column lists in catalog.ts for resilience against future schema changes.

2. **LOW priority**: Consider replacing `SELECT *` in payments.ts handleReceipt with an explicit column list matching the inline type annotation.

3. **No CRITICAL or HIGH issues** found in these 6 files.

### Missing `$` Prefix Bug Pattern Check

Specifically checked all parameterized queries for the missing `$` prefix bug pattern (e.g., `1` instead of `$1`). **No instances found** — all parameter placeholders are correctly prefixed with `$`.

### Non-Existent Column Reference Check

Specifically checked for references to columns that don't exist in the target tables. **No instances found** — every column reference in every SQL statement maps to a real column in the live schema.
