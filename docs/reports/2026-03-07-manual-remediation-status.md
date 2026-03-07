# Manual Remediation Status

Date: 2026-03-07
Session type: cross-session stabilization tracker

## Status Legend

- `todo`: not started
- `in_progress`: currently being worked
- `done`: implemented and verified
- `blocked`: requires schema/product decision

## Current Summary

- Investigation complete for the first root-cause pass.
- Durable requirements, design, and execution plan written.
- Latest batch was implementation-only by user instruction; broader verification remains deferred to Claude/manual QA.
- Implemented remediation clusters:
  - profile/date normalization
  - draft id semantics and stale-draft suppression
  - server draft creation during autosave once step 1 is complete
  - upload contract alignment
  - catalog institution linkage
  - pay-now / pay-later payment state handling
  - deferred-payment completion on the student payments page
  - wizard progress summary now reflects the active draft instead of historic averages
  - wizard education subject catalog fallback and inline subject entry
  - identity-document wording and KYC boundary cleanup in the wizard/status surfaces
  - notification preference normalization
  - application slip email delivery path
  - admin application notification sending
  - admin communication history data source
  - auth bootstrap no longer blocks guarded routes on profile hydration
  - admin dashboard bootstrap no longer waits on profile hydration before loading metrics
  - residence country/town location model across signup, settings, and wizard
  - registration now persists the student profile fields needed for immediate wizard autopopulation
  - wizard upload/payment cards now separate academic evidence, identity support documents, payment details, and proof-of-payment review actions
  - admin applications overview now uses API `totalCount` instead of the loaded page length
  - admin users page now supports live user creation, user edits, role assignment, and effective-permission inspection
  - shared auth/admin role contracts now include operational roles (`admissions_officer`, `registrar`, `finance_officer`, `academic_head`)
  - admin users page and bulk actions now support account deactivation through `/api/admin?action=users`, with active-session revocation and active-only default listing
  - auth page validation now uses app-level inline errors instead of native browser validation, and password-toggle labels no longer collide with the password field label
  - Playwright config now supports `PLAYWRIGHT_BASE_URL` override for reusable local QA against the Vite proxy
  - service-worker update handling now auto-reloads low-risk auth/dashboard shells after `cache-updated` activation and keeps a working reload fallback for form-heavy routes
  - tracked auth sessions are now created during login/register and preserved across refresh via JWT `sid` claims, with middleware/session-check validation against active `device_sessions`
  - logout now deactivates the current tracked session instead of leaving session state detached from auth cookies, and student session-management UI now uses the canonical `/api/sessions` response shape and `keepCurrent` revoke-all flow
  - student notification settings now fall back to canonical profile phone data and expose the live in-app portal inbox plus push-notification controls in the same surface
  - continue-application cards now react immediately to `applicationSubmitted` events so stale draft prompts disappear as soon as submission succeeds
  - application-detail slip download/email actions now use the canonical slip service instead of dead legacy endpoints
  - duplicate slip-generation info toasts were removed from the submission success flow so the sticky “generating slip” surface is less likely to requeue itself
  - desktop sidebar collapse state now persists and the desktop rail/header visuals were tightened; logout entry points were normalized to rely on centralized sign-out instead of pre-navigation
  - admin programs page now exposes institution CRUD on the same route as program CRUD, including quick institution creation from inside the program dialogs and archive guards when active programs still reference an institution
  - admin user permissions are now persisted through `user_permission_overrides`, the users page can save custom permission sets, and auth login/refresh/session/roles now resolve effective permissions from override-or-role state
  - role changes and permission changes now revoke active sessions so auth tokens cannot keep stale access after admin updates
  - manual migration `migrations/010_user_permission_overrides.sql` now exists for environments that still need permission override storage applied
  - admin settings page now uses guided operational controls for portal/contact/admissions configuration, with advanced keys treated as a secondary workflow
  - admin audit API now returns actor email/name/role metadata, category classification, actor/category filter support, and live summary breakdowns
  - admin audit page now uses the live audit summary/timeline contract and supports CSV, JSON, and PDF export of the visible result set
  - users-page activity log now uses the live audit API and can show events performed by or targeted at the selected user instead of mock entries
  - admin payment review now captures review notes, supports reopening rejected payments to `pending_review`, and returns verifier/latest-review metadata in application list/detail payloads
  - student payments page now treats rejected payments as resubmittable instead of terminal history, pre-fills prior payment data, and surfaces the latest payment review note
  - admin payment state now distinguishes `not_paid` from `pending_review` instead of collapsing unpaid applications into the review queue
  - manual migration `migrations/011_payment_review_indexes.sql` now exists to support the heavier payment-review lookup patterns
  - the shared slip service no longer emits a global “Generating slip” info toast on every slip request, reducing the persistent student slip-notification problem after submission
  - local wizard drafts now carry `userId`, and draft reconciliation clears browser drafts on definitive `not found` / `access denied` / `auth required` status checks instead of treating every fetch failure as a transient fallback
  - the dashboard and wizard restore paths now use the same validated local-draft resolver, reducing stale “continue application” surfaces after submission or cross-user sign-in on the same device
  - authenticated student/admin shell logout actions now share an in-flight sign-out controller and disable repeated sign-out clicks instead of firing concurrent logout requests
  - student session-management actions now use the canonical CSRF-aware session service for list, revoke, and revoke-all instead of raw fetch calls
  - student notification inbox actions now use the canonical notifications service for list/read/delete operations, the notifications settings page now supports mark-read, open-related-update, and delete actions directly from the portal inbox, and student inbox state refreshes when the tab regains focus
  - student notification bell and the full notifications page now share one inbox store and polling cycle, so read/delete/mark-all state stays synchronized across both surfaces instead of drifting until the next refresh
  - upload retries are now classified so only transient document failures retry once; deterministic validation/auth/server-contract failures no longer loop through repeated upload attempts
  - application document uploads now include `userId` consistently in the JSON upload payload alongside `applicationId`
  - wizard autosave and save hotkeys now shut off after successful submission so the success screen cannot recreate a new local draft after cleanup
  - student dashboard submit events now optimistically clear local draft state and update the submitted application row before the background refresh completes
  - student dashboard, application detail, and application status pages now share the canonical slip-service path for application-slip download/email actions
  - student application-status page now exposes canonical document actions and direct payment follow-up actions instead of leaving submission state disconnected from the payment/doc flows
  - admin application export rows now include the payment and grade fields the frontend export utilities expect, so paid amounts and grade-derived columns no longer export as zeros or empties
  - admin analytics reports now page through the full export dataset instead of summarizing a single fetch window, and report downloads now support CSV alongside PDF, Excel, and JSON
  - admin applications queue summaries and filter copy now distinguish decision queue, proof-review queue, and payment follow-up instead of flattening unpaid and pending-review states into one generic “pending” label
  - student payments page now separates payment action required, payment under review, and verified payment history so `pending_review` applications no longer appear inside an “awaiting payment” bucket
  - the PWA manifest now ships generated PNG icons plus wide/mobile screenshots, uses explicit manifest `id`, points shortcuts at real student routes, and no longer advertises unsupported `/handle`, `/upload`, or `/share` capabilities
  - the runtime PWA shortcut handler and cache config are now aligned with the real student/admin route model, and reproducible install assets are generated through `scripts/generate-pwa-assets.mjs`
  - auth entry screens now use distinct returning-applicant vs new-applicant branding, and the sign-up flow explicitly states that it creates the portal account before the application workflow begins
  - student settings now use a unified account-management surface for profile fields, notification-delivery context, and active-session guidance instead of the older fragmented layout
  - student account navigation now converges on canonical `/student/settings`; desktop/mobile nav, bottom navigation, user-menu account access, installed-route cache config, and legacy `/settings` and `/student/profile` aliases now all resolve to that single surface
  - active sessions now sort the current device first, expose last-sync context, and explain “terminate all other sessions” relative to the protected current device
  - student notifications now show the current delivery-number source and inbox refresh mode so the page better explains why portal-inbox updates should appear automatically
  - education-step uploads now include a required/optional checklist plus per-card upload status so the result slip and identity support document are visually separated
  - admin users page now uses the shared admin surface layout, persists phone data during admin-created registration, and surfaces explicit reauthentication/session-revocation guidance for role and permission changes
  - the student dashboard now treats the continue-application card as the primary draft surface, keeps submitted history focused on submitted records only, and normalizes shell/profile-settings links to canonical student routes
  - admin application exports now carry payment-review metadata and filter-aware filenames, and analytics report exports now include applied-filter, payment-breakdown, and institution-breakdown context across CSV/PDF/Excel/JSON outputs
