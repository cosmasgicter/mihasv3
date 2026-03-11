# Admin Users & Registration Multi-Bug Fix Design

## Overview

Four production bugs are affecting the MIHAS admissions portal across the API layer. The fix approach is targeted and minimal for each:

1. **SQL Parameterization** — Replace template literal interpolation with proper PostgreSQL dollar-N placeholders for LIMIT/OFFSET in `handleUsers()`.
2. **VARCHAR Overflow** — Re-hash the `reg:` prefixed key to produce a 64-char digest that fits `login_attempts.email_hash`.
3. **CORS/CSRF Preflight** — Delegate OPTIONS handling in `withArcjetProtection()` to `handleCors()` from `lib/cors.ts` instead of duplicating incomplete headers.
4. **url.parse() Deprecation** — Suppress the `[DEP0169]` warning in production via a targeted `process.emitWarning` filter.

All fixes are scoped to `api-src/admin.ts`, `api-src/auth.ts`, and `lib/arcjet.ts`. No schema migrations are required — the VARCHAR fix uses application-level re-hashing rather than altering the column.

## Glossary

- **Bug_Condition (C)**: The specific input or state that triggers each bug — SQL param mismatch, 68-char string overflow, missing CORS header, or deprecated API call.
- **Property (P)**: The desired correct behavior when the bug condition holds — valid SQL execution, successful audit INSERT, complete CORS headers, clean logs.
- **Preservation**: Existing behaviors that must remain unchanged — pagination metadata, login attempt tracking, Arcjet security enforcement, API response envelopes.
- **handleUsers()**: The function in `api-src/admin.ts` (~line 585) that builds and executes the paginated user list query with optional role/search filters.
- **recordRegistrationAttempt()**: The function in `api-src/auth.ts` (~line 769) that inserts a registration audit trail row into `login_attempts`.
- **checkRegistrationRateLimit()**: The function in `api-src/auth.ts` (~line 739) that queries `login_attempts` to enforce 3-per-IP-per-10-min registration rate limiting.
- **withArcjetProtection()**: The wrapper in `lib/arcjet.ts` (~line 209) that handles OPTIONS preflight and applies Arcjet security rules before delegating to the handler.
- **paramIndex**: The 1-based counter tracking the next dollar-N placeholder index in dynamically-built SQL queries.

## Bug Details

### Fault Condition

The bugs manifest across four independent conditions. Each has a distinct trigger and failure mode.

**Formal Specification:**

```
FUNCTION isBugCondition_SQL(input)
  INPUT: input of type { action: string, method: string, role?: string, search?: string }
  OUTPUT: boolean

  RETURN input.action == 'users'
         AND input.method == 'GET'
         // The bug fires for ALL GET requests to ?action=users because
         // LIMIT/OFFSET always use template literals instead of $N placeholders.
END FUNCTION

FUNCTION isBugCondition_VARCHAR(input)
  INPUT: input of type { action: string, ipHash: string }
  OUTPUT: boolean

  RETURN input.action == 'register'
         AND LENGTH('reg:' + input.ipHash) > 64
         // ipHash is always a 64-char SHA-256 hex digest,
         // so 'reg:' + ipHash = 68 chars, always exceeding VARCHAR(64).
END FUNCTION

FUNCTION isBugCondition_CORS(input)
  INPUT: input of type { method: string }
  OUTPUT: boolean

  RETURN input.method == 'OPTIONS'
         AND request is handled by withArcjetProtection()
         // The Arcjet wrapper intercepts OPTIONS before handleCors() runs,
         // responding with hardcoded headers that omit X-CSRF-Token.
END FUNCTION

FUNCTION isBugCondition_Deprecation(input)
  INPUT: input of type { endpoint: string }
  OUTPUT: boolean

  RETURN TRUE
         // The url.parse() deprecation warning fires on every API request
         // from a dependency, regardless of endpoint or method.
END FUNCTION
```

### Examples

