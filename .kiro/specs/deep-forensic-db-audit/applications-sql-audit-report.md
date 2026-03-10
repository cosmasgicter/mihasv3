# SQL Cross-Reference Audit Report: api-src/applications.ts (Task 4.2)

## Ground Truth — Live Schema Columns (verified via Neon MCP)

**applications** (50 columns): id, application_number, user_id, full_name, nrc_number, passport_number, date_of_birth, sex, phone, email, residence_town, nationality, address_line_1, address_line_2, postal_code, next_of_kin_name, next_of_kin_phone, program, intake, institution, result_slip_url, extra_kyc_url, application_fee, payment_method, payer_name, payer_phone, amount, paid_at, momo_ref, pop_url, receipt_number, payment_status, payment_verified_at, payment_verified_by, status, eligibility_status, eligibility_score, eligibility_notes, admin_feedback, admin_feedback_date, admin_feedback_by, review_started_at, decision_date, reviewed_by, additional_subjects, public_tracking_code, submitted_at, created_at, updated_at, version

**application_interviews** (11 columns): id, application_id, scheduled_at, mode, location, status, notes, created_by, updated_by, created_at, updated_at

**application_status_history** (11 columns): id, application_id, status, changed_by, notes, changes, ip_address, user_agent, created_at, old_status, new_status

**application_documents** (15 columns): id, application_id, document_type, document_name, file_url, file_size, mime_type, verification_status, verified_by, verified_at, verification_notes, system_generated, uploaded_at, created_at, updated_at

**application_grades** (5 columns): id, application_id, subject_id, grade, created_at

**application_drafts** (9 columns): id, user_id, draft_data, draft_name, step_completed, is_active, last_accessed_at, created_at, updated_at

**idempotency_keys** (4 columns): key, endpoint, response_json, created_at

**notifications** (13 columns): id, user_id, title, message, type, priority, action_url, metadata, is_read, read_at, created_at, updated_at, idempotency_key

**email_queue** (15 columns): id, recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority, retry_count, max_retries, error_message, sent_at, created_at

**profiles** (30 columns): id, email, role, first_name, last_name, phone, is_active, password_hash, refresh_token_hash, failed_login_attempts, locked_until, password_changed_at, email_verified, avatar_url, date_of_birth, nrc_number, nationality, address, notification_preferences, last_login_at, created_at, updated_at, reset_token_hash, reset_token_expires, reset_token_used, sex, residence_town, next_of_kin_name, next_of_kin_phone, full_name

**audit_logs** (10 columns): id, actor_id, action, entity_type, entity_id, changes, ip_address, user_agent, created_at, retention_category

**subjects** (verified from Phase 1): id, name, code, category, is_core

---

## CRITICAL FINDINGS SUMMARY

### ❌ Phantom Columns Found: 0
### ⚠️ Code Bugs Found: 3 (non-schema, but runtime-breaking)
### ⚠️ Task Prompt Schema Discrepancies: Multiple (task prompt had incomplete column lists)

**Note on task prompt column lists**: The task prompt listed `application_interviews` with columns: id, application_id, scheduled_at, location, interviewer_id, status, notes, created_at, updated_at. The live schema does NOT have `interviewer_id` — it has `mode`, `created_by`, `updated_by` instead. The task prompt also listed `application_documents` with `file_name`, `file_path`, `verdict`, `rejection_reason`, `ocr_data` — the live schema has `document_name`, `file_url`, `verification_notes`, `system_generated` instead. The live Neon MCP query is the ground truth.

**Note on `application_drafts`**: The task prompt listed `application_id` as a column — the live schema does NOT have `application_id`. It has: id, user_id, draft_data, draft_name, step_completed, is_active, last_accessed_at, created_at, updated_at.

---

## SQL Statement Audit

### Statement 1 — SELECT from idempotency_keys (checkIdempotencyKey)
- **Line**: ~57
- **Operation**: SELECT
- **Table**: idempotency_keys
- **Columns referenced**: response_json (SELECT), key (WHERE), endpoint (WHERE), created_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 2 — INSERT into idempotency_keys (storeIdempotencyKey)
- **Line**: ~73
- **Operation**: INSERT ... ON CONFLICT
- **Table**: idempotency_keys
- **Columns referenced**: key, endpoint, response_json, created_at (via NOW())
- **ON CONFLICT**: key → UPDATE SET response_json, created_at
- **Status**: ✅ All columns valid

### Statement 3 — DELETE from idempotency_keys (storeIdempotencyKey cleanup)
- **Line**: ~80
- **Operation**: DELETE
- **Table**: idempotency_keys
- **Columns WHERE**: created_at
- **Status**: ✅ All columns valid

