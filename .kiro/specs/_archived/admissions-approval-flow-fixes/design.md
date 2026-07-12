# Admissions Approval Flow Fixes — Bugfix Design

## Overview

This design addresses five bugs across the admissions approval flow: (1) fragile `update_fields` pattern in condition verification, (2) missing UI for unhandled application statuses in the admin panel, (3) dead `VITE_PAYMENT_DEV_BYPASS` env var with no frontend wiring, (4) auth recovery in `useAutoSave` not triggering an immediate cloud save for dirty data, and (5) `review_started_at` being set on student self-submit instead of only on actual admin review transitions. Each fix is minimal and scoped to avoid regressions in adjacent flows.

## Glossary

- **Bug_Condition (C)**: The specific input/state combination that triggers each bug
- **Property (P)**: The desired correct behavior when the bug condition holds
- **Preservation**: Existing behavior that must remain unchanged after the fix
- **`verify_condition()`**: Method in `ConditionManager` (`condition_manager.py`) that marks a condition as `met` or `waived`
- **`ApplicationApprovalActions`**: React component rendering admin status controls for an application
- **`PaymentDevBypassView`**: Backend endpoint (`POST /api/v1/payments/dev-bypass/`) that simulates a successful payment in dev mode
- **`useAutoSave`**: React hook managing 8-second auto-save with localStorage fallback and cloud sync
- **`transition_application_status()`**: Service function in `services.py` that enforces the state machine and records history
- **`review_started_at`**: Timestamp on `Application` model intended to track when admin review actually began

## Bug Details

### Bug 1 — condition_manager.py verify_condition() update_fields

The bug manifests on every `verify_condition()` call. The code assigns `condition.verified_by_id = admin_id` (the DB column attribute) but lists `"verified_by"` (the Django field name) in `update_fields`. Django resolves FK fields correctly so this works, but the pattern is fragile. More critically, `"updated_at"` is in `update_fields` relying on `auto_now=True` on an unmanaged model — this works at the ORM level but is brittle because `auto_now` fields are only set by Django's `Model.save()`, not by raw SQL or bulk operations, and the explicit `update_fields` list could mask issues if the model definition changes.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug1(input)
  INPUT: input of type { condition_id, admin_id, target_status }
  OUTPUT: boolean

  RETURN input.target_status IN {"met", "waived"}
         AND condition(input.condition_id).status = "pending"
END FUNCTION
```

### Examples

- Admin verifies condition as "met" → `verified_by_id` is set, `updated_at` relies on `auto_now=True` rather than explicit assignment — works but fragile
- Admin verifies condition as "waived" → same pattern, `updated_at` not explicitly set before save
- Condition is not pending → `ConditionError` raised (unaffected by bug)

### Bug 2 — ApplicationApprovalActions missing status handling

The bug manifests when an admin views an application with status `conditionally_approved`, `waitlisted`, `enrolled`, `withdrawn`, `expired`, or `enrollment_expired`. The component only has render branches for `draft`, `submitted`, `under_review`, `approved`, and `rejected` — all other statuses render an empty controls area.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug2(input)
  INPUT: input of type { application_status }
  OUTPUT: boolean

  RETURN input.application_status IN {
    "conditionally_approved", "waitlisted", "enrolled",
    "withdrawn", "expired", "enrollment_expired"
  }
END FUNCTION
```

### Examples

- `conditionally_approved` application → empty status controls, no way to approve/reject/view conditions
- `waitlisted` application → no status badge, no contextual info
- `enrolled` application → blank controls area instead of "Enrolled" badge
- `withdrawn` application → no indication of terminal status

### Bug 3 — Payment dev bypass not wired in frontend

The bug manifests when a developer runs locally with `VITE_PAYMENT_DEV_BYPASS=true`. The `PaymentStep.tsx` component has zero references to this env var. The backend `PaymentDevBypassView` exists and works, but the frontend never calls it.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug3(input)
  INPUT: input of type { isDev, devBypassEnabled, paymentSettled }
  OUTPUT: boolean

  RETURN input.isDev = true
         AND input.devBypassEnabled = true
         AND input.paymentSettled = false