- Local dev verification topology is now confirmed:
  - same-origin `/api` proxy works through `http://127.0.0.1:5175`
  - local API health responds on `http://127.0.0.1:3002`
  - required auth/API secrets are present locally
  - the missing baseline schema has now been restored locally through the numbered migration chain plus legacy add-on migrations
  - auth-backed local API probing now returns the expected `401 Invalid credentials` response instead of backend `500`s
  - targeted auth Playwright regression now passes against the local proxy stack

## Issue Clusters

| Cluster | Status | Notes |
| --- | --- | --- |
| Auth/session skeleton loading | `in_progress` | Route bootstrap now unblocks on session resolution instead of waiting on profile hydration; admin dashboard load gate was fixed to depend on `user` instead of `profile`; service-worker activation now auto-refreshes low-risk shells instead of silently requiring a manual reload; tracked auth sessions now flow through JWT `sid` claims and active-session validation; logout entry points now share a guarded sign-out flow, student account routes now converge on `/student/settings`, and the active-sessions card is clearer about the current device, but broader post-login/manual QA is still pending |
| Draft delete/autosave/submission cleanup | `in_progress` | Draft delete-by-user bug fixed; stale local draft suppression added for dashboard/wizard/session manager; local draft save events notify dashboard surfaces; autosave now creates a server draft once step 1 is complete; browser drafts now clear on definitive stale-state responses (`401`/`403`/`404`-class checks) instead of surviving every failed status lookup; the dashboard now uses one primary continue-draft surface instead of repeating the same draft across multiple cards/lists |
| Post-submit draft resurrection | `in_progress` | Root cause identified in mounted wizard autosave/save listeners continuing after success; save timers/hotkeys now disable after submission and dashboard submit events clear draft UI optimistically; duplicate dashboard draft rows/cards were also removed, but broader manual pass is still needed across explicit clear-all and refresh scenarios |
| Profile completion and date input formatting | `done` | Canonical field mapping and date normalization implemented with tests |
| Upload loop / 500 failures | `in_progress` | JSON/base64 document contract is implemented, and upload retries are now limited to classified transient failures instead of blind repetition; broader manual QA on real upload failure cases is still pending |
| Program/institution mismatch | `in_progress` | Catalog API contract fixed and the admin programs page now includes full institution CRUD plus quick-add inside program dialogs; browser/manual QA still needed |
| Pay later flow | `in_progress` | Wizard pay-now/pay-later choice implemented; deferred payment can now be completed from the student payments page; rejected payments can be resubmitted; admin payment review now supports notes and reopen-to-review; broader manual QA and payment UI polish still needed |
| Student wizard education/KYC clarity | `in_progress` | Subject fallback catalog, inline add-below action, identity-document wording, residence country/town selectors, explicit academic/identity/payment section framing, and upload checklist/status framing landed; remaining manual QA and upload retry edge-case verification are still open |
| Admin export/report completion | `in_progress` | Audit export redesign landed earlier; application export rows now align with the frontend export contract, carry payment-review metadata, and use filter-aware filenames; analytics reports now use full-dataset pagination plus CSV output and include applied-filter/payment/institution context, but broader manual QA and any remaining report-surface polish are still open |
| Notifications contact/in-app behavior | `in_progress` | Preferences payload normalized to include phone/channel metadata; the student notifications page now falls back to profile phone data, shows the current delivery-number source and inbox refresh mode, exposes the live in-app inbox plus push settings, and supports read/open/delete actions through the canonical notifications service; the bell and full page now share one inbox store/polling cycle, but broader end-to-end delivery QA is still pending |
| Admin communication history | `in_progress` | Stub replaced with `/api/notifications?action=history`; admin send-notification path implemented |
| Admin users/roles/permissions | `in_progress` | User creation, edit, role assignment, effective-permission inspection, account deactivation, persisted custom permission overrides, user-linked activity logs, shared-page alignment, and explicit reauthentication messaging are all implemented; remaining work is future permission-catalog alignment if backend capabilities change plus manual QA |
| Audit/settings/export redesign | `in_progress` | Settings now uses guided operational controls, and the audit API/page now expose real filters, summaries, and current-view CSV/JSON/PDF exports; broader report/export follow-through and manual QA are still open |
| PWA icon/install issues | `in_progress` | PNG icons, install screenshots, manifest `id`, shortcut-route alignment, and dead handler cleanup are implemented; deploy/manual install verification is still pending |
| Local browser QA environment | `in_progress` | Vite same-origin `/api` proxy is working, auth/API secrets are present, the local database schema has been restored, and targeted auth/browser checks now pass; remaining work is broader student/admin flow QA plus an intermittent Playwright Chromium launch instability on larger multi-test runs |

