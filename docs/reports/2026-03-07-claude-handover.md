# Claude Handover

Date: 2026-03-07
Audience: Claude continuation session
Mode requested by user: implementation-first, not test-first

## Mandatory Reference Order

Read these before making more changes:

1. `docs/migration/codex.md`
2. `docs/requirements/2026-03-07-manual-remediation-requirements.md`
3. `docs/design/2026-03-07-manual-remediation-design.md`
4. `docs/reports/2026-03-07-manual-remediation-status.md`
5. `docs/plans/2026-03-07-platform-stabilization.md`

`docs/migration/codex.md` is the baseline schema and platform reference. Use it to keep database, API, and business logic decisions consistent with the MIHAS system shape.

## User Instruction To Preserve

The user explicitly said:

- do not focus on testing right now
- focus on getting all remaining functionality implemented
- leave testing for later/manual verification
- keep enough context in docs so work can continue in a fresh session

That means:

- prioritize implementation over adding new test coverage
- only run the minimum verification needed to avoid breaking the repo completely
- keep the status and handover docs current after each implementation batch

## What Is Already Implemented

These major clusters are already in place:

- profile/date normalization and corrected profile completion mapping
- draft delete semantics and stale-draft suppression after submission
- autosave now creates a real server draft after step 1 instead of staying browser-only
- upload payload contract moved to the JSON/base64 format expected by the documents API
- program/institution linkage fixed in the catalog API
- pay-now vs pay-later flow added, including deferred payment completion from the student dashboard payments page
- wizard progress summary reflects the active draft rather than historic lifetime analytics
- education step subject fallback, inline subject addition, and clearer KYC/identity wording
- signup/settings/wizard now share a real residence `country` + `residence_town` model, defaulting to Zambia
- signup persists the richer student profile fields needed for autopopulation
- student notification preferences payload normalized to include usable contact/channel metadata
- communication history on the admin side is API-backed instead of stubbed
- auth bootstrap no longer blocks guarded routes on profile hydration
- admin dashboard no longer waits on profile hydration before loading
- admin applications totals use API pagination totals rather than page length
- admin users page now supports real edit/create/role assignment/effective-permission inspection/deactivation flows
- service worker cache activation now auto-reloads low-risk shells with a safer fallback on form-heavy routes
- tracked auth sessions now exist end to end:
  - login/register create `device_sessions`
  - access/refresh JWTs carry `sid`
  - refresh preserves or bootstraps a tracked session
  - auth middleware and `/api/auth?action=session` now validate active tracked sessions
  - logout deactivates the current tracked session instead of only clearing cookies