END FUNCTION
```

### Examples

- Dev mode + `VITE_PAYMENT_DEV_BYPASS=true` + payment not settled → no bypass button rendered
- Dev mode + `VITE_PAYMENT_DEV_BYPASS=false` → correctly no bypass (but currently no bypass regardless)
- Production mode → correctly no bypass (unaffected)

### Bug 4 — useAutoSave auth recovery missing immediate save

The bug manifests when `mihas:auth-recovered` fires after re-authentication. The `handleAuthRecovered` handler resets `authExpiredRef` and calls `processSaveQueue()`, but during auth expiry the hook does not add items to `saveQueue` — it only saves to localStorage. So `processSaveQueue()` finds an empty queue and does nothing. The current dirty form data waits up to 8 seconds for the next auto-save interval.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug4(input)
  INPUT: input of type { authWasExpired, hasDirtyData, saveQueueEmpty }
  OUTPUT: boolean

  RETURN input.authWasExpired = true
         AND input.hasDirtyData = true
         AND input.saveQueueEmpty = true
END FUNCTION
```

### Examples

- Student edits form during expired auth → auth recovers → `processSaveQueue()` runs on empty queue → dirty data not synced for up to 8s
- Student edits form, auth never expired → normal auto-save cycle (unaffected)
- Auth recovers with non-empty save queue → `processSaveQueue()` processes items (partially working, but misses current dirty data)

### Bug 5 — review_started_at set on student self-submit

The bug manifests in `transition_application_status()` which unconditionally sets `review_started_at = timezone.now()` when `review_started_at` is `None`, regardless of the target status. When a student submits (`draft → submitted`), this records the submission time as the review start time.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug5(input)
  INPUT: input of type { old_status, new_status, review_started_at }
  OUTPUT: boolean

  RETURN input.new_status NOT IN {"under_review", "conditionally_approved", "approved", "rejected"}
         AND input.review_started_at IS NULL
END FUNCTION
```

### Examples

- `draft → submitted` with `review_started_at = None` → incorrectly sets `review_started_at` to now
- `submitted → under_review` with `review_started_at = None` → correctly sets `review_started_at` (actual review)
- `under_review → approved` with `review_started_at` already set → correctly preserves existing value

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Condition verification still transitions conditions to `met`/`waived`, sets `met_at`, triggers auto-promotion via `auto_promote_if_all_met()`, and sends notifications
- Non-pending conditions still raise `ConditionError("CONDITION_NOT_PENDING")`
- `ApplicationApprovalActions` for `draft`, `submitted`, `under_review`, `approved`, and `rejected` statuses continues to render exactly as before
- Payment Verify/Reject/Defer dialog flow for `pending_review` payments is unchanged
- Production builds never render a dev bypass button regardless of env vars
- Real Lenco payment flow in `PaymentForm` is completely unaffected
- Auto-save continues at 8-second intervals with change detection, localStorage persistence, and cloud sync
- Offline → online recovery still processes the save queue
- Auth expiry still blocks cloud saves and shows the session-expired message
- `transition_application_status()` continues to enforce `ALLOWED_TRANSITIONS`, create `ApplicationStatusHistory`, set `reviewed_by_id`, `admin_feedback`, `decision_date`, and `updated_at`
- Transitions to `under_review`, `conditionally_approved`, `approved`, `rejected` still set `review_started_at` when it was previously `None`

**Scope:**
All inputs that do NOT match the bug conditions above should be completely unaffected by these fixes.

## Hypothesized Root Cause

### Bug 1 — update_fields fragility

1. **`updated_at` reliance on `auto_now=True`**: The `ApplicationCondition` model has `updated_at = DateTimeField(auto_now=True)` with `managed = False`. While `auto_now` works during `Model.save()`, it's fragile for unmanaged models because there's no DB-level trigger. Explicitly setting `condition.updated_at = timezone.now()` before save is more robust.
2. **`verified_by` vs `verified_by_id` naming**: The code assigns `condition.verified_by_id = admin_id` but lists `"verified_by"` in `update_fields`. Django resolves this correctly for FK fields, so the data persists. The inconsistency is cosmetic but worth noting — no code change needed here since Django handles it.

### Bug 2 — Missing conditional branches

The `ApplicationApprovalActions` component was written before `conditionally_approved`, `waitlisted`, `enrolled`, `withdrawn`, `expired`, and `enrollment_expired` statuses were added to the state machine. No render branches exist for these statuses.

### Bug 3 — Frontend never wired

The backend `PaymentDevBypassView` and the `.env.example` documentation for `VITE_PAYMENT_DEV_BYPASS` were added, but the frontend `PaymentStep.tsx` was never updated to read the env var or render a bypass button.

### Bug 4 — processSaveQueue operates on empty queue

During auth expiry, `saveData()` skips cloud saves (`skipCloudSave = true`) but does NOT add items to `saveQueue`. When auth recovers, `handleAuthRecovered` calls `processSaveQueue()` which checks `saveQueue.length === 0` and returns immediately. The fix needs to trigger `saveData()` directly on auth recovery.

### Bug 5 — Unconditional review_started_at assignment

Line in `transition_application_status()`:
```python
if not application.review_started_at:
    application.review_started_at = timezone.now()