## Confirmed Root Causes

1. `src/lib/applicationSession.ts`
   - Draft deletion hits `/applications?id=<userId>` instead of deleting actual draft application ids.

2. `src/hooks/useProfileAutoPopulation.ts`
   - Date fields are passed through as ISO timestamps rather than `yyyy-MM-dd`.
   - Completion calculation uses legacy aliases and misses canonical wizard fields.

3. `src/lib/storage.ts` and `src/services/documents.ts`
   - Frontend upload helpers use multipart payloads while the API validator expects JSON/base64 fields.

4. `api-src/catalog.ts`
   - Program reads omit `institution_id` and institution join data.
   - Program writes do not persist institution linkage.

5. `api-src/notifications.ts`
   - Canonical preference response omitted phone data needed by the student notifications page.
   - Student notifications settings page expected richer channel metadata than the API returned.

6. `src/components/admin/CommunicationHistory.tsx`
   - Communication history was a stub and could not show real data.

7. `src/pages/student/applicationWizard/hooks/useApplicationSlip.ts`
   - Slip email flow called a non-existent `/api/applications?action=email-slip` endpoint.

8. `src/services/applications.ts` and `api-src/applications.ts`
   - Admin notification send path existed in the client but had no backend action.

9. `src/pages/student/applicationWizard/steps/PaymentStep.tsx` and `src/pages/student/Payment.tsx`
   - The product had no canonical deferred-payment path even though the dashboard exposed a payments page.
   - Payment was treated as mandatory during submission, and the payments page could not complete payment after submission.

10. `src/pages/student/applicationWizard/components/AnalyticsDashboard.tsx`
   - The wizard sidebar displayed historical completed/draft counts and lifetime elapsed time as if they were the active draft’s progress.

11. `src/lib/subjectMatcher.ts`
   - Broad substring matching could resolve `Mathematics` to `Additional Mathematics`.

12. `src/pages/student/applicationWizard/steps/EducationStep.tsx`
   - Subject entry still forced users to scroll to the top to add the next subject.
   - Upload copy exposed a generic “Extra KYC documents” bucket instead of an explicit identity-document flow.

13. `src/pages/student/applicationWizard/hooks/useWizardController.ts`
   - Autosave only wrote a browser draft until a manual step transition created the application record.

14. `src/hooks/auth/useSessionListener.ts`
   - Route loading state was tied to profile hydration, delaying student/admin page mount after the session was already known.

15. `src/pages/admin/Dashboard.tsx`
   - Admin dashboard effects and initial loading still required both `user` and `profile`, keeping the page in a skeleton despite a valid admin session.

16. Local verification environment
   - Same-origin browser QA is now wired correctly through the Vite `/api/*` proxy and the required auth secrets are present.
   - The missing baseline schema has now been restored through the new numbered migrations plus the legacy add-on migrations, and auth probes now return `401` instead of backend `500`s.

17. `api-src/auth.ts` and `src/pages/auth/SignUpPage.tsx`
   - Signup collected rich profile fields on the frontend, but the registration API only accepted name/email/password and discarded the rest.

18. Residence location model
   - The app had no canonical `country` field wired through signup/profile/application flows, so town/city capture could not default to Zambia or stay aligned with later application steps.

19. `src/pages/admin/Applications.tsx`
   - Admin application totals were derived from the currently loaded page (`applications.length`) instead of the API pagination total.

20. `src/pages/admin/Users.tsx`, `src/services/admin/users.ts`, and `api-src/admin.ts`
   - The users page exposed edit/permission actions that were still backed by placeholder service calls.
   - Shared admin role validation and permission mappings did not include the operational staff roles used by the frontend.

21. Admin user removal semantics
   - The users page still exposed a destructive “delete” affordance even though the platform already relied on `profiles.is_active` and session revocation for account disabling.
   - User listing did not default to active accounts, so a deactivated account would have remained visible in the primary operational table.

22. `src/hooks/useServiceWorkerUpdate.ts`
   - The app ignored `cache-updated` activation messages unless a user explicitly initiated `skipWaiting`, so new builds could activate silently while the visible auth/dashboard shell stayed stale until manual refresh.
   - Prompt actions were also ineffective when an update had already activated and no waiting worker remained.

23. `playwright.config.ts`
   - Local browser verification was hardcoded to `http://localhost:5173`, while the verified same-origin proxy topology was running on `http://127.0.0.1:5175`.

24. Session tracking contract
   - Login/register/refresh previously issued auth cookies without any stable session identity, so `/api/sessions` could not reliably mark the current session and “terminate other sessions” could not safely preserve the active device.
   - Logout and middleware also did not enforce `device_sessions` state against active JWTs, so revocation and visible auth state could drift apart.

25. Student notification/settings surface
   - The student notification settings page only trusted the preferences payload for contact phone state even when the canonical profile already had a phone number.
   - The page also did not expose recent in-app notifications, which made “in-app notifications” look broken even when the notifications API had data.

26. Student notifications state model
   - The header notification bell and the full notifications page each created their own polling loop and optimistic inbox state, so read/delete changes could appear in one surface while the other stayed stale until a later refresh.

27. Student application-detail slip actions
   - `src/components/student/ApplicationSlipActions.tsx` was still calling legacy `/applications/generate/slip` and `/applications/email/slip` endpoints instead of the canonical slip generation/email service.

28. Logout and sidebar shell polish
   - Several authenticated shells were navigating away before centralized sign-out finished clearing state, contributing to logout flicker/error flashes.
   - Desktop sidebar collapse state was not persisted and the collapsed header layout looked visually unresolved.

29. `src/pages/admin/Programs.tsx` and `src/services/catalog.ts`
   - The admin programs surface only exposed program CRUD even after institution linkage was fixed in the API, so admins still had no way to create or archive institutions from the operational catalog screen.
   - Catalog write-service typings also assumed bare entities instead of the `{ program }` / `{ institution }` payloads the API actually returns.

30. `src/pages/admin/Users.tsx`, `src/components/admin/UserPermissions.tsx`, `src/services/admin/users.ts`, `api-src/admin.ts`, and `api-src/auth.ts`
   - The permissions dialog was hard-coded read-only because the service layer rejected writes and the admin API had no persisted override path.
   - Auth token/session refresh paths only embedded role-default permissions, so even a future writable permissions UI would have left users on stale access until token expiry.

31. `src/pages/admin/Settings.tsx`
   - The old page behaved like a raw key-value editor, which made system configuration feel disconnected from the admissions operating model the admin actually manages.

