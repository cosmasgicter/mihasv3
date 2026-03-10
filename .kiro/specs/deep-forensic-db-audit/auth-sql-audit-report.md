# SQL Cross-Reference Audit Report: api-src/auth.ts (Task 4.1)

## Ground Truth — Live Schema Columns (verified via Neon MCP)

**profiles** (30 columns): id, email, role, first_name, last_name, phone, is_active, password_hash, refresh_token_hash, failed_login_attempts, locked_until, password_changed_at, email_verified, avatar_url, date_of_birth, nrc_number, nationality, address, notification_preferences, last_login_at, created_at, updated_at, reset_token_hash, reset_token_expires, reset_token_used, sex, residence_town, next_of_kin_name, next_of_kin_phone, full_name

**login_attempts** (5 columns): id, email_hash, ip_hash, attempted_at, success

**password_reset_tokens** (6 columns): id, user_id, token_hash, expires_at, used_at, created_at

**csrf_tokens** (5 columns): id, user_id, token_hash, expires_at, created_at

**device_sessions** (12 columns): id, user_id, device_id, device_info, session_token, ip_address, user_agent, last_activity, is_active, expires_at, created_at, updated_at

---

## SQL Statement Audit

### Statement 1 — INSERT into login_attempts (recordLoginAttempt)
- **Line**: ~258
- **Operation**: INSERT
- **Table**: login_attempts
- **Columns referenced**: email_hash, ip_hash, attempted_at (via NOW()), success
- **Status**: ✅ All columns valid
- **Notes**: `attempted_at` uses `NOW()` inline, not a parameter. All 4 non-id columns match live schema.

### Statement 2 — SELECT from login_attempts (checkLoginCooldown)
- **Line**: ~273
- **Operation**: SELECT
- **Table**: login_attempts
- **Columns referenced**: COUNT(*) AS fail_count, MIN(attempted_at) AS oldest_failure, email_hash, success, attempted_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 3 — SELECT from login_attempts (checkAccountLockout)
- **Line**: ~299
- **Operation**: SELECT
- **Table**: login_attempts
- **Columns referenced**: success, attempted_at, email_hash (WHERE)
- **Status**: ✅ All columns valid

### Statement 4 — SELECT from profiles (handlePasswordResetRequest — user lookup)
- **Line**: ~413
- **Operation**: SELECT
- **Table**: profiles
- **Columns referenced**: id, email, first_name, last_name, is_active (WHERE)
- **Status**: ✅ All columns valid

### Statement 5 — SELECT from password_reset_tokens (handlePasswordResetRequest — rate limit)
- **Line**: ~424
- **Operation**: SELECT
- **Table**: password_reset_tokens
- **Columns referenced**: COUNT(*) AS request_count, user_id (WHERE), created_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 6 — SELECT from password_reset_tokens (handlePasswordResetRequest — oldest in window)
- **Line**: ~431
- **Operation**: SELECT
- **Table**: password_reset_tokens
- **Columns referenced**: MIN(created_at) AS oldest, user_id (WHERE), created_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 7 — INSERT into password_reset_tokens (handlePasswordResetRequest)
- **Line**: ~445
- **Operation**: INSERT
- **Table**: password_reset_tokens
- **Columns referenced**: user_id, token_hash, expires_at (via NOW() + INTERVAL)
- **Status**: ✅ All columns valid

### Statement 8 — SELECT from password_reset_tokens (handlePasswordReset — token lookup)
- **Line**: ~487
- **Operation**: SELECT
- **Table**: password_reset_tokens
- **Columns referenced**: id, user_id, token_hash (WHERE), expires_at (WHERE), used_at (WHERE)
- **Status**: ✅ All columns valid

### Statement 9 — UPDATE profiles (handlePasswordReset — change password)
- **Line**: ~498
- **Operation**: UPDATE
- **Table**: profiles
- **Columns SET**: password_hash, updated_at (via NOW())
- **Columns WHERE**: id
- **Status**: ✅ All columns valid

### Statement 10 — UPDATE password_reset_tokens (handlePasswordReset — mark used)
- **Line**: ~503
- **Operation**: UPDATE
- **Table**: password_reset_tokens
- **Columns SET**: used_at (via NOW())
- **Columns WHERE**: id
- **Status**: ✅ All columns valid