### Statement 4 — SELECT from applications (handlePublicTracking)
- **Line**: ~230
- **Operation**: SELECT
- **Table**: applications
- **Columns referenced**: application_number, status, program (aliased AS program_name), intake (aliased AS intake_name), submitted_at, updated_at, admin_feedback (via LEFT/NULLIF/TRIM aliased AS feedback_summary)
- **Columns WHERE**: public_tracking_code, application_number
- **Status**: ✅ All columns valid

### Statement 5 — INSERT into applications (handleCreate)
- **Line**: ~290
- **Operation**: INSERT ... RETURNING *
- **Table**: applications
- **Columns referenced**: user_id, application_number, public_tracking_code, full_name, nrc_number, passport_number, date_of_birth, sex, phone, email, residence_town, nationality, next_of_kin_name, next_of_kin_phone, program, intake, institution, status
- **Status**: ✅ All 18 columns valid
- **⚠️ CODE BUG**: The placeholder builder on line ~300 produces `$` prefix incorrectly. The code does:
  ```typescript
  const placeholders = values.map((_, i) => `${i + 1}`).join(', ');
  ```
  This produces `1, 2, 3, ...` instead of `$1, $2, $3, ...`. Missing `$` prefix. This would cause a runtime SQL syntax error on every application creation.

### Statement 6 — SELECT COUNT(*) from applications (handleDetails — count)
- **Line**: ~370
- **Operation**: SELECT
- **Table**: applications (aliased as `a`)
- **Columns referenced**: COUNT(*) as count; dynamic WHERE uses: a.user_id, a.status, a.full_name (ILIKE), a.email (ILIKE), a.application_number (ILIKE), a.payment_status, a.program, a.institution
- **Status**: ✅ All columns valid
- **⚠️ CODE BUG**: Dynamic WHERE clause parameter placeholders are missing `$` prefix. The code builds conditions like:
  ```typescript
  conditions.push(`a.user_id = ${paramIndex}`);
  ```
  This produces `a.user_id = 1` instead of `a.user_id = $1`. Same bug pattern as Statement 5.

### Statement 7 — SELECT from applications with JOINs (handleDetails — data fetch)
- **Line**: ~385
- **Operation**: SELECT with LEFT JOINs
- **Table**: applications (aliased as `a`), profiles (aliased as `verifier`), audit_logs (aliased as `al`), profiles (aliased as `actor`)
- **Columns referenced (via APPLICATION_PAYMENT_METADATA_SELECT)**:
  - `a.*` — all applications columns (SELECT *)
  - `verifier.first_name`, `verifier.last_name`, `verifier.email` — ✅ valid profiles columns
  - `al.id`, `al.created_at`, `al.changes`, `al.entity_type`, `al.entity_id`, `al.action`, `al.actor_id` — ✅ valid audit_logs columns
  - `actor.first_name`, `actor.last_name`, `actor.email` — ✅ valid profiles columns
- **JOIN conditions (via APPLICATION_PAYMENT_METADATA_JOINS)**:
  - `verifier.id = a.payment_verified_by` — ✅ profiles.id, applications.payment_verified_by both valid
  - `actor.id = al.actor_id` — ✅ profiles.id, audit_logs.actor_id both valid
  - `al.entity_id = a.id` — ✅ audit_logs.entity_id, applications.id both valid
- **Columns referenced**: `a.momo_ref`, `a.pop_url` — ✅ both valid applications columns
- **LIMIT/OFFSET placeholders**: Same `${paramIndex}` bug (missing `$` prefix)
- **Status**: ✅ All column references valid
- **⚠️ CODE BUG**: LIMIT/OFFSET placeholders missing `$` prefix (same pattern)

### Statement 8 — SELECT from application_interviews JOIN applications (handleInterviews)
- **Line**: ~530
- **Operation**: SELECT with INNER JOIN
- **Table**: application_interviews (aliased as `ai`), applications (aliased as `a`)
- **Columns referenced**:
  - `ai.id`, `ai.application_id`, `ai.scheduled_at`, `ai.mode`, `ai.location`, `ai.status`, `ai.notes` — ✅ all valid application_interviews columns
  - `a.program`, `a.application_number` — ✅ valid applications columns
- **JOIN condition**: `ai.application_id = a.id` — ✅ valid
- **WHERE**: `a.user_id` — ✅ valid
- **Status**: ✅ All columns valid

### Statement 9 — SELECT from applications (handleScheduleInterview — existence check)
- **Line**: ~575
- **Operation**: SELECT
- **Table**: applications
- **Columns referenced**: id (SELECT, WHERE)
- **Status**: ✅ All columns valid

### Statement 10 — INSERT into application_interviews (handleScheduleInterview)
- **Line**: ~582
- **Operation**: INSERT ... RETURNING
- **Table**: application_interviews
- **Columns referenced**: application_id, scheduled_at, mode, location, notes, status (literal 'scheduled'), created_by, created_at (NOW()), updated_at (NOW())
- **RETURNING**: id, application_id, scheduled_at, mode, location, notes, status
- **Status**: ✅ All columns valid