31. `src/services/admin/audit.ts`, `src/pages/admin/AuditTrail.tsx`, and `api-src/admin.ts`
   - The audit UI exposed actor-email/category filters and “current changes” expectations that the API did not actually support.
   - The API returned bare audit rows without actor identity data, category shaping, or summary metadata, so the page could not reliably show who changed what or summarize recent activity.

32. `src/components/admin/UserActivityLog.tsx`
   - The users-page activity modal was still using hard-coded mock events instead of live audit records tied to the selected user.

33. `api-src/applications.ts`, `src/components/admin/applications/ApplicationApprovalActions.tsx`, and `src/pages/student/Payment.tsx`
   - Payment review decisions did not persist reviewer notes or flow them back into admin/student detail surfaces.
   - Rejected payments were treated as terminal history on the student payments page instead of a resubmission task.
   - Admin review tooling also conflated unpaid applications with `pending_review`, obscuring the difference between pay-later and proof-submitted states.

34. `src/lib/slipService.ts`
   - The shared slip helper emitted a global “Generating slip” info toast on every download/email action, which could re-surface the sticky slip message after submission even when the calling screen already had its own loading state.

35. `src/lib/applicationSession.ts`, `src/pages/student/Dashboard.tsx`, and `src/pages/student/applicationWizard/hooks/useWizardController.ts`
   - Local draft restore logic treated every application-status lookup failure as transient, so definitive `401` / `403` / `404` responses could keep stale browser drafts visible after submission, deletion, or cross-user sign-in.

36. Authenticated shell navigation components
   - Student/admin headers and menus fired unguarded concurrent `signOut()` calls, which made logout more prone to flicker and brief transient errors.

37. `src/components/ui/ActiveSessions.tsx`
   - Session list/revoke actions were using raw `fetch` instead of the CSRF-aware client/service layer, so session-management interactions could fail against `/api/sessions` even after tracked-session support was implemented.

38. `src/hooks/useStudentNotifications.ts`
   - Student notification read/delete actions were still routed through the legacy `adminApi` wrappers rather than the canonical notifications service, so CSRF-protected inbox actions could fail or roll back unexpectedly.

39. `src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts`
   - The upload hook retried every failure class recursively, including deterministic validation/auth/server errors, which produced the repeated upload attempts seen during manual testing.

40. `src/pages/student/applicationWizard/index.tsx` and `src/pages/student/applicationWizard/hooks/useWizardController.ts`
   - The wizard success screen reused the mounted controller tree, so autosave intervals and save shortcuts could keep recreating local draft state immediately after a successful submission.

41. `src/components/student/DocumentButtons.tsx`
   - Student document surfaces still mixed the canonical slip service with the legacy generic document generator, so application-slip behavior diverged between dashboard, detail, and status pages.

42. `api-src/applications.ts` export rows
   - The admin export endpoint returned `amount` instead of `paid_amount` and omitted grade-summary fields the frontend export utilities rely on, so exported application files could lose payment totals and grade-derived columns.

43. `src/components/admin/ReportsGenerator.tsx`
   - The analytics report generator summarized only a single fetch window instead of paging through the full admin dataset, which made larger reports incomplete and inconsistent with application exports.

44. `public/manifest.json` and `src/hooks/usePWA.ts`
   - The manifest previously relied on SVG-only install icons, had no install screenshots, pointed student shortcuts at stale routes, and advertised `protocol_handlers`, `file_handlers`, and `share_target` actions for routes that do not exist in the app.
   - Runtime shortcut handling also only recognized a subset of the manifest shortcut ids, so installed shortcuts and in-app navigation could diverge.

45. `src/components/auth/AuthLayout.tsx`, `src/pages/auth/SignInPage.tsx`, and `src/pages/auth/SignUpPage.tsx`
   - Sign-in and sign-up previously reused almost identical framing, so returning applicants and first-time applicants were not clearly separated.
   - The sign-up page also did not clearly explain that account creation happens before the programme/application workflow, which made the onboarding path feel fragmented.

## Files Most Likely To Change Next

- `src/pages/student/Dashboard.tsx`
- `src/components/ui/ActiveSessions.tsx`
- `src/hooks/useStudentNotifications.ts`
- `src/services/sessionService.ts`
- `src/pages/student/applicationWizard/hooks/useWizardController.ts`
- `src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts`
- `src/lib/storage.ts`
- `src/pages/student/ApplicationStatus.tsx`
- `src/pages/student/ApplicationDetail.tsx`
- `src/components/application/ContinueApplication.tsx`
- `src/hooks/useSignOutAction.ts`
- `src/lib/applicationSession.ts`
- `src/components/navigation/DesktopSidebar.tsx`
- `src/pages/student/Payment.tsx`
- `src/pages/student/applicationWizard/steps/PaymentStep.tsx`
- `src/pages/admin/Applications.tsx`
- `src/components/admin/applications/ApplicationApprovalActions.tsx`
- `src/components/admin/ReportsGenerator.tsx`
- `src/lib/reportExports.ts`
- `src/lib/exportUtils.ts`
- `src/services/applications.ts`
- `api-src/applications.ts`

## Latest Implementation Batch

- Finished the remaining admin applications wording/document-label cleanup:
  - `src/components/admin/applications/ApplicationCard.tsx`, `src/components/admin/applications/ApplicationDetailModal.tsx`, `src/components/admin/applications/ApplicationsTable.tsx`, `src/components/admin/applications/ApplicationsTableView.tsx`, `src/components/admin/applications/ApplicationsFilters.tsx`, `src/components/admin/applications/FiltersPanel.tsx`, and `src/pages/admin/Applications.tsx` now use the canonical payment labels (`Awaiting Payment`, `Awaiting Proof Review`, `Rejected`, `Verified`) instead of raw enum string replacement or generic “Awaiting Review” copy
  - admin payment update toasts now use the same canonical payment-state wording as the filters/cards/detail views instead of echoing raw enum values
  - the remaining admin-facing `extra_kyc` copy was normalized to `Identity Support Document` in routed document/detail flows
  - legacy secondary admin surfaces `src/components/admin/EnhancedApplicationsTable.tsx` and `src/components/admin/BulkOperations.tsx` were also aligned so they do not reintroduce the older generic `pending` wording if reused later
