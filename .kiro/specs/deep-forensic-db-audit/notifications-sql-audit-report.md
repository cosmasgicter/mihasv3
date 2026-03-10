# Notifications SQL Audit Report — Task 4.4

**File audited**: `api-src/notifications.ts`
**Date**: Verified against live Neon schema (project: `wild-bar-37055823`)

## Live Schema Reference (Verified via Neon MCP)

### notifications (13 columns)
`id`, `user_id`, `title`, `message`, `type`, `priority`, `action_url`, `metadata`, `is_read`, `read_at`, `created_at`, `updated_at`, `idempotency_key`
- NO `channel` column

### user_notification_preferences (14 columns)
`id`, `user_id`, `email_enabled`, `push_enabled`, `sms_enabled`, `application_updates`, `payment_reminders`, `interview_reminders`, `marketing_emails`, `quiet_hours_start`, `quiet_hours_end`, `timezone`, `created_at`, `updated_at`
- NO `whatsapp_enabled`, `in_app_enabled`

### email_queue (15 columns)
`id`, `recipient_email`, `recipient_name`, `subject`, `body`, `html_body`, `template_name`, `template_data`, `status`, `priority`, `retry_count`, `max_retries`, `error_message`, `sent_at`, `created_at`

### profiles (referenced columns verified)
`id`, `email`, `first_name`, `last_name`, `phone`, ... (30 columns total)

### applications (referenced columns verified)
`id`, `user_id`, `application_number`, ... (40+ columns total)

### audit_logs (referenced columns verified)
`actor_id`, `action`, `entity_type`, `entity_id`, ... (confirmed present)

---

## SQL Statement Audit

### Statement 1 — handlePreferences POST: UPSERT into user_notification_preferences
**Line**: ~119-140
**Operation**: INSERT ... ON CONFLICT DO UPDATE (UPSERT)
**Table**: `user_notification_preferences`
**Columns referenced**:
- INSERT: `user_id`, `email_enabled`, `push_enabled`, `sms_enabled`, `application_updates`, `payment_reminders`, `interview_reminders`, `marketing_emails`, `quiet_hours_start`, `quiet_hours_end`, `updated_at`, `created_at`
- ON CONFLICT UPDATE: `email_enabled`, `push_enabled`, `sms_enabled`, `application_updates`, `payment_reminders`, `interview_reminders`, `marketing_emails`, `quiet_hours_start`, `quiet_hours_end`, `updated_at`

**Status**: ✅ ALL COLUMNS VALID
- All 12 INSERT columns exist in live schema ✅
- All 10 UPDATE columns exist in live schema ✅
- `RETURNING *` — table exists ✅
- Parameter count: $1-$8 (8 params, 8 values) ✅
- Note: Does NOT insert `timezone` — this is acceptable (defaults to `'Africa/Lusaka'` via column default)

---

### Statement 2 — handleHistory: SELECT from applications
**Line**: ~168-173
**Operation**: SELECT
**Table**: `applications`
**Columns referenced**: `user_id`, `application_number`, `id` (WHERE)

**Status**: ✅ ALL COLUMNS VALID
- `user_id` exists ✅
- `application_number` exists ✅
- `id` exists (WHERE clause) ✅

---

### Statement 3 — handleHistory: SELECT with JOINs (notifications + audit_logs + profiles)
**Line**: ~185-210
**Operation**: SELECT with LEFT JOINs
**Tables**: `notifications` (aliased `n`), `audit_logs` (aliased `al`), `profiles` (aliased `actor`)

**Columns referenced from notifications**:
- SELECT: `n.id`, `n.title`, `n.message`, `n.type`, `n.is_read`, `n.action_url`, `n.created_at`, `n.read_at`
- WHERE: `n.user_id`, `n.action_url`, `n.message` (ILIKE), `n.title` (ILIKE)

**Columns referenced from audit_logs**:
- JOIN ON: `al.entity_type`, `al.entity_id`, `al.action`
- SELECT: `al.actor_id`

**Columns referenced from profiles**:
- JOIN ON: `actor.id`
- SELECT: `actor.first_name`, `actor.last_name`

**Status**: ✅ ALL COLUMNS VALID
- All 8 SELECT columns from notifications exist ✅
- `n.user_id` exists ✅
- `n.action_url` exists ✅
- `n.message` exists ✅
- `n.title` exists ✅
- `al.entity_type`, `al.entity_id`, `al.action`, `al.actor_id` all exist in audit_logs ✅
- `actor.id`, `actor.first_name`, `actor.last_name` all exist in profiles ✅
- JOIN condition `al.entity_id = n.id::text` — valid (entity_id is uuid, cast to text is safe) ✅
- NO `channel` column referenced ✅

