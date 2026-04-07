# Implementation Plan

- [x] 1. Write bug condition exploration tests (BEFORE implementing fix)
  - **Property 1: Bug Condition** — JWTUser→Profile Type Mismatch in CSRF Token Generation and Logout
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the `ValueError` when `JWTUser` is passed to FK fields
  - **Scoped PBT Approach**: Construct a `JWTUser` from a JWT-like payload (random UUID, email, role) and pass it to `_generate_csrf_token()` — assert it returns a valid hex token string and a `CSRFToken` row exists for that user ID
  - **Test file**: `backend/tests/property/test_csrf_bug_condition.py`
  - **Test cases**:
    - Call `_generate_csrf_token(JWTUser({user_id: uuid, email, role}))` — on unfixed code this raises `ValueError: Cannot assign "<JWTUser>": "CSRFToken.user" must be a "Profile" instance`
    - Call `CSRFToken.objects.filter(user=JWTUser(...)).delete()` — on unfixed code this raises `ValueError` for the same FK reason
    - Use `hypothesis` with `st.uuids()` and `st.emails()` to generate random JWTUser payloads
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bug exists in both `_generate_csrf_token` and `LogoutView` CSRF deletion)
  - Document counterexamples found (e.g., `ValueError` with specific UUID/email combinations)
  - Mark task complete when tests are written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Profile-Based CSRF Token Generation Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Test file**: `backend/tests/property/test_csrf_preservation.py`
  - Observe: `_generate_csrf_token(Profile(...))` returns a valid 64-char hex token and creates a `CSRFToken` row on unfixed code (this is the `LoginView`/`RefreshView` path that already works)
  - Observe: `CSRFToken.objects.filter(user_id=profile.id)` correctly finds tokens created for a `Profile` instance
  - Write property-based tests with `hypothesis`:
    - For all `Profile` instances (random UUID, email, role), `_generate_csrf_token(profile)` returns a 64-char hex string and `CSRFToken.objects.filter(user_id=profile.id).exists()` is `True`
    - For all `Profile` instances, creating then filtering/deleting CSRF tokens by `user_id` works correctly
  - Verify tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - **EXPECTED OUTCOME**: Tests PASS (Profile-typed inputs already work correctly)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Backend CSRF fixes — resolve JWTUser→Profile type mismatch

  - [x] 3.1 Fix `_generate_csrf_token(user)` to resolve JWTUser to Profile
    - In `backend/apps/accounts/views.py`, add a type check at the top of `_generate_csrf_token`
    - If `user` is not a `Profile` instance, resolve via `Profile.objects.get(id=user.id)`
    - If `user` is already a `Profile`, pass through unchanged
    - This fixes `SessionView.get` which passes `JWTUser` from `request.user`
    - `LoginView` and `RefreshView` already pass `Profile` instances — they must continue to work
    - _Bug_Condition: isBugCondition(request, codePath) where user IS INSTANCE OF JWTUser AND codePath == "SessionView.get" AND _generate_csrf_token CALLED WITH user DIRECTLY_
    - _Expected_Behavior: _generate_csrf_token resolves JWTUser to Profile via Profile.objects.get(id=user.id), creates CSRFToken row, returns valid raw token string_
    - _Preservation: LoginView.post and RefreshView.post continue to call _generate_csrf_token with Profile instances and get identical results_
    - _Requirements: 2.1, 2.3, 2.4, 1.1, 1.3, 1.4, 3.1, 3.2_

  - [x] 3.2 Fix `LogoutView.post` CSRF token deletion to use `user_id`
    - In `backend/apps/accounts/views.py`, change `CSRFToken.objects.filter(user=request.user).delete()` to `CSRFToken.objects.filter(user_id=request.user.id).delete()`
    - This bypasses Django's FK instance check by using the raw UUID directly
    - _Bug_Condition: isBugCondition(request, codePath) where user IS INSTANCE OF JWTUser AND codePath == "LogoutView.post" AND CSRFToken.objects.filter(user=user) CALLED DIRECTLY_
    - _Expected_Behavior: CSRFToken.objects.filter(user_id=request.user.id).delete() succeeds, returns HTTP 200_
    - _Preservation: Cookie clear logic, device session deactivation, and JTI blacklisting remain unchanged_
    - _Requirements: 2.2, 1.2_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** — JWTUser CSRF Operations Succeed After Fix
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (valid token returned, CSRFToken row created)
    - When this test passes, it confirms the `JWTUser`→`Profile` resolution works for all generated inputs
    - Run `cd backend && python3 -m pytest tests/property/test_csrf_bug_condition.py -v`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** — Profile-Based CSRF Token Generation Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `cd backend && python3 -m pytest tests/property/test_csrf_preservation.py -v`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions for LoginView/RefreshView paths)
    - Confirm all Profile-typed CSRF operations produce identical results after fix
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Frontend fix — strip `_cache_reset` query param after reset acknowledged

  - [x] 4.1 Clean up URL in `runOneTimeRuntimeCacheReset()` early-return path
    - In `apps/admissions/src/main.tsx`, in the early-return branch where `localStorage.getItem(CACHE_RESET_STORAGE_KEY) === CACHE_RESET_VERSION`
    - Check if `_cache_reset` query param exists in the current URL
    - If present, remove it using `const url = new URL(window.location.href); url.searchParams.delete('_cache_reset'); window.history.replaceState({}, '', url.toString())`
    - This prevents URL pollution visible to visitors after the one-time reset completes
    - _Requirements: 2.5, 3.8_

  - [x] 4.2 Write unit test for URL param cleanup
    - **Test file**: `apps/admissions/tests/unit/cache-reset-url-cleanup.test.ts`
    - Test that when localStorage already has the reset key and URL contains `?_cache_reset=...`, the param is stripped
    - Test that when localStorage already has the reset key and URL has no `_cache_reset` param, nothing changes
    - Test that other query params are preserved when `_cache_reset` is removed
    - Run `cd apps/admissions && bun run test -- --run tests/unit/cache-reset-url-cleanup.test.ts`
    - _Requirements: 2.5, 3.8_