- **SQL Bug — No filters**: `GET /api/admin?action=users&page=1&limit=50` — SQL has `LIMIT 1 OFFSET 2` as literal text, params array `[50, 0]` has 2 values but query has 0 placeholders — HTTP 500 "bind message supplies 2 parameters, but prepared statement requires 0".
- **SQL Bug — Role filter**: `GET /api/admin?action=users&role=student&page=1&limit=50` — SQL has `WHERE role = $1 LIMIT 2 OFFSET 3`, params `['student', 50, 0]` has 3 values but query has 1 placeholder — HTTP 500.
- **SQL Bug — Role + Search**: `GET /api/admin?action=users&role=admin&search=john&page=1&limit=50` — SQL has `WHERE role = $1 AND (...LIKE $2...) LIMIT 3 OFFSET 4`, params `['admin', '%john%', 50, 0]` has 4 values but query has 2 placeholders — HTTP 500.
- **VARCHAR Bug**: `POST /api/auth?action=register` with any IP — `recordRegistrationAttempt()` tries to INSERT `reg:a1b2c3...` (68 chars) into `email_hash VARCHAR(64)` — INSERT fails silently, no audit row created, rate limit query always returns 0 rows.
- **CORS Bug**: Browser sends `OPTIONS /api/applications` before a `PATCH` with `X-CSRF-Token` header — Arcjet responds with `Access-Control-Allow-Headers: Content-Type, Authorization` (missing `X-CSRF-Token`) — browser blocks the PATCH — 403 Forbidden.
- **Deprecation Bug**: Any `GET /api/catalog?type=programs` — logs emit `[DEP0169] DeprecationWarning: url.parse() is deprecated` alongside the normal response.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Mouse/keyboard admin dashboard interactions for PUT/POST/DELETE user operations must continue routing to `handleUpdateUser` and `handleDeactivateUser` respectively.
- Pagination metadata (`totalCount`, `page`, `pageSize`, `totalPages`) must continue to be calculated correctly from the count query.
- `includeInactive=true` must continue to include deactivated users.
- `recordLoginAttempt()` for normal login flows must continue storing exactly 64-char SHA-256 email hashes without any prefix or truncation.
- `checkLoginCooldown()` and `checkAccountLockout()` must continue enforcing progressive backoff and lockout using the existing email_hash format.
- Registration must continue returning HTTP 201 with profile, tokens, and CSRF token regardless of audit trail success/failure.
- Arcjet-level registration rate limiting must continue operating independently of the database fallback.
- Non-OPTIONS requests must continue receiving full Arcjet protection (shield, bot detection, rate limiting).
- CSRF validation must continue rejecting state-changing requests without valid tokens (403 + `CSRF_VALIDATION_FAILED`).
- Arcjet blocks must continue returning 403 + `SECURITY_VIOLATION`.
- `handleCors()` in `lib/cors.ts` must continue setting the full CORS header set on non-OPTIONS requests.
- All API responses must continue using the `{ success: true, data: ... }` envelope via `sendSuccess()`.
- Error responses must continue using sanitized `sendError()` without exposing stack traces.

**Scope:**
All inputs that do NOT involve the four bug conditions should be completely unaffected by these fixes. This includes:
- All non-GET requests to `/api/admin?action=users` (PUT, POST, DELETE)
- All non-register auth actions (login, logout, refresh, session, reset-request, reset-confirm)
- All non-OPTIONS requests passing through `withArcjetProtection()`
- All API endpoint business logic and response formatting

## Hypothesized Root Cause

Based on the bug descriptions and source code analysis:

1. **SQL Parameterization — Template Literal vs Placeholder Confusion**: In `handleUsers()` at `api-src/admin.ts` line ~647, the developer used JavaScript template literal interpolation which embeds the *value of paramIndex* (e.g., `1`, `2`, `3`) as literal SQL text. The current code produces output like `LIMIT 1 OFFSET 2` (literal numbers in SQL) instead of the intended `LIMIT $1 OFFSET $2` (PostgreSQL parameter placeholders). The `limit` and `offset` values are correctly pushed to the params array, creating the parameter count mismatch. The fix is to add a literal dollar sign before each interpolation expression so the output becomes `$1`, `$2`, etc.

