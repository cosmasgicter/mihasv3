# SQL Cross-Reference Audit Report: api-src/admin.ts (Task 4.3)

## Ground Truth — Live Schema Columns (verified via Neon MCP)

**profiles** (30 columns): id, email, role, first_name, last_name, phone, is_active, password_hash, refresh_token_hash, failed_login_attempts, locked_until, password_changed_at, email_verified, avatar_url, date_of_birth, nrc_number, nationality, address, notification_preferences, last_login_at, created_at, updated_at, reset_token_hash, reset_token_expires, reset_token_used, sex, residence_town, next_of_kin_name, next_of_kin_phone, full_name

**applications** (50 columns): id, application_number, user_id, full_name, nrc_number, passport_number, date_of_birth, sex, phone, email, residence_town, nationality, address_line_1, address_line_2, postal_code, next_of_kin_name, next_of_kin_phone, program, intake, institution, result_slip_url, extra_kyc_url, application_fee, payment_method, payer_name, payer_phone, amount, paid_at, momo_ref, pop_url, receipt_number, payment_status, payment_verified_at, payment_verified_by, status, eligibility_status, eligibility_score, eligibility_notes, admin_feedback, admin_feedback_date, admin_feedback_by, review_started_at, decision_date, reviewed_by, additional_subjects, public_tracking_code, submitted_at, created_at, updated_at, version

**settings** (9 columns): id, key, value (jsonb), description, category, is_public, updated_by, created_at, updated_at

**user_permission_overrides** (5 columns): user_id (PK), permissions (text[] ARRAY), updated_by, created_at, updated_at

**audit_logs** (10 columns): id, actor_id, action, entity_type, entity_id, changes, ip_address, user_agent, created_at, retention_category

**notifications** (13 columns): id, user_id, title, message, type, priority, action_url, metadata, is_read, read_at, created_at, updated_at, idempotency_key

**email_queue** (15 columns): id, recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority, retry_count, max_retries, error_message, sent_at, created_at

**application_status_history** (11 columns): id, application_id, status, changed_by, notes, changes, ip_address, user_agent, created_at, old_status, new_status

**device_sessions** (12 columns): id, user_id, device_id, device_info, session_token, ip_address, user_agent, last_activity, is_active, expires_at, created_at, updated_at

**Non-existent tables referenced**: user_roles, eligibility_appeals, eligibility_rules (NONE exist in live schema)

---

## SystemSetting Interface Audit

**Interface** (lines ~52-62):
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

**Live settings columns**: id, key, value, description, category, is_public, updated_by, created_at, updated_at

**Status**: ✅ All 9 interface fields match live schema columns exactly. Type mappings are compatible (string↔uuid/varchar, unknown↔jsonb, boolean↔boolean).

---

## handleUpdateUser Audit (lines ~1155-1230)

**UPDATE profiles SET clause**:
- `email = $1` → ✅ profiles.email exists
- `first_name = $2` → ✅ profiles.first_name exists
- `last_name = $3` → ✅ profiles.last_name exists
- `full_name = $4` → ✅ profiles.full_name exists
- `phone = $5` → ✅ profiles.phone exists
- `role = $6` → ✅ profiles.role exists
- `updated_at = NOW()` → ✅ profiles.updated_at exists

**RETURNING clause**: id, email, first_name, last_name, full_name, phone, role, updated_at → ✅ All valid

**Status**: ✅ All updatable fields correspond to real profiles columns. Parameterization is correct ($1-$7).

---

## SQL Statement Audit

### Statement 1 — UPDATE profiles (revokeUserSessions)
- **Line**: ~73
- **Operation**: UPDATE
- **Table**: profiles
- **Columns**: refresh_token_hash (SET), updated_at (SET), id (WHERE)
- **Status**: ✅ All columns valid

### Statement 2 — UPDATE device_sessions (revokeUserSessions)
- **Line**: ~80
- **Operation**: UPDATE
- **Table**: device_sessions
- **Columns**: is_active (SET), user_id (WHERE), is_active (WHERE)
- **Status**: ✅ All columns valid

### Statement 3 — SELECT * FROM settings (handleGetSettings)
- **Line**: ~310
- **Operation**: SELECT *
- **Table**: settings
- **Status**: ⚠️ SELECT * — fragile to schema changes but functionally correct

