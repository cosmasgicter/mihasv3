# user_notification_preferences Audit Report — Task 5.5

## Live Schema (14 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | |
| email_enabled | boolean | YES | true |
| push_enabled | boolean | YES | true |
| sms_enabled | boolean | YES | false |
| application_updates | boolean | YES | true |
| payment_reminders | boolean | YES | true |
| interview_reminders | boolean | YES | true |
| marketing_emails | boolean | YES | false |
| quiet_hours_start | time | YES | |
| quiet_hours_end | time | YES | |
| timezone | varchar | YES | 'Africa/Lusaka' |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

## Column Existence Check

| Column | Exists? | Notes |
|--------|---------|-------|
| whatsapp_enabled | ❌ NO | Only in backfill script (never applied) |
| in_app_enabled | ❌ NO | Only in backfill script (never applied) |
| sms_enabled | ✅ YES | Default false |
| email_enabled | ✅ YES | Default true |
| push_enabled | ✅ YES | Default true |
| application_updates | ✅ YES | Default true |
| payment_reminders | ✅ YES | Default true |
| interview_reminders | ✅ YES | Default true |
| marketing_emails | ✅ YES | Default false |
| quiet_hours_start | ✅ YES | TIME type |
| quiet_hours_end | ✅ YES | TIME type |
| timezone | ✅ YES | Default 'Africa/Lusaka' |

## NotificationPreferencesRecord Interface Comparison

| Interface Field | DB Column | Match? |
|----------------|-----------|--------|
| id: string | id uuid | ✅ |
| user_id: string | user_id uuid | ✅ |
| email_enabled: boolean | email_enabled boolean | ✅ |
| push_enabled: boolean | push_enabled boolean | ✅ |
| sms_enabled: boolean | sms_enabled boolean | ✅ |
| application_updates: boolean | application_updates boolean | ✅ |
| payment_reminders: boolean | payment_reminders boolean | ✅ |
| interview_reminders: boolean | interview_reminders boolean | ✅ |
| marketing_emails: boolean | marketing_emails boolean | ✅ |
| quiet_hours_start: string \| null | quiet_hours_start time | ✅ (time→string OK) |
| quiet_hours_end: string \| null | quiet_hours_end time | ✅ (time→string OK) |
| timezone: string | timezone varchar | ✅ |
| created_at: string | created_at timestamptz | ✅ |
| updated_at: string | updated_at timestamptz | ✅ |

**Interface is a PERFECT MATCH** — all 14 columns accounted for, types compatible. ✅

## UPSERT Statement Audit

### api-src/notifications.ts UPSERT — ✅ CORRECT
INSERT columns: user_id, email_enabled, push_enabled, sms_enabled, application_updates, payment_reminders, interview_reminders, marketing_emails, quiet_hours_start, quiet_hours_end, updated_at, created_at

- All 12 columns exist ✅
- Missing from INSERT: `id` (has gen_random_uuid() default ✅), `timezone` (has 'Africa/Lusaka' default ✅)
- ON CONFLICT (user_id) — unique constraint exists ✅
- COALESCE pattern preserves existing values on update ✅
- Does NOT update `timezone` — minor gap but not a bug

### lib/queries.ts NotificationQueries.upsertPreferences() — ⚠️ INCOMPLETE
INSERT columns: id, user_id, email_enabled, push_enabled, sms_enabled, created_at, updated_at

- Only updates 3 preference columns (email_enabled, push_enabled, sms_enabled)
- Missing: application_updates, payment_reminders, interview_reminders, marketing_emails, quiet_hours_start, quiet_hours_end, timezone
- ON CONFLICT only updates the same 3 columns
- This query builder is LESS capable than the inline SQL in notifications.ts
- Not a crash bug — DB defaults fill in missing columns on INSERT

### lib/queries.ts NotificationQueries.getPreferences() — ✅ CORRECT
- `SELECT * FROM user_notification_preferences WHERE user_id = $1` — returns all 14 columns

## Dead Columns

None. All 14 columns are referenced by code.

## Dead Code: backfill script

`scripts/backfill-notification-preferences.ts` references `whatsapp_enabled` and `in_app_enabled` columns that don't exist. This script was never applied and is dead code.

## Summary

| Finding | Severity | Details |
|---------|----------|---------|
| Interface match | ✅ PERFECT | All 14 columns, types compatible |
| notifications.ts UPSERT | ✅ CORRECT | 12 columns, proper COALESCE |
| queries.ts upsertPreferences | ⚠️ LOW | Only 3 of 7 preference columns updatable |
| whatsapp_enabled / in_app_enabled | ℹ️ INFO | Don't exist in DB, only in dead backfill script |
| timezone not updatable | LOW | Neither UPSERT updates timezone |

**Overall**: CLEAN — no crash bugs, no phantom columns.
