# Query Builder Audit Report — Task 5.3

**Scope**: All 9 query builder objects in `lib/queries.ts` validated against live Neon schema.

---

## 1. UserQueries → profiles

**Status**: ✅ CLEAN (all SQL correct)

| Method | Columns Referenced | Valid? | Notes |
|--------|-------------------|--------|-------|
| findByEmail | id, email, password_hash, refresh_token_hash, role, first_name, last_name, phone, is_active, failed_login_attempts, locked_until, password_changed_at, created_at, updated_at | ✅ | All 14 columns exist in profiles |
| findById | Same 14 columns | ✅ | |
| findByIdPublic | id, email, role, first_name, last_name, is_active, created_at, updated_at | ✅ | 8-column subset |
| findByRefreshToken | id, email, role, is_active, refresh_token_hash | ✅ | |
| create | id, email, password_hash, role, first_name, last_name, is_active, failed_login_attempts, created_at, updated_at | ✅ | 10 columns, 6 params ($1-$6) |
| createWithoutPassword | id, email, role, first_name, last_name, is_active, failed_login_attempts, created_at, updated_at | ✅ | |
| updatePassword | password_hash, password_changed_at, updated_at | ✅ | |
| updateRefreshToken | refresh_token_hash, updated_at | ✅ | |
| incrementFailedAttempts | failed_login_attempts, updated_at | ✅ | |
| resetFailedAttempts | failed_login_attempts, locked_until, updated_at | ✅ | |
| lockAccount | locked_until, updated_at | ✅ | |
| unlockAccount | locked_until, failed_login_attempts, updated_at | ✅ | |
| updateRole | role, updated_at | ✅ | |
| deactivate | is_active, refresh_token_hash, updated_at | ✅ | |
| reactivate | is_active, failed_login_attempts, locked_until, updated_at | ✅ | |
| list | id, email, role, first_name, last_name, is_active, created_at, updated_at | ✅ | |
| listByRole | Same + WHERE role | ✅ | |
| count | COUNT(*) | ✅ | |
| countByRole | COUNT(*) WHERE role | ✅ | |
| emailExists | EXISTS WHERE email | ✅ | |

**Parameter placeholders**: All use correct `$1`, `$2`, etc. syntax. ✅

---

## 2. SessionQueries → device_sessions

**Status**: ✅ CLEAN (fixed in prior round — now includes device_id and session_token)

| Method | Columns Referenced | Valid? | Notes |
|--------|-------------------|--------|-------|
| create | id, user_id, device_id, session_token, device_info, ip_address, user_agent, is_active, last_activity, created_at, expires_at | ✅ | All 11 columns exist. Values: `[id, userId, id, id, JSON.stringify(deviceInfo), ipAddress, userAgent]` — uses session id as both device_id and session_token placeholder |
| findById | id, user_id, device_info, ip_address, user_agent, is_active, last_activity, created_at, expires_at | ✅ | 9 columns, all exist |
| updateActivity | last_activity WHERE id AND is_active | ✅ | |
| deactivate | is_active WHERE id | ✅ | |
| deactivateAllForUser | is_active WHERE user_id AND is_active | ✅ | |
| deactivateAllExcept | is_active WHERE user_id AND id != AND is_active | ✅ | |
| getActiveForUser | id, user_id, device_info, ip_address, user_agent, last_activity, created_at, expires_at | ✅ | |
| countActiveForUser | COUNT(*) WHERE user_id AND is_active AND expires_at | ✅ | |
| deactivateExpired | is_active WHERE is_active AND expires_at/last_activity | ✅ | |
| deleteOldInactive | DELETE WHERE is_active AND created_at | ✅ | |
| isValid | EXISTS WHERE id AND is_active AND expires_at | ✅ | |
| extendExpiration | expires_at, last_activity WHERE id AND is_active | ✅ | |

**Live schema**: device_sessions has 12 columns: id, user_id, device_id (NOT NULL), session_token (NOT NULL), device_info (text nullable), ip_address (varchar nullable), user_agent (text nullable), last_activity, is_active, expires_at, created_at, updated_at.