### Statement 4 — INSERT INTO settings (handleCreateSetting)
- **Line**: ~325
- **Operation**: INSERT
- **Table**: settings
- **Columns**: key, value, description, category, is_public, updated_by, created_at, updated_at
- **Status**: ✅ All 8 columns valid. Parameters $1-$6 with NOW() for timestamps.

### Statement 5 — UPDATE settings (handleUpdateSetting — dynamic builder)
- **Line**: ~394-430
- **Operation**: UPDATE (dynamic)
- **Table**: settings
- **Columns**: updated_by, updated_at, value, category, description, is_public, id/key (WHERE)
- **Status**: ❌ **CRITICAL BUG — Missing `$` prefix on parameter placeholders**
- **Details**: Lines ~399, 404, 409, 414, 422, 425 use `` `value = ${paramIndex}` `` instead of `` `value = $${paramIndex}` ``
- **Impact**: Generates SQL like `value = 2` instead of `value = $2`. This treats the paramIndex integer as a literal value instead of a parameter reference. The query will set columns to literal integers (2, 3, 4...) instead of the actual parameter values.
- **Affected lines**:
  - Line ~399: `updates.push(\`value = ${paramIndex}\`)` → should be `$${paramIndex}`
  - Line ~404: `updates.push(\`category = ${paramIndex}\`)` → should be `$${paramIndex}`
  - Line ~409: `updates.push(\`description = ${paramIndex}\`)` → should be `$${paramIndex}`
  - Line ~414: `updates.push(\`is_public = ${paramIndex}\`)` → should be `$${paramIndex}`
  - Line ~422: `whereClause = \`id = ${paramIndex}\`` → should be `$${paramIndex}`
  - Line ~425: `whereClause = \`key = ${paramIndex}\`` → should be `$${paramIndex}`

### Statement 6 — DELETE FROM settings (handleDeleteSetting)
- **Line**: ~449, 451
- **Operation**: DELETE
- **Table**: settings
- **Columns**: id (WHERE) or key (WHERE)
- **Status**: ✅ All columns valid. Proper $1 parameterization.

### Statement 7 — SELECT from applications (handleDashboard — recent apps)
- **Line**: ~476
- **Operation**: SELECT
- **Table**: applications
- **Columns**: id, application_number, full_name, status, program, created_at
- **Status**: ✅ All columns valid

### Statement 8 — SELECT from applications (handleDashboard — status counts)
- **Line**: ~481
- **Operation**: SELECT
- **Table**: applications
- **Columns**: status, COUNT(*)
- **Status**: ✅ All columns valid

### Statement 9 — SELECT from applications (handleDashboard — today count)
- **Line**: ~484
- **Operation**: SELECT
- **Table**: applications
- **Columns**: COUNT(*), created_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 10 — SELECT from applications (handleDashboard — week count)
- **Line**: ~487
- **Operation**: SELECT
- **Table**: applications
- **Columns**: COUNT(*), created_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 11 — SELECT from applications (handleDashboard — month count)
- **Line**: ~490
- **Operation**: SELECT
- **Table**: applications
- **Columns**: COUNT(*), created_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 12 — SELECT * FROM profiles (handleUsers — dynamic query)
- **Line**: ~639
- **Operation**: SELECT *
- **Table**: profiles
- **Columns in WHERE**: is_active, role, full_name, first_name, last_name, email (all via dynamic builder)
- **Status**: ❌ **CRITICAL BUG — Missing `$` prefix on parameter placeholders**
- **Details**: Lines ~624, 629, 639 use `` `role = ${paramIndex}` `` instead of `` `role = $${paramIndex}` ``
- **Impact**: Generates SQL like `role = 1` or `LOWER(full_name) LIKE 1` instead of `role = $1`. The WHERE clause compares columns against literal integers instead of parameter values. This means filtering by role or search will NEVER work correctly.
- **Affected lines**:
  - Line ~624: `conditions.push(\`role = ${paramIndex}\`)` → should be `$${paramIndex}`
  - Line ~629: `conditions.push(\`(LOWER(full_name) LIKE ${paramIndex} OR ...)\`)` → should be `$${paramIndex}` (4 occurrences on same line)
  - Line ~639: `LIMIT ${paramIndex} OFFSET ${paramIndex + 1}` → should be `$${paramIndex}` and `$${paramIndex + 1}`
- **Note**: The COUNT query on line ~643 reuses the same broken `whereClause` variable