- Finished the remaining student payment/shell alignment sweep:
  - added `src/lib/paymentStatus.ts` so the student dashboard, payment page, status page, detail page, and shared application-status component now use one canonical payment-state vocabulary (`Awaiting Payment`, `Awaiting Proof Review`, `Rejected`, `Verified`)
  - `src/components/student/DashboardStatusOverview.tsx` now treats drafts as a separate continue-draft concern, shows payment action required separately from submitted history, and stops surfacing a draft as the latest submitted application status
  - `src/pages/student/Dashboard.tsx` now flags payment follow-up only when the student actually needs to act (`not_paid` or `rejected`), instead of treating `pending_review` as unpaid action
  - `src/pages/student/ApplicationStatus.tsx`, `src/pages/student/ApplicationDetail.tsx`, and `src/components/student/ApplicationTimeline.tsx` now show normalized payment wording and no longer tell students to act when proof is already under review
- Finished the remaining student route/logout consistency sweep:
  - `src/components/navigation/DesktopSidebar.tsx`, `src/components/navigation/MobileBottomNav.tsx`, `src/hooks/usePWA.ts`, and `src/lib/pwaConfig.ts` now use `/student/application-wizard` as the canonical authenticated “new application” route while still recognizing `/apply` as a compatibility alias
  - `src/hooks/auth/useSessionListener.ts` now emits `authSignedOut`, and `src/hooks/useStudentNotifications.ts` now clears the shared inbox store immediately on sign-out so prior-user notification state does not linger across logout/login transitions
- Finished the remaining export/report polish sweep:
  - `src/components/admin/UserExport.tsx` now supports CSV, Excel, JSON, and PDF from the same filtered dataset, adds active-only vs include-inactive scope, includes canonical residence fields, and generates filter-aware filenames
  - `src/lib/reportExports.ts` now labels program/report queue columns as `Decision Queue` and formats payment metrics with the same canonical wording used elsewhere in the admin/student UI
  - `src/components/admin/AnalyticsCharts.tsx`, `src/components/admin/RealTimeNotifications.tsx`, and `src/components/admin/BulkOperationsPanel.tsx` were also aligned away from the older generic `pending` wording in the remaining secondary admin surfaces
- Finished the active admin payment/report wording alignment:
  - `src/components/admin/EnhancedDashboard.tsx`, `src/components/admin/RealtimeMetricsDisplay.tsx`, `src/components/admin/FixedAdminDashboard.tsx`, `src/components/admin/OfflineAdminDashboard.tsx`, and `src/components/admin/QuickActionsPanel.tsx` now present `pendingApplications` as the admin decision queue instead of generic “pending review” language
  - those dashboard/quick-action surfaces now use `Queue` / `Decision Queue` wording so submitted-plus-under-review work is not conflated with payment proof review
  - `src/components/admin/ReportsGenerator.tsx` now labels payment states as `Awaiting Payment`, `Awaiting Proof Review`, `Rejected Proof`, and `Verified` in generated analytics metadata instead of older generic labels
  - the main remaining work in this area is legacy/manual confirmation, not the active dashboard/report contract
- Finished the next payment/export follow-through slice:
  - `api-src/applications.ts`, `src/services/applications.ts`, `src/pages/admin/Applications.tsx`, and `src/lib/exportUtils.ts` now carry the latest payment-review timestamp/reviewer/notes/reference through the admin export pipeline instead of dropping that metadata from CSV/Excel/PDF downloads
  - admin application export filenames now reflect active status/payment/program/institution filters instead of using one generic filename for every export
  - `src/components/admin/ReportsGenerator.tsx`, `src/lib/reportExports.types.ts`, and `src/lib/reportExports.ts` now include payment breakdowns, institution breakdowns, and applied-filter summaries in generated analytics exports across CSV/PDF/Excel/JSON
  - document-template prefills in `src/components/admin/ReportsGenerator.tsx` now prefer canonical `paid_amount` and `last_payment_reference` fields when available
- Finished the next student dashboard cleanup slice:
  - `src/components/application/ContinueApplication.tsx` now renders only when a real draft exists instead of falling back to a generic “ready to apply” card
  - `src/pages/student/Dashboard.tsx` now keeps “My applications” focused on submitted history, with draft work handled through the dedicated continue-draft surface instead of duplicate draft cards in the list
  - `src/components/student/QuickActions.tsx`, `src/components/ui/UserMenu.tsx`, and `src/components/ui/AuthenticatedNavigation.tsx` now stop duplicating the primary continue-draft action and use canonical `/student/settings` routes for student settings/profile flows
- Finished the admin users UX completion slice:
  - `src/pages/admin/Users.tsx` now uses the shared admin `Container`/`PageHeader`/`SectionCard` shell, shows clearer operational guidance, and surfaces success/info feedback for create, edit, deactivate, and permission-update actions
  - admin-created users now persist `phone` through the live register flow via `src/services/admin/users.ts`, `lib/validation/admin.ts`, and `api-src/admin.ts`
  - `src/components/admin/UserPermissions.tsx` now explains current access source vs post-save source, includes a reset-to-role-defaults action, and makes the forced reauthentication/session-revocation behavior explicit before save
- Finished the student account/communication polish slice:
  - `src/pages/student/Settings.tsx` now uses a unified account-management layout for profile details, residence data, notification delivery context, and active-session guidance
  - `src/pages/student/NotificationSettings.tsx` now shows the current phone source used for delivery and the portal-inbox refresh mode so the screen communicates how in-app notifications should appear
  - `src/pages/student/applicationWizard/steps/EducationStep.tsx` now includes a visible required/optional document checklist and per-card upload status so academic evidence and identity support documents are harder to confuse
- Finished the next export/report remediation slice:
  - `api-src/applications.ts` export rows now return `paid_amount`, grade summaries, total-subject counts, and best-five points so admin CSV/Excel/PDF exports line up with the frontend export utilities
  - `src/pages/admin/Applications.tsx` now maps nullable payment state more explicitly and falls back correctly when older rows still expose `amount`
  - `src/components/admin/ReportsGenerator.tsx` now pages through the full admin export dataset before computing analytics instead of stopping at a single fetch window
  - analytics report downloads now support CSV in addition to PDF, Excel, and JSON, all from the same normalized report payload
- Closed the post-submit draft-regeneration path:
  - wizard smart autosave now disables when submission succeeds
  - controller-level autosave intervals now also stop after success
  - `saveDraft()` now no-ops after success so lingering hotkeys/late callbacks cannot recreate a draft
  - submission cleanup now explicitly clears browser draft state before draft-manager/server cleanup
- Improved immediate student-shell state after submission:
  - `applicationSubmitted` now carries enough detail for optimistic dashboard updates
  - the student dashboard immediately clears local draft UI and flips the submitted application row before the follow-up reload finishes
