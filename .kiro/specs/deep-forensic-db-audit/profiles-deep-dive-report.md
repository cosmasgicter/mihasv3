# profiles Table Deep-Dive Report — Task 7.4

## Live Schema (30 columns)

| # | Column | Type | Nullable | Default | Referenced in Code? |
|---|--------|------|----------|---------|-------------------|
| 1 | id | uuid | NO | gen_random_uuid() | ✅ |
| 2 | email | varchar | NO | | ✅ |
| 3 | role | varchar | YES | 'student' | ✅ |
| 4 | first_name | varchar | YES | | ✅ |
| 5 | last_name | varchar | YES | | ✅ |
| 6 | phone | varchar | YES | | ✅ |
| 7 | is_active | boolean | YES | true | ✅ |
| 8 | password_hash | text | YES | | ✅ |
| 9 | refresh_token_hash | text | YES | | ✅ |
| 10 | failed_login_attempts | integer | YES | 0 | ✅ |
| 11 | locked_until | timestamptz | YES | | ✅ |
| 12 | password_changed_at | timestamptz | YES | | ✅ |
| 13 | email_verified | boolean | YES | false | ✅ (admin.ts INSERT) |
| 14 | avatar_url | text | YES | | ✅ (auth.ts profile GET/PATCH) |
| 15 | date_of_birth | date | YES | | ✅ (auth.ts profile) |
| 16 | nrc_number | varchar | YES | | ✅ (auth.ts profile) |
| 17 | nationality | varchar | YES | 'Zambian' | ✅ (auth.ts profile) |
| 18 | address | text | YES | | ✅ (auth.ts profile) |
| 19 | notification_preferences | jsonb | YES | '{}' | ❌ DEAD |
| 20 | last_login_at | timestamptz | YES | | ❌ DEAD |
| 21 | created_at | timestamptz | YES | now() | ✅ |
| 22 | updated_at | timestamptz | YES | now() | ✅ |
| 23 | reset_token_hash | text | YES | | ❌ DEAD (legacy) |
| 24 | reset_token_expires | timestamptz | YES | | ❌ DEAD (legacy) |
| 25 | reset_token_used | boolean | YES | false | ❌ DEAD (legacy) |
| 26 | sex | varchar | YES | | ✅ (auth.ts profile) |
| 27 | residence_town | varchar | YES | | ✅ (auth.ts profile) |
| 28 | next_of_kin_name | varchar | YES | | ✅ (auth.ts profile) |
| 29 | next_of_kin_phone | varchar | YES | | ✅ (auth.ts profile) |
| 30 | full_name | varchar | YES | | ✅ (auth.ts, admin.ts) |

## Verification Results

### `country` column — ✅ CONFIRMED ABSENT
- No `country` column in live schema
- No code references to `profiles.country`
- Round 1 cleanup was successful

### `nationality` column — ✅ EXISTS
- varchar, nullable, default 'Zambian'
- Referenced in auth.ts profile GET/PATCH
- Added by `add_version_and_nationality.sql`

### handleRegister column list (api-src/auth.ts)
- INSERT uses: email, password_hash, first_name, last_name, full_name, phone, role, email_verified, created_at, updated_at
- All 10 columns exist ✅

### handleProfile column list (api-src/auth.ts)
- SELECT uses: id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone
- All 16 columns exist ✅
- PATCH allowedFields: full_name, first_name, last_name, phone, date_of_birth, sex, residence_town, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone
- All 13 fields exist ✅

### UserQueries.create column list (lib/queries.ts)
- INSERT uses: id, email, password_hash, role, first_name, last_name, is_active, failed_login_attempts, created_at, updated_at
- All 10 columns exist ✅
- Missing from create: full_name, email_verified — these get DB defaults (null, false)

## Dead Columns (5 total)

| Column | Reason Dead | Recommendation |
|--------|-------------|----------------|
| notification_preferences (jsonb) | Replaced by `user_notification_preferences` table | DROP |
| last_login_at | Never referenced in any code | DROP |
| reset_token_hash | Replaced by `password_reset_tokens` table | DROP |
| reset_token_expires | Replaced by `password_reset_tokens` table | DROP |
| reset_token_used | Replaced by `password_reset_tokens` table | DROP |

## UserRecord Interface vs Live Schema

UserRecord has 15 fields. Live schema has 30 columns. Missing from interface:
- email_verified, avatar_url, date_of_birth, nrc_number, nationality, address, notification_preferences, last_login_at, reset_token_hash, reset_token_expires, reset_token_used, sex, residence_town, next_of_kin_name, next_of_kin_phone, full_name

This is by design — UserRecord is for auth operations. Profile data is handled via inline SQL in auth.ts.

## Summary

| Finding | Severity | Details |
|---------|----------|---------|
| country column absent | ✅ CONFIRMED | Round 1 cleanup successful |
| nationality column exists | ✅ CONFIRMED | varchar, default 'Zambian' |
| handleRegister columns | ✅ CORRECT | All 10 exist |
| handleProfile columns | ✅ CORRECT | All 16 SELECT + 13 PATCH exist |
| UserQueries.create columns | ✅ CORRECT | All 10 exist |
| 5 dead columns | LOW | notification_preferences, last_login_at, reset_token_hash/expires/used |
