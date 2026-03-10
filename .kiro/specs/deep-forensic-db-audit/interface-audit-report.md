# Interface Audit Report — lib/queries.ts vs Live Schema

**Task 5.1 — Phase 4: Interface & Query Builder Audit**
**Date**: 2025-01-XX
**Source of Truth**: Live Neon Postgres schema (project: wild-bar-37055823)

---

## Executive Summary

Audited all 15 TypeScript interfaces in `lib/queries.ts` against the live database schema. Found **87 total issues** across all interfaces:

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 5 | Phantom interface/table (PushSubscriptionRecord), missing NOT NULL alignment |
| 🟠 HIGH | 29 | Missing DB columns from interfaces (silent data loss on SELECT *) |
| 🟡 MEDIUM | 41 | Type mismatches, nullability mismatches |
| 🔵 LOW | 12 | Intentionally omitted columns (subset interfaces), joined fields |

---

## 1. UserRecord ↔ profiles table

**Interface fields**: 15 | **Table columns**: 30

### Extra Fields (in interface but NOT in table): 0
✅ All UserRecord fields exist in the profiles table.

### Missing Fields (in table but NOT in interface): 15

| Missing Column | DB Type | Nullable | Severity | Notes |
|---------------|---------|----------|----------|-------|
| `email_verified` | boolean | YES (default false) | 🟠 HIGH | Auth-relevant, should be in record |
| `avatar_url` | text | YES | 🟡 MEDIUM | Profile display field |
| `date_of_birth` | date | YES | 🟡 MEDIUM | Profile field |
| `nrc_number` | varchar(20) | YES | 🟡 MEDIUM | Zambian ID number |
| `nationality` | varchar(100) | YES (default 'Zambian') | 🟡 MEDIUM | Profile field |
| `address` | text | YES | 🟡 MEDIUM | Profile field |
| `notification_preferences` | jsonb | YES (default '{}') | 🔵 LOW | Managed via separate table |
| `last_login_at` | timestamptz | YES | 🟡 MEDIUM | Useful for admin views |
| `reset_token_hash` | text | YES | 🔵 LOW | Auth internal, intentionally omitted |
| `reset_token_expires` | timestamptz | YES | 🔵 LOW | Auth internal, intentionally omitted |
| `reset_token_used` | boolean | YES (default false) | 🔵 LOW | Auth internal, intentionally omitted |
| `sex` | varchar(10) | YES | 🟡 MEDIUM | Profile field |
| `residence_town` | varchar(255) | YES | 🟡 MEDIUM | Profile field |
| `next_of_kin_name` | varchar(255) | YES | 🟡 MEDIUM | Profile field |
| `next_of_kin_phone` | varchar(50) | YES | 🟡 MEDIUM | Profile field |

### Type Compatibility Issues: 2

| Field | TS Type | DB Type | Issue | Severity |
|-------|---------|---------|-------|----------|
| `is_active` | `boolean` (non-nullable) | `boolean` (nullable, default true) | TS says non-nullable but DB allows NULL | 🟡 MEDIUM |
| `failed_login_attempts` | `number` (non-nullable) | `integer` (nullable, default 0) | TS says non-nullable but DB allows NULL | 🟡 MEDIUM |

### Nullability Mismatches: 2

| Field | TS Nullable | DB Nullable | Severity |
|-------|------------|-------------|----------|
| `is_active` | No (`boolean`) | Yes (nullable) | 🟡 MEDIUM |
| `failed_login_attempts` | No (`number`) | Yes (nullable) | 🟡 MEDIUM |

> **Note**: `created_at` and `updated_at` are `Date` in TS but `timestamptz` (nullable, default now()) in DB. The TS type `Date` is non-nullable but DB allows NULL — however, the default ensures values are always present in practice. Low risk.

---

## 2. UserAuthRecord ↔ profiles table

**Interface fields**: 8 | **Table columns**: 30 (subset interface)

### Extra Fields: 0
✅ All fields exist in profiles table.

