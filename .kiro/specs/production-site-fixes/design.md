# Production Site Fixes — Bugfix Design

## Overview

The MIHAS production admissions portal (***REMOVED***) has 36+ distinct bugs rendering it largely non-functional. The root cause of most API failures is a single systemic defect: **missing `$` prefix on SQL parameter placeholders** throughout `lib/queries.ts`, `api-src/applications.ts`, and `api-src/auth.ts`. Template literals produce `field = 2` instead of `field = $2`, causing Postgres to interpret parameter indices as integer literals, leading to 500 errors or incorrect query results. A secondary critical defect is that the `refresh` auth action is not CSRF-exempt, causing 403 on token refresh and breaking the entire post-login data hydration chain.

The fix strategy is:
1. Fix the systemic SQL parameterization bug (unblocks ~15 API endpoints)
2. Fix CSRF exemption for auth refresh (unblocks post-login flow)
3. Fix CSP headers and inline script (unblocks frontend loading)
4. Fix remaining endpoint-specific bugs
5. Fix frontend data flow issues
6. Fix UI/UX and admin page issues
7. Fix PWA issues

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger one or more of the 36+ production bugs — primarily any API request that hits a dynamically-built SQL query with `${paramIndex}` instead of `$${paramIndex}`, or any POST to `auth?action=refresh` that is subject to CSRF validation
- **Property (P)**: The desired behavior — API endpoints return correct data with proper HTTP status codes; frontend hydrates after login; forms save and update correctly
- **Preservation**: Existing behaviors that must remain unchanged — unauthenticated route protection, CSRF enforcement on non-exempt state-changing endpoints, Arcjet security perimeter, audit trail creation, password reset flow, login attempt tracking
- **`lib/queries.ts`**: Shared query builder module containing `ApplicationQueries`, `DocumentQueries`, `GradeQueries`, `CatalogQueries` — the `update`, `findAll` with dynamic filters, and other dynamic query builders have broken parameterization
- **`api-src/auth.ts`**: Auth endpoint handler — `handleProfile` PATCH and `handleRefresh` have bugs; `csrfExemptActions` array is missing `'refresh'`
- **`api-src/applications.ts`**: Applications endpoint — `handleCreate`, `handleDetails`, `handleById`, `handleExport` all have broken `${paramIndex}` placeholders; `email-slip` action is completely missing
- **`api-src/catalog.ts`**: Catalog endpoint — `handleDetails` dynamic filters have the same `${paramIndex}` bug
- **`api-src/documents.ts`**: Documents endpoint — upload fails because R2 storage may not be configured; CSRF blocks slip uploads
- **`vercel.json`**: Deployment config with CSP `script-src 'self'` that blocks the inline script in `index.html`

## Bug Details

### Fault Condition

The bugs manifest across six categories. The dominant fault condition is the systemic SQL parameterization defect affecting every dynamically-built query in the codebase.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type HTTPRequest targeting any MIHAS API endpoint
  OUTPUT: boolean

  // Category 1: SQL Parameterization Bug
  IF input.endpoint uses dynamic SQL query building
     AND query text contains template literal `${paramIndex}` without `$` prefix
     AND Postgres receives `field = 2` instead of `field = $2`
  THEN RETURN true

  // Category 2: CSRF blocks refresh
  IF input.method = 'POST'
     AND input.endpoint = '/api/auth?action=refresh'
     AND 'refresh' NOT IN csrfExemptActions
  THEN RETURN true

  // Category 3: CSP blocks inline script
  IF input.type = 'page_load'
     AND index.html contains inline <script> tag
     AND CSP script-src = "'self'" (no hash/nonce)
  THEN RETURN true

  // Category 4: Missing endpoint action
  IF input.endpoint = '/api/applications?action=email-slip'
     AND no handler exists for 'email-slip' action
  THEN RETURN true

  // Category 5: Document upload storage unavailable
  IF input.endpoint = '/api/documents?action=upload'
     AND R2 storage is not configured
  THEN RETURN true

  // Category 6: Frontend data flow bugs
  IF input.type = 'frontend_render'
     AND (profile completion uses wrong field set
          OR auto-save onSave callback not wired to API
          OR date formatting fails on ISO timestamps)
  THEN RETURN true

  RETURN false