---

### Statement 4 — handleList: SELECT from notifications
**Line**: ~237-243
**Operation**: SELECT
**Table**: `notifications`
**Columns referenced**: `id`, `title`, `message`, `type`, `is_read`, `action_url`, `created_at`, `read_at`, `user_id` (WHERE)

**Status**: ✅ ALL COLUMNS VALID
- All 8 SELECT columns exist ✅
- `user_id` in WHERE exists ✅
- `created_at` in ORDER BY exists ✅
- NO `channel` column referenced ✅

---

### Statement 5 — handleMarkRead: UPDATE notifications
**Line**: ~264
**Operation**: UPDATE
**Table**: `notifications`
**Columns referenced**: SET: `is_read`, `read_at`; WHERE: `id`, `user_id`

**Status**: ✅ ALL COLUMNS VALID
- `is_read` exists ✅
- `read_at` exists ✅
- `id` exists ✅
- `user_id` exists ✅

---

### Statement 6 — handleMarkAllRead: UPDATE notifications
**Line**: ~278
**Operation**: UPDATE
**Table**: `notifications`
**Columns referenced**: SET: `is_read`, `read_at`; WHERE: `user_id`, `is_read`

**Status**: ✅ ALL COLUMNS VALID
- `is_read` exists ✅
- `read_at` exists ✅
- `user_id` exists ✅

---

### Statement 7 — handleDelete: DELETE from notifications
**Line**: ~296
**Operation**: DELETE
**Table**: `notifications`
**Columns referenced**: WHERE: `id`, `user_id`

**Status**: ✅ ALL COLUMNS VALID
- `id` exists ✅
- `user_id` exists ✅

---

### Statement 8 — createNotificationWithDedup: SELECT for dedup check
**Line**: ~336-341
**Operation**: SELECT
**Table**: `notifications`
**Columns referenced**: SELECT: `id`; WHERE: `user_id`, `idempotency_key`, `created_at`

**Status**: ✅ ALL COLUMNS VALID
- `id` exists ✅
- `user_id` exists ✅
- `idempotency_key` exists ✅ (KEY CHECK — confirmed present in live schema)
- `created_at` exists ✅

---

### Statement 9 — createNotificationWithDedup: INSERT into notifications
**Line**: ~352-356
**Operation**: INSERT
**Table**: `notifications`
**Columns referenced**: `id`, `user_id`, `type`, `title`, `message`, `idempotency_key`, `action_url`, `is_read`, `created_at`
**Comment in code**: `// NOTE: notifications table has no 'channel' column — omit it from INSERT`

**Status**: ✅ ALL COLUMNS VALID
- All 9 INSERT columns exist in live schema ✅
- `idempotency_key` correctly included ✅
- `channel` correctly OMITTED ✅ (confirmed no channel column in live schema)
- Parameter count: $1-$6 (6 params, 6 values) — `id` uses `gen_random_uuid()`, `is_read` is literal `false`, `created_at` is `NOW()` ✅
- `RETURNING *` — valid ✅

---

### Statement 10 — handleCheckDuplicate: SELECT for dedup check
**Line**: ~389-394
**Operation**: SELECT
**Table**: `notifications`
**Columns referenced**: SELECT: `id`; WHERE: `user_id`, `idempotency_key`, `created_at`

**Status**: ✅ ALL COLUMNS VALID
- `id` exists ✅
- `user_id` exists ✅
- `idempotency_key` exists ✅
- `created_at` exists ✅

---

### Statement 11 — handleCreate: SELECT for dedup check
**Line**: ~420-425
**Operation**: SELECT
**Table**: `notifications`
**Columns referenced**: SELECT: `id`; WHERE: `user_id`, `idempotency_key`, `created_at`

**Status**: ✅ ALL COLUMNS VALID (same pattern as Statements 8 and 10)

---

### Statement 12 — handleCreate: INSERT into notifications
**Line**: ~431-434
**Operation**: INSERT
**Table**: `notifications`
**Columns referenced**: `user_id`, `title`, `message`, `type`, `action_url`, `is_read`, `created_at`, `idempotency_key`