```
This runs for ALL transitions, including `draft → submitted`. It should be gated to only run when `new_status` is an actual review status.

## Correctness Properties

Property 1: Bug Condition — Condition verification explicitly sets updated_at

_For any_ condition verification where the condition is pending and the target status is `met` or `waived`, the fixed `verify_condition()` SHALL explicitly set `condition.updated_at = timezone.now()` before calling `save()`, ensuring the timestamp is persisted independently of `auto_now` behavior.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Condition verification side effects unchanged

_For any_ condition verification call, the fixed `verify_condition()` SHALL produce the same observable side effects as the original: condition status updated, `met_at` set, `verified_by_id` set, auto-promotion triggered, notification sent. Non-pending conditions still raise `ConditionError`.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition — Unhandled statuses render meaningful UI

_For any_ application with status in `{conditionally_approved, waitlisted, enrolled, withdrawn, expired, enrollment_expired}`, the fixed `ApplicationApprovalActions` SHALL render a visible status indicator. For `conditionally_approved`, it SHALL also render action buttons (approve, reject). For terminal/informational statuses, it SHALL render an appropriate badge.

**Validates: Requirements 2.4, 2.5, 2.6**

Property 4: Preservation — Existing status UI unchanged

_For any_ application with status in `{draft, submitted, under_review, approved, rejected}`, the fixed `ApplicationApprovalActions` SHALL produce the same rendered output as the original component.

**Validates: Requirements 3.3, 3.4, 3.5**

Property 5: Bug Condition — Dev bypass button rendered and functional

_For any_ render of `PaymentStep` where `import.meta.env.DEV === true` AND `import.meta.env.VITE_PAYMENT_DEV_BYPASS === 'true'` AND payment is not settled, the fixed component SHALL render a visually distinct dev bypass button that calls `POST /api/v1/payments/dev-bypass/`.

**Validates: Requirements 2.7, 2.8**

Property 6: Preservation — Production payment flow unchanged

_For any_ render of `PaymentStep` where `import.meta.env.DEV === false` OR `VITE_PAYMENT_DEV_BYPASS !== 'true'`, the fixed component SHALL produce the same rendered output as the original, with no bypass button visible.

**Validates: Requirements 2.9, 3.6**

Property 7: Bug Condition — Auth recovery triggers immediate save

_For any_ `mihas:auth-recovered` event where `authExpiredRef` was `true` and the component is mounted, the fixed `useAutoSave` SHALL immediately trigger a full save cycle with the current form data (via `saveData()`), ensuring dirty data is synced to the server without waiting for the next interval.

**Validates: Requirements 2.10, 2.11**

Property 8: Preservation — Normal auto-save and offline recovery unchanged

_For any_ auto-save cycle where auth was never expired, and for any online recovery where the save queue is non-empty, the fixed `useAutoSave` SHALL produce the same behavior as the original hook.

**Validates: Requirements 3.7, 3.8**

Property 9: Bug Condition — review_started_at only set on review transitions

_For any_ call to `transition_application_status()` where `new_status` is NOT in `{under_review, conditionally_approved, approved, rejected}` and `review_started_at` is `None`, the fixed function SHALL NOT set `review_started_at`.

**Validates: Requirements 2.13, 2.14**

Property 10: Preservation — Review transitions still set review_started_at

_For any_ call to `transition_application_status()` where `new_status` IS in `{under_review, conditionally_approved, approved, rejected}` and `review_started_at` is `None`, the fixed function SHALL set `review_started_at = timezone.now()`, preserving existing behavior.

**Validates: Requirements 2.13, 3.9, 3.10**

## Fix Implementation

### Changes Required

**Bug 1 — File: `backend/apps/applications/condition_manager.py`**

**Function:** `verify_condition()`

**Specific Changes:**
1. **Explicitly set `updated_at`**: Add `condition.updated_at = timezone.now()` before the `condition.save()` call, so the timestamp is set independently of `auto_now` behavior
2. **No change to `update_fields` list**: `"verified_by"` in `update_fields` with `verified_by_id` assignment is valid Django FK behavior — no change needed

---

**Bug 2 — File: `apps/admissions/src/components/admin/applications/ApplicationApprovalActions.tsx`**

**Component:** `ApplicationApprovalActions`

**Specific Changes:**
1. **Add `conditionally_approved` block**: Render a "Conditionally Approved" status badge with "Approve" and "Reject" action buttons. The approve button should be gated on `isPaymentVerified` like the `under_review` block.
2. **Add `waitlisted` block**: Render a "Waitlisted" status badge with contextual info. Include "Approve" and "Reject" buttons since `waitlisted → approved` and `waitlisted → rejected` are valid transitions.
3. **Add terminal status blocks**: For `enrolled`, `withdrawn`, `expired`, `enrollment_expired` — render a read-only status badge with appropriate color and icon. No action buttons since these are terminal statuses.

---

**Bug 3 — File: `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`**

**Component:** `PaymentStep`

**Specific Changes:**
1. **Read env var**: Check `import.meta.env.DEV && import.meta.env.VITE_PAYMENT_DEV_BYPASS === 'true'`
2. **Add dev bypass button**: Render a visually distinct button (e.g., dashed orange border, "⚡ Simulate Payment (Dev)") when the condition is met and payment is not settled
3. **Call backend endpoint**: On click, `POST /api/v1/payments/dev-bypass/` with `{ application_id }` via `apiClient.request()`
4. **Update local state**: On success, call `onPaymentStatusChange?.('successful')` to advance the wizard
5. **Guard against production**: The `import.meta.env.DEV` check ensures the button is tree-shaken from production builds

---

**Bug 4 — File: `apps/admissions/src/hooks/useAutoSave.ts`**

**Function:** `handleAuthRecovered` (inside the `useEffect` that sets up event listeners)

**Specific Changes:**
1. **Trigger immediate save**: After resetting `authExpiredRef` and clearing error state, call `saveData()` directly (the internal `saveData`, not `forceSave`) to immediately sync current dirty data to the server
2. **Keep `processSaveQueue()` call**: Still process any queued items (belt and suspenders), but the immediate `saveData()` handles the common case of dirty data with an empty queue

---

**Bug 5 — File: `backend/apps/applications/services.py`**

**Function:** `transition_application_status()`

**Specific Changes:**
1. **Gate `review_started_at` by target status**: Change the unconditional check:
   ```python
   if not application.review_started_at:
       application.review_started_at = timezone.now()
   ```
   to:
   ```python
   if not application.review_started_at and new_status in ("under_review", "conditionally_approved", "approved", "rejected"):
       application.review_started_at = timezone.now()
   ```
   This ensures `review_started_at` is only set when an admin actually begins reviewing, not on student self-submit or other non-review transitions.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing fixes. Confirm or refute the root cause analysis.

**Test Plan**: Write tests that exercise each bug condition on the unfixed code to observe failures.

**Test Cases**:
1. **Bug 1 — updated_at not explicitly set**: Call `verify_condition()` and check whether `updated_at` was explicitly assigned vs relying on `auto_now` (will show fragile pattern on unfixed code)
2. **Bug 2 — Empty UI for conditionally_approved**: Render `ApplicationApprovalActions` with `currentStatus="conditionally_approved"` and assert status controls are present (will fail on unfixed code — empty controls)
3. **Bug 3 — No dev bypass button**: Render `PaymentStep` with dev env vars set and assert bypass button exists (will fail on unfixed code — no button)
4. **Bug 4 — Auth recovery no immediate save**: Simulate auth expiry → form edit → auth recovery → assert cloud save triggered immediately (will fail on unfixed code — waits for interval)
5. **Bug 5 — review_started_at on submit**: Call `transition_application_status(app, "submitted", user_id)` with `review_started_at=None` and assert it remains `None` (will fail on unfixed code — gets set)

**Expected Counterexamples**:
- Bug 2: `queryByRole('button')` returns null for conditionally_approved status
- Bug 5: `application.review_started_at` is not None after `draft → submitted` transition

### Fix Checking

**Goal**: Verify that for all inputs where each bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
// Bug 1
FOR ALL input WHERE isBugCondition_Bug1(input) DO
  result := verify_condition'(input.condition_id, input.target_status, input.admin_id)
  ASSERT result.updated_at IS NOT NULL
  ASSERT result.updated_at was explicitly set (not just auto_now)
  ASSERT result.verified_by_id = input.admin_id
END FOR

// Bug 2
FOR ALL input WHERE isBugCondition_Bug2(input) DO
  rendered := renderApprovalActions'(input)
  ASSERT rendered.hasStatusIndicator = true
  IF input.application_status = "conditionally_approved" THEN
    ASSERT rendered.hasActionButtons = true
  END IF
END FOR

// Bug 3
FOR ALL input WHERE isBugCondition_Bug3(input) DO
  rendered := renderPaymentStep'(input)
  ASSERT rendered.hasDevBypassButton = true
END FOR

// Bug 4
FOR ALL input WHERE isBugCondition_Bug4(input) DO
  result := handleAuthRecovered'(input)
  ASSERT result.immediateSaveTriggered = true
END FOR

// Bug 5
FOR ALL input WHERE isBugCondition_Bug5(input) DO
  result := transition_application_status'(app, input.new_status, changed_by)
  ASSERT result.application.review_started_at IS NULL
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
// Bug 1
FOR ALL input WHERE NOT isBugCondition_Bug1(input) DO
  ASSERT verify_condition(input) = verify_condition'(input)
END FOR

// Bug 2
FOR ALL input WHERE NOT isBugCondition_Bug2(input) DO
  ASSERT renderApprovalActions(input) = renderApprovalActions'(input)
END FOR

// Bug 3
FOR ALL input WHERE NOT isBugCondition_Bug3(input) DO
  ASSERT renderPaymentStep(input) = renderPaymentStep'(input)
END FOR

// Bug 4
FOR ALL input WHERE NOT isBugCondition_Bug4(input) DO
  ASSERT handleAuthRecovered(input) = handleAuthRecovered'(input)
END FOR

// Bug 5
FOR ALL input WHERE NOT isBugCondition_Bug5(input) DO
  ASSERT transition_application_status(input) = transition_application_status'(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Condition verification preservation**: Verify that non-pending conditions still raise `ConditionError`, auto-promotion still triggers, notifications still fire
2. **Approval actions preservation**: Verify that `draft`, `submitted`, `under_review`, `approved`, `rejected` statuses render identically to before
3. **Payment step preservation**: Verify that production renders and non-bypass dev renders are identical
4. **Auto-save preservation**: Verify that normal 8-second interval saves, offline recovery, and auth-never-expired flows work identically
5. **Status transition preservation**: Verify that `under_review`, `conditionally_approved`, `approved`, `rejected` transitions still set `review_started_at` when null

### Unit Tests

- Bug 1: Test `verify_condition()` explicitly sets `updated_at` before save for `met` and `waived` statuses
- Bug 1: Test non-pending conditions still raise `ConditionError`
- Bug 2: Test each new status renders a status indicator (conditionally_approved, waitlisted, enrolled, withdrawn, expired, enrollment_expired)
- Bug 2: Test conditionally_approved renders approve/reject buttons
- Bug 3: Test dev bypass button renders when env conditions are met
- Bug 3: Test dev bypass button does NOT render in production mode
- Bug 3: Test dev bypass click calls the correct endpoint and updates status
- Bug 4: Test auth recovery triggers immediate `saveData()` call
- Bug 5: Test `draft → submitted` does NOT set `review_started_at`
- Bug 5: Test `submitted → under_review` DOES set `review_started_at`

### Property-Based Tests

- Generate random condition statuses and verify only pending conditions can be verified (preservation)
- Generate random application statuses and verify the component renders a non-empty status section for all valid statuses (fix validation)
- Generate random `{isDev, devBypassEnabled, paymentSettled}` tuples and verify bypass button visibility matches the bug condition (fix + preservation)
- Generate random status transitions from `ALLOWED_TRANSITIONS` and verify `review_started_at` is only set for review statuses (fix + preservation)

### Integration Tests

- Full condition verification flow: assign conditions → verify each → auto-promote to approved
- Admin panel: navigate through applications in each status and verify controls render
- Dev payment bypass: click bypass → verify wizard advances to next step
- Auto-save auth recovery: simulate auth expiry → edit form → recover auth → verify data synced
- Status transition chain: `draft → submitted → under_review → approved` and verify `review_started_at` is set only at the `under_review` transition