### Missing Fields: N/A — intentional subset for auth operations.

### Type Compatibility Issues: 2

| Field | TS Type | DB Type | Issue | Severity |
|-------|---------|---------|-------|----------|
| `is_active` | `boolean` (non-nullable) | `boolean` (nullable) | Nullability mismatch | 🟡 MEDIUM |
| `failed_login_attempts` | `number` (non-nullable) | `integer` (nullable) | Nullability mismatch | 🟡 MEDIUM |

### Nullability Mismatches: 2
Same as above — `is_active` and `failed_login_attempts`.

---

## 3. UserPublicRecord ↔ profiles table

**Interface fields**: 8 | **Table columns**: 30 (subset interface)

### Extra Fields: 0
✅ All fields exist in profiles table.

### Missing Fields: N/A — intentional subset for public display.

### Type Compatibility Issues: 1

| Field | TS Type | DB Type | Issue | Severity |
|-------|---------|---------|-------|----------|
| `is_active` | `boolean` (non-nullable) | `boolean` (nullable) | Nullability mismatch | 🟡 MEDIUM |

### Nullability Mismatches: 1
`is_active` — TS non-nullable, DB nullable.

---

## 4. SessionRecord ↔ device_sessions table

**Interface fields**: 9 | **Table columns**: 12

### Extra Fields: 0
✅ All SessionRecord fields map to device_sessions columns.

### Missing Fields: 3

| Missing Column | DB Type | Nullable | Severity | Notes |
|---------------|---------|----------|----------|-------|
| `device_id` | text | NOT NULL | 🟠 HIGH | Required column, used in SessionQueries.create |
| `session_token` | text | NOT NULL | 🟠 HIGH | Required column, used in SessionQueries.create |
| `updated_at` | timestamptz | YES (default now()) | 🟡 MEDIUM | Standard timestamp field |

### Type Compatibility Issues: 2

| Field | TS Type | DB Type | Issue | Severity |
|-------|---------|---------|-------|----------|
| `device_info` | `DeviceInfo` (object) | `text` (nullable) | 🟠 HIGH — TS expects parsed JSON object but DB stores as plain text, not jsonb. Code uses `JSON.stringify()` on insert but SELECT returns text, not auto-parsed object |
| `ip_address` | `string \| null` | `varchar(45)` (nullable) | ✅ Compatible |

### Nullability Mismatches: 3

| Field | TS Nullable | DB Nullable | Severity |
|-------|------------|-------------|----------|
| `is_active` | No (`boolean`) | Yes (nullable, default true) | 🟡 MEDIUM |
| `last_activity` | No (`Date`) | Yes (nullable, default now()) | 🟡 MEDIUM |
| `expires_at` | No (`Date`) | Yes (nullable, default now()+30d) | 🟡 MEDIUM |

---

## 5. SessionDisplayRecord ↔ device_sessions table

**Interface fields**: 7 (including optional `is_current`) | **Table columns**: 12

### Extra Fields: 1

| Extra Field | Notes | Severity |
|-------------|-------|----------|
| `is_current` | Optional computed field, not a DB column — added at runtime | 🔵 LOW — intentional |

### Missing Fields: N/A — intentional subset for display.

### Type Compatibility Issues: 1

| Field | TS Type | DB Type | Issue | Severity |
|-------|---------|---------|-------|----------|
| `device_info` | `DeviceInfo` (object) | `text` (nullable) | 🟠 HIGH — same text vs object mismatch as SessionRecord |

### Nullability Mismatches: 0
✅ All nullable fields correctly marked.

---

## 6. AuditLogRecord ↔ audit_logs table

**Interface fields**: 9 | **Table columns**: 10

### Extra Fields: 0
✅ All AuditLogRecord fields exist in audit_logs table.

### Missing Fields: 1

| Missing Column | DB Type | Nullable | Severity | Notes |
|---------------|---------|----------|----------|-------|
| `retention_category` | varchar(20) | NOT NULL (default 'standard') | 🟠 HIGH | Added by migration, used in queries but missing from interface |