### Statement 13 — SELECT from profiles (handleBulkEmail — recipients)
- **Line**: ~690
- **Operation**: SELECT
- **Table**: profiles
- **Columns**: id, full_name, email, is_active (WHERE)
- **Status**: ✅ All columns valid

### Statement 14 — INSERT INTO notifications (handleBulkEmail)
- **Line**: ~710
- **Operation**: INSERT
- **Table**: notifications
- **Columns**: user_id, title, message, type, is_read, created_at
- **Status**: ✅ All columns valid (type='info', is_read=false are valid values)

### Statement 15 — INSERT INTO email_queue (handleBulkEmail)
- **Line**: ~714
- **Operation**: INSERT
- **Table**: email_queue
- **Columns**: recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority
- **Status**: ✅ All 9 columns valid

### Statement 16 — SELECT from applications (handleBulkStatus — app lookup)
- **Line**: ~760
- **Operation**: SELECT
- **Table**: applications
- **Columns**: id, payment_status
- **Status**: ✅ All columns valid

### Statement 17 — UPDATE applications (handleBulkStatus)
- **Line**: ~775
- **Operation**: UPDATE
- **Table**: applications
- **Columns**: status (SET), reviewed_by (SET), review_started_at (SET), updated_at (SET), id (WHERE)
- **Status**: ✅ All columns valid

### Statement 18 — INSERT INTO application_status_history (handleBulkStatus)
- **Line**: ~782
- **Operation**: INSERT
- **Table**: application_status_history
- **Columns**: id, application_id, status, new_status, changed_by, notes, created_at
- **Status**: ✅ All columns valid. Note: inserts same value for both `status` and `new_status` ($2, $2) — redundant but not incorrect since both columns exist.

### Statement 19 — SELECT from profiles (handleExportUsers)
- **Line**: ~815
- **Operation**: SELECT
- **Table**: profiles
- **Columns**: id, full_name, email, phone, role, is_active, created_at
- **Status**: ✅ All columns valid

### Statement 20 — SELECT from profiles (handleDeactivateUser — target lookup)
- **Line**: ~850
- **Operation**: SELECT
- **Table**: profiles
- **Columns**: id, role, is_active, email
- **Status**: ✅ All columns valid

### Statement 21 — UPDATE profiles (handleDeactivateUser)
- **Line**: ~880
- **Operation**: UPDATE
- **Table**: profiles
- **Columns**: is_active (SET), refresh_token_hash (SET), updated_at (SET), id (WHERE), is_active (WHERE)
- **RETURNING**: id, email, role, is_active, updated_at
- **Status**: ✅ All columns valid

### Statement 22 — UPDATE device_sessions (handleDeactivateUser)
- **Line**: ~895
- **Operation**: UPDATE
- **Table**: device_sessions
- **Columns**: is_active (SET), user_id (WHERE), is_active (WHERE)
- **Status**: ✅ All columns valid

### Statement 23 — UPDATE user_roles (handleDeactivateUser)
- **Line**: ~979
- **Operation**: UPDATE
- **Table**: user_roles
- **Columns**: is_active (SET), updated_at (SET), user_id (WHERE)
- **Status**: ⚠️ **Table `user_roles` does NOT exist in live schema** — wrapped in try/catch so non-fatal

### Statement 24 — SELECT from profiles (handleUserPermissions — GET)
- **Line**: ~1040, ~1130
- **Operation**: SELECT
- **Table**: profiles
- **Columns**: id, role
- **Status**: ✅ All columns valid

### Statement 25 — DELETE FROM user_permission_overrides (handleUserPermissions — reset to default)
- **Line**: ~1058
- **Operation**: DELETE
- **Table**: user_permission_overrides
- **Columns**: user_id (WHERE)
- **Status**: ✅ Column valid

### Statement 26 — INSERT INTO user_permission_overrides (handleUserPermissions — UPSERT)
- **Line**: ~1061
- **Operation**: INSERT ... ON CONFLICT
- **Table**: user_permission_overrides
- **Columns**: user_id, permissions, updated_by, created_at, updated_at
- **ON CONFLICT**: user_id → UPDATE permissions, updated_by, updated_at
- **Status**: ✅ All 5 columns valid. `$2::text[]` cast is correct for the ARRAY column. Note: live schema has `created_at` column (5 columns total, not 4 as stated in task description).

### Statement 27 — SELECT from profiles (handleUpdateUser — current user check)
- **Line**: ~1165
- **Operation**: SELECT
- **Table**: profiles
- **Columns**: id, role
- **Status**: ✅ All columns valid