2. **VARCHAR Overflow — Prefix Length Not Accounted For**: The `recordRegistrationAttempt()` function prefixes the IP hash with `reg:` to distinguish registration attempts from login attempts in the shared `login_attempts` table. The developer didn't account for the fact that `reg:` (4 chars) + SHA-256 hex (64 chars) = 68 chars, exceeding the `VARCHAR(64)` column constraint. The `checkRegistrationRateLimit()` function uses the same prefixed key for lookups, so both functions are consistently wrong — but since the INSERT always fails, the SELECT always returns 0 rows.

3. **CORS/CSRF — Duplicated Incomplete Headers**: The `withArcjetProtection()` wrapper was added to handle OPTIONS before Arcjet runs (correctly preventing preflight from being classified as a bot). However, instead of delegating to `handleCors()` from `lib/cors.ts`, it duplicates the CORS headers with a hardcoded subset that omits `X-CSRF-Token` from `Access-Control-Allow-Headers` and entirely omits `Access-Control-Expose-Headers`. This is a classic DRY violation — the canonical CORS headers in `lib/cors.ts` include both, but the copy in `lib/arcjet.ts` was never updated when CSRF support was added.

4. **url.parse() Deprecation — Dependency Internal Usage**: The `[DEP0169]` warning originates from a dependency (`@vercel/node`, `@arcjet/node`, or `@neondatabase/serverless`) that internally uses the legacy `url.parse()` API. Since this is not application code, it cannot be fixed directly — only suppressed or mitigated by updating the dependency.

## Correctness Properties

Property 1: Fault Condition — SQL Parameter Count Matches Placeholder Count

_For any_ `GET /api/admin?action=users` request with any combination of filters (no filters, role only, search only, role + search) and any valid pagination parameters, the generated SQL query SHALL have exactly N dollar-sign placeholders where N equals the length of the bind parameters array, and the query SHALL execute successfully returning HTTP 200 with paginated user data.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation — Admin Users Pagination Metadata

_For any_ `GET /api/admin?action=users` request where the SQL fix is applied, the response SHALL continue to include correct `totalCount`, `page`, `pageSize`, and `totalPages` metadata matching the actual database row count for the given filters, preserving existing pagination behavior.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 3: Fault Condition — Registration Audit Key Fits VARCHAR(64)

_For any_ registration attempt where `recordRegistrationAttempt(ipHash)` is called with a 64-character SHA-256 hex digest, the `email_hash` value written to `login_attempts` SHALL be at most 64 characters long and SHALL be successfully inserted without VARCHAR overflow.

**Validates: Requirements 2.5, 2.6**

Property 4: Preservation — Login Attempt Email Hash Format Unchanged

_For any_ login attempt (non-registration) where `recordLoginAttempt()` is called, the `email_hash` value SHALL continue to be the raw 64-character SHA-256 hex digest of the email address with no prefix or truncation, preserving existing login rate limiting and lockout behavior.

**Validates: Requirements 3.5, 3.6**

Property 5: Fault Condition — Registration Rate Limit Key Consistency

_For any_ registration attempt, the key used by `checkRegistrationRateLimit()` for the SELECT query SHALL exactly match the key used by `recordRegistrationAttempt()` for the INSERT, and both SHALL fit within VARCHAR(64), enabling the database-backed rate limit to function correctly.

**Validates: Requirements 2.7**

Property 6: Fault Condition — CORS Preflight Includes CSRF Header

_For any_ OPTIONS preflight request handled by `withArcjetProtection()`, the response SHALL include `X-CSRF-Token` in the `Access-Control-Allow-Headers` header and SHALL include `Access-Control-Expose-Headers: X-CSRF-Token`, matching the headers set by `handleCors()` in `lib/cors.ts`.

**Validates: Requirements 2.8, 2.9, 2.10**

Property 7: Preservation — Arcjet Protection on Non-OPTIONS Requests

_For any_ non-OPTIONS request passing through `withArcjetProtection()`, the Arcjet shield rules, bot detection, and rate limiting SHALL continue to execute before the handler, and blocked requests SHALL continue to return 403 with `SECURITY_VIOLATION`, preserving the existing security posture.

**Validates: Requirements 3.9, 3.10, 3.12**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `api-src/admin.ts`

**Function**: `handleUsers()`

**Specific Changes**:

