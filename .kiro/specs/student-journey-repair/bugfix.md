# Bugfix Requirements Document

## Introduction

A student cannot complete the admissions journey on a phone. On the documented local stack every upload fails. With working storage, uploads time out on slow links, a long filename returns a 500 after the file is saved, and uploaded documents stop opening 15 minutes after upload. The wizard's Submit button never sends a request. Grades are lost on reload, and an idle session drops to Sign in although the refresh cookie is valid. Behind the production proxy, the rate limiter probably treats every user as one client. After submission, seeded school admins cannot decide, Approve is disabled for deferred payments, Conditional records no conditions, and the decision-letter copy claims documents are ready when they are not. About 10,000 routine tests pass anyway, because none of them runs the journey against real storage.

This spec repairs those defects. It covers critique §8.2 R1–R9, plus one defect the research dossier moved into this spec (R10, the diagnostics badge).

- **P0a** is R1–R6, R8, R9 and R10: a student can register, upload, view, submit and download the slip, end to end, at 390×844.
- **P0b** is R7: staff decisions and decision documents. P0b starts only after the P0a journey gate (R9) is green.
- **Main gate.** The exit gate is a blocking CI browser journey on the harness stack. It does not depend on production. Production has been unreachable whenever probed since 2026-10-16. A separate task verifies the journey once against production, and it stays blocked until a live production host exists (D14).

Sources: the research dossier `.agents/tasks/spec-authoring-2026-10-31/research.md` (HEAD `4a6c4ef`; 86 citations re-verified, 0 refuted) and the critique `.agents/tasks/mihasv3-stack-critique-2026-10-16/critique-report.md` revision 3. Citations below are repo-relative `file:line` at HEAD `4a6c4ef`. Status labels follow the critique: **Confirmed** (read in code or reproduced), **Likely** (strong evidence, not observed where the claim applies), **Unverified**. A clause without a label is Confirmed. No claim refuted by `review.json` or dossier §3 is used.

### Decisions already made (fixed for this spec)

| Id | Decision |
|---|---|
| DEC-1 | Nothing is removed or frozen by this spec. The §9 decision items (jobs-ops, change requests, caches, skills, harness evidence) stay as they are. R2.6 is met by a reachability guard over the upload path. Deleting the three unused upload stacks is left to Spec B S2 (A-11 is also in S2). |
| DEC-2 | OCR stays on. Its polling is fixed: bounded, backing off, stopping at a terminal state or a missing job, and never spending the upload or write rate budget. PDF OCR (D4, missing `pdf2image` and poppler) is not in this spec. |
| DEC-3 | Email verification is out of scope (D8). |
| DEC-4 | Uploads stay server-proxied (D13 option A). The fixes are inactivity timeout, determinate progress, one keyed retry and photo downscaling. No direct-to-R2 or resumable protocol. |
| DEC-5 | When a tenant has no document profile, the acceptance letter and conditional offer show a truthful "not available yet" state, with no neutral-fallback branding. The slip and receipt keep their current behaviour, which the dossier §6 confirms: they render from the institution row's name, colour and contact details, with neutral Beanola fallbacks, and draw a logo or signature only when the tenant uploaded one. **All letter behaviour is pending user sign-off (D9).** |
| DEC-6 | A rejection letter is out of scope. Rejections stay email-only, pending user sign-off (D9). |
| DEC-7 | "The journey passes once against production after deploy" is a separate deferred task, blocked until a live production host exists (D14). |
| DEC-8 | The Runtime badge is fixed here (R10). Dossier §5: it renders in production builds (Confirmed for a production build of HEAD by C-18; Likely for the deployed site). |
| DEC-9 | This spec adds no feature flags. New settings are environment configuration only. |
| DEC-10 | Automatic production deploys are paused from before task 3.2 until task 6.2 (review F3, user decision). Today `.github/workflows/deploy.yml` rolls production after every green CI run on `main` (`:6-11`, `:24`), with no backup step and no approval, so without the pause a merge would be a deploy. Preferred: a GitHub `production` environment with required reviewers on both Deploy jobs, which keeps the workflow and its rollback trap and leaves an approval trail; `deploy.yml` references no environment at HEAD, so referencing it is a separate code task. Fallback: the Deploy workflow disabled in the Actions UI, with no code change. The pause covers everything that workflow ships: the backend, which serves admissions and jobs-ops, the frontend image, which carries both the admissions and the jobs-ops builds (`apps/admissions/Dockerfile:53-61`), and all Spec B work. Production is unreachable today (D14), so nobody sees an effect yet. Task 6.2 approves the first deploy after task 6.1's name checks and backup, and re-enables automatic deploys once it succeeds. |
| DEC-11 | `seed_school_admins` is additive by default (review F14, user decision). It adds the requested permissions (default `review`) to those an existing membership holds, and removes a permission only when `--read-only` or `--replace` is passed. Only a membership it actually changes is written, and each such change emits one `TenantAuditService` event with the permissions before and after; a run that changes nothing emits no event. |

---

## Bug Analysis

### Current Behavior (Defect)

**R1 — Storage and environment truth** (A-01, A-13; dossier R-1)

1.1 WHEN the documented local-test stack (`backend/docker-compose.local-test.yml` with `backend/.env.local.test`) handles an upload or a signing request THEN `STORAGES['default']` is `S3Boto3Storage` with an empty endpoint, bucket and keys (`backend/config/settings/base.py:361-367`, `:379-391`), every upload returns `500 STORAGE_ERROR`, and signing fails with "Invalid endpoint"

1.2 WHEN production or staging settings start with any `S3_*` variable empty THEN the process starts anyway, because `validate_required_env_vars()` runs during base.py's own import (`base.py:832-835`) and reads the lazy `django.conf.settings` (`backend/apps/common/env_validator.py:22`), which cannot yet see `REQUIRED_ENV_VARS` (`base.py:798-810`); `dev.py:53` also empties the list (R-1: Likely, from code reasoning and the local-test stack starting without `S3_*`; Unverified at runtime)

1.3 WHEN an operator configures the documented local stack THEN `USE_LOCAL_FILE_STORAGE` and `CELERY_TASK_ALWAYS_EAGER` are read by no module (`git grep` over `backend/config` and `backend/apps`: 0 hits), `EMAIL_BACKEND` is set only by `backend/config/settings/harness.py:96`, and the stack's env file is untracked (`backend/.gitignore:10`), so no tracked template documents what the stack reads

1.4 WHEN a database is created by the documented local path THEN it has no institution, offering, open intake or fee, because `LOCAL-TESTING.md` Part 2 seeds only subjects; the harness seed sets only `programs.application_fee` (`backend/apps/catalog/management/commands/harness_seed_tenants.py:162`), which `FeeResolver` never reads (`backend/apps/documents/fee_resolver.py:14-20`), and `LOCAL-TESTING.md` Part R3 still says the resolver falls back to that column (R-5)

**R2 — Uploads that survive phone networks** (A-03, A-06, A-07, A-10, A-11)