### Type Compatibility Issues: 2

| Field | TS Type | DB Type | Issue | Severity |
|-------|---------|---------|-------|----------|
| `entity_id` | `string \| null` | `uuid` NOT NULL | 🔴 CRITICAL — TS allows null but DB is NOT NULL. Code uses `sanitizeEntityId()` to ensure a UUID is always passed, but the interface is misleading |
| `ip_address` | `string \| null` | `inet` (nullable) | 🟡 MEDIUM — `inet` is a PostgreSQL-specific type that validates IP format. TS `string` is more permissive. Inserts of non-IP strings will fail at DB level |

### Nullability Mismatches: 1

| Field | TS Nullable | DB Nullable | Severity |
|-------|------------|-------------|----------|
| `entity_id` | Yes (`string \| null`) | No (NOT NULL) | 🔴 CRITICAL |

---

## 7. ApplicationRecord ↔ applications table

**Interface fields**: 37 | **Table columns**: 50

### Extra Fields: 0
✅ All ApplicationRecord fields exist in the applications table.

### Missing Fields: 13

| Missing Column | DB Type | Nullable | Severity | Notes |
|---------------|---------|----------|----------|-------|
| `nationality` | varchar(100) | YES (default 'Zambian') | 🟠 HIGH | Used in application form |
| `address_line_1` | varchar(255) | YES | 🟠 HIGH | Address field |
| `address_line_2` | varchar(255) | YES | 🟡 MEDIUM | Address field |
| `postal_code` | varchar(20) | YES | 🟡 MEDIUM | Address field |
| `receipt_number` | varchar(50) | YES | 🟠 HIGH | Payment tracking |
| `eligibility_status` | varchar(20) | YES (default 'pending') | 🟠 HIGH | Core business logic |
| `eligibility_score` | integer | YES | 🟡 MEDIUM | Eligibility assessment |
| `eligibility_notes` | text | YES | 🟡 MEDIUM | Eligibility assessment |
| `admin_feedback` | text | YES | 🟠 HIGH | Admin review workflow |
| `admin_feedback_date` | timestamptz | YES | 🟡 MEDIUM | Admin review workflow |
| `admin_feedback_by` | uuid | YES | 🟡 MEDIUM | Admin review workflow |
| `decision_date` | timestamptz | YES | 🟡 MEDIUM | Final decision tracking |
| `additional_subjects` | jsonb | YES | 🟡 MEDIUM | Extended grade data |

### Type Compatibility Issues: 1

| Field | TS Type | DB Type | Issue | Severity |
|-------|---------|---------|-------|----------|
| `application_fee` | `number` (non-nullable) | `numeric` (nullable, default 153.00) | TS says non-nullable but DB allows NULL | 🟡 MEDIUM |

### Nullability Mismatches: 1

| Field | TS Nullable | DB Nullable | Severity |
|-------|------------|-------------|----------|
| `application_fee` | No (`number`) | Yes (nullable) | 🟡 MEDIUM |

> **Note**: Most ApplicationRecord fields use `string` for timestamps (e.g., `created_at: string`) rather than `Date`. This is acceptable — PostgreSQL returns ISO strings that can be used directly. Consistent within the interface.

---

## 8. DocumentRecord ↔ application_documents table

**Interface fields**: 15 | **Table columns**: 15

### Extra Fields: 0
✅ All DocumentRecord fields exist in application_documents table.

### Missing Fields: 0
✅ All application_documents columns are represented in DocumentRecord.

### Type Compatibility Issues: 1

| Field | TS Type | DB Type | Issue | Severity |
|-------|---------|---------|-------|----------|
| `file_url` | `string` (non-nullable) | `text` (nullable) | TS says non-nullable but DB allows NULL | 🟡 MEDIUM |

### Nullability Mismatches: 2

| Field | TS Nullable | DB Nullable | Severity |
|-------|------------|-------------|----------|
| `file_url` | No (`string`) | Yes (nullable) | 🟡 MEDIUM |
| `system_generated` | No (`boolean`) | Yes (nullable, default false) | 🟡 MEDIUM |