- Unified application-slip handling across student surfaces:
  - `DocumentButtons` now delegates application-slip download/email to `ApplicationSlipActions`
  - dashboard, application detail, and application status now share the same canonical slip-service-backed flow
  - application status now also exposes document actions plus a direct payment follow-up button and the latest payment-review note when available
- Added tracked-session support to the auth contract:
  - login/register now create `device_sessions`
  - JWT access/refresh tokens now carry `sid`
  - refresh preserves or bootstraps a tracked session
  - auth/session checks and shared auth middleware now reject revoked/expired tracked sessions when `sid` is present
  - logout deactivates the current tracked session instead of only clearing cookies
- Fixed student session-management UI to match the real API:
  - canonical session payload parsing
  - current-session badge via `is_current`
  - “terminate all other sessions” now sends `keepCurrent: true`
  - count handling now matches the backend `count` response
- Improved student notifications/settings:
  - phone-number fallback now uses the student profile when preferences omit it
  - notification settings now include the live portal inbox and push-notification controls
- Reduced stale student UI after submission:
  - continue-application prompt now listens for `applicationSubmitted`
  - duplicate slip-generation info toasts were removed from the success flow
  - application-detail slip actions now use the canonical slip service
- Improved shell polish:
  - desktop sidebar collapse state persists locally and the collapse visuals were refined
  - authenticated shell sign-out entry points no longer pre-navigate before central sign-out clears auth state
  - the extra “server logout failed” user-facing warning toast was removed to reduce logout flicker
- Finished the admin catalog workflow:
  - admin programs page now supports institution create/edit/archive on the same route
  - program dialogs can launch institution creation inline and resume with the new institution preselected
  - institution archive is blocked in UI and API while active programs still reference the institution
  - catalog write-service typings now match the actual `{ program }` / `{ institution }` API payloads
- Finished the first real user-permissions model:
  - added `migrations/010_user_permission_overrides.sql`
  - admin API now supports `PUT /api/admin?action=user-permissions`
  - users page permissions dialog can save custom permission overrides instead of staying read-only
  - auth login/register/session/refresh/roles now resolve effective permissions from override-or-role state
  - role/permission changes revoke active sessions so stale access does not survive admin updates
  - user import/export/bulk-role helpers now use the same expanded operational role catalog as the main users page
- Redesigned admin settings:
  - guided operational sections now cover portal experience, admissions contact, and admissions operations
  - advanced keys are clearly secondary, searchable, and explicitly separated from the guided controls
  - creating a new advanced key now opens the advanced section automatically
- Redesigned admin audit:
  - `/api/admin?action=audit-log` now supports actor-email and category filters, fuzzy action search, actor metadata joins, and live category/entity/action summary breakdowns
  - the admin audit page now renders those summaries directly instead of relying on inferred client-only placeholders
  - visible audit results can now be exported as CSV, JSON, or PDF through `src/lib/auditExports.ts`
- Finished users-page activity visibility:
  - `/api/admin?action=audit-log` now supports `filter_user_id` for actor-or-target user lookups
  - `src/components/admin/UserActivityLog.tsx` now shows live audit events instead of mock history
- Finished the next payment-state remediation slice:
  - `/api/applications` list/detail responses now enrich applications with verifier identity and latest payment review metadata sourced from the payment audit trail
  - admin payment review now captures notes, requires a reason on rejection, and lets admins reopen rejected payments back to `pending_review`
  - student payments page now keeps rejected applications in the actionable queue, pre-fills previous payment data, and surfaces the latest review note for resubmission guidance
  - admin application filtering now supports explicit `not_paid` state instead of mapping unpaid applications into `pending_review`
  - added `migrations/011_payment_review_indexes.sql` for manual rollout of payment-review query indexes
- Finished the next student session/notifications/upload remediation slice:
  - `ActiveSessions` now uses the canonical session service for list/revoke/revoke-all, so CSRF-protected session management aligns with `/api/sessions`
  - the sessions card now surfaces clearer device/session timing information and a live active-session count
  - `useStudentNotifications` now uses the canonical notifications service instead of the legacy `adminApi` wrappers for inbox actions
  - the student notifications page now supports mark-read, open-related-update, and delete actions directly from the portal inbox
  - upload retries are now limited to classified transient failures and no longer reattempt deterministic upload errors over and over
  - application document uploads now include `userId` in the JSON payload for better contract consistency
- Finished the PWA/installability remediation slice:
  - added `scripts/generate-pwa-assets.mjs` plus `package.json` script `generate:pwa-assets` so raster install assets can be regenerated from source
  - generated `public/icons/*.png` raster icons and `public/screenshots/student-dashboard-wide.png` plus `public/screenshots/application-wizard-mobile.png`
  - `public/manifest.json` now declares explicit `id`, uses PNG install icons first, includes both desktop/mobile install screenshots, and points shortcuts at real student routes
  - removed unsupported `protocol_handlers`, `file_handlers`, and `share_target` declarations from the manifest because the app has no matching `/handle`, `/upload`, or `/share` routes
  - `src/hooks/usePWA.ts` now recognizes the `applications` shortcut id and routes dashboard shortcuts to `/student/dashboard`
  - `src/lib/pwaConfig.ts` now precaches the generated install assets and aligns route-cache hints with current student/admin routes instead of stale `/applications` style paths
- Finished the auth-entry clarity remediation slice:
  - `src/components/auth/AuthLayout.tsx` now supports variant-specific sign-in vs sign-up branding, hero copy, mobile summaries, and form badges
  - `src/pages/auth/SignInPage.tsx` now frames sign-in as the returning-applicant path with clearer account-specific labels and duplicate-registration guidance
  - `src/pages/auth/SignUpPage.tsx` now frames sign-up as account creation first, groups inputs into labeled sections, and explicitly explains that programme/application details are completed after sign-in

## Current No-Test Note

- Per current user instruction, the latest implementation batches also did not run new tests, type-checks, or browser automation.

## Verification Log

- `2026-03-07`: `bunx vitest run tests/unit/profileFieldMapping.test.ts tests/unit/applicationSessionDrafts.test.ts tests/unit/documentUploadPayload.test.ts tests/unit/api/catalogPrograms.test.ts tests/unit/slipServiceEmail.test.ts tests/unit/api/applications.send-notification.test.ts`
  - Result: 6 files passed, 13 tests passed
- `2026-03-07`: `bun run scripts/bundle-api.mjs`
  - Result: 12/12 API endpoints bundled successfully
- `2026-03-07`: `bun run type-check`
  - Result: passed after aligning admin program page type with nullable institution relation
- `2026-03-07`: `bunx vitest run tests/unit/paymentFlow.test.ts tests/unit/wizardProgressSummary.test.ts`
  - Result: 2 files passed, 8 tests passed