**Status**: ✅ ALL COLUMNS VALID
- All 8 INSERT columns exist in live schema ✅
- `idempotency_key` correctly included ✅
- `channel` correctly OMITTED ✅
- Parameter count: $1-$6 (6 params, 6 values) — `is_read` is literal `false`, `created_at` is `NOW()` ✅
- `RETURNING *` — valid ✅
- Note: Unlike Statement 9, this does NOT explicitly set `id` — relies on column default `gen_random_uuid()` ✅

---

### Statement 13 — handleSend (legacy path): INSERT into notifications
**Line**: ~487-491
**Operation**: INSERT
**Table**: `notifications`
**Columns referenced**: `user_id`, `title`, `message`, `type`, `action_url`, `is_read`, `created_at`

**Status**: ✅ ALL COLUMNS VALID
- All 7 INSERT columns exist in live schema ✅
- `channel` correctly OMITTED ✅
- Parameter count: $1-$5 (5 params, 5 values) — `is_read` is literal `false`, `created_at` is `NOW()` ✅
- `RETURNING *` — valid ✅
- Note: This legacy path does NOT include `idempotency_key` — acceptable for backward-compatible path without entity context

---

### Statement 14 — queueEmailForNotification: SELECT from profiles
**Line**: ~519-521
**Operation**: SELECT
**Table**: `profiles`
**Columns referenced**: `email`, `first_name`, `id` (WHERE)

**Status**: ✅ ALL COLUMNS VALID
- `email` exists ✅
- `first_name` exists ✅
- `id` exists ✅

---

### Statement 15 — queueEmailForNotification: INSERT into email_queue
**Line**: ~539-541
**Operation**: INSERT
**Table**: `email_queue`
**Columns referenced**: `recipient_email`, `recipient_name`, `subject`, `body`, `html_body`, `template_name`, `template_data`, `status`, `priority`

**Status**: ✅ ALL COLUMNS VALID
- All 9 INSERT columns exist in live schema ✅
- `status` set to literal `'pending'` ✅
- Parameter count: $1-$8 (8 params, 8 values) — `status` is literal string ✅
- Note: Does not set `retry_count`, `max_retries`, `error_message`, `sent_at`, `created_at` — all have defaults ✅

---

### Statement 16 — getCanonicalPreferences: SELECT with JOIN (profiles + user_notification_preferences)
**Line**: ~554-567
**Operation**: SELECT with LEFT JOIN
**Tables**: `profiles` (aliased `p`), `user_notification_preferences` (aliased `np`)

**Columns referenced from profiles**:
- SELECT: `p.phone`
- WHERE: `p.id`

**Columns referenced from user_notification_preferences**:
- JOIN ON: `np.user_id = p.id`
- SELECT: `np.email_enabled`, `np.push_enabled`, `np.sms_enabled`, `np.application_updates`, `np.payment_reminders`, `np.interview_reminders`, `np.marketing_emails`, `np.quiet_hours_start`, `np.quiet_hours_end`, `np.timezone`, `np.created_at`, `np.updated_at`

**Status**: ✅ ALL COLUMNS VALID
- `p.phone` exists in profiles ✅
- `p.id` exists in profiles ✅
- `np.user_id` exists ✅
- All 12 SELECT columns from user_notification_preferences exist in live schema ✅
- `np.sms_enabled` exists ✅ (confirmed in live schema)
- `np.application_updates` exists ✅
- `np.payment_reminders` exists ✅
- `np.interview_reminders` exists ✅
- `np.marketing_emails` exists ✅
- `np.timezone` exists ✅
- `np.updated_at` exists ✅
- NO `whatsapp_enabled` or `in_app_enabled` referenced in SQL ✅

---

## Specific Checks

### Check 1: idempotency_key column in notifications
**Result**: ✅ CONFIRMED PRESENT
- Column `idempotency_key` (type: `text`, nullable: true) exists in live schema
- Index `idx_notifications_idempotency` exists on this column
- Referenced correctly in 5 SQL statements (Statements 8, 9, 10, 11, 12)
- Used for dedup in `createNotificationWithDedup`, `handleCheckDuplicate`, and `handleCreate`

### Check 2: NO references to `channel` column
**Result**: ✅ CONFIRMED — NO SQL REFERENCES TO `channel`
- The code has an explicit comment on line ~352: `// NOTE: notifications table has no 'channel' column — omit it from INSERT`
- No INSERT, SELECT, UPDATE, or DELETE statement references a `channel` column
- The `handleHistory` function returns `channel: 'in-app'` as a hardcoded string in the response mapping (line ~218) — this is NOT a database column reference, just a response field ✅
- The `createNotificationWithDedup` function accepts a `channel` parameter in its TypeScript signature but does NOT use it in any SQL statement ✅