### Statement 28 — SELECT from profiles (handleUpdateUser — email uniqueness)
- **Line**: ~1173
- **Operation**: SELECT
- **Table**: profiles
- **Columns**: id, email (WHERE), id (WHERE)
- **Status**: ✅ All columns valid

### Statement 29 — UPDATE profiles (handleUpdateUser)
- **Line**: ~1183
- **Operation**: UPDATE
- **Table**: profiles
- **Columns SET**: email, first_name, last_name, full_name, phone, role, updated_at
- **Columns WHERE**: id
- **RETURNING**: id, email, first_name, last_name, full_name, phone, role, updated_at
- **Status**: ✅ All columns valid. Proper $1-$7 parameterization.

### Statement 30 — INSERT INTO user_roles (handleUpdateUser)
- **Line**: ~1214
- **Operation**: INSERT ... ON CONFLICT
- **Table**: user_roles
- **Columns**: user_id, role, is_active, created_at, updated_at
- **Status**: ⚠️ **Table `user_roles` does NOT exist in live schema** — wrapped in try/catch so non-fatal

### Statement 31 — SELECT from profiles (handleRegisterUser — email check)
- **Line**: ~1270
- **Operation**: SELECT
- **Table**: profiles
- **Columns**: id, email (WHERE)
- **Status**: ✅ All columns valid

### Statement 32 — INSERT INTO profiles (handleRegisterUser)
- **Line**: ~1283
- **Operation**: INSERT
- **Table**: profiles
- **Columns**: email, password_hash, first_name, last_name, full_name, phone, role, email_verified, created_at, updated_at
- **RETURNING**: id, email, first_name, last_name, full_name, phone, role, created_at
- **Status**: ✅ All 10 INSERT columns and 8 RETURNING columns valid

### Statement 33 — SELECT COUNT(*) FROM applications (handleDashboardStats)
- **Line**: ~1320
- **Operation**: SELECT
- **Table**: applications
- **Columns**: COUNT(*)
- **Status**: ✅ Valid

### Statement 34 — SELECT status, COUNT(*) FROM applications (handleDashboardStats)
- **Line**: ~1321
- **Operation**: SELECT
- **Table**: applications
- **Columns**: status, COUNT(*)
- **Status**: ✅ All columns valid

### Statement 35 — SELECT program, COUNT(*) FROM applications (handleDashboardStats)
- **Line**: ~1324
- **Operation**: SELECT
- **Table**: applications
- **Columns**: program, COUNT(*)
- **Status**: ✅ All columns valid

### Statement 36 — SELECT from applications (handleDashboardStats — recent)
- **Line**: ~1327
- **Operation**: SELECT
- **Table**: applications
- **Columns**: id, application_number, full_name, status, created_at
- **Status**: ✅ All columns valid

### Statement 37 — SELECT role, COUNT(*) FROM profiles (handleDashboardStats)
- **Line**: ~1332
- **Operation**: SELECT
- **Table**: profiles
- **Columns**: role, COUNT(*)
- **Status**: ✅ All columns valid

### Statement 38 — SELECT from applications (handleDashboardStats — today/week/month)
- **Lines**: ~1335, 1339, 1343
- **Operation**: SELECT
- **Table**: applications
- **Columns**: COUNT(*), created_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 39 — SELECT from audit_logs (handleErrorStatistics — error counts)
- **Line**: ~1410
- **Operation**: SELECT
- **Table**: audit_logs
- **Columns**: action, COUNT(*), created_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 40 — SELECT from audit_logs (handleErrorStatistics — recent errors)
- **Line**: ~1416
- **Operation**: SELECT
- **Table**: audit_logs
- **Columns**: id, action, entity_type, created_at
- **Status**: ✅ All columns valid

### Statement 41 — SELECT from audit_logs (handleErrorStatistics — errors by day)
- **Line**: ~1422
- **Operation**: SELECT
- **Table**: audit_logs
- **Columns**: DATE(created_at), COUNT(*), action (WHERE), created_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 42 — SELECT from profiles (handleSetPassword — user lookup)
- **Line**: ~1560
- **Operation**: SELECT
- **Table**: profiles
- **Columns**: id, email, first_name, last_name, role
- **Status**: ✅ All columns valid

