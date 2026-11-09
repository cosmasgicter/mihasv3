# Implementation Plan

Order is fixed: exploration tests, preservation tests and the pause on automatic production deploys, P0a fixes one R-group at a time with a checkpoint after each group, the CI journey gate, P0b, and last the production verification task. From task 2.6 until task 6.2 a merge to `main` is not a deploy (DEC-10). Clause numbers refer to `bugfix.md`; section names refer to `design.md`. Backend tests run against local Postgres only, never the Neon default branch or production.

- [x] 1. Write bug condition exploration tests (BEFORE implementing fixes)
  - **Property 1–10: Bug Condition** - Student Journey Repair Bug Conditions
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate each defect at HEAD `4a6c4ef`
  - Record each counterexample in the subtask when it is first run (for example "retry with a released key returned 409 `DOCUMENT_UPLOAD_IN_PROGRESS`")
  - **MARKERS**: Give every exploration test a strict expected-failure marker as it is written: `@pytest.mark.xfail(strict=True, reason="SJR R<n>: fixed in task <m>")` on each pytest test function, and `it.fails(…)` in Vitest (design "Marker scheme"). CI's blocking suites then stay green while the bug exists, and a test that passes before its fix turns red. Mark only an assertion that fails at HEAD: one that already holds belongs in task 2 (the known ones are 2.2 (h)–(j) and 2.3 (g)), and one fixed in another R-group goes in that group's file with that group's task number. Each test function holds only assertions that fail at HEAD and are fixed in one group. Record the counterexample from a run without the marker (`pytest --runxfail`; in Vitest, before adding `it.fails`)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 1.17, 1.18, 1.19, 1.20, 1.21, 1.22, 1.23, 1.24, 1.25, 1.26, 1.27, 1.28, 1.29, 1.30, 1.31, 1.32, 1.33, 1.34, 1.35, 1.36, 1.37, 1.38, 1.39, 1.43_

  - [x] 1.1 R1 — storage and environment exploration tests
    - **Property 1: Bug Condition** - Storage and Environment Truth
    - `backend/tests/unit/test_startup_env_validation.py`: subprocess start of `config.settings.prod` and `config.settings.staging` with each `S3_*` emptied in turn, other required variables set to placeholders, `PYTEST_CURRENT_TEST` and `TESTING` removed; assert non-zero exit, the variable name in stderr, no placeholder value in stderr
    - `backend/tests/unit/test_documented_env_vars_are_read.py`: the scanner described in design R1-c (sources, readers, allowlist with reasons)
    - `backend/tests/unit/test_storage_settings_contract.py`: `backend/docker-compose.local-test.yml` declares a MinIO service and gives `web` and `celery` `S3_*` values; `S3_SIGNED_URL_TTL_SECONDS` and `S3_PUBLIC_ENDPOINT_URL` parse and are bounded
    - `backend/tests/unit/test_sjr_local_seed_bug_condition.py`: after `harness_seed_tenants`, `FeeResolver` resolves a fee for each seeded offering; the command refuses production settings
    - Run: `cd backend && python3 -m pytest tests/unit/test_startup_env_validation.py tests/unit/test_documented_env_vars_are_read.py tests/unit/test_storage_settings_contract.py tests/unit/test_sjr_local_seed_bug_condition.py -q`
    - **EXPECTED OUTCOME**: Tests FAIL (the process starts with empty `S3_*`; no template; unread names; no MinIO; no fee)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 R2 — upload exploration tests
    - **Property 2: Bug Condition** - Upload Transport and Server Acceptance
    - `backend/tests/integration/test_sjr_upload_bug_conditions.py`: upload with key K while storage fails (stage compensated), then retry with K and working storage → expect 201; a valid PDF declared `application/octet-stream` and a JPEG declared `image/jpg` → expect 201 with the detected MIME type recorded; a malformed `Idempotency-Key` → expect 400 with no echo
    - `apps/admissions/tests/unit/sjrUploadTransport.test.ts`: fake timers and a fake XHR; a transfer reporting progress for 90 s is not aborted; one failure gives at most two POSTs with the same `Idempotency-Key`; progress is determinate; the final message uses the first error's code; `requiredDocumentsService.upload` calls `apiClient.upload`
    - Run: `cd backend && python3 -m pytest tests/integration/test_sjr_upload_bug_conditions.py -q` and `cd apps/admissions && bun run test -- tests/unit/sjrUploadTransport.test.ts`
    - **EXPECTED OUTCOME**: Tests FAIL (409 forever; "Unsupported file type"; abort at 30 s; up to 8 POSTs; no key; no progress)
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11_

  - [x] 1.3 R3 — rate-limit and OCR polling exploration tests
    - **Property 3: Bug Condition** - Client Identity, Budgets and Polling
    - `backend/tests/unit/test_sjr_rate_limit_bug_conditions.py`: with a Docker-network `REMOTE_ADDR` and two distinct `X-Forwarded-For` clients, exhausting client A in each of login, register, document upload, document read and catch-all leaves client B unlimited; with a public `REMOTE_ADDR`, `get_client_ip` returns that address, not the forwarded value (the middleware's main path already ignores it at HEAD, so that half is task 2.2 (j)); an authenticated user's document reads and writes have separate per-user budgets
    - `backend/tests/unit/test_sjr_ocr_pending_bug_condition.py`: extract sets `extraction_state='pending'` and `/info/` reports `ocr_pending`; a broker failure returns 503 `OCR_QUEUE_UNAVAILABLE` and restores the state; the task's no-file path records `ocr_failed`
    - `apps/admissions/tests/unit/sjrOcrPolling.test.ts`: no polling after a rejected extract; stop after one poll when `ocr_state` is null; at most 10 polls on the backoff schedule; `getInfo` called with `retries: 0`; stop on 429
    - `apps/admissions/tests/unit/sjrRateLimitCopy.test.tsx`: `ProgramStep` with a 429 on the programmes query or on the intakes query shows the retry copy, not its empty helper; the dashboard's error string for a rate-limited applications request is the retry copy; client errors expose `retryAfterSeconds`
    - **EXPECTED OUTCOME**: Tests FAIL (shared bucket; `get_client_ip` returns the forged value; no per-user budget; 30 polls with 3 retries each; empty-state copy)
    - _Requirements: 1.12, 1.13, 1.14, 1.15_

  - [x] 1.4 R4 — keys-not-links exploration tests
    - **Property 4: Bug Condition** - Keys, Not Links
    - `backend/tests/integration/test_sjr_document_keys_bug_conditions.py`: after an upload, neither `file_url` nor the snapshot contains `X-Amz-`; the snapshot equals the document id; a 255-character name with spaces and non-ASCII characters returns 201 on the first attempt with the snapshot set; new object keys contain no filename (marker reason `"SJR R4: fixed in task 3.14"`, moved from task 1.5); a legacy-provider `https` URL is returned unchanged; condition evidence and a generated official document persist a key; the document list's `file_url` is freshly signed
    - Same file, with a tenant contract whose identity row is `document_type="nrc"`: an application whose `extra_kyc_url` holds the id of its current `nrc` document lists that document once and no `is_legacy_synthetic` row (the state R4-b and R4-d produce); after the newest of two current identity documents of different types is removed, the list has no synthetic row; a bare-UUID value never reaches signing
    - Run with a short `AWS_QUERYSTRING_EXPIRE` override where expiry matters; storage is mocked at the boto3 boundary
    - A row with only a presigned `file_url` and no `storage_key` already opens through the signed-URL endpoint at HEAD, so it is task 2.2 (h), not an exploration test
    - **EXPECTED OUTCOME**: Tests FAIL (presigned URLs persisted; 500 then a NULL snapshot after replay; legacy URL re-signed as a key; the filename in every key; a phantom "Identity Support Document" row)
    - _Requirements: 1.16, 1.17, 1.18, 1.20, 1.28_

  - [x] 1.5 R5 — viewing exploration tests
    - **Property 5: Bug Condition** - Students Open Their Own Documents
    - `backend/tests/unit/test_sjr_document_access_bug_conditions.py`: a non-owner student gets, from the document list and from the required-documents contract, a 404 whose body is byte-identical to that endpoint's answer for an application id that does not exist; an in-scope assigned reviewer gets 200 from signed-url; an official-document signing failure logs at ERROR and returns `error_code: DOCUMENT_LINK_UNAVAILABLE`; after a status change a student's slip GET returns `ready` with `historical: true`; presign parameters include `ResponseContentDisposition`. An unassigned reviewer already gets the masked 404 at HEAD, so that case is task 2.2 (i); filename-free keys moved to task 1.4, because R4 fixes them
    - `apps/admissions/tests/unit/sjrDocumentViewing.test.tsx`: `DocumentChecklist` lists a custom type and condition evidence from the documents endpoint with View anchors to the opener; the wizard panel shows View for an uploaded requirement; `studentStatus.nav.desktop` is true; the summary says "ready" only for an issued type; the official hook never opens a tab after an await; `DOCUMENT_LINK_UNAVAILABLE` maps to "can't be opened right now"
    - `apps/admissions/tests/unit/sjrDocumentOpen.test.tsx`: the opener validates its query grammar, signs at mount, replaces the location, and renders each error state
    - **EXPECTED OUTCOME**: Tests FAIL (403; reviewer 404; WARNING and no code; `not_requested`; no route; raw links; "ready" for issuable)
    - _Requirements: 1.19, 1.20, 1.21, 1.22, 1.23, 1.24, 1.25, 1.26, 1.27, 1.28_

  - [x] 1.6 R6 — submit, grades and deferral exploration tests
    - **Property 6: Bug Condition** - Submit, Grades and Deferral
    - `apps/admissions/tests/unit/sjrSubmitReadiness.test.ts`: with the assignment resolved and a tenant contract loaded, the Submit handler's readiness equals the button's and the handler calls the submit mutation
    - `apps/admissions/tests/unit/sjrGradesAutosave.test.ts`: with fake adapters, a grade edit schedules a save within the debounce and calls `syncGrades` with partial rows; "Saved" is never derived while grades are pending; the outbox holds pending grades
    - `apps/admissions/tests/unit/sjrPaymentDeferral.test.tsx`: under `<StrictMode>`, deferral enables Next; a server-confirmed deferral clears the payment-recovery entry
    - `backend/tests/unit/test_sjr_grades_partial_bug_condition.py`: `{"grades": [3 rows], "partial": true}` returns 200 and stores 3 rows; a failure midway leaves the previous set intact
    - **EXPECTED OUTCOME**: Tests FAIL ("Assigned school" reported missing; grades ignored by the machine; Next disabled; entry kept; 400 `MINIMUM_SUBJECTS_REQUIRED`)
    - _Requirements: 1.29, 1.30, 1.31, 1.32, 1.33_

  - [x] 1.7 R7 — decision exploration tests (written now, fixed in task 5)
    - **Property 7: Bug Condition** - Decisions and Decision Documents
    - `backend/tests/unit/test_sjr_decision_bug_conditions.py`: `seed_school_admins` grants `review` by default and the seeded admin's review call is not 403; re-running it on a membership the old command created with `[]` adds `review` and emits one event with `permissions_before: []`; `conditionally_approved` without conditions returns 400 `NO_CONDITIONS_PROVIDED`; a letter GET for a tenant with no profile returns `setup_required` with `DOCUMENT_PROFILE_NOT_CONFIGURED`
    - `backend/tests/unit/test_approval_payment_gate_drift_sjr.py`: parses `APPROVAL_PAYMENT_STATUSES` from `apps/admissions/src/lib/paymentStatus.ts` and compares it with `RESOLVED_PAYMENT_STATUSES`
    - `apps/admissions/tests/unit/sjrApprovalGate.test.tsx`: Approve is enabled for `deferred`; Conditional opens a dialog and sends at least one condition
    - `apps/admissions/tests/unit/sjrLetterCopy.test.tsx`: a letter in `setup_required` shows "isn't available yet" with the support contact and no "ready"
    - **EXPECTED OUTCOME**: Tests FAIL (403; zero conditions accepted; `not_requested`; constant missing; Approve disabled; "ready" copy)
    - _Requirements: 1.34, 1.35, 1.36, 1.37_

  - [x] 1.8 R8 — session and phone exploration tests
    - **Property 8: Bug Condition** - Session Continuity and Registration Phone
    - `apps/admissions/tests/unit/sjrSessionRestore.test.tsx`: `StudentRoute` and `AdminRoute` (the guards every non-public route uses), each with an unauthenticated session, call `refreshAuthSession` once, show "Restoring your session" meanwhile, render children after success and redirect after failure. A public route already sends no refresh at HEAD, so that case is task 2.3 (g)
    - `apps/admissions/tests/unit/sjrSignUpPhoneErrors.test.tsx`: a server `details.phone` error marks the phone input `aria-invalid` with `aria-describedby`; the banner contains no `phone:` key and no submitted value
    - `backend/tests/unit/test_sjr_phone_bug_conditions.py`: `09…` and `07…` register and are stored as `+260…`; no message for an invalid phone or NRC contains the input
    - **EXPECTED OUTCOME**: Tests FAIL (immediate redirect; raw key and value in the banner; 400 with the number echoed)
    - _Requirements: 1.38, 1.39_

  - [x] 1.9 R10 — badge exploration test
    - **Property 10: Bug Condition** - Diagnostics Badge
    - `apps/admissions/tests/unit/sjrBuildBadge.test.tsx`: with `import.meta.env.DEV` stubbed false, `BuildVersionBadge` renders nothing, `getBackendBuildVersion` is not called, and neither `AppLayout` nor `SharedFooter` renders the badge's padded wrapper
    - **EXPECTED OUTCOME**: Test FAILS (the badge and its wrappers render, and it probes `/health/live/`)
    - _Requirements: 1.43_

- [ ] 2. Write preservation property tests (BEFORE implementing fixes)
  - **Property 11–13: Preservation** - Student Journey Repair Preservation
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code first
  - **EXPECTED OUTCOME**: Tests PASS on unfixed code (this confirms the baseline to preserve)
  - **NOTE**: Tasks 2.6 and 2.7 are not tests. They pause automatic production deploys before any fix merges, which is how 3.16 holds while `deploy.yml` deploys every green `main` (DEC-10)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17, 3.18, 3.19, 3.20, 3.21, 3.22, 3.23, 3.24_

  - [x] 2.1 Guard the test database host
    - Add a session-scoped autouse fixture in `backend/tests/conftest.py` that aborts before the test database is created when the database host is not loopback, RFC 1918 or a dot-free Docker service name, or contains `neon.tech`, `amazonaws.com` or `beanola.com`
    - Add `backend/tests/unit/test_test_database_host_guard.py` covering each refused and accepted host shape with the fixture's pure helper
    - Confirm CI's database host is accepted by running the unit suite locally with CI's `DATABASE_URL` shape
    - _Requirements: 3.16_

  - [x] 2.2 Backend preservation properties
    - **Property 11: Preservation** - Authority, Payments and Auth
    - **Property 12: Preservation** - Documents and Drafts
    - `backend/tests/property/test_sjr_preservation_properties.py` (hypothesis):
      - (a) for every declared type that is not generic or aliased, crossed with generated byte headers, the upload acceptance and rejection code equal today's pipeline (`FILE_TOO_LARGE`, `EMPTY_FILE`, `DOCUMENT_TYPE_NOT_REQUIRED`, `CONFIGURATION_UNAVAILABLE`, `INVALID_FILE`, `INVALID_FILE_TYPE`, `UNSAFE_FILE_CONTENT`);
      - (b) with a trusted `REMOTE_ADDR` and `NUM_PROXIES=1`, `get_client_ip` equals the old rightmost-forwarded rule for any well-formed list;
      - (c) random out-of-scope document ids give a byte-identical 404 on every document surface, and an assignment-scoped reviewer in scope, assigned or not, gets that 404 from `extract/` and `delete/`;
      - (d) `approved` and `rejected` review transitions behave as before for every value of `RESOLVED_PAYMENT_STATUSES`;
      - (e) `+260XXXXXXXXX` inputs normalise to themselves;
      - (f) with a tenant contract whose identity row is `document_type="nrc"`, an upload followed by `GET /applications/{id}/documents/` lists exactly one identity row and no synthetic row, and a legacy application with a snapshot and no document row keeps its one synthetic row
    - Same file, design (h)–(j): assertions that hold at HEAD, moved out of tasks 1.3–1.5 under the marker rule:
      - (h) a row with only a presigned `file_url` and no `storage_key` opens through `signed-url/`;
      - (i) a reviewer in scope who is not assigned to the application gets the byte-identical masked 404 from `signed-url/`, `download/` and `info/`;
      - (j) with a public `REMOTE_ADDR` and any forged `X-Forwarded-For` list, `RateLimitMiddleware` counts the request in `REMOTE_ADDR`'s bucket
    - `backend/tests/property/test_seed_admins_preservation_sjr.py` (hypothesis, `max_examples=10`, no deadline; design "New preservation tests" (g)): after the documented production command shape (`seed_school_admins --admin <CODE>=<email> --password …`, fictional code and email) creates a membership, a super-admin sets its permissions to a generated set G through `PATCH /api/v1/admin/memberships/{id}/` and adds one access grant; two more runs of the same command each leave the permissions a superset of G and the access grant unchanged, and the second writes no `tenant.membership.permissions_seeded` row
    - Run on unfixed code: `cd backend && python3 -m pytest tests/property/test_sjr_preservation_properties.py tests/property/test_seed_admins_preservation_sjr.py -q`
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.14, 3.17, 3.18, 3.20, 3.24_

  - [x] 2.3 Frontend preservation properties
    - **Property 12: Preservation** - Documents and Drafts
    - **Property 13: Preservation** - Contracts and Conventions
    - `apps/admissions/tests/property/sjrPreservation.property.test.ts` (fast-check):
      - (a) `normalizePaymentStatus` and `isPaymentResolvedForProgress` outputs unchanged for arbitrary strings;
      - (b) readiness inputs with any missing item keep `canSubmit` false;
      - (c) answer-only edit sequences produce the same save count and statuses in the draft machine;
      - (d) an upload that succeeds first time issues exactly one request;
      - (e) the MSISDN normaliser is idempotent;
      - (f) after `signOut`, or a cross-tab logout message, no route guard sends a refresh request;
      - (g) rendering any public route with an unauthenticated session never calls `refreshAuthSession` (holds at HEAD; moved out of task 1.8 under the marker rule)
    - Run on unfixed code: `cd apps/admissions && bun run test -- tests/property/sjrPreservation.property.test.ts`
    - _Requirements: 3.3, 3.7, 3.8, 3.11, 3.19, 3.23_

  - [x] 2.4 Record the existing preservation baselines on unfixed code
    - Run and record pass counts: the tenant-isolation, payment, auth, upload, draft, submission, AI and official-document suites listed in design "Preservation Checking"
    - Commands: `cd backend && python3 -m pytest tests/property/test_scope_before_lookup.py tests/property/test_cross_tenant_invisibility.py tests/property/test_production_scope_masking_properties.py tests/property/test_access_scope_properties.py tests/unit/test_scope_drift_guard.py tests/unit/test_unscoped_endpoint_guard.py tests/unit/test_payment_single_path_8_2.py tests/unit/test_prod_settings_required_flags.py tests/unit/test_payment_phase_8_2.py tests/unit/test_payment_idempotence_8_2.py tests/unit/test_no_admissions_generative_ai_guard.py tests/integration/test_document_evidence_compensation_7_3.py -q` and `cd apps/admissions && bun run test -- --exclude '**/sjr*'`
    - The frontend baseline excludes the `sjr` files, so it counts only the suites that existed before this spec; with their strict markers, the task 1 files would otherwise count as passes
    - Some existing tests pin behaviour this spec changes on purpose. Each is named in its fix task with its new assertion or mock (3.1, 3.6, 3.9, 3.13, 3.14, 3.17, 3.18, 3.19, 3.20, 3.22, 3.23, 3.27, 5.3, 5.4), and the checkpoints count it with that new assertion or mock. Among the design's baselines that is `test_document_evidence_compensation_7_3.py` `:180`, `:341`, `:431` and `:490` (task 3.14) and `test_official_document_durability_10_4.py` `:632-643` and `:645-658` (task 3.19); `draftOutboxMinimisation.property.test.ts` gains the pending-grades case in task 3.23 with its existing assertions unchanged. A fix may change an existing test's assertion only when the old assertion encodes the defect it fixes. It may change a test's mocks, fixtures or patch targets, keeping every assertion, when the code under test changes shape (a new client, loader or transport), as tasks 3.1, 3.6, 3.19 and 3.22 do. Either way the task names the test and the test records why; any other test that turns red is a regression (design "Preservation Checking")
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.12, 3.13, 3.14, 3.15, 3.21_

  - [x] 2.5 Record the broad harness matrix baseline
    - Run `bash harness/bin/harness smoke` once on unfixed code and record the result per project; it has not run since task 0.4, so record any pre-existing failure as such, not as a regression
    - Confirm `gatecheck-negative` fails as designed
    - _Requirements: 3.22, 3.23_

  - [ ] 2.6 Pause automatic production deploys (operator step in GitHub settings; before task 3.2)
    - Why: `.github/workflows/deploy.yml` rolls production after every green CI run on `main` (`:6-11`, `:24`), with no backup step and no approval (DEC-10). Without a pause, merging task 3.2 (the first enforcement of `REQUIRED_ENV_VARS`) or task 3.15 (the repair script the boot sweep applies) would reach production before task 6.1's name checks and backup. At HEAD `4a6c4ef` no job in `deploy.yml` references an environment
    - This pauses automatic deploys for every app the workflow ships: the backend, which serves admissions and jobs-ops, the frontend image, which carries the admissions and jobs-ops builds, and all Spec B work. Production is unreachable today (D14), so nobody sees an effect yet
    - Preferred: in repository Settings → Environments, create `production` with required reviewers named by the user, then do task 2.7 so both Deploy jobs reference it. This keeps the workflow and its rollback trap intact and leaves an approval trail. The environment gates nothing until task 2.7 merges
    - Fallback: in the Actions tab, disable the Deploy workflow. It needs no code change; skip task 2.7
    - Until task 6.2, approve no Deploy run, and reject or leave any pending one. An urgent production fix during the pause is the user's call: an approved run deploys everything merged on `main`, including this spec's unreleased changes, so task 6.1's checks and backup come first
    - Confirm the pause: after the next green CI run on `main`, the Deploy run waits for review (preferred path) or no Deploy run starts (fallback). Record which path is in force, because task 6.2 undoes it
    - The preferred path holds only while the repository is public: on the GitHub Free, Pro and Team plans, required reviewers on an environment apply only to public repositories ([GitHub: Managing environments for deployment](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment)). If the repository's visibility or plan changes before task 6.2 (D11), repeat the confirmation step; if a Deploy run no longer waits for review, switch to the fallback at once. Repeat this check before the task 3.2 and task 3.15 merges
    - Ask the user to confirm that the pause is in place before task 3.2 starts
    - _Requirements: 3.16_

  - [ ] 2.7 Make both Deploy jobs reference the `production` environment (code change; preferred path only)
    - `.github/workflows/deploy.yml`: add `environment: production` to the `build-and-push` job (`:22`) and the `deploy` job (`:80`). Change nothing else: the triggers, the `if:` gate, the concurrency group, the disk gate and the rollback trap stay as they are
    - Merge it only after task 2.6 has created `production` with required reviewers. GitHub creates a missing environment on first reference with no protection rules, so a merge before task 2.6 would deploy unattended
    - Each job waits for its own approval, so one Deploy run asks twice: before the images are built and pushed, and before the stack is rolled
    - The Deploy run that this merge triggers waits for review; reject it
    - Docs: `.kiro/steering/infrastructure.md` production stack section notes that both Deploy jobs run in the GitHub `production` environment
    - Skip this task on the fallback path
    - _Requirements: 3.16_

- [ ] 3. Fix the P0a defects, one R-group at a time
  - **Property 1–6, 8, 10: Expected Behavior** - P0a fixes for R1–R6, R8 and R10
  - One R-group per block, each ending in a checkpoint that re-runs that group's task 1 tests and every task 2 preservation test
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19, 2.20, 2.21, 2.22, 2.23, 2.24, 2.25, 2.26, 2.27, 2.28, 2.29, 2.30, 2.31, 2.32, 2.33, 2.34, 2.35, 2.41, 2.42, 2.48_

  - [x] 3.1 R1 — local-test object storage and signing endpoint (design R1-a)
    - `backend/docker-compose.local-test.yml`: add `minio` and `minio-setup` (private bucket `mihas-localtest`), and the `S3_*` / `S3_PUBLIC_ENDPOINT_URL` environment for `web` and `celery`
    - `backend/config/settings/base.py`: `AWS_S3_PUBLIC_ENDPOINT_URL`, `AWS_QUERYSTRING_EXPIRE` from `S3_SIGNED_URL_TTL_SECONDS` (10–3600, default 900)
    - `backend/apps/common/storage.py`: `get_presign_client()`; `generate_signed_url` uses it
    - New `backend/apps/common/management/commands/storage_roundtrip_check.py` with `--expect-private`
    - Existing tests that patch the old client, updated in this change (mock target only): `backend/tests/property/test_response_properties.py:236-299` (three tests) patch `apps.common.storage.get_s3_client` and assert on that mock's `generate_presigned_url`; `generate_signed_url` now builds its client with `get_presign_client()`, so they patch `get_presign_client` instead, assertions unchanged
    - Docs: CTM "Object storage" row (CTM 60-73); `tech.md` Storage row and Commands; `LOCAL-TESTING.md` Parts 1–2 and the isolation table; `docs/runbooks/local-parity.md`; `deploy/.env.prod.example` comments
    - _Bug_Condition: isBugCondition_R1 where the local-test stack has an empty storage endpoint_
    - _Expected_Behavior: write, read, sign, fetch and delete succeed against a private bucket_
    - _Preservation: production signing unchanged (public endpoint unset, TTL 900)_
    - _Requirements: 2.1, 3.16_

  - [x] 3.2 R1 — startup validation after the final settings load (design R1-b)
    - Precondition: task 2.6 is done and the user has confirmed the pause, so merging this change does not deploy it; it reaches production only through task 6.2's approved deploy. Before merging, repeat task 2.6's visibility-and-plan check
    - `base.py`: remove the import-time `validate_required_env_vars()` call; add `STARTUP_ENV_VALIDATION = False` and `IS_TEST_PROCESS`
    - `prod.py` and `staging.py`: `STARTUP_ENV_VALIDATION = True`; `local_real.py`: `False`
    - `backend/apps/common/env_validator.py`: `required` parameter
    - `backend/apps/common/apps.py`: `_check_required_env_vars()` in `ready()`
    - Confirm the Docker build still passes `collectstatic` with its placeholder variables
    - Review `REQUIRED_ENV_VARS` (`base.py:798-810`): the list is enforced for the first time, so remove any name that is genuinely optional in production or staging rather than relying on a dummy value, and record each decision in the commit message
    - _Bug_Condition: isBugCondition_R1 where prod or staging starts with an empty `S3_*`_
    - _Expected_Behavior: refusal naming the variable, no value printed_
    - _Preservation: dev, test, local_real and harness start as before; existing `test_env_validator.py` cases pass_
    - _Requirements: 2.2, 3.16_

  - [x] 3.3 R1 — tracked env template, wired knobs and seeded fees (design R1-c, R1-d)
    - New `backend/.env.local.test.example`; `backend/.gitignore` exception; `backend/tests/unit/test_tracked_env_files.py` allowlist
    - `dev.py` reads `EMAIL_BACKEND`; remove `USE_LOCAL_FILE_STORAGE` and `CELERY_TASK_ALWAYS_EAGER` from documented env; fix or allowlist every name the scanner reports
    - `harness_seed_tenants.py`: local `program_fees` row per offering; refuse production settings
    - Docs: `LOCAL-TESTING.md` Part 2 seed step and Part R3 fee note; `tech.md:552` and `product.md:187` tracked-template sentences; CTM "Server-authored fee quote" (CTM 166)
    - _Bug_Condition: isBugCondition_R1 where a documented name has no reader, or a fresh database has no fee_
    - _Expected_Behavior: every documented name read or allowlisted; one seed step yields an applyable offering with a fee_
    - _Preservation: existing API-configured harness fees still match through `get_or_create`_
    - _Requirements: 2.3, 2.4, 3.16, 3.22_

  - [x] 3.4 Checkpoint — R1 green
    - **Property 1: Expected Behavior** - Storage and Environment Truth
    - **IMPORTANT**: Re-run the SAME tests from task 1.1 — do NOT write new tests
    - Remove the strict markers from task 1.1's tests (design "Marker scheme"), then run them unmarked
    - Run task 1.1's command; bring up the local-test stack and run `docker compose -p mihas-localtest -f docker-compose.local-test.yml exec web python3 manage.py storage_roundtrip_check --expect-private`
    - **EXPECTED OUTCOME**: Tests PASS and the round-trip prints `OK`
    - Re-run tasks 2.2–2.4 (preservation): PASS
    - `cd backend && python3 manage.py check`
    - Ask the user if questions arise
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.5 R2 — server: key release, header validation and magic bytes first (design R2-b, R2-c)
    - `backend/apps/documents/document_evidence.py` `mark_stage`: release the key for `compensated`, `compensation_pending`, `write_failed`, `orphaned`; emit `document.stage.idempotency_released`
    - `backend/apps/documents/document_storage_views.py`: `Idempotency-Key` format check; effective MIME type from `DECLARED_MIME_ALIASES`, `GENERIC_DECLARED_MIME_TYPES` and `detect_file_mime`; record the effective type
    - `backend/apps/documents/validators.py`: `detect_file_mime`
    - Docs: CTM "Upload replay identity" (CTM 1161), "Stable document command codes" (CTM 1166), and the corrected "Document upload rejection codes" table (CTM 980-997, R-12)
    - _Bug_Condition: isBugCondition_R2 where the prior attempt with the key ended uncommitted, or the declared type is generic or aliased_
    - _Expected_Behavior: retry accepted; acceptance decided by magic bytes; detected type recorded_
    - _Preservation: every rejection in 3.5; identical-bytes replay returns the same id; an in-flight duplicate still gets the retryable 409_
    - _Requirements: 2.8, 2.9, 3.5, 3.6_

  - [x] 3.6 R2 — client upload transport, retry, progress and copy (design R2-a)
    - New `apps/admissions/src/services/uploadTransport.ts`; `ApiClient.upload()` in `client.ts`; `refreshCsrfToken()` extracted in `csrf.ts`
    - `apps/admissions/src/services/requiredDocuments.ts`: upload through `apiClient.upload` with key, progress and signal
    - `apps/admissions/src/hooks/useRequiredDocuments.ts`: one key per user upload; throttled determinate progress; one automatic retry (not for 429) with the same key; first-error copy
    - `RequiredDocumentsPanel.tsx` / `FileUpload`: determinate progressbar and polite live-region announcements
    - Client-only codes and copy in `apps/admissions/src/lib/requiredDocuments.ts`
    - Docs: CTM "Progress is honest" rewritten (CTM 1140-1143); client-only codes in CTM 980-997; `tech.md` "Conventions For New Code"
    - Existing tests that pin the fetch transport (1.5–1.8), updated in this change: `apps/admissions/tests/integration/requiredDocumentsUploadFlow.test.tsx` (mock `:28-32`, uploads `:159-266`) and `requiredDocumentsVersionCommands.test.tsx` (mock `:27-31`, upload `:154`) mock `apiClient` with `request` only and match uploads on `request('/documents/upload/')`; their mocks gain `upload`, and the upload assertions move to it
    - _Bug_Condition: isBugCondition_R2 where the transfer outlasts 30 s or any attempt fails_
    - _Expected_Behavior: no abort while bytes flow; at most two POSTs with one key; determinate progress; first-error message_
    - _Preservation: CSRF recovery through `?refresh_csrf=1`; refresh-and-replay only for keyed requests; one request when nothing fails_
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 3.4_

  - [x] 3.7 R2 — photo downscaling and the single-path guard (design R2-e, R2-d)
    - New `apps/admissions/src/lib/imageDownscale.ts`, called before the transport
    - New `apps/admissions/tests/unit/uploadPathSingleSource.test.ts` with the frozen list of dead references at HEAD (deletion owned by Spec B S2, DEC-1); its `'/documents/upload/'` rule allows `services/requiredDocuments.ts` plus the three dead modules that contain the literal at HEAD (`services/documents.ts`, `lib/storage.ts`, `lib/applicationSlipStorage.ts`), so it passes on the day it lands
    - Docs: CTM "Required-document upload contract" (CTM 1106-1147) names the one transport and the downscaling threshold; guard added to "Drift Guard Inventory"
    - _Bug_Condition: isBugCondition_R2 where a photo above the threshold, or a new reference to a dead upload path_
    - _Expected_Behavior: downscaled when smaller, original otherwise; any new reference fails the guard_
    - _Preservation: server validation decides acceptance; nothing is deleted_
    - _Requirements: 2.10, 2.11, 3.5_

  - [x] 3.8 Checkpoint — R2 green
    - **Property 2: Expected Behavior** - Upload Transport and Server Acceptance
    - **IMPORTANT**: Re-run the SAME tests from task 1.2 — do NOT write new tests
    - Remove the strict markers from task 1.2's tests, then run them unmarked
    - **EXPECTED OUTCOME**: Tests PASS
    - Re-run tasks 2.2–2.4: PASS; `bun run build:admissions`; `bun run lint:admissions`
    - Ask the user if questions arise
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11_

  - [x] 3.9 R3 — trusted-proxy client IP and document budgets (design R3-a, R3-b)
    - `backend/apps/common/request_utils.py`: the trusted-proxy algorithm
    - `base.py`: `TRUSTED_PROXY_CIDRS`, `RATELIMIT_IP_META_KEY`, `documents_write` 40/hour and `documents_read` 300/hour
    - `backend/apps/common/middleware.py`: upload IP scope 60/10m before the document IP scope 300/10m; docstring
    - `backend/apps/common/throttling.py`: `ClientIpIdentMixin` on the existing throttles; new `DocumentUserRateThrottle`, inactive when `getattr(settings, "RATELIMIT_ENABLE", True)` is false (the setting is undefined in base, prod and staging), fail-open on cache errors
    - `throttle_classes` on the seven document views listed in design R3-b
    - Docs: CTM "Client IP and proxy trust" row; `infrastructure.md` proxy trust; `deploy/RUNBOOK.md` env list; `harness.py:68-90` comment; `tech.md` throttle scopes
    - Update any existing `get_client_ip` test that encodes the spoofable rule (public peer plus forwarded header), recording the reason in the test
    - `backend/tests/property/test_middleware_properties.py:271-297` pins the exact `SCOPE_LIMITS` list. Its `("/api/v1/documents/", "20/10m")` entry (`:279`) becomes the upload scope followed by the document scope above, because the old entry encoded the shared budget (1.13)
    - _Bug_Condition: isBugCondition_R3 where distinct real clients arrive through a trusted proxy, or authenticated document traffic_
    - _Expected_Behavior: separate buckets per real client in every scope; per-user read and write budgets_
    - _Preservation: one client meets the same ceilings; webhook stays exempt; payment and extract throttles unchanged for authenticated users_
    - _Requirements: 2.12, 2.13, 2.14, 3.9, 3.17_

  - [x] 3.10 R3 — bounded OCR polling with a missing-job signal (design R3-c)
    - Backend: `DocumentExtractView` sets `pending` before enqueueing and answers 503 `OCR_QUEUE_UNAVAILABLE` on broker failure; `DocumentInfoView` publishes `ocr_pending`; `tasks.py:240` records `ocr_failed` on the no-file path
    - Frontend: `useOcrGradeExtraction.ts` backoff schedule, stop rules and visibility pause; `documentService.getInfo(id, { retries: 0 })`; `useWizardController.ts` starts polling only after the extract resolves
    - Docs: CTM "Deterministic grade-extraction candidates" (CTM 1075-1105) adds `ocr_pending` and the polling bounds
    - _Bug_Condition: isBugCondition_R3 where no OCR job exists, the extract failed, or the worker is slow_
    - _Expected_Behavior: at most 10 polls with backoff; none without a job; manual entry always available_
    - _Preservation: OCR stays advisory and student-confirmed; manual entry wins (3.12)_
    - _Requirements: 2.14, 2.15, 3.12_

  - [x] 3.11 R3 — honest 429 presentation (design R3-d)
    - `base.py`: add `Retry-After` to `CORS_EXPOSE_HEADERS`
    - `client.ts` and `apps/admissions/src/lib/apiErrorHandler.ts`: `retryAfterSeconds` and `RATE_LIMITED` on 429 errors
    - New `apps/admissions/src/lib/rateLimitCopy.ts`; `ProgramStep` takes `programsError` and `intakesError` and renders `ErrorDisplay` for the failed query; the student dashboard's application, intake and interview error strings (`Dashboard.tsx:307`, `:272`, `:321`) use the copy for `RATE_LIMITED`; the same copy on upload rows, sign-in and sign-up banners; every other surface is OS-14
    - Docs: CTM "Error Codes" (CTM 922)
    - _Bug_Condition: isBugCondition_R3 where a request is rate-limited_
    - _Expected_Behavior: on the journey surfaces 2.16 names, a retry time shown and never an empty catalogue or list_
    - _Preservation: the 429 envelope and `Retry-After` header unchanged (3.9)_
    - _Requirements: 2.16, 3.9, 3.11_

  - [x] 3.12 Checkpoint — R3 green
    - **Property 3: Expected Behavior** - Client Identity, Budgets and Polling
    - **IMPORTANT**: Re-run the SAME tests from task 1.3 — do NOT write new tests
    - Remove the strict markers from task 1.3's tests, then run them unmarked
    - **EXPECTED OUTCOME**: Tests PASS
    - Re-run tasks 2.2–2.4: PASS
    - Ask the user if questions arise
    - _Requirements: 2.12, 2.13, 2.14, 2.15, 2.16_

  - [x] 3.13 R4 — persist keys, sign on read, resolve legacy values (design R4-a, R4-c)
    - Upload view, `backend/apps/applications/condition_evidence_service.py` and official-document generation (`backend/apps/applications/tasks/pdf_generation.py:210-222`): persist the key in `file_url` and `storage_key`; no `storage.url()` for persistence
    - `backend/apps/common/storage.py`: `resolve_document_object_key`, `resolve_document_open_url`, `_key_from_persisted_value` (a bare UUID resolves to no key)
    - Switch the signed-url, download, official-document, legacy-synthesis and OCR-task callers to the helpers
    - `DocumentSerializer.file_url` signed on read; regenerate the schema (`cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`) and the types (`bun run generate:api-types`)
    - Correct the comment at `official_document_views.py:320` and the `_RAW_URL` fixture in `test_official_document_signed_download.py`; that file's `_Doc` stand-in (`:30-37`) gains `storage_key` and `document_name`, and its signer tests (`:118-139`) follow the new helpers
    - Existing tests that pin persisted URLs (1.16), updated in this change: `backend/tests/unit/test_application_tasks.py:206-221` and its receipt twin `:330-346` (`test_file_url_set_from_storage`) assert that `commit_version` receives the stored key as both `file_url` and `storage_key` and that `storage.url()` is not called; `backend/tests/unit/test_synthesized_legacy_documents.py:71-82` expects `file_url: null` when signing fails, because a list never publishes a raw key (2.17)
    - `backend/tests/unit/test_drift_bug3_endpoints.py:137-157` (`test_signed_url_passes_object_key_not_full_url`) signs a `cdn.example.com` URL as the key `documents/app123/abc_transcript.pdf`, which is defect 1.18. It now expects that legacy-provider URL to be returned unchanged (2.20), while an endpoint-host or `X-Amz-` URL is still signed by its path; `_make_mock_document` (`:45-67`) sets `storage_key=None` so the helper falls back to `file_url`. The old assertion encoded 1.18
    - New guard `backend/tests/unit/test_no_persisted_signed_urls_sjr.py` (the tenant-asset sites `backend/apps/catalog/admin_asset_views.py:93` and `:294` listed as known Spec B exceptions)
    - Docs: CTM "Immutable document evidence" (CTM 1149-1196) and the legacy-fallback allowlist entry; `docs/schema-ownership.md`
    - _Bug_Condition: isBugCondition_R4 where a presigned URL is persisted or a legacy value is opened_
    - _Expected_Behavior: keys persisted; URLs signed at read; legacy-provider URLs returned unchanged_
    - _Preservation: admin signed-url and download behaviour (3.14); `storage_key` never published (3.6)_
    - _Requirements: 2.17, 2.20, 3.6, 3.14_

  - [x] 3.14 R4 — snapshot inside the version transaction, replay heal, filename-free keys (design R4-b)
    - `document_evidence.commit_version(..., snapshot_field=...)` with `SNAPSHOT_FIELD_BY_DOCUMENT_TYPE`; drop the view's post-commit write
    - Replay branch heals a NULL snapshot without touching `updated_at`
    - `ApplicationDocumentsView.get` (`backend/apps/applications/student_document_views.py:130-166`): id-aware legacy synthesis, comparing the snapshot with listed ids and stored `file_url` / `storage_key` values and skipping a pair when any covering type is listed (design R4-b); ship it in the same deploy as the snapshot writer, or before it
    - `build_object_key(..., mime_type=...)` without the filename; both callers pass the effective type
    - Register the snapshot columns in `backend/apps/common/legacy_columns.py` as legacy presence snapshots
    - Existing tests that pin the old snapshot and key shape (1.16, 1.28), updated in this change:
      - `backend/tests/integration/test_document_evidence_compensation_7_3.py:180` asserts that the snapshot equals the current document's id (`second["id"]`), and `:431` and `:490` that it still equals the first version's id after the failed replacement;
      - `:341` in that file and `backend/tests/unit/test_document_evidence_versions_7_3.py:281-282`, `:337`, `:616`, `:655` and `:684` pass `mime_type=` to `build_object_key` instead of a filename, which would now be a `TypeError`;
      - `backend/tests/property/test_drift_bug3_preservation.py:326-332` asserts that the snapshot equals the upload response's `id`. It is red from task 3.13 on, which signs `file_url` on read; both tasks land in the R4 merge
    - _Bug_Condition: isBugCondition_R4 where the encoded name exceeds about 45 characters, or a write fails after the commit_
    - _Expected_Behavior: 201 for names up to 255 characters; snapshot and version in one transaction; no 5xx for a committed document_
    - _Preservation: one current version per requirement; versioning and replay identity (3.6); presence semantics for every frontend snapshot reader; a truly legacy application keeps its synthetic row (3.14)_
    - _Requirements: 2.18, 2.19, 2.22, 2.30, 3.6, 3.14_

  - [ ] 3.15 R4 — snapshot repair script, proven on a Neon branch (design R4-d)
    - Precondition: the deploy pause from task 2.6 holds, so the boot sweep first applies this script in production during task 6.2, after task 6.1's backup. Before merging, repeat task 2.6's visibility-and-plan check
    - New `backend/scripts/2026_11_02_01_repair_document_snapshot_presence.sql` (the `DISTINCT ON` version in design R4-d)
    - Prove on a Neon branch through the Neon MCP tools, never on the default branch first: list user triggers on `applications` (`SELECT tgname FROM pg_trigger WHERE tgrelid = 'applications'::regclass AND NOT tgisinternal`; if one writes `updated_at`, stop and ask the user); record `id, updated_at` for the rows the script will fill; count NULL snapshots with a current document; apply; re-count (expect 0); confirm every recorded `updated_at` is unchanged; apply again (expect 0 rows changed); record the counts and the branch id
    - Operator-gated, after the branch proof: ask the user to confirm, then apply the proven script to the Neon default branch (the authoring database) through the Neon MCP tools and record the counts (`infrastructure.md`: a Neon branch first, then the default branch)
    - Run `apply_sql_migrations --dry-run` against the local-test stack to confirm the runner picks it up
    - Docs: CTM "Database Schema" (CTM 1198+); `docs/schema-ownership.md`
    - _Bug_Condition: committed documents whose application snapshot is NULL (A-04)_
    - _Expected_Behavior: every such snapshot filled with the current document id; idempotent_
    - _Preservation: no `updated_at` change, so no slip fingerprint is retired; additive only (3.16)_
    - _Requirements: 2.19, 3.16_

  - [x] 3.16 Checkpoint — R4 green
    - **Property 4: Expected Behavior** - Keys, Not Links
    - **IMPORTANT**: Re-run the SAME tests from task 1.4 — do NOT write new tests
    - Remove the strict markers from task 1.4's tests, then run them unmarked
    - **EXPECTED OUTCOME**: Tests PASS
    - Re-run tasks 2.2–2.4: PASS; regenerated schema and types are clean in the contract-sync gate (`python3 scripts/launch-verification/check-contract-sync.py --python python3`)
    - Ask the user if questions arise
    - _Requirements: 2.17, 2.18, 2.19, 2.20, 2.30_

  - [x] 3.17 R5 — opener route and explicit controls (design R5-a)
    - New route `studentDocumentOpen` in `routeRegistry.ts` and page `apps/admissions/src/pages/student/DocumentOpen.tsx` with the query grammar and states
    - Every student View and Open control becomes an anchor to the opener
    - `useOfficialDocument.ts`: `{ state, prepare(), openHref }`; no programmatic tab after an await. Its callers are the student `DocumentButtons` and `DownloadReceiptButton`; the constants and helpers `useAdminOfficialDocuments` imports from it keep their names and behaviour, and no admin control gets an `openHref` (OS-15)
    - Docs: CTM canonical routes (CTM 770); CTM read-existing surface (CTM 623-676); `structure.md` high-risk paths
    - Existing tests that drive the old controls (1.23: a tab opened in code after awaits), updated in this change:
      - `apps/admissions/tests/unit/documentUiStates.test.tsx`: the tests at `:221`, `:281`, `:315` and `:341` click the student slip, receipt and letter controls and expect `downloadOfficialDocument`. They now expect the Prepare request, then an Open anchor to `/student/documents/open?app=<id>&type=<type>`, and no `downloadOfficialDocument` call;
      - the receipt tests in the same file look up the retired label "Download Receipt" (R5-f): `:273` (absent until verified), `:276-278` (offered once verified), and the clicks at `:287`, `:305` and `:322`. They use "Prepare receipt" and then the "Open receipt" anchor; their Retry and no-download assertions stay;
      - the `useOfficialDocument` mock in `paymentOwnershipSplit.test.tsx:100-115` returns the hook's new shape;
      - receipt toast, `documentUiStates.test.tsx`: the old assertion expected the toast "Receipt downloaded successfully" and now expects "Receipt is ready to open". The old text encoded the defect: it says "downloaded" when the receipt control only prepares the receipt and offers an Open link (R5-f);
      - receipt label lookup, `paymentOwnershipSplit.test.tsx:255`: the old assertion looked up `/download receipt/i` and now looks up `/prepare receipt/i`. The old label is the retired copy that claims a download the control no longer performs (R5-f);
      - harness: `official-document-durability.spec.ts:529-531`, `:625` and `:659`, `student-document-density.spec.ts:672` and `student-lifecycle-golden.spec.ts:593` press a "Download Slip" button. They now press the slip's Prepare control where they ask for a document (`student-document-density.spec.ts:672`, `student-lifecycle-golden.spec.ts:593`) and its Open link where they open one or check that it is offered (`official-document-durability.spec.ts`), and keep their assertions on the popup's storage host
    - _Bug_Condition: isBugCondition_R5 where the click comes after the URL lifetime, or an official document becomes ready after awaits_
    - _Expected_Behavior: the current version opens at click time; explicit Open control in the student UI_
    - _Preservation: admin uploaded-document viewing and admin official-document downloads unchanged (3.14, 3.15)_
    - _Requirements: 2.21, 2.25, 3.14_

  - [x] 3.18 R5 — workspace document list, wizard View and desktop nav (design R5-b, R5-c)
    - Rewrite `DocumentChecklist.tsx` in place to read the documents endpoint; `ApplicationStatus.tsx:327-329` passes `applicationId`
    - `RequiredDocumentsPanel.tsx`: View anchor for an uploaded requirement
    - `routeRegistry.ts`: `desktop: true` on `studentStatus.nav`; update any nav test that pinned the omission
    - Docs: CTM "Required-document upload contract" (CTM 1106-1147); `structure.md` navigation row; `product.md` "Current Admissions Flow Contract" viewing bullet
    - _Bug_Condition: isBugCondition_R5 where a document type is not one of the two snapshot types, or the viewport is desktop_
    - _Expected_Behavior: every current document listed with View; documents reachable within two activations on both navs_
    - _Preservation: status colour paired with a word or icon; 44 px targets (3.11)_
    - _Requirements: 2.22, 2.23, 3.11_

  - [x] 3.19 R5 — backend authority, honest signing failures, student read precedence, Content-Disposition (design R5-d, R5-e, R5-g, R5-h)
    - `_get_authorized_document(..., allow_assigned_reviewer=True)` delegates to `resolve_owner_or_scoped_document` plus `require_reviewer_assignment`; `DocumentExtractView` and `DocumentDeleteView` pass `allow_assigned_reviewer=False`, so an assignment-scoped reviewer keeps the masked 404 there; `ApplicationDocumentsView` and `ApplicationRequiredDocumentsView` use `resolve_owner_or_scoped_application`; remove the raw `role == "admin"` branches
    - `_signed_download_url` logs at ERROR; envelope `error_code: DOCUMENT_LINK_UNAVAILABLE`
    - `_generation_status`: the student-only issued-copy step
    - `generate_signed_url` with `ResponseContentDisposition` from `content_disposition_for`
    - Register the three surfaces in `scripts/authority_matrix_registry.py`
    - Existing tests that pin the old read precedence and the silent signing failure (1.22, 1.24), updated in this change: `backend/tests/unit/test_official_document_durability_10_4.py:632-643` (a live application with a stale issued slip reads `not_requested`) and `:645-658` (a failure is reported before the issued copy) read as the student. The student now gets the issued slip as `ready` with `historical: true`, and each test adds the staff read, which keeps today's answer (D-A13). `backend/tests/unit/test_official_document_signed_download.py:130-134` expects the signing-failure sentinel, not `None`
    - Signer call-args assertion, `backend/tests/unit/test_drift_bug3_endpoints.py::test_signed_url_passes_object_key_not_full_url`: the old assertion pinned a key-only signer call. It now still asserts the object key exactly and also expects `filename`, `disposition` and `content_type`. The old call encoded the defect: a presigned read with no Content-Disposition (clause 1.28, R5-h)
    - Mocks that follow the loader (assertions unchanged): `_mock_document_lookup` (`backend/tests/unit/test_drift_bug3_endpoints.py:70-75`) and the extract mocks in `backend/tests/property/test_drift_bug3_preservation.py:169-197` and `backend/tests/unit/test_document_payment_envelopes.py:19-26` configure `ApplicationDocument.objects.select_related(...).get`; they follow `resolve_owner_or_scoped_document`'s owner and scoped lookups (`backend/apps/common/tenant_authorization.py:436`), and their 404, owner and envelope assertions are unchanged. The affected cases are signed-url `:103-117` and `:119-135`, download `:195-209`, info `:251-265`, and delete `:323-337` and `:339-356` in the first file
    - Docs: CTM "Stable document command codes" (CTM 1166), "Student failure copy vs staff failure copy" (CTM 660), "Read-existing eligibility" (CTM 654), required-documents authority line (CTM 1136-1139)
    - _Bug_Condition: isBugCondition_R5 where a reviewer is in scope and assigned, a non-owner student asks, signing fails, or the status changed after issue_
    - _Expected_Behavior: reviewer served; masked 404 for non-owners; ERROR log and honest code; issued slip readable_
    - _Preservation: byte-identical 404 envelope; reviewers still cannot extract or delete; staff precedence and retry rules unchanged (3.1, 3.15)_
    - _Requirements: 2.24, 2.26, 2.28, 2.29, 2.30, 3.1, 3.15_

  - [x] 3.20 R5 — truthful summary copy (design R5-f)
    - `officialDocumentPresentation.ts` and `DocumentButtons.tsx`: "ready" only for issued types; "Prepare" for issuable ones; per-status copy
    - Existing tests that pin the old copy (1.25), updated in this change: `apps/admissions/tests/unit/documentActionDensity.test.tsx:176` and `:387` expect the R5-f summary for their mocked status instead of "ready to download", and `:205` and `:364` the slip's Prepare or Open label instead of "Download Slip"; `student-document-density.spec.ts:318` expects the R5-f summary
    - _Bug_Condition: isBugCondition_R5 where a document is issuable but not issued_
    - _Expected_Behavior: no "ready" claim before issue_
    - _Preservation: terminal-application reads stay offered (3.15)_
    - _Requirements: 2.27, 3.15_

  - [x] 3.21 Checkpoint — R5 green
    - **Property 5: Expected Behavior** - Students Open Their Own Documents
    - **IMPORTANT**: Re-run the SAME tests from task 1.5 — do NOT write new tests
    - Remove the strict markers from task 1.5's tests, then run them unmarked
    - **EXPECTED OUTCOME**: Tests PASS
    - Re-run tasks 2.2–2.4: PASS; `bun run build:admissions`; `bun run lint:admissions`
    - Ask the user if questions arise
    - _Requirements: 2.21, 2.22, 2.23, 2.24, 2.25, 2.26, 2.27, 2.28, 2.29, 2.30_

  - [x] 3.22 R6 — one readiness computation (design R6-a)
    - `wizardReadiness.ts`: every `BuildWizardReadinessInput` field required
    - `useWizardController.ts`: `computeReadiness`; `useWizardSubmission.ts` calls it
    - `useOverallProgress.ts:41`: pass `assignmentResolved: false` and `requiredDocumentItems: undefined` explicitly (today's defaults), with a comment naming Spec B V3 task 26.1 as the owner of the percentage, so the displayed percentage does not change. Its five optional options at `:44-48` are `T | undefined` and would fail `tsc` under `"strict": true`, so it also passes today's defaults for them: `uploadedFiles ?? {}`, `hasResultSlipFile ?? false`, `hasIdentityFile ?? false`, `paymentStatus ?? null`, `confirmSubmission ?? false`
    - New test helper `apps/admissions/tests/unit/__fixtures__/readinessInput.ts` (`readinessInput(overrides)` fills every field); move the 9 existing test calls of `buildWizardReadiness` to it
    - Add `apps/admissions/tests/property/sjrSubmitReadiness.property.test.ts` (button readiness equals handler readiness for generated inputs)
    - Docs: CTM "Submission Gates" (CTM 1009-1046)
    - _Bug_Condition: isBugCondition_R6 where the application is ready and Submit is clicked_
    - _Expected_Behavior: exactly one submit request and the submitted state_
    - _Preservation: Submit disabled while any blocker holds; `@idempotent` submission (3.8); the progress percentage unchanged_
    - _Requirements: 2.31, 2.32, 3.8, 3.23_

  - [x] 3.23 R6 — grades as a draft-machine channel (design R6-b)
    - Backend: `ApplicationGradesView.post` `partial` mode, 10-row cap, `transaction.atomic()` with the row lock
    - Draft machine: `projectGrades`, `syncGrades`, `setGradesBaseline`, grade fingerprinting, `unsavableGradeRows`, `gradesNeedAttention` message
    - Adapters in `useWizardDraftPersistence.ts`; loader calls `setGradesBaseline`
    - Outbox format 4 with pending grades; update `draftOutboxMinimisation.property.test.ts`
    - Replace the direct grade syncs in `useWizardStepAdvance.ts:400-410` and `useWizardGrades.ts:123`
    - New `…/applicationWizard/lib/pageSaveView.ts`; `index.tsx` passes its result to `WizardActionBar`
    - Add `apps/admissions/tests/property/sjrGradesAutosave.property.test.ts`
    - Regenerate the schema and types for the `partial` field
    - Docs: CTM "Online student drafts" (CTM 79) and "Wizard" (CTM 1227-1234); `product.md` auto-save bullet
    - _Bug_Condition: isBugCondition_R6 where grades are edited and the page reloads before Next_
    - _Expected_Behavior: grades saved within the debounce; same grades after reload or on another device; "Saved" only when nothing is pending_
    - _Preservation: one autosave owner; answer autosave and conflict handling unchanged; the minimum still enforced at submit (3.7, 3.8)_
    - _Requirements: 2.33, 2.34, 3.7, 3.8_

  - [x] 3.24 R6 — payment hook fixes (design R6-c, R6-d)
    - `usePaymentStatus.ts`: re-arm `mountedRef` in the effect body
    - `PaymentStep.tsx`: clear the recovery entry after `deferPayment` resolves and in the existing effect that adopts a server `deferred` status (`:79-81`)
    - `PaymentForm.tsx`: handle a `deferred` verify result in `syncPendingPayment` (stop the poll, reset the pending method and payment id, clear the entry, report it) and widen `onPaymentStatusChange`'s parameter type to include `'deferred'`; no new prop
    - Docs: CTM "Student payment ownership split" (CTM 148-164)
    - _Bug_Condition: isBugCondition_R6 where payment is deferred under StrictMode or with a recovery entry_
    - _Expected_Behavior: deferred state shown, Next enabled, recovery entry cleared_
    - _Preservation: `allowsInitiate` double-charge guard and the ownership split (3.3)_
    - _Requirements: 2.35, 3.3_

  - [x] 3.25 Checkpoint — R6 green
    - **Property 6: Expected Behavior** - Submit, Grades and Deferral
    - **IMPORTANT**: Re-run the SAME tests from task 1.6 — do NOT write new tests
    - Remove the strict markers from task 1.6's tests, then run them unmarked
    - **EXPECTED OUTCOME**: Tests PASS
    - Re-run tasks 2.2–2.4: PASS; the existing `wizardDraft*` suites and `submitIdempotency.test.ts` PASS
    - Ask the user if questions arise
    - _Requirements: 2.31, 2.32, 2.33, 2.34, 2.35_

  - [ ] 3.26 R8 — session restore in the route guards (design R8-a)
    - New `apps/admissions/src/hooks/auth/useSessionRestoreOnce.ts` with `suppressSessionRestore()` and `allowSessionRestore()`
    - `StudentRoute.tsx`, `AdminRoute.tsx` and `ProtectedRoute.tsx` call the hook before their redirect: one `refreshAuthSession()` attempt per mount, the "Restoring your session" skeleton meanwhile, then today's redirect if the session still reads unauthenticated
    - `useSessionListener.signOut`, the cross-tab logout handler in `lib/authBroadcast.ts` and the auth-failure callback in `contexts/AuthContext.tsx` call `suppressSessionRestore()` first; a successful sign-in, and a session read that returns a user, call `allowSessionRestore()`
    - `authQueries.ts`: comment naming the hook as the only bootstrap refresh; no behaviour change
    - Docs: `tech.md` "Response And Auth Conventions"
    - _Bug_Condition: isBugCondition_R8 where the access token expired, the refresh token is valid, and the route is authenticated_
    - _Expected_Behavior: session restored with one refresh request; no sign-in page; on student and admin pages alike_
    - _Preservation: public pages never refresh; no refresh after a sign-out (task 2.3 (f)); genuine expiry and tab-refocus behaviour unchanged (3.4, 3.19)_
    - _Requirements: 2.41, 3.4, 3.19_

  - [ ] 3.27 R8 — one MSISDN normaliser, echo-free messages, field errors kept (design R8-b)
    - Move the normaliser to `backend/apps/common/validators.py` as `normalize_zambian_msisdn`; keep the `payment_helpers` alias; new `validate_zambian_phone` and `validate_nrc` messages
    - `SignUpPage.tsx` uses `registrationPhoneSchema` (the registration pre-check, then `zambianMsisdnSchema`); `SignUpResult.fieldErrors`; `useSessionListener.signUp` returns it; generic banner when field errors exist
    - Registration-only pre-check (design R8-b, decided): `validate_zambian_phone` and `registrationPhoneSchema` accept a `+` input only as `+260` plus exactly nine digits, so `+260` plus six digits is refused with the inline error and never stored as `+260260…`; `normalize_zambian_msisdn`, the `payment_helpers` alias and `normalizeZambianMsisdn` are unchanged
    - New `apps/admissions/tests/unit/__fixtures__/zambianMsisdnVectors.json` (with a `registrationRefused` list that includes `+260977123`), `apps/admissions/tests/unit/zambianMsisdnVectors.test.ts` and `backend/tests/unit/test_zambian_msisdn_vectors.py`; both tests run the refused list through the registration entry points
    - `backend/tests/property/test_validation_properties.py` encodes the `+260`-only rule (1.39) in its invalid-phone strategies (`:36-49`), updated in this change: `260\d{9}` (`:48`) moves to the valid set, and the invalid set drops only the shapes registration now accepts. `\+260\d{1,8}` (`:44`) stays invalid, including `\+260\d{6}`: the registration pre-check refuses it even though the shared normaliser reads it as a bare nine-digit subscriber number (`backend/apps/documents/payment_helpers.py:135-137`), which would store `+260260…` (decided; 2.42, EC-23)
    - Docs: CTM "Zambian MSISDN normalisation" mirrored concept with the shared-vector drift guard
    - _Bug_Condition: isBugCondition_R8 where the phone is in local format, or invalid (including an ambiguous `+` input)_
    - _Expected_Behavior: normalised to `+260…`; inline error with `aria-invalid`; no raw keys or values; `+260` plus six digits refused, never read as `+260260…`_
    - _Preservation: `+260` numbers stored unchanged; mobile-money normalisation byte-for-byte the same (3.18, 3.2)_
    - _Requirements: 2.42, 3.2, 3.10, 3.18_

  - [ ] 3.28 Checkpoint — R8 green
    - **Property 8: Expected Behavior** - Session Continuity and Registration Phone
    - **IMPORTANT**: Re-run the SAME tests from task 1.8 — do NOT write new tests
    - Remove the strict markers from task 1.8's tests, then run them unmarked
    - **EXPECTED OUTCOME**: Tests PASS
    - Re-run tasks 2.2–2.4 and CI's critical auth slice: PASS
    - Ask the user if questions arise
    - _Requirements: 2.41, 2.42_

  - [ ] 3.29 R10 — diagnostics badge on the development server only (design R10)
    - `BuildVersionBadge.tsx`: `import.meta.env.DEV` wrapper and inner dev component; `text-xs` and opaque background
    - `AppLayout.tsx:294-296` and `SharedFooter.tsx:187-189`: render the padded wrapper `div` only under `import.meta.env.DEV`, so production pages keep no empty band
    - Confirm with `bun run build:admissions` that the production bundle no longer contains the badge strings or the version probe
    - Docs: DESIGN.md §4 (`DESIGN.md:176`) moves the badge to a development-diagnostics note
    - _Bug_Condition: isBugCondition_R10 where the build is a production build_
    - _Expected_Behavior: no badge and no `/health/live/` version request_
    - _Preservation: `X-Backend-Version` and `VITE_APP_VERSION` keep serving support and chunk reloads; accessibility rules (3.11)_
    - _Requirements: 2.48, 3.11_

  - [ ] 3.30 Checkpoint — P0a complete
    - **Property 10: Expected Behavior** - Diagnostics Badge
    - **IMPORTANT**: Re-run the SAME test from task 1.9 — do NOT write a new test
    - Remove the strict marker from task 1.9's test, then run it unmarked
    - Run every task 1 test for R1–R6, R8 and R10, now unmarked, and every task 2 preservation test: PASS
    - `cd backend && python3 -m pytest tests/unit/ -q`; `cd apps/admissions && bun run test`; `bun run build:admissions`; `bun run lint:admissions`; `cd backend && python3 manage.py check`: PASS. Task 1.7's R7 tests keep their strict markers until task 5.6, so these suites report them as expected failures
    - Register `student-journey-repair` in CTM "Active Alignment Spec" (CTM 9-39) and add every new guard to "Drift Guard Inventory" (CTM 1347+); add the "Files Added During Student Journey Repair" table to `structure.md`
    - Ask the user if questions arise
    - _Requirements: 2.1, 2.5, 2.12, 2.17, 2.21, 2.31, 2.41, 2.48, 3.21_

- [ ] 4. Build the blocking CI journey gate (P0a scope)
  - **Property 9: Bug Condition** - Journey Gate
  - Starts after task 3.30 is green
  - _Requirements: 1.40, 1.41, 1.42_

  - [ ] 4.1 Harness switches for the gate (design R9-a)
    - `backend/config/settings/harness.py`: `RATELIMIT_ENABLE` from `HARNESS_RATELIMIT_ENABLE` (default off) and the corrected comment
    - `harness/docker-compose.harness.yml`: pass `S3_SIGNED_URL_TTL_SECONDS`, `S3_PUBLIC_ENDPOINT_URL` and `HARNESS_RATELIMIT_ENABLE`; `minio-setup` reads `HARNESS_BUCKET_ANONYMOUS` (default `download`)
    - `harness/bin/harness`: new `journey-gate` command exporting the four gate values and running build, up, health, browser, storage check, edge check, journey and drain
    - `apps/admissions/tests/harness-e2e/helpers/ops.ts`: new `resetRateLimitCounters()`, which deletes only the `:1:rl:*` and `:1:throttle_*` keys in the harness cache database (never `FLUSHDB`; the Celery broker shares it) and prints the count
    - _Bug_Condition: isBugCondition_R9 where the harness hides 429s, expiry and unsigned URLs_
    - _Expected_Behavior: limiter on, private bucket, 20 s lifetime and a browser-reachable signing endpoint in the gate run only_
    - _Preservation: the broad matrix keeps today's settings (3.22)_
    - _Requirements: 2.43, 2.45, 3.22_

  - [ ] 4.2 Journey gate config and specs (design R9-b)
    - New `apps/admissions/playwright.journey-gate.config.ts` with projects `journey-gate-mobile` (390×844, Chromium) and `journey-gate-desktop` (1440×900)
    - New `apps/admissions/tests/harness-e2e/journey-gate/student-journey-gate.spec.ts`: steps 1–12 of design R9-b, including the throttle self-check, reopen after expiry, the 403 on the expired URL, deferral, Submit, cookie-deletion restore and slip download
    - New `submit-desktop.spec.ts` (R6.1 at 1440×900), `upload-near-limit.spec.ts` (9.5 MB at 1 Mbit/s, one POST) and `a11y-surfaces.spec.ts` (axe with the `axe-viewport-sweep.spec.ts` tags on the documents list and the opener's invalid-link and not-found states at 390×844, failing on any critical or serious violation or any horizontal scrolling)
    - New `journey-gate/strictStatusGuard.ts`: `attachStrictStatusGuard(context)` on every gate browser context (student, popups, staff) fails the test on any 429 or ≥ 500 response for any URL; `HarnessGate` gains the opt-in `statusAwareDefaults` mode (session and refresh allowed at 401 only), which the gate fixture turns on and the broad matrix does not
    - Each spec calls `resetRateLimitCounters()` before it starts and before the staff actor starts, and writes per-scope request counts to `rate-limit-headroom.json`
    - Generated PDF and PNG fixtures at test time; no binaries committed
    - Evidence to the run-scoped root, never `docs/v2-evidence`
    - Docs: `structure.md` "Testing Layout"; `tech.md` "Verification Expectations"
    - _Bug_Condition: isBugCondition_R9 where Submit, reopen-after-expiry, uploads and 429s were never exercised_
    - _Expected_Behavior: the journey passes; it fails on any 429 or 5xx on any page or popup, any console error, an unsigned URL, a missing throttle, or an accessibility violation on the new surfaces_
    - _Preservation: existing required specs and helpers behave as before; `HarnessGate`'s default allowances are unchanged outside the gate (3.22)_
    - _Requirements: 2.31, 2.43, 2.44, 2.45, 3.11, 3.22_

  - [ ] 4.3 Edge two-client check (design R9-c)
    - New `harness/checks/edge_two_clients.py` (`urllib.request` only; header `Host: localhost`) run in two `adapters` containers with `harness/checks` bind-mounted read-only at `/checks`; a new `edge_check` function in `harness/bin/harness` holds client A alive while client B runs, and removes A even on failure
    - Login and register: A exhausted gets 429; B's first request is not 429
    - _Bug_Condition: isBugCondition_R3 where real clients share a bucket behind Caddy_
    - _Expected_Behavior: independent buckets through the real edge_
    - _Preservation: one client still meets the same ceiling_
    - _Requirements: 2.12, 2.45_

  - [ ] 4.4 Configuration checks in CI (design R9-d)
    - `storage_roundtrip_check --expect-private` inside the harness `web` container as part of `journey-gate`
    - A `local-stack-storage` job: copy `backend/.env.local.test.example` to `.env.local.test`, bring up `backend/docker-compose.local-test.yml`, run the round-trip, tear down
    - Confirm the R1 unit configuration tests run in CI's blocking unit step
    - _Bug_Condition: isBugCondition_R9 where no configuration check runs_
    - _Expected_Behavior: both round-trips print `OK`; unit configuration tests block on failure_
    - _Preservation: none affected_
    - _Requirements: 2.1, 2.46_

  - [ ] 4.5 Workflow and required checks (design R9-e)
    - New `.github/workflows/student-journey-gate.yml` triggered on every pull request, push to `main` and dispatch, with no `paths:` filter; each job's first steps compute the changed paths (`git diff --name-only`) and every later step runs only when one is under `apps/admissions/`, `backend/` or `harness/` or is the workflow file, so the required checks report success on unrelated pull requests instead of staying pending; both jobs, artifact upload, log dump on failure and teardown; no `continue-on-error`
    - Operator step (repository settings): make `journey-gate` and `local-stack-storage` required checks on `main`
    - _Bug_Condition: isBugCondition_R9 where admissions or backend changes run no journey_
    - _Expected_Behavior: the gate runs and blocks on every such pull request; it never contacts production_
    - _Preservation: `v2-harness-smoke.yml` and `ci.yml` unchanged_
    - _Requirements: 2.43, 2.46, 2.47_

  - [ ] 4.6 Checkpoint — gate green and stable
    - **Property 9: Expected Behavior** - Journey Gate
    - Run `bash harness/bin/harness journey-gate` locally, then three consecutive green runs of the workflow in CI with no retries; keep each run's `rate-limit-headroom.json`, and treat any 429 as a budget finding inside one spec's window (EC-13), not as harness noise
    - Open one pull request that touches only `docs/` and confirm both required checks report success without running the journey
    - Re-run the broad matrix (`bash harness/bin/harness smoke`) and compare with task 2.5's baseline, counting the three specs that tasks 3.17 and 3.20 updated with their updated steps: no new failure
    - Ask the user if questions arise
    - _Requirements: 2.43, 2.44, 2.45, 2.46, 2.47, 3.22_

- [ ] 5. P0b — decisions and decision documents (R7)
  - **Property 7: Expected Behavior** - Decisions and Decision Documents
  - Starts only after task 4.6 is green
  - Letter behaviour (5.4): decision D9 confirmed 2026-11-08 (option C); like all of task 5 it still starts only after task 4.6 is green
  - _Requirements: 2.36, 2.37, 2.38, 2.39, 2.40_

  - [ ] 5.1 Seeded admins can decide, additively (design R7-a; DEC-11)
    - New `backend/apps/catalog/management/commands/_seed_memberships.py`: the pure `seed_membership_permissions(existing, requested, mode)` (`add` is the union, `replace` is the requested list, `read_only` is `[]`) and the write-and-audit helper both seed commands use
    - `seed_school_admins.py`: `--permissions` (default `review`), `--replace` and `--read-only`, validated before any write; additive by default, so existing permissions are kept and `review` is added; a membership is saved only when it is created, reactivated or its permissions change, and each such change emits one `tenant.membership.permissions_seeded` event with `permissions_before` and `permissions_after` (ids and permission names only); a membership the run does not change is not written and gets no event, while the existing Profile update (role, active, verified, password) still runs as today; the run's audit rows are counted inside its transaction, and a missing row rolls the run back; `--dry-run` prints the same lines and writes nothing; `AccessGrant` rows are never touched
    - `harness_seed_tenants.py`: `decider@<slug>.localhost` per tenant through the same helper with `["review"]`; existing `admin@` accounts unchanged
    - New `backend/tests/unit/test_seed_school_admins_permissions_sjr.py` with the cases in design "Unit Tests"; add the `seed_membership_permissions` property to the hypothesis suite
    - Docs: `.kiro/steering/infrastructure.md:115-120` states that the command adds `review` and removes nothing, and documents `--replace` and `--read-only`; the command's module docstring; `docs/runbooks/multi-tenant-operations.md`; CTM "Admin review workspace contract" (CTM 373-421)
    - _Bug_Condition: isBugCondition_R7 where the admin was created by a seed command_
    - _Expected_Behavior: the seeded admin holds `tenant.application.review` unless `--read-only`; every change is audited with the permissions before and after_
    - _Preservation: capability derivation unchanged; harness isolation specs unchanged (3.1); re-running the documented production command never removes a grant an operator added in the UI and touches no access grant (3.24, task 2.2's seed preservation test)_
    - _Requirements: 2.36, 3.1, 3.24_

  - [ ] 5.2 Approve gate from the backend's resolved set (design R7-b)
    - `paymentStatus.ts`: `APPROVAL_PAYMENT_STATUSES` and `isPaymentResolvedForApproval`
    - `ApplicationApprovalActions.tsx` and `useApprovalActionCommands` use it; new disabled title
    - Frontend parity test with `isPaymentResolvedForProgress`; the backend drift guard from task 1.7 passes
    - Docs: CTM "Force-approved propagation" (CTM 95); "Drift Guard Inventory"
    - _Bug_Condition: isBugCondition_R7 where the payment is deferred and the admin approves_
    - _Expected_Behavior: Approve enabled exactly for `RESOLVED_PAYMENT_STATUSES`_
    - _Preservation: the server gate and `force=true` override unchanged (3.20)_
    - _Requirements: 2.37, 3.20_

  - [ ] 5.3 Conditional approval requires conditions (design R7-c)
    - New `ConditionsDialog.tsx`; "Conditional" opens it
    - `admin_review_views.py`: always route `conditionally_approved` through `ConditionManager.assign_conditions`; list and size checks
    - Update any backend test that posts `conditionally_approved` without conditions, recording that the old acceptance was the defect
    - Docs: CTM "Offer conditions" (CTM 527+) and "Admin review workspace contract"
    - _Bug_Condition: isBugCondition_R7 where Conditional is chosen with zero conditions_
    - _Expected_Behavior: at least one valid condition recorded, or 400 `NO_CONDITIONS_PROVIDED`_
    - _Preservation: valid conditions still assign through `ConditionManager` (3.20); bulk status out of scope (OS-11)_
    - _Requirements: 2.38, 3.20_

  - [ ] 5.4 Letters without a profile say so (design R7-d; decision D9 confirmed 2026-11-08, option C; starts only after task 4.6 is green)
    - `render_context.py`: `has_active_document_profile` using the renderer's own resolution
    - `_generation_status`: `setup_required` with `DOCUMENT_PROFILE_NOT_CONFIGURED` for profile-required types with no profile
    - `officialDocumentPresentation.ts`: "isn't available yet" copy with `resolveTenantSupportContact`; no Prepare, no neutral fallback
    - `harness_seed_tenants.py`: fictional, validated letter profiles for the seeded offerings
    - Docs: CTM "Document profiles…" (CTM 1306-1328); `docs/audits/document-type-audit.md:314-317`; `docs/runbooks/multi-tenant-operations.md`; each marked "D9 confirmed 2026-11-08 (option C)"
    - Existing harness steps that pin the old letter state (1.37), updated in this change. Journey 4 of `official-document-durability.spec.ts` (`:777-800`) clicks the letter's first button and expects the "admissions office has been notified" recovery; it now expects the "isn't available yet" copy and one support link without a click, no Prepare or Try again control, still no mention of a document profile, template or signature, and the same support-link address checks. `student-document-density.spec.ts` approves its application in a school it creates with no letter profile (`:160-226`), so its summary and prominent-control assertions (`:318-331`) follow the letter's new state
    - _Bug_Condition: isBugCondition_R7 where a letter type has no profile_
    - _Expected_Behavior: truthful "not available yet" state; no render without a profile_
    - _Preservation: slip and receipt rendering unchanged (2.40); letters still hard-fail without a profile (3.13)_
    - _Requirements: 2.39, 2.40, 3.13_

  - [ ] 5.5 Extend the gate with the staff decision and the letter
    - Add step 13 of design R9-b to `student-journey-gate.spec.ts`: `decider@` signs in, reviews and approves with the payment deferred; the student opens the acceptance letter (200 PDF from storage)
    - _Bug_Condition: isBugCondition_R9 where the decision loop was never exercised in a browser_
    - _Expected_Behavior: the full journey passes at 390×844 with the limiter on_
    - _Preservation: the P0a steps unchanged_
    - _Requirements: 2.43, 2.45_

  - [ ] 5.6 Verify exploration and preservation tests
    - **Property 7: Expected Behavior** - Decisions and Decision Documents
    - **IMPORTANT**: Re-run the SAME tests from task 1.7 — do NOT write new tests
    - Remove the strict markers from task 1.7's tests, then run them unmarked
    - **EXPECTED OUTCOME**: Tests PASS
    - Re-run tasks 2.2–2.4: PASS, including `test_seed_admins_preservation_sjr.py` against the fixed command (3.24)
    - _Requirements: 2.36, 2.37, 2.38, 2.39, 3.24_

  - [ ] 5.7 Checkpoint — P0b green
    - Three consecutive green runs of the extended gate in CI
    - Full backend unit suite, admissions tests, build and lint: PASS
    - Re-run the broad matrix (`bash harness/bin/harness smoke`) and compare with task 2.5's baseline, counting the specs that tasks 3.17, 3.20 and 5.4 updated with their updated steps: no new failure
    - Ask the user if questions arise
    - _Requirements: 2.36, 2.37, 2.38, 2.39, 2.40, 2.43, 3.22_

- [ ] 6. Production verification — decision D14 confirmed 2026-11-08 (wait for the new production host; do not restore the EC2 stack; P0 is gated in CI meanwhile). **Blocked until a live production host exists**
  - Do not start this task until a live production host exists and the user names it (D14 confirmed 2026-11-08: wait for the new host; the EC2 stack is not restored)
  - Every step is an operator action; no agent writes to the production database
  - _Requirements: 2.47_

  - [ ] 6.1 Pre-deploy checks and backup
    - Confirm the deploy pause from task 2.6 still holds and no Deploy run has been approved since; record the path in force (environment approval or disabled workflow)
    - Read-only: confirm every name in `REQUIRED_ENV_VARS` is set in the production environment (names only, never values), because R1-b now refuses to start without them, including names that `prod.py` used to default; confirm `NUM_PROXIES` and, if needed, `TRUSTED_PROXY_CIDRS` match the edge; confirm CORS origins match the live frontend
    - Read-only counts (P0-ops): `application_documents` rows with `storage_key IS NULL`; rows holding a presigned or legacy-provider URL; NULL snapshots with a current document; user triggers on `applications` (the `pg_trigger` query from task 3.15; if one writes `updated_at`, stop and ask the user)
    - Run `deploy/backup-db.sh` and confirm the backup
    - _Requirements: 2.2, 2.20, 3.16_

  - [ ] 6.2 Approve the first deploy, verify the boot migration, then re-enable automatic deploys
    - Only after task 6.1 has passed, deploy the image containing tasks 3 and 5:
      - preferred path: approve the Deploy run for the `main` commit that contains them, or start one with Run workflow on `main`, and approve both of its jobs;
      - fallback path: re-enable the Deploy workflow and start it at once with Run workflow on `main`. A disabled workflow cannot be run, so re-enabling must come first, and it also re-arms the automatic trigger, so hold merges to `main` until this run succeeds
    - The boot sweep applies `2026_11_02_01_repair_document_snapshot_presence.sql`
    - Re-run the NULL-snapshot count (expect 0) and confirm the migration-history row
    - If the deploy fails, its rollback trap restores the previous images (`.github/workflows/deploy.yml:186-204`). Keep automatic deploys paused (on the fallback path, disable the workflow again) and ask the user before anything else
    - After the deploy succeeds and these checks pass, re-enable automatic deploys:
      - preferred path: remove the required reviewers from `production`. The `environment: production` reference from task 2.7 stays and keeps the deployment history;
      - fallback path: nothing more to do, because the workflow is already enabled; lift the merge hold
    - Tell the user that automatic deploys are back on for every app the workflow ships
    - _Requirements: 2.19, 3.16_

  - [ ] 6.3 Run the journey once against production
    - Use a dedicated test institution and accounts agreed with the user, and a cleanup procedure for the records the journey creates
    - Run `student-journey-gate.spec.ts` once against the production host with production limits and URL lifetime, skipping the steps that need gate-only settings (the 20 s lifetime and the throttle self-check are replaced by a 16-minute wait before reopening)
    - _Requirements: 2.47_

  - [ ] 6.4 Manual device checks
    - On a real iOS Safari device and a real Android device: View after 16 minutes, slip Open, letter Open; record the results
    - _Requirements: 2.21, 2.25_

  - [ ] 6.5 Close the spec
    - When 6.1–6.4 pass, set `"status": "completed"` in `.kiro/specs/student-journey-repair/.config.kiro` (structure steering)
    - _Requirements: 3.21_