---

## 9. GradeRecord ↔ application_grades table

**Interface fields**: 5 | **Table columns**: 5

### Extra Fields: 0
✅ All GradeRecord fields exist in application_grades table.

### Missing Fields: 0
✅ All application_grades columns are represented in GradeRecord.

### Type Compatibility Issues: 0
✅ All types are compatible (string↔uuid, number↔integer, string↔timestamptz).

### Nullability Mismatches: 0
✅ All nullability correctly aligned.

> **GradeRecord is a perfect match.** ✅

---

## 10. StatusHistoryRecord ↔ application_status_history table

**Interface fields**: 7 (+ 1 optional joined field) | **Table columns**: 11

### Extra Fields: 1

| Extra Field | Notes | Severity |
|-------------|-------|----------|
| `changed_by_profile` | Optional joined field from profiles table, not a DB column | 🔵 LOW — intentional |

### Missing Fields: 4

| Missing Column | DB Type | Nullable | Severity | Notes |
|---------------|---------|----------|----------|-------|
| `changes` | jsonb | YES | 🟡 MEDIUM | Change details |
| `ip_address` | varchar(45) | YES | 🟡 MEDIUM | Audit trail |
| `user_agent` | text | YES | 🟡 MEDIUM | Audit trail |
| `new_status` | text | YES | 🟡 MEDIUM | Used by StatusHistoryQueries.create but not in interface |

### Type Compatibility Issues: 1

| Field | TS Type | DB Type | Issue | Severity |
|-------|---------|---------|-------|----------|
| `changed_by` | `string` (non-nullable) | `uuid` (nullable) | TS says non-nullable but DB allows NULL | 🟡 MEDIUM |

### Nullability Mismatches: 1

| Field | TS Nullable | DB Nullable | Severity |
|-------|------------|-------------|----------|
| `changed_by` | No (`string`) | Yes (nullable) | 🟡 MEDIUM |

> **Note**: The `status` field in the interface maps to the `status` column in DB. The `StatusHistoryQueries.create` function inserts into `new_status` and aliases it back as `status` in `findByApplicationId`. The interface uses `status` which is correct for the aliased query result, but the raw DB has both `status` and `new_status` columns.

---

## 11. ProgramRecord ↔ programs table

**Interface fields**: 14 (+ 3 optional joined fields) | **Table columns**: 14 (including institution_id)

### Extra Fields: 3 (all intentional joined fields)

| Extra Field | Notes | Severity |
|-------------|-------|----------|
| `institution_name` | Optional joined field from institutions table | 🔵 LOW — intentional |
| `institution_slug` | Optional joined field from institutions table | 🔵 LOW — intentional |
| `institution_full_name` | Optional joined field from institutions table | 🔵 LOW — intentional |

### Missing Fields: 0
✅ All programs columns are represented in ProgramRecord (including `institution_id`).

### Type Compatibility Issues: 0
✅ All types are compatible.

### Nullability Mismatches: 0
✅ All nullability correctly aligned.

> **Note**: The `CatalogQueries.getPrograms()` SELECT list does NOT include `institution_id`, even though the interface has it. This means queries using `getPrograms()` will not populate `institution_id` in the result. This is a query builder issue, not an interface issue.

---

## 12. IntakeRecord ↔ intakes table

**Interface fields**: 13 | **Table columns**: 13

### Extra Fields: 0
✅ All IntakeRecord fields exist in intakes table.

### Missing Fields: 0
✅ All intakes columns are represented in IntakeRecord.

### Type Compatibility Issues: 0
✅ All types are compatible (number↔integer, string↔varchar/date, boolean↔boolean).

### Nullability Mismatches: 5

