# Student Journey Repair — Bugfix Design

## Overview

The student journey breaks at five points that compound: the documented local stack cannot store a file, the client transport cannot finish an upload on a slow phone link, the backend stores links that expire in 15 minutes, the wizard's Submit handler checks a different readiness from the button's, and nothing in CI runs the journey against real storage. Behind those sit smaller defects that each stop a real user: a rate limiter that probably sees one client behind the proxy, OCR polling that spends the document budget, grades that live only in memory, a session bootstrap that never refreshes, and a staff decision loop that seeded admins cannot use.

The fix keeps the current architecture. Uploads stay server-proxied through Django; storage stays S3-compatible (R2 in production, MinIO locally and in CI); every authority decision still resolves through `AdminCapabilityService` and the scoped resolvers in `backend/apps/common/tenant_authorization.py`. The changes are:

- **Storage truth (R1).** The documented local-test stack gets a MinIO service and a tracked env template. Startup validation moves to `AppConfig.ready()`, where the final settings are visible. A round-trip check and configuration tests run in CI.
- **Transport (R2).** One XHR-based upload method on `ApiClient` gives byte progress, an inactivity timeout instead of a total timeout, at most one keyed retry, and the same CSRF and refresh handling as every other request. The server releases an idempotency key whose attempt did not commit, and reads magic bytes before trusting a generic declared type.
- **Client identity and budgets (R3).** django-ratelimit keys on a trusted-proxy-aware client IP. Document traffic gets per-user DRF budgets, split into reads and writes. OCR polling is bounded, backs off, and stops when no job exists.
- **Keys, not links (R4).** New rows persist object keys only; every response signs at read time; the application snapshot holds the current document id and commits in the same transaction as the version.
- **Viewing (R5).** Every student View and Open control is a plain anchor to one in-app opener route that signs at click time. The workspace lists every current document. Official-document reads prefer an issued copy for students and report signing failures honestly.
- **Submit, grades, deferral (R6).** One readiness computation drives the button and the handler. Grades join the draft machine as a second channel with partial-set autosave. Two payment-hook defects are fixed.
- **Decisions (R7, P0b).** Seeded admins can decide; Approve uses the backend's resolved-payment set through a drift-guarded mirror; Conditional requires conditions; letters without a profile say so.
- **Session and phone (R8), badge (R10).** The student, admin and generic route guards make one refresh attempt through one shared hook before redirecting, and never after a sign-out; one shared MSISDN normaliser accepts local formats; the badge and its wrappers render only on the development server.
- **Gate (R9).** A new blocking CI workflow runs a real-storage browser journey at 390×844 on the harness stack, with the limiter on, a private bucket, a 20-second URL lifetime and a 1 Mbit/s uplink.

No schema change is required. One idempotent data-repair script fills application snapshots left NULL by A-04. This spec adds no feature flag (DEC-9). Automatic production deploys are paused from task 2.6, before the first production-affecting change, until task 6.2 (DEC-10), so merging this spec's work does not change production; see "Rollout Order and Rollback".

## Glossary

- **Bug_Condition (C)**: the input set on which a defect manifests; one per R-group, formalised in bugfix.md "Bug Condition Derivations".
- **Property (P)**: what the fixed code must do for every input in C.
- **Preservation**: behaviour outside C that must stay identical; clauses 3.1–3.24.
- **Deploy pause**: the period from task 2.6 to task 6.2 in which a merge to `main` does not deploy, because the Deploy workflow's jobs need an approval or the workflow is disabled (DEC-10).
- **Documented local-test stack**: `backend/docker-compose.local-test.yml` with `backend/.env.local.test`, run as LOCAL-TESTING.md Part 1. Untracked env file today.
- **Harness**: `harness/docker-compose.harness.yml` (Postgres 17, Redis, MinIO, Mailpit, adapters, web, worker, beat, Caddy), driven by `harness/bin/harness`.
- **Journey gate**: the new blocking CI workflow `.github/workflows/student-journey-gate.yml` (R9).
- **Opener route**: the new student route `/student/documents/open`, the single place a student's View or Open control lands.
- **Object key**: the MediaStorage-relative name returned by `storage.save()` (for example `documents/<application>/<type>/<hex>.pdf`), persisted in `application_documents.storage_key`.
- **Application snapshot columns**: `applications.result_slip_url` and `applications.extra_kyc_url`, `varchar(500)`. The frontend readers treat non-null as "uploaded". The one backend reader, the legacy synthesis in `ApplicationDocumentsView.get`, compares the value with the listed documents; R4-b makes it id-aware.
- **Stage**: a `document_upload_stages` row, the durable ledger of one upload attempt (`document_evidence.open_stage` … `commit_version` / `compensate_stage`).
- **Draft machine**: `WizardDraftController` (`apps/admissions/src/lib/wizardDraftController.ts`), the single owner of draft autosave.
- **Trusted proxy**: an address inside `TRUSTED_PROXY_CIDRS`; only such an address may assert `X-Forwarded-For`.
- **Issued copy**: a stored, system-generated official document whose fingerprint no longer matches today's inputs; served with `historical: true`.
- **Session restore hook**: `useSessionRestoreOnce` (new, `apps/admissions/src/hooks/auth/useSessionRestoreOnce.ts`), the one place a route guard tries the refresh cookie before it redirects to sign-in (R8-a).

## Technology Stack (locked)

Nothing new is introduced. Backend: Django 5, DRF, django-ratelimit 4.1 (`RATELIMIT_IP_META_KEY` callable support, dossier R-6), django-storages `S3Boto3Storage` with boto3 SigV4 presigning, Celery, Redis, Postgres. Frontend: React 18, TypeScript, Vite, React Query, Zustand, React Hook Form with Zod, native `XMLHttpRequest`, native `createImageBitmap` and canvas. Tests: pytest with hypothesis; Vitest with fast-check and Testing Library; Playwright on Chromium with the Chrome DevTools Protocol `Network.emulateNetworkConditions` for the uplink throttle. Infrastructure: the existing harness images (MinIO, Caddy 2) and `minio/minio` added to the local-test compose file. No axios, no tus, no new npm or pip dependency, no new container image beyond MinIO in the local-test stack.

## Key Design Decisions

Each decision lists the alternatives considered and the reason for the choice.

**D-A1 Storage for the documented local stack: MinIO (chosen).** Alternative: wire `USE_LOCAL_FILE_STORAGE` to `FileSystemStorage`. Rejected because `FileSystemStorage.url()` returns a permanent unsigned path, so the local stack would hide every expiry and signing defect (B-01, B-06). MinIO runs the same SigV4 path as R2.

**D-A2 Startup validation: `CommonConfig.ready()` (chosen).** Alternatives: keep the import-time call (cannot see the list, R-1); call the validator at the end of `prod.py` and `staging.py` (rejected: `local_real.py` and `harness.py` import `staging.py`, so the check would fire before their overrides and break both local stacks). `ready()` runs once the final settings module is loaded, in uvicorn, Celery and every `manage.py` command, and `_check_jwt_signing_key()` already uses this hook (`backend/apps/common/apps.py:9-14`).

**D-A3 Snapshot columns hold the current document id (chosen).** Alternatives: widen to `text` and store the key (rejected: `ApplicationSerializer` publishes the columns raw, which would publish internal keys, and it is a schema change); stop writing them (rejected: 24 frontend references in 12 files read them as presence, including draft resume). A UUID is 36 characters, never expires, and keeps "non-null means uploaded" true for those frontend readers. One backend reader compares values instead of testing presence: the legacy synthesis in `ApplicationDocumentsView.get` (`backend/apps/applications/student_document_views.py:130-166`) adds a `legacy:<type>:<application>` row when the snapshot matches no listed `file_url`. A UUID would never match, so R4-b makes that reader id-aware and R4-c stops treating a UUID as an object key.

**D-A4 Client identity in code (chosen).** `RATELIMIT_IP_META_KEY` points at `apps.common.request_utils.get_client_ip`, which trusts `X-Forwarded-For` only from a trusted proxy. Alternative: uvicorn `--forwarded-allow-ips` (rejected as the primary fix: it depends on per-deployment environment, Docker network addresses are dynamic, and pytest cannot exercise it). The code path is one function used by the middleware, its Redis-outage fallback, the DRF throttles and audit hashing.

**D-A5 Per-user document budgets in DRF (chosen).** `RateLimitMiddleware` runs before DRF authentication, and the steering makes DRF the sole authority for `request.user` (R-6). A DRF throttle sees the user.

**D-A6 Upload transport: an `ApiClient.upload()` method backed by XHR (chosen).** Alternatives: fetch with a streamed request body (rejected: needs `duplex: 'half'`, which Safari does not support, and still reports no upload progress); axios (rejected: a new dependency for one call). Putting the method on `ApiClient` keeps one API surface and reuses the CSRF store, `attemptRefresh` and the auth-failure callback.