### Statement 11 — SELECT from applications (handleScheduleInterview — get owner)
- **Line**: ~605
- **Operation**: SELECT
- **Table**: applications
- **Columns referenced**: user_id (SELECT), id (WHERE)
- **Status**: ✅ All columns valid

### Statement 12 — SELECT COUNT from applications (handleStats — counts)
- **Line**: ~640
- **Operation**: SELECT with FILTER
- **Table**: applications
- **Columns referenced**: COUNT(*) as total, status (FILTER WHERE), user_id (WHERE)
- **Status**: ✅ All columns valid

### Statement 13 — SELECT AVG from applications (handleStats — avg time)
- **Line**: ~650
- **Operation**: SELECT
- **Table**: applications
- **Columns referenced**: updated_at, created_at (EXTRACT), user_id (WHERE), status (WHERE)
- **Status**: ✅ All columns valid

### Statement 14 — SELECT * from applications via ApplicationQueries.findPendingReview (handleReview GET)
- **Line**: ~670 (via lib/queries.ts)
- **Operation**: SELECT *
- **Table**: applications
- **Columns WHERE**: status (literal 'submitted')
- **Status**: ✅ Valid (SELECT * — fragile but not phantom)

### Statement 15 — SELECT * from applications via ApplicationQueries.findById (handleReview POST — existence check)
- **Line**: ~685 (via lib/queries.ts)
- **Operation**: SELECT *
- **Table**: applications
- **Columns WHERE**: id
- **Status**: ✅ Valid

### Statement 16 — UPDATE applications + INSERT application_status_history via transaction (handleReview POST)
- **Line**: ~710 (via ApplicationQueries.updateStatus + StatusHistoryQueries.create)
- **Operation**: UPDATE + INSERT (transaction)
- **Table**: applications, application_status_history
- **UPDATE applications SET**: status, reviewed_by, review_started_at (COALESCE), updated_at (NOW())
- **UPDATE WHERE**: id
- **INSERT application_status_history**: id (gen_random_uuid()), application_id, old_status, new_status, changed_by, notes, created_at (NOW())
- **Status**: ✅ All columns valid
- **Notes**: StatusHistoryQueries.create correctly uses `old_status` and `new_status` columns (not the legacy `status` column). Both exist in the live schema.

### Statement 17 — INSERT into email_queue (handleReview POST — status change email)
- **Line**: ~745
- **Operation**: INSERT
- **Table**: email_queue
- **Columns referenced**: recipient_email, recipient_name, subject, body, html_body, template_name (literal), template_data, status (literal 'pending'), priority (literal 3)
- **Status**: ✅ All 9 columns valid

### Statement 18 — SELECT * from applications via ApplicationQueries.checkOwnership (handleById GET)
- **Line**: ~895 (via lib/queries.ts)
- **Operation**: SELECT EXISTS
- **Table**: applications
- **Columns WHERE**: id, user_id
- **Status**: ✅ Valid

### Statement 19 — SELECT * from applications via ApplicationQueries.findById (handleById DELETE/PUT/PATCH)
- **Line**: ~920 (via lib/queries.ts)
- **Operation**: SELECT *
- **Table**: applications
- **Columns WHERE**: id
- **Status**: ✅ Valid

### Statement 20 — DELETE from applications via ApplicationQueries.delete (handleById DELETE)
- **Line**: ~935 (via lib/queries.ts)
- **Operation**: DELETE ... RETURNING id
- **Table**: applications
- **Columns WHERE**: id
- **Status**: ✅ Valid

### Statement 21 — CTE: UPDATE applications + INSERT application_status_history + INSERT notifications (PATCH action=update_status)
- **Line**: ~990
- **Operation**: CTE with UPDATE + 2 INSERTs
- **Tables**: applications, application_status_history, notifications
- **UPDATE applications SET**: status, reviewed_by, review_started_at (COALESCE), updated_at (NOW())
- **UPDATE WHERE**: id
- **INSERT application_status_history**: id (gen_random_uuid()), application_id, old_status, new_status, changed_by, notes, created_at (NOW())
- **INSERT notifications**: user_id, title, message, type (literal 'success'), action_url, is_read (literal false), created_at (NOW())
- **Status**: ✅ All columns valid
- **Notes**: This inline CTE correctly uses `old_status` and `new_status` for application_status_history. The notifications INSERT uses `is_read` which matches the live schema column name.

### Statement 22 — INSERT into email_queue (PATCH action=update_status — email)
- **Line**: ~1060
- **Operation**: INSERT
- **Table**: email_queue
- **Columns referenced**: recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority
- **Status**: ✅ All columns valid