### Statement 11 — UPDATE password_reset_tokens (handlePasswordReset — invalidate all)
- **Line**: ~508
- **Operation**: UPDATE
- **Table**: password_reset_tokens
- **Columns SET**: used_at (via NOW())
- **Columns WHERE**: user_id, used_at
- **Status**: ✅ All columns valid

### Statement 12 — SELECT from profiles (handleLogin — find user)
- **Line**: ~545
- **Operation**: SELECT
- **Table**: profiles
- **Columns referenced**: id, email, password_hash, role, first_name, last_name, is_active, email (WHERE)
- **Status**: ✅ All columns valid

### Statement 13 — SELECT from profiles (handleSession — get fresh user data)
- **Line**: ~636
- **Operation**: SELECT
- **Table**: profiles
- **Columns referenced**: id, email, role, first_name, last_name, id (WHERE)
- **Status**: ✅ All columns valid

### Statement 14 — SELECT from profiles (handleRefresh — get user data)
- **Line**: ~668
- **Operation**: SELECT
- **Table**: profiles
- **Columns referenced**: id, email, role, first_name, last_name, is_active, id (WHERE)
- **Status**: ✅ All columns valid

### Statement 15 — SELECT from profiles (handleCheckEmail — email exists)
- **Line**: ~833 (approx, near end of file)
- **Operation**: SELECT
- **Table**: profiles
- **Columns referenced**: id, email (WHERE)
- **Status**: ✅ All columns valid

### Statement 16 — SELECT from profiles (handleRoles — role check)
- **Line**: ~720
- **Operation**: SELECT
- **Table**: profiles
- **Columns referenced**: id, role, is_active, id (WHERE)
- **Status**: ✅ All columns valid

### Statement 17 — SELECT from profiles (handleProfile GET)
- **Line**: ~760
- **Operation**: SELECT
- **Table**: profiles
- **Columns referenced**: id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone, id (WHERE)
- **Status**: ✅ All columns valid
- **Notes**: All 16 selected columns exist in the live schema.

### Statement 18 — UPDATE profiles (handleProfile PATCH — dynamic update)
- **Line**: ~810 (approx)
- **Operation**: UPDATE (dynamic)
- **Table**: profiles
- **allowedFields array**: full_name, first_name, last_name, phone, date_of_birth, sex, residence_town, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone
- **Also SET**: updated_at (via NOW())
- **WHERE**: id
- **RETURNING**: id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone
- **Status**: ✅ All columns valid
- **Notes**: All 13 allowed fields exist in the live schema. All 16 RETURNING columns exist. The dynamic SET clause uses `$N` placeholders correctly.
- **⚠️ BUG (non-schema)**: The SET clause builds `${field} = ${index + 1}` which produces `full_name = 1` instead of `full_name = $1`. Missing `$` prefix on parameter placeholders. This is a code bug, not a phantom column issue, but it would cause runtime SQL errors.

### Statement 19 — SELECT from profiles (handleRegister — check existing email)
- **Line**: ~833
- **Operation**: SELECT
- **Table**: profiles
- **Columns referenced**: id, email (WHERE)
- **Status**: ✅ All columns valid

### Statement 20 — INSERT into profiles (handleRegister — create user)
- **Line**: ~843
- **Operation**: INSERT
- **Table**: profiles
- **Columns referenced**: email, password_hash, role (literal 'student'), first_name, last_name, full_name, phone, date_of_birth, sex, residence_town, nationality, next_of_kin_name, next_of_kin_phone, is_active (literal true), created_at (NOW()), updated_at (NOW())
- **RETURNING**: id
- **Status**: ✅ All columns valid
- **Notes**: All 16 columns in the INSERT list exist in the live profiles schema.

### Statement 21 — INSERT into login_attempts (recordRegistrationAttempt)
- **Line**: ~790
- **Operation**: INSERT
- **Table**: login_attempts
- **Columns referenced**: email_hash, ip_hash, attempted_at (via NOW()), success
- **Status**: ✅ All columns valid

### Statement 22 — SELECT from login_attempts (checkRegistrationRateLimit)
- **Line**: ~770
- **Operation**: SELECT
- **Table**: login_attempts
- **Columns referenced**: COUNT(*) AS reg_count, MIN(attempted_at) AS oldest_reg, email_hash (WHERE), attempted_at (WHERE)
- **Status**: ✅ All columns valid