**Note**: `device_info` is stored as `text` in DB but `JSON.stringify(deviceInfo)` is passed — this works since text accepts any string. However, reads will return a string, not a parsed object. The `SessionRecord` interface types it as `DeviceInfo` object which is a **type mismatch** (already flagged in Task 5.1).

**Parameter placeholders**: All correct. ✅

---

## 3. AuditQueries → audit_logs

**Status**: ⚠️ HIGH — Missing `retention_category` in INSERT

### Live schema (audit_logs, 10 columns):
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| actor_id | uuid | YES | |
| action | varchar | NO | |
| entity_type | varchar | NO | |
| entity_id | uuid | NO | |
| changes | jsonb | YES | |
| ip_address | inet | YES | |
| user_agent | text | YES | |
| created_at | timestamptz | YES | now() |
| retention_category | varchar | NO | 'standard' |

### Issues Found:

**ISSUE 3.1 — HIGH: AuditQueries.log() omits `retention_category`**
- INSERT lists: `actor_id, action, entity_type, entity_id, changes, ip_address, user_agent, created_at`
- Missing: `retention_category` — has DEFAULT 'standard' so INSERT succeeds, but all audit logs get 'standard' retention regardless of action type
- Security audit events (login failures, authorization failures) should use 'security' retention (365 days vs 90 days)
- Same issue in `logAuthEvent`, `logAuthorizationFailure`, `logSessionEvent`

**ISSUE 3.2 — MEDIUM: ip_address type mismatch**
- DB column is `inet` type
- Code passes string values (e.g., `'192.168.1.1'`)
- PostgreSQL auto-casts varchar→inet, so this works at runtime
- But passing invalid IP strings would cause a runtime error (no validation)

**ISSUE 3.3 — MEDIUM: entity_id is NOT NULL in DB but AuditLogRecord types it as `string | null`**
- The `sanitizeEntityId()` function handles this by replacing null with placeholder UUID `00000000-0000-0000-0000-000000000000`
- So runtime behavior is correct, but the interface is misleading

**ISSUE 3.4 — LOW: All SELECT queries omit `retention_category`**
- `findById`, `getForEntity`, `getByActor`, `getByAction`, `getRecent`, `getByDateRange` all SELECT 9 columns but omit `retention_category`
- Not a crash bug, but admin audit trail view won't show retention category

**ISSUE 3.5 — LOW: `deleteOlderThan` doesn't respect retention_category**
- Deletes all audit logs older than N days regardless of retention category
- Security events (365-day retention) could be deleted by a 90-day cleanup

**Parameter placeholders**: All correct (`$1`, `$2`, etc. with `::uuid` casts). ✅

---

## 4. ApplicationQueries → applications

**Status**: 🔴 CRITICAL — Missing `$` prefix in `update()` method

### Issues Found:

**ISSUE 4.1 — CRITICAL: `update()` method missing `$` prefix**
```typescript
fields.push(`${field} = ${paramIndex}`);
```
This produces: `full_name = 2` instead of `full_name = $2`
Should be: `fields.push(\`\${field} = $\${paramIndex}\`);`

**ISSUE 4.2 — MEDIUM: `update()` allowedFields includes 'nationality'**
- `nationality` column EXISTS in applications table (varchar, nullable, default 'Zambian') ✅
- This is correct — nationality was added by `add_version_and_nationality.sql`

**ISSUE 4.3 — LOW: ApplicationRecord missing 13+ columns from live schema**
- Already flagged in Task 5.1. The interface is a subset — not a query builder SQL issue per se, but `SELECT *` queries return columns not in the interface.

**ISSUE 4.4 — LOW: Multiple methods use `SELECT *`**
- `findAll`, `findByUserId`, `findById`, `findByIdForUser`, `findPendingReview`, `findByStatus`, `updateStatus`, `update`, `submit` all use `SELECT *` or `RETURNING *`
- Fragile to schema changes but not incorrect