END FUNCTION
```

### Examples

- **SQL Bug**: `PUT /api/applications?id=abc123` with body `{status: 'submitted'}` → query becomes `UPDATE applications SET status = 2 WHERE id = $1` → Postgres error: column "status" is of type text but expression is of type integer → 500
- **SQL Bug**: `GET /api/applications?page=1&status=draft` → query becomes `WHERE a.user_id = 1 AND a.status = 2` → Postgres interprets `1` and `2` as integer literals, not parameter references → 500 or wrong results
- **SQL Bug**: `POST /api/applications` (create) → `INSERT INTO applications (...) VALUES (1, 2, 3, ...)` → all values are integer literals → 500
- **CSRF Bug**: `POST /api/auth?action=refresh` → CSRF middleware calls `getAuthUser()` which uses the expired access token → returns null → CSRF skipped BUT the refresh handler itself works with the refresh token cookie → however if access token is still valid, CSRF validation runs and fails because client has no valid CSRF token during refresh → 403
- **CSP Bug**: Browser loads `index.html` → inline `<script>` blocked by `script-src 'self'` → console error suppressor doesn't execute → cosmetic but indicates misconfiguration
- **Missing Action**: `POST /api/applications?action=email-slip` → falls through switch to default → 400 "Invalid request"
- **Profile PATCH**: `PATCH /api/auth?action=profile` with body `{phone: '+260...'}` → query becomes `SET phone = 1 ... WHERE id = 2` → 500

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Unauthenticated requests to protected routes must continue to return 401
- CSRF validation must continue to be enforced on all state-changing endpoints except login, register, forgot-password, reset-password, password-reset-request, password-reset, and (newly) refresh
- Arcjet security perimeter must continue to block suspicious activity with 403
- Audit trail entries must continue to be created for state changes
- Password reset tokens must continue to use SHA-256 hashing with 1-hour expiry
- Login attempt tracking must continue with progressive backoff after 5 failures
- Valid document uploads (correct format, size, MIME type) must continue to be stored and return metadata
- The `sendSuccess()`/`sendError()` response envelope must remain unchanged
- HTTP-only cookie auth token storage must remain unchanged
- Refresh token rotation must continue to work (generate new access + refresh tokens)

**Scope:**
All inputs that do NOT involve the broken SQL parameterization, CSRF exemption gap, CSP misconfiguration, missing endpoint actions, or frontend data flow bugs should be completely unaffected by these fixes. This includes:
- Static GET queries with hardcoded `$1`, `$2` placeholders (e.g., `findById`, `checkOwnership`)
- Login, register, and password reset flows (already working)
- Arcjet protection middleware
- CORS handling
- Environment variable validation

## Hypothesized Root Cause

Based on code investigation, the confirmed root causes are:

1. **Systemic SQL Parameterization Bug (CONFIRMED)**: Throughout `lib/queries.ts`, `api-src/applications.ts`, and `api-src/auth.ts`, dynamic query builders use JavaScript template literals `` `${field} = ${paramIndex}` `` which produces `field = 2` instead of `field = $2`. Postgres interprets the bare number as an integer literal, not a parameter reference. This affects:
   - `ApplicationQueries.update()` in `lib/queries.ts` (line ~1247)
   - `handleCreate()` in `api-src/applications.ts` (line ~289: `${i + 1}`)
   - `handleDetails()` in `api-src/applications.ts` (line ~335+: all filter conditions)
   - `handleExport()` in `api-src/applications.ts` (line ~1490+: all filter conditions and LIMIT/OFFSET)
   - `handleById()` reschedule_interview in `api-src/applications.ts` (line ~1230+: `${pIdx}`)
   - `handleProfile()` PATCH in `api-src/auth.ts` (line ~1224: `` `${field} = ${index + 1}` `` and `` WHERE id = ${providedFields.length + 1} ``)

2. **CSRF Exemption Missing for Refresh (CONFIRMED)**: In `api-src/auth.ts` line ~83, `csrfExemptActions` does not include `'refresh'`. When a user's access token is still valid but near expiry, `getAuthUser()` in the CSRF middleware succeeds, then CSRF validation runs and fails because the client cannot supply a valid CSRF token during the refresh flow (the token is being rotated as part of refresh itself).

3. **CSP Blocks Inline Script (CONFIRMED)**: `vercel.json` sets `script-src 'self'` with no hash or nonce. `index.html` has an inline `<script>` tag (console error suppressor) that gets blocked.

4. **Missing `email-slip` Action (CONFIRMED)**: `api-src/applications.ts` handler switch has no case for `'email-slip'`, so it falls through to the default which returns 400.

5. **Document Upload R2 Dependency**: `handleUpload()` in `api-src/documents.ts` calls `isR2Available()` and returns 503 if R2 is not configured. If R2 credentials are missing from Vercel env vars, all uploads fail with 500/503.

6. **Profile Completion Stuck at 71%**: The `calculateCanonicalProfileCompletion()` function likely counts fields that are never populated during registration, or the field mapping between registration data and profile columns has gaps.

7. **Auto-Save Not Triggering Server Saves**: The `useAutoSave` hook saves to localStorage but the `onSave` callback (which should call the API) may not be wired up in the application wizard, or the API call fails due to the SQL parameterization bug.

8. **PWA Install Prompt**: The `useInstallPrompt` hook correctly captures `beforeinstallprompt` and calls `prompt()` on user interaction — this appears to be working correctly in the code. The issue may be that the `InstallBanner` component is not rendered or `canInstall` is never true due to manifest/icon issues.

9. **PWA Manifest Icons**: The manifest references both PNG and SVG icons. The PNG files exist at `public/icons/`. The SVG files also exist. The 404 issue from the bug report may be a caching or deployment issue, or the SVG icons may not be valid. The manifest should be simplified to only reference PNG icons for maximum browser compatibility.

## Correctness Properties

Property 1: Fault Condition — SQL Parameterization Fix

_For any_ API request that triggers a dynamically-built SQL query (application CRUD, profile update, catalog listing with filters, export), the fixed query builders SHALL produce valid Postgres parameterized queries with `$N` placeholders (e.g., `$1`, `$2`) instead of bare integer literals, and the database SHALL execute the query successfully returning correct results.

**Validates: Requirements 2.1, 2.3, 2.6, 2.7a, 2.8, 2.9, 2.10, 2.11, 2.12, 2.14, 2.15, 2.24, 2.25**

Property 2: Fault Condition — CSRF Refresh Exemption

_For any_ POST request to `/api/auth?action=refresh` with a valid refresh token cookie, the fixed auth handler SHALL skip CSRF validation for the refresh action and return 200 with new access/refresh tokens and a rotated CSRF token.

**Validates: Requirements 2.2**

Property 3: Preservation — Existing CSRF Enforcement

_For any_ state-changing request (POST/PUT/DELETE/PATCH) to a non-exempt action where the user is authenticated, the fixed code SHALL continue to enforce CSRF token validation exactly as before, rejecting requests with missing or invalid CSRF tokens with 403.

**Validates: Requirements 3.7**

Property 4: Preservation — Authentication and Authorization

_For any_ request to a protected endpoint without valid authentication, the fixed code SHALL continue to return 401 Unauthorized. For any request where the user lacks the required role, the fixed code SHALL continue to return 403 Forbidden.

**Validates: Requirements 3.1, 3.6, 3.8**

Property 5: Preservation — Audit Trail and Security

_For any_ state change (application status update, payment verification, document upload), the fixed code SHALL continue to create audit trail entries. Password reset, login attempt tracking, and Arcjet protection SHALL remain unchanged.

**Validates: Requirements 3.3, 3.9, 3.10, 3.11, 3.12**

## Fix Implementation

### Changes Required

#### Priority 1: Systemic SQL Parameterization Fix

**File**: `lib/queries.ts`
**Function**: `ApplicationQueries.update()`
**Root Cause**: Line ~1247 uses `` `${field} = ${paramIndex}` `` producing `field = 2` instead of `field = $2`
**Fix**: Change to `` `${field} = $${paramIndex}` ``
**Addresses**: Requirements 1.8, 1.10, 1.11, 1.12

---

**File**: `api-src/applications.ts`
**Function**: `handleCreate()`
**Root Cause**: Line ~289 uses `` `${i + 1}` `` in VALUES placeholders producing `1, 2, 3` instead of `$1, $2, $3`
**Fix**: Change to `` `$${i + 1}` ``
**Addresses**: Requirements 1.10 (application creation)

---

**File**: `api-src/applications.ts`
**Function**: `handleDetails()`
**Root Cause**: Lines ~335-395 use `` `a.user_id = ${paramIndex}` ``, `` `a.status = ${paramIndex}` ``, etc. and `` LIMIT ${paramIndex} OFFSET ${paramIndex + 1} `` — all missing `$` prefix
**Fix**: Add `$` prefix to all dynamic parameter references: `` `a.user_id = $${paramIndex}` ``, `` LIMIT $${paramIndex} OFFSET $${paramIndex + 1} ``
**Addresses**: Requirements 1.8, 2.24 (admin pagination/count)

---

**File**: `api-src/applications.ts`
**Function**: `handleExport()`
**Root Cause**: Same `${paramIndex}` bug in all filter conditions and LIMIT/OFFSET
**Fix**: Add `$` prefix to all dynamic parameter references
**Addresses**: Requirements 1.25 (admin export)

---

**File**: `api-src/applications.ts`
**Function**: `handleById()` — `reschedule_interview` action
**Root Cause**: Lines ~1230+ use `` `mode = ${pIdx}` ``, `` `location = ${pIdx}` ``, `` WHERE id = ${pIdx} `` — missing `$` prefix
**Fix**: Add `$` prefix: `` `mode = $${pIdx}` ``
**Addresses**: Interview rescheduling

---

**File**: `api-src/auth.ts`
**Function**: `handleProfile()` PATCH branch
**Root Cause**: Line ~1224 uses `` `${field} = ${index + 1}` `` and `` WHERE id = ${providedFields.length + 1} `` — missing `$` prefix
**Fix**: Change to `` `${field} = $${index + 1}` `` and `` WHERE id = $${providedFields.length + 1} ``
**Addresses**: Requirements 1.3 (profile 500 on PATCH), 1.16 (profile update)

#### Priority 2: Auth CSRF Exemption Fix

**File**: `api-src/auth.ts`
**Function**: `handler()` — CSRF exempt actions list
**Root Cause**: Line ~83, `csrfExemptActions` array does not include `'refresh'`
**Fix**: Add `'refresh'` to the `csrfExemptActions` array: `const csrfExemptActions = ['login', 'register', 'forgot-password', 'reset-password', 'password-reset-request', 'password-reset', 'refresh'];`
**Addresses**: Requirements 1.1, 1.2 (post-login skeleton loading, refresh 403)

#### Priority 3: CSP Inline Script Fix

**File**: `vercel.json`
**Root Cause**: CSP `script-src 'self'` blocks the inline `<script>` in `index.html`
**Fix Option A (Preferred)**: Remove the inline script from `index.html` entirely — it's a console error suppressor for browser extension noise, not critical functionality. This is the cleanest fix.
**Fix Option B**: Add the SHA-256 hash of the inline script to the CSP: `script-src 'self' 'sha256-{hash}'`
**Addresses**: Requirements 1.5

#### Priority 4: Missing email-slip Action

**File**: `api-src/applications.ts`
**Function**: `handler()` switch and new `handleEmailSlip()` function
**Root Cause**: No case for `'email-slip'` action in the handler switch
**Fix**: Add `if (action === 'email-slip') return await handleEmailSlip(req, res, user.userId, isAdmin);` and implement `handleEmailSlip()` that fetches the application, generates/retrieves the slip, and sends it via the email queue
**Addresses**: Requirements 1.14

#### Priority 5: Document Upload Resilience

**File**: `api-src/documents.ts`
**Function**: `handleUpload()`
**Root Cause**: Upload fails with 500/503 when R2 storage is not configured. Additionally, slip generation flow may be blocked by CSRF.
**Fix**:
1. Ensure R2 environment variables (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) are set in Vercel dashboard
2. If R2 is intentionally not available, add a database-only fallback that stores document metadata with a base64 data URL or external storage reference
3. For slip upload CSRF issue: the slip generation is a frontend-initiated flow that should already have a CSRF token — verify the frontend is sending the `X-CSRF-Token` header on document upload requests
**Addresses**: Requirements 1.6, 1.6a, 1.7

#### Priority 6: Frontend Data Flow Fixes

**File**: `src/hooks/useAutoSave.ts`
**Root Cause**: The `onSave` callback saves to localStorage but the application wizard may not be passing an `onSave` that calls the API, or the API call fails due to the SQL bug (Priority 1 fix will resolve the API side)
**Fix**: Verify the application wizard passes an `onSave` callback that calls `PUT /api/applications?id=xxx` with the current form data. After the SQL fix, this should work.
**Addresses**: Requirements 1.19

---

**File**: `src/hooks/useProfileAutoPopulation.ts` and `src/lib/profileFieldMapping.ts`
**Root Cause**: Profile completion calculation may not account for all fields populated during registration, or the `user_metadata` from the old Supabase auth is no longer populated (custom JWT auth stores data in `profiles` table directly)
**Fix**: Ensure `calculateCanonicalProfileCompletion()` uses the `profiles` table data (from `useProfileQuery`) as the primary source, not `user_metadata`. The registration flow in `handleRegister()` already writes `first_name`, `last_name`, `phone`, `sex`, `date_of_birth`, `residence_town`, `country` to the `profiles` table.
**Addresses**: Requirements 1.16, 1.17

---

**File**: `src/pages/student/Dashboard.tsx` (or equivalent)
**Root Cause**: Progress stats show hardcoded/incorrect values like "932h avg time", "31 completed", "0 in progress"
**Fix**: Replace hardcoded stats with actual data from the `GET /api/applications?action=stats` endpoint (which will work after the SQL fix)
**Addresses**: Requirements 1.20

---

**File**: Session date formatting
**Root Cause**: ISO timestamps like `"1994-09-08T00:00:00.000Z"` are passed directly to date inputs expecting `yyyy-MM-dd` format
**Fix**: Apply `normalizeDateInputValue()` (already exists in `profileFieldMapping.ts`) to all date values before setting them on date input fields
**Addresses**: Requirements 1.15

#### Priority 7: UI/UX Fixes

**File**: `src/pages/student/applicationWizard/` (education step)
**Root Cause**: Add subject button is above the subject list instead of below
**Fix**: Move the "Add Subject" button to render after the subject list, and auto-scroll to the new subject form
**Addresses**: Requirements 1.26

---

**File**: `src/components/` (slip popup)
**Root Cause**: "Generating application slip" popup doesn't close on X click
**Fix**: Ensure the close handler sets the visibility state to false and clears any pending generation state
**Addresses**: Requirements 1.23

---

**Files**: Various component files for UI alignment
**Root Cause**: CSS/Tailwind class issues — oversaturated colors, misaligned forms, broken collapsed sidebar
**Fix**: Audit and adjust Tailwind classes for color balance, form alignment, sidebar collapsed state, and mobile responsiveness
**Addresses**: Requirements 1.26-1.32

#### Priority 8: Admin Page Fixes

**File**: `src/pages/admin/` (users, institutions, audit, settings pages)
**Root Cause**: These pages have incomplete implementations — role management doesn't save, institution CRUD is missing, audit page doesn't show current data, settings page has placeholder text
**Fix**: Implement the missing CRUD operations using the existing API endpoints (which will work after the SQL fix). For institutions, the `api-src/catalog.ts` already has `createInstitution`, `updateInstitution`, `deleteInstitution` handlers.
**Addresses**: Requirements 1.33-1.36

#### Priority 9: PWA Fixes

**File**: `public/manifest.json`
**Root Cause**: Manifest references SVG icons which may not be supported by all browsers for PWA install. Screenshots are declared but may not exist at the paths.
**Fix**:
1. Remove SVG icon entries from manifest — keep only PNG icons (which exist and are more universally supported)
2. Verify screenshot files exist at declared paths (they do exist at `public/screenshots/`)
3. The `useInstallPrompt` hook code is correct — it properly captures `beforeinstallprompt` and calls `prompt()` on user interaction
**Addresses**: Requirements 1.37, 1.38, 1.39

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the SQL parameterization bug and CSRF refresh bug BEFORE implementing fixes. Confirm the root cause analysis.

**Test Plan**: Write unit tests that call the query builder functions and assert the generated SQL contains `$N` parameter placeholders. Write integration tests that simulate the refresh flow with and without CSRF tokens.

**Test Cases**:
1. **ApplicationQueries.update SQL Test**: Call `ApplicationQueries.update('id', {status: 'draft'})` and assert the generated SQL contains `$2` not bare `2` (will fail on unfixed code)
2. **handleCreate Placeholders Test**: Verify the INSERT VALUES clause contains `$1, $2, $3` not `1, 2, 3` (will fail on unfixed code)
3. **handleDetails Filter Test**: Verify filter conditions contain `$1`, `$2` parameter references (will fail on unfixed code)
4. **Auth Refresh CSRF Test**: Simulate POST to `auth?action=refresh` without CSRF token and verify it succeeds with valid refresh token (will fail on unfixed code — returns 403)
5. **Profile PATCH SQL Test**: Verify the UPDATE SET clause contains `$1`, `$2` parameter references (will fail on unfixed code)

**Expected Counterexamples**:
- Query text contains `field = 2` instead of `field = $2`
- Refresh endpoint returns 403 CSRF_VALIDATION_FAILED instead of 200
- Profile PATCH returns 500 due to invalid SQL

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedEndpoint(input)
  ASSERT result.status IN [200, 201]
  ASSERT result.body.success = true
  IF input involves SQL query THEN
    ASSERT generatedSQL contains '$' + paramIndex (not bare paramIndex)
  END IF
  IF input is refresh request THEN
    ASSERT result.headers['Set-Cookie'] contains new access and refresh tokens
    ASSERT result.headers['X-CSRF-Token'] is present
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT fixedEndpoint(input) = originalEndpoint(input)
END FOR
```