1. **Fix LIMIT/OFFSET placeholders**: On line ~647, the SQL query string template literal for LIMIT and OFFSET embeds the paramIndex number as literal SQL text (e.g., `LIMIT 1 OFFSET 2`). The fix adds a literal dollar sign before each interpolation so the output becomes proper PostgreSQL placeholders (e.g., `LIMIT $1 OFFSET $2`). In the JS template literal, this means writing a dollar sign followed by the dollar-brace interpolation of paramIndex. The dollar sign character appears literally in the SQL output, and the interpolation inserts the index number after it.

---

**File**: `api-src/auth.ts`

**Functions**: `recordRegistrationAttempt()`, `checkRegistrationRateLimit()`

**Specific Changes**:

2. **Create a VARCHAR(64)-safe registration key helper**: Add a `registrationKey()` function that re-hashes the prefixed value to produce a deterministic 64-char hex digest:

```typescript
function registrationKey(ipHash: string): string {
  return createHash('sha256').update('reg:' + ipHash).digest('hex');
}
```

This preserves the distinction from login email hashes (which are SHA-256 of email, not of `reg:` + IP) while fitting the column constraint. The `createHash` import already exists in the file.

3. **Update recordRegistrationAttempt()**: Replace the inline `'reg:' + ipHash` concatenation with `registrationKey(ipHash)` for the `email_hash` INSERT value.

4. **Update checkRegistrationRateLimit()**: Replace the inline `'reg:' + ipHash` concatenation with `registrationKey(ipHash)` for the WHERE clause value, ensuring key consistency between INSERT and SELECT.

---

**File**: `lib/arcjet.ts`

**Function**: `withArcjetProtection()`

**Specific Changes**:

5. **Delegate OPTIONS to handleCors()**: Replace the 15 lines of hardcoded CORS headers in the OPTIONS block (~lines 218-230) with a single call to `handleCors(req, res)` from `lib/cors.ts`. Add `import { handleCors } from './cors'` at the top of the file. The replacement:

```typescript
if (req.method === 'OPTIONS') {
  handleCors(req, res);
  return;
}
```

`handleCors()` already sets all required headers (including `X-CSRF-Token` in both `Access-Control-Allow-Headers` and `Access-Control-Expose-Headers`) and sends 204, so no additional code is needed.

---

**File**: `lib/arcjet.ts` (module-level)

**Specific Changes**:

6. **Suppress url.parse() deprecation warning**: Add a targeted `process.emitWarning` override at module load time that filters only the `DEP0169` deprecation warning, allowing all other warnings to pass through. Placed in `lib/arcjet.ts` because it's imported by every API endpoint via `withArcjetProtection()`:

```typescript
const originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning: any, ...args: any[]) {
  if (typeof warning === 'string'
      && args[0] === 'DeprecationWarning'
      && args[1] === 'DEP0169') return;
  if (warning && typeof warning === 'object'
      && (warning as any).code === 'DEP0169') return;
  return originalEmitWarning.call(process, warning, ...args);
} as typeof process.emitWarning;
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on unfixed code, then verify the fixes work correctly and preserve existing behavior. Property-based tests use `fast-check` with `numRuns: 10` for fast CI execution per project conventions.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that exercise each bug condition and assert the expected failure mode. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **SQL No-Filter Test**: Build the SQL query string using the current `handleUsers()` logic with no role/search filters, assert that the number of dollar-N placeholders does NOT match the params array length (will fail on unfixed code — 0 placeholders, 2 params).
2. **SQL Role-Filter Test**: Build the SQL query with role filter only, assert placeholder/param mismatch (will fail — 1 placeholder, 3 params).
3. **SQL Role+Search Test**: Build the SQL query with both filters, assert placeholder/param mismatch (will fail — 2 placeholders, 4 params).
4. **VARCHAR Overflow Test**: Compute `reg:` + a 64-char hex string, assert `length > 64` (will fail — confirms the overflow).
5. **CORS Header Test**: Inspect the headers set by `withArcjetProtection()` for an OPTIONS request, assert `X-CSRF-Token` is NOT in `Access-Control-Allow-Headers` (will fail on unfixed code — confirms the omission).

**Expected Counterexamples**:
- SQL queries with `LIMIT 1 OFFSET 2` as literal text instead of `$1`, `$2` placeholders
- Registration key `reg:a1b2c3...` at 68 characters exceeding VARCHAR(64)
- OPTIONS response missing `X-CSRF-Token` from allowed headers

### Fix Checking

**Goal**: Verify that for all inputs where each bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**

```
// SQL Parameterization
FOR ALL input WHERE isBugCondition_SQL(input) DO
  sql, params := buildUsersQuery_fixed(input)
  placeholderCount := countDollarPlaceholders(sql)
  ASSERT placeholderCount == LENGTH(params)