- student active-sessions UI now uses the canonical `/api/sessions` response shape and the correct `keepCurrent` revoke-all contract
- student notification settings now fall back to profile phone data and expose the live portal inbox plus push-notification controls
- continue-application prompt now clears immediately on `applicationSubmitted`
- application-detail slip download/email actions now use the canonical slip service instead of legacy dead endpoints
- wizard autosave/save shortcuts now disable after successful submission so the success screen cannot recreate draft state after cleanup
- student dashboard submit events now optimistically clear draft UI and promote the submitted application row before the background refresh lands
- student dashboard, application detail, and application status now share the same canonical slip-service-backed application-slip actions
- application status now includes direct document actions, payment follow-up, and latest payment-review guidance when available
- admin applications export rows now include the payment and grade fields the frontend export utilities expect, so paid amounts and grade-derived export columns no longer collapse to zeros or empties
- analytics reports now page through the full admin export dataset instead of a single fetch window
- analytics report downloads now support CSV alongside PDF, Excel, and JSON from the same normalized payload
- PWA install metadata now ships generated PNG icons plus wide/mobile screenshots, declares explicit manifest `id`, targets real student shortcut routes, and no longer advertises unsupported protocol/file/share handlers
- `src/hooks/usePWA.ts` and `src/lib/pwaConfig.ts` are now aligned with the current route model, and install assets are reproducible through `scripts/generate-pwa-assets.mjs`
- auth entry screens now clearly distinguish returning-applicant sign-in from first-time account creation, and sign-up explicitly communicates that the application workflow starts after account registration
- student settings now present profile, notification-delivery, and active-session management in one coherent account surface
- student account navigation now converges on `/student/settings`, with `/settings` and `/student/profile` kept only as compatibility redirects
- student notifications now show delivery-number source and portal-inbox refresh mode in addition to the live inbox and push controls
- education-step uploads now use a required/optional checklist and clearer per-card status framing for result-slip vs identity-support uploads
- the student dashboard now uses the continue-application card as the single primary draft surface, keeps the applications list focused on submitted history, and normalizes student settings links to `/student/settings` in quick actions and shell menus
- duplicate slip-generation info toasts were removed from the submission success flow
- desktop sidebar collapse state is now persisted and the desktop collapse visuals were tightened
- authenticated shell sign-out entry points now rely on centralized sign-out instead of pre-navigation, and the extra logout warning toast was removed
- admin application exports now include the latest payment-review timestamp/reviewer/notes/reference and use filter-aware filenames
- analytics report exports now include applied filters plus payment and institution breakdown sections across CSV/PDF/Excel/JSON outputs
- active admin dashboard/report surfaces now present submitted-plus-under-review work as the `Decision Queue`, and report payment breakdown labels now distinguish `Awaiting Payment`, `Awaiting Proof Review`, `Rejected Proof`, and `Verified`
- admin applications queue summaries and filter labels now distinguish decision queue, proof review, and payment follow-up so unpaid applications are no longer presented as if proof had already been submitted
- the student payments page now separates action-required items from proof already under review, and verified history remains a separate section
- student payment/dashboard/detail/status/timeline surfaces now share one canonical payment-state model, so `pending_review` no longer appears as if the student still needs to pay immediately
- the student dashboard overview now treats drafts as a separate continue-draft concern instead of presenting a saved draft as the latest submitted application status
- authenticated student navigation and PWA shortcuts now use `/student/application-wizard` as the canonical internal apply route while preserving `/apply` as an alias
- shared student notification state now clears immediately on sign-out via an `authSignedOut` event, reducing cross-user/logout shell leakage
- user export now supports CSV/Excel/JSON/PDF, active-only vs include-inactive scope, canonical residence fields, and filter-aware filenames
- admin programs page now supports institution CRUD directly on the programs route, including quick institution creation from inside the program dialogs
- catalog write-service typings now match the real `{ program }` and `{ institution }` API payloads
- admin users page now supports persisted custom permission overrides instead of read-only effective-permission inspection only
- auth login/register/session/refresh/roles now resolve effective permissions from `user_permission_overrides` when present and fall back to role defaults otherwise
- role and permission changes now revoke active sessions so stale auth tokens do not retain old access
- user import/export/bulk-role controls now use the same operational role catalog as the main users page
- admin users page now uses the shared admin surface layout, persists `phone` during admin-created registration, and explains role-derived vs custom access plus forced reauthentication directly in the permissions workflow
- admin settings page now uses guided operational configuration for portal/contact/admissions controls, with advanced keys explicitly separated as a secondary workflow
- admin audit API now returns actor email/name/role metadata, category classification, actor/category filter support, and summary breakdowns
- admin audit page now uses the live timeline/summary contract and supports CSV, JSON, and PDF export of the visible result set
- users-page activity history now uses the live audit API, including user-linked actor/target filtering, instead of mock modal data
- admin payment review now supports reviewer notes, rejection reasons, and reopening rejected payments back to `pending_review`
- application list/detail payloads now include verifier identity and latest payment review metadata sourced from the payment audit trail
- student payments page now keeps rejected applications actionable for resubmission, pre-fills prior payment data, and surfaces the latest payment review note
- admin payment filtering now distinguishes `not_paid` from `pending_review`
- the shared slip service no longer emits a global “Generating slip” info toast on every slip request
- local wizard drafts now carry `userId`, and definitive stale-state checks (`not found`, `access denied`, `auth required`, non-draft status) now clear browser drafts instead of treating every lookup failure as transient
- the student dashboard and wizard restore flow now use the same validated local-draft resolver, reducing stale “continue application” surfaces after submission or cross-user sign-in
- authenticated student/admin shell logout buttons now share a guarded in-flight sign-out action and disable repeated logout clicks instead of firing concurrent sign-out requests
- student session-management list/revoke/revoke-all actions now go through the canonical CSRF-aware session service instead of raw fetch calls
- active sessions now sort the current device first, show last-sync context, and explain “terminate all other sessions” from the student settings surface
- student notification inbox actions now go through the canonical notifications service instead of legacy admin-api wrappers
- student notifications settings now support mark-read, open-related-update, and delete actions directly in the portal inbox, and the inbox refreshes on focus/visibility return
- student notification bell and full notifications page now share one inbox store and one polling cycle, so unread/read/delete changes stay synchronized across both surfaces
- upload retries are now restricted to classified transient failures and no longer loop through repeated attempts on deterministic errors
- application-document uploads now include `userId` consistently in the JSON payload
- numbered migration chain restored and applied locally
- frontend/backend action-alignment test mapping fixed for `/api/email`