---

## Summary

| # | Line (approx) | Operation | Table | Status |
|---|---|---|---|---|
| 1 | ~258 | INSERT | login_attempts | ✅ Valid |
| 2 | ~273 | SELECT | login_attempts | ✅ Valid |
| 3 | ~299 | SELECT | login_attempts | ✅ Valid |
| 4 | ~413 | SELECT | profiles | ✅ Valid |
| 5 | ~424 | SELECT | password_reset_tokens | ✅ Valid |
| 6 | ~431 | SELECT | password_reset_tokens | ✅ Valid |
| 7 | ~445 | INSERT | password_reset_tokens | ✅ Valid |
| 8 | ~487 | SELECT | password_reset_tokens | ✅ Valid |
| 9 | ~498 | UPDATE | profiles | ✅ Valid |
| 10 | ~503 | UPDATE | password_reset_tokens | ✅ Valid |
| 11 | ~508 | UPDATE | password_reset_tokens | ✅ Valid |
| 12 | ~545 | SELECT | profiles | ✅ Valid |
| 13 | ~636 | SELECT | profiles | ✅ Valid |
| 14 | ~668 | SELECT | profiles | ✅ Valid |
| 15 | ~833 | SELECT | profiles | ✅ Valid |
| 16 | ~720 | SELECT | profiles | ✅ Valid |
| 17 | ~760 | SELECT | profiles | ✅ Valid |
| 18 | ~810 | UPDATE | profiles | ✅ Valid (⚠️ code bug: missing $ in placeholders) |
| 19 | ~833 | SELECT | profiles | ✅ Valid |
| 20 | ~843 | INSERT | profiles | ✅ Valid |
| 21 | ~790 | INSERT | login_attempts | ✅ Valid |
| 22 | ~770 | SELECT | login_attempts | ✅ Valid |

**Total SQL statements audited**: 22
**Phantom columns found**: 0
**All column references are valid against the live schema.**

---

## Non-Schema Issues Found

### ⚠️ CRITICAL CODE BUG: Missing `$` prefix in dynamic UPDATE placeholders (handleProfile PATCH)

**File**: api-src/auth.ts
**Line 1221**: SET clause placeholder bug
**Line 1244**: WHERE clause placeholder bug

**Issue**: The dynamic SET clause builder (line 1221) produces:
```typescript
return `${field} = ${index + 1}`;  // BUG: produces "full_name = 1" not "full_name = $1"
```
**Expected**: `` return `${field} = $${index + 1}`; `` → produces `full_name = $1`
**Actual**: `` return `${field} = ${index + 1}`; `` → produces `full_name = 1`

This would cause the UPDATE to set every field to its ordinal index number (1, 2, 3...) instead of the actual parameter values. This is a **runtime data corruption bug**, not a phantom column issue.

Similarly, the WHERE clause (line 1244):
```typescript
WHERE id = ${providedFields.length + 1}
```
Should be:
```typescript
WHERE id = $${providedFields.length + 1}
```

**Impact**: Any PATCH to `/api/auth?action=profile` would either:
1. Set all fields to integer values (1, 2, 3...) instead of actual data — data corruption
2. Fail with a type mismatch error from PostgreSQL (e.g., trying to set a VARCHAR to an integer)
3. Match the wrong row in WHERE clause (comparing UUID to an integer)

### Note: `is_active` column discrepancy with task prompt

The task prompt listed profiles columns without `is_active`, but the live schema confirms `is_active` EXISTS in the profiles table. The code correctly references it. The task prompt's column list was incomplete — the live Neon MCP query is the ground truth.

### Note: `address` and `avatar_url` columns

Both `address` and `avatar_url` exist in the live profiles schema (confirmed via Neon MCP). The code correctly references them in the handleProfile GET/PATCH handlers.

### Note: Columns in live schema NOT in task prompt

The following profiles columns exist in the live schema but were not listed in the task prompt:
- is_active
- failed_login_attempts
- locked_until
- password_changed_at
- avatar_url
- address
- notification_preferences
- last_login_at
- reset_token_hash
- reset_token_expires
- reset_token_used

These are all valid columns from the core schema (002_core_schema.sql). The code references to `is_active` are correct.