- `2026-03-07`: `bunx vitest run tests/unit/profileFieldMapping.test.ts tests/unit/applicationSessionDrafts.test.ts tests/unit/documentUploadPayload.test.ts tests/unit/api/catalogPrograms.test.ts tests/unit/slipServiceEmail.test.ts tests/unit/api/applications.send-notification.test.ts tests/unit/paymentFlow.test.ts tests/unit/wizardProgressSummary.test.ts`
  - Result: 8 files passed, 21 tests passed
- `2026-03-07`: `bun run type-check`
  - Result: passed after wiring the extracted payment validation helper
- `2026-03-07`: `bunx vitest run tests/unit/educationCatalog.test.ts tests/unit/subjectMatcher.test.ts tests/unit/EducationStep.test.tsx`
  - Result: 3 files passed, 6 tests passed
- `2026-03-07`: `bunx vitest run tests/unit/authLoadingState.test.ts tests/unit/optimized-auth-routes.test.tsx tests/unit/draftAutosave.test.ts tests/unit/educationCatalog.test.ts tests/unit/subjectMatcher.test.ts tests/unit/EducationStep.test.tsx`
  - Result: 6 files passed, 20 tests passed
- `2026-03-07`: `bunx vitest run tests/unit/adminDashboardBootstrap.test.ts tests/unit/authLoadingState.test.ts tests/unit/optimized-auth-routes.test.tsx tests/unit/draftAutosave.test.ts tests/unit/educationCatalog.test.ts tests/unit/subjectMatcher.test.ts tests/unit/EducationStep.test.tsx`
  - Result: 7 files passed, 24 tests passed
- `2026-03-07`: `bun run type-check`
  - Result: passed after adding autosave server-draft creation and unblocking route guards from profile hydration
- `2026-03-07`: `bun run type-check`
  - Result: passed after removing admin dashboard dependence on profile hydration for initial metric loading
- `2026-03-07`: `bunx vitest run tests/unit/locationOptions.test.ts tests/unit/registerBodySchema.test.ts tests/unit/applicationQueriesLocationFields.test.ts`
  - Result: 3 files passed, 5 tests passed
- `2026-03-07`: `bunx vitest run tests/unit/locationOptions.test.ts tests/unit/registerBodySchema.test.ts tests/unit/applicationQueriesLocationFields.test.ts tests/unit/profileFieldMapping.test.ts tests/unit/draftAutosave.test.ts tests/unit/authLoadingState.test.ts tests/unit/adminDashboardBootstrap.test.ts tests/unit/optimized-auth-routes.test.tsx`
  - Result: 8 files passed, 29 tests passed
- `2026-03-07`: `bun run type-check`
  - Result: passed after adding residence-country support and registration profile persistence
- `2026-03-07`: `bun run scripts/bundle-api.mjs`
  - Result: 12/12 API endpoints bundled successfully after auth/applications contract changes
- `2026-03-07`: `timeout 240 bun run build`
  - Result: timed out after `tsc` completed and `vite build` started; no compile error was surfaced before termination, so this remains an environment/build-performance issue to revisit
- `2026-03-07`: `curl -s http://127.0.0.1:3002/api/health?action=ping`
  - Result: local API health endpoint returned `pong`
- `2026-03-07`: `curl -s http://127.0.0.1:5175/api/health?action=ping`
  - Result: Vite same-origin `/api` proxy returned `pong` from the local API