### Statement 23 — CTE: UPDATE applications + INSERT notifications (PATCH action=update_payment_status)
- **Line**: ~1130
- **Operation**: CTE with UPDATE + INSERT
- **Tables**: applications, notifications
- **UPDATE applications SET**: payment_status, payment_verified_by, payment_verified_at (CASE), updated_at (NOW())
- **UPDATE WHERE**: id
- **INSERT notifications**: user_id, title, message, type, action_url, is_read (literal false), created_at (NOW())
- **Status**: ✅ All columns valid

### Statement 24 — INSERT into notifications (PATCH action=send_notification)
- **Line**: ~1260
- **Operation**: INSERT ... RETURNING *
- **Table**: notifications
- **Columns referenced**: user_id, title, message, type (literal 'info'), action_url, is_read (literal false), created_at (NOW())
- **Status**: ✅ All columns valid

### Statement 25 — INSERT into email_queue (PATCH action=send_notification — email)
- **Line**: ~1280
- **Operation**: INSERT
- **Table**: email_queue
- **Columns referenced**: recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority
- **Status**: ✅ All columns valid

### Statement 26 — INSERT into application_interviews (PATCH action=schedule_interview)
- **Line**: ~1340
- **Operation**: INSERT ... RETURNING
- **Table**: application_interviews
- **Columns referenced**: application_id, scheduled_at, mode, location, notes, status (literal 'scheduled'), created_by, created_at (NOW()), updated_at (NOW())
- **RETURNING**: id, application_id, scheduled_at, mode, location, notes, status
- **Status**: ✅ All columns valid

### Statement 27 — SELECT from application_interviews (PATCH action=reschedule_interview — find existing)
- **Line**: ~1390
- **Operation**: SELECT
- **Table**: application_interviews
- **Columns referenced**: id (SELECT), application_id (WHERE), status (WHERE), created_at (ORDER BY)
- **Status**: ✅ All columns valid

### Statement 28 — UPDATE application_interviews (PATCH action=reschedule_interview)
- **Line**: ~1405
- **Operation**: UPDATE ... RETURNING
- **Table**: application_interviews
- **Columns SET**: scheduled_at, status (literal 'rescheduled'), updated_at (NOW()), mode (conditional), location (conditional), notes (conditional)
- **Columns WHERE**: id
- **RETURNING**: id, application_id, scheduled_at, mode, location, notes, status
- **Status**: ✅ All columns valid
- **⚠️ CODE BUG**: Dynamic SET clause parameter placeholders missing `$` prefix. The code builds:
  ```typescript
  setClauses.push(`mode = ${pIdx}`);  // produces "mode = 2" not "mode = $2"
  ```
  Same bug pattern as Statements 5, 6, 7. Also the WHERE clause: `WHERE id = ${pIdx}` produces `WHERE id = 5` instead of `WHERE id = $5`.

### Statement 29 — SELECT from application_interviews (PATCH action=cancel_interview — find existing)
- **Line**: ~1525
- **Operation**: SELECT
- **Table**: application_interviews
- **Columns referenced**: id (SELECT), application_id (WHERE), status (WHERE), created_at (ORDER BY)
- **Status**: ✅ All columns valid

### Statement 30 — UPDATE application_interviews (PATCH action=cancel_interview)
- **Line**: ~1535
- **Operation**: UPDATE ... RETURNING
- **Table**: application_interviews
- **Columns SET**: status (literal 'cancelled'), notes (COALESCE), updated_at (NOW())
- **Columns WHERE**: id
- **RETURNING**: id, application_id, scheduled_at, mode, location, notes, status
- **Status**: ✅ All columns valid

### Statement 31 — UPDATE applications (PATCH action=save_draft — dynamic update)
- **Line**: ~1580
- **Operation**: UPDATE ... RETURNING *
- **Table**: applications
- **Dynamic allowedFields array**: full_name, nrc_number, passport_number, date_of_birth, sex, phone, email, residence_town, nationality, next_of_kin_name, next_of_kin_phone, program, intake, institution, result_slip_url, extra_kyc_url, payment_method, payer_name, payer_phone, amount, paid_at, momo_ref, pop_url
- **Also SET**: version, updated_at (NOW())
- **WHERE**: id, version (optimistic concurrency)
- **Status**: ✅ All 23 allowedFields are valid applications columns
- **⚠️ CODE BUG**: Dynamic SET clause parameter placeholders missing `$` prefix:
  ```typescript
  setClauses.push(`${field} = ${paramIdx}`);  // produces "full_name = 3" not "full_name = $3"
  ```

### Statement 32 — SELECT from applications (PATCH action=save_draft — version check)
- **Line**: ~1610
- **Operation**: SELECT
- **Table**: applications
- **Columns referenced**: version (SELECT), id (WHERE)
- **Status**: ✅ All columns valid

### Statement 33 — DELETE from application_grades via GradeQueries.deleteByApplication (PATCH action=sync_grades)
- **Line**: ~1630 (via lib/queries.ts)
- **Operation**: DELETE
- **Table**: application_grades
- **Columns WHERE**: application_id
- **Status**: ✅ Valid

