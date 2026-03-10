# Remaining Tables Audit Report — Task 5.8

## 1. csrf_tokens (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | |
| token_hash | varchar | NO | |
| expires_at | timestamptz | NO | |
| created_at | timestamptz | NO | now() |

**Code references** (lib/csrf.ts): INSERT uses `user_id, token_hash, expires_at, created_at` — all exist ✅
**Status**: ✅ CLEAN — no issues.

---

## 2. password_reset_tokens (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | |
| token_hash | varchar | NO | |
| expires_at | timestamptz | NO | |
| used_at | timestamptz | YES | |
| created_at | timestamptz | NO | now() |

**Note**: Column is `used_at` (timestamptz), NOT `used` (boolean) as some docs suggest.
**Code references** (api-src/auth.ts): Uses `used_at IS NULL` for unused check, `SET used_at = NOW()` for consumption — correct ✅
**Status**: ✅ CLEAN — no issues.

---

## 3. login_attempts (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| email_hash | varchar | NO | |
| ip_hash | varchar | NO | |
| attempted_at | timestamptz | NO | now() |
| success | boolean | NO | false |

**Note**: Column is `attempted_at`, NOT `created_at`.
**Code references** (api-src/auth.ts): INSERT uses `email_hash, ip_hash, success, attempted_at` — all exist ✅
**Status**: ✅ CLEAN — no issues.

---

## 4. idempotency_keys (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| key | text | NO | (PK) |
| endpoint | text | NO | |
| response_json | jsonb | NO | |
| created_at | timestamptz | NO | now() |

**Code references** (api-src/applications.ts): INSERT/SELECT uses `key, endpoint, response_json, created_at` — all exist ✅
**Status**: ✅ CLEAN — no issues.

---

## 5. email_queue (14 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| recipient_email | varchar | NO | |
| recipient_name | varchar | YES | |
| subject | varchar | NO | |
| body | text | NO | |
| html_body | text | YES | |
| template_name | varchar | YES | |
| template_data | jsonb | YES | |
| status | varchar | YES | 'pending' |
| priority | integer | YES | 5 |
| retry_count | integer | YES | 0 |
| max_retries | integer | YES | 3 |
| error_message | text | YES | |
| sent_at | timestamptz | YES | |
| created_at | timestamptz | YES | now() |

**Code references** (api-src/email.ts): INSERT uses subset of columns — all exist ✅
**Status**: ✅ CLEAN — no issues.

---

## 6. application_interviews (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| application_id | uuid | NO | |
| scheduled_at | timestamptz | NO | |
| mode | text | NO | |
| location | text | YES | |
| status | text | NO | 'scheduled' |
| notes | text | YES | |
| created_by | uuid | YES | |
| updated_by | uuid | YES | |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

**Note**: Has `created_by` and `updated_by` (NOT `interviewer_id` as some docs suggest).
**Code references**: Only referenced via `SELECT *` in applications.ts fetchApplicationDetails JOIN — works ✅
**Row count**: 7 rows (test data)
**Status**: ✅ CLEAN — no issues.

---

## 7. application_drafts (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | |
| draft_data | jsonb | NO | |
| draft_name | text | YES | 'Draft Application' |
| step_completed | integer | YES | 0 |
| is_active | boolean | YES | true |
| last_accessed_at | timestamptz | YES | now() |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

**CRITICAL NOTE**: NO `application_id` column. Drafts are linked to users, not applications.
**Code references**:
- `lib/auth/ownership.ts`: `SELECT user_id FROM application_drafts WHERE id = $1` — ✅ correct
- Frontend uses React Query key `application_drafts` — no SQL, just cache key
**Row count**: 0 rows
**Status**: ✅ CLEAN — no issues.

---

## 8. payments (15 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| application_id | uuid | YES | |
| user_id | uuid | NO | |
| amount | numeric | NO | |
| currency | varchar | YES | 'ZMW' |
| payment_method | varchar | YES | |
| transaction_reference | varchar | YES | |
| status | varchar | YES | 'pending' |
| verified_by | uuid | YES | |
| verified_at | timestamptz | YES | |
| receipt_number | varchar | YES | |
| receipt_url | text | YES | |
| metadata | jsonb | YES | |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