- `2026-03-07`: `curl -s http://127.0.0.1:3002/api/health?action=env`
  - Result: required auth/API secrets are present locally (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ARCJET_KEY`)
- `2026-03-07`: `bunx vitest run tests/unit/EducationStep.test.tsx tests/unit/PaymentStep.test.tsx`
  - Result: 2 files passed, 4 tests passed
- `2026-03-07`: `bunx vitest run tests/unit/EducationStep.test.tsx tests/unit/PaymentStep.test.tsx tests/unit/paymentFlow.test.ts tests/unit/wizardProgressSummary.test.ts tests/unit/draftAutosave.test.ts tests/unit/authLoadingState.test.ts tests/unit/adminDashboardBootstrap.test.ts tests/unit/optimized-auth-routes.test.tsx`
  - Result: 8 files passed, 30 tests passed
- `2026-03-07`: `timeout 120 bun run type-check`
  - Result: passed after the wizard upload/payment card split and copy cleanup
- `2026-03-07`: `bunx vitest run tests/unit/adminApplicationsOverview.test.ts tests/unit/adminRoleSupport.test.ts`
  - Result: 2 files passed, 3 tests passed
- `2026-03-07`: `bunx vitest run tests/unit/adminApplicationsOverview.test.ts tests/unit/adminRoleSupport.test.ts tests/unit/adminDashboardBootstrap.test.ts tests/unit/authLoadingState.test.ts tests/unit/optimized-auth-routes.test.tsx`
  - Result: 5 files passed, 18 tests passed
- `2026-03-07`: `timeout 120 bun run type-check`
  - Result: passed after wiring admin application overview totals, operational role contracts, and live admin user edit/permission APIs
- `2026-03-07`: `bunx vitest run tests/unit/contracts/actionAlignment.test.ts tests/unit/adminApplicationsOverview.test.ts tests/unit/adminRoleSupport.test.ts`
  - Result: `adminApplicationsOverview` and `adminRoleSupport` passed; `actionAlignment.test.ts` exposed a missing `/api/email` endpoint mapping in the static alignment test
- `2026-03-07`: `bunx vitest run tests/unit/adminUserService.test.ts tests/unit/api/adminUsersDeactivation.test.ts`
  - Result: 2 files passed, 3 tests passed
- `2026-03-07`: `bunx vitest run tests/unit/adminApplicationsOverview.test.ts tests/unit/adminRoleSupport.test.ts tests/unit/adminUserService.test.ts tests/unit/api/adminUsersDeactivation.test.ts tests/unit/adminDashboardBootstrap.test.ts tests/unit/authLoadingState.test.ts tests/unit/optimized-auth-routes.test.tsx`
  - Result: 7 files passed, 21 tests passed
- `2026-03-07`: `bun run scripts/bundle-api.mjs`
  - Result: 12/12 API endpoints bundled successfully after admin user deactivation changes
- `2026-03-07`: `timeout 120 bun run type-check`
  - Result: passed after wiring admin user deactivation through the frontend service, admin API, and users/bulk-actions UI
- `2026-03-07`: `bunx vitest run tests/unit/authPageFormMarkup.test.tsx`
  - Result: passed after disabling native form validation on sign-in/sign-up and renaming the password-toggle accessible label to avoid collisions with the password field label
- `2026-03-07`: `PLAYWRIGHT_BASE_URL=http://localhost:5175 bunx playwright test tests/e2e/applicationFlow.spec.ts --project=chromium --grep "invalid email format|wrong credentials"`
  - Result: invalid-email validation now passes; wrong-credentials login still fails locally because the backend returns `500 INTERNAL_ERROR` instead of `401`
- `2026-03-07`: `curl -s -i -X POST 'http://127.0.0.1:5175/api/auth?action=login' -H 'Content-Type: application/json' --data '{"email":"nobody@example.com","password":"WrongPassword1!"}'`
  - Result: local API returned `500 INTERNAL_ERROR`; API logs show missing relations `profiles`, `audit_logs`, and `login_attempts`
- `2026-03-07`: `bunx vitest run tests/unit/playwrightConfig.test.ts`
  - Result: passed after adding `PLAYWRIGHT_BASE_URL` override support to `playwright.config.ts`
- `2026-03-07`: `bunx vitest run tests/unit/serviceWorkerUpdatePolicy.test.ts tests/unit/playwrightConfig.test.ts tests/unit/authPageFormMarkup.test.tsx`
  - Result: 3 files passed, 10 tests passed
- `2026-03-07`: `timeout 120 bun run type-check`
  - Result: passed after wiring guarded service-worker auto-reload and reload fallback behavior
- `2026-03-07`: `bunx vitest run tests/integration/schemaVerification.test.ts`
  - Result: passed after restoring `001_extensions.sql` through `009_document_migration_log.sql`
- `2026-03-07`: `bun run migrations/apply-migrations.ts`
  - Result: applied the new numbered migration chain plus existing `add_*` migrations; local Neon schema now has 27 tables including `profiles`, `audit_logs`, `login_attempts`, `settings`, `email_queue`, and `user_notification_preferences`
- `2026-03-07`: `curl -s http://127.0.0.1:3002/api/health?action=env`
  - Result: local API confirms `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `ARCJET_KEY` are present after migration application
- `2026-03-07`: `curl -s -i -X POST 'http://127.0.0.1:5175/api/auth?action=login' -H 'Content-Type: application/json' --data '{"email":"nobody@example.com","password":"WrongPassword1!"}'`
  - Result: local API now returns `401 Unauthorized` with `Invalid credentials`, confirming the previous schema-driven auth `500` is resolved
- `2026-03-07`: `PLAYWRIGHT_BASE_URL=http://localhost:5175 bunx playwright test tests/e2e/applicationFlow.spec.ts --project=chromium --grep "invalid email format|wrong credentials"`
  - Result: both targeted auth/browser checks passed against the restored local stack
- `2026-03-07`: `bunx vitest run tests/unit/contracts/actionAlignment.test.ts`
  - Result: passed after adding `/api/email -> api-src/email.ts` to the frontend/backend action alignment mapping
- `2026-03-07`: `bun run scripts/bundle-api.mjs`
  - Result: 12/12 API endpoints bundled successfully after the migration-tracking and audit-query updates
- `2026-03-07`: `PLAYWRIGHT_BASE_URL=http://localhost:5175 bunx playwright test tests/e2e/applicationFlow.spec.ts --project=chromium`
  - Result: still unstable as a broad local suite because Chromium sometimes crashes at launch in this environment; use targeted browser runs/manual flows until that runner issue is isolated

## Next Session Resume Prompt

Resume from `docs/migration/codex.md`, `docs/reports/2026-03-07-claude-handover.md`, `docs/plans/2026-03-07-platform-stabilization.md`, and `docs/reports/2026-03-07-manual-remediation-status.md`.
The known implementation backlog is now largely closed. Continue with confirmation-driven work in this order:

- run manual/browser QA across the refreshed student flows (draft recovery, submission, payments, notifications, logout, settings/session management) and fix only issues that are actually reproduced
- run manual/browser QA across admin applications/dashboard/users/export/report flows, with special attention to payment-state wording, detail modals, and document labels, and fix only remaining visible gaps
- do deploy/manual confirmation on the new PWA/installability assets only if install prompts or live caching still show stale metadata after release

Already implemented:

- profile/date normalization
- draft deletion semantics and stale-draft suppression
- upload payload contract
- catalog program/institution contract
- pay-now / pay-later payment flow in the wizard
- deferred payment completion from the student payment page
- active-draft progress summary for the wizard sidebar
- server draft creation during autosave after step 1 is complete
- Zambia fallback subject catalog and exact-match subject resolution
- add-below subject entry and explicit NRC/passport document copy
- explicit academic document, identity support document, payment-details, and proof-of-payment wizard sections
- residence country/town selectors defaulting to Zambia across signup, settings, and the wizard
- signup profile persistence for phone/date/sex/residence/country/nationality/next-of-kin fields
- auth bootstrap no longer blocks guarded route render on profile hydration
- admin dashboard no longer blocks metric loading on profile hydration
- same-origin local `/api` proxy verified through the Vite dev server
- slip email delivery queue path
- admin application notification send path
- communication history API-backed view
- admin applications page totals now respect API `totalCount`
- admin user create/edit/role flows now use live `/api/admin` endpoints
- admin effective-permission inspection now reflects role-derived permissions from the backend
- admin user and bulk-user deactivation now revoke sessions and hide inactive accounts from the default users listing
- admin users page now matches the shared admin layout, persists phone data on admin-created accounts, and makes reauthentication/session-revocation effects explicit when roles or permissions change
- the student dashboard now keeps draft recovery in a single primary continue-draft surface, leaves submitted history free of duplicate draft rows, and uses canonical `/student/settings` links in quick actions and shell menus
- admin exports now include payment-review metadata plus filter-aware filenames, and analytics report exports include payment/institution/filter context in downloaded files
- routed admin application filters/cards/table/detail/toast flows now use the same canonical payment wording, and admin document labels now say `Identity Support Document` instead of `Extra KYC`
- student settings now use a unified account-management layout for profile, notification-delivery, and security/session controls
- student notifications now show delivery-number source plus portal-inbox refresh mode
- education-step uploads now use a visible required/optional checklist with clearer per-card upload status
- admin settings now uses guided operational configuration instead of only a raw add-setting workflow
- admin audit API/page now support actor/category filtering, actor metadata, live summaries, and current-view CSV/JSON/PDF export
- admin payment review now supports notes, reopen-to-review, latest review metadata, and student rejected-payment resubmission from the dashboard payments page
- PWA install metadata now ships PNG icons, wide/mobile screenshots, explicit manifest `id`, real student shortcut routes, and no dead handler declarations for unsupported routes