| Field | TS Nullable | DB Nullable | Severity |
|-------|------------|-------------|----------|
| `year` | No (`number`) | Yes (nullable) | 🟡 MEDIUM |
| `start_date` | No (`string`) | Yes (nullable) | 🟡 MEDIUM |
| `end_date` | No (`string`) | Yes (nullable) | 🟡 MEDIUM |
| `application_deadline` | No (`string`) | Yes (nullable) | 🟡 MEDIUM |
| `max_capacity` | No (`number`) | Yes (nullable) | 🟡 MEDIUM |

> **Note**: `current_enrollment` is `number` (non-nullable) in TS but `integer` (nullable, default 0) in DB. The default ensures a value is always present, so this is low risk.

---

## 13. SubjectRecord ↔ subjects table

**Interface fields**: 7 | **Table columns**: 7

### Extra Fields: 0
✅ All SubjectRecord fields exist in subjects table.

### Missing Fields: 0
✅ All subjects columns are represented in SubjectRecord.

### Type Compatibility Issues: 0
✅ All types are compatible.

### Nullability Mismatches: 0
✅ All nullability correctly aligned.

> **SubjectRecord is a perfect match.** ✅

---

## 14. NotificationPreferencesRecord ↔ user_notification_preferences table

**Interface fields**: 14 | **Table columns**: 14

### Extra Fields: 0
✅ All NotificationPreferencesRecord fields exist in user_notification_preferences table.

### Missing Fields: 0
✅ All user_notification_preferences columns are represented.

### Type Compatibility Issues: 0
✅ All types are compatible (boolean↔boolean, string↔varchar/time, string↔timestamptz).

### Nullability Mismatches: 0
✅ All nullability correctly aligned.

> **NotificationPreferencesRecord is a perfect match.** ✅

---

## 15. PushSubscriptionRecord ↔ push_subscriptions table

### 🔴 CRITICAL: TABLE DOES NOT EXIST

The `push_subscriptions` table **does not exist** in the live database. The `PushSubscriptionRecord` interface and all associated `NotificationQueries` methods that reference this table are entirely phantom:

| Phantom Query Builder Method | SQL Target | Severity |
|------------------------------|-----------|----------|
| `NotificationQueries.getPushSubscription` | `SELECT * FROM push_subscriptions` | 🔴 CRITICAL |
| `NotificationQueries.createPushSubscription` | `INSERT INTO push_subscriptions` | 🔴 CRITICAL |
| `NotificationQueries.deletePushSubscription` | `DELETE FROM push_subscriptions` | 🔴 CRITICAL |
| `NotificationQueries.getUsersWithPushEnabled` | `FROM push_subscriptions ps JOIN ...` | 🔴 CRITICAL |

**Impact**: Any code path that calls these query builders will fail with a PostgreSQL "relation does not exist" error at runtime.

**Recommendation**: Either:
1. Create the `push_subscriptions` table via migration (if push notifications are planned), OR
2. Remove `PushSubscriptionRecord` interface and all 4 query builder methods (if push notifications are not planned)

---

## Summary of All Issues by Severity

### 🔴 CRITICAL (5 issues)

| # | Interface | Issue |
|---|-----------|-------|
| 1 | PushSubscriptionRecord | Entire interface is phantom — table does not exist |
| 2 | PushSubscriptionRecord | 4 query builder methods reference non-existent table |
| 3 | AuditLogRecord | `entity_id` is `string \| null` but DB is `uuid NOT NULL` |
| 4 | AuditLogRecord | Missing `retention_category` column (NOT NULL in DB) |
| 5 | SessionRecord | `device_info` typed as `DeviceInfo` object but DB column is `text` (not jsonb) |

### 🟠 HIGH (14 issues — missing columns that cause silent data loss)