## Migration Files Created

These migration files now exist and are intended for manual or scripted application:

- `migrations/001_extensions.sql`
- `migrations/002_core_schema.sql`
- `migrations/003_supporting_tables.sql`
- `migrations/004_functions.sql`
- `migrations/005_triggers.sql`
- `migrations/006_data_migration.sql`
- `migrations/007_password_reset_tokens.sql`
- `migrations/008_notification_delivery.sql`
- `migrations/009_document_migration_log.sql`
- `migrations/010_user_permission_overrides.sql`
- `migrations/011_payment_review_indexes.sql`

Legacy supplemental migrations that still need to be applied after the numbered chain:

- `migrations/add_csrf_tokens_table.sql`
- `migrations/add_audit_retention_category.sql`
- `migrations/add_password_reset_tokens_table.sql`
- `migrations/add_login_attempts_table.sql`

See `docs/migration/2026-03-07-manual-migration-order.md` for the manual execution order.

## Remaining Functionality To Implement

No major implementation cluster is currently known to be missing. The remaining backlog is now mostly manual/deploy confirmation and any bug fixes discovered during QA.

### 1. Student Flow Finish Work

These are now mostly confirmation items rather than known missing code:

- some student post-login surfaces still need real browser/manual confirmation after the auth/bootstrap fixes
- upload retry behavior is now classified and bounded, but real browser/manual confirmation is still needed on actual document-error cases
- generating-slip/modal persistence now has the shared-service info toast removed, but still needs manual confirmation across submission/detail slip surfaces
- continue-application surfaces now react to `applicationSubmitted`, draft reconciliation is stricter, and the dashboard now avoids duplicating the same draft across multiple cards/lists, but they still need one broader manual pass across submission and explicit clear-all flows
- the specific post-submit draft-regeneration root cause from mounted autosave/save listeners is now fixed and the dashboard has been simplified to one primary draft surface, but it still needs manual confirmation across refresh/clear-all edge cases
- logout flicker/error flash is now further reduced by the shared guarded sign-out flow plus immediate notification-store reset, but still needs manual confirmation across student/admin shells
- desktop side-menu collapse visuals are improved and persisted, but still need final manual sign-off
- in-app notifications page now exposes the live portal inbox and direct actions, and split bell/page inbox state is fixed; notification delivery itself still needs end-to-end confirmation

Priority files:

- `src/pages/student/Dashboard.tsx`
- `src/pages/student/NotificationSettings.tsx`
- `src/components/ui/ActiveSessions.tsx`
- `src/hooks/useStudentNotifications.ts`
- `src/services/sessionService.ts`
- `src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts`
- `src/lib/storage.ts`
- `src/pages/student/ApplicationStatus.tsx`
- `src/components/student/DocumentButtons.tsx`
- `src/pages/student/ApplicationDetail.tsx`
- `src/components/application/ContinueApplication.tsx`
- `src/components/student/QuickActions.tsx`
- `src/hooks/useSignOutAction.ts`
- `src/lib/applicationSession.ts`
- `src/lib/slipService.ts`
- `src/pages/student/applicationWizard/hooks/useWizardController.ts`
- `src/pages/student/applicationWizard/index.tsx`
- `src/pages/student/applicationWizard/steps/PaymentStep.tsx`
- `src/components/navigation/DesktopSidebar.tsx`
- `src/components/ui/UserMenu.tsx`
- `src/components/ui/AuthenticatedNavigation.tsx`
- `src/components/student/ApplicationSlipActions.tsx`
- `api-src/auth.ts`
- `api-src/sessions.ts`
- `lib/auth/jwt.ts`
- `lib/auth/middleware.ts`
- `lib/sessions.ts`