**Parameter placeholders**: All correct EXCEPT `update()` method (CRITICAL). ❌

---

## 5. DocumentQueries → application_documents

**Status**: ✅ CLEAN

| Method | Valid? | Notes |
|--------|--------|-------|
| findAll | ✅ | SELECT * — all 15 columns exist |
| findByApplicationId | ✅ | SELECT * WHERE application_id |
| findById | ✅ | SELECT * WHERE id |
| create | ✅ | INSERT 12 columns: id, application_id, document_type, document_name, file_url, file_size, mime_type, system_generated, verification_status, uploaded_at, created_at, updated_at — all exist |
| updateVerification | ✅ | UPDATE verification_status, verified_by, verified_at, verification_notes, updated_at — all exist |
| delete | ✅ | DELETE RETURNING id, file_url — both exist |
| countByApplication | ✅ | COUNT(*) WHERE application_id |

**Parameter placeholders**: All correct. ✅

---

## 6. GradeQueries → application_grades

**Status**: ✅ CLEAN

| Method | Valid? | Notes |
|--------|--------|-------|
| findAll | ✅ | SELECT * — 5 columns all exist |
| findByApplicationId | ✅ | JOIN subjects on subject_id — valid FK |
| upsert | ✅ | INSERT id, application_id, subject_id, grade, created_at — all 5 exist. ON CONFLICT (application_id, subject_id) — unique constraint exists |
| deleteByApplication | ✅ | DELETE WHERE application_id |

**Parameter placeholders**: All correct. ✅

---

## 7. StatusHistoryQueries → application_status_history

**Status**: ✅ CORRECT (uses old_status/new_status properly)

### Live schema has ALL THREE columns:
- `status` (varchar NOT NULL) — legacy from core schema
- `old_status` (text nullable) — added by migration
- `new_status` (text nullable) — added by migration

### Method Analysis:

**`create()`**: INSERT into `old_status, new_status, changed_by, notes` — ✅ Correct
- Uses `old_status` and `new_status` (not legacy `status`)
- Does NOT insert into legacy `status` column — this means `status` gets no value
- BUT `status` is NOT NULL with no default → **This INSERT will FAIL**

**🔴 CRITICAL BUG FOUND**: `StatusHistoryQueries.create()` does NOT provide a value for the `status` column which is `VARCHAR NOT NULL` with no default. The INSERT will fail with: `null value in column "status" violates not-null constraint`.

The INSERT lists: `id, application_id, old_status, new_status, changed_by, notes, created_at`
Missing: `status` (NOT NULL, no default)

**`findByApplicationId()`**: SELECT `h.old_status, h.new_status AS status` — ✅ Aliases new_status as status for backward compatibility

**Parameter placeholders**: All correct. ✅

---

## 8. CatalogQueries → programs, intakes, subjects

**Status**: ⚠️ HIGH — `getPrograms()` omits `institution_id`

### Issues Found:

**ISSUE 8.1 — HIGH: `getPrograms()` and `getActivePrograms()` and `getProgramById()` all omit `institution_id`**
- Live schema has `institution_id` (uuid, nullable) in programs table
- ProgramRecord interface includes `institution_id: string | null` ✅
- But all three SELECT queries list columns explicitly and omit `institution_id`
- Comment says "Programs table doesn't have institution_id" — THIS IS WRONG, it does exist
- Frontend/admin code expecting `institution_id` from these queries will get `undefined`

**ISSUE 8.2 — LOW: Intakes queries use `SELECT *`**
- `getIntakes()`, `getActiveIntakes()`, `getIntakeById()` all use `SELECT *`
- This actually works correctly since it returns all columns including any the interface doesn't model

**ISSUE 8.3 — LOW: Subjects queries use `SELECT *`**
- Same as intakes — works correctly

**Parameter placeholders**: All correct. ✅

---

## 9. NotificationQueries → user_notification_preferences, push_subscriptions

**Status**: 🔴 CRITICAL — 4 methods reference non-existent `push_subscriptions` table