**Code references**:
- `lib/auth/ownership.ts`: `SELECT user_id FROM payments WHERE id = $1` — ✅ correct
- `api-src/payments.ts`: Uses `PaymentQueries.getApplicationForReceipt()` which queries `applications` table (not `payments` table directly) — ✅
**Row count**: 0 rows
**Note**: Payment data is primarily stored in `applications` table columns (amount, payment_method, payment_status, etc.). The `payments` table appears to be a separate ledger that's currently unused.
**Status**: ✅ CLEAN — no code references invalid columns.

---

## 9. documents (legacy) (14 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| application_id | uuid | YES | |
| uploader_id | uuid | YES | |
| document_type | varchar | NO | |
| document_name | varchar | NO | |
| file_name | varchar | NO | |
| file_path | text | NO | |
| file_size | integer | YES | |
| mime_type | varchar | YES | |
| verdict | varchar | YES | 'pending' |
| verified_by | uuid | YES | |
| verified_at | timestamptz | YES | |
| notes | text | YES | |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

**Row count**: 0 rows ✅
**Code references**: Only in `scripts/migrate-storage-to-r2.ts` (dead migration script) — no active API code references this table.
**Note**: Different column names from `application_documents`: `file_name` vs `document_name`, `file_path` vs `file_url`, `verdict` vs `verification_status`, `notes` vs `verification_notes`.
**Status**: ✅ DEAD TABLE — 0 rows, no active code references. Candidate for DROP.

---

## 10. document_migration_log (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| document_id | uuid | NO | |
| old_url | text | NO | |
| new_r2_path | text | NO | |
| new_r2_url | text | NO | |
| checksum | text | YES | |
| status | text | NO | 'pending' |
| error | text | YES | |
| migrated_at | timestamptz | YES | now() |

**Row count**: 0 rows
**Code references**: None in active code — only in dead migration scripts.
**Status**: ✅ DEAD TABLE — 0 rows, no active code references. Candidate for DROP.

---

## 11. user_permission_overrides (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| user_id | uuid | NO | (PK) |
| permissions | text[] ARRAY | NO | ARRAY[]::text[] |
| updated_by | uuid | YES | |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**CRITICAL NOTE**: `permissions` is `text[] ARRAY`, NOT `jsonb` as some docs suggest.
**Code references**:
- `api-src/admin.ts`: `INSERT ... VALUES ($1, $2::text[], $3, NOW(), NOW())` — ✅ correct cast
- `api-src/admin.ts`: `DELETE FROM user_permission_overrides WHERE user_id = $1` — ✅
- `lib/auth/userPermissionOverrides.ts`: `SELECT permissions FROM user_permission_overrides WHERE user_id = $1` — ✅ returns `string[]`
**Status**: ✅ CLEAN — code correctly uses `::text[]` cast.

---

## Summary

| Table | Columns | Rows | Status | Issues |
|-------|---------|------|--------|--------|
| csrf_tokens | 5 | — | ✅ CLEAN | None |
| password_reset_tokens | 6 | — | ✅ CLEAN | None |
| login_attempts | 5 | — | ✅ CLEAN | None |
| idempotency_keys | 4 | — | ✅ CLEAN | None |
| email_queue | 14 | — | ✅ CLEAN | None |
| application_interviews | 11 | 7 | ✅ CLEAN | None |
| application_drafts | 9 | 0 | ✅ CLEAN | No application_id column (by design) |
| payments | 15 | 0 | ✅ CLEAN | Separate ledger, mostly unused |
| documents (legacy) | 14 | 0 | ✅ DEAD | Candidate for DROP |
| document_migration_log | 9 | 0 | ✅ DEAD | Candidate for DROP |
| user_permission_overrides | 5 | — | ✅ CLEAN | permissions is text[] not jsonb |

**Total issues**: 0 CRITICAL, 0 HIGH, 0 MEDIUM
**Dead tables**: 2 (documents, document_migration_log) — both 0 rows, no active code references