### 2. Payment/Admin Review Completion

Core payment-state functionality is implemented. Remaining work here is mostly manual confirmation and any last-pass bug fixes that QA uncovers:

- finance/report/export surfaces now expose the latest payment review metadata; only extend them further if product asks for more payment summaries or finance-specific fields
- secondary dashboard/report wording has been aligned in code; only revisit if QA exposes another still-visible legacy surface

Priority files:

- `api-src/applications.ts`
- `api-src/payments.ts`
- `src/pages/admin/Applications.tsx`
- `src/components/admin/applications/ApplicationApprovalActions.tsx`
- `src/components/admin/ReportsGenerator.tsx`
- `src/pages/student/Payment.tsx`
- `src/pages/student/applicationWizard/steps/PaymentStep.tsx`

### 3. Catalog/Admin CRUD Completion

These admin/catalog items remain:

- institution CRUD is now implemented on the admin programs page, but still needs browser/manual QA and any last-pass UX polish
- program/institution linkage needs final admin QA against real data, not just backend contract correctness
- if additional institution metadata/business rules are required, extend the same admin programs surface rather than creating a disconnected second workflow

Priority files:

- `api-src/catalog.ts`
- `src/pages/admin/Programs.tsx`
- `src/services/catalog.ts`
- any new admin institution UI/service files you add

### 4. Admin Export Finish Work

These are now largely implemented. Remaining work is confirmation-driven:

- audit export currently covers the visible result set; if product expects “export all filtered rows”, extend it deliberately instead of implying it already does that
- reports/export surfaces should be reviewed only for product-requested additional summaries beyond the now-implemented analytics/export contract, payment-review fields, user-export formats, and filter-aware filenames

Priority files:

- `src/lib/exportUtils.ts`
- `src/lib/reportExports.ts`
- `src/lib/reportExports.types.ts`
- `src/components/admin/ReportsGenerator.tsx`
- `src/pages/admin/Applications.tsx`
- `src/services/applications.ts`
- `api-src/applications.ts`
- related admin API/service files

### 5. Deploy/Manual Follow-Through Only

These are no longer core implementation blockers, but they may still need follow-through after deploy/manual testing:

- confirm the newly generated PWA icons/screenshots are visible on the live site after cache invalidation
- only revisit `public/manifest.json` or `src/hooks/usePWA.ts` if real-device install prompts still show stale metadata after deployment

## Recommended Next Implementation Order

Do these in order:

1. run manual/browser QA against the refreshed student flows and fix only issues that are actually reproduced
2. run manual/browser QA against admin dashboard/applications/users/export/report flows and fix only issues that are actually reproduced
3. only revisit PWA metadata if live deploy/manual install prompts still show stale cached assets

## Constraints To Keep

- do not revert the existing migration files
- do not remove the new numbered migration chain
- do not remove pay-later support
- do not put the app back into profile-blocked loading on guarded routes
- do not revert the residence `country` model back into `nationality`
- do not reintroduce multipart uploads unless the backend is explicitly changed to support them

## Minimal Verification Policy For This Handover

Because the user asked for implementation-first:

- implement the next batch
- run only minimal compile/runtime sanity checks if needed
- do not spend the session building large new test suites unless absolutely necessary
- update `docs/reports/2026-03-07-manual-remediation-status.md` after each cluster

## Resume Prompt For Claude

Use `docs/migration/codex.md` as the authoritative schema/platform reference, then continue from `docs/reports/2026-03-07-manual-remediation-status.md` and this handover. The known implementation backlog is now mostly closed, so treat the next session as QA-driven remediation rather than open-ended feature work. Reproduce issues in the refreshed student/admin flows, fix only what is still genuinely broken, keep migrations intact, keep docs updated, and revisit PWA metadata only if live deploy/manual install prompts still show stale cached assets.