### Issues Found:

**ISSUE 9.1 — CRITICAL: `getPushSubscription()` queries `push_subscriptions` table — DOES NOT EXIST**
- Will throw runtime error: `relation "push_subscriptions" does not exist`

**ISSUE 9.2 — CRITICAL: `createPushSubscription()` inserts into `push_subscriptions` — DOES NOT EXIST**

**ISSUE 9.3 — CRITICAL: `deletePushSubscription()` deletes from `push_subscriptions` — DOES NOT EXIST**

**ISSUE 9.4 — CRITICAL: `getUsersWithPushEnabled()` joins `push_subscriptions` — DOES NOT EXIST**

**ISSUE 9.5 — OK: `getPreferences()` queries `user_notification_preferences` — ✅ EXISTS**
- Uses `SELECT *` — returns all 14 columns

**ISSUE 9.6 — MEDIUM: `upsertPreferences()` only inserts 5 columns**
- INSERT: id, user_id, email_enabled, push_enabled, sms_enabled, created_at, updated_at
- Missing from UPSERT: application_updates, payment_reminders, interview_reminders, marketing_emails, quiet_hours_start, quiet_hours_end, timezone
- These get DB defaults on INSERT (true/true/true/false/null/null/'Africa/Lusaka')
- ON CONFLICT only updates email_enabled, push_enabled, sms_enabled — other preferences are never updated by this method
- Not a crash bug, but means the UPSERT can't update all preference fields

**Parameter placeholders**: All correct. ✅

---

## 10. PaymentQueries → applications (payment columns)

**Status**: ✅ CLEAN

| Method | Valid? | Notes |
|--------|--------|-------|
| getApplicationForReceipt | ✅ | SELECT a.* + JOIN profiles for name/email/phone — all valid |
| getPaymentHistory | ✅ | SELECT id, application_number, amount, payment_method, payment_status, paid_at, payment_verified_at — all exist in applications |
| updatePayment | ✅ | UPDATE payment_method, amount, payer_name, payer_phone, momo_ref, pop_url, paid_at, payment_status, updated_at — all exist |

**Parameter placeholders**: All correct. ✅

---

## Summary

| Query Builder | Target Table(s) | Status | Critical | High | Medium | Low |
|--------------|-----------------|--------|----------|------|--------|-----|
| UserQueries | profiles | ✅ CLEAN | 0 | 0 | 0 | 0 |
| SessionQueries | device_sessions | ✅ CLEAN | 0 | 0 | 0 | 0 |
| AuditQueries | audit_logs | ⚠️ | 0 | 1 | 2 | 2 |
| ApplicationQueries | applications | 🔴 | 1 | 0 | 1 | 2 |
| DocumentQueries | application_documents | ✅ CLEAN | 0 | 0 | 0 | 0 |
| GradeQueries | application_grades | ✅ CLEAN | 0 | 0 | 0 | 0 |
| StatusHistoryQueries | application_status_history | 🔴 | 1 | 0 | 0 | 0 |
| CatalogQueries | programs, intakes, subjects | ⚠️ | 0 | 1 | 0 | 2 |
| NotificationQueries | user_notification_preferences, push_subscriptions | 🔴 | 4 | 0 | 1 | 0 |
| PaymentQueries | applications | ✅ CLEAN | 0 | 0 | 0 | 0 |

**Totals**: 6 CRITICAL, 2 HIGH, 4 MEDIUM, 6 LOW

### Critical Bugs (must fix):
1. **ApplicationQueries.update()** — Missing `$` prefix: `${paramIndex}` → `$${paramIndex}`
2. **StatusHistoryQueries.create()** — Missing `status` column (NOT NULL, no default) in INSERT
3. **NotificationQueries** — 4 methods reference non-existent `push_subscriptions` table

### High Bugs (should fix):
1. **AuditQueries** — All INSERT methods omit `retention_category` (defaults to 'standard' for all)
2. **CatalogQueries** — All program SELECT queries omit `institution_id` despite it existing in schema