1.5 WHEN a student uploads a file over a slow uplink THEN the client aborts at the 30-second total timeout (`apps/admissions/src/services/retry.ts:10`, applied at `apps/admissions/src/services/client.ts:195`) and resends the whole file up to 8 times (3 client retries at `retry.ts:14,16,45` and `client.ts:196-237`, doubled by the hook's silent retry at `apps/admissions/src/hooks/useRequiredDocuments.ts:265-270`); A-03 measured a 4.72 MB file at 1 Mbit/s ending in "Request timed out" after 4 min 35 s and about 37 MB sent

1.6 WHILE an upload is in flight THEN the control shows only an indeterminate indicator, because the fetch transport cannot observe request-body progress (`useRequiredDocuments.ts:225-228`; `docs/canonical-truth-map.md:1140-1143`, "Progress is honest")

1.7 WHEN the layered retries fire after a failure THEN the message shown is the last failure, not the first one; A-07 saw "Rate limit exceeded · Needs retry" after the retries spent the budget, and C-02 saw the autosave badge read "Saved" beside a failed upload row

1.8 WHEN the wizard uploads THEN the request carries no `Idempotency-Key` (`apps/admissions/src/services/requiredDocuments.ts:90-118`), so a 401 followed by a refresh cannot replay it (`client.ts:342-365`); AND WHEN any client retries with a key whose earlier attempt did not commit THEN the server returns `409 DOCUMENT_UPLOAD_IN_PROGRESS` for that key forever, because only `committed` stages replay, the key is never released, and the unique index has no state predicate (`backend/apps/documents/document_evidence.py:475-512`, `:515-563`, `:566-580`; `backend/scripts/2026_07_26_01_document_evidence_lifecycle.sql:245-247`)

1.9 WHEN a valid PDF or JPEG is declared as `application/octet-stream`, as an empty type, or as `image/jpg` THEN the server rejects it with 400 "Unsupported file type", because the declared type is checked (`backend/apps/documents/document_storage_views.py:345-364`) before the magic bytes (`:376-384`) (A-10; how often phones send these types is Unverified)

1.10 WHEN the frontend is inspected THEN four upload stacks exist and one is used (dossier S4): the live path is `useRequiredDocuments.ts:232` → `requiredDocuments.ts:90-118`, while `services/documents.ts:6`, `useWizardFileUploads` and `lib/storage.ts:121` stay in the tree with their own timeout, retry and validation code, and nothing prevents a caller from returning to them

1.11 WHEN a student selects a large phone photo THEN the full-resolution file is sent unchanged (A-03 fix direction)

**R3 — Rate limits that identify the real client** (A-02, B-11, C-04)

1.12 WHEN two clients reach the backend through the production edge proxy THEN `RateLimitMiddleware` counts both in one bucket for every scope, including login (10/5m) and registration (5/5m), because it keys on `key="ip"` (`backend/apps/common/middleware.py:355-363`, key at `:360`), which reads `REMOTE_ADDR`, the Caddy container; uvicorn trusts forwarded headers only from 127.0.0.1, the Dockerfile CMD passes no proxy flag (`backend/Dockerfile:65`), and no repo file sets `FORWARDED_ALLOW_IPS` (B-11, Confirmed in a Caddy reproduction; Likely in production)

1.13 WHEN an authenticated student calls document endpoints THEN one per-IP budget of 20 per 10 minutes (`middleware.py:280`) covers uploads, `/extract/`, every OCR `/info/` poll, `/signed-url/` and `/download/`, with no per-user keying

1.14 WHEN OCR is slow, its worker is down, or no OCR job exists THEN the wizard polls `/documents/{id}/info/` every 3 s up to 30 times (`apps/admissions/src/pages/student/applicationWizard/hooks/useOcrGradeExtraction.ts:87-88`, `:234-242`, `:252-298`), starts polling even when the extract request failed (`…/applicationWizard/hooks/useWizardController.ts:600-614`), restarts on resume (`:885-901`), and sends each poll through the client's 3-retry loop (`apps/admissions/src/services/documents.ts:62-71`), so one student spends the document budget and the next upload gets 429 (A-02, reproduced with no worker; C-04 with seeded documents that had no OCR job)

1.15 WHEN a request is rate-limited THEN the response carries `Retry-After` (`middleware.py:373-385`), but the header is not exposed cross-origin (`base.py:326`), the client ignores it, the programme step renders "No programmes available for the current intake" (`…/applicationWizard/steps/ProgramStep.tsx:86-87`), and upload rows say "Rate limit exceeded" with no time to retry (C-04, S06)

**R4 — Store keys, not expiring links** (A-04, A-05, B-01, B-02)

1.16 WHEN a document is uploaded THEN the backend persists `storage.url()`, a presigned URL that expires after 900 s (`base.py:365`), into `application_documents.file_url` and into the application snapshot column (`document_storage_views.py:498`, `:552`, `:592-601`), and the serializers publish those values raw (`backend/apps/documents/serializers.py:57-62`; `backend/apps/applications/serializers.py:531`)

1.17 WHEN a student uploads a file whose encoded name is longer than about 45 characters THEN the snapshot write into `varchar(500)` (`backend/apps/applications/models.py:92-93`) fails after `commit_version` has committed in its own transaction (`document_evidence.py:701`, `:754`; `document_storage_views.py:592-601`), the server returns 500 for a stored document, the automatic retry replays a 201 before the snapshot write (`:452-461`, R-17), and the snapshot stays NULL, so the workspace never shows the document while the wizard says "Saved" (A-04, B-02; Likely in production for R2 filenames)

1.18 WHEN a signing or reading path resolves a document's object THEN it derives the key from `file_url` and ignores the `storage_key` column (`document_storage_views.py:685`, `backend/apps/applications/official_document_views.py:335`, `backend/apps/documents/tasks.py:238`), and an absolute URL from a legacy provider is re-signed against the current bucket as if its path were a key (`backend/apps/common/storage.py:89-118`), so such a row cannot open

**R5 — Students open their own documents** (B-01, B-03 to B-07, B-09, B-12 to B-14)

1.19 WHEN a student activates View on an uploaded document more than 15 minutes after upload THEN the browser opens an S3 XML page reading "AccessDenied / Request has expired", which shows the bucket name and an object key containing the original filename, because the workspace renders the stored URL as a plain `<a href target="_blank">` (`apps/admissions/src/components/student/applicationStatus/DocumentChecklist.tsx:31-36`, `:63-68`; caller `apps/admissions/src/pages/student/ApplicationStatus.tsx:327-329`) (B-01, Confirmed on MinIO; Likely in production)

1.20 WHEN a student looks for their documents THEN the workspace card shows only the result slip and the identity document from the two snapshot columns (`DocumentChecklist.tsx:6-9`), never tenant-custom types or condition evidence (B-03), and the wizard documents step offers only Replace and Remove (`apps/admissions/src/components/student/RequiredDocumentsPanel.tsx:220-249`) (B-05); AND WHEN the newest of two current identity documents of different types is removed THEN the documents list endpoint shows the removed file again as "Identity Support Document", because the delete path keeps the snapshot while another current identity document remains (`backend/apps/documents/document_storage_views.py:907-920`) and the legacy synthesis compares the snapshot only with the listed URLs and the pair's own type (`backend/apps/applications/student_document_views.py:135-166`) (read in code; not reproduced)

1.21 WHEN a student uses a desktop viewport THEN the sidebar has no link to the application workspace, because the `studentStatus` entry sets `mobile: true` and no `desktop` (`apps/admissions/src/routes/routeRegistry.ts:221-236`) and the sidebar filters on `desktop` (`apps/admissions/src/components/navigation/DesktopSidebar.tsx:46-47`) (B-04)

1.22 WHEN signing an official document's URL throws THEN the backend logs at WARNING and omits `download_url` while `status` stays `ready` (`official_document_views.py:317-346`, WARNING at `:340-345`; `:386-394`), and the client throws "not ready" (`apps/admissions/src/services/officialDocuments.ts:206-211`) (B-06)

1.23 WHEN an official document becomes ready after the POST, any 3-second polls and a GET THEN the client opens the new tab in code only after those awaits (`apps/admissions/src/hooks/useOfficialDocument.ts:43`, `:254-272`, `:274-298`; `officialDocuments.ts:132-141`, `:200-211`), and the popup blocker can swallow it while the UI says ready (B-07: blocked with about 6 s added, opened with none; the threshold is Unverified)

1.24 WHEN an application's status, or any field that moves `updated_at`, changes after a slip was issued, while issuance is still open THEN the slip reads `not_requested` and needs a regeneration that requires the worker and storage at click time, because the fingerprint includes status and `updated_at` (`backend/apps/applications/tasks/pdf_generation.py:896-901`) and the read-existing path applies only when issuance is refused (`official_document_views.py:132-138`, `:443-454`, `:490-508`) (B-09, R-11)

1.25 WHEN the official-documents summary renders THEN it says "Your <document> is ready to download" for a document that is only issuable, not issued (`apps/admissions/src/components/student/DocumentButtons.tsx:306-311`, `:330` → `apps/admissions/src/lib/officialDocumentPresentation.ts:174-187`) (R-10; the slip half of C-09)

1.26 WHEN a reviewer with an active institution membership opens an in-scope applicant document THEN `_get_authorized_document` scopes only `role == "admin"` and the reviewer falls through to `IsOwnerOrAdmin` (`document_storage_views.py:104-119`; `backend/apps/applications/student_document_views.py:120-124`), a raw role-string comparison in endpoint code (B-13, Likely: no reviewer accounts existed locally; R-18)

1.27 WHEN a student requests the document list or the required-documents contract of an application they do not own THEN they get `403 INSUFFICIENT_PERMISSIONS` (`student_document_views.py:109-114`, `:236`), while every other document surface returns the masked 404 (B-12)

1.28 WHEN a stored document is opened THEN no Content-Disposition is set (`storage.py:131-151` sets no response parameters), and every object key embeds the sanitised original filename (`document_evidence.py:310-322`) (B-14)

**R6 — Submit, grades and deferral** (C-01, C-05, C-06, C-07)

1.29 WHEN every requirement is met and the student clicks Submit THEN the handler rebuilds readiness without `assignmentResolved`, which defaults to `false`, and without `requiredDocumentItems` (`apps/admissions/src/pages/student/applicationWizard/hooks/wizard/useWizardSubmission.ts:116-124`; `…/applicationWizard/lib/wizardReadiness.ts:107-117`, `:133-141`, `:229`), reports "Assigned school" missing, and returns (`useWizardSubmission.ts:126-133`) before `submitApplicationMutation.mutateAsync` (`:156-161`), while the button's readiness passes both inputs (`useWizardController.ts:760-778`; `…/applicationWizard/index.tsx:1124-1127`) (C-01, Confirmed on the production build at both viewports; R-7)

1.30 WHEN a student adds, edits or removes a grade and then reloads, or opens the draft on another device, before pressing Next THEN the grades are gone (5/5 becomes 0/5), because grades reach the server only on Next or on OCR confirm (`…/hooks/wizard/useWizardStepAdvance.ts:404`; `…/hooks/wizard/useWizardGrades.ts:123`), the batch endpoint refuses a set below the minimum (`backend/apps/applications/student_submission_views.py:403-420`) and replaces rows outside a transaction (`:422-432`), and the local outbox carries no grades (`…/applicationWizard/lib/draftOutbox.ts:7-14`) (C-05)

1.31 WHEN grades or a document command are pending or failed THEN the autosave status can still read "Saved", because the draft machine fingerprints only the answer projection (`apps/admissions/src/lib/wizardDraftController.ts:237-256`, `:590`) (C-05, C-02)

1.32 WHEN the wizard runs under development StrictMode and the student defers payment THEN Next stays disabled, because the effect cleanup sets `mountedRef.current = false` and nothing sets it back (`apps/admissions/src/hooks/usePaymentStatus.ts:86`, `:95`, `:98`; `apps/admissions/src/main.tsx:236-240`) (C-06; mechanism Confirmed in code, linked to the observation by matching behaviour; the production build passes)

1.33 WHEN a student defers while a payment-recovery entry exists THEN "Payment in progress" stays pinned, because `syncPendingPayment` handles `successful`, `failed` and `pending` but not `deferred` (`apps/admissions/src/components/student/PaymentForm.tsx:190-243`) and the defer handler does not clear the entry (`…/applicationWizard/steps/PaymentStep.tsx:83-100`) (C-07; Confirmed in dev, Likely in all builds)

**R7 — Decisions and decision documents, P0b** (C-09 to C-12, B-08)

1.34 WHEN an operator creates school admins with `seed_school_admins`, or the harness seeds its tenant admins, THEN the memberships carry no `permissions`, so the admins hold only the read bundle and `POST …/review/` returns 403 (`backend/apps/catalog/management/commands/seed_school_admins.py:117-134`; `harness_seed_tenants.py:211-216`; bundle and mutation map at `backend/apps/catalog/services.py:996-1030`, derivation `:1282-1298`) (C-10, R-5)

1.35 WHEN an application's payment status is `deferred` THEN Approve is disabled with "Payment must be verified first", because the control requires a normalised `verified` (`apps/admissions/src/components/admin/applications/ApplicationApprovalActions.tsx:76-77`, `:165-170`), although the backend gate accepts every value in `RESOLVED_PAYMENT_STATUSES`, including `deferred` (`backend/apps/applications/admin_review_views.py:731-741`; `backend/apps/documents/payment_constants.py:212-214`) (C-11)

1.36 WHEN an admin chooses Conditional THEN the UI sends `conditionally_approved` with no conditions (`ApplicationApprovalActions.tsx:192-194`), and the review view skips `ConditionManager.assign_conditions` when the payload is empty (`admin_review_views.py:803-815`), so the application becomes conditionally approved with zero conditions (C-12, R-8)

1.37 WHEN a tenant has no active document profile for a letter THEN generation settles as `setup_required` (`backend/apps/applications/tasks/pdf/render_context.py:26-38`; `…/tasks/pdf/renderers/__init__.py:37-41`; `official_document_views.py:147-152`) while the student page says the letter is ready (1.25); the documented local setup never seeds profiles, and nothing seeds conditional-offer profiles (`backend/apps/catalog/management/commands/seed_tenant_document_profiles.py:1`, `:33`; `docs/audits/document-type-audit.md:314-317`) (B-08, C-09; production tenant configuration Unverified)

**R8 — Session continuity and first-step friction** (C-13, C-14)

1.38 WHEN a student's access token has expired but the refresh token is valid, and they load or navigate an authenticated page, THEN the app shows Sign in, because `SessionView` answers 200 with `authenticated:false` (`backend/apps/accounts/auth_views.py:617-637`), `fetchSessionData` returns `null` without refreshing (`apps/admissions/src/hooks/auth/authQueries.ts:84-95`, deliberately, R-16), the client refreshes only on a 401 (`client.ts:344`), and the route guards redirect as soon as `useAuth().user` is null (`apps/admissions/src/components/StudentRoute.tsx:39-41`; `apps/admissions/src/components/AdminRoute.tsx:92-94`); no route uses the `auth` guard that renders `ProtectedRoute` (`apps/admissions/src/components/AuthenticatedRouteShell.tsx:132-144`; `routeRegistry.ts` has 12 `admin`, 14 `public` and 9 `student` routes) (C-13, Confirmed in 3 sessions: a student on desktop, a tenant admin on desktop, and mobile)

1.39 WHEN a student registers with a Zambian mobile number in local format (`09…` or `07…`) THEN the backend returns 400, because only `+260` followed by 9 digits is accepted, and the message echoes the raw number (`backend/apps/common/validators.py:12-19`; `backend/apps/accounts/serializers.py:41-44`), as the NRC validator does (`validators.py:26-28`); the sign-up page then shows the raw field key and value in the banner and leaves the field without `aria-invalid`, because `signUp` flattens the API error to a string and drops `fieldErrors` (`apps/admissions/src/hooks/auth/useSessionListener.ts:196`; `apps/admissions/src/pages/auth/SignUpPage.tsx:81-83`) (C-14, R-14)

**R9 — A journey gate that can see these failures** (critique §7.3, D §3, C-01, A-13)

1.40 WHEN a pull request changes `apps/admissions/**` or `backend/**` THEN no browser journey runs: the harness smoke runs only on dispatch or on harness-path changes (`.github/workflows/v2-harness-smoke.yml:22-37`), nobody has run it since task 0.4 (`harness/bin/harness:29-31`), and CI runs a narrow backend slice (`.github/workflows/ci.yml:123-138`, `:275-281`)

1.41 WHEN the harness journeys run THEN none uploads an identity document through the wizard UI or clicks a ready Submit (`apps/admissions/tests/harness-e2e/required/student-wizard-characterisation.spec.ts:432-435`; the only wizard file input is `ocr-manual-fallback.spec.ts:225`), stored objects are stubbed at the browser layer (`official-document-durability.spec.ts:418-432`), the bucket allows anonymous download (`harness/docker-compose.harness.yml:75`), and the coarse limiter is off (`backend/config/settings/harness.py:68-90`), so an expired link, a raw unsigned URL or a 429 cannot be seen (R-4)

1.42 WHEN CI runs THEN no configuration test asserts a working `default_storage` under the settings modules used locally, or that documented environment variables are read by anything (critique §7.3 items 1–2)

**R10 — Diagnostics badge in production builds** (C-18, critique top-10 #10; moved from Spec B V2 by dossier §5)

1.43 WHEN a production build renders any authenticated page or the public footer THEN a "Runtime · Frontend <sha> · Backend <version>" pill, or the compact "FE/BE" pair, renders, because `BuildVersionBadge` has no environment gate (`apps/admissions/src/components/ui/BuildVersionBadge.tsx:16-82`) and both render sites are unconditional (`apps/admissions/src/components/navigation/AppLayout.tsx:294-296`; `apps/admissions/src/components/layout/SharedFooter.tsx:187-189`); each mount also sends `GET /health/live/` for the backend label (`apps/admissions/src/lib/appVersion.ts:13-37`), and the badge uses an ad-hoc 11 px size and `backdrop-blur` (`BuildVersionBadge.tsx:45`, `:68`)

### Expected Behavior (Correct)

The tag in brackets names the critique §8.2 criterion each clause implements. Thresholds the critique marked "proposal" are fixed here and justified in design.md.

**R1 — Storage and environment truth**

2.1 [R1.1] WHEN the documented local-test stack starts THEN the system SHALL complete a write → read → sign → fetch → delete round-trip through `default_storage` against the stack's own MinIO service with a private bucket, and an automated configuration check SHALL fail if any step fails

2.2 [R1.2] IF the production or staging settings start with any of `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY` or `S3_SECRET_KEY` empty THEN the system SHALL refuse to start, naming each missing variable and never printing a value; the check SHALL run after the environment module's overrides and SHALL be proven by a test that starts the settings in a subprocess

2.3 [R1.3] THE configuration test suite SHALL fail when a variable named in a tracked env template (`backend/.env.local.test.example`, new; `backend/.env.example`; `deploy/.env.prod.example`; `harness/harness.env`) or in an env block of `LOCAL-TESTING.md` is read by no backend module, compose file or deploy script, unless the test's allowlist names it with a reason; `USE_LOCAL_FILE_STORAGE` and `CELERY_TASK_ALWAYS_EAGER` SHALL be removed from the documented env, and `EMAIL_BACKEND` SHALL be read by the dev settings

2.4 [R1.4] WHEN a database is created by the documented local path THEN the documented seed step SHALL create at least one active institution with an open programme offering, an intake whose deadline is in the future, and an active canonical `program_fees` row (application fee, local residency) for each offering, and SHALL refuse to run against a non-local database

**R2 — Uploads that survive phone networks**

2.5 [R2.1] WHILE an upload is still sending bytes THEN the client SHALL NOT abort it; the client SHALL abort only after 30 s without upload progress, or 60 s without a response once the body is sent; a 9.5 MB PDF over a 1 Mbit/s uplink SHALL succeed with exactly one POST

2.6 [R2.2] WHILE an upload is in progress THEN the upload control SHALL show determinate progress (`aria-valuenow` equal to the percentage of bytes sent) and SHALL announce completion or failure in an `aria-live` region

2.7 [R2.3] IF an upload attempt fails THEN the client SHALL send at most one automatic retry, only for a retryable failure that is not a 429, reusing the same `Idempotency-Key`, and the message shown SHALL describe the stable error code of the first failure

2.8 [R2.4] WHEN the client sends an upload THEN the request SHALL carry an `Idempotency-Key`, reused by its automatic retry and by a replay after a 401 refresh; IF an earlier attempt with that key ended without committing (compensated, compensation pending, write failed or orphaned) THEN the server SHALL accept the retry instead of returning `409 DOCUMENT_UPLOAD_IN_PROGRESS`

2.9 [R2.5] WHEN the declared Content-Type is empty, `application/octet-stream` or `image/jpg` THEN the server SHALL decide acceptance from the magic bytes and SHALL record the detected type as the version's MIME type

2.10 [R2.6, as limited by DEC-1] THE admissions frontend SHALL send every document upload through one upload service function and one upload hook, and a source-scan test SHALL fail if any product module references another upload path

2.11 [R2.7, SHOULD] WHERE the selected file is a JPEG or PNG larger than 2 MB whose long edge exceeds 2400 px THEN the client SHOULD downscale it to a 2400 px long edge before upload, keeping its type and name, and SHALL send the original if downscaling fails or does not make the file smaller

**R3 — Rate limits that identify the real client and fit a real journey**

2.12 [R3.1] WHEN two clients send requests through the production edge-proxy configuration THEN the system SHALL count them in separate buckets for every middleware scope, including login and registration; the client address SHALL come from `X-Forwarded-For` only when `REMOTE_ADDR` is a trusted proxy, and only `NUM_PROXIES` hops deep, and SHALL otherwise be `REMOTE_ADDR`

2.13 [R3.2] THE system SHALL budget authenticated document requests per user id, with separate budgets for writes (upload, delete, extract) and reads (info, signed URL, download), and the per-IP budget for uploads SHALL be separate from the per-IP budget for document reads

2.14 [R3.3] WHILE one student completes the documents step for one application (two uploads with at most one automatic retry each, one OCR status sequence at the client's maximum poll count, and two views) THEN the system SHALL NOT return 429 to that student

2.15 [DEC-2] WHEN the wizard follows OCR progress THEN it SHALL start polling only after the extract request is accepted, or when the server reports a queued or running job; SHALL poll at most 10 times on a 2, 3, 5, 8, 13, then 15-second schedule, with no client-level retry per poll; SHALL pause while the tab is hidden; and SHALL stop at a terminal state, a missing job, a 404 or a 429, falling back to manual entry; OCR SHALL stay enabled and advisory

2.16 [R3.4] IF a request is rate-limited THEN the response SHALL carry `Retry-After`, exposed to the cross-origin frontend; the journey surfaces (the programme and intake selects, the student dashboard's application, intake and interview lists, the wizard upload rows, the document opener, the workspace documents list, and the sign-in and sign-up banners) SHALL say when to retry and SHALL NOT render an empty catalogue or an empty list for a rate-limited request; other surfaces are OS-14

**R4 — Store keys, not expiring links, and handle long filenames**

2.17 [R4.1] THE system SHALL persist object keys for uploaded and system-generated documents, SHALL NOT persist an expiring URL, and SHALL produce signed URLs at read or click time; document responses SHALL carry a freshly signed URL and SHALL NOT publish the object key

2.18 [R4.2] WHEN a student uploads a file whose original name is up to 255 characters long, including spaces and non-ASCII characters, THEN the upload SHALL return 201 and the application SHALL reference the document

2.19 [R4.3] IF any write fails after the document version commits THEN the system SHALL NOT return a 5xx for that committed document: the application snapshot SHALL commit in the same transaction as the version, and a replay of a committed version SHALL repair a missing snapshot

2.20 [R4.4] WHEN an existing row holds a presigned URL or a URL from a legacy provider THEN the system SHALL still open the document: an S3-style value by deriving and re-signing its key, and any other absolute `https` URL by returning it unchanged

**R5 — Students open their own documents**

2.21 [R5.1] WHEN a signed-in student activates View on one of their documents at any time after upload, including in a new session more than 15 minutes later, THEN the system SHALL open the current version of that file, signed at the moment of the click

2.22 [R5.2] THE wizard documents step SHALL list every requirement's current document with a View action, and the application workspace SHALL list every current document for the application exactly once, including tenant-custom types and condition evidence, each with a View action; a legacy snapshot row SHALL appear only when no listed document covers that snapshot

2.23 [R5.3] THE desktop navigation and the mobile navigation SHALL each reach the student's documents within two activations from the dashboard

2.24 [R5.4] IF a signed URL cannot be produced THEN the UI SHALL say the file cannot be opened right now and offer Retry, SHALL NOT say the document is "not ready", and the system SHALL log the failure at ERROR with the document id only

2.25 [R5.5] WHEN an official document becomes ready after an asynchronous wait THEN the student UI SHALL show an explicit Open control instead of opening a tab programmatically; admin official-document controls are unchanged (OS-15)

2.26 [R5.6] WHEN an application's status changes after a slip was issued THEN the student SHALL still be able to open the issued slip, served as historical, without a regeneration at click time; for a student, an issued copy SHALL take precedence over an open or failed refresh

2.27 [R5.4/R5.5, copy] THE official-documents summary SHALL say a document is ready only when it has been issued, SHALL offer an issuable but unissued slip or receipt as "Prepare", and SHALL NOT say "ready" for a document the server reports as `setup_required`, `failed` or `queued`

2.28 [R5.7] WHEN a reviewer in scope for an institution, and assigned to the application under the reviewer-assignment rule, opens one of its applicant documents THEN the system SHALL serve it; IF the document is out of scope THEN the system SHALL return the masked 404; the reviewer's read access SHALL NOT reach the extract or delete commands, which SHALL keep answering an assignment-scoped reviewer with the masked 404; no endpoint SHALL decide this by comparing raw role strings

2.29 [R5.8] WHEN a student who does not own an application requests its document list or its required-documents contract THEN the system SHALL return the same response body, with the same 404 status, as that endpoint returns for an application id that does not exist

2.30 [R5.9, SHOULD] Signed document URLs SHOULD carry `Content-Disposition: inline` with a sanitised filename, and new object keys SHALL NOT contain the original filename

**R6 — Submit through the wizard**

2.31 [R6.1] WHEN every backend submission gate passes and the student confirms THEN the wizard Submit action SHALL send `POST /api/v1/applications/{id}/submit/` and show the submitted state, on a production build at 1440×900 and at 390×844

2.32 [R6.2] THE readiness that enables Submit and the readiness checked on Submit SHALL be one computation with the same inputs, every input SHALL be required by the type, and a test SHALL fail if an input is omitted or the two results differ; the wizard's progress percentage is not a Submit consumer, keeps its current display here, and moves onto the same readiness in Spec B V3 (`platform-simplification-and-polish` task 26.1)

2.33 [R6.3] WHEN a student adds, edits or removes a grade THEN the wizard SHALL save the grade set to the server within the autosave debounce, without requiring Next, accepting partial sets while the application is a draft; WHEN the page reloads or the draft opens on another device THEN the same grades SHALL appear; until the server acknowledges them, pending grades SHALL be kept in the local outbox

2.34 [R6.4] THE autosave status SHALL read "Saved" only after the server has acknowledged every pending answer and grade on the page and no document command is failed or in flight; grade rows that cannot be saved SHALL be reported as not saved

2.35 [R6.5] WHEN payment is deferred THEN the payment step SHALL show the deferred state, enable Next, and clear any payment-recovery entry once the server confirms the deferral, under development StrictMode and in production builds alike

**R7 — Decisions and decision documents (P0b)**

2.36 [R7.1, DEC-11] WHEN an operator runs `seed_school_admins` THEN the command SHALL grant the `review` permission for each targeted school by default; for an existing membership it SHALL add the requested permissions to those the membership already holds, and SHALL remove a permission only when `--read-only` (no permissions) or `--replace` (exactly the requested permissions) is passed; for each membership it creates, reactivates or whose permissions it changes, it SHALL emit one `TenantAuditService` event that records the permissions before and after, with ids and permission names only; a membership the run does not change SHALL NOT be written and SHALL get no event, while the existing Profile update (role, active, verified, password) SHALL still run as today; the documentation SHALL state this rule; the harness and local seed SHALL create an account per seeded tenant that can decide

2.37 [R7.2] THE admin Approve control SHALL be enabled for exactly the payment statuses that the backend review gate accepts, taken from one shared definition protected by a drift-guard test

2.38 [R7.3] WHEN an admin chooses Conditional approval THEN the UI SHALL require at least one condition with a description and a deadline that is not in the past before sending `conditionally_approved`, and the review endpoint SHALL refuse `conditionally_approved` without conditions with `NO_CONDITIONS_PROVIDED`

2.39 [R7.4, pending user sign-off D9] IF an institution has no document profile for the acceptance letter or the conditional offer THEN the student UI SHALL show that the letter is not available yet, with the tenant support contact, SHALL NOT claim it is ready, and the system SHALL NOT render it with neutral fallback branding; the harness and local seed SHALL create letter profiles for their seeded offerings

2.40 [DEC-5, pending user sign-off D9] WHEN the application slip or a payment receipt is generated for a tenant without a document profile THEN the system SHALL CONTINUE TO render it from the institution row with neutral Beanola fallbacks, drawing a logo or signature only when the tenant uploaded one

**R8 — Session continuity and first-step friction**

2.41 [R8.1] WHEN a student whose access token has expired, but whose refresh token is still valid, loads or navigates an authenticated page THEN the app SHALL restore the session with one refresh attempt made by that page's route guard, without showing the sign-in page; public pages SHALL NOT send refresh requests, and no route guard SHALL send one after the user signs out

2.42 [R8.2] WHEN a student registers with a Zambian mobile number in local format (`09…` or `07…`) THEN the system SHALL accept it and normalise it to `+260…` with the one shared normaliser; IF the number is invalid THEN the field SHALL show an inline error linked by `aria-describedby` and set `aria-invalid`, the banner SHALL NOT show raw field keys, and no validation message SHALL echo the submitted value

**R9 — A journey gate that can see these failures**

2.43 [R9.1] THE CI pipeline SHALL run a blocking browser journey at 390×844 on the harness stack with real MinIO object storage, a private bucket and a short signed-URL lifetime, on every pull request that touches `apps/admissions/**`, `backend/**`, `harness/**` or the gate's own files; the journey SHALL register a student, upload an identity document and a result slip through the wizard UI, submit through the wizard UI, reopen each uploaded document after its first signed URL has expired, and download the application slip; after P0b it SHALL also record a staff decision through the admin UI and have the student download the decision letter

2.44 [R9.2] THE journey's upload step SHALL run behind a 1 Mbit/s uplink throttle, and the gate SHALL fail if the measured upload shows the throttle was not applied

2.45 [R9.3] THE journey SHALL fail on any 429 or 5xx response to the student or the staff member, with the coarse limiter on and proxy trust configured

2.46 [R9.4] THE configuration tests from R1 SHALL run in CI as blocking steps

2.47 [DEC-7] THE gate SHALL NOT depend on production; a separate task SHALL run the same journey once against production after deploy, and that task SHALL stay blocked until a live production host exists (D14)

**R10 — Diagnostics badge**

2.48 [Spec A addition; dossier §5] WHEN a production build renders THEN the build and runtime badge SHALL NOT render on student, admin or public surfaces, and no page load SHALL request `/health/live/` for a version label; the badge SHALL render only on the development server

### Unchanged Behavior (Regression Prevention)

3.1 WHEN any actor requests a tenant-sensitive object outside their scope THEN the system SHALL CONTINUE TO scope through `AccessScopeService` / `visible_institution_queryset` before lookup, return the byte-identical masked 404 (`document_storage_views.py:111-119`) or a non-revealing 403, fail closed on `CapabilityResolutionError`, and pass every existing cross-tenant property and harness isolation test unchanged

3.2 WHEN a payment is initiated, verified, settled by webhook, reconciled or expired THEN the system SHALL CONTINUE TO write payment status only through `PaymentCoreMixin._transition`, apply the `ALLOWED_TRANSITIONS` matrix and `WebhookEventIdentity` deduplication, and keep `PAYMENT_HARDENING_RATE_LIMITS` as the only payment flag, with the retired flags still absent

3.3 WHEN payment status is read for students or wizard progress THEN the system SHALL CONTINUE TO use `normalizePaymentStatus` and `isPaymentResolvedForProgress`, keep the wizard / `/student/payment` ownership split and the `allowsInitiate` double-charge guard, allow a deferred payment at submit, and never block submission on Lenco being unreachable

3.4 WHEN a state-changing request is sent THEN the system SHALL CONTINUE TO require CSRF through `JWTCookieAuthentication._enforce_csrf`, recover a token only through `?refresh_csrf=1`, keep the token in memory only, keep `CORS_ALLOW_HEADERS` unchanged (the `corsheaders` defaults plus `cache-control`, `x-csrf-token`, `x-csrf-recovery` and `idempotency-key`, `backend/config/settings/base.py:325`), keep the 30-minute access and 7-day refresh lifetimes with JTI blacklisting and the distinct `NO_REFRESH_TOKEN` and `TOKEN_EXPIRED` codes, and refuse to replay an unsafe request that carries no `Idempotency-Key`

3.5 WHEN a file is uploaded THEN the system SHALL CONTINUE TO reject a file over 10 MiB with `FILE_TOO_LARGE`, a 0-byte file with `EMPTY_FILE`, an unrequired type with `DOCUMENT_TYPE_NOT_REQUIRED`, a specific declared type the requirement does not accept with `INVALID_FILE_TYPE` (`backend/apps/applications/required_documents.py:126`, `:553`), an unevaluable configuration with a retryable 503 `CONFIGURATION_UNAVAILABLE`, disguised HTML with `INVALID_FILE`, active content with `UNSAFE_FILE_CONTENT`, and a wrong field name with 400, in the staged order open stage → write → verify → commit → compensate

3.6 WHEN a document is uploaded, replaced or removed THEN the system SHALL CONTINUE TO keep one current version per requirement, return the same document id for an identical-bytes replay under the same name, keep versions immutable, supersede on Replace, retain the object on Remove, and never publish `storage_key`

3.7 WHEN a student starts, resumes or edits a draft THEN the system SHALL CONTINUE TO honour `mode=new` and `mode=resume&draftId`, keep the draft machine as the single owner of autosave, keep the encrypted outbox keyed by user, application and assignment, never adopt `existing_id` silently, refuse to delete payment-linked drafts, and autosave and resume every answer field silently

3.8 WHEN the student submits THEN the system SHALL CONTINUE TO send the deterministic key `submit-<applicationId>` through `@idempotent`, answer 409 for the same key with a different body, not cache a refused submit, re-run readiness under row locks in `submit_application`, and keep Submit disabled while any blocker holds

3.9 WHEN any API response is rendered THEN the system SHALL CONTINUE TO use the `{"success": true, "data": …}` envelope, `{page, pageSize, totalCount, results}` for paginated lists and `{success: false, error, code}` for errors, including the 429 envelope with `Retry-After`

3.10 WHEN the system logs, audits or emits metrics THEN it SHALL CONTINUE TO write no PII, document body, signed URL, object key containing a filename, or secret, SHA-256-redact IP and user agent in audit rows, apply the payment metric label guardrail, and store phones as hash plus last four digits

3.11 WHEN any student or admin surface renders THEN it SHALL CONTINUE TO keep touch targets at 44 px or more, honour the global reduced-motion rule, pair every status colour with an icon or word, render nothing from `ErrorDisplay` for an empty message, and keep the full Inter fallback chain; every student surface this spec adds or changes (the document opener, the documents list, the upload progress bar, the rate-limit copy, the "Restoring your session" skeleton) and the admin `ConditionsDialog` SHALL meet WCAG AA contrast (4.5:1 for body text, 3:1 for large text and UI components), and every such student surface SHALL stay usable at 390×844 without horizontal scrolling

3.12 WHEN grades are extracted THEN the system SHALL CONTINUE TO make no generative AI call in admissions, offer OCR candidates only for student confirmation, let a manual entry win, and leave an unrecognised subject label unresolved

3.13 WHEN an official document is generated THEN the system SHALL CONTINUE TO render it only in the backend pipeline, fall back only to neutral Beanola branding and never to MIHAS or KATC assets, and hard-fail the acceptance letter and conditional offer without a profile (`PROFILE_REQUIRED_DOCUMENT_TYPES` unchanged)

3.14 WHEN an admin views an uploaded applicant document THEN the system SHALL CONTINUE TO sign at click time through `GET /documents/{id}/signed-url/`, serve legacy synthetic rows from their inline signed URL, and audit official-document downloads through `GET /documents/{id}/download/`

3.15 WHEN storage and the worker are healthy THEN the system SHALL CONTINUE TO generate the slip and receipt, keep issued documents readable for terminal applications, and show staff the `failed` and `setup_required` states with their existing retry rules

3.16 WHEN the schema or data must change THEN the change SHALL CONTINUE TO ship as an additive SQL script in `backend/scripts/` applied by `apply_sql_migrations`, proven on a Neon branch first, with no production write inside a spec task and a backup before any production apply; while automatic deploys are paused (DEC-10), no merge of this spec's work SHALL reach production before task 6.1's checks and backup

3.17 WHEN payment or extract endpoints are called THEN the system SHALL CONTINUE TO apply the per-user payment throttles, keep the Lenco webhook exempt from the coarse limiter, and keep the `document_extract` budget of 5 per hour

3.18 WHEN a student registers with a number already in `+260XXXXXXXXX` form THEN the system SHALL CONTINUE TO accept and store it unchanged and sign the student in after registration

3.19 WHEN the access token is valid, the refresh token has genuinely expired, the user signs out, or a hidden tab regains focus THEN the system SHALL CONTINUE TO skip the refresh, send the user to sign-in, clear auth state, or revalidate the session, respectively

3.20 WHEN an admin records a review decision THEN the system SHALL CONTINUE TO enforce `ALLOWED_TRANSITIONS`, the optimistic version check, the `force=true` payment override with its audit, and the review-decision audit event, and SHALL CONTINUE TO accept `conditionally_approved` with a valid conditions list through `ConditionManager.assign_conditions`

3.21 WHEN a new concept is shared by frontend and backend THEN it SHALL CONTINUE TO be registered in `docs/canonical-truth-map.md` with a drift-guard test before merge

3.22 WHEN the broad harness matrix runs (`harness smoke`) THEN it SHALL CONTINUE TO run its required projects with its current settings, and the `gatecheck-negative` project SHALL CONTINUE TO fail as designed; only the new gate job overrides the limiter, bucket policy, URL lifetime and storage endpoint

3.23 WHEN a later wizard step has not been earned THEN its progress control SHALL CONTINUE TO be disabled, as the characterisation spec asserts

3.24 WHEN an operator re-runs the documented production command (`.kiro/steering/infrastructure.md:115-120`: `seed_school_admins --admin <CODE>=<email> … --password …`) with neither `--read-only` nor `--replace` THEN the system SHALL CONTINUE TO keep every permission an existing membership holds, including every grant an operator added in the admin UI (`PATCH /api/v1/admin/memberships/{id}/`, `backend/apps/catalog/admin_access_views.py:113`), SHALL CONTINUE TO leave every access-grant row untouched, and SHALL write nothing and emit no audit event for a membership it does not change

---

## Bug Condition Derivations

Each block states the bug condition, the fix-checking property and the preservation-checking property, in the form the archived bugfix specs use. Primed functions (`f'`) are the fixed code.

### R1 — Storage and environment truth

```pascal
FUNCTION isBugCondition_R1(X)
  INPUT: X of type StackStart { settingsModule, s3Vars, documentedEnvNames }
  OUTPUT: boolean
  RETURN (X.settingsModule IN {documented local-test stack} AND storage(X).endpoint = "")
      OR (X.settingsModule IN {prod, staging} AND ANY(v IN S3_VARS: X.s3Vars[v] = "") AND starts(X))
      OR ANY(n IN X.documentedEnvNames: readers(n) = {} AND n NOT IN allowlist)
END FUNCTION

FOR ALL X WHERE isBugCondition_R1(X) DO
  r <- start'(X)
  ASSERT (X is local-test) IMPLIES roundTrip(r.storage) = OK
  ASSERT (X is prod/staging with an empty S3 var) IMPLIES r.refused AND r.message NAMES the var AND NOT contains(r.message, any value)
  ASSERT every documented name has a reader or an allowlist reason
END FOR

FOR ALL X WHERE NOT isBugCondition_R1(X) DO
  ASSERT start(X) = start'(X)        // fully configured prod, dev, test and harness start as before
END FOR
```

### R2 — Uploads over phone networks

```pascal
FUNCTION isBugCondition_R2(X)
  INPUT: X of type UploadAttempt { bytes, uplinkBps, declaredType, priorAttemptState, idempotencyKey }
  OUTPUT: boolean
  RETURN (X.bytes * 8 / X.uplinkBps > 30)                                  // longer than the total timeout
      OR (X.declaredType IN {"", "application/octet-stream", "image/jpg"} AND magic(X) IN accepted)
      OR (X.priorAttemptState IN {compensated, compensation_pending, write_failed, orphaned}
          AND X.idempotencyKey = priorKey)
END FUNCTION

FOR ALL X WHERE isBugCondition_R2(X) DO
  r <- upload'(X)
  ASSERT r.status = 201 AND r.mimeType = magic(X)
  ASSERT postsSent(r) <= 2 AND (r.firstAttemptSucceeded IMPLIES postsSent(r) = 1)
  ASSERT progressEvents(r) are determinate
END FOR

FOR ALL X WHERE NOT isBugCondition_R2(X) DO
  ASSERT validationOutcome(X) = validationOutcome'(X)     // every rejection code in 3.5 is unchanged
END FOR
```

### R3 — Rate limits

```pascal
FUNCTION isBugCondition_R3(X)
  INPUT: X of type RequestSet { clients[], viaProxy, journey, ocrJobState }
  OUTPUT: boolean
  RETURN (X.viaProxy AND |distinct(X.clients.realIp)| > 1 AND sharedBucket(X))
      OR (X.journey = "one student's documents step" AND any429(X))
      OR (X.ocrJobState IN {none, failed_to_enqueue} AND pollCount(X) > 0)
END FUNCTION

FOR ALL X WHERE isBugCondition_R3(X) DO
  r <- serve'(X)
  ASSERT buckets(r) are keyed per real client (IP) or per user (documents)
  ASSERT count429(r, oneStudentDocumentsStep) = 0
  ASSERT pollCount(r) <= 10 AND (X.ocrJobState = none IMPLIES pollCount(r) <= 1)
END FOR

FOR ALL X WHERE NOT isBugCondition_R3(X) DO
  ASSERT limited(X) = limited'(X)   // a single client still hits the same per-scope ceilings; webhook stays exempt
END FOR
```

### R4 — Keys, not links

```pascal
FUNCTION isBugCondition_R4(X)
  INPUT: X of type DocumentWriteOrRead { originalName, persistedFileUrl, storageKey, readAt, uploadedAt }
  OUTPUT: boolean
  RETURN isPresigned(X.persistedFileUrl)
      OR encodedLength(X.originalName) > 45
      OR (X.storageKey = NULL AND isLegacyProviderUrl(X.persistedFileUrl))
END FUNCTION

FOR ALL X WHERE isBugCondition_R4(X) DO
  r <- uploadOrRead'(X)
  ASSERT NOT isExpiringUrl(persisted(r)) AND snapshotSet(r) AND status(r) IN {201, 200}
  ASSERT opens(r, at = X.uploadedAt + 16 min)
END FOR

FOR ALL X WHERE NOT isBugCondition_R4(X) DO
  ASSERT opensSameDocument(X) = opensSameDocument'(X)
END FOR
```

### R5 — Students open their own documents

```pascal
FUNCTION isBugCondition_R5(X)
  INPUT: X of type ViewRequest { actor, documentKind, ageSinceSigning, viewport, signingWorks, appStatusChangedAfterIssue }
  OUTPUT: boolean
  RETURN (X.actor = owner AND X.ageSinceSigning > TTL)
      OR (X.actor = owner AND X.documentKind NOT IN {result_slip, identity})
      OR (X.viewport = desktop AND navReach(X) > 2)
      OR (NOT X.signingWorks)
      OR (X.documentKind = official AND X.appStatusChangedAfterIssue)
      OR (X.actor = reviewer IN scope AND assigned)
      OR (X.actor = non-owner student)
END FUNCTION

FOR ALL X WHERE isBugCondition_R5(X) DO
  r <- view'(X)
  ASSERT (X.actor IN {owner, in-scope assigned reviewer}) IMPLIES r.opens = currentVersion
  ASSERT (NOT X.signingWorks) IMPLIES r.copy = "can't be opened right now" AND r.offersRetry
  ASSERT (X.actor = non-owner student) IMPLIES r = maskedNotFound
  ASSERT r.tabOpenedProgrammaticallyAfterAwait = false
END FOR

FOR ALL X WHERE NOT isBugCondition_R5(X) DO
  ASSERT view(X) = view'(X)          // admin views, out-of-scope masking and terminal-application reads unchanged
END FOR
```

### R6 — Submit, grades and deferral

```pascal
FUNCTION isBugCondition_R6(X)
  INPUT: X of type WizardSession { ready, gradesEditedSinceNext, reloadBeforeNext, strictMode, deferred, recoveryEntry }
  OUTPUT: boolean
  RETURN (X.ready AND submitClicked(X))
      OR (X.gradesEditedSinceNext AND X.reloadBeforeNext)
      OR (X.deferred AND (X.strictMode OR X.recoveryEntry))
END FUNCTION

FOR ALL X WHERE isBugCondition_R6(X) DO
  r <- run'(X)
  ASSERT (X.ready AND submitClicked(X)) IMPLIES submitRequests(r) = 1 AND r.state = submitted
  ASSERT gradesAfterReload(r) = gradesBeforeReload(X)
  ASSERT (X.deferred) IMPLIES nextEnabled(r) AND recoveryEntry(r) = none
  ASSERT saveLabel(r) = "Saved" IMPLIES nothing pending
END FOR

FOR ALL X WHERE NOT isBugCondition_R6(X) DO
  ASSERT run(X) = run'(X)            // not-ready Submit stays disabled; answers autosave as before
END FOR
```

### R7 — Decisions and decision documents (P0b)

```pascal
FUNCTION isBugCondition_R7(X)
  INPUT: X of type Decision { adminSeededBy, seedFlags, permissionsBefore, paymentStatus, choice, conditions[], hasProfile, docType }
  OUTPUT: boolean
  RETURN X.adminSeededBy IN {seed_school_admins, harness_seed_tenants}
      OR (X.paymentStatus = "deferred" AND X.choice = approve)
      OR (X.choice = conditional AND |X.conditions| = 0)
      OR (X.docType IN {acceptance_letter, conditional_offer} AND NOT X.hasProfile)
END FUNCTION

FOR ALL X WHERE isBugCondition_R7(X) DO
  r <- decide'(X)
  ASSERT (NOT "--read-only" IN X.seedFlags) IMPLIES seededAdminCanReview(r)
  ASSERT (NOT "--read-only" IN X.seedFlags AND NOT "--replace" IN X.seedFlags)
         IMPLIES CONTAINS_ALL(permissionsAfter(r), X.permissionsBefore)          // 3.24: no grant is removed
  ASSERT auditEvents(r) = count(memberships the run created, reactivated or changed)   // 0 on an unchanged re-run
  ASSERT approveEnabled(r) = (X.paymentStatus IN RESOLVED_PAYMENT_STATUSES)
  ASSERT (|X.conditions| = 0 AND X.choice = conditional) IMPLIES r.refused = NO_CONDITIONS_PROVIDED
  ASSERT (NOT X.hasProfile) IMPLIES studentCopy(r) = "not available yet" AND NOT rendered(r)
END FOR

FOR ALL X WHERE NOT isBugCondition_R7(X) DO
  ASSERT decide(X) = decide'(X)
END FOR
```

### R8 — Session continuity and registration phone

```pascal
FUNCTION isBugCondition_R8(X)
  INPUT: X of type Visit { accessValid, refreshValid, routeKind, phoneInput }
  OUTPUT: boolean
  RETURN (NOT X.accessValid AND X.refreshValid AND X.routeKind = authenticated)
      OR matchesLocalZambianFormat(X.phoneInput)
      OR (isInvalidPhone(X.phoneInput) AND bannerShowsFieldKeyOrValue(X))
END FUNCTION

FOR ALL X WHERE isBugCondition_R8(X) DO
  r <- visit'(X)
  ASSERT (X.routeKind = authenticated) IMPLIES NOT showsSignIn(r) AND refreshRequests(r) = 1
  ASSERT matchesLocalZambianFormat(X.phoneInput) IMPLIES storedPhone(r) = "+260" ++ last9(X.phoneInput)
  ASSERT NOT contains(anyMessage(r), X.phoneInput) AND fieldHasAriaInvalid(r) WHEN invalid
END FOR

FOR ALL X WHERE NOT isBugCondition_R8(X) DO
  ASSERT visit(X) = visit'(X)        // public pages send no refresh; +260 numbers stored unchanged
END FOR
```

### R9 — Journey gate

```pascal
FUNCTION isBugCondition_R9(X)
  INPUT: X of type ChangeSet { paths[] }
  OUTPUT: boolean
  RETURN ANY(p IN X.paths: p UNDER apps/admissions OR backend OR harness
                           OR p = .github/workflows/student-journey-gate.yml)   // the gate's own files
         AND NOT journeyGateRan(X)
END FUNCTION

FOR ALL X WHERE isBugCondition_R9(X) DO
  g <- ci'(X)
  ASSERT g.journeyGate.ran AND g.journeyGate.blocking
  ASSERT g.journeyGate fails WHEN Submit sends no request, a reopened document is expired or unsigned,
         any 429/5xx occurs, or the throttle is not applied
END FOR

FOR ALL X WHERE NOT isBugCondition_R9(X) DO       // change sets that touch none of those paths
  g <- ci'(X)
  ASSERT g.otherWorkflows = ci(X).otherWorkflows    // the gate changes no other workflow; v2-harness-smoke.yml untouched
  ASSERT g.journeyGate.reportsSuccess AND NOT g.journeyGate.ranJourney   // a required check never stays pending
END FOR
```

### R10 — Diagnostics badge

```pascal
FUNCTION isBugCondition_R10(X)
  INPUT: X of type Render { buildMode, surface }
  OUTPUT: boolean
  RETURN X.buildMode = production
END FUNCTION

FOR ALL X WHERE isBugCondition_R10(X) DO
  ASSERT badgeRendered(render'(X)) = false AND healthLiveRequests(render'(X)) = 0
END FOR

FOR ALL X WHERE NOT isBugCondition_R10(X) DO      // development server
  ASSERT badgeRendered(render'(X)) = true
END FOR
```

---

## Edge Cases

Each external dependency has at least one failure case. Design.md gives the handling for each.

- **EC-1 Storage down or credentials rejected during upload.** The staged write compensates and the client gets a retryable `STORAGE_ERROR`; the automatic retry reuses the key and is accepted once the stage resolves (2.7, 2.8).
- **EC-2 Storage down or signing failing during View.** The opener page shows "This file can't be opened right now" with Retry; the backend logs ERROR with the document id only (2.24).
- **EC-3 Redis down.** The coarse limiter uses its in-memory fallback, now keyed by the real client IP. The new per-user document throttle fails open on a cache error, so document traffic never blocks on a cache outage. The existing payment, extract and tracking throttles are unchanged and have no exception handling, so a Redis outage still fails those requests (Django's `RedisCache` raises on a connection error, `backend/config/settings/base.py:285-290`). The JTI blacklist stays fail-closed (3.4).
- **EC-4 Celery worker down or backlogged.** OCR polling stops after at most 10 polls or at a missing job and falls back to manual entry (2.15); official documents stay `queued` while an issued slip remains openable (2.26); email delivery is unchanged.
- **EC-5 Broker unreachable when extraction is requested.** The extract endpoint answers a retryable 503 and polling never starts (2.15).
- **EC-6 Access token expiring during an upload.** The upload's 401 triggers one refresh and one replay with the same `Idempotency-Key` (2.8, 3.4).
- **EC-7 Popup blockers and iOS Safari.** Every View and Open control is a real anchor to an in-app opener route, so no tab is opened in code after an await (2.21, 2.25). Real-device iOS Safari behaviour stays Unverified and is listed as a manual check.
- **EC-8 Phones sending an empty or `application/octet-stream` type, or `image/jpg`.** Accepted by magic bytes (2.9); an HTML file declared that way still gets `INVALID_FILE` (3.5).
- **EC-9 Skewed client clock.** No expiry is computed on the client; the opener signs on the server at click time; the gate measures expiry against the storage server's clock on the same host.
- **EC-10 A signed URL expiring while a large PDF is open.** Range requests after expiry fail inside the viewer; the opener page offers "Open again", which signs afresh.
- **EC-11 A tenant with no document profile.** Letters show "not available yet" with the tenant support contact (2.39); slip and receipt render as today (2.40).
- **EC-12 Lenco unreachable.** Deferral stays available and submission never waits on Lenco (3.3).
- **EC-13 A school lab behind one NAT.** Authenticated document traffic is budgeted per user; the per-IP document budgets are sized for a lab of about 15 students (2.13). Other per-IP scopes are unchanged. In the harness every browser context and request helper shares one client address, which production does not, so the gate clears the limiter counters before each spec file and before the staff actor starts, and records per-scope request counts as evidence (design R9-b). A 429 inside one spec's own window, for one actor, is a new defect, not a reason to raise a budget silently.
- **EC-14 uvicorn exposed directly with no proxy.** `X-Forwarded-For` is ignored unless `REMOTE_ADDR` is a trusted proxy, so a client cannot choose its own bucket (2.12).
- **EC-15 A filename made only of characters the sanitiser replaces.** `safe_object_name` replaces each disallowed character with `_` and uses `unnamed` only for an empty name (`backend/apps/documents/document_evidence.py:303-307`), so such a name is stored as underscores. New object keys no longer contain the name at all and take the extension of the detected type (R4-b), and the Content-Disposition ASCII fallback becomes `document` when nothing printable remains (2.18, 2.30).
- **EC-16 Duplicate or unresolved grade rows while typing.** Those rows are not sent; the save status says some grade rows cannot be saved yet (2.34).
- **EC-17 Grades edited on two devices.** The grade set has no version; the last acknowledged write wins. Answers keep their existing version-conflict handling (3.7).
- **EC-18 A legacy synthetic document (`legacy:<type>:<application id>`).** The opener re-reads the document list, whose synthetic row carries a freshly signed URL, and opens it (2.20).
- **EC-19 Object storage unreachable from the browser in the harness.** Signed URLs are minted against a browser-reachable public endpoint when one is configured (design D-A11).
- **EC-20 Refresh cookie present but revoked.** The guard's single refresh fails, and the user is sent to sign-in once, with no retry loop (2.41, 3.19).
- **EC-21 The audit write fails during a seed run.** `TenantAuditService.record_event` swallows its own failures, so the command counts the run's audit rows before it commits, and a missing row rolls back every membership change of the run; the operator re-runs (2.36).
- **EC-22 A Deploy run starts during the deploy pause.** On the preferred path it waits for an approval that nobody gives before task 6.2; on the fallback path no run starts. An approved run deploys everything merged on `main`, so an urgent production fix during the pause still waits for task 6.1's checks and backup (DEC-10, 3.16).

---

## Out of Scope

- **OS-1** Email verification (DEC-3, D8).
- **OS-2** A rejection-letter document type (DEC-6, D9). Rejections stay email-only.
- **OS-3** PDF OCR, `pdf2image` and poppler (DEC-2, D4).
- **OS-4** Direct-to-R2, presigned PUT, or resumable uploads (DEC-4, D13).
- **OS-5** Removing or freezing anything (DEC-1): jobs-ops, change requests, v2 demo views, caches, vendored skills, harness evidence, and physical deletion of the unused upload stacks (Spec B S2).
- **OS-6** Visual and copy quality beyond the defects named here (Spec B P2), including the landing page, stepper honesty, typography and admin queue layout.
- **OS-7** Production deploys or production database writes made by an agent, and git history rewrites, inside a spec task (pausing automatic deploys and approving the first deploy are operator steps, tasks 2.6 and 6.2, and task 2.7's workflow edit deploys nothing without an approval, DEC-10), and the operator track of D11 (P0-ops): Resend key rotation, public branches and pull-request refs, repository visibility, infrastructure identifiers, `besa/` and `open-design/`. The signature PNG and the three letter templates are removed from `apps/admissions/public/` by commit `8f01c30cb` on `specs/journey-repair-and-simplification`, which has not reached `main` or been deployed; `current application structure.pdf`, MIHAS's paper application form, is kept.
- **OS-8** Any change to the payment state machine, webhook deduplication, payment providers or payment flags beyond the UI fixes in 2.35 and 2.37.
- **OS-9** C-08 (the card widget loads the live `pay.lenco.co` host on localhost), C-15 (Settings "Sex" field; overlaps the `profile-updates` spec), C-17 (jobs-ops), C-18's duplicate React keys and heading order (Spec B), C-21 (local build API base).
- **OS-10** A beat service for the local-test stack (A-08; Spec B S1), and consolidating local stacks (Spec B S1).
- **OS-11** The bulk status endpoint, which can also set `conditionally_approved` without conditions (`backend/apps/applications/admin_bulk_views.py:119-227`, free `new_status` at `backend/apps/applications/serializers.py:1115`; Likely, from code reading). 2.38 covers the review command and the review UI only; the bulk path is a follow-up.
- **OS-12** Per-IP budgets for scopes other than documents, and a test database built from the SQL scripts (Spec B S7).
- **OS-13** Real-device verification on iOS Safari and Android downloads (Unverified; a manual check is listed in tasks.md).
- **OS-14** Rate-limit copy outside the journey surfaces named in 2.16. The lists on the student History, Communications, Interview and Payment pages and in the workspace's application and amendment history, and the admin lists, keep today's rendering of a failed request; a follow-up can extend `rateLimitMessage` to them.
- **OS-15** An explicit Open control for admin official documents. Admin panels use `useAdminOfficialDocuments`, which opens the document after one GET (`apps/admissions/src/hooks/useAdminOfficialDocuments.ts:203`) and is unchanged by this spec. The student opener is `student`-guarded, so it cannot serve staff; an admin-guarded opener under `/admin/` is a follow-up.
