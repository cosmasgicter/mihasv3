# Platform Stabilization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stabilize the MIHAS student and admin experience across auth, drafts, uploads, payments, notifications, catalog data, and admin operations using verified root-cause fixes.

**Architecture:** The remediation is organized around shared failure domains rather than per-screen patching. Fix the canonical data contracts first (draft ids, profile field mapping, upload payloads, catalog joins), then layer payment-state behavior and admin surface repairs on top of the corrected contracts.

**Tech Stack:** React 18, Vite, TypeScript, TanStack Query, Vercel serverless APIs, Neon Postgres, Vitest, Playwright

---

### Task 1: Establish Durable Handoff Docs

**Files:**
- Create: `docs/requirements/2026-03-07-manual-remediation-requirements.md`
- Create: `docs/design/2026-03-07-manual-remediation-design.md`
- Create: `docs/reports/2026-03-07-manual-remediation-status.md`

**Step 1: Write the documentation skeleton**

Add issue groups, root causes, current status, blockers, and next actions.

**Step 2: Save current findings**

Record confirmed root causes:

- draft deletion by `userId`
- HTML date input mismatch
- profile completion field mismatch
- upload payload contract mismatch
- catalog program/institution join gap
- missing phone in notification preferences
- admin communication history stub

**Step 3: Update after each implementation cluster**

Append:

- files changed
- tests run
- passed/failed verification
- remaining work

**Step 4: Verify docs exist**

Run: `rg --files docs | rg '2026-03-07-(manual-remediation-requirements|manual-remediation-design|manual-remediation-status)|2026-03-07-platform-stabilization'`
Expected: four matching files

### Task 2: Fix Profile Mapping and Date Normalization

**Files:**
- Modify: `src/hooks/useProfileAutoPopulation.ts`
- Modify: `src/pages/student/Settings.tsx`
- Modify: `src/pages/student/applicationWizard/hooks/useWizardController.ts`
- Test: `tests/unit/profileFieldMapping.test.ts`

**Step 1: Write the failing test**

Cover:

- ISO datetime converts to `yyyy-MM-dd`
- profile completion reaches `100` when all canonical fields are present
- `residence_town` is preferred over legacy `city/address`

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/profileFieldMapping.test.ts`
Expected: FAIL on missing normalization helpers / wrong completion math

**Step 3: Write minimal implementation**

- add canonical field normalization helpers
- use normalized date values in settings and wizard hydration
- update completion calculation to canonical student fields

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/profileFieldMapping.test.ts`
Expected: PASS

### Task 3: Fix Draft Delete/Clear Semantics

**Files:**
- Modify: `src/lib/applicationSession.ts`
- Modify: `src/lib/draftManager.ts`
- Modify: `src/components/application/ContinueApplication.tsx`
- Modify: `src/hooks/useDraftManager.ts`
- Test: `tests/unit/applicationSessionDrafts.test.ts`

**Step 1: Write the failing test**

Cover:

- deleting a draft enumerates draft applications for the user and deletes by application id
- deleting drafts does not call `/applications?id=<userId>`
- local draft storage is cleared

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/applicationSessionDrafts.test.ts`
Expected: FAIL because current code deletes by user id

**Step 3: Write minimal implementation**

- look up user draft applications through `applicationService.list({ mine: true, status: 'draft' })`
- delete returned application ids
- preserve local cleanup and draft-cleared events

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/applicationSessionDrafts.test.ts`
Expected: PASS

### Task 4: Fix Upload Contract and Retry Behavior

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `src/services/documents.ts`
- Modify: `src/services/client.ts`
- Test: `tests/unit/documentUploadPayload.test.ts`

**Step 1: Write the failing test**

Cover:

- upload helpers convert files to base64 and post JSON payloads expected by the documents API
- API client does not force `application/json` on `FormData`

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/documentUploadPayload.test.ts`
Expected: FAIL against current multipart-only upload implementation

**Step 3: Write minimal implementation**

- reuse `fileToBase64`
- send `file`, `fileName`, `contentType`, `applicationId`, `documentType`
- keep upload error messages explicit

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/documentUploadPayload.test.ts`
Expected: PASS

### Task 5: Fix Catalog Program/Institution Contract

**Files:**
- Modify: `api-src/catalog.ts`
- Modify: `src/services/catalog.ts`
- Modify: `src/pages/student/applicationWizard/hooks/useWizardController.ts`
- Test: `tests/unit/catalogProgramInstitution.test.ts`

**Step 1: Write the failing test**

Cover:

- program list exposes `institution_id` and joined institution details
- program create/update include `institution_id`
- wizard can derive institution label from selected program deterministically

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/catalogProgramInstitution.test.ts`
Expected: FAIL because current catalog read/write handlers drop institution linkage

**Step 3: Write minimal implementation**

- join `programs` to `institutions` in list/read
- persist `institution_id` in create/update
- preserve backward-compatible fields used by the UI

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/catalogProgramInstitution.test.ts`
Expected: PASS

### Task 6: Fix Notification Contact Data and Communication History

**Files:**
- Modify: `api-src/notifications.ts`
- Modify: `src/pages/student/NotificationSettings.tsx`
- Modify: `src/components/admin/CommunicationHistory.tsx`
- Test: `tests/unit/notificationPreferences.test.ts`

**Step 1: Write the failing test**

Cover:

- canonical preferences include profile phone/email
- student settings renders current phone number when present
- communication history stops returning a hardcoded stub

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/notificationPreferences.test.ts`
Expected: FAIL because preferences omit phone and communication history is stubbed

**Step 3: Write minimal implementation**

- join preferences with profile contact fields
- replace stubbed history loader with API-backed query or explicit temporary fallback messaging tied to real data absence

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/notificationPreferences.test.ts`
Expected: PASS

### Task 7: Add Pay-Later Payment State

**Files:**
- Modify: `src/pages/student/applicationWizard/steps/PaymentStep.tsx`
- Modify: `src/pages/student/applicationWizard/hooks/useWizardController.ts`
- Modify: `src/pages/student/Payment.tsx`
- Modify: `api-src/applications.ts`
- Modify: `lib/validation/applications.ts`
- Test: `tests/unit/payLaterFlow.test.ts`

**Step 1: Write the failing test**

Cover:

- wizard allows `pay_later` without proof upload
- submitted application enters an unpaid/pending-payment state
- payments page lists the application for later completion

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/payLaterFlow.test.ts`
Expected: FAIL because current flow hard-requires proof of payment

**Step 3: Write minimal implementation**

- add pay mode selector
- gate proof upload only for `pay_now`
- keep admin approval blocked until verified payment

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/payLaterFlow.test.ts`
Expected: PASS

### Task 8: Verify and Update Status Tracker

**Files:**
- Modify: `docs/reports/2026-03-07-manual-remediation-status.md`

**Step 1: Run focused verification**

Run:

- `bunx vitest run tests/unit/profileFieldMapping.test.ts tests/unit/applicationSessionDrafts.test.ts tests/unit/documentUploadPayload.test.ts tests/unit/catalogProgramInstitution.test.ts`
- `bun run type-check`

Expected: all targeted tests pass, type-check exits 0

**Step 2: Run broader regression verification**

Run: `bun run test`
Expected: repository test suite passes or remaining failures are documented exactly

**Step 3: Update the status report**

Record:

- completed tasks
- files changed
- verification evidence
- remaining issues not yet fixed

**Step 4: Commit**

```bash
git add docs/requirements/2026-03-07-manual-remediation-requirements.md docs/design/2026-03-07-manual-remediation-design.md docs/plans/2026-03-07-platform-stabilization.md docs/reports/2026-03-07-manual-remediation-status.md
git commit -m "docs: add platform stabilization remediation plan"
```