### Statement 34 — INSERT into application_grades (PATCH action=sync_grades — batch insert)
- **Line**: ~1640
- **Operation**: INSERT ... ON CONFLICT DO UPDATE
- **Table**: application_grades
- **Columns referenced**: application_id, subject_id, grade
- **ON CONFLICT**: (application_id, subject_id) DO UPDATE SET grade
- **Status**: ✅ All columns valid
- **⚠️ CODE BUG**: Placeholder builder missing `$` prefix:
  ```typescript
  placeholders.push(`(${offset + 1}, ${offset + 2}, ${offset + 3})`);
  // produces "(1, 2, 3)" not "($1, $2, $3)"
  ```

### Statement 35 — UPDATE applications via ApplicationQueries.update (handleById PUT — regular update)
- **Line**: ~1670 (via lib/queries.ts)
- **Operation**: UPDATE ... RETURNING *
- **Table**: applications
- **allowedFields array** (from lib/queries.ts): full_name, nrc_number, passport_number, date_of_birth, sex, phone, email, residence_town, nationality, next_of_kin_name, next_of_kin_phone, program, intake, institution, result_slip_url, extra_kyc_url, payment_method, payer_name, payer_phone, amount, paid_at, momo_ref, pop_url, payment_status, status, submitted_at
- **Also SET**: updated_at (NOW())
- **WHERE**: id
- **Status**: ✅ All 26 allowedFields are valid applications columns
- **⚠️ CODE BUG (in lib/queries.ts)**: Same missing `$` prefix pattern:
  ```typescript
  fields.push(`${field} = ${paramIndex}`);  // produces "full_name = 2" not "full_name = $2"
  ```

### Statement 36 — SELECT from applications with JOINs (fetchApplicationDetails)
- **Line**: ~1720
- **Operation**: SELECT with LEFT JOINs (via APPLICATION_PAYMENT_METADATA_SELECT + APPLICATION_PAYMENT_METADATA_JOINS)
- **Table**: applications (aliased as `a`), profiles (aliased as `verifier`), audit_logs (aliased as `al`), profiles (aliased as `actor`)
- **Columns referenced**: Same as Statement 7 (reuses the same constants)
- **WHERE**: a.id
- **Status**: ✅ All columns valid

### Statement 37 — SELECT from application_grades JOIN subjects via GradeQueries.findByApplicationId (fetchApplicationDetails)
- **Line**: ~1730 (via lib/queries.ts)
- **Operation**: SELECT with LEFT JOIN
- **Table**: application_grades, subjects
- **Columns referenced**: application_grades.id, application_grades.application_id, application_grades.subject_id, application_grades.grade, application_grades.created_at, subjects.name (as subject_name)
- **JOIN condition**: subjects.id = application_grades.subject_id
- **WHERE**: application_grades.application_id
- **Status**: ✅ All columns valid

### Statement 38 — SELECT from application_documents via DocumentQueries.findByApplicationId (fetchApplicationDetails)
- **Line**: ~1738 (via lib/queries.ts)
- **Operation**: SELECT *
- **Table**: application_documents
- **WHERE**: application_id
- **Status**: ✅ Valid (SELECT * — fragile but not phantom)

### Statement 39 — SELECT from application_status_history via StatusHistoryQueries.findByApplicationId (fetchApplicationDetails)
- **Line**: ~1745 (via lib/queries.ts)
- **Operation**: SELECT with LEFT JOIN
- **Table**: application_status_history (aliased as `h`), profiles (aliased as `p`)
- **Columns referenced**:
  - `h.id`, `h.application_id`, `h.old_status`, `h.new_status` (aliased AS status), `h.changed_by`, `h.notes`, `h.created_at` — ✅ all valid
  - `p.email`, `p.first_name`, `p.last_name` — ✅ valid profiles columns
- **JOIN condition**: `p.id = h.changed_by` — ✅ valid
- **WHERE**: `h.application_id`
- **Status**: ✅ All columns valid
- **Notes**: Correctly aliases `h.new_status AS status` for the StatusHistoryRecord interface compatibility.

### Statement 40 — SELECT from application_interviews (fetchApplicationDetails — latest interview)
- **Line**: ~1755
- **Operation**: SELECT
- **Table**: application_interviews
- **Columns referenced**: id, application_id, scheduled_at, mode, location, status, notes, created_by, updated_by, created_at, updated_at
- **WHERE**: application_id
- **ORDER BY**: updated_at, created_at
- **Status**: ✅ All 11 columns valid (matches full live schema)