**D-A7 Viewing through one opener route (chosen).** Alternatives: `window.open('about:blank')` then navigate after signing (rejected: a blank tab on slow links, no app-styled error state, and `noopener` returns no handle); an `href` straight to `GET /documents/{id}/download/` (rejected: a tab opened 30 minutes later carries an expired access cookie, gets a raw JSON 401, and cannot show R5.4's state). The opener is a `student`-guarded SPA route, so its guard restores the session (R8.1), and it signs through `apiClient`, shows honest states, and is a plain anchor that popup blockers never stop.

**D-A8 Grades join the draft machine (chosen).** Alternatives: a separate debounced grade-save hook (rejected: a second autosave owner, against the draft invariant and CTM "Online student drafts"); putting grades in the draft PATCH (rejected: grade rows live in `application_grades` behind their own endpoint and validation). A second fingerprinted channel inside the same serialized command chain keeps one owner and one "Saved" truth.

**D-A9 Session restore in one hook called by every non-public route guard (chosen).** `AuthenticatedRouteShell` sends guard `student` to `StudentRoute`, `admin` to `AdminRoute` and `auth` to `ProtectedRoute` (`apps/admissions/src/components/AuthenticatedRouteShell.tsx:132-144`), and public routes get no guard. No route in `routeRegistry.ts` uses `auth` (12 `admin`, 14 `public`, 9 `student`), so the redirects users actually hit are `StudentRoute.tsx:39-41` and `AdminRoute.tsx:92-94`. The new hook `useSessionRestoreOnce` is called by all three guards before their redirect. Alternatives: one `SessionRestoreBoundary` around the non-public cases in `AuthenticatedRouteShell` (rejected: equivalent at runtime, but the restore would then live in dispatch code that guard tests do not render, and each guard's three-state logic would no longer show its own redirect condition); a `refreshable` hint from `SessionView` (rejected: backend change, and it would make public pages refresh); refresh on every bootstrap (rejected by R-16). Public routes render no guard, so they never call the hook.

**D-A10 Approval gate mirror with a drift guard (chosen).** R7.2 asks for one shared definition. The frontend constant `APPROVAL_PAYMENT_STATUSES` mirrors `RESOLVED_PAYMENT_STATUSES`; a backend test parses the TypeScript literal, the pattern `backend/tests/unit/test_payment_phase_8_2.py` already uses. Driving the control from the review workspace's `allowed_transitions` was considered and deferred: the control has several call sites that do not receive the workspace payload.

**D-A11 Browser-reachable signing endpoint (chosen).** New optional setting `S3_PUBLIC_ENDPOINT_URL` is used only to presign URLs handed to browsers; unset means the storage endpoint. In production R2 has one endpoint, so nothing changes; in the harness and local stack the browser reaches MinIO at its published host port, which today forces the harness to stub storage (`official-document-durability.spec.ts:418-432`).

**D-A12 Missing-OCR-job signal (chosen).** The extract endpoint sets `extraction_state = 'pending'` before enqueueing, a value the existing check constraint already allows (`backend/scripts/2026_07_26_01_document_evidence_lifecycle.sql:130-134`), and `/info/` publishes it as `ocr_state: "ocr_pending"`. A document whose `ocr_state` is null therefore has no job, and polling stops. No schema change.

**D-A13 Student read precedence for official documents (chosen).** For a student, an issued copy wins over an open or failed refresh; staff precedence is unchanged. Alternative: add an `issued_copy` block to the envelope (rejected: a contract change on every consumer for a student-only rule).

**D-A14 Badge gate on `import.meta.env.DEV` (chosen).** Alternative: a `VITE_SHOW_BUILD_BADGE` flag (rejected: DEC-9, and production must never show it). Vite replaces the constant, so the badge code and its `/health/live/` probe drop out of production bundles.

**D-A15 R2.6 under DEC-1.** Deleting three unused stacks is removal, which DEC-1 excludes. The single-path requirement is enforced by a source-scan test with an explicit list of the dead references present at HEAD; any new reference fails. Spec B S2 deletes them.

**D-A16 Repair NULL snapshots with an idempotent data script (chosen).** A-04 left committed documents without snapshots. A replay heals one row when the student retries; the script heals all rows at once. It fills NULLs only, does not set `updated_at` (an `updated_at` change retires a slip fingerprint, R-11), and is re-runnable. "Does not set" holds only if no `BEFORE UPDATE` trigger on `applications` writes `updated_at`; the tracked SQL creates none, but the live schema predates the repo, so task 3.15 checks `pg_trigger` and compares `updated_at` before and after on the Neon branch.

## Bug Details

The formal conditions are in bugfix.md "Bug Condition Derivations". The examples below are the reproductions the critique recorded.

### Examples

- **R1** — On the local-test stack, an NRC upload returns `500 STORAGE_ERROR`; Next then says "An NRC or Passport document is required before proceeding" (C-02; `logs/storage-probe.log`). Expected: 201 against the stack's MinIO.
- **R2** — A 4.72 MB file at 1 Mbit/s is aborted at 30 s eight times and ends in "Request timed out" after 4 min 35 s (A-03). Expected: one POST, about 38 s, determinate progress.
- **R2** — A PDF declared `application/octet-stream` gets "Unsupported file type" (A-10). Expected: 201 with `mime_type = application/pdf`.
- **R3** — Two curl clients behind a Caddy container share one login bucket (B-11, `evidence/b-docview/31-ratelimit-shared-bucket-behind-proxy.txt`). Expected: separate buckets.
- **R3** — With no worker, one result-slip upload runs 30 polls and the NRC upload then gets 429; the lockout survives reload for 10 minutes (A-02). Expected: polling stops within 10 polls, the NRC upload succeeds.
- **R4** — An identity file with a long name returns 500, the retry shows "Saved", and the workspace never lists it (A-04, B-02). Expected: 201 and the document listed.
- **R5** — "View" 16 minutes after upload opens "AccessDenied / Request has expired" with the bucket name and the filename in the key (B-01). Expected: the file opens.
- **R5** — After an admin moves the application to `under_review`, "Download Slip" needs a regeneration (B-09). Expected: the issued slip opens.
- **R6** — On the production build, Submit shows "Complete the remaining requirements before submitting: Assigned school" and sends nothing (C-01). Expected: `POST …/submit/` and the submitted state.
- **R6** — 5 grades entered, page reloaded, 0 grades shown (C-05). Expected: 5 grades.
- **R7** — The seeded MIHAS admin gets 403 on `POST …/review/` (C-10); Approve is disabled for a deferred payment (C-11).
- **R8** — After 30 idle minutes a page load shows Sign in while the 7-day refresh cookie is valid (C-13). Registering with `0971234567` shows a raw `phone:` key (C-14).
- **R10** — The production build shows "Runtime · Frontend verify-final · Backend 2.0.0" on the dashboard (C-18).

## Expected Behavior

### Preservation Requirements

**Unchanged behaviours** (clauses 3.1–3.24): tenant isolation and masking; seed re-runs that never remove a permission an operator granted; the single payment path and webhook deduplication; payment status normalisation, ownership split, the double-charge guard and deferral at submit; CSRF, cookie auth, token lifetimes and the replay rule; every upload rejection code and the staged write order; versioning semantics; multi-draft intents and answer autosave; idempotent submission and the disabled Submit while blockers hold; the response envelope; no PII in logs; mobile and accessibility rules; deterministic OCR without AI; backend-only official documents with neutral fallback; admin document viewing and official-download audit; slip and receipt generation and terminal reads; additive SQL with Neon first; payment and extract throttles; `+260` phones; session behaviour outside the restore case; review-decision rules; the canonical map rule; the broad harness matrix; wizard step gating.

**Scope.** Every input outside the bug conditions must behave exactly as before. In particular:
- requests from a single client hit the same per-scope ceilings as before;
- an upload that already succeeds in one attempt sends one POST, as before;
- admin document views, official-document generation for staff, and terminal-application reads are unchanged;
- a not-ready application keeps Submit disabled;
- the wizard's progress percentage shows the same number as before (Spec B V3 changes it);
- public pages send no refresh request, and no route guard sends one after a sign-out;
- a reviewer still gets the masked 404 from the document extract and delete commands;
- admin official-document downloads behave as before (OS-15);
- re-running the documented `seed_school_admins` command removes no permission and touches no access grant (3.24);
- the broad harness matrix keeps its limiter, bucket and URL settings. Three of its required specs drive the student slip controls (`official-document-durability.spec.ts`, `student-document-density.spec.ts`, `student-lifecycle-golden.spec.ts`), so they are updated with R5 (tasks 3.17 and 3.20), and the first two again with R7-d (task 5.4).

**Two deliberate contract strengthenings**, recorded so reviewers see them:
1. The document list and the required-documents contract answer a non-owner student with the masked 404 instead of 403 (2.29).
2. `conditionally_approved` without conditions is refused on the review endpoint (2.38).

**Intended changes outside the student surface:**
- The admin and generic route guards make the same one-shot session restore as the student guard, because they share the hook (R8-a) and C-13 was also seen on the tenant-admin desktop walk.
- Anonymous DRF throttle identities move from DRF's raw `X-Forwarded-For` string to the trusted-proxy client IP (2.12).

**Unchanged outside the student surface:** admin official-document controls. Admin panels use `useAdminOfficialDocuments`, which still opens a document after one GET (`apps/admissions/src/hooks/useAdminOfficialDocuments.ts:203`); `AdminOfficialDocumentsPanel.tsx:11` imports only a type from `useOfficialDocument`. 2.25 covers the student UI, and an admin opener is OS-15.

## Root Cause

The archived template names this section "Hypothesized Root Cause". Every cause below is Confirmed at HEAD `4a6c4ef` unless labelled.

1. **R1.** `STORAGES['default']` reads `S3_*` with empty defaults (`base.py:361-367`, `:379-391`), and no local settings module or compose file supplies storage. The validator runs mid-import and reads lazy settings that cannot see the list (`base.py:832-835`; `env_validator.py:22`; R-1, Likely at runtime). Documented knobs were never wired, and the local env file has no tracked template.
2. **R2.** Uploads go through the generic fetch pipeline: a 30-second total timeout (`retry.ts:10`; `client.ts:195`), 3 retries (`client.ts:196-237`), plus the hook's retry (`useRequiredDocuments.ts:265-270`). Fetch cannot report request-body progress (R-13). No key is sent (`requiredDocuments.ts:90-118`), and the stage ledger never releases a key from an uncommitted attempt (`document_evidence.py:475-580`). The declared type gate runs before the magic bytes (`document_storage_views.py:345-364`).
3. **R3.** django-ratelimit's `key="ip"` reads `REMOTE_ADDR` (`middleware.py:360`), which behind Caddy is the proxy. Document reads and writes share one 20/10m scope (`:280`). The OCR hook starts polling unconditionally (`useWizardController.ts:600-614`), cannot tell "no job" from "queued", and retries every poll 3 times (`documents.ts:62-71`).
4. **R4.** The upload view persists `storage.url()` (`document_storage_views.py:498`, `:552`) and writes the snapshot after the version commit, outside its transaction (`:592-601`). Condition evidence does the same (`backend/apps/applications/condition_evidence_service.py:720`, `:744`), and so does official-document generation (`backend/apps/applications/tasks/pdf_generation.py:211`, passed to `commit_version` at `:222`). Signing derives keys from `file_url` (`storage.py:89-118`).
5. **R5.** The workspace renders stored URLs as links (`DocumentChecklist.tsx:31-36`, `:63-68`) from two snapshot columns (`:6-9`). The nav entry lacks `desktop` (`routeRegistry.ts:221-236`). Official-document signing failures are swallowed (`official_document_views.py:317-346`). The official-document hook opens tabs after awaits (`useOfficialDocument.ts:254-298`). The read-existing path applies only when issuance is refused (`:490`). Summary copy is computed from issuability (`officialDocumentPresentation.ts:174-187`). Document scoping compares `role == "admin"` (`document_storage_views.py:104-105`), and the two list views answer non-owners with 403 (`student_document_views.py:109-114`, `:236`).
6. **R6.** `buildWizardReadiness` defaults `assignmentResolved` to `false` (`wizardReadiness.ts:116`), and the handler omits it and `requiredDocumentItems` (`useWizardSubmission.ts:116-124`). Grades have no autosave path: the batch endpoint refuses partial sets (`student_submission_views.py:403-420`), and the outbox was minimised on the assumption that resume reads grades from the server (`draftOutbox.ts:1-14`). `usePaymentStatus` never re-arms `mountedRef` (`:95`). `PaymentForm` and `PaymentStep` do not clear recovery on deferral (`PaymentForm.tsx:190-243`; `PaymentStep.tsx:83-100`).
7. **R7.** Both seed commands write `permissions: []` (`seed_school_admins.py:117-134`; `harness_seed_tenants.py:211-216`). The Approve gate tests `normalized === 'verified'` (`ApplicationApprovalActions.tsx:77`). The Conditional button sends no conditions (`:192-194`), and the view skips `assign_conditions` for an empty payload (`admin_review_views.py:803`). The GET status never pre-checks profiles, so a profile-less letter reads `not_requested` and the summary calls it ready.
8. **R8.** The route guards redirect as soon as `useAuth().user` is null (`StudentRoute.tsx:39-41`, `AdminRoute.tsx:92-94`; `ProtectedRoute.tsx:53-56` has the same rule but no route uses it); no code path refreshes on a 200 `authenticated:false` (`authQueries.ts:84-95`). The phone regex accepts only `+260` (`validators.py:15`), the messages interpolate the value (`:16-18`, `:26-28`), and `signUp` returns only `error.message` (`useSessionListener.ts:196`).
9. **R9.** The only real-storage browser suite runs on dispatch and harness paths (`v2-harness-smoke.yml:22-37`), with the limiter off (`harness.py:90`), an anonymous bucket (`docker-compose.harness.yml:75`) and a stubbed object store (`official-document-durability.spec.ts:418-432`).
10. **R10.** `BuildVersionBadge` has no environment gate (`BuildVersionBadge.tsx:16-82`).

## Correctness Properties

Property 1: Bug Condition — R1 Storage and environment truth

_For any_ start of the documented local-test stack, the storage round-trip succeeds; _for any_ production or staging start with an empty `S3_*` variable, startup is refused naming the variable and printing no value; _for any_ documented env name, a reader or an allowlist reason exists.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Bug Condition — R2 Upload transport and server acceptance

_For any_ file up to 10 MiB sent over an uplink of at least 1 Mbit/s, the upload completes with one POST when nothing fails and at most two otherwise, progress is determinate and monotonic, a key from an uncommitted attempt is accepted, and a generic or aliased declared type is decided by the magic bytes.

**Validates: Requirements 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11**

Property 3: Bug Condition — R3 Client identity, budgets and polling

_For any_ set of distinct real client addresses arriving through a trusted proxy, each address has its own bucket in every middleware scope; _for any_ authenticated document request, the per-user read or write budget applies; _for any_ OCR job state, polling sends at most 10 requests and none when no job exists; _for any_ 429, the UI shows a retry time.

**Validates: Requirements 2.12, 2.13, 2.14, 2.15, 2.16**

Property 4: Bug Condition — R4 Keys, not links

_For any_ upload, no persisted column holds an expiring URL, the snapshot equals the current document id in the same transaction, and _for any_ persisted value shape (key, presigned URL, legacy-provider URL), the opener resolves a working URL or an honest error.

**Validates: Requirements 2.17, 2.18, 2.19, 2.20**

Property 5: Bug Condition — R5 Viewing

_For any_ owner or in-scope assigned reviewer and any time after upload, View opens the current version; _for any_ application, the documents list shows each listed document once and a legacy row only for a snapshot no listed document covers; _for any_ non-owner student, every document surface returns its masked 404; _for any_ signing failure, the copy is "can't be opened right now" with Retry; _for any_ issued slip, a student can open it whatever the application status.

**Validates: Requirements 2.21, 2.22, 2.23, 2.24, 2.25, 2.26, 2.27, 2.28, 2.29, 2.30**

Property 6: Bug Condition — R6 Submit, grades and deferral

_For any_ combination of readiness inputs, the button's readiness equals the handler's; _for any_ grade edit sequence, the server's grade set after the debounce equals the syncable rows on screen, and "Saved" implies nothing is pending; _for any_ server-confirmed deferral, Next is enabled and no recovery entry remains.

**Validates: Requirements 2.31, 2.32, 2.33, 2.34, 2.35**

Property 7: Bug Condition — R7 Decisions (P0b)

_For any_ seed run without `--read-only`, every targeted admin holds `review` afterwards, and each membership the run creates, reactivates or changes has exactly one audit event recording its permissions before and after; _for any_ payment status, the Approve control is enabled exactly when the status is in `RESOLVED_PAYMENT_STATUSES`; _for any_ Conditional decision, at least one valid condition is recorded or the command is refused; _for any_ letter without a profile, the student copy says it is not available yet.

**Validates: Requirements 2.36, 2.37, 2.38, 2.39, 2.40**

Property 8: Bug Condition — R8 Session and phone

_For any_ student, admin or generic guarded route load with an expired access token and a valid refresh token, the app makes one refresh request and shows no sign-in page, and after a sign-out no guard makes one; _for any_ supported Zambian MSISDN shape, both normalisers return the same `+260` value, and _for any_ invalid input, no message contains the input.

**Validates: Requirements 2.41, 2.42**

Property 9: Bug Condition — R9 Journey gate

_For any_ pull request touching admissions, backend or harness paths, the gate runs and fails when Submit sends no request, a reopened document fails, a raw unsigned URL is served, a 429 or 5xx occurs, or the throttle is not applied.

**Validates: Requirements 2.43, 2.44, 2.45, 2.46, 2.47**

Property 10: Bug Condition — R10 Badge

_For any_ production build, no badge renders and no `/health/live/` version request is made.

**Validates: Requirements 2.48**

Property 11: Preservation — Authority, payments and auth

_For any_ request outside the bug conditions, tenant scoping, payment state transitions, CSRF and refresh behaviour produce the same results as before the fix; _for any_ set of permissions an existing membership holds, re-running the documented seed command without `--read-only` or `--replace` keeps all of them and emits no event when it adds nothing.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.17, 3.19, 3.20, 3.24**

Property 12: Preservation — Documents and drafts

_For any_ upload that the current code accepts or rejects, the acceptance and the rejection code are unchanged (except the generic-type cases in C); versioning, replay identity, draft intents and answer autosave are unchanged.

**Validates: Requirements 3.5, 3.6, 3.7, 3.8, 3.12, 3.13, 3.14, 3.15**

Property 13: Preservation — Contracts and conventions

_For any_ API response, the envelope shape is unchanged; no log line gains PII; accessibility rules hold, including WCAG AA contrast and use at 390×844 without horizontal scrolling on every student surface this spec adds or changes; the canonical map registers every new mirror.

**Validates: Requirements 3.9, 3.10, 3.11, 3.16, 3.18, 3.21, 3.22, 3.23**

## Fix Implementation

### Changes Required

Every defect block has the same fields: bug condition, expected behaviour, root cause at HEAD, the file-level fix, errors and validation, schema impact, rollout and rollback, observability without PII, and the canonical truth map (CTM, `docs/canonical-truth-map.md`) and steering entries the change must update. CTM line numbers are at HEAD.

---

### R1 — Storage and environment truth

#### R1-a The documented local-test stack has no object storage (A-01) — clauses 1.1 → 2.1

- **Bug condition:** the local-test stack starts with `S3_*` unset, so `default_storage` has an empty endpoint.
- **Expected:** a write → read → sign → fetch → delete round-trip succeeds against a private MinIO bucket in that stack.
- **Root cause:** `base.py:361-367`, `:379-391`; `backend/docker-compose.local-test.yml` defines only postgres, redis, web and celery; `USE_LOCAL_FILE_STORAGE` is read by nothing.
- **Fix:**
  - `backend/docker-compose.local-test.yml`: add `minio` (same image reference as the harness, `minio/minio:latest`; ports `127.0.0.1:9000:9000` and `127.0.0.1:9001:9001`; named volume `minio-localtest-data`; healthcheck on `/minio/health/live`) and `minio-setup` (`minio/mc:latest`) that creates bucket `mihas-localtest` and applies **no** anonymous policy. Add an `environment:` block to `web` and `celery`, which takes precedence over `env_file`: `S3_ENDPOINT_URL=http://minio:9000`, `S3_PUBLIC_ENDPOINT_URL=http://localhost:9000`, `S3_BUCKET=mihas-localtest`, and `S3_ACCESS_KEY` / `S3_SECRET_KEY` equal to the MinIO root user and password declared in the same file. These are fixed, clearly fictional local values bound to 127.0.0.1, in the same category as `harness/harness.env`. `web` and `celery` depend on `minio-setup` completing successfully.
  - `backend/apps/common/storage.py`: add `get_presign_client()`, a second cached client built like `_build_s3_client()` but with `endpoint_url=settings.AWS_S3_PUBLIC_ENDPOINT_URL`; `generate_signed_url()` uses it. Signing is a local computation, so the public host need not be reachable from the backend.
  - `backend/config/settings/base.py`: `AWS_S3_PUBLIC_ENDPOINT_URL = os.environ.get("S3_PUBLIC_ENDPOINT_URL", "").strip() or AWS_S3_ENDPOINT_URL`; `AWS_QUERYSTRING_EXPIRE` read from `S3_SIGNED_URL_TTL_SECONDS` (integer, default 900, allowed 10–3600).
  - New command `backend/apps/common/management/commands/storage_roundtrip_check.py`. It writes `healthchecks/<uuid4>.txt` (32 random bytes) through `MediaStorage`, reads it back and compares, signs it with the **internal** client and GETs it with `requests` (expects 200 and identical bytes), optionally (`--expect-private`) GETs the unsigned object URL and expects 403, deletes it, and confirms `exists()` is false. It prints one line per step name and a final `OK`/`FAILED`; it never prints keys, URLs, bucket names or credentials. Exit code 0 or 1.
- **Errors and validation:** `S3_SIGNED_URL_TTL_SECONDS` that is not an integer or is outside 10–3600 raises `ImproperlyConfigured("S3_SIGNED_URL_TTL_SECONDS must be an integer between 10 and 3600")` at import: fatal, by design, in every environment. `S3_PUBLIC_ENDPOINT_URL` must start with `http://` or `https://`, else `ImproperlyConfigured` naming the variable. In the round-trip command each failed step prints `FAILED <step>`, logs at ERROR with the step name, exits 1, and still attempts the delete; a failed delete is reported, never hidden.
- **Schema:** none.
- **Rollout / rollback:** local and CI only; production is unaffected because `S3_PUBLIC_ENDPOINT_URL` is unset there and the TTL default stays 900. Rollback is a revert.
- **Observability:** the command's step lines; no new runtime events.
- **CTM / steering:** CTM "Platform Identity, Routes, and Operational Config" (CTM 60-73) gains an "Object storage" row (endpoint, public signing endpoint, URL lifetime setting, private bucket, round-trip check). `tech.md` Backend table "Storage" row adds "MinIO locally and in CI; `S3_PUBLIC_ENDPOINT_URL` for browser-facing signatures". `LOCAL-TESTING.md` isolation table (`:23`) and Parts 1–2; `docs/runbooks/local-parity.md`; `deploy/.env.prod.example` comments for the two new optional variables.

#### R1-b Startup validation cannot see its list (R-1) — clauses 1.2 → 2.2

- **Bug condition:** production or staging starts with an empty `S3_*` variable.
- **Expected:** the process refuses to start, naming the variable.
- **Root cause:** `base.py:832-835` calls `validate_required_env_vars()` during base.py's import; `env_validator.py:22` reads `django.conf.settings`, whose lazy setup builds from the partially imported module. Likely; proven by the new subprocess test before the fix.
- **Fix:**
  - `base.py`: delete the import-time call (keep the `_is_testing` cache block); add `STARTUP_ENV_VALIDATION = False` and `IS_TEST_PROCESS = _is_testing`.
  - `prod.py` and `staging.py`: `STARTUP_ENV_VALIDATION = True`. `local_real.py`: `STARTUP_ENV_VALIDATION = False` (it is a local stack; `harness.py` inherits it). Today the check is a no-op everywhere, so turning it off for local stacks is no regression.
  - `env_validator.py`: `validate_required_env_vars(required: Iterable[str] | None = None)`; `None` keeps reading settings, so the existing tests under `override_settings` keep working.
  - `backend/apps/common/apps.py`: `ready()` calls `_check_required_env_vars()`, which runs `validate_required_env_vars(settings.REQUIRED_ENV_VARS)` when `settings.STARTUP_ENV_VALIDATION` is true and `settings.IS_TEST_PROCESS` is false.
  - The Docker build step that runs `collectstatic` already exports placeholder values for every required variable (`backend/Dockerfile:40-55`), so the image still builds.
- **Errors and validation:** missing or whitespace-only variables raise `ImproperlyConfigured("Missing or empty required environment variable(s): S3_BUCKET, …")`. Fatal. Django prints the traceback to stderr; the message contains names only.
- **Schema:** none.
- **Rollout / rollback:** this is the one change that can stop a misconfigured production container. That is the intent, but note the scope: the check enforces the whole `REQUIRED_ENV_VARS` list (`base.py:798-810`), which has never actually been enforced (R-1), not only the four `S3_*` names. A production environment that relies on a settings default for one of those names (for example `ALLOWED_HOSTS`, which `prod.py` defaults) would now refuse to start. Two rules follow. First, a name that is genuinely optional in an environment is removed from `REQUIRED_ENV_VARS` in this change, never satisfied with a dummy value. Second, before the deploy that ships this change, the operator confirms every listed name is set (task 6.1). Merging this change is not that deploy: automatic deploys are paused from task 2.6 (DEC-10), so it first reaches production through the approved deploy in task 6.2. If that deploy still fails, the Deploy workflow's rollback trap re-pins the previous images and restarts them (`.github/workflows/deploy.yml:186-204`). Rollback: revert, or set the missing variable.
- **Observability:** the refusal message on stderr; nothing at runtime.
- **CTM / steering:** CTM operational-config "Object storage" row (above) states "prod and staging refuse to start without `S3_*`". `tech.md` Verification Expectations names the subprocess test.

#### R1-c Unread env knobs and no tracked template (A-01, Bring-up 1–3) — clauses 1.3 → 2.3

- **Bug condition:** a documented variable has no reader.
- **Expected:** a test fails until every documented name is read or allowlisted with a reason.
- **Root cause:** `USE_LOCAL_FILE_STORAGE` and `CELERY_TASK_ALWAYS_EAGER` have no reader; `EMAIL_BACKEND` is a constant only in `harness.py:96`; `backend/.env.local.test` is gitignored (`backend/.gitignore:10`) with no template.
- **Fix:**
  - New tracked `backend/.env.local.test.example` listing exactly the variables the local-test stack reads, with placeholder values only. `backend/.gitignore` gains `!.env.local.test.example`. `backend/tests/unit/test_tracked_env_files.py` adds it to its allowlist.
  - `dev.py`: `EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")`, Django's default, so behaviour is unchanged when unset; the template sets the console backend.
  - The template omits `USE_LOCAL_FILE_STORAGE` and `CELERY_TASK_ALWAYS_EAGER`; LOCAL-TESTING.md Part 1 tells developers with an existing `.env.local.test` to delete those two lines.
  - New test `backend/tests/unit/test_documented_env_vars_are_read.py`. Sources: the four tracked templates and `NAME=` lines inside fenced blocks of `LOCAL-TESTING.md`. A name counts as read when its quoted form appears in `backend/**/*.py` outside `tests/`, or it appears as `${NAME`, `$NAME` or `NAME:` in `backend/docker-compose*.yml`, `backend/Dockerfile`, `deploy/**`, `harness/**` or `.github/workflows/**`. Anything else must be in `ALLOWLIST: dict[str, str]` with a reason (for example `POSTGRES_PASSWORD`: "read by the postgres image"). Names that are planned placeholders in the steering (Telegram) are allowlisted with that reason; other unread names are removed from the template.
- **Errors and validation:** the test reports every unread name in one failure message.
- **Schema:** none.
- **Rollout / rollback:** documentation and test only.
- **Observability:** none.
- **CTM / steering:** `tech.md:552` and `product.md:187` say only `.env.example` and `.env.scripts.example` are tracked; both are already stale (`deploy/.env.prod.example` and `backend/.env.example` are tracked) and must list the real set, including the new template.

#### R1-d A fresh database has no catalogue or fee (R-5) — clauses 1.4 → 2.4

- **Bug condition:** a database built by the documented local path.
- **Expected:** one seed step yields an applyable offering with a resolvable fee.
- **Root cause:** LOCAL-TESTING Part 2 seeds only subjects; `harness_seed_tenants.py:162` sets only `programs.application_fee`.
- **Fix:**
  - `harness_seed_tenants.py` creates, idempotently, one `ProgramFee(program=offering, fee_type="application", residency_category="local", amount=Decimal("153.00"), currency="ZMW", is_active=True)` per seeded offering (`get_or_create` on program, fee type and residency; it respects `uq_program_fees_one_active`).
  - The command's existing refusal list (`:78-84`) also refuses when `DJANGO_SETTINGS_MODULE` ends in `.prod` or `ENVIRONMENT=production`.
  - LOCAL-TESTING.md Part 2 adds the step `python3 manage.py harness_seed_tenants --tenant-admin-password <local value>` and explains it creates two example tenants (MIHAS and KATC example records on `*.localhost`) with an open intake and a fee. Part R3's stale fee note is corrected: fees come only from `program_fees`.
- **Errors and validation:** a non-local database or production settings → `CommandError` before any write; missing password → existing `CommandError`. All writes are in one `transaction.atomic()`; any failure rolls back the whole seed.
- **Schema:** none.
- **Rollout / rollback:** local and harness only. The harness also gains the fee rows, so journeys no longer need to configure fees through the API, although the existing API-configured fees keep working because `get_or_create` matches them.
- **Observability:** the command's success lines (codes and hostnames only).
- **CTM / steering:** CTM "Server-authored fee quote" (CTM 166) notes that seeds create canonical fee rows; `docs/runbooks/local-parity.md`.

---

### R2 — Uploads that survive phone networks

#### R2-a Total timeout, layered retries and no progress (A-03, A-07, C-02) — clauses 1.5–1.7 → 2.5–2.7

- **Bug condition:** an upload whose transfer outlasts 30 s, or any failed upload.
- **Expected:** no abort while bytes flow; determinate progress; at most one keyed automatic retry; the first failure's code in the message.
- **Root cause:** `retry.ts:10,14,16,45`; `client.ts:195-237`; `useRequiredDocuments.ts:225-228`, `:265-270`.
- **Fix:**
  - New module `apps/admissions/src/services/uploadTransport.ts` exporting `sendMultipart(options)` and `UploadTransportError` (`status: number | null`, `code: string`, `retryable: boolean`, `retryAfterSeconds: number | null`). New method `ApiClient.upload<T>(endpoint, formData, { idempotencyKey, onProgress, signal })` in `client.ts` delegates to it, so `apiClient` stays the only API surface.
  - `sendMultipart` uses `XMLHttpRequest`:
    - `open('POST', API_BASE + toApiV1Path(endpoint))`, `withCredentials = true`, headers `Accept: application/json`, `Idempotency-Key`, and `X-CSRF-Token` from `getCsrfToken()` when present.
    - Inactivity timer `UPLOAD_INACTIVITY_TIMEOUT_MS = 30_000`, re-armed on every `xhr.upload.onprogress`. On `xhr.upload.onload` it is replaced by `UPLOAD_RESPONSE_TIMEOUT_MS = 60_000`. Expiry calls `xhr.abort()` and raises `UPLOAD_STALLED` (retryable). There is no total timeout.
    - `onProgress({ loaded, total })` from `xhr.upload.onprogress` when `lengthComputable`.
    - On load it stores any `X-CSRF-Token` response header with `setCsrfToken`, and parses the envelope:
      - 2xx → resolve `data`.
      - 401 on a non-auth endpoint → one `attemptRefresh()`; on success, resend once with the same key and the fresh CSRF token; on failure, call the registered auth-failure callback when `shouldDispatchAuthFailure()` allows it and reject with `AuthenticationError`.
      - 403 with code `CSRF_INVALID`, `CSRF_MISSING` or `CSRF_VALIDATION_FAILED` → one `refreshCsrfToken()` and one resend.
      - 429 → `RATE_LIMITED`, not retryable, `retryAfterSeconds` from `Retry-After`.
      - 409 `DOCUMENT_UPLOAD_IN_PROGRESS` → retryable.
      - Other 4xx → the envelope's `code`, retryable only when the body says `retryable: true`.
      - 5xx → retryable.
    - `onerror` → `NETWORK_ERROR` (retryable). An abort through `signal` → `ABORTED` (not retryable).
  - `apps/admissions/src/services/csrf.ts`: extract `refreshCsrfToken(signal?)` (the `?refresh_csrf=1` session GET and `setCsrfToken`) from `recoverCsrfAndRetry`, which then calls it. The recovery contract is unchanged (3.4).
  - `requiredDocuments.ts` `upload()` takes `{ applicationId, documentType, file, idempotencyKey, onProgress, signal }` and calls `apiClient.upload('/documents/upload/', …)`.
  - `useRequiredDocuments.ts` `runUpload`:
    - creates `idempotencyKey = crypto.randomUUID()` once per user-initiated upload; falls back to `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}` when `crypto.randomUUID` is absent;
    - forwards progress as `progress: Math.floor(loaded * 100 / total)`, throttled to at most one state update per 250 ms or per 2 points;
    - keeps one automatic retry: only when the first error is retryable and its code is not `RATE_LIMITED`, after 2 s, with the same key;
    - on final failure shows the copy for the **first** error's code.
  - `RequiredDocumentsPanel.tsx` / `FileUpload` render a determinate progress bar (`role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow`) while uploading, and the panel's polite `aria-live` region announces "<Label> uploaded" or "<Label> did not upload: <message>".
  - Copy for client-only codes in `apps/admissions/src/lib/requiredDocuments.ts` next to the existing rejection copy: `UPLOAD_STALLED` "The upload stopped. Check your connection and try again."; `NETWORK_ERROR` "We could not reach the server. Check your connection and try again."; `RATE_LIMITED` from the shared rate-limit copy (R3-d); `DOCUMENT_UPLOAD_IN_PROGRESS` "This upload is still being processed. Try again in a minute."
- **Errors and validation:** as listed. Every failure is recoverable by the student choosing the file again; no failure is fatal. Logging: the existing `logger.warn('Required-document upload failed', { documentType, code })` stays, with sanitised values only and never the filename.
- **Schema:** none.
- **Rollout / rollback:** frontend only; ships with the backend key-release fix (R2-b) in the same deploy so a retry with the same key is accepted. Rollback: revert; the server accepts both keyed and unkeyed uploads.
- **Observability:** a frontend log line for the final failure with `{ code, attempt, status }`; no URL, filename or size.
- **CTM / steering:** rewrite "Progress is honest" (CTM 1140-1143): the upload transport now reports byte progress, and the indeterminate state remains only before the first progress event. Add the client-only transport codes to "Document upload rejection codes" (CTM 980-997) marked "frontend-only, no backend mirror". `tech.md` "Conventions For New Code": uploads go through `apiClient.upload`, never `fetch`.

#### R2-b A key from an uncommitted attempt returns 409 forever (A-06) — clauses 1.8 → 2.8

- **Bug condition:** a retry carries the key of an attempt that ended compensated, compensation pending, write failed or orphaned.
- **Expected:** the retry is accepted and stores the document.
- **Root cause:** `document_evidence.py:475-512` (only committed stages replay), `:515-563` (`open_stage` raises on the unique index), `:566-580` (`mark_stage` never clears the key); index at `2026_07_26_01_document_evidence_lifecycle.sql:245-247`.
- **Fix:**
  - `document_evidence.mark_stage`: when the new state is `compensated`, `compensation_pending`, `write_failed` or `orphaned` and the stage holds a key, set `idempotency_key = None` in the same save, append `"; idempotency key released"` to `last_error` (still bounded by `_truncate`), and emit `document.stage.idempotency_released`. The stage keeps its object key, hash, actor and history, so reconciliation and audit are unaffected. A `staged` stage keeps its key, so an in-flight duplicate still gets the retryable 409.
  - `DocumentUploadView.post`: when the header is present it must be 8–128 characters of `[A-Za-z0-9._:-]`. Otherwise the view returns 400 `VALIDATION_ERROR` with `details: {"Idempotency-Key": ["Use 8 to 128 letters, digits, dots, colons, underscores or hyphens."]}`, which does not echo the value.
- **Errors and validation:** as above. A key reused while its first attempt is still `staged` returns the existing retryable 409 and writes nothing.
- **Schema:** none. A data-only release, so the routine test database (which recreates the index in `backend/tests/conftest.py:173-174`) behaves like production.
- **Rollout / rollback:** backend only. Rollback: revert; released keys stay NULL, which is harmless.
- **Observability:** the `document.stage.idempotency_released` event through `emit_metric`, with stage id and document type only.
- **CTM / steering:** "Upload replay identity" (CTM 1161): a key is replayable only from a committed stage and is released when its stage ends uncommitted. "Stable document command codes" (CTM 1166): `DOCUMENT_UPLOAD_IN_PROGRESS` now means "an attempt with this key is still in flight".

#### R2-c Declared type checked before magic bytes (A-10) — clauses 1.9 → 2.9

- **Bug condition:** the declared type is empty, `application/octet-stream` or `image/jpg`, and the bytes are an accepted type.
- **Expected:** acceptance decided by the bytes; the detected type recorded.
- **Root cause:** `document_storage_views.py:345-364` before `:376-384`.
- **Fix:**
  - `backend/apps/documents/validators.py`: extract the signature loop of `validate_file_magic_bytes` into `detect_file_mime(file_obj) -> str | None`, which seeks to 0 before and after reading. Add `GENERIC_DECLARED_MIME_TYPES = frozenset({"", "application/octet-stream", "binary/octet-stream"})` and `DECLARED_MIME_ALIASES = {"image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "image/x-png": "image/png"}`.
  - `DocumentUploadView.post` computes the effective type: lower-case and strip the declared value, apply the alias map; when the result is generic, use `detect_file_mime()`, and return 400 `INVALID_FILE` when it is `None`. Then run the existing `validate_upload(requirement, size, mime_type=effective)` and `validate_file_magic_bytes(file_obj, effective)` unchanged. `effective` is what `open_stage` and `commit_version` record.
  - A specific declared type (for example `application/pdf` or `text/html`) takes exactly today's path, so disguised HTML still gets `INVALID_FILE` and an unaccepted declared type still gets `INVALID_FILE_TYPE` (3.5).
- **Errors and validation:** generic declared type with unrecognisable bytes → 400 `INVALID_FILE` ("Invalid file format"), logged at INFO with the declared-type class only.
- **Schema:** none.
- **Rollout / rollback:** backend only; revert to roll back.
- **Observability:** counter event `document.upload.detected_mime` with labels `declared_class` ∈ {empty, octet, alias} and `detected` ∈ {pdf, jpeg, png, none}.
- **CTM / steering:** correct the "Document upload rejection codes" table (CTM 980-997, R-12): a magic-byte mismatch yields `INVALID_FILE` (as the code and A-14 show), and the generic-type rule is recorded there.

#### R2-d One upload path (A-11, dossier S4) — clauses 1.10 → 2.10

- **Bug condition:** a product module can reach an upload path other than the canonical one.
- **Expected:** a test fails when that happens. Physical deletion is Spec B S2 (DEC-1, D-A15).
- **Root cause:** dead stacks remain: `services/documents.ts:6` (`upload`), `…/hooks/wizard/useWizardFileUploads.ts` (barrel export at `…/hooks/wizard/index.ts:7`), `lib/storage.ts:121` (`uploadApplicationFile`, reached only from `useApplicationFileUploads.ts:301-305`, whose `startUpload` the controller does not destructure, `useWizardController.ts:405-415`), and `lib/applicationSlipStorage.ts` via `lib/slipService.ts:44`.
- **Fix:** new test `apps/admissions/tests/unit/uploadPathSingleSource.test.ts` scans `apps/admissions/src/**` (excluding `generated/`) and fails when:
  - `'/documents/upload/'` appears in any module other than `services/requiredDocuments.ts` (live) and the three frozen dead modules that contain it at HEAD: `services/documents.ts:13`, `lib/storage.ts:85` and `lib/applicationSlipStorage.ts:33`, each annotated "dead at HEAD 4a6c4ef; deletion owned by Spec B S2" (DEC-1 keeps all three, so without them the guard would fail on the day it lands);
  - any module references `documentService.upload`, `useWizardFileUploads`, `uploadApplicationFile` or `applicationSlipStorage` outside the frozen list of HEAD references written into the test with the note "dead at HEAD 4a6c4ef; deletion owned by Spec B S2";
  - any module destructures `startUpload`, `handleResultSlipUpload` or `handleExtraKycUpload` from `useApplicationFileUploads`.
- **Errors and validation:** the test names each offending file and line.
- **Schema / rollout:** none; test only.
- **Observability:** none.
- **CTM / steering:** CTM "Required-document upload contract" (CTM 1106-1147) names `requiredDocumentsService.upload` → `apiClient.upload` as the only upload transport, with the guard test listed in "Drift Guard Inventory" (CTM 1347+).

#### R2-e Photo downscaling (A-03 fix direction; SHOULD) — clauses 1.11 → 2.11

- **Fix:** new `apps/admissions/src/lib/imageDownscale.ts` exporting `downscaleImageForUpload(file: File): Promise<File>`.
  - It acts only when `file.type` is `image/jpeg` or `image/png` and `file.size > 2 * 1024 * 1024`.
  - It decodes with `createImageBitmap(file)` (EXIF orientation applied by default in current browsers) and returns the original when the long edge is at most 2400 px.
  - Otherwise it scales to a 2400 px long edge on an `OffscreenCanvas` (falling back to a detached `<canvas>`) and encodes with `toBlob` / `convertToBlob` as the same type (JPEG quality 0.85).
  - It returns `new File([blob], file.name, { type: file.type })` only when the blob is smaller; any thrown error, an encode taking more than 5 s, or a larger result returns the original file.
  - `useRequiredDocuments.runUpload` calls it before the transport.
- **Errors and validation:** never throws; failures fall back to the original file and log at DEBUG with the reason class only.
- **Schema / rollout:** none; frontend only; revert to roll back.
- **Observability:** none beyond the debug line.
- **CTM / steering:** CTM "Required-document upload contract" records the client downscaling threshold. Server validation is unchanged (magic bytes still decide).

---

### R3 — Rate limits that identify the real client and fit a real journey

#### R3-a Every client behind the proxy shares one bucket (B-11, A-02) — clauses 1.12 → 2.12

- **Bug condition:** two real clients arriving through Caddy.
- **Expected:** separate buckets in every middleware scope.
- **Root cause:** `middleware.py:355-363` passes `key="ip"`; django-ratelimit then reads `REMOTE_ADDR`; Caddy is the only peer of `web:8000` (`deploy/docker-compose.prod.yml:28-47`, `:49-69`; `apps/admissions/Caddyfile:58-62`).
- **Fix:**
  - `backend/apps/common/request_utils.py` `get_client_ip(request) -> str`:
    1. `remote` = `REMOTE_ADDR` parsed with `ipaddress`. If it is missing or invalid, return `"0.0.0.0"` and log WARNING `client_ip.remote_addr_unusable` once per process.
    2. If `settings.NUM_PROXIES <= 0` or `remote` is not in `TRUSTED_PROXY_CIDRS`, return `remote`.
    3. Otherwise walk `X-Forwarded-For` from the right for at most `NUM_PROXIES` hops. Each hop must parse as an IP; a malformed hop stops the walk at the last good address. Stop at the first hop that is not a trusted proxy and return it. If the hops run out, return the last address reached.
    - With `NUM_PROXIES = 1` behind Caddy this returns the rightmost forwarded address, as today; the difference is that a client talking to uvicorn directly can no longer choose its own address.
  - `base.py`:
    - `TRUSTED_PROXY_CIDRS = os.environ.get("TRUSTED_PROXY_CIDRS", "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7")`, parsed once into `ip_network` objects; an invalid entry raises `ImproperlyConfigured` naming the variable.
    - `RATELIMIT_IP_META_KEY = "apps.common.request_utils.get_client_ip"`.
  - `middleware.py`: the main path keeps `key="ip"`, which now resolves through the setting. The Redis-outage fallback already calls `get_client_ip` (`:364-367`). The docstring states the trust rule.
  - `backend/apps/common/throttling.py`: a mixin `ClientIpIdentMixin.get_ident(request)` returning `get_client_ip(request)`, applied to `PaymentUserScopedRateThrottle`, `DocumentExtractUserScopedRateThrottle`, `PublicTrackingFailureThrottle` and the new document throttle. Authenticated keys stay `user.pk`.
- **Errors and validation:** `X-Forwarded-For` is untrusted input: a value from an untrusted peer is ignored, and malformed entries are skipped as described. No value is ever logged.
- **Schema:** none.
- **Rollout / rollback:** backend only. If production ever sits behind a second proxy (for example Cloudflare), the runbook sets `NUM_PROXIES=2` and adds that proxy's ranges to `TRUSTED_PROXY_CIDRS`. Rollback: revert.
- **Observability:** counter `ratelimit.limited` with labels `scope` and `key_kind` ∈ {ip, user} (no address); the one-time WARNING above.
- **CTM / steering:** CTM gains a "Client IP and proxy trust" row under "Platform Identity, Routes, and Operational Config" (today it appears only in the public-tracking row, CTM 706). `infrastructure.md` production stack: Caddy is the single trusted proxy and `NUM_PROXIES=1`. `deploy/RUNBOOK.md` env list. Correct the comment in `backend/config/settings/harness.py:68-90`, which describes the production bug as if production differed (R-4). `RateLimitMiddleware` docstring.

#### R3-b One document budget for reads, writes and polling (A-02) — clauses 1.13 → 2.13, 2.14

- **Bug condition:** an authenticated student's document traffic.
- **Expected:** per-user budgets, reads separate from writes, and a per-IP upload budget separate from reads.
- **Root cause:** `middleware.py:280` (one 20/10m scope); no DRF throttle on document views other than extract.
- **Fix:**
  - `middleware.py` `SCOPE_LIMITS`: replace `("/api/v1/documents/", "20/10m")` with `("/api/v1/documents/upload/", "60/10m")` followed by `("/api/v1/documents/", "300/10m")`. The per-IP figures fit a lab of about 15 students behind one address (EC-13); the per-user budgets below are the real control.
  - `throttling.py` `DocumentUserRateThrottle(ClientIpIdentMixin, SimpleRateThrottle)`:
    - scope `documents_read` for GET, HEAD and OPTIONS, else `documents_write`, chosen in `allow_request` before the rate is parsed;
    - cache key `throttle_<scope>_user_<user.pk>`, or the client IP when anonymous;
    - inactive when `getattr(settings, "RATELIMIT_ENABLE", True)` is false. This is the existing switch, read the way django-ratelimit 4.1 reads it (`django_ratelimit/core.py:166`): only `test.py:21` and `harness.py:90` define it, so a plain attribute read would raise `AttributeError` in base, prod and staging. It is off in `test.py` and the broad harness matrix, and on (by default) in production, staging, dev and the gate;
    - a cache exception allows the request and logs WARNING `ratelimit.document_throttle.cache_unavailable` (fail open, EC-3; the middleware's in-memory fallback still bounds abuse).
  - `base.py` `DEFAULT_THROTTLE_RATES`: `"documents_write": "40/hour"`, `"documents_read": "300/hour"`.
  - `throttle_classes` on `DocumentUploadView`, `DocumentDeleteView`, `DocumentSignedUrlView`, `DocumentDownloadView`, `DocumentInfoView` and `DocumentVersionListView`; `DocumentExtractView` gets it in addition to its existing extract throttle. `DocumentVersionListView` is a jobs-ops scaffold (`backend/apps/documents/job_views.py:98-119`, two placeholder versions) that no admissions module calls; it is throttled only because it shares the prefix. Admissions version history comes from the required-documents contract's `history`.
  - Budget check for R3.3: one documents step is at most 4 upload POSTs + 1 delete + 1 extract = 6 writes, and at most 10 OCR polls + 2 signed URLs = 12 reads.
- **Errors and validation:** a throttled request returns the existing DRF 429 envelope with `Retry-After` (`backend/apps/common/exceptions.py:183-200`).
- **Schema:** none.
- **Rollout / rollback:** backend only; revert to roll back.
- **Observability:** `ratelimit.limited` with `scope` = `documents_read` or `documents_write`, `key_kind` = `user`.
- **CTM / steering:** CTM "Client IP and proxy trust" row lists the document budgets. `tech.md` gains the two scopes in the throttle description; the `RateLimitMiddleware` docstring table is updated.

#### R3-c OCR polling spends the budget and never stops without a job (A-02, C-04) — clauses 1.14 → 2.15, 2.14

- **Bug condition:** OCR slow, worker down, enqueue failed, or no job exists.
- **Expected:** bounded polling with backoff that stops at a terminal state or a missing job. OCR stays on (DEC-2).
- **Root cause:** `useOcrGradeExtraction.ts:87-88`, `:252-298` (fixed 3 s, 30 polls, no "no job" state); `useWizardController.ts:600-614`, `:885-901`; `documents.ts:62-71` (3 retries per poll).
- **Fix (backend):**
  - `DocumentExtractView.post`: after authorization, when `force` is true or `extraction_state` is NULL, set `extraction_state = 'pending'` with a queryset `update()`, then call `.delay()`. If `.delay()` raises, restore the previous `extraction_state` and return 503 `{code: "OCR_QUEUE_UNAVAILABLE", retryable: true}`; log ERROR with the document id.
  - `DocumentInfoView`: publish `ocr_state = "ocr_pending"` when `extraction_state == "pending"`. The legacy `verification_status` fallback keeps its current set, because `pending` there means "awaiting human review".
  - `backend/apps/documents/tasks.py:240`: on the "no file" path, record `ocr_failed` through `evidence.record_extraction_state` before returning, so `pending` never sticks.
- **Fix (frontend):**
  - `useOcrGradeExtraction.ts`: `OCR_POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 13000, 15000, 15000, 15000, 15000, 15000]` replaces `POLL_INTERVAL` / `MAX_POLLS` (10 polls, about 106 s, which covers a 60 s worker cold start).
  - `documentService.getInfo(id, { retries: 0 })` gains an options argument passed to `apiClient.request`.
  - Stop rules: candidates found → `suggested`; `ocr_failed` / `ocr_skipped` → `server_failed` / `skipped`; `ocr_no_text` / `ocr_no_grades` → those reasons; `ocr_state` null with no `extraction` and no `extracted_text` → `not_started`; 404 → `missing`; 429 → `rate_limited`, keeping `retryAfterSeconds` so the manual-entry copy can say when OCR can be retried; 10 polls exhausted → `timeout`.
  - Pause while `document.visibilityState === 'hidden'` and resume on `visibilitychange` without resetting the count.
  - `useWizardController.ts` `onUploaded`: `await documentService.extract({ documentId })` and start polling only when it resolves; on rejection set the OCR status to `failed` with reason `not_started`. The resume restart at `:885-901` stays, and now ends after one poll when no job exists.
- **Errors and validation:** every stop leaves the education step usable for manual entry, which always wins (3.12). Logging: `logger.info('[OCR] polling stopped', { reason, polls })`.
- **Schema:** none (`pending` is an allowed value of `chk_application_documents_extraction_state`).
- **Rollout / rollback:** backend before or with the frontend. An older frontend ignores `ocr_pending`, treats it as an unknown state and keeps polling within its old bounds. Rollback: revert either side.
- **Observability:** counter `ocr.extract.enqueue_failed`; the frontend stop reason.
- **CTM / steering:** CTM "Deterministic grade-extraction candidates" (CTM 1075-1105) adds `ocr_pending` to the published `ocr_state` vocabulary with its meaning, and records the client polling bounds.

#### R3-d A 429 is shown as an empty catalogue (C-04) — clauses 1.15 → 2.16

- **Expected:** on the journey surfaces 2.16 names, a retry time and never an empty-state message for a refused request.
- **Root cause:** `ProgramStep.tsx:86-87` derives the empty state from `programs.length === 0`; the client error carries no `Retry-After`; `base.py:326` does not expose the header cross-origin.
- **Fix:**
  - `base.py`: `CORS_EXPOSE_HEADERS = ["X-CSRF-Token", "X-Request-ID", "X-Backend-Version", "Retry-After"]`.
  - `client.ts`: for a 429, parse `Retry-After` (integer seconds, or an HTTP date converted to seconds; invalid → `null`) and set `retryAfterSeconds` and `code: 'RATE_LIMITED'` on the thrown error. `apps/admissions/src/lib/apiErrorHandler.ts` `enhanceError` copies `retryAfterSeconds` the way it copies `fieldErrors`.
  - New `apps/admissions/src/lib/rateLimitCopy.ts` exporting `rateLimitMessage(retryAfterSeconds)`: "Too many requests right now. Try again in about N minutes." (N rounded up, minimum 1), and "Too many requests right now. Try again in a few minutes." when unknown.
  - `ProgramStep` takes `programsError` and `intakesError`, each `{ message: string; retryAfterSeconds: number | null } | null`, from the controller's two catalogue queries (`useWizardController.ts:287-288`: `useProgramsForIntake` and `useIntakes`). For the failed one it renders `ErrorDisplay` with the rate-limit copy and a Retry button. The "No programmes available for the current intake" helper (`ProgramStep.tsx:87`) and the "Intakes will appear here once enrollment periods are announced." helper (`:110`) show only when their query succeeded with zero rows.
  - Student dashboard: `ApplicationsGrid` already renders `ErrorDisplay` instead of the empty state when `applicationsError`, `interviewsError` or `intakesError` is set (`ApplicationsGrid.tsx:96`, `:139`, `:149`). `Dashboard.tsx` builds those strings at `:307`, `:321` and `:272`; for an error whose `code` is `RATE_LIMITED` it uses `rateLimitMessage(retryAfterSeconds)` instead of the raw message.
  - The same copy is used by upload rows (R2-a), the opener page (R5-a), the documents list (R5-b), and the sign-in and sign-up banners when `code === 'RATE_LIMITED'`.
  - Every other surface keeps today's rendering of a failed request (OS-14).
- **Errors and validation:** `Retry-After` is untrusted: it is clamped to 0–3600 s.
- **Schema / rollout:** none; backend header and frontend together; revert to roll back.
- **Observability:** none new.
- **CTM / steering:** CTM "Error Codes" (CTM 922) records that `RATE_LIMITED` carries `Retry-After`, exposed through CORS, and names `rateLimitMessage` as the one copy source.

---

### R4 — Store keys, not expiring links

#### R4-a Expiring URLs are persisted and published (B-01, A-05, C-03) — clauses 1.16 → 2.17

- **Bug condition:** every upload and every official-document generation.
- **Expected:** keys persisted; URLs signed at read time; keys never published.
- **Root cause:** `document_storage_views.py:498` (`storage.url()`), `:552`; `condition_evidence_service.py:720`, `:744`; `pdf_generation.py:211`, `:222`; `documents/serializers.py:57-62` publishes `file_url` raw.
- **Fix:**
  - Upload view and condition-evidence service: drop the `storage.url()` call; pass `file_url=saved_name or object_key` (the key) and `storage_key=saved_name or object_key` to `commit_version`.
  - Official-document generation (`backend/apps/applications/tasks/pdf_generation.py:210-222`): drop `file_url = storage.url(stored_name)` and pass `file_url=stored_name or filename`, the value it already passes as `storage_key`. Official reads already sign at read time through `_signed_download_url` → `get_document_storage_key`, and no backend module reads a stored `file_url` as a URL (the only reader is `get_document_storage_key`, `storage.py:89-118`), so nothing else changes.
  - `backend/apps/common/storage.py`:
    - `resolve_document_object_key(document) -> str` — `storage_key` when non-empty, else the key derived by the legacy rules in R4-c, else `""`.
    - `resolve_document_open_url(document, *, disposition="inline") -> str | None` — signs the key through `generate_signed_url(key, filename=document.document_name)`, returns a legacy-provider URL unchanged (R4-c), or `None`.
  - `DocumentSerializer.file_url` becomes a `SerializerMethodField` returning `resolve_document_open_url(obj)`; a signing exception returns `None` and logs ERROR `document.sign.failed` with the document id. The field stays a nullable string, so the response shape is unchanged; the OpenAPI schema and `apps/admissions/src/generated/api.d.ts` are regenerated.
  - Callers switched to the two helpers: `DocumentSignedUrlView` and `DocumentDownloadView` (both via the existing `_get_document_storage_key` shim, which now delegates to `resolve_document_object_key`), `official_document_views._signed_download_url` (`:317-346`), the legacy synthesis in `ApplicationDocumentsView` (`student_document_views.py:130-166`), and `extract_document_text_task` (`tasks.py:238`).
  - Correct the comment at `official_document_views.py:320` ("permanent, unsigned") and the `_RAW_URL` fixture in `backend/tests/unit/test_official_document_signed_download.py`, which both hid B-01.
  - New guard `backend/tests/unit/test_no_persisted_signed_urls_sjr.py` scans `backend/apps/**` for `storage.url(` and `.url(saved_name` and fails on any use whose result flows into `file_url=`, `public_url=` on documents, or the snapshot columns. After this change the three document writers (upload view, condition-evidence service, official-document generation) call no `storage.url()`. Tenant assets persist `storage.url()` into `public_url` at two sites (`backend/apps/catalog/admin_asset_views.py:93` and `:294`); both are listed as known exceptions for Spec B, because tenant assets are not on the student journey.
- **Errors and validation:** signing failure → `file_url: null` in lists (the student opener signs separately and shows R5.4's state).
- **Schema:** none. `file_url` is `text` and keeps its meaning of "where the file is", now always as a key for new rows.
- **Rollout / rollback:** backend only. **Migration safety:** existing rows, uploaded and official alike, are not rewritten. Their keys are derived at read time (R4-c), so no backfill is needed; a revert keeps working because `get_document_storage_key` already accepts bare keys. Any external consumer reading `application_documents.file_url` directly from the database as a URL would see keys for new rows; none is known in the repo, and production consumers are Unverified (P0-ops).
- **Observability:** `document.sign.failed` (ERROR; document id and kind ∈ {upload, official}).
- **CTM / steering:** CTM "Immutable document evidence + storage compensation" (CTM 1149-1196): `file_url` and `storage_key` hold the object key for rows written after this change; URLs exist only in responses. `docs/schema-ownership.md` notes the column semantics.

#### R4-b The snapshot write after the commit (A-04, B-02, R-17) — clauses 1.17 → 2.18, 2.19

- **Bug condition:** any failure between the version commit and the snapshot write, including the `varchar(500)` overflow.
- **Expected:** 201 for names up to 255 characters; snapshot and version in one transaction; a replay repairs a missing snapshot.
- **Root cause:** `document_storage_views.py:592-601`; `commit_version`'s own atomic block (`document_evidence.py:701`, `:754`); replay at `:452-461`.
- **Fix:**
  - `commit_version(..., snapshot_field: str | None = None)`. Inside its existing `transaction.atomic()`, after the new version row is created and before `mark_stage(COMMITTED)`, it runs `Application.objects.filter(id=application_id).update(**{snapshot_field: str(document.id), "updated_at": now})`. A queryset update avoids saving the stale application instance loaded at the start of the request.
  - `SNAPSHOT_FIELD_BY_DOCUMENT_TYPE = {"result_slip": "result_slip_url", "extra_kyc": "extra_kyc_url", "nrc": "extra_kyc_url", "passport": "extra_kyc_url"}` lives in `document_evidence.py`; the view passes `snapshot_field=SNAPSHOT_FIELD_BY_DOCUMENT_TYPE.get(document_type)` and drops its own post-commit write (`:592-601`).
  - Replay branch (`:452-461`): before returning 201, when the snapshot field for the type is NULL, run `Application.objects.filter(id=…, **{f"{field}__isnull": True}).update(**{field: str(replay.id)})` (no `updated_at` change), then return.
  - The legacy synthesis reader becomes id-aware (`ApplicationDocumentsView.get`, `backend/apps/applications/student_document_views.py:130-166`). Today it skips a pair when the snapshot is empty, equals a serialized `file_url`, or the pair's own type (`result_slip` or `extra_kyc`) is listed. After this change the serializer signs `file_url` on read (R4-a) and new snapshots hold an id, so neither comparison can match. An identity document typed `nrc` or `passport`, which tenant contracts allow (`backend/apps/applications/required_documents.py:288-302`, baseline skipped when covered at `:353-363`) and admin uploads and R4-d-repaired rows produce, would then gain a phantom "Identity Support Document" row whose View fails. The reader becomes:

    ```python
    listed = list(docs)  # the view's queryset: every version that is not deleted
    known_values = (
        {str(d.id) for d in listed}
        | {d.file_url for d in listed if d.file_url}        # stored values, not the signed output
        | {d.storage_key for d in listed if d.storage_key}
    )
    listed_types = {d.document_type for d in listed if d.document_type}
    legacy_pairs = [
        ("result_slip", {"result_slip"}, "Result Slip", app.result_slip_url),
        ("extra_kyc", {"extra_kyc", "nrc", "passport"}, "Identity Support Document", app.extra_kyc_url),
    ]
    for doc_type, covering_types, doc_name, value in legacy_pairs:
        if not value or value in known_values or covering_types & listed_types:
            continue
        # synthesize as today; the row's file_url comes from resolve_document_open_url (R4-a, R4-c)
    ```

    The covering rule also closes a case that is wrong at HEAD. Removing the newest identity document while another current identity document survives keeps the snapshot (`backend/apps/documents/document_storage_views.py:907-920`), and the removed row is excluded from the list (`verification_status = "deleted"`), so today's reader re-signs the removed file as a synthetic row. A truly legacy application, with a snapshot and no listed document of a covering type, still gets its synthetic row (3.14, EC-18).
  - New object keys drop the filename: `build_object_key(application_id, document_type, *, mime_type)` returns `documents/{application_id}/{document_type}/{uuid4 hex}{ext}`, with `ext` from `{"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}` and `.bin` otherwise. Both callers (upload view, `condition_evidence_service.py:700`) pass the effective type. The OCR task's `.pdf` suffix check (`tasks.py:287`) keeps working, and is more accurate because the suffix now follows the bytes.
- **Errors and validation:** any exception inside the transaction rolls back the version and the snapshot together; the view then compensates the stage and returns the existing retryable `500 DOCUMENT_COMMIT_FAILED`, so no committed document ever gets a 5xx. `document_name` is still `safe_object_name()` (at most 255 characters).
- **Schema:** none (a 36-character id fits `varchar(500)`).
- **Rollout / rollback:** backend only. **Migration safety:** existing snapshots holding presigned URLs keep working: every frontend reader treats them as presence, the id-aware reader matches them against the stored `file_url`, and the student workspace no longer uses them as links (R5-b). The id-aware reader and R4-c's UUID rule ship in the same deploy as the snapshot writer, or before it. A rollback reverts the writer (the `commit_version` snapshot write and the replay heal) and keeps the reader, which is correct for URL and id values alike; reverting the reader while id snapshots exist would bring the phantom identity row back for `nrc` and `passport` documents.
- **Observability:** existing `EVENT_VERSION_COMMITTED`; new `document.snapshot.healed_on_replay` (application id and document type).
- **CTM / steering:** CTM "Immutable document evidence" (CTM 1149-1196): the snapshot is a presence marker holding the current document id, written in the version transaction. `backend/apps/common/legacy_columns.py` registers the two columns as legacy presence snapshots with the removal condition "every reader uses the required-documents contract" (Spec B).

#### R4-c Key resolution for legacy rows (R-2) — clauses 1.18 → 2.20

- **Fix:** in `storage.py`, `_key_from_persisted_value(value) -> str | None`:
  0. A value that is a bare UUID (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, case-insensitive) is a snapshot presence marker (D-A3), never a key: return `None`. No key the platform writes has that shape: upload and condition-evidence keys are `documents/<application>/<type>/…` (`document_evidence.py:310-322`) and official-document keys are `<folder>/<application>/<hex>.pdf` (`pdf_generation.py:191`), so every one contains a `/`.
  1. A relative value (no scheme) is a key: strip a leading `/`, a duplicated bucket prefix and a leading `media/`, as `get_document_storage_key` does today (`:105-118`).
  2. An absolute `http(s)` URL whose query has any `X-Amz-` parameter, or whose host equals the configured endpoint host, the public endpoint host, or `<bucket>.<endpoint host>`, gives its decoded path under the same stripping rules (a presigned URL, R-2).
  3. Any other absolute `https` URL is a legacy-provider URL: return `None`, and `resolve_document_open_url` returns the value unchanged and logs INFO `document.open.legacy_provider` with the document id.
  4. Anything else returns `None` (no file).
- `get_document_storage_key` keeps its current behaviour for its other callers; the two new helpers compose it.
- **Errors and validation:** malformed URLs fall to rule 4.
- **Schema / rollout:** none; backend only.
- **Observability:** `document.open.legacy_provider` (INFO).
- **CTM / steering:** CTM "Immutable document evidence": the legacy-value rules, listed as a legacy fallback in "Legacy-string fallback allowlist (R1.3)" with the removal condition "no row without `storage_key` remains" (a P0-ops count).

#### R4-d Repair snapshots left NULL by A-04 — clause 2.19

- **Fix:** new script `backend/scripts/2026_11_02_01_repair_document_snapshot_presence.sql`, applied by `apply_sql_migrations`:

  ```sql
  -- Idempotent: fills only NULL snapshots, never touches updated_at.
  WITH slip AS (
    SELECT DISTINCT ON (d.application_id) d.application_id, d.id
    FROM application_documents d
    WHERE d.document_type = 'result_slip' AND d.is_current IS TRUE
      AND COALESCE(d.verification_status, '') <> 'deleted'
    ORDER BY d.application_id, d.uploaded_at DESC NULLS LAST, d.id
  )
  UPDATE applications a SET result_slip_url = slip.id::text
  FROM slip WHERE a.id = slip.application_id AND a.result_slip_url IS NULL;

  WITH identity_doc AS (
    SELECT DISTINCT ON (d.application_id) d.application_id, d.id
    FROM application_documents d
    WHERE d.document_type IN ('extra_kyc', 'nrc', 'passport') AND d.is_current IS TRUE
      AND COALESCE(d.verification_status, '') <> 'deleted'
    ORDER BY d.application_id, d.uploaded_at DESC NULLS LAST, d.id
  )
  UPDATE applications a SET extra_kyc_url = identity_doc.id::text
  FROM identity_doc WHERE a.id = identity_doc.application_id AND a.extra_kyc_url IS NULL;
  ```

  `DISTINCT ON` picks exactly one current row per application (the newest), so the result is deterministic even for legacy rows where more than one identity type is current.
- **Errors and validation:** none at runtime; the script is a no-op on a second run.
- **Schema:** data only, additive (fills NULLs).
- **Rollout / rollback:**
  1. Prove it on a Neon branch. List user triggers on `applications` (`SELECT tgname FROM pg_trigger WHERE tgrelid = 'applications'::regclass AND NOT tgisinternal`); record `id, updated_at` for the rows the script will fill; count NULL snapshots with a current document; run it; re-count (expect 0); confirm every recorded `updated_at` is unchanged; run it again (expect 0 rows changed). If a trigger writes `updated_at`, stop and ask the user, because the script would then retire issued-slip fingerprints (R-11).
  2. With the user's confirmation, apply the proven script to the Neon default branch (the authoring database; `infrastructure.md`: branch first, then the default branch) and record the counts.
  3. In production it runs at boot on the first deploy that contains it. Automatic deploys are paused from task 2.6 (DEC-10), so that deploy is the approved one in task 6.2, and the operator takes `deploy/backup-db.sh` **before** it (task 6.1). Merging the script does not run it in production.
  4. There is no rollback script, because the filled values are presence markers equivalent to the pre-A-04 state; restore from the backup if needed.
- **Observability:** the runner's migration-history row.
- **CTM / steering:** CTM "Database Schema" (CTM 1198+) lists the script; `docs/schema-ownership.md`.

---

### R5 — Students open their own documents

#### R5-a One opener route that signs at click time (B-01, B-07) — clauses 1.19, 1.23 → 2.21, 2.25

- **Bug condition:** View more than one URL lifetime after signing, or an official document that becomes ready after awaits.
- **Expected:** the current version opens whenever the student clicks; no tab is opened in code after an await.
- **Root cause:** stored URLs rendered as links (`DocumentChecklist.tsx:31-36`, `:63-68`); tab opened after POST, polls and GET (`useOfficialDocument.ts:254-298`; `officialDocuments.ts:200-211`).
- **Fix:**
  - New route `studentDocumentOpen` in `apps/admissions/src/routes/routeRegistry.ts`: path `/student/documents/open`, guard `student`, skeleton `detail`, no nav entry. New page `apps/admissions/src/pages/student/DocumentOpen.tsx`, rendered inside `PageShell`. Its `student` guard is `StudentRoute`, which runs the session restore before any redirect (R8-a), so a tab opened long after sign-in restores the session instead of showing Sign in.
  - Query grammar, validated before any request:
    - `doc=<uuid>` — an uploaded or system-generated document;
    - `doc=legacy:<result_slip|extra_kyc>:<application uuid>` — a legacy synthetic row;
    - `app=<uuid>&type=<application_slip|acceptance_letter|conditional_offer|payment_receipt>` — an official document.
    - UUIDs must match `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (case-insensitive). Any other shape renders "This link isn't valid." with a link back to `/student/status`, and sends no request.
  - Behaviour:
    - `doc=<uuid>`: `documentService.getSignedUrl(id)` (GET, so `apiClient` refreshes on 401 and retries), then `window.location.replace(url)`.
    - `legacy:`: `documentService.listByApplication(appId)`, take the synthetic row's freshly signed `file_url`, then replace.
    - Official: `officialDocumentService.getOfficialDocument(appId, type)`. When `status === 'ready'` with `download_url`, replace. When `ready` with `error_code === 'DOCUMENT_LINK_UNAVAILABLE'`, show the R5.4 state. Otherwise show the status copy (R5-f). It never POSTs; preparing a document stays on the originating page.
  - States and copy:
    - loading: "Opening your document…" in a polite live region;
    - 404: "This document isn't available. It may have been replaced or removed." with a link back;
    - 5xx, network error or `DOCUMENT_LINK_UNAVAILABLE`: "This file can't be opened right now." with a Retry button and the tenant support contact from `resolveTenantSupportContact`;
    - 429: the R3-d copy.
    - After a successful replace the page is gone, so an expired range request inside a long PDF is recovered by opening again (EC-10).
  - Every student View or Open control becomes `Button asChild` around `<a href="/student/documents/open?…" target="_blank" rel="noopener">`, with an accessible name such as "View result slip (opens in a new tab)" and `min-h-touch`.
  - `useOfficialDocument.ts` stops calling `officialDocumentService.downloadOfficialDocument`. It exposes `{ state, prepare(), openHref }`: `prepare()` runs the existing POST and poll; `openHref` is the opener URL once the status is `ready`. Its only callers are student components (`DocumentButtons.tsx:176`, `DownloadReceiptButton.tsx:40`). The constants and helpers that `useAdminOfficialDocuments` imports from this module (`useAdminOfficialDocuments.ts:29-36`) keep their names and behaviour, so the admin hook, which still opens after one GET (`:203`), is unchanged (OS-15). No admin control gets an `openHref`: the opener is `student`-guarded and `StudentRoute.tsx:43-45` sends admins to the admin dashboard.
- **Errors and validation:** as listed; every state is recoverable by Retry or by going back. Logging: `logger.info('[document-open] failed', { kind, code, status })` — never the id, URL or filename.
- **Schema:** none.
- **Rollout / rollback:** frontend only; revert to roll back.
- **Observability:** the log line above.
- **CTM / steering:** CTM "Enterprise Tenant Authority → Canonical routes (frontend)" (CTM 770) registers `/student/documents/open` and its query grammar. CTM "Official-document durability and the read-existing policy" (CTM 623-676): the frontend read-existing surface opens through this route and never programmatically. `structure.md` admissions high-risk paths table gains `DocumentOpen.tsx`.

#### R5-b The workspace lists every current document; the wizard gets View (B-03, B-05) — clauses 1.20 → 2.22

- **Root cause:** `DocumentChecklist.tsx:6-9` reads two snapshot columns; `RequiredDocumentsPanel.tsx:220-249` has no View.
- **Fix:**
  - `DocumentChecklist.tsx` is rewritten in place (DEC-1: nothing removed) with props `{ applicationId: string }`. It reads `documentService.listByApplication(applicationId)` through React Query key `['application-documents', applicationId]` and keeps rows where `is_current !== false`, `system_generated !== true` and `verification_status !== 'deleted'`, plus legacy synthetic rows.
  - Each row's label is the matching requirement label from the required-documents contract when one is loaded, else the humanised `document_type`. Condition evidence appears with its own label.
  - Each row shows the verification status as a word with an icon (3.11) and a View anchor to the opener.
  - Loading uses the skeleton; an error uses `ErrorDisplay` with Retry (or the R3-d copy for a 429); an empty list uses `EmptyState` naming the next step ("Upload your documents in your application form", linking to the wizard when a draft exists).
  - `ApplicationStatus.tsx:327-329` passes `applicationId`.
  - `RequiredDocumentsPanel.tsx`: when `requirement.document` is non-null, add a View anchor to `/student/documents/open?doc=<requirement.document.id>` before Replace (the contract already carries the id; R-3).
- **Errors and validation:** list failure → error state, never an empty state.
- **Schema / rollout:** none; frontend only.
- **Observability:** none.
- **CTM / steering:** CTM "Wizard document surfaces" / "Required-document upload contract" (CTM 1106-1147): the workspace document list reads the documents endpoint, not the snapshot columns.

#### R5-c Desktop navigation (B-04) — clauses 1.21 → 2.23

- **Fix:** `routeRegistry.ts:221-236` sets `desktop: true` on `studentStatus.nav`; `DesktopSidebar.tsx` then lists it. Dashboard → sidebar "Application Status" → documents card is one activation on desktop; mobile keeps its existing entry.
- **Errors / schema:** none.
- **Rollout / rollback:** frontend only; any nav test that pins the old desktop omission is updated in the same change.
- **Observability:** none.
- **CTM / steering:** `structure.md` capability-driven navigation row (DesktopSidebar and BottomNavigation).

#### R5-d Signing failures read as "not ready" (B-06) — clauses 1.22 → 2.24

- **Root cause:** `official_document_views.py:317-346` (WARNING, `download_url` omitted); `officialDocuments.ts:206-211`.
- **Fix:**
  - `_signed_download_url` calls `resolve_document_open_url` and on exception logs `logger.error("official_document.sign_failed", extra={"document_id": …, "document_type": …})` with `exc_info=True`, then returns a sentinel.
  - `_build_envelope` adds `error_code: "DOCUMENT_LINK_UNAVAILABLE"` when the document exists but signing failed, keeping `status: "ready"`; the field already exists in the envelope, so the shape is unchanged.
  - `officialDocuments.ts` and the opener map that code to "This file can't be opened right now" with Retry, never "not ready".
  - `DocumentSignedUrlView` and `DocumentDownloadView` already log at ERROR through `logger.exception`; their 500 `STORAGE_ERROR` contract stays (3.14), and the opener maps it to the same copy.
- **Errors and validation:** recoverable; Retry re-reads.
- **Schema / rollout:** none; backend and frontend together.
- **Observability:** `official_document.sign_failed` at ERROR (ids only).
- **CTM / steering:** CTM "Stable document command codes" (CTM 1166) adds `DOCUMENT_LINK_UNAVAILABLE`; "Student failure copy vs staff failure copy" (CTM 660) gains its student copy.

#### R5-e An issued slip disappears after a status change (B-09, R-11) — clauses 1.24 → 2.26

- **Root cause:** `official_document_views.py:490` serves the issued copy only when `not may_issue`.
- **Fix:** in `_generation_status`, after the fresh-artifact check (step 1) and before the open-job and failure steps, add a student-only step: when `not is_staff`, `current is not None` and `_may_read_issued(document_type, application, current)`, return `ready` with `historical=True`. The existing step 4 stays for staff. The fingerprint is not changed (R-11: status is printed on the slip).
- **Errors and validation:** none new.
- **Schema / rollout:** none; backend only; revert to roll back.
- **Observability:** counter `official_document.student_served_historical` (document type).
- **CTM / steering:** CTM "Read-existing eligibility" (CTM 654) adds the student precedence rule.

#### R5-f Summary copy claims documents are ready (R-10, A38) — clauses 1.25 → 2.27

- **Fix:**
  - `officialDocumentPresentation.ts`: `presentOfficialDocuments` takes `issued` (types `isIssued` reports) alongside `available` and `historical`. `officialDocumentSummary` says "Your <noun> is ready to open." only when the primary type is issued, and "Your <noun> can be prepared now." when it is only issuable. Per-type copy follows the server status: `queued` "is being prepared"; `failed` "couldn't be prepared — try again"; `setup_required` per R7-d.
  - `DocumentButtons.tsx:306-311`, `:330` pass `issued` and render "Prepare" (calls `prepare()`) or "Open" (the opener anchor).
- **Errors / schema:** none.
- **Rollout:** frontend only.
- **Observability:** none.
- **CTM / steering:** CTM "Frontend read-existing surface" entry under CTM 623-676.

#### R5-g Reviewer scoping by role string, and the 403 existence leak (B-13, B-12, R-18) — clauses 1.26, 1.27 → 2.28, 2.29

- **Root cause:** `document_storage_views.py:104-119`; `student_document_views.py:109-114`, `:120-124`, `:236-245`.
- **Fix:**
  - `_get_authorized_document(request, view, document_id, *, allow_assigned_reviewer=True)` delegates to `resolve_owner_or_scoped_document(request, document_id, capability="tenant.document.read", queryset=ApplicationDocument.objects.select_related("application"))` (`backend/apps/common/tenant_authorization.py:422-446`). When the actor is not the owner it then applies the reviewer rule. With `allow_assigned_reviewer=True` it calls `require_reviewer_assignment(request, document.application)`, so an assignment-scoped reviewer reaches only assigned work, the same rule as applications (`:85-99`). With `allow_assigned_reviewer=False`, an assignment-scoped reviewer (`_is_assignment_scoped_reviewer`, `:57-67`) gets `_document_not_found_response()` whatever the assignment.
  - The read views keep the default: `DocumentSignedUrlView` (`document_storage_views.py:681`), `DocumentDownloadView` (`:717`) and `DocumentInfoView` (`:760`). The two commands that share this loader pass `allow_assigned_reviewer=False`. `DocumentExtractView` (`:640`) needs it because `force=true` clears `extracted_text` and, on undecided rows, `verification_notes` (`backend/apps/documents/tasks.py:229-236`). `DocumentDeleteView` (`:841`) needs it because its only other guard is the student draft rule (`:862-871`). Today a reviewer gets the masked 404 from both through the `IsOwnerOrAdmin` fall-through (`:114-119`), so this keeps their behaviour; Tenant_Admins in scope and Super_Admins reach both commands as today.
  - `NotFound` maps to the existing byte-identical `_document_not_found_response()`. `PermissionDenied` (in scope, capability missing) maps to the existing non-revealing 403 envelope.
  - `ApplicationDocumentsView.get` and `ApplicationRequiredDocumentsView.get` resolve the application with `resolve_owner_or_scoped_application(request, application_id, capability="tenant.document.read")` (`:301-331`), which raises the same `NotFound("Application not found")` for a non-owner student, an out-of-scope staff actor and an unknown id, so all three get one body on each endpoint (2.29). Their `role == "admin"` branches and the `IsOwnerOrAdmin` 403 branches are removed.
  - `scripts/authority_matrix_registry.py` registers the three surfaces with their capability.
  - The existing admin path is unchanged in effect: admins with memberships were already scoped by `AccessScopeService`.
- **Errors and validation:** malformed ids → 404 (handled by the resolvers). A `CapabilityResolutionError` fails closed to 404.
- **Schema / rollout:** none; backend only.
- **Observability:** existing `scope.denied` audit through the resolvers where they emit it.
- **CTM / steering:** CTM "Required-document upload contract" authority line (CTM 1136-1139) changes from "a non-super-admin admin only inside `AccessScopeService`" to the owner-or-scoped resolver with `tenant.document.read`; `scripts/authority_matrix_registry.py`.

#### R5-h Content-Disposition and filenames in keys (B-14) — clauses 1.28 → 2.30

- **Fix:**
  - `generate_signed_url(key, expiry=None, *, filename=None, disposition="inline", content_type=None)` adds `ResponseContentDisposition = content_disposition_for(filename, disposition)` and, when known, `ResponseContentType` to the presign parameters.
  - `content_disposition_for(name, disposition)` in `storage.py`:
    - takes the basename, removes control characters, `"`, `\`, `;` and line breaks, collapses whitespace, and truncates to 150 characters;
    - builds an ASCII fallback by NFKD-normalising, dropping non-ASCII, and replacing characters outside `[A-Za-z0-9._ -]` with `_` (an empty result becomes `document`);
    - returns `f'{disposition}; filename="{ascii}"; filename*=UTF-8\'\'{quote(name, safe="")}'`.
  - Filename-free keys are part of R4-b.
- **Errors and validation:** never raises; an empty name gives `filename="document"`. R2 support for response-header overrides on presigned GETs is Likely; if R2 ignores them, nothing breaks.
- **Schema / rollout:** none.
- **Observability:** none.
- **CTM / steering:** CTM "Immutable document evidence": keys contain no client filename; the display name lives in `document_name`.

---

### R6 — Submit through the wizard

#### R6-a One readiness computation (C-01, R-7) — clauses 1.29 → 2.31, 2.32

- **Root cause:** `useWizardSubmission.ts:116-124` rebuilds readiness without `assignmentResolved` and `requiredDocumentItems`; `wizardReadiness.ts:107-117` defaults them.
- **Fix:**
  - `BuildWizardReadinessInput` makes every field required with no default (`requiredDocumentItems: WizardDocumentItem[] | undefined` stays explicitly nullable but must be passed). `tsc` in `bun run build:admissions` then fails on any call that omits a field.
  - Three production modules call `buildWizardReadiness` at HEAD: the controller (`useWizardController.ts:760`), the submit handler (`useWizardSubmission.ts:116`, replaced below by `computeReadiness`), and `useOverallProgress.ts:41`, whose percentage the wizard renders (`index.tsx:227-234`, passed on at `:941` and `:954`). This spec keeps that percentage exactly as it is today. `useOverallProgress` passes `assignmentResolved: false` and `requiredDocumentItems: undefined` explicitly, which are today's defaults, with a comment naming Spec B V3 (`platform-simplification-and-polish` task 26.1) as the owner of moving the percentage onto the controller's readiness. Its five optional options (`OverallProgressOptions`, `useOverallProgress.ts:13-20`) are typed `T | undefined`, so under `"strict": true` (`apps/admissions/tsconfig.json:12`) it also passes today's defaults for them at `:44-48`: `uploadedFiles ?? {}`, `hasResultSlipFile ?? false`, `hasIdentityFile ?? false`, `paymentStatus ?? null` and `confirmSubmission ?? false`. `tsc` then passes, and the number a student sees does not change before Spec B changes it.
  - Tests: a new helper `apps/admissions/tests/unit/__fixtures__/readinessInput.ts` exports `readinessInput(overrides)`, which fills every field with an explicit value (empty `values`, no grades, no files, `requiredDocumentItems: undefined`, `paymentStatus: null`, `confirmSubmission: false`, `assignmentResolved: false`). The 9 existing test calls (for example `applicationWizardCharacterisation.test.ts:204` and `wizard/subjectGradeContract.test.ts:51`) move to it, so their inputs and assertions stay the same.
  - `useWizardController.ts` defines `computeReadiness = useCallback((values: WizardFormData) => buildWizardReadiness({ values, selectedGrades: selectedGradesRef.current, uploadedFiles, hasResultSlipFile, hasIdentityFile, requiredDocumentItems, paymentStatus, confirmSubmission, assignmentResolved }), [...])`. It sets `wizardReadiness = computeReadiness(watch())`, and passes `computeReadiness` to `useWizardSubmission`.
  - `useWizardSubmission.ts` replaces its own `buildWizardReadiness` call with `computeReadiness(data)` and drops the parameters it used only for readiness.
  - The server stays authoritative: `submit_application` re-runs readiness under row locks (3.8). A refusal shows the server's blockers and refetches `useWizardReadiness`.
- **Errors and validation:** unchanged submit error handling (idempotency key `submit-<id>`, `IDEMPOTENCY_PENDING`).
- **Schema / rollout:** none; frontend only.
- **Observability:** none new.
- **CTM / steering:** CTM "Submission Gates" (CTM 1009-1046) names the controller's `computeReadiness` as the single client readiness consumer feeding both the button and the handler, and records that the progress percentage stays a separate display computation until Spec B V3.

#### R6-b Grades join the draft machine (C-05, C-02) — clauses 1.30, 1.31 → 2.33, 2.34

- **Root cause:** `useWizardStepAdvance.ts:404` and `useWizardGrades.ts:123` are the only grade writes; `student_submission_views.py:403-420` refuses partial sets and `:422-432` is not atomic; `draftOutbox.ts` carries no grades; the machine fingerprints answers only.
- **Fix (backend):**
  - `ApplicationGradesView.post` accepts `"partial": true`. When true, it skips the minimum check, refuses more than 10 rows with 400 `TOO_MANY_SUBJECTS`, and still refuses duplicates and invalid rows with the existing codes.
  - Both modes run the delete-and-upsert inside `transaction.atomic()` after `Application.objects.select_for_update().get(id=application_id)`, and re-check `status == 'draft'` under the lock for non-staff callers.
  - The minimum stays enforced by readiness and `submit_application` (`resolve_minimum_grades()`).
- **Fix (draft machine):**
  - `WizardDraftAdapters` gains optional `projectGrades(): { rows: Array<{ subject_id: string; grade: number }>; unsavableRows: number }` and `syncGrades(applicationId, rows, idempotencyKey): Promise<void>`.
  - The controller keeps `gradesBaselineFingerprint`, set by a new public `setGradesBaseline(rows)` that the loader calls after `hydrateServerGrades`. `fingerprintGrades` sorts rows by `subject_id` and serialises `[subject_id, grade]` pairs.
  - `observe()` treats a grade fingerprint different from the baseline as an edit. `pending` is true when either channel differs.
  - `performSave` writes answers first (unchanged), then grades when they differ, inside the same serialized chain, with the same backoff and one key per command (`createCommandKey('grades')`).
  - The snapshot gains `unsavableGradeRows`. `deriveWizardDraftSaveView` returns `{ status: 'error', message: WIZARD_DRAFT_MESSAGES.gradesNeedAttention }` ("Some grade rows can't be saved yet. Fix the highlighted rows.") when `unsavableGradeRows > 0` and nothing is saving.
- **Fix (adapters):**
  - In `useWizardDraftPersistence.ts:375-504`, `projectGrades` sends only rows with a canonical subject id (`syncableGrades`) and a grade from 1 to 9, keeps the first of duplicate subjects, ignores rows with no subject chosen yet (an incomplete row is not a pending change), and counts the rest as unsavable.
  - `syncGrades` calls `applicationService.syncGrades(id, rows, { partial: true, idempotencyKey })`.
- **Fix (outbox):**
  - `draftOutbox.ts` record format 4 adds `grades` only while grades are pending; v3 records read as "no pending grades".
  - On resume, outbox grades replace the hydrated grades, the student's latest unsynced edit on this device, and the machine then syncs them. Grades are last-writer-wins across devices (EC-17).
  - `draftOutboxMinimisation.property.test.ts` is updated: grades may appear only while pending.
- **Fix (call sites):**
  - `useWizardStepAdvance.ts:400-410` replaces the direct `syncGrades.mutateAsync` with `await draftMachine.flush()`. If grades are still pending afterwards (offline or refused), it keeps today's behaviour of not advancing, with "We couldn't save your grades. Check your connection and try again."
  - `useWizardGrades.ts:123` drops its direct sync; the OCR merge is an edit the machine saves.
- **Fix (page save status):** new pure `…/applicationWizard/lib/pageSaveView.ts` exporting `deriveWizardPageSaveView(machineView, { documentsUploading, documentsFailed })`. It returns `saving` while an upload is in flight and `error` with "A document didn't upload. Try it again." when one failed, else the machine's view. `index.tsx` passes the result to `WizardActionBar` in place of `smartAutoSave.saveStatus`.
- **Errors and validation:** a partial batch returns 400 for duplicates, invalid subjects or more than 10 rows (not expected, since the adapter filters); the machine treats it as `ready.with_errors` with the server message. A 404 uses the existing missing-draft path; a 401 the existing auth-expired path.
- **Schema:** none.
- **Rollout / rollback:** backend first or together; an older backend ignores `partial` and refuses partial sets, which the machine shows as an error rather than a false "Saved". Rollback: revert both.
- **Observability:** frontend `logger.info('[draft] grades acknowledged', { rows })` (a count only).
- **CTM / steering:** CTM "Online student drafts" (CTM 79): grades are a draft-machine channel saved by autosave. CTM "Wizard" (CTM 1227-1234): the page save status composes document commands. `product.md` auto-save bullet; `design-skills.md` "Auto-save mandatory on every student form" becomes true for grades.

#### R6-c StrictMode leaves `mountedRef` false (C-06) — clauses 1.32 → 2.35

- **Fix:** `usePaymentStatus.ts:95` becomes `useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])`, the pattern `useOcrGradeExtraction.ts` already uses.
- **Errors / schema:** none.
- **Rollout:** frontend only.
- **Observability:** none.
- **CTM / steering:** none.

#### R6-d Deferral leaves a recovery entry (C-07) — clauses 1.33 → 2.35

- **Fix:**
  - `PaymentStep.tsx:83-100` calls the recovery store's `clear(applicationId)` after `deferPayment` resolves, which is the server's confirmation.
  - `PaymentStep`'s existing effect that adopts a server `deferred` status (`:79-81`; `polledStatus` comes from the application through `usePaymentStatus`) also clears the entry. This covers a deferral confirmed in another tab or on another device. `PaymentForm` is not rendered while the step is deferred (`:216`) and receives `null` in place of `deferred` (`:226`), so it gets no new prop.
  - `PaymentForm.syncPendingPayment` (`PaymentForm.tsx:190-243`) treats a verify result that normalises to `deferred` like `failed` and `successful`: it stops the poll, clears `activePendingMethod`, `activeMomoPaymentId` and the recovery entry, and calls `onPaymentStatusChange?.('deferred')`. That callback's parameter type (`:77`) widens to include `'deferred'`, which the handler `PaymentStep` passes in (`PaymentStep.tsx:26`, `:227`) already accepts; `polledStatus` (`PaymentForm.tsx:76`) is unchanged.
  - No client guess clears the entry: only a server response saying `deferred`. The `allowsInitiate` double-charge guard is untouched (3.3).
- **Errors / schema:** none.
- **Rollout:** frontend only.
- **Observability:** none.
- **CTM / steering:** CTM "Student payment ownership split" (CTM 148-164): a server-confirmed deferral clears the recovery entry.

---

### R7 — Decisions and decision documents (P0b)

P0b starts after task 4's gate is green.

#### R7-a Seeded admins cannot decide (C-10, R-5) — clauses 1.34 → 2.36, 3.24

The rule is additive and idempotent by default (DEC-11). At HEAD the command never changes an existing membership's permissions (`seed_school_admins.py:117-134`), and the admin UI writes membership permissions through `PATCH /api/v1/admin/memberships/{id}/` (`backend/apps/catalog/admin_access_views.py:113`, called by `updateMembership` in `apps/admissions/src/services/admin/tenants.ts:740-743`). A command that replaced permissions would silently remove those grants whenever an operator re-ran the documented production command.

- **Fix:**
  - `seed_school_admins.py` gains three options: `--permissions` (comma list, default `review`), `--replace` and `--read-only`. Validation runs before any write and fails with `CommandError`:
    - each `--permissions` value must be in `GRANT_PERMISSION_ALLOWLIST` (`backend/apps/catalog/admin_serializers.py:25-27`: `view`, `review`, `manage`, `verify_documents`, `verify_payments`, `export`); the error lists the allowed values;
    - an empty `--permissions` value is refused with "Use --read-only to grant nothing.";
    - `--read-only` cannot be combined with `--permissions` or `--replace`.
  - The permission rule is one pure function, `seed_membership_permissions(existing, requested, mode) -> list[str]`, in a new private module `backend/apps/catalog/management/commands/_seed_memberships.py`. Django does not load underscore-prefixed modules in `management/commands/` as commands, and both seed commands import it.
    - `mode="add"`, the default: `sorted(set(existing) | set(requested))`. Every permission the membership already holds is kept, including values outside today's allowlist: `AdminMembershipSerializer` does not validate membership permissions (`admin_serializers.py:294-304`), and the command must not guess which of them matter.
    - `mode="replace"` (`--replace`): `sorted(set(requested))`.
    - `mode="read_only"` (`--read-only`): `[]`.
    - A new membership starts from `existing = []`.
  - Write rule, for each targeted membership (the `--admin` pairs and the every-active-institution path alike):
    - the command computes the new permission list and whether the membership must be created or reactivated;
    - when the membership exists, is active, and its sorted permissions already equal the new list, it does not write the membership, emits nothing, and prints `membership unchanged`;
    - otherwise it saves the membership and emits one `TenantAuditService.record_event(action="tenant.membership.permissions_seeded", entity_type="user_institution_membership", entity_id=<membership id>, actor_role="system", institution_id=<institution id>, metadata={"permissions_before": <sorted list, or null for a new membership>, "permissions_after": <sorted list>, "created": <bool>, "reactivated": <bool>, "mode": "add" | "replace" | "read_only", "source": "seed_school_admins", "run_id": <a uuid4 for the run>})` (`backend/apps/catalog/tenant_audit_service.py:208`). The event carries ids and permission names only, never an email address, a name or a password;
    - it prints `membership created`, `membership reactivated` or `permissions <before> -> <after>`, with permission names only.
  - The command never reads or writes `AccessGrant` rows.
  - `--dry-run` prints the same lines, writes nothing and emits nothing.
  - `harness_seed_tenants.py` keeps its existing `admin@<slug>.localhost` memberships read-only, because existing isolation specs may rely on them; their `get_or_create` (`harness_seed_tenants.py:211-216`) is unchanged. It adds `decider@<slug>.localhost` per tenant, with the same password option, whose membership goes through the same function and write rule in `mode="add"` with `["review"]` and `"source": "harness_seed_tenants"`.
- **Errors and validation:**
  - Invalid or conflicting options → `CommandError` before any write.
  - All writes of one run, membership saves and their audit rows, happen in one `transaction.atomic()` block. `record_event` swallows its own failures (`tenant_audit_service.py:227-235` and `:260-277`), which suits a request path but would let this command change authority without a record. So before leaving the block the command counts the run's rows, `AuditLog.objects.filter(action="tenant.membership.permissions_seeded", changes__run_id=<run id>)`, and raises `CommandError("Audit events were not recorded; no membership was changed.")` when the count differs from the number of changed memberships. If the insert failed inside the database, the transaction is already aborted and that count query fails instead. Either way the block rolls back, no change commits without its audit row, and the operator re-runs: fatal for the run, recoverable by a re-run.
  - The existing Profile update (role, active, verified, password, `seed_school_admins.py:104-115`) is unchanged.
- **Schema:** none.
- **Rollout / rollback:** operator command, in P0b (task 5.1). Re-running the documented production command (`.kiro/steering/infrastructure.md:115-120`) adds `review` where it is missing and removes nothing; a second re-run changes no membership and emits no event (3.24), while the Profile update still runs as today. A code rollback is a revert. Permissions a run added stay in place; an operator who wants one gone removes it in the admin UI, or re-runs with `--replace --permissions <list>`, using the event's `permissions_before`.
- **Observability:** the audit event, one per changed membership.
- **CTM / steering:** `infrastructure.md:115-120` states that the command adds `review` and removes nothing, and documents `--replace` and `--read-only`. The command's module docstring (`seed_school_admins.py:18-21`) states the same rule. `docs/runbooks/multi-tenant-operations.md`. CTM "Admin review workspace contract" (CTM 373-421) notes that seeded admins hold `tenant.application.review` by default.

#### R7-b Approve disabled for deferred payments (C-11) — clauses 1.35 → 2.37

- **Fix:**
  - `apps/admissions/src/lib/paymentStatus.ts`: `export const APPROVAL_PAYMENT_STATUSES = ['successful', 'force_approved', 'verified', 'paid', 'deferred'] as const` and `isPaymentResolvedForApproval(status)`, documented as answering "may staff approve?" (R-9: the module insists on one helper per question).
  - `ApplicationApprovalActions.tsx:76-77`, `:165-170` and `useApprovalActionCommands` use it; the disabled title becomes "Payment must be paid or deferred first".
  - Drift guards: new backend test `backend/tests/unit/test_approval_payment_gate_drift_sjr.py` parses the TypeScript array literal and asserts set equality with `RESOLVED_PAYMENT_STATUSES`. A frontend test asserts `isPaymentResolvedForApproval(s) === isPaymentResolvedForProgress(s)` for every status string either module knows.
- **Errors / schema:** none; the server gate is unchanged and authoritative.
- **Rollout:** frontend only.
- **Observability:** none.
- **CTM / steering:** CTM "Force-approved propagation" (CTM 95) adds the frontend Approve gate as a consumer of `RESOLVED_PAYMENT_STATUSES` (whose path is now the alias in `admin_review_views.py:35`) with the drift guard; "Drift Guard Inventory".

#### R7-c Conditional records no conditions (C-12, R-8) — clauses 1.36 → 2.38

- **Fix:**
  - New `apps/admissions/src/components/admin/applications/ConditionsDialog.tsx` (Radix Dialog). It holds 1–10 rows, each with a description (required, 1–500 characters after trimming) and a deadline date (required, today or later in the admin's local date). Confirm is disabled until every row is valid.
  - It sends `{ conditions: [{ description, deadline: 'YYYY-MM-DD' }] }` with the existing review payload. `condition_type` is omitted, so the backend default `other` applies and no new frontend mirror of `VALID_CONDITION_TYPES` is created.
  - "Conditional" in `ApplicationApprovalActions.tsx:192-194` opens the dialog instead of sending.
  - `admin_review_views.py:803`: the branch condition becomes `if new_status == "conditionally_approved":`.
    - A payload that is not a list returns 400 `VALIDATION_ERROR` with `details.conditions`.
    - More than 10 entries return 400 `TOO_MANY_CONDITIONS`.
    - Otherwise the payload goes to `ConditionManager.assign_conditions`, which already refuses an empty list with `NO_CONDITIONS_PROVIDED` (`backend/apps/applications/condition_manager.py:72-76`).
- **Errors and validation:** as listed; nothing is written on refusal.
- **Schema:** none.
- **Rollout / rollback:** backend and frontend together, because an older frontend would now get 400 for its empty Conditional. Rollback: revert both.
- **Observability:** existing review-decision audit.
- **CTM / steering:** CTM "Offer conditions" (CTM 527+) and "Admin review workspace contract": the review command requires conditions for `conditionally_approved`. Bulk status stays out of scope (OS-11).

#### R7-d Letters without a profile (B-08, C-09; pending user sign-off, D9) — clauses 1.37 → 2.39, 2.40

- **Fix:**
  - `render_context.py` gains `has_active_document_profile(application, document_type) -> bool`, implemented by calling the same profile resolution that sets `RenderContext.has_profile`, so the read path and the renderer cannot disagree.
  - `_generation_status`, before returning `not_requested`: when the type is in `PROFILE_REQUIRED_DOCUMENT_TYPES` and no profile resolves, return `setup_required` with `error_code: "DOCUMENT_PROFILE_NOT_CONFIGURED"` for students and staff. The POST path is unchanged, so staff alerts from the task still fire.
  - Student copy in `officialDocumentPresentation.ts` for a letter in `setup_required`: "Your <letter> isn't available yet. <School> is still setting it up. We'll let you know when it's ready.", followed by the support contact from `resolveTenantSupportContact`. There is no Prepare button, no neutral-fallback render (DEC-5), and no "ready".
  - Slip and receipt rendering is unchanged (2.40, 3.13).
  - `harness_seed_tenants.py` creates `InstitutionDocumentProfile` rows for `acceptance_letter` and `conditional_offer` on each seeded offering. The payload is clearly fictional (signatory "Admissions Registrar (example)", the seeded fee, "Example Bank" rows if the schema requires bank rows) and validated with `validate_profile_payload` before writing, as `seed_tenant_document_profiles` does.
- **Errors and validation:** a profile resolution error fails closed to `setup_required` and logs ERROR (ids only).
- **Schema:** none.
- **Rollout / rollback:** backend and frontend; revert to roll back.
- **Observability:** existing setup-required alert; counter `official_document.setup_required_read`.
- **CTM / steering:** CTM "Document profiles, official-document lifecycle, and tenant templates" (CTM 1306-1328): the read path pre-checks profiles. `docs/audits/document-type-audit.md:314-317` (seeding note); `docs/runbooks/multi-tenant-operations.md` (profile setup is part of onboarding). All marked "pending user sign-off (D9)".

---

### R8 — Session continuity and first-step friction

#### R8-a The route guards redirect without trying the refresh cookie (C-13, R-16) — clauses 1.38 → 2.41

- **Root cause:** `StudentRoute.tsx:39-41` and `AdminRoute.tsx:92-94` redirect as soon as `useAuth().user` is null, and `ProtectedRoute.tsx:53-56` has the same rule, although no route uses it (D-A9). `authQueries.ts:84-95` deliberately does not refresh, so public pages never POST refresh.
- **Fix:**
  - New `apps/admissions/src/hooks/auth/useSessionRestoreOnce.ts` exports `useSessionRestoreOnce(sessionSettledUnauthenticated: boolean): 'idle' | 'restoring' | 'done'`, plus `suppressSessionRestore()` and `allowSessionRestore()`, which set and clear a module-level flag.
    - The first time in a mount that the argument is true and restore is not suppressed, the hook sets `restoring` and calls `apiClient.refreshAuthSession()` once (an `attemptedRef`). On `true` it awaits `queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })`. Either way it then sets `done`.
    - When restore is suppressed, it goes straight to `done` and sends nothing.
  - `StudentRoute` and `AdminRoute` call it with `!loading && !user`, and `ProtectedRoute` with `!isLoading && !isAuthenticated`. While there is no user and the hook is not `done`, each renders `GuardInlineSkeleton label="Restoring your session"` instead of redirecting. Once it is `done`, each renders as today: children if the session now reads authenticated, otherwise the same redirect (with `ProtectedRoute`'s return-path persistence). The other checks keep their order: `StudentRoute` still sends admins to the admin dashboard (`:43-45`), and `AdminRoute` still waits for capabilities (`:99-106`).
  - Sign-out never triggers a restore. `useSessionListener.signOut` (`useSessionListener.ts:201`) calls `suppressSessionRestore()` as its first statement. It must come first because `signOut` fires the logout POST without awaiting it (`:212`) and then clears the session query (`:215`): a guard that saw the cleared session could otherwise refresh with a still-valid cookie and sign the user back in (3.19). The cross-tab logout handler (`lib/authBroadcast.ts:163`, mounted by `contexts/AuthContext.tsx:53`) calls it first too, and so does the auth-failure callback `AuthContext` registers with the client (`contexts/AuthContext.tsx:65`, `configureApiClientAuthFailure`), because its refresh has just failed. A successful sign-in, and any session read that returns a user, call `allowSessionRestore()`.
  - `refreshAuthSession()` shares the promise lock with the 401 interceptor, and on failure it dispatches no auth-failure cascade (`apps/admissions/src/services/authInterceptor.ts:140-161`).
  - `fetchSessionData` and its comment are unchanged, so public pages, which render no guard, still never refresh. The comment gains one line naming `useSessionRestoreOnce` as the only bootstrap refresh.
- **Errors and validation:** network error during refresh → treated as `false` → sign-in. One attempt per guard mount means no loop (EC-20).
- **Schema:** none.
- **Rollout / rollback:** frontend only; revert to roll back.
- **Observability:** `logger.info('[auth] session restore', { outcome })` with `restored` or `failed` only.
- **CTM / steering:** `tech.md` "Response And Auth Conventions" adds "the student, admin and generic route guards make one refresh attempt through `useSessionRestoreOnce` before redirecting to sign-in, and none after a sign-out; public pages never refresh". ADR-014 is referenced, not changed.

#### R8-b Local phone formats refused, values echoed, field errors dropped (C-14, R-14) — clauses 1.39 → 2.42

- **Root cause:** `validators.py:12-19`, `:26-28`; `useSessionListener.ts:196`; `SignUpPage.tsx:81-83`.
- **Fix:**
  - Move `_normalize_phone_e164` from `backend/apps/documents/payment_helpers.py:100-…` into `backend/apps/common/validators.py` as `normalize_zambian_msisdn(value: str) -> str` (raises `ValueError("INVALID_PHONE_FORMAT")`). `payment_helpers` keeps `_normalize_phone_e164 = normalize_zambian_msisdn`, so mobile-money behaviour is byte-for-byte the same and there is one implementation.
  - `validate_zambian_phone(value)` returns `normalize_zambian_msisdn(value)` and on `ValueError` raises `ValidationError("Enter a Zambian mobile number, for example 0971234567 or +260971234567.", code="invalid_phone")`.
  - `validate_nrc` raises "Enter an NRC number in the format 123456/78/9." with no value. All four existing callers (`backend/apps/accounts/serializers.py:43`, `:155`; `backend/apps/applications/serializers.py:627`, `:726`) gain local-format acceptance through the same function.
  - Frontend: `SignUpPage.tsx` uses `zambianMsisdnSchema` (`apps/admissions/src/lib/zambianMsisdn.ts`) for `phone` with the same message, and sends the normalised value.
  - `SignUpResult` (`apps/admissions/src/types/auth.ts:83`) gains `fieldErrors?: Record<string, string>`. `useSessionListener.signUp` returns `{ error, fieldErrors }` from the caught error. `SignUpPage` throws an error carrying `fieldErrors`, so `getFieldErrors` feeds each `Input`, which already sets `aria-invalid` and `aria-describedby` (`apps/admissions/src/components/ui/input.tsx:55-57`). When field errors are present, the banner reads "Please check the highlighted fields."
  - Shared vectors: new fixture `apps/admissions/tests/unit/__fixtures__/zambianMsisdnVectors.json` (input → expected output or `null`) is the drift guard. A Vitest test (`apps/admissions/tests/unit/zambianMsisdnVectors.test.ts`) and a pytest test (`backend/tests/unit/test_zambian_msisdn_vectors.py`, which loads the file by repo-relative path, the pattern of the existing guards that read frontend files) both run every vector.
- **Errors and validation:** invalid phone → 400 with `details.phone` and the message above; the client refuses locally first.
- **Schema:** none (`+260XXXXXXXXX` is 13 characters, within `varchar(20)`).
- **Rollout / rollback:** backend and frontend together; revert to roll back. Existing `+260` numbers are unchanged (3.18).
- **Observability:** none; messages carry no value.
- **CTM / steering:** CTM registers "Zambian MSISDN normalisation" as a mirrored concept (backend `normalize_zambian_msisdn`, frontend `normalizeZambianMsisdn`) with the shared-vector drift guard (CTM 41-58 rule).

---

### R9 — A journey gate that can see these failures

#### R9-a Harness switches for the gate — clauses 1.41 → 2.43, 2.45

- **Fix:**
  - `backend/config/settings/harness.py`: `RATELIMIT_ENABLE = os.environ.get("HARNESS_RATELIMIT_ENABLE", "0").lower() in ("1", "true", "yes")`. The default stays off for the broad matrix (3.22). The comment states that every browser context in the harness shares one host address, and that production keys by real client after R3-a.
  - `harness/docker-compose.harness.yml`:
    - the backend anchor passes `S3_SIGNED_URL_TTL_SECONDS: ${S3_SIGNED_URL_TTL_SECONDS:-900}`, `S3_PUBLIC_ENDPOINT_URL: ${S3_PUBLIC_ENDPOINT_URL:-}` and `HARNESS_RATELIMIT_ENABLE: ${HARNESS_RATELIMIT_ENABLE:-0}`;
    - `minio-setup` runs `mc anonymous set ${HARNESS_BUCKET_ANONYMOUS:-download} local/harness` (the default keeps today's policy);
    - `CSRF_TRUSTED_ORIGINS` already covers `localhost:8090`.
  - New `harness/bin/harness journey-gate` command. It exports `HARNESS_RATELIMIT_ENABLE=1`, `S3_SIGNED_URL_TTL_SECONDS=20`, `S3_PUBLIC_ENDPOINT_URL=http://localhost:59000` and `HARNESS_BUCKET_ANONYMOUS=none`, then runs `build_spa`, `compose_up`, `wait_healthy`, `ensure_browser`, the storage check (R9-d), the edge check (R9-c), `run_journey_gate` and `drain_check`.
  - Evidence goes to the run-scoped root `apps/admissions/test-results/harness-evidence` (`helpers/evidence-dir.ts:65`), never to `docs/v2-evidence` (`V2_EVIDENCE_TASK_DIRS` stays unset).
  - New helper `resetRateLimitCounters()` in `apps/admissions/tests/harness-e2e/helpers/ops.ts`. It runs one `sh -c` inside the harness `redis` container (`redis:7-alpine`) that pipes `redis-cli --scan --pattern ':1:rl:*'` and `--pattern ':1:throttle_*'` into `redis-cli del`, and prints the number of keys deleted. These are django-ratelimit's counters and DRF's throttle histories in Django's default key format (`<KEY_PREFIX>:<VERSION>:<key>`, with neither set in `base.py:285-290`), in the cache database `harness/harness.env:22` names. It never runs `FLUSHDB`, because that database also holds the Celery broker queues (`harness/harness.env:23`). Every browser context and request helper in the harness reaches Caddy from one host address, which production does not, so the gate calls it before each spec file and before the staff actor starts (R9-b).

#### R9-b The journey specs — clauses 1.40, 1.41 → 2.43–2.45, 2.31

- **Fix:**
  - New config `apps/admissions/playwright.journey-gate.config.ts`:
    - `testDir: './tests/harness-e2e/journey-gate'`, `retries: 0`, `workers: 1`, `trace: 'retain-on-failure'`, JSON reporter into the evidence directory;
    - project `journey-gate-mobile`: `devices['iPhone 13']` (390×844) with `browserName: 'chromium'`, because the throttle needs CDP;
    - project `journey-gate-desktop`: 1440×900, for the Submit spec only.
  - Specs reuse `harness-fixtures.ts`, so any unasserted HTTP ≥ 400 on the main page and any console error fail the run. That fixture alone does not meet 2.45. It listens only on the main page (`harness-fixtures.ts:108-130`), and its default allowances for `/api/v1/auth/session` and `/api/v1/auth/refresh` match on URL only (`:63-69`, `:83-85`, `:99-103`), so a 429 or 5xx on those URLs passes. Two additions close the gap:
    - New `apps/admissions/tests/harness-e2e/journey-gate/strictStatusGuard.ts` exports `attachStrictStatusGuard(context)`. It registers `context.on('response', …)` on every browser context the gate creates (the student's, which includes its popups, and the staff context of step 13; Playwright 1.58 emits context-level response events for every page in the context) and records a violation for any response with status 429 or ≥ 500 on any URL, whatever `gate.allowRequest` says. The gate fixture fails the test on any recorded violation. The deliberate expired-URL probe in step 8 uses `request`, an `APIRequestContext` whose responses are not page events, and expects 403, so it is unaffected.
    - `HarnessGate` gains an opt-in `statusAwareDefaults` mode in which the two default allowances apply only to status 401. The gate fixture turns it on; the broad matrix keeps today's URL-only allowances (3.22).
  - Before each spec file and before the staff actor starts, the specs call `resetRateLimitCounters()` (R9-a). Each spec counts its requests per limiter scope, classified by the same path prefixes and order as `RateLimitMiddleware.SCOPE_LIMITS` (`backend/apps/common/middleware.py:265-303`) plus the two DRF document scopes, and writes the counts to `rate-limit-headroom.json` in the evidence directory, so the headroom against each budget is visible (EC-13).
  - **`student-journey-gate.spec.ts` (mobile, blocking):**
    1. Register through the UI with phone `0971234567` (exercises R8.2).
    2. Choose a programme and intake on a seeded tenant host, confirm the assigned school, and fill personal details.
    3. Enter five grades, reload, and assert five grades (C-05).
    4. Open a CDP session and call `Network.emulateNetworkConditions({ offline: false, latency: 150, downloadThroughput: -1, uploadThroughput: 125000 })`.
    5. Upload a generated 2.0 MB PDF through the identity input and a generated PNG result slip through the result-slip input. Assert exactly one `POST /api/v1/documents/upload/` per file, a progressbar with `aria-valuenow` strictly between 0 and 100 at least once, and an identity upload duration of at least `0.8 × bytes ÷ 125000` seconds; a shorter duration fails the run as "throttle not applied" (2.44).
    6. Clear the throttle.
    7. For each document, click View, wait for the popup, and assert its main response is 200 from the storage host with the expected content type and a `%PDF` or PNG signature; record the URL.
    8. Wait 25 s (20 s lifetime plus margin). Assert `request.get(recordedUrl)` returns 403 (expiry is real and the bucket is private). Click View again and assert 200. Reload the page, click View, and assert 200.
    9. Defer payment and assert Next is enabled with no "Payment in progress" (C-06, C-07).
    10. Confirm and click Submit; assert one `POST …/submit/` returning 200 and the submitted state (C-01).
    11. Delete the `access_token` cookie (keeping the refresh cookie), navigate to `/student/status`, and assert no sign-in page (C-13).
    12. Use the slip's Prepare/Open control and assert the popup's response is a 200 PDF from storage.
    13. *(P0b, task 5)* Sign in as `decider@<tenant>.localhost` in a second context, open the application, Review, Approve with the payment deferred, then as the student Open the acceptance letter and assert a 200 PDF.
  - **`submit-desktop.spec.ts` (desktop, blocking):** prepare a ready draft through API helpers, then click Submit in the UI and assert the request and the submitted state (R6.1 at 1440×900).
  - **`upload-near-limit.spec.ts` (mobile, blocking):** a generated 9.5 MB PDF over the 1 Mbit/s throttle; assert one POST and success (R2.1). It takes about 80 s.
  - **`a11y-surfaces.spec.ts` (mobile, blocking, 3.11):** prepare a student with an uploaded document through API helpers. At 390×844, run `AxeBuilder` with the tags `axe-viewport-sweep.spec.ts:166-172` already uses (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; `@axe-core/playwright` is already a dependency) on the workspace documents list and on the opener's invalid-link state (`?doc=not-a-uuid`) and not-found state (a random UUID), which are the opener states that stay on screen. Fail on any critical or serious violation, and assert `document.documentElement.scrollWidth <= window.innerWidth` on each.
  - Fixture files are generated at test time: a valid PDF header and a padding stream, and a PNG drawn with text. No binary is committed.

#### R9-c Two clients behind the real edge — clauses 1.12 → 2.12

- **Fix:** new `harness/checks/edge_two_clients.py` with two modes, `exhaust` and `fresh`, run in two containers of the `adapters` image on the harness network, and a new `edge_check` function in `harness/bin/harness` that orchestrates them.
  - The `adapters` image is stdlib-only `python:3.12-slim` and copies only `adapter_server.py` (`harness/adapters/Dockerfile`). So the script uses `urllib.request` only (a 4xx arrives as `HTTPError`, whose `.code` is read), and both containers get the checks directory as a read-only bind mount: `-v "<absolute path of harness/checks>:/checks:ro"`.
  - `edge_check` starts container A with `docker compose run -d --name edge-a -v … adapters sleep 300`, so A keeps its address, and runs `docker exec edge-a python /checks/edge_two_clients.py exhaust`. It then runs container B with `docker compose run --rm -v … adapters python /checks/edge_two_clients.py fresh`; B gets a different address while A is alive. Finally it removes A (`docker rm -f edge-a`), also on failure.
  - Requests go to `http://caddy/…` with the header `Host: localhost`, the host the web healthcheck uses (`harness/docker-compose.harness.yml:129`). `caddy` is also in the harness `ALLOWED_HOSTS` (`harness/harness.env:26`), but pinning `localhost` keeps the check independent of that list.
  - `exhaust` sends (limit + 1) requests to `/api/v1/auth/login/` (wrong password) and `/api/v1/auth/register/` (invalid body) and expects 429 on the last one.
  - `fresh` sends one request to each and expects a non-429 response.
  - Any other outcome exits 1 with the scope name.

#### R9-d Configuration checks in CI — clauses 1.42 → 2.46, 2.1

- **Fix:**
  - The unit-level configuration tests (R1-b, R1-c and the storage settings contract test) live under `backend/tests/unit/`, which CI's existing blocking "Run unit tests" step already runs (`.github/workflows/ci.yml`, step `suite-pytest`).
  - The round-trip runs in the gate workflow twice: `docker compose exec -T web python manage.py storage_roundtrip_check --expect-private` on the harness, and the same command on the documented local-test stack. For the latter, a job copies `backend/.env.local.test.example` to `.env.local.test`, brings up `backend/docker-compose.local-test.yml`, runs the check, and tears down.

#### R9-e The workflow — clauses 1.40 → 2.43, 2.47

- **Fix:**
  - New `.github/workflows/student-journey-gate.yml`.
    - Triggers: every `pull_request`, `push` to `main`, and `workflow_dispatch`, with **no** `paths:` filter. GitHub leaves a required check pending when path filtering skips its workflow, so a filtered gate made required would block every pull request that touches only other paths (docs, `apps/jobs-ops`).
    - Jobs `journey-gate` (timeout 45 min) and `local-stack-storage` (timeout 15 min); no `continue-on-error`.
    - The first steps of each job decide relevance: `actions/checkout@v4` with `fetch-depth: 0`, then `git diff --name-only "$BASE...HEAD"`, where `BASE` is `origin/${{ github.base_ref }}` on a pull request and `${{ github.event.before }}` on a push. A dispatch, or a push whose `before` is all zeros, counts as relevant. The step sets `relevant=true` when any changed path is under `apps/admissions/`, `backend/` or `harness/`, or is `.github/workflows/student-journey-gate.yml`. Every later step has `if: steps.changes.outputs.relevant == 'true'`, so on an unrelated change the job reports success within seconds and the required check never stays pending. No new third-party action is added; both actions above are already used by the repo's workflows.
    - Steps when relevant: `oven-sh/setup-bun@v2`, `bash harness/bin/harness journey-gate`, always upload the evidence directory as an artifact (14 days), dump harness logs on failure, always tear down.
  - Making both jobs required checks on `main` is a repository-settings step for the operator (task 4).
  - The gate never contacts production; production verification is task 6 (DEC-7).
- **Errors:** any failed step fails the job. A flake budget of zero: task 4 requires three consecutive green runs before the gate is declared stable. Because every harness context shares one client address, the gate clears the limiter counters before each spec file and before the staff actor (R9-a), and records per-scope counts; a 429 in any run is then a budget finding inside one spec's window (EC-13), not an artefact of the harness topology.
- **Schema:** none.
- **Rollout / rollback:** additive CI. Rollback: remove the required-check setting and the file.
- **Observability:** the uploaded report, traces and the drain-check output.
- **CTM / steering:** CTM "Drift Guard Inventory" (CTM 1347+) lists the gate and every new guard test. `tech.md` "Verification Expectations" adds the gate. `structure.md` "Testing Layout" adds `tests/harness-e2e/journey-gate/`.

---

### R10 — Diagnostics badge (dossier §5) — clauses 1.43 → 2.48

- **Fix:**
  - `BuildVersionBadge.tsx` becomes `export function BuildVersionBadge(props) { return import.meta.env.DEV ? <DevBuildVersionBadge {...props} /> : null }`. The hooks move into the inner `DevBuildVersionBadge`, so the rules of hooks hold.
  - Vite replaces `import.meta.env.DEV` with `false` in production builds, so the inner component and its `getBackendBuildVersion()` probe are removed from the bundle.
  - The inner badge drops `text-[11px]` and `backdrop-blur` for `text-xs` and an opaque `bg-muted`.
  - Both render sites wrap the badge in a padded `div`: `AppLayout.tsx:294-296` (`px-4 pb-4 pt-2 md:px-6`) and `SharedFooter.tsx:187-189` (`mt-4 flex justify-center text-white/90`). A gate inside the component alone would leave those wrappers rendering empty in production: a blank band under every authenticated page and an empty margin in the public footer. So each site renders its wrapper only under `import.meta.env.DEV` (`{import.meta.env.DEV && (<div …><BuildVersionBadge … /></div>)}`), and Vite drops the whole block from production bundles. The component keeps its own gate, so a future render site is covered too.
  - `X-Backend-Version` and `VITE_APP_VERSION` stay for support and chunk reloading (`apps/admissions/src/lib/reloadControl.ts:212-226`).
- **Errors / schema:** none.
- **Rollout / rollback:** frontend only; revert to roll back.
- **Observability:** none.
- **CTM / steering:** DESIGN.md §4 (`DESIGN.md:176`) moves `BuildVersionBadge` out of the canonical Auth/account primitives into a "development diagnostics only" note. PRODUCT.md is unchanged.

---

## Invariant Ownership

| Invariant | Owner (layer) | Why there |
|---|---|---|
| No expiring URL is persisted | The three document writers (`document_storage_views.py`, `condition_evidence_service.py`, `tasks/pdf_generation.py`) through `commit_version`, guarded by `test_no_persisted_signed_urls_sjr.py` | Only the server writes these columns |
| Snapshot equals the current document id, atomically with the version | `document_evidence.commit_version` | It already owns the version transaction and lock order |
| A key is replayable only from a committed stage and is released otherwise | `document_evidence.mark_stage` | The single writer of stage state |
| Client identity for rate limiting | `apps.common.request_utils.get_client_ip` | One function serves the middleware, its fallback, DRF throttles and audit |
| Per-user document budgets | DRF `DocumentUserRateThrottle` | Only DRF knows the authenticated user (R-6) |
| Document authority (owner or scoped capability, masked 404) | `resolve_owner_or_scoped_document` / `_application` | The canonical resolvers; no raw role strings in endpoints |
| A reviewer's read access never authorises a document command | `_get_authorized_document(..., allow_assigned_reviewer=False)` on extract and delete | The one loader those views share; a read capability must not authorise a write (tenancy steering) |
| A legacy synthetic row appears only for a snapshot that no listed document covers | `ApplicationDocumentsView.get` (id-aware synthesis, R4-b) | It is the only reader that compares snapshot values |
| Session restore: non-public guards only, once per mount, never after a sign-out | `useSessionRestoreOnce`, suppressed by `signOut`, the cross-tab logout handler and the auth-failure callback | One hook serves every guard; only those three paths know that a cleared session is intentional or already failed a refresh |
| One client readiness computation | `useWizardController.computeReadiness` | Both consumers live in the controller's scope; the server's `submit_application` remains the authority |
| "Saved" means acknowledged | Draft machine plus `deriveWizardPageSaveView` | The machine owns every draft write (CTM "Online student drafts") |
| Approve gate set equals `RESOLVED_PAYMENT_STATUSES` | Backend constant; frontend mirror plus drift guard | The server gate is authoritative |
| A conditional approval has conditions | `ConditionManager.assign_conditions`, reached from the review view | It already refuses empty lists |
| A seed re-run never removes a membership permission unless `--read-only` or `--replace` is passed, and every change it commits has its audit row | `seed_membership_permissions` (`_seed_memberships.py`) and the command's in-transaction audit count | One pure rule serves both seed commands; only the command knows which writes it made |
| No merge reaches production before task 6.1's checks and backup | The operator's deploy pause (task 2.6; the environment reference in task 2.7) until task 6.2 | `deploy.yml` deploys on every green CI run on `main`; only repository settings can stop it without changing its code |
| Letters never render without a profile | `PROFILE_REQUIRED_DOCUMENT_TYPES` (unchanged) and the GET pre-check | The renderer rule stays the source; the read path asks the same resolver |
| Signed URL lifetime | Settings (`S3_SIGNED_URL_TTL_SECONDS`) | The client never computes an expiry |
| Startup refuses missing storage config | `CommonConfig.ready()` | Runs with final settings in every process |

## Input Validation

| Input | Required | Type and limits | On failure |
|---|---|---|---|
| Upload `file` | yes | ≤ 10 MiB, non-empty, magic bytes in the requirement's accepted set | Existing codes (3.5); generic declared type with unknown bytes → 400 `INVALID_FILE` |
| Upload `document_type`, `application_id` | yes | In the application's contract; owned or scoped application | Existing codes |
| `Idempotency-Key` header (upload) | no | 8–128 characters of `[A-Za-z0-9._:-]` | 400 `VALIDATION_ERROR`, value not echoed |
| Grades batch `partial` | no | Boolean; default false | Non-boolean treated as false |
| Grades batch `grades` (partial) | yes | List of ≤ 10 `{subject_id: canonical UUID, grade: int 1–9}`, unique subjects | 400 `VALIDATION_ERROR`, `DUPLICATE_SUBJECT` or `TOO_MANY_SUBJECTS` |
| Review `conditions` (for `conditionally_approved`) | yes | List of 1–10 `{description: 1–500 chars, deadline: date}` | 400 `VALIDATION_ERROR`, `TOO_MANY_CONDITIONS`, or `ConditionManager` codes |
| `seed_school_admins --permissions` | no (default `review`) | Non-empty comma list ⊆ `GRANT_PERMISSION_ALLOWLIST`; duplicates collapsed | `CommandError` listing the allowed values, nothing written |
| `seed_school_admins --replace`, `--read-only` | no | Flags; `--read-only` excludes both `--permissions` and `--replace` | `CommandError` naming the conflict, nothing written |
| Opener query | yes | Exactly one documented form; UUID regex; official type in the four-value set | "This link isn't valid." and no request |
| `X-Forwarded-For` | no | Untrusted; parsed only from a trusted peer, ≤ `NUM_PROXIES` hops, each a valid IP | Ignored or truncated at the first malformed hop |
| `Retry-After` (client) | no | Integer seconds or HTTP date; clamped to 0–3600 | Treated as unknown |
| `S3_SIGNED_URL_TTL_SECONDS` | no | Integer 10–3600; default 900 | `ImproperlyConfigured` at startup |
| `S3_PUBLIC_ENDPOINT_URL` | no | `http(s)://` URL | `ImproperlyConfigured` at startup |
| `TRUSTED_PROXY_CIDRS` | no | Comma list of CIDRs | `ImproperlyConfigured` at startup |
| Registration `phone` | no (blank allowed, as today) | A supported Zambian MSISDN shape | 400 `details.phone`, no echo |

## Schema and Data Changes

- **Schema:** none. `extraction_state = 'pending'` is already allowed; snapshot ids fit `varchar(500)`; stage key release is a data update; `file_url` is `text`.
- **Data:** `backend/scripts/2026_11_02_01_repair_document_snapshot_presence.sql` (R4-d), idempotent and additive, proven on a Neon branch before merge (including a `pg_trigger` check and an unchanged-`updated_at` comparison), then applied to the Neon default branch with the user's confirmation. In production it runs at boot on the first deploy that contains it, which is the approved deploy in task 6.2 (DEC-10), after the operator's `deploy/backup-db.sh` (task 6.1).
- **Existing rows holding presigned URLs: derive the key at read time; no backfill.** Rules in R4-c. Safety notes:
  1. No stored value is rewritten, so a revert is always safe.
  2. Derivation reads only the URL path, never its query, so an expired signature is irrelevant.
  3. A row whose derived key no longer exists in the bucket opens to the honest R5.4 state (a 404 from storage surfaces as "can't be opened right now").
  4. P0-ops counts rows with `storage_key IS NULL` to size the legacy fallback before anyone removes it.

## Rollout Order and Rollback

**A merge to `main` is not a deploy until task 6.2.** At HEAD, `.github/workflows/deploy.yml` builds both images and rolls the production stack after every green CI run on `main` (`:6-11`, `:24`). It has no backup step and no approval, and none of its jobs references an environment. Without a pause, merging R1-b would enforce `REQUIRED_ENV_VARS` in production for the first time and merging R4-d would run the repair script at boot without a backup, long before task 6.1. So the operator pauses automatic deploys first (DEC-10).

1. **Deploy pause** (tasks 2.6 and 2.7), before task 3.2.
   - Preferred: a GitHub `production` environment with required reviewers on both Deploy jobs (`build-and-push` at `:22` and `deploy` at `:80`). It keeps the workflow, its disk gate and its rollback trap (`:186-204`) intact and leaves an approval trail. It takes two steps: the environment and its reviewers in repository settings (task 2.6), then a code change that adds `environment: production` to both jobs (task 2.7).
   - Fallback: disable the Deploy workflow in the Actions UI (task 2.6). It needs no code change.
   - The preferred path depends on the repository staying public. On the GitHub Free, Pro and Team plans, required reviewers apply only to public repositories ([GitHub: Managing environments for deployment](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment)), and the D11 operator track may change the visibility. So if the visibility or plan changes before task 6.2, the operator repeats task 2.6's confirmation and switches to the fallback at once if a Deploy run no longer waits for review. Tasks 3.2 and 3.15 repeat that check before they merge.
   - Either way the pause covers everything the workflow ships: the backend, which serves admissions and jobs-ops, the frontend image, which carries both the admissions and the jobs-ops builds (`apps/admissions/Dockerfile:53-61`), and all Spec B work. Production is unreachable today (D14), so nobody sees an effect yet.
2. **P0a backend and frontend in one merge per R-group** (tasks 3.x), in the order R1, R2, R3, R4, R5, R6, R8, R10. Each group is independently revertable. R2-a/R2-b and R7-c merge backend and frontend together, so `main` never holds one half; R3-c's backend can merge first.
3. **Gate** (task 4) once the P0a groups pass locally; required-check setting by the operator.
4. **P0b** (task 5) after the gate is green; R7 groups merge together with the gate extension.
5. **Production** (task 6), blocked until a live host exists. In order: confirm the pause still holds, confirm every `REQUIRED_ENV_VARS` name is set (R1-b refuses to start without them), and back up (6.1); approve the first deploy and let its boot sweep apply the repair script (6.2); once that deploy succeeds and its checks pass, re-enable automatic deploys (6.2); then run the journey once against production (6.3).

There are no flags, so rollback is a code revert. The data repair needs no rollback (R4-d). If the approved deploy fails, its rollback trap restores the previous images, and automatic deploys stay paused until the user decides. The pause itself is undone in task 6.2: remove the required reviewers from `production`, whose reference in `deploy.yml` stays and keeps the deployment history, or re-enable the workflow on the fallback path.

## Observability

| Event | Level / kind | Fields (never PII) |
|---|---|---|
| `ImproperlyConfigured` at startup | stderr, fatal | Variable names |
| `document.stage.idempotency_released` | metric | stage id, document type |
| `document.upload.detected_mime` | metric | declared class, detected type |
| `document.snapshot.healed_on_replay` | metric | application id, document type |
| `document.sign.failed`, `official_document.sign_failed` | ERROR log | document id, kind or document type |
| `document.open.legacy_provider` | INFO log | document id |
| `ratelimit.limited` | metric | scope, key kind (ip or user) |
| `ratelimit.document_throttle.cache_unavailable` | WARNING log | none |
| `client_ip.remote_addr_unusable` | WARNING log, once per process | none |
| `ocr.extract.enqueue_failed` | ERROR log and metric | document id |
| `official_document.student_served_historical`, `official_document.setup_required_read` | metric | document type |
| `tenant.membership.permissions_seeded` | audit row, one per membership a seed run changes | membership id, institution id, permissions before and after, created, reactivated, mode, source, run id |
| Frontend: upload failure, OCR stop reason, document-open failure, session restore outcome, grades acknowledged | `logger` | codes, counts and outcomes only |

## Canonical Truth Map and Steering Updates (summary)

Each defect block lists its entries; these apply to the spec as a whole.

- **CTM "Active Alignment Spec" (CTM 9-39).** Register `student-journey-repair` as the active bugfix authority for the defects in bugfix.md. It does not supersede `admissions-v2-canonical-rebuild` outside them, and where the two conflict on these surfaces this spec wins.
- **CTM "Drift Guard Inventory" (CTM 1347+).** Add the gate, `uploadPathSingleSource.test.ts`, `test_no_persisted_signed_urls_sjr.py`, `test_approval_payment_gate_drift_sjr.py`, the MSISDN shared vectors, `test_documented_env_vars_are_read.py` and the startup subprocess test.
- **`structure.md`.** "Files Added During Student Journey Repair" table (new modules, scripts, tests, workflow, the opener page, the env template); admissions high-risk paths; Testing Layout.
- **`tech.md`.** Storage row; Commands (`storage_roundtrip_check`, `harness journey-gate`); Response And Auth Conventions; Conventions For New Code (uploads); Verification Expectations; the tracked env-template sentence at `:552`.
- **`product.md`.** The secrets row at `:187`; the "Current Admissions Flow Contract" bullets on viewing documents and grade autosave.
- **`infrastructure.md`.** Proxy trust (`NUM_PROXIES`, `TRUSTED_PROXY_CIDRS`); the `seed_school_admins` example at `:115-120` states the additive rule, `--replace` and `--read-only` (R7-a); once task 2.7 merges, the production stack section notes that both Deploy jobs run in the GitHub `production` environment.
- **`design-skills.md`.** None beyond the autosave rule becoming true.
- **DESIGN.md §4.** The badge note.
- **Spec metadata.** `.kiro/specs/student-journey-repair/.config.kiro` gets `"status": "completed"` only after task 6 passes.

## Testing Strategy

### Validation Approach

Two phases, as in the archived bugfix specs:
1. Write exploration tests that encode the expected behaviour and **fail on the unfixed code**, which confirms each root cause. If one passes on unfixed code, the root cause above is wrong and must be re-investigated before fixing.
2. Write preservation tests that **pass on the unfixed code**, then fix group by group and re-run both sets after each group.

The journey gate (R9) is the end-to-end proof. It is built after the P0a groups because it needs most of them to pass.

**Marker scheme, so CI and the checkpoints stay green.** CI's blocking steps run the whole of `backend/tests/unit/` (`.github/workflows/ci.yml:135-138`, step `suite-pytest`) and `bun run test` (`:359-361`), and every checkpoint re-runs full suites, while later groups' exploration tests must still fail. So every exploration test carries a strict expected-failure marker from the moment it is written: `@pytest.mark.xfail(strict=True, reason="SJR R<n>: fixed in task <m>")` on each pytest test function, and `it.fails(…)` in Vitest 4. Mark only an assertion that fails at HEAD. An assertion that already holds at HEAD is a preservation test, not an exploration test; the four this plan knows of are task 2.2 (h)–(j) and task 2.3 (g). An assertion whose fix lands in another group carries that group's task number, lives in that group's exploration file, and is unmarked at that group's checkpoint. So each test function holds only assertions that fail at HEAD and are fixed in one group, and one marker is true for the whole function. While the bug exists, a marked test counts as passing. If it starts passing before its fix, the strict marker turns it red, which means the root cause above is wrong and must be re-investigated. Each group's fix task removes its own group's markers, and the group's checkpoint re-runs those files unmarked. Counterexamples are recorded from a run without the marker (`pytest --runxfail`; in Vitest, before `it.fails` is added). Task 2.4's baselines exclude the `sjr` files.

**Isolation rule.** Backend tests never run against the Neon default branch or production. Task 2 adds a session-scoped autouse fixture in `backend/tests/conftest.py` that aborts the run before the test database is created when the configured database host is neither a loopback address, an RFC 1918 address, nor a dot-free Docker service name, or when it contains `neon.tech`, `amazonaws.com` or `beanola.com`. Neon is used only through the Neon MCP tools, on a branch, to prove SQL scripts (task 3.15).

### Exploratory Bug Condition Checking

**Goal.** Surface counterexamples on the unfixed code. Each file below asserts the expected behaviour, so it fails now and passes after the fix. Expected counterexamples are in brackets.

**Backend** (`cd backend && python3 -m pytest <files> -q`, local Postgres per `backend/tests/conftest.py`):
- `tests/unit/test_startup_env_validation.py` (R1.2) — run `python -c "import django; django.setup()"` in a subprocess with `DJANGO_SETTINGS_MODULE=config.settings.prod`, then `.staging`. Every other required variable is set to a placeholder, and `PYTEST_CURRENT_TEST` and `TESTING` are removed from the child environment. Each `S3_*` variable is emptied in turn. Assert a non-zero exit, the variable name in stderr, and no placeholder value in stderr. [The process starts.]
- `tests/unit/test_documented_env_vars_are_read.py` (R1.3) — the scanner from R1-c. [`backend/.env.local.test.example` does not exist; unread names in `backend/.env.example`, for example the IMAP variables that `tech.md` says are unused.]
- `tests/unit/test_storage_settings_contract.py` (R1.1, static) — `docker-compose.local-test.yml` declares a MinIO service and gives `web` and `celery` `S3_*` values; the TTL and public-endpoint settings parse and are bounded. [No MinIO service; settings absent.]
- `tests/unit/test_sjr_local_seed_bug_condition.py` (R1.4) — after `harness_seed_tenants`, `FeeResolver` returns a fee for each seeded offering; the command refuses `DJANGO_SETTINGS_MODULE=config.settings.prod`. [No fee resolves.]
- `tests/integration/test_sjr_upload_bug_conditions.py` (R2.4, R2.5) — upload with key K and storage forced to fail (stage compensated), then retry with K and working storage → 201. A valid PDF declared `application/octet-stream`, and a JPEG declared `image/jpg` → 201 with the detected MIME type recorded. A malformed `Idempotency-Key` → 400 without echo. [409 forever; 400 "Unsupported file type".]
- `tests/unit/test_sjr_rate_limit_bug_conditions.py` (R3.1, R3.2) — `RequestFactory` with `REMOTE_ADDR` of a Docker-network address and two different `X-Forwarded-For` values: for each of the login, register, document-upload, document-read and catch-all scopes, exhaust client A and assert client B is not limited. With a public `REMOTE_ADDR` and a forged forwarded header, `get_client_ip` returns `REMOTE_ADDR`, not the forged value; that function also keys the middleware's Redis-outage fallback, `PublicTrackingFailureThrottle` and audit hashing. The middleware's main path already ignores the forged value at HEAD (`key="ip"` reads `REMOTE_ADDR`, `middleware.py:360`), so that half is preservation (j). An authenticated user's document reads and writes hit separate per-user budgets. [Shared bucket; `get_client_ip` returns the forged value; no per-user throttle.]
- `tests/unit/test_sjr_ocr_pending_bug_condition.py` (R3, DEC-2) — extract sets `extraction_state='pending'` and `/info/` reports `ocr_pending`; a broker failure gives 503 `OCR_QUEUE_UNAVAILABLE` and restores the state; the task's no-file path records `ocr_failed`. [No marker; 500 on broker failure.]
- `tests/integration/test_sjr_document_keys_bug_conditions.py` (R4) — after an upload, neither `file_url` nor the snapshot contains `X-Amz-`; the snapshot equals the document id; a 255-character name with spaces and non-ASCII characters gives 201 with the snapshot set and no 5xx on the first attempt; new object keys contain no filename (R4-b, marker reason `SJR R4: fixed in task 3.14`); a legacy-provider `https` URL is returned unchanged; condition evidence and a generated official document persist a key; the document list's `file_url` is freshly signed. A row with only a presigned `file_url` and no `storage_key` already opens through the signed-URL endpoint at HEAD (`storage.py:101-118` derives the key from the URL path), so that case is preservation (h). With a tenant contract whose identity row is `document_type="nrc"`: an application whose `extra_kyc_url` holds the id of its current `nrc` document lists that document once and no `is_legacy_synthetic` row; removing the newest identity document while another current identity document remains leaves no synthetic row; a bare-UUID value never reaches signing. [Presigned URLs persisted; 500 and a NULL snapshot after replay; the filename in every key; a phantom "Identity Support Document" row.]
- `tests/unit/test_sjr_document_access_bug_conditions.py` (R5) — a non-owner student gets, from the document list and from the contract, a 404 whose body is byte-identical to that endpoint's answer for an application id that does not exist; an assigned in-scope reviewer gets 200 from signed-url; an official-document signing failure logs at ERROR and returns `error_code: DOCUMENT_LINK_UNAVAILABLE`; after a status change a student's slip GET returns `ready` with `historical: true`; presign parameters include `ResponseContentDisposition`. An unassigned reviewer already gets the masked 404 at HEAD (every reviewer falls through `IsOwnerOrAdmin`, `document_storage_views.py:114-119`), so that case is preservation (i); filename-free keys are R4's file. [403; reviewer 404; WARNING and no code; `not_requested`.]
- `tests/unit/test_sjr_grades_partial_bug_condition.py` (R6.3) — `{"grades": [3 rows], "partial": true}` → 200 and 3 rows stored; a failure midway leaves the previous set intact. [400 `MINIMUM_SUBJECTS_REQUIRED`; non-atomic replace.]
- `tests/unit/test_sjr_decision_bug_conditions.py` (R7) — `seed_school_admins` grants `review` by default and a seeded admin's review call is not 403; re-running it on a membership the old command created with `[]` adds `review` and emits one event with `permissions_before: []`; `conditionally_approved` with no conditions → 400 `NO_CONDITIONS_PROVIDED`; a letter GET for a profile-less tenant → `setup_required` with `DOCUMENT_PROFILE_NOT_CONFIGURED`. [403; accepted with zero conditions; `not_requested`.]
- `tests/unit/test_approval_payment_gate_drift_sjr.py` (R7.2) — parse `APPROVAL_PAYMENT_STATUSES` from `paymentStatus.ts` and compare with `RESOLVED_PAYMENT_STATUSES`. [Constant missing.]
- `tests/unit/test_sjr_phone_bug_conditions.py` (R8.2) — `09…` and `07…` register and are stored as `+260…`; no validation message for an invalid phone or NRC contains the input. [400 with the number echoed.]

**Frontend** (`cd apps/admissions && bun run test -- <files>`):
- `tests/unit/sjrSubmitReadiness.test.ts` (R6.1, R6.2) — with assignment resolved and a tenant contract, the readiness used by the Submit handler equals the button's, and the handler calls the submit mutation. [The handler reports "Assigned school".]
- `tests/unit/sjrUploadTransport.test.ts` (R2.1–R2.4) — with fake timers and a fake XHR: a transfer that keeps reporting progress for 90 s is not aborted; one failure leads to at most two POSTs carrying the same `Idempotency-Key`; progress callbacks are determinate; the final message uses the first error's code; `requiredDocumentsService.upload` goes through `apiClient.upload`. [Aborted at 30 s; up to 8 POSTs; no key; no progress.]
- `tests/unit/sjrOcrPolling.test.ts` (DEC-2) — no polling after a rejected extract; one poll then stop when `ocr_state` is null; at most 10 polls on the backoff schedule; `getInfo` called with `retries: 0`; stop on 429. [Polling regardless; 30 polls; 3 retries each.]
- `tests/unit/sjrRateLimitCopy.test.tsx` (R3.4) — `ProgramStep` with a 429 on the programmes query or on the intakes query shows the retry copy, not its empty helper; the dashboard's error string for a rate-limited applications request is the retry copy; the client error exposes `retryAfterSeconds`. [Empty-state copy; raw error text.]
- `tests/unit/sjrDocumentViewing.test.tsx` (R5) — `DocumentChecklist` lists a custom type and condition evidence from the documents endpoint with View anchors to the opener; the wizard panel shows View for an uploaded requirement; `studentStatus.nav.desktop` is true; the summary says "ready" only for an issued type; the official hook never calls `window.open` or `triggerUrlDownload` after an await; `DOCUMENT_LINK_UNAVAILABLE` maps to "can't be opened right now". [Each fails.]
- `tests/unit/sjrDocumentOpen.test.tsx` (R5.1, R5.4) — the opener validates the query grammar, signs at mount, replaces the location, and renders each error state. [The route does not exist.]
- `tests/unit/sjrGradesAutosave.test.ts` (R6.3, R6.4) — with fake adapters: a grade edit schedules a save within the debounce and calls `syncGrades` with partial rows; "Saved" is never derived while grades are pending; the outbox holds pending grades. [The machine ignores grades.]
- `tests/unit/sjrPaymentDeferral.test.tsx` (R6.5) — under `<StrictMode>`, deferral enables Next; a server-confirmed deferral clears the recovery entry. [Next disabled; entry kept.]
- `tests/unit/sjrApprovalGate.test.tsx` (R7.2, R7.3) — Approve is enabled for `deferred`; Conditional opens a dialog and sends at least one condition. [Disabled; no conditions sent.]
- `tests/unit/sjrLetterCopy.test.tsx` (R7.4) — a letter in `setup_required` shows "isn't available yet" with the support contact and no "ready". [Ready copy.]
- `tests/unit/sjrSessionRestore.test.tsx` (R8.1) — `StudentRoute` and `AdminRoute`, the guards the 21 non-public routes use, each with an unauthenticated session: call `refreshAuthSession` once, show "Restoring your session" meanwhile, and render children after success or redirect after failure. A public route already sends no refresh at HEAD, so that case is frontend preservation (g). [Immediate redirect.]
- `tests/unit/sjrSignUpPhoneErrors.test.tsx` (R8.2) — a server `details.phone` error marks the phone input `aria-invalid` with `aria-describedby`; the banner contains no `phone:` key and no submitted value. [Banner shows the key and value; no `aria-invalid`.]
- `tests/unit/sjrBuildBadge.test.tsx` (R10) — with `import.meta.env.DEV` false the badge renders nothing and requests nothing, and neither `AppLayout` nor `SharedFooter` renders the badge's wrapper. [It renders.]

**Expected counterexamples** are recorded in the task when each test is first run, for example "upload retry with released-key case returned 409 `DOCUMENT_UPLOAD_IN_PROGRESS`".

### Fix Checking

```
FOR ALL group IN {R1 … R10} DO
  FOR ALL input WHERE isBugCondition_group(input) DO
    result := fixed_system(input)
    ASSERT expectedBehavior_group(result)     -- clauses 2.x of the group
  END FOR
END FOR
```

The exploration tests are re-run after each group's fix with no change except the removal of their strict markers; passing them unmarked is the fix check.

### Preservation Checking

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT original_system(input) = fixed_system(input)
END FOR
```

**Approach.** Observation first: run each preservation test on the unfixed code and record that it passes. Property-based tests cover input spaces that are too large to enumerate: declared type × bytes, forwarded-header shapes, payment status strings, readiness inputs and draft edit sequences.

**Changing an existing test.** A fix task may change an existing test only when the old assertion encodes the defect that task fixes. The task names the test and its new assertion, and the test records why it changed, as tasks 3.13, 3.14 and 5.3 do. Any other existing test that turns red is a regression. The baselines below count an updated test with its new assertion.

**Existing suites that are preservation baselines** (run unchanged before and after every group, with two exceptions: `test_document_evidence_compensation_7_3.py` `:180`, `:341`, `:431` and `:490` pin the snapshot shape and the `build_object_key` signature that R4-b changes, and are updated in task 3.14; `test_official_document_durability_10_4.py` `:632-643` and `:645-658` pin the student read precedence that R5-e changes, and are updated in task 3.19):
- tenant isolation: `backend/tests/property/test_scope_before_lookup.py`, `test_cross_tenant_invisibility.py`, `test_production_scope_masking_properties.py`, `test_access_scope_properties.py`; `backend/tests/unit/test_scope_drift_guard.py`, `test_unscoped_endpoint_guard.py`;
- payments: `test_payment_single_path_8_2.py`, `test_prod_settings_required_flags.py`, `test_payment_phase_8_2.py`, `test_payment_idempotence_8_2.py`; frontend `paymentStatusMappingDriftGuard.test.ts`, `feeProviderSourceScan.test.ts`, `paymentRecoveryPresentation.test.ts`;
- auth: CI's critical slice (`ci.yml:124`);
- uploads: `requiredDocumentsDrift.test.ts`, `test_required_documents_contract.py`, `backend/tests/integration/test_document_evidence_compensation_7_3.py`, `test_required_documents_contract_7_2.py`;
- drafts: `wizardDraft*.test.ts*`, `draftOutboxMinimisation.property.test.ts`;
- submission: `submitIdempotency.test.ts`;
- AI and official documents: `test_no_admissions_generative_ai_guard.py`, `documentFlowDriftGuard.test.ts`, `test_official_document_dedup_guard.py`, `test_official_document_durability_10_4.py`, the brand drift guards.

**New preservation tests** (task 2):
- `backend/tests/property/test_sjr_preservation_properties.py` (hypothesis):
  - (a) for every declared type that is not generic or aliased, crossed with generated byte headers, the acceptance and the rejection code equal the current pipeline's;
  - (b) with a trusted `REMOTE_ADDR` and `NUM_PROXIES=1`, `get_client_ip` equals the old `ips[-1]` rule for any well-formed forwarded list;
  - (c) out-of-scope document ids give a byte-identical 404 on every document surface, and an assignment-scoped reviewer in scope, assigned or not, gets that 404 from `extract/` and `delete/`;
  - (d) `approved` and `rejected` review transitions behave as before for every resolved payment status;
  - (e) `+260XXXXXXXXX` inputs normalise to themselves;
  - (f) with a tenant contract whose identity row is `document_type="nrc"`, an upload followed by `GET /applications/{id}/documents/` lists exactly one identity row and no synthetic row, and a legacy application with a snapshot and no document row keeps its one synthetic row;
  - (g) 3.24, in `backend/tests/property/test_seed_admins_preservation_sjr.py`. The test runs the documented production command shape once, `call_command("seed_school_admins", "--admin", "<CODE>=<email>", "--password", <test value>)` with a fictional institution code and email, to create the membership. A super-admin client then sets its permissions to a set G drawn from `GRANT_PERMISSION_ALLOWLIST` through `PATCH /api/v1/admin/memberships/{id}/`, the endpoint the admin UI calls, and creates one access grant for the same user. Two further runs of the same command must each leave the membership's permissions a superset of G and the access grant unchanged, and the second must write no `tenant.membership.permissions_seeded` row. Hypothesis runs with `max_examples=10` and no deadline, because every run hashes a password with bcrypt. This passes on unfixed code, which never changes an existing membership, and must still pass after task 5.1.
  - (h)–(j) live in `test_sjr_preservation_properties.py` with (a)–(f). They hold at HEAD, so the marker rule moved them out of the exploration tests:
    - (h) a row with only a presigned `file_url` and no `storage_key` opens through `signed-url/` (at HEAD `storage.py:101-118` derives the key and `document_storage_views.py:685-703` re-signs it; R4-c rule 2 keeps it);
    - (i) a reviewer in scope who is not assigned to the application gets the byte-identical masked 404 from `signed-url/`, `download/` and `info/` (at HEAD through the `IsOwnerOrAdmin` fall-through, `document_storage_views.py:114-119`, `backend/apps/accounts/permissions.py:141`; after R5-g through `require_reviewer_assignment`);
    - (j) with a public `REMOTE_ADDR` and any forged `X-Forwarded-For` list, `RateLimitMiddleware` counts the request in `REMOTE_ADDR`'s bucket (at HEAD `key="ip"` reads `REMOTE_ADDR`, `middleware.py:360`; after R3-a `get_client_ip` returns an untrusted peer unchanged).
- `apps/admissions/tests/property/sjrPreservation.property.test.ts` (fast-check):
  - (a) `normalizePaymentStatus` and `isPaymentResolvedForProgress` outputs are unchanged for arbitrary strings;
  - (b) readiness for inputs with any missing item keeps `canSubmit` false;
  - (c) answer-only edit sequences produce the same save count and statuses in the draft machine;
  - (d) an upload that succeeds first time issues one request;
  - (e) the MSISDN normaliser is idempotent;
  - (f) after `signOut`, or a cross-tab logout message, no route guard sends a refresh request (3.19);
  - (g) rendering any public route of `routeRegistry.ts` with an unauthenticated session never calls `refreshAuthSession` (holds at HEAD, where no public-route path refreshes, `authQueries.ts:84-95`; came out of task 1.8 under the marker rule).
- Broad harness matrix baseline: `bash harness/bin/harness smoke`, run once on unfixed code and recorded. It has not run since task 0.4, so any pre-existing failure is recorded as such and is not counted as a regression.

### Unit Tests

Backend:
- `get_client_ip` table cases: no forwarded header; trusted and untrusted peers; malformed hops; `NUM_PROXIES` 0, 1 and 2.
- `content_disposition_for`.
- `_key_from_persisted_value`: key, presigned path-style, presigned virtual-hosted, legacy provider, malformed.
- `mark_stage` key release for each terminal state.
- `detect_file_mime`.
- `validate_required_env_vars(required=...)`.
- The `storage_roundtrip_check` command with a stub storage, covering each failing step.
- The seed command (`backend/tests/unit/test_seed_school_admins_permissions_sjr.py`): each mode; the option conflicts and an empty `--permissions`; an unchanged re-run saves no membership and emits no event, while the existing Profile update (role, active, verified, password) still runs as today; each change emits exactly one event with `permissions_before` and `permissions_after` and no email address; `--replace` and `--read-only` remove permissions and say so in the event; `--dry-run` writes nothing; a stubbed `record_event` that writes no row makes the run fail with nothing committed.
- The review conditions branch.

Frontend:
- `rateLimitMessage`; the Retry-After parser.
- `downscaleImageForUpload` with mocked canvas: shrink, no shrink, decode error, timeout.
- `deriveWizardPageSaveView`.
- The transport's log calls carry no filename, URL or file size.
- The opener query parser.
- `isPaymentResolvedForApproval` parity with `isPaymentResolvedForProgress`.
- `ConditionsDialog` validation.
- `useSessionRestoreOnce`: one attempt per mount, none while suppressed, `allowSessionRestore()` re-enables it, and a thrown refresh counts as a failure.

### Property-Based Tests

- **hypothesis:**
  - `get_client_ip` never returns a forwarded value when the peer is untrusted, and with a trusted peer never walks more than `NUM_PROXIES` hops (`backend/tests/property/test_sjr_client_ip_properties.py`);
  - `content_disposition_for` output never contains CR, LF or an unescaped quote, stays within 400 characters, and its `filename*` decodes to the sanitised name;
  - `normalize_zambian_msisdn` is idempotent, and its error messages never contain the input;
  - key derivation is stable under re-signing (derive, sign, derive gives the same key);
  - `seed_membership_permissions` in mode `add` returns a superset of both `existing` and `requested` and is idempotent, mode `replace` returns exactly `requested`, and mode `read_only` returns `[]`, for any lists of strings, including values outside the allowlist.
- **fast-check:**
  - the button readiness equals the handler readiness for every generated input combination (`apps/admissions/tests/property/sjrSubmitReadiness.property.test.ts`);
  - for any generated sequence of grade edits, after flush the server grade set equals the syncable rows, and "Saved" implies nothing is pending (`sjrGradesAutosave.property.test.ts`);
  - the OCR poll count is at most 10 for any sequence of server states, and 1 when the first state is a missing job;
  - progress values are monotonic and within 0–100.

### Integration Tests

- Backend integration files above run on local Postgres with storage mocked at the boto3 boundary, plus the round-trip command against real MinIO in the gate workflow.
- The harness gate (R9-b) is the browser integration layer: real MinIO with a private bucket, real Caddy, the limiter on, a 20-second URL lifetime, and a 1 Mbit/s uplink.
- The edge two-client check (R9-c) is the B-11 reproduction, automated.

### The R9 Journey Gate

What it proves: a student on a 390×844 viewport can register with a local phone number, keep grades across a reload, upload through the wizard UI on a slow uplink with one POST per file, open each uploaded document after its first URL expired, defer, submit through the UI, survive an expired access token, and open the slip; the documents list and the opener's on-screen states pass axe at 390×844 without horizontal scrolling. After P0b, staff decide through the UI and the student opens the letter. Any 429 or 5xx on any page or popup of either actor fails it, and so does any console error.

What it cannot see:
- production configuration (task 6);
- R2-specific behaviour, such as response-header overrides;
- iOS Safari, which Playwright Chromium does not emulate;
- real OCR timing on the production worker;
- NAT labs. All harness browser contexts share one address, so the gate clears the limiter counters between spec files and before the staff actor and measures one actor's budget at a time; the per-IP budgets for a lab are sized by reasoning (EC-13), and the recorded per-scope counts show the headroom.

### Coverage of the Critique's Cheapest Missing Tests (critique §7.4)

| Failure | Test that now exists | Task |
|---|---|---|
| C-01 submit | `sjrSubmitReadiness.test.ts` and the gate's Submit step at 390×844, plus `submit-desktop.spec.ts` at 1440×900 | 1.6, 4.2 |
| A-01 local storage | `storage_roundtrip_check` on the local-test stack and the harness; `test_storage_settings_contract.py` | 1.1, 4.4 |
| B-01 link expiry | the gate's reopen-after-expiry step with a 20 s lifetime; `test_sjr_document_keys_bug_conditions.py` | 1.4, 4.2 |
| A-02 / B-11 rate limit | `test_sjr_rate_limit_bug_conditions.py`; the edge two-client check; the gate with the limiter on | 1.3, 4.3 |
| A-03 timeouts | `sjrUploadTransport.test.ts`; `upload-near-limit.spec.ts` (9.5 MB at 1 Mbit/s, one POST) | 1.2, 4.2 |
| A-04 long filenames | the 255-character case in `test_sjr_document_keys_bug_conditions.py` (the critique asked for 200) | 1.4 |
| C-05 grades | `sjrGradesAutosave.test.ts`; the gate's reload step | 1.6, 4.2 |
| C-13 sessions | `sjrSessionRestore.test.tsx`; the gate's cookie-deletion step | 1.8, 4.2 |
| C-10 / C-11 decisions | `test_sjr_decision_bug_conditions.py`; `sjrApprovalGate.test.tsx`; the gate's P0b decision step on a deferred payment | 1.7, 5.5 |
| B-08 letters | the profile-less GET case in `test_sjr_decision_bug_conditions.py`; `sjrLetterCopy.test.tsx` | 1.7 |

### Still Unverified After This Spec

- Production state: reachability, `S3_*`, CORS origins, `NUM_PROXIES` and the deployed `VITE_API_BASE_URL`. Task 6 covers them when a host exists.
- Whether production data has rows with a NULL `storage_key` or legacy-provider URLs (P0-ops counts).
- R2 honouring `response-content-disposition`.
- Popup behaviour on iOS Safari (manual check in task 6).
- Whether CDP `Network.emulateNetworkConditions` `uploadThroughput` throttles XHR request bodies in Playwright 1.58's Chromium. It is plausible, and 2.44's self-check fails the gate if it does not; in that case task 4.2 stops and asks the user before adding a throttling relay.
- Whether a `BEFORE UPDATE` trigger on `applications` writes `updated_at` in a live database. Task 3.15 checks the Neon branch; production was restored from Neon (`deploy/RUNBOOK.md` §3), and task 6.1's read-only checks repeat the `pg_trigger` query there.
- Whether a second proxy (for example Cloudflare) will ever sit in front of Caddy (runbook note in R3-a).

## Responses to the Design Reviews (iteration 1 and final)

The review is `.agents/tasks/spec-authoring-2026-10-31/spec-a-review.md` (verdict CHANGES_REQUESTED, F1–F27). Every changed citation was re-read at HEAD `4a6c4ef`. Each finding is addressed below; none is backlogged or ignored. Where the review offered two fixes, the one that keeps today's behaviour on surfaces this spec does not repair was chosen, and the clause says so. F3 and F14 would change how the system behaves, so they waited for the user, who chose option A for both. The user also confirmed the scope choices for F2, F5, F6 and F25.

Rows N1–N7 answer the final review, `.agents/tasks/spec-authoring-2026-10-31/finalize-a-review.md` (verdict CHANGES_REQUESTED: two MEDIUM, five NIT). Their citations were re-read at HEAD `4a6c4ef`; `backend/`, `apps/admissions/` and `.github/` are the same at `23386aefd`. None of N1–N7 changes how the system behaves.

| Finding | Response | Where |
|---|---|---|
| F1 HIGH, phantom identity rows | Addressed. The legacy synthesis compares the snapshot with listed ids and stored `file_url` / `storage_key` values and skips a pair when a covering type is listed; a bare UUID resolves to no key; the reader ships with or before the writer, and a rollback keeps it. The covering rule also removes a phantom that exists at HEAD after a removal, now recorded in 1.20 | D-A3, Glossary, R4-b, R4-c rule 0; bugfix 1.20, 2.22; tasks 1.4, 2.2 (f), 3.13, 3.14 |
| F2 HIGH, restore in an unused guard | Addressed. One hook, `useSessionRestoreOnce`, is called by `StudentRoute`, `AdminRoute` and `ProtectedRoute`. Designing it exposed a sign-out race (the logout POST is not awaited), so sign-out, the cross-tab logout and the auth-failure callback suppress the restore | D-A9, R5-a, R8-a, Invariant Ownership; bugfix 1.38, 2.41; tasks 1.8, 2.3 (f), 3.26 |
| F3 HIGH, auto-deploy on merge | Addressed with the user's option A (DEC-10). Automatic deploys are paused before task 3.2: preferred, a `production` environment with required reviewers on both Deploy jobs, which takes a settings step (2.6) and a separate code change that references the environment (2.7), because `deploy.yml` references none at HEAD; fallback, the workflow disabled in the Actions UI, with no code change. Task 6.2 approves the first deploy after 6.1's checks and backup, and re-enables automatic deploys once it succeeds. The pause covers every app the workflow ships; production is unreachable today, so nobody sees an effect yet. This run did not edit `deploy.yml` | Overview, Glossary, R1-b, R4-d, Schema and Data Changes, Rollout Order, Invariant Ownership; bugfix DEC-10, 3.16, OS-7; tasks intro, 2, 2.6, 2.7, 3.2, 3.15, 6.1, 6.2 |
| F4 MEDIUM, reviewer reach into extract and delete | Addressed. `allow_assigned_reviewer=False` on extract and delete keeps today's masked 404 for reviewers | R5-g, Invariant Ownership; bugfix 2.28; tasks 2.2 (c), 3.19 |
| F5 MEDIUM, admin hook premise | Addressed with the review's first option: 2.25 covers the student UI, `useAdminOfficialDocuments` is unchanged, and an admin opener is OS-15 | Expected Behavior, R5-a; bugfix 2.25, OS-15; task 3.17 |
| F6 MEDIUM, third readiness caller | Addressed without changing what students see: `useOverallProgress` passes today's defaults explicitly and Spec B V3 (task 26.1) owns the percentage; tests use `readinessInput`. The review's direct fix would change the displayed percentage, which Spec B already owns | R6-a; bugfix 2.32; task 3.22 |
| F7 MEDIUM, guard red at HEAD | Addressed: the three dead modules that contain the literal are frozen in rule 1's allowlist | R2-d; task 3.7 |
| F8 MEDIUM, official documents persist URLs | Addressed: official-document generation persists the key, and both tenant-asset sites are listed exceptions; 2.17 covers system-generated documents | Root Cause 4, R4-a, Invariant Ownership; bugfix 2.17; tasks 1.4, 3.13 |
| F9 MEDIUM, red suites by design | Addressed with strict `xfail` / `it.fails` markers that each group's checkpoint removes; task 2.4 excludes the `sjr` files; R7's markers stay until task 5.6 | Testing Strategy "Marker scheme"; tasks 1, 2.4, every checkpoint, 3.30, 5.6 |
| F10 MEDIUM, contrast and mobile layout | Addressed: 3.11 requires WCAG AA and 390×844 without horizontal scrolling on new and changed surfaces, and the gate adds `a11y-surfaces.spec.ts` | Property 13, R9-b; bugfix 3.11; task 4.2 |
| F11 MEDIUM, path filters and required checks | Addressed: no `paths:` filter; a change check gates every later step, so unrelated pull requests report success | R9-e; bugfix R9 derivation; tasks 4.5, 4.6 |
| F12 MEDIUM, 429/5xx hole | Addressed: a context-level strict status guard on every gate context, and opt-in status-aware default allowances | R9-b; task 4.2 |
| F13 MEDIUM, shared client address | Addressed: `resetRateLimitCounters()` before each spec file and before the staff actor, per-scope counts as evidence, EC-13 narrowed | R9-a, R9-b, R9-e, The R9 Journey Gate; bugfix EC-13; tasks 4.1, 4.2, 4.6 |
| F14 MEDIUM, converge strips grants | Addressed with the user's option A (DEC-11). The command is additive and idempotent by default: existing permissions are kept and `review` is added, and permissions are removed only with `--read-only` or `--replace`. Each actual change emits one `TenantAuditService` event with the permissions before and after (ids only), an unchanged re-run emits none, and a run whose audit rows are missing rolls back. New preservation clause 3.24 and its test: re-running the documented production command never removes a grant an operator added in the UI | R7-a, Property 11, Invariant Ownership, Input Validation, Observability, Testing Strategy; bugfix DEC-11, 2.36, 3.24, R7 derivation; tasks 1.7, 2, 2.2, 5.1, 5.6 |
| F15 NIT, OS-7 | Addressed | bugfix OS-7 |
| F16 NIT, EC-3 | Addressed | bugfix EC-3 |
| F17 NIT, R9 derivation | Addressed: the workflow file joins the condition, and a preservation block is added | bugfix R9 derivation |
| F18 NIT, 3.4 and 3.5 | Addressed | bugfix 3.4, 3.5 |
| F19 NIT, Neon workflow | Addressed: `pg_trigger` check, unchanged-`updated_at` comparison, operator-gated default-branch apply, and the same trigger query in task 6.1 | D-A16, R4-d, Schema and Data Changes, Still Unverified; tasks 3.15, 6.1 |
| F20 NIT, 2.29 reference | Addressed: the reference is the same endpoint's answer for an unknown application id | bugfix 2.29; R5-g, Property 5; task 1.5 |
| F21 NIT, `RATELIMIT_ENABLE` | Addressed: `getattr(settings, "RATELIMIT_ENABLE", True)`, the way django-ratelimit 4.1 reads it | R3-b; task 3.9 |
| F22 NIT, missing `PaymentForm` prop | Addressed by dropping the prop: `PaymentStep` clears the entry in its existing server-`deferred` effect, `PaymentForm` is not rendered while deferred, and `syncPendingPayment` handles a `deferred` verify result with a widened callback type | R6-d; task 3.24 |
| F23 NIT, edge check details | Addressed: `urllib.request`, a read-only `/checks` bind mount, `Host: localhost`, and orchestration in `harness/bin/harness` | R9-c; task 4.3 |
| F24 NIT, EC-15 | Addressed | bugfix EC-15 |
| F25 NIT, 2.16 breadth | Addressed by naming the journey surfaces in 2.16, adding the two the review found missing (the intake select and the dashboard lists), and recording every other surface as OS-14 | R3-d; bugfix 2.16, OS-14; tasks 1.3, 3.11 |
| F26 NIT, empty badge wrappers | Addressed: both wrappers render only under `import.meta.env.DEV` | Overview, R10; tasks 1.9, 3.29 |
| F27 NIT, off-by-one citations | Addressed: `tasks.py:287`, `payment_helpers.py:100` | R4-b, R8-b |
| N1 MEDIUM (final review), strict markers on assertions that hold at HEAD or are fixed in another group | Addressed with the review's fix. "New object keys contain no filename" moves from task 1.5 to task 1.4 (marker reason `SJR R4: fixed in task 3.14`), so its marker comes off at checkpoint 3.16. The four assertions that hold at HEAD become preservation tests: the presigned-only row (2.2 (h)), the unassigned reviewer's masked 404 (2.2 (i)), the middleware ignoring a forged forwarded value (2.2 (j)) and no refresh on a public route (2.3 (g)). Task 1.3 keeps the half that fails at HEAD: `get_client_ip` returns a public `REMOTE_ADDR`, not the forwarded value. The marker scheme now says to mark only an assertion that fails at HEAD, and where to put one fixed in another group | Testing Strategy "Marker scheme", exploration lists, "New preservation tests"; tasks 1, 1.3, 1.4, 1.5, 1.8, 2.2, 2.3, 3.16 |
| N2 MEDIUM (final review), pinned tests not named | Addressed with the review's fix, plus tests it did not list that the same changes turn red. Each fix task names its pinned tests, their new assertions and the defect the old ones encoded: 3.6, 3.9, 3.13, 3.14, 3.17, 3.19, 3.20 and 3.27. The additions are `test_document_evidence_compensation_7_3.py:341`, `:431` and `:490` (3.14); the `_Doc` stand-in and signer tests of `test_official_document_signed_download.py` (3.13, 3.19); `test_official_document_durability_10_4.py:632-643` and `:645-658`, another "run unchanged" baseline, which pin the student read precedence R5-e changes (3.19); `documentUiStates.test.tsx` and the `useOfficialDocument` mock in `paymentOwnershipSplit.test.tsx` (3.17); `documentActionDensity.test.tsx:205` and `:364` (3.20); and the profile-less letter steps of two harness specs, which R7-d changes (5.4, re-checked in 5.7). "Preservation Checking" carves the pinned lines of both baseline files out of "run unchanged" and says when a fix may change an existing test; task 2.4 counts an updated test with its new assertion; the scope bullet on the broad matrix and task 4.6 account for the updated harness specs. Found while writing the 3.27 update and not changed: both normalisers read `+260` followed by six digits as a bare nine-digit number (`backend/apps/documents/payment_helpers.py:135-137`, `apps/admissions/src/lib/zambianMsisdn.ts:71-72`), so after R8-b registration would store that typo as `+260260…`, where HEAD refuses it. Whether to refuse it is a behaviour decision for the user | Expected Behavior (scope), Testing Strategy "Preservation Checking"; tasks 2.4, 3.6, 3.9, 3.13, 3.14, 3.17, 3.19, 3.20, 3.27, 4.6, 5.4, 5.7 |
| N3 NIT, `useOverallProgress` optional options | Addressed: it also passes today's defaults for its five optional options, so `tsc` passes under strict mode and the percentage is unchanged until Spec B task 26.1 | R6-a; task 3.22 |
| N4 NIT, "writes nothing" against the Profile update | Addressed: the rule covers memberships, and the Profile update (role, active, verified, password) still runs as today | R7-a (write rule, rollout), Unit Tests; bugfix 2.36; task 5.1 |
| N5 NIT, a jobs-ops scaffold in the document budget | Addressed: "versions" leaves 2.13's read list, and the R3.3 budget drops the two version reads (12 reads). `DocumentVersionListView` stays in the throttled list, labelled as a jobs-ops scaffold throttled only because it shares the prefix | R3-b; bugfix 2.13 |
| N6 NIT, the pause can lapse if visibility changes | Addressed. GitHub's documentation confirms the risk: on the Free, Pro and Team plans, required reviewers apply only to public repositories. Task 2.6 repeats its confirmation if the repository's visibility or plan changes before task 6.2, and switches to the fallback at once if a Deploy run stops waiting; tasks 3.2 and 3.15 repeat the check before they merge | Rollout Order and Rollback; tasks 2.6, 3.2, 3.15 |
| N7 NIT, OS-7 says "staged" | Addressed: the assets are removed by commit `8f01c30cb` on `specs/journey-repair-and-simplification`, which has not reached `main` or been deployed | bugfix OS-7 |