### Statement 43 — UPDATE profiles (handleSetPassword)
- **Line**: ~1572
- **Operation**: UPDATE
- **Table**: profiles
- **Columns**: password_hash (SET), updated_at (SET), id (WHERE)
- **Status**: ✅ All columns valid

### Statement 44 — ALTER TABLE profiles (handleMigrate — add columns)
- **Lines**: ~1615, 1621, 1627
- **Operation**: ALTER TABLE ADD COLUMN IF NOT EXISTS
- **Table**: profiles
- **Columns**: password_hash, refresh_token_hash, role
- **Status**: ✅ All columns exist. Idempotent (IF NOT EXISTS).

### Statement 45 — CREATE INDEX (handleMigrate)
- **Lines**: ~1633, 1639
- **Operation**: CREATE INDEX IF NOT EXISTS
- **Table**: profiles
- **Columns**: email, role
- **Status**: ✅ All columns valid. Idempotent.

### Statement 46 — INSERT INTO settings (handleImportSettings — batch upsert)
- **Line**: ~1700
- **Operation**: INSERT ... ON CONFLICT
- **Table**: settings
- **Columns**: key, value, description, category, is_public, updated_by, created_at, updated_at
- **Status**: ❌ **CRITICAL BUG — Missing `$` prefix on parameter placeholders**
- **Details**: Line ~1698 uses `` `(${offset + 1}, ${offset + 2}, ...)` `` instead of `` `($${offset + 1}, $${offset + 2}, ...)` ``
- **Impact**: Generates SQL like `VALUES (1, 2, 3, 4, 5, 6, NOW(), NOW())` instead of `VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`. All settings will be inserted with literal integer values instead of actual data.

### Statement 47 — DELETE FROM settings (handleResetSettings)
- **Line**: ~1806
- **Operation**: DELETE
- **Table**: settings
- **Columns**: WHERE 1=1 (unconditional)
- **Status**: ✅ Valid (intentional full table delete)

### Statement 48 — INSERT INTO settings (handleResetSettings — batch insert)
- **Line**: ~1813
- **Operation**: INSERT
- **Table**: settings
- **Columns**: key, value, description, category, is_public, updated_by, created_at, updated_at
- **Status**: ❌ **CRITICAL BUG — Missing `$` prefix on parameter placeholders**
- **Details**: Line ~1813 uses `` `(${offset + 1}, ${offset + 2}, ...)` `` — same bug as Statement 46
- **Impact**: Same as Statement 46 — literal integers instead of parameter references

### Statement 49 — SELECT from audit_logs + profiles (handleAuditLog — dynamic query)
- **Lines**: ~2000-2090
- **Operation**: SELECT with LEFT JOIN
- **Tables**: audit_logs (al), profiles (actor)
- **audit_logs columns**: id, actor_id, action, entity_type, entity_id, changes, ip_address, user_agent, created_at
- **profiles columns** (via JOIN): email, full_name, first_name, last_name, role
- **JOIN condition**: actor.id = al.actor_id
- **Status**: ❌ **CRITICAL BUG — Missing `$` prefix on parameter placeholders in WHERE clauses**
- **Details**: Lines ~2002-2030 use `` `al.action ILIKE ${params.length}` `` instead of `` `al.action ILIKE $${params.length}` ``
- **Affected lines**:
  - Line ~2002: `al.action ILIKE ${params.length}` → should be `$${params.length}`
  - Line ~2007: `COALESCE(actor.email, '') ILIKE ${params.length}` → should be `$${params.length}`
  - Line ~2012: `al.actor_id = ${params.length}::uuid OR al.entity_id = ${params.length}::uuid` → should be `$${params.length}` (2 occurrences)
  - Line ~2017: `al.entity_type = ${params.length}` → should be `$${params.length}`
  - Line ~2022: `(${categorySql}) = ${params.length}` → should be `$${params.length}`
  - Line ~2027: `al.created_at >= ${params.length}::timestamptz` → should be `$${params.length}`
  - Line ~2031: `al.created_at <= ${params.length}::timestamptz` → should be `$${params.length}`
  - Line ~2060: `LIMIT ${params.length + 1} OFFSET ${params.length + 2}` → should be `$${params.length + 1}` and `$${params.length + 2}`
- **Column references**: ✅ All audit_logs and profiles columns referenced are valid
- **Note**: The `retention_category` column exists in audit_logs but is NOT referenced in any query in this file