**Testing Approach**: Property-based testing with fast-check is recommended for preservation checking because:
- It generates many random inputs to verify SQL query builders produce valid parameterized queries
- It catches edge cases in dynamic query building (empty filter sets, all filters set, special characters)
- It provides strong guarantees that static queries (findById, checkOwnership, delete) remain unchanged

**Test Plan**: Observe behavior on UNFIXED code first for static queries and non-affected endpoints, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Static Query Preservation**: Verify `ApplicationQueries.findById()`, `checkOwnership()`, `delete()` produce identical SQL before and after fix
2. **Auth Flow Preservation**: Verify login, register, logout, session endpoints continue to work identically
3. **CSRF Enforcement Preservation**: Verify CSRF is still enforced on all non-exempt state-changing endpoints
4. **Arcjet Protection Preservation**: Verify security middleware continues to function

### Unit Tests

- Test all dynamic query builders in `lib/queries.ts` produce valid `$N` parameterized SQL
- Test `handleProfile` PATCH generates correct UPDATE SQL with `$N` placeholders
- Test `handleCreate` generates correct INSERT SQL with `$N` placeholders
- Test `handleDetails` generates correct WHERE/LIMIT/OFFSET SQL with `$N` placeholders
- Test `handleExport` generates correct filter SQL with `$N` placeholders
- Test CSRF exempt actions list includes `'refresh'`
- Test CSP header includes script hash or inline script is removed

### Property-Based Tests

- Generate random subsets of `allowedFields` for `ApplicationQueries.update()` and verify all generated SQL contains `$N` placeholders with correct indices
- Generate random filter combinations for `handleDetails` and verify all conditions use `$N` placeholders
- Generate random profile update field sets and verify the PATCH SQL uses `$N` placeholders
- Generate random application data and verify `handleCreate` INSERT uses `$N` placeholders
- Generate random non-exempt actions and verify CSRF is enforced; generate exempt actions and verify CSRF is skipped

### Integration Tests

- Test full login → refresh → profile fetch flow end-to-end
- Test application create → update → delete lifecycle
- Test admin application listing with pagination and filters
- Test document upload with valid file and CSRF token
- Test catalog programs listing returns valid data