END FOR

// VARCHAR Overflow
FOR ALL ipHash WHERE isBugCondition_VARCHAR(ipHash) DO
  key := registrationKey_fixed(ipHash)
  ASSERT LENGTH(key) <= 64
  ASSERT key == registrationKey_fixed(ipHash)  // deterministic
END FOR

// CORS Headers
FOR ALL request WHERE isBugCondition_CORS(request) DO
  headers := handleOptions_fixed(request)
  ASSERT 'X-CSRF-Token' IN headers['Access-Control-Allow-Headers']
  ASSERT 'X-CSRF-Token' IN headers['Access-Control-Expose-Headers']
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**

```
// SQL — Non-GET requests unchanged
FOR ALL input WHERE input.method != 'GET' OR input.action != 'users' DO
  ASSERT handleUsers_original(input) == handleUsers_fixed(input)
END FOR

// Login attempts — email hash format unchanged
FOR ALL email WHERE isLoginAttempt(email) DO
  hash := recordLoginAttempt_fixed(email)
  ASSERT LENGTH(hash) == 64
  ASSERT hash == sha256(email)  // no prefix, no truncation
END FOR

// Arcjet — non-OPTIONS requests still protected
FOR ALL request WHERE request.method != 'OPTIONS' DO
  ASSERT arcjetProtection_applied(request) == TRUE
END FOR
```

**Testing Approach**: Property-based testing with `fast-check` is recommended for preservation checking because:
- It generates many combinations of filter parameters, pagination values, and IP hashes automatically
- It catches edge cases like empty search strings, boundary page numbers, and unusual hash values
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs (login attempts, non-GET admin requests, non-OPTIONS API calls), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Login Hash Preservation**: Generate random email strings, verify `recordLoginAttempt()` continues to store exactly 64-char SHA-256 hex digests with no prefix.
2. **Pagination Metadata Preservation**: Generate random page/limit/filter combinations, verify the fixed query produces correct `totalPages = ceil(totalCount / limit)` and `page` values.
3. **Arcjet Non-OPTIONS Preservation**: Generate random non-OPTIONS HTTP methods, verify Arcjet protection is still applied before the handler.
4. **CSRF Validation Preservation**: Verify state-changing requests without valid CSRF tokens continue to be rejected with 403.

### Unit Tests

- Test `handleUsers()` SQL generation for all 4 filter combinations (none, role, search, role+search) — verify placeholder count matches params length
- Test `registrationKey()` helper produces exactly 64-char output for any input
- Test `registrationKey()` is deterministic (same input produces same output)
- Test `withArcjetProtection()` OPTIONS response includes all CORS headers from `getCorsHeaders()`
- Test `withArcjetProtection()` non-OPTIONS requests still invoke Arcjet protection
- Test edge cases: empty search string, page=0, limit=0, limit=100 (max), very long search strings

### Property-Based Tests

- Generate random `(role?, search?, page, limit)` tuples with `fast-check` and verify the SQL query always has `placeholderCount == params.length` for every combination
- Generate random 64-char hex strings as IP hashes and verify `registrationKey()` always produces a string with `length <= 64` and `length > 0`
- Generate random `registrationKey()` inputs and verify the key used for INSERT always equals the key used for SELECT (consistency property)
- Generate random origins from the allowed list and verify OPTIONS responses always include the full CORS header set

### Integration Tests

- Test full admin users list flow: authenticate as admin, `GET /api/admin?action=users`, verify HTTP 200 with paginated results
- Test full registration flow: `POST /api/auth?action=register`, verify HTTP 201 AND verify `login_attempts` row exists with correct key
- Test PATCH flow: send OPTIONS preflight, verify 204 with correct headers, send PATCH with `X-CSRF-Token`, verify request is not blocked by CORS