### Statement 41 — SELECT from applications with complex subqueries and JOINs (handleExport)
- **Line**: ~1830
- **Operation**: SELECT with LEFT JOINs and correlated subqueries
- **Tables**: applications, profiles (verifier), audit_logs (al), profiles (actor), application_grades (g), subjects (s)
- **applications columns referenced**: id, application_number, full_name, email, phone, program, intake, institution, status, payment_status, application_fee, amount, submitted_at, created_at, date_of_birth, momo_ref, pop_url, payment_verified_at, payment_verified_by
- **profiles columns referenced**: first_name, last_name, email, id
- **audit_logs columns referenced**: created_at, changes, entity_type, entity_id, action, actor_id, id
- **application_grades columns referenced**: application_id, subject_id, grade
- **subjects columns referenced**: name, id
- **Status**: ✅ All columns valid
- **⚠️ CODE BUG**: LIMIT/OFFSET placeholders missing `$` prefix:
  ```
  LIMIT ${paramIndex} OFFSET ${paramIndex + 1}
  ```
  Produces `LIMIT 3 OFFSET 4` instead of `LIMIT $3 OFFSET $4`.

### Statement 42 — SELECT * from applications via ApplicationQueries.findById (handleEmailSlip)
- **Line**: ~1920 (via lib/queries.ts)
- **Operation**: SELECT *
- **Table**: applications
- **Columns WHERE**: id
- **Status**: ✅ Valid

### Statement 43 — INSERT into email_queue (handleEmailSlip)
- **Line**: ~1945
- **Operation**: INSERT
- **Table**: email_queue
- **Columns referenced**: recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority
- **Status**: ✅ All columns valid

---

## Specific Audit Items

### 1. Dynamic UPDATE Builder — allowedFields Arrays

#### save_draft allowedFields (line ~1580, in api-src/applications.ts):
```
full_name, nrc_number, passport_number, date_of_birth, sex, phone, email,
residence_town, nationality, next_of_kin_name, next_of_kin_phone, program,
intake, institution, result_slip_url, extra_kyc_url, payment_method,
payer_name, payer_phone, amount, paid_at, momo_ref, pop_url
```
**Verdict**: ✅ All 23 fields are valid `applications` columns in the live schema.

#### ApplicationQueries.update allowedFields (lib/queries.ts):
```
full_name, nrc_number, passport_number, date_of_birth, sex, phone, email,
residence_town, nationality, next_of_kin_name, next_of_kin_phone, program,
intake, institution, result_slip_url, extra_kyc_url, payment_method,
payer_name, payer_phone, amount, paid_at, momo_ref, pop_url, payment_status,
status, submitted_at
```
**Verdict**: ✅ All 26 fields are valid `applications` columns in the live schema.

### 2. fetchApplicationDetails Complex JOINs

The `fetchApplicationDetails` function (line ~1720) uses:
1. **Main query**: `SELECT a.*, verifier.*, payment_audit.* FROM applications a` with:
   - `LEFT JOIN profiles verifier ON verifier.id = a.payment_verified_by` — ✅ valid FK relationship
   - `LEFT JOIN LATERAL (SELECT ... FROM audit_logs al LEFT JOIN profiles actor ON actor.id = al.actor_id WHERE al.entity_type = 'payment' AND al.entity_id = a.id ...) payment_audit ON true` — ✅ all columns valid
2. **Grades subquery**: via `GradeQueries.findByApplicationId` — `LEFT JOIN subjects ON subjects.id = application_grades.subject_id` — ✅ valid
3. **Documents subquery**: via `DocumentQueries.findByApplicationId` — `SELECT * FROM application_documents WHERE application_id = $1` — ✅ valid
4. **Status history subquery**: via `StatusHistoryQueries.findByApplicationId` — `LEFT JOIN profiles p ON p.id = h.changed_by` — ✅ valid
5. **Interview subquery**: direct SQL selecting all 11 columns from `application_interviews WHERE application_id = $1` — ✅ valid

**Verdict**: ✅ All JOIN conditions reference valid columns and valid FK relationships.

### 3. application_status_history Column Usage (status vs old_status/new_status)

The live schema has ALL THREE columns: `status`, `old_status`, `new_status`.

| Location | Column(s) Used | Verdict |
|----------|---------------|---------|
| StatusHistoryQueries.create (lib/queries.ts) | `old_status`, `new_status` | ✅ Correct |
| StatusHistoryQueries.findByApplicationId (lib/queries.ts) | `h.old_status`, `h.new_status AS status` | ✅ Correct |
| Inline CTE in PATCH action=update_status (line ~990) | `old_status`, `new_status` | ✅ Correct |
| handleReview POST (via StatusHistoryQueries.create) | `old_status`, `new_status` | ✅ Correct |

**Verdict**: ✅ All code correctly uses `old_status`/`new_status` columns. The legacy `status` column exists in the live schema but is NOT referenced by any INSERT in this file. No column conflict in the code.

### 4. Idempotency Key INSERT/SELECT