### Statement 50 — SELECT from eligibility_appeals (handleAppeals)
- **Line**: ~2140-2145
- **Operation**: SELECT COUNT(*) + SELECT *
- **Table**: eligibility_appeals
- **Status**: ⚠️ **Table `eligibility_appeals` does NOT exist in live schema** — wrapped in try/catch, returns empty array gracefully

### Statement 51 — UPDATE profiles (handleUpdateRole)
- **Line**: ~1910
- **Operation**: UPDATE
- **Table**: profiles
- **Columns**: role (SET), updated_at (SET), id (WHERE)
- **RETURNING**: id, email, first_name, last_name, role
- **Status**: ✅ All columns valid

### Statement 52 — INSERT INTO user_roles (handleUpdateRole)
- **Line**: ~1918
- **Operation**: INSERT ... ON CONFLICT
- **Table**: user_roles
- **Columns**: user_id, role, is_active, created_at, updated_at
- **Status**: ⚠️ **Table `user_roles` does NOT exist in live schema** — wrapped in try/catch so non-fatal

---

## Summary of Findings

### ❌ CRITICAL BUGS (5 instances of same bug pattern)

| # | Function | Line(s) | Bug | Impact |
|---|----------|---------|-----|--------|
| 1 | handleUpdateSetting | ~399-425 | Missing `$` prefix: `${paramIndex}` instead of `$${paramIndex}` | Settings UPDATE sets columns to literal integers instead of actual values |
| 2 | handleUsers | ~624-639 | Missing `$` prefix: `${paramIndex}` instead of `$${paramIndex}` | User filtering/pagination completely broken — compares columns to literal integers |
| 3 | handleImportSettings | ~1698 | Missing `$` prefix: `${offset + 1}` instead of `$${offset + 1}` | Batch settings import inserts literal integers instead of actual data |
| 4 | handleResetSettings | ~1813 | Missing `$` prefix: `${offset + 1}` instead of `$${offset + 1}` | Default settings reset inserts literal integers instead of actual data |
| 5 | handleAuditLog | ~2002-2060 | Missing `$` prefix: `${params.length}` instead of `$${params.length}` | Audit log filtering/pagination completely broken |

**Root cause**: All 5 dynamic SQL builders in admin.ts use JavaScript template literals to construct parameter placeholders but omit the PostgreSQL `$` prefix. The pattern `\`column = ${paramIndex}\`` produces `column = 2` (literal integer) instead of `column = $2` (parameter reference). This is the **exact same bug** found in auth.ts and applications.ts.

### ⚠️ NON-EXISTENT TABLE REFERENCES (3 tables)

| Table | Functions | Lines | Handling |
|-------|-----------|-------|----------|
| `user_roles` | handleDeactivateUser, handleUpdateUser, handleUpdateRole | ~979, ~1214, ~1918 | try/catch — non-fatal, silently ignored |
| `eligibility_appeals` | handleAppeals | ~2140 | try/catch — returns empty array gracefully |
| `eligibility_rules` | handleEligibilityRules | ~1870 | Returns hardcoded empty response, no SQL executed |

### ⚠️ SELECT * USAGES (2 instances)

| Function | Line | Table | Risk |
|----------|------|-------|------|
| handleGetSettings | ~310 | settings | Low — small table, all columns needed |
| handleUsers | ~639 | profiles | Medium — 30-column table, exposes all fields including password_hash |

### ✅ VERIFIED CORRECT

| Check | Result |
|-------|--------|
| SystemSetting interface matches settings table | ✅ All 9 fields match |
| handleUpdateUser updatable fields match profiles columns | ✅ All 7 SET columns valid |
| handleRegisterUser INSERT columns match profiles | ✅ All 10 columns valid |
| user_permission_overrides.permissions treated as text[] ARRAY | ✅ `$2::text[]` cast is correct |
| handleBulkStatus INSERT into application_status_history | ✅ All columns valid |
| handleBulkEmail INSERT into notifications | ✅ All columns valid |
| handleBulkEmail INSERT into email_queue | ✅ All columns valid |
| All audit_logs column references | ✅ All columns valid |
| All profiles column references (non-dynamic) | ✅ All columns valid |
| All applications column references | ✅ All columns valid |

### Security Note

The `SELECT * FROM profiles` in handleUsers (line ~639) returns ALL 30 columns including `password_hash` and `refresh_token_hash` to the admin API response. While this is behind admin auth, it's a security concern — sensitive columns should be explicitly excluded.