- [x] 5. Frontend fix — harden signOut auth state cleanup

  - [x] 5.1 Explicit session nullification before `queryClient.clear()` in signOut
    - In `apps/admissions/src/hooks/auth/useSessionListener.ts`, in the `signOut` callback
    - Before `queryClient.clear()`, add `queryClient.setQueryData(['auth', 'session'], null)`
    - Also add `queryClient.setQueryData(['user-profile', undefined], null)` to clear profile cache
    - Remove any `localStorage`/`sessionStorage` keys that carry role-specific state (e.g., `mihas:post-auth-redirect`, `mihas:wizard-auth-redirect-guard`)
    - This prevents stale role routing when a different user logs in on the same browser
    - _Requirements: 2.7, 3.6, 3.7_

  - [x] 5.2 Write unit test for signOut cleanup completeness
    - **Test file**: `apps/admissions/tests/unit/signout-cleanup.test.ts`
    - Test that after signOut, `queryClient.getQueryData(['auth', 'session'])` is `undefined`
    - Test that sessionStorage redirect keys are removed
    - Test that CSRF token is cleared
    - Run `cd apps/admissions && bun run test -- --run tests/unit/signout-cleanup.test.ts`
    - _Requirements: 2.7_

- [x] 6. Investigation — Application wizard 400 errors
  - Investigate `ApplicationCreateSerializer` field expectations vs. what the wizard sends
  - Check `POST /api/v1/applications/` request payload from the wizard against serializer `required` fields
  - Document findings: which fields are missing or mismatched
  - This is a separate issue from the CSRF/session bug — scope as investigation only
  - If a fix is straightforward, propose it; otherwise create a follow-up ticket
  - _Requirements: 2.6, 1.6_

  **Investigation Findings (completed — verified against source code):**

  **Summary:** No missing required fields. The wizard sends all fields the serializer expects. The 400 errors are most likely caused by catalog validation failures — specifically the intake `displayName` vs. DB `name` mismatch.

  **Serializer required fields vs. wizard payload:**
  | Serializer Field | Required | Wizard Sends | Match |
  |-----------------|----------|-------------|-------|
  | `full_name` | Yes | ✅ | OK |
  | `date_of_birth` | Yes | ✅ | OK |
  | `sex` | Yes (`male`/`female`) | ✅ (lowercased before send) | OK |
  | `phone` | Yes | ✅ | OK |
  | `email` | Yes | ✅ | OK |
  | `residence_town` | Yes | ✅ | OK |
  | `program` | Yes (validated against catalog) | ✅ (sends `program.name` via `resolveProgramIdentity`) | OK — program uses DB `name` directly |
  | `intake` | Yes (validated against catalog) | ⚠️ (sends `displayName` via `resolveIntakeIdentity`) | **MISMATCH** — see below |
  | `institution` | Yes (validated against catalog) | ✅ (sends label derived from program institutions) | OK — uses institution `name` |
  | `nrc_number` | No | ✅ | OK |
  | `passport_number` | No | ✅ | OK |
  | `nationality` | No | ✅ | OK |

  **Extra fields sent by wizard (silently ignored by serializer):**
  `application_number`, `public_tracking_code`, `country`, `next_of_kin_name`, `next_of_kin_phone`, `status` — these are not in the serializer and are ignored. The backend generates its own `application_number` and `public_tracking_code`.

  **Root cause candidates for 400 errors (ranked by likelihood):**

  1. **Intake `displayName` vs. DB `name` mismatch (confirmed most likely):**
     - Backend serializer: `Intake.objects.filter(name=value, is_active=True)` — validates against the `name` column in the `intakes` table.
     - Frontend `resolveIntakeIdentity` (line ~267 in `useWizardController.ts`): returns `label: byId.displayName` as the value sent to the backend.
     - Frontend `displayName` construction (line ~329): `displayName = nameWithYear` where `nameWithYear = name + " " + year` if the name doesn't already include the year string.
     - **Concrete example:** If DB has `name="January 2025"` and `year=2025`, the name already includes `"2025"`, so `displayName = "January 2025"` (matches). But if DB has `name="January"` and `year=2025`, then `displayName = "January 2025"` which does NOT match `name="January"` in the DB query.
     - The `buildServerDraftPayload` in `draftAutosave.ts` sends `intake: formData.intake` (the raw form value, which is the `displayName`), while the submission path in `useWizardController.ts` sends `intake: resolvedIntake.label` (also the `displayName`).

  2. **Phone validation:** `validate_zambian_phone` requires exactly `+260` followed by 9 digits. Non-Zambian students entering international numbers (e.g., `+254...` for Kenya) will get a 400 error. This is by design but may be a UX issue for international applicants.

  3. **Sex case sensitivity (low risk):** Both the draft path (`formData.sex?.toLowerCase()`) and submission path (`formData.sex?.toLowerCase()`) lowercase the value. Risk is minimal.

  **Proposed follow-up (separate ticket):**
  - **P1 — Fix intake label resolution:** Change `resolveIntakeIdentity` to return `label: byId.name` (the DB `name`) instead of `label: byId.displayName` for the value sent to the backend. Keep `displayName` for UI display only. Alternatively, change the backend `validate_intake` to also accept by ID: `Intake.objects.filter(Q(name=value) | Q(id=value), is_active=True)`.
  - **P2 — Add server-side logging:** Add `logger.warning(f"Application validation failed: {serializer.errors}")` to `ApplicationListCreateView.post` when `serializer.is_valid()` returns `False`. Currently the 400 response includes `details: serializer.errors` but there's no server-side log to diagnose production failures.
  - **P3 — Consider accepting catalog references by ID:** Accept program/intake/institution by UUID in addition to name, which would eliminate all name-matching fragility. This is a larger change but would be the most robust solution.

- [x] 7. Checkpoint — Ensure all tests pass
  - Run backend test suite: `cd backend && python3 -m pytest tests/property/test_csrf_bug_condition.py tests/property/test_csrf_preservation.py -v`
  - Run frontend test suite: `cd apps/admissions && bun run test -- --run`
  - Ensure all property tests pass (bug condition fixed, preservation intact)
  - Ensure all existing tests still pass (no regressions)
  - Ask the user if questions arise