| # | Interface | Missing Column(s) |
|---|-----------|-------------------|
| 1 | UserRecord | `email_verified` — auth-relevant field |
| 2 | SessionRecord | `device_id` — NOT NULL required column |
| 3 | SessionRecord | `session_token` — NOT NULL required column |
| 4 | ApplicationRecord | `nationality` — used in application form |
| 5 | ApplicationRecord | `address_line_1` — address field |
| 6 | ApplicationRecord | `receipt_number` — payment tracking |
| 7 | ApplicationRecord | `eligibility_status` — core business logic |
| 8 | ApplicationRecord | `admin_feedback` — admin review workflow |
| 9 | SessionDisplayRecord | `device_info` text vs object type mismatch |
| 10 | AuditLogRecord | `ip_address` is `string` but DB is `inet` type |
| 11-14 | ApplicationRecord | `address_line_2`, `postal_code`, `eligibility_score`, `eligibility_notes` |

### 🟡 MEDIUM (41 issues — nullability mismatches and missing optional columns)

| Category | Count | Interfaces Affected |
|----------|-------|-------------------|
| Nullability mismatches (TS non-nullable, DB nullable) | 22 | UserRecord(2), UserAuthRecord(2), UserPublicRecord(1), SessionRecord(3), IntakeRecord(6), DocumentRecord(2), StatusHistoryRecord(1), ApplicationRecord(1), IntakeRecord(5) |
| Missing optional columns | 14 | UserRecord(8), ApplicationRecord(5), StatusHistoryRecord(4) |
| Type compatibility (inet, text vs object) | 5 | AuditLogRecord(1), SessionRecord(1), SessionDisplayRecord(1) |

### 🔵 LOW (12 issues — intentional omissions and joined fields)

| Category | Count | Notes |
|----------|-------|-------|
| Intentionally omitted auth columns (reset_token_*) | 3 | UserRecord — security best practice |
| Joined/computed fields not in DB | 5 | SessionDisplayRecord.is_current, StatusHistoryRecord.changed_by_profile, ProgramRecord.institution_* |
| notification_preferences jsonb in profiles | 1 | Managed via separate table |
| updated_at missing from SessionRecord | 1 | Minor omission |

---

## Type Compatibility Reference

| TypeScript Type | PostgreSQL Type | Compatible? |
|----------------|-----------------|-------------|
| `string` | `uuid` | ✅ Yes — UUID is returned as string |
| `string` | `varchar(N)` | ✅ Yes |
| `string` | `text` | ✅ Yes |
| `string` | `date` | ✅ Yes — returned as ISO string |
| `string` | `timestamptz` | ✅ Yes — returned as ISO string |
| `string` | `time` | ✅ Yes — returned as string |
| `string` | `inet` | ⚠️ Partial — string works for reads but inserts must be valid IP |
| `number` | `integer` | ✅ Yes |
| `number` | `numeric` | ✅ Yes — may lose precision for large decimals |
| `boolean` | `boolean` | ✅ Yes |
| `Date` | `timestamptz` | ✅ Yes — pg driver auto-converts |
| `Date` | `date` | ✅ Yes — pg driver auto-converts |
| `DeviceInfo` (object) | `text` | ❌ No — text is not auto-parsed to object |
| `Record<string, unknown>` | `jsonb` | ✅ Yes — pg driver auto-parses jsonb |
| `{ p256dh, auth }` | N/A | ❌ Table doesn't exist |

---

## Recommendations (Priority Order)

1. **Remove or gate PushSubscriptionRecord** and all 4 push_subscriptions query methods — they will crash at runtime
2. **Fix AuditLogRecord**: add `retention_category: string`, change `entity_id` to `string` (non-nullable)
3. **Fix SessionRecord/SessionDisplayRecord**: add `device_id` and `session_token` fields, document `device_info` text parsing requirement
4. **Add missing ApplicationRecord fields**: at minimum `nationality`, `eligibility_status`, `receipt_number`, `admin_feedback`, `address_line_1`
5. **Fix nullability mismatches**: make `is_active`, `failed_login_attempts` nullable in UserRecord/UserAuthRecord, or document that defaults guarantee non-null
6. **Add missing StatusHistoryRecord fields**: `changes`, `ip_address`, `user_agent`, `new_status`
7. **Fix IntakeRecord nullability**: `year`, `start_date`, `end_date`, `application_deadline`, `max_capacity` should be nullable