| Operation | Columns | Verdict |
|-----------|---------|---------|
| SELECT (checkIdempotencyKey) | response_json, key, endpoint, created_at | ✅ All valid |
| INSERT ON CONFLICT (storeIdempotencyKey) | key, endpoint, response_json, created_at | ✅ All valid |
| DELETE (cleanup) | created_at | ✅ Valid |

**Verdict**: ✅ All idempotency_keys column references are valid.

---

## Summary Table

| # | Line (approx) | Operation | Table | Status |
|---|---|---|---|---|
| 1 | ~57 | SELECT | idempotency_keys | ✅ Valid |
| 2 | ~73 | INSERT ON CONFLICT | idempotency_keys | ✅ Valid |
| 3 | ~80 | DELETE | idempotency_keys | ✅ Valid |
| 4 | ~230 | SELECT | applications | ✅ Valid |
| 5 | ~290 | INSERT | applications | ✅ Valid (⚠️ missing $ in placeholders) |
| 6 | ~370 | SELECT COUNT | applications | ✅ Valid (⚠️ missing $ in WHERE) |
| 7 | ~385 | SELECT + JOINs | applications, profiles, audit_logs | ✅ Valid (⚠️ missing $ in LIMIT/OFFSET) |
| 8 | ~530 | SELECT + JOIN | application_interviews, applications | ✅ Valid |
| 9 | ~575 | SELECT | applications | ✅ Valid |
| 10 | ~582 | INSERT | application_interviews | ✅ Valid |
| 11 | ~605 | SELECT | applications | ✅ Valid |
| 12 | ~640 | SELECT COUNT | applications | ✅ Valid |
| 13 | ~650 | SELECT AVG | applications | ✅ Valid |
| 14 | ~670 | SELECT * | applications (via queries.ts) | ✅ Valid |
| 15 | ~685 | SELECT * | applications (via queries.ts) | ✅ Valid |
| 16 | ~710 | UPDATE + INSERT | applications, application_status_history (via queries.ts) | ✅ Valid |
| 17 | ~745 | INSERT | email_queue | ✅ Valid |
| 18 | ~895 | SELECT EXISTS | applications (via queries.ts) | ✅ Valid |
| 19 | ~920 | SELECT * | applications (via queries.ts) | ✅ Valid |
| 20 | ~935 | DELETE | applications (via queries.ts) | ✅ Valid |
| 21 | ~990 | CTE: UPDATE + INSERT + INSERT | applications, application_status_history, notifications | ✅ Valid |
| 22 | ~1060 | INSERT | email_queue | ✅ Valid |
| 23 | ~1130 | CTE: UPDATE + INSERT | applications, notifications | ✅ Valid |
| 24 | ~1260 | INSERT | notifications | ✅ Valid |
| 25 | ~1280 | INSERT | email_queue | ✅ Valid |
| 26 | ~1340 | INSERT | application_interviews | ✅ Valid |
| 27 | ~1390 | SELECT | application_interviews | ✅ Valid |
| 28 | ~1405 | UPDATE | application_interviews | ✅ Valid (⚠️ missing $ in SET/WHERE) |
| 29 | ~1525 | SELECT | application_interviews | ✅ Valid |
| 30 | ~1535 | UPDATE | application_interviews | ✅ Valid |
| 31 | ~1580 | UPDATE (dynamic) | applications | ✅ Valid (⚠️ missing $ in SET) |
| 32 | ~1610 | SELECT | applications | ✅ Valid |
| 33 | ~1630 | DELETE | application_grades (via queries.ts) | ✅ Valid |
| 34 | ~1640 | INSERT ON CONFLICT | application_grades | ✅ Valid (⚠️ missing $ in placeholders) |
| 35 | ~1670 | UPDATE (dynamic) | applications (via queries.ts) | ✅ Valid (⚠️ missing $ in SET) |
| 36 | ~1720 | SELECT + JOINs | applications, profiles, audit_logs | ✅ Valid |
| 37 | ~1730 | SELECT + JOIN | application_grades, subjects (via queries.ts) | ✅ Valid |
| 38 | ~1738 | SELECT * | application_documents (via queries.ts) | ✅ Valid |
| 39 | ~1745 | SELECT + JOIN | application_status_history, profiles (via queries.ts) | ✅ Valid |
| 40 | ~1755 | SELECT | application_interviews | ✅ Valid |
| 41 | ~1830 | SELECT + JOINs + subqueries | applications, profiles, audit_logs, application_grades, subjects | ✅ Valid (⚠️ missing $ in LIMIT/OFFSET) |
| 42 | ~1920 | SELECT * | applications (via queries.ts) | ✅ Valid |
| 43 | ~1945 | INSERT | email_queue | ✅ Valid |

**Total SQL statements audited**: 43
**Phantom columns found**: 0
**All column references are valid against the live schema.**

---

## Non-Schema Issues Found (Code Bugs)

### ⚠️ CRITICAL CODE BUG: Missing `$` prefix in SQL parameter placeholders