### Check 3: Notification preferences UPSERT matches live schema
**Result**: ✅ MATCHES
- Statement 1 (UPSERT) references 12 columns, all present in live schema
- Does not reference `whatsapp_enabled`, `in_app_enabled`, or `sms_enabled` in the UPSERT... wait:
  - Actually `sms_enabled` IS referenced in the UPSERT ✅ (and it exists in live schema)
- Does not reference `timezone` in UPSERT — acceptable (column has default `'Africa/Lusaka'`)
- The `getCanonicalPreferences` function (Statement 16) correctly reads `timezone` and `updated_at` ✅

### Check 4: Missing `$` prefix bug pattern
**Result**: ✅ NO INSTANCES FOUND
- All parameter placeholders use correct `$N` syntax ($1, $2, $3, etc.)
- No missing `$` prefix detected in any SQL statement
- Parameter counts match values arrays in all statements

---

## Summary

| # | Line(s) | Operation | Table | Columns | Status |
|---|---------|-----------|-------|---------|--------|
| 1 | ~119-140 | UPSERT | user_notification_preferences | 12 INSERT + 10 UPDATE | ✅ Valid |
| 2 | ~168-173 | SELECT | applications | user_id, application_number, id | ✅ Valid |
| 3 | ~185-210 | SELECT+JOIN | notifications + audit_logs + profiles | 8+4+3 cols | ✅ Valid |
| 4 | ~237-243 | SELECT | notifications | 8 cols + WHERE | ✅ Valid |
| 5 | ~264 | UPDATE | notifications | is_read, read_at + WHERE | ✅ Valid |
| 6 | ~278 | UPDATE | notifications | is_read, read_at + WHERE | ✅ Valid |
| 7 | ~296 | DELETE | notifications | id, user_id | ✅ Valid |
| 8 | ~336-341 | SELECT | notifications | id + WHERE (idempotency_key) | ✅ Valid |
| 9 | ~352-356 | INSERT | notifications | 9 cols (incl. idempotency_key) | ✅ Valid |
| 10 | ~389-394 | SELECT | notifications | id + WHERE (idempotency_key) | ✅ Valid |
| 11 | ~420-425 | SELECT | notifications | id + WHERE (idempotency_key) | ✅ Valid |
| 12 | ~431-434 | INSERT | notifications | 8 cols (incl. idempotency_key) | ✅ Valid |
| 13 | ~487-491 | INSERT | notifications | 7 cols (no idempotency_key) | ✅ Valid |
| 14 | ~519-521 | SELECT | profiles | email, first_name | ✅ Valid |
| 15 | ~539-541 | INSERT | email_queue | 9 cols | ✅ Valid |
| 16 | ~554-567 | SELECT+JOIN | profiles + user_notification_preferences | 1+12 cols | ✅ Valid |

**Total SQL statements**: 16
**Phantom columns found**: 0
**Missing `$` prefix bugs**: 0
**`channel` column references**: 0 (correctly removed in Round 2/3)
**`idempotency_key` usage**: Correct in 5 statements

### Issues Found

**❌ CRITICAL**: None

**⚠️ MEDIUM — Phantom columns in getCanonicalPreferences response object (NOT SQL)**:
The `getCanonicalPreferences` function (line ~570-620) returns hardcoded fields that do NOT exist in any database table:
- `whatsapp_enabled: false` — hardcoded, not from DB (acceptable — backward compat)
- `in_app_enabled: true` — hardcoded, not from DB (acceptable — backward compat)
- `frequency`, `optimalTiming`, `channels`, `sms_opt_in_at`, `sms_opt_out_at`, etc. — all computed/hardcoded

These are NOT SQL issues — they are response-shaping fields for frontend compatibility. No database impact.

**⚠️ LOW — Legacy INSERT path missing idempotency_key**:
Statement 13 (handleSend legacy path, line ~487-491) does not include `idempotency_key` in the INSERT. This is intentional for backward compatibility when no entity context is provided, but means notifications created via this path cannot be deduplicated.

### Conclusion

`api-src/notifications.ts` is **CLEAN** — all 16 SQL statements reference only columns that exist in the live schema. The Round 2/3 cleanup of `channel` was properly applied. The `idempotency_key` column is correctly used for deduplication. No phantom columns, no missing `$` prefix bugs.