This is the same bug pattern found in Task 4.1 (api-src/auth.ts). Multiple locations in api-src/applications.ts build SQL with template literals that produce integer literals instead of parameterized placeholders.

**Affected locations in api-src/applications.ts:**

| Location | Line (approx) | Code Pattern | Produces | Should Produce |
|----------|---|---|---|---|
| handleCreate — INSERT placeholders | ~300 | `` `${i + 1}` `` | `1, 2, 3` | `$1, $2, $3` |
| handleDetails — WHERE conditions | ~350-370 | `` `a.user_id = ${paramIndex}` `` | `a.user_id = 1` | `a.user_id = $1` |
| handleDetails — LIMIT/OFFSET | ~385 | `` `LIMIT ${paramIndex}` `` | `LIMIT 7` | `LIMIT $7` |
| reschedule_interview — SET/WHERE | ~1405 | `` `mode = ${pIdx}` `` | `mode = 2` | `mode = $2` |
| save_draft — SET clauses | ~1580 | `` `${field} = ${paramIdx}` `` | `full_name = 3` | `full_name = $3` |
| sync_grades — INSERT placeholders | ~1640 | `` `(${offset + 1}, ...)` `` | `(1, 2, 3)` | `($1, $2, $3)` |
| handleExport — LIMIT/OFFSET | ~1830 | `` `LIMIT ${paramIndex}` `` | `LIMIT 3` | `LIMIT $3` |

**Affected locations in lib/queries.ts (used by applications.ts):**

| Location | Code Pattern | Produces | Should Produce |
|----------|---|---|---|
| ApplicationQueries.update — SET | `` `${field} = ${paramIndex}` `` | `full_name = 2` | `full_name = $2` |

**Impact**: These would cause:
1. SQL syntax errors (PostgreSQL interprets bare integers as literal values, not parameter references)
2. Data corruption (SET clauses would set fields to integer values instead of actual data)
3. Wrong row matching (WHERE clauses would compare UUIDs to integers)

**Root cause**: Template literal interpolation `${paramIndex}` produces the number value. The `$` character that PostgreSQL requires for parameterized queries is being consumed by JavaScript's template literal syntax. The fix is to escape it: `` `\$${paramIndex}` `` or use string concatenation: `'$' + paramIndex`.

---

## SELECT * Usages (Fragile to Schema Changes)

The following `SELECT *` usages were found:

| # | Line (approx) | Table | Via |
|---|---|---|---|
| 1 | ~385 | applications (a.*) | APPLICATION_PAYMENT_METADATA_SELECT |
| 2 | ~670 | applications | ApplicationQueries.findPendingReview |
| 3 | ~685 | applications | ApplicationQueries.findById |
| 4 | ~895 | applications | ApplicationQueries.checkOwnership (SELECT EXISTS) |
| 5 | ~920 | applications | ApplicationQueries.findById |
| 6 | ~1580 | applications | save_draft RETURNING * |
| 7 | ~1670 | applications | ApplicationQueries.update RETURNING * |
| 8 | ~1720 | applications (a.*) | fetchApplicationDetails |
| 9 | ~1738 | application_documents | DocumentQueries.findByApplicationId |

These are flagged for review per Requirement 4.11 but are not phantom column issues.

---

## Task Prompt Schema Corrections

The task prompt provided column lists that differ from the live Neon schema. For the record:

**application_interviews**: Task prompt listed `interviewer_id` — live schema does NOT have this column. Live schema has `mode`, `created_by`, `updated_by` which were not in the task prompt.

**application_documents**: Task prompt listed `file_name`, `file_path`, `verdict`, `rejection_reason`, `ocr_data` — live schema has `document_name`, `file_url`, `verification_notes`, `system_generated` instead. The columns `file_name`, `file_path`, `verdict`, `rejection_reason`, `ocr_data` do NOT exist.

**application_drafts**: Task prompt listed `application_id` — live schema does NOT have this column. Live schema has `draft_name`, `step_completed`, `last_accessed_at` which were not in the task prompt.

**application_grades**: Task prompt listed `updated_at` — live schema does NOT have `updated_at` on this table.

**applications**: Task prompt listed 43 columns but live schema has 50 columns. Missing from task prompt: full_name, institution, result_slip_url, extra_kyc_url, application_fee, payer_name, payer_phone, amount, paid_at, momo_ref, pop_url, payment_verified_at, payment_verified_by, eligibility_score, eligibility_notes, admin_feedback_date, admin_feedback_by, review_started_at, submitted_at, address_line_1, address_line_2, postal_code. Task prompt listed columns that don't exist: first_name, last_name, residence_address, grade_12_year, school_name, school_province, school_district, payment_amount, payment_reference, eligibility_details, interview_date, interview_notes.

The live Neon MCP query is the ground truth for all cross-referencing.
