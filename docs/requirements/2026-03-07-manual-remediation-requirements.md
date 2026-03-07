# Manual Remediation Requirements

Date: 2026-03-07
Owner: Codex session handoff
Source: `Issues` file plus manual testing notes from the user

## Objective

Stabilize the MIHAS application platform end to end so that:

- Student login, dashboard, wizard, draft recovery, uploads, payment, notifications, and submission flows work without refreshes or dead ends.
- Admin dashboard, applications review, payment review, users, programs, audit, settings, and exports work against current backend data.
- Cross-session continuation is possible with a single set of reference docs and a live remediation tracker.

## Non-Negotiable Outcomes

- No student or admin page should remain stuck behind skeleton loaders after successful authentication.
- Drafts must autosave, restore correctly, clear correctly, and disappear immediately after successful submission or explicit deletion.
- Draft/autosave loops must stop the moment submission succeeds so the success screen cannot recreate a local draft behind the user.
- Application creation must reuse profile and signup data consistently, with valid date formats for all HTML date inputs.
- Program selection must deterministically resolve institution selection and payment target.
- Document upload must succeed exactly once per user action and surface clear validation or server errors.
- Upload retries must only apply to transient transport/service-availability failures, not deterministic validation/auth/contract failures.
- Payment must support both immediate payment and deferred payment completion from the student dashboard.
- Student progress, profile completion, dashboard counts, and admin totals must reflect real data rather than placeholder or derived nonsense values.
- Notifications must use canonical profile phone/email data and in-app notification listing must work.
- Admin CRUD for programs, institutions, users/roles/permissions, settings, audit, and exports must map cleanly to real API capabilities.
- Export/report flows must operate on the full filtered admin dataset, not only the currently loaded page or a single fixed-size fetch.

## Requirement Groups

### R1. Auth, Session, and Loading

- Student and admin auth bootstrap must fetch session/profile state without requiring a manual refresh.
- Route guards must unblock on session resolution alone; profile hydration must not prevent student/admin pages from mounting their real data loaders.
- Admin dashboard and related admin shells must tolerate a pending profile query after session resolution instead of remaining in an initial skeleton state.
- Logout must clear local state cleanly without flicker or transient console errors.
- All authenticated sign-out entry points must share a guarded in-flight logout flow so repeated clicks do not fire overlapping sign-out requests.
- Logout must also clear user-scoped shell state such as the shared notification inbox immediately, so another user or the signed-out shell does not briefly display stale notification counts.
- Session management must create tracked sessions at authentication time, list active sessions, revoke sessions safely, preserve the current device during “revoke others”, and surface correct data in student settings.
- Session-management UI actions must use the same CSRF-aware client/service layer as the rest of the app; raw fetch calls must not be used for revoke actions against `/api/sessions`.
- Student settings must present profile details, notification-delivery context, and active-session management as one coherent account surface rather than fragmented pages with inconsistent layouts.
- Student account navigation must converge on `/student/settings`, and older student profile/settings aliases should redirect there instead of splitting account management across multiple URLs.
- Local/browser QA must preserve same-origin `/api` semantics, and auth-backed local verification requires provisioned API env secrets plus a schema-compatible MIHAS database.

### R2. Drafts, Autosave, and Submission State

- Autosave must persist local draft state immediately and server draft state when an application exists.
- Once the first-step application identity/program data is complete, autosave must create the server-side draft without waiting for a manual next/save action.
- Draft deletion must delete by application id, not by user id.
- Local draft validation must clear browser drafts on definitive stale-state responses (`401`, `403`, `404`, deleted/non-draft application state, or another user’s draft) while preserving the browser copy only for transient/network failures.
- Submission must remove all draft UI, local draft storage, and stale “continue application” surfaces.
- Autosave timers, keyboard-save shortcuts, and interval-based draft persistence must all disable after submission success.
- The student dashboard should expose one primary draft recovery surface at a time; submitted-application history should not duplicate the same draft card/list entry in parallel.
- Submission success UI must dismiss slip-generation overlays and keep only the final success state.

### R3. Profile, KYC, and Data Population

- `date_of_birth` values shown in HTML date inputs must always be `yyyy-MM-dd`.
- Profile completion must reflect the actual student profile fields used by the app.
- Signup data, profile data, and wizard KYC defaults must populate the same canonical fields.
- Residence country must be stored separately from nationality and default to `Zambia`.
- Town/city and country inputs must move to catalog-backed selectors driven by a global location dataset, defaulting to Zambia while still allowing manual town entry when needed.
- New-account registration must persist the same profile fields that the settings page and wizard auto-population logic consume on the next screen load.

### R4. Wizard UX and Data Integrity

- Wizard labels, alignment, required field messaging, and autosave affordances must be consistent.
- Education subject entry must allow adding the next subject in place without scrolling to the top.
- Zambia subject catalog must include legacy and current subject variants.
- Upload requirements must distinguish result slip, NRC/passport identity documents, and proof of payment with clear intent.
- The stored `extra_kyc` document slot may remain as a backend/storage key, but all user-visible student/admin copy must describe it as an `Identity Support Document` rather than generic `Extra KYC`.
- Payment entry must clearly separate payment details from proof-of-payment upload, and the pay-later branch must point users back to the dashboard payments section.

### R5. Payments

- Student payment step must support `pay now` and `pay later`.
- Students must be able to finish payment later from the dashboard payments page.
- Rejected payments must remain resubmittable from the student payments page instead of being trapped in terminal history.
- Student payment surfaces must distinguish `awaiting payment`, `awaiting review`, and `verified` states so already-submitted proof is never presented as if payment still has not been attempted.
- Student dashboard, payment, application detail, application status, and timeline surfaces must all use the same payment-state vocabulary and the same “student action required” rule (`not_paid` or `rejected`, not `pending_review`).
- Payment review by admins must patch payment status without server errors, capture review notes, and support reopening a rejected payment back to review.
- Admin payment tools must distinguish unpaid (`not paid yet`) applications from `pending_review` applications where proof has already been submitted.
- Admin queue summaries and filter copy must use labels that match those distinct payment states.
- Admin application cards, tables, filters, detail modals, export metadata, and payment-update toasts must all reuse that same canonical payment wording instead of raw enum strings.
- Payment-related notifications, receipts/slips, and dashboard status badges must stay in sync.

### R6. Catalog, Program, Institution

- Program responses must include institution linkage.
- Admins must be able to CRUD institutions and programs with correct relationships.
- Program selection in the student wizard must always update the institution display and payment target.

### R7. Notifications and Communication

- Notification preferences must return canonical phone/contact data.
- In-app notifications list, read, delete, and student-facing visibility inside the notifications settings surface must work.
- Student inbox actions must use the canonical notifications service so read, mark-all-read, delete, and “open related update” flows work against CSRF-protected endpoints.
- The notification bell and the full student notifications page must share the same inbox state so unread counts and read/delete actions stay synchronized immediately.
- Notification preferences must clearly show which phone number is currently used for delivery and whether that value came from the notification preferences record or the canonical profile.
- The student notifications surface must explain how the portal inbox refreshes so an empty inbox does not look like a broken feature.
- Communication history in admin application review must show persisted records rather than a stubbed empty state.
- Emailing the application slip must validate payloads and succeed for submitted applications.
- Student dashboard, application detail, and application status pages must all use the canonical slip generation/email flow for application-slip actions instead of mixing legacy document paths.

### R8. Admin Operations

- Admin dashboard counts and pagination must use real totals from the applications table.
- Users page must support user creation, edit, role assignment, persisted permission overrides, effective-permission inspection, and account deactivation through live API endpoints.
- Admin-created users must persist core contact data such as `phone`, and the users page must explain that role or permission changes revoke active sessions and require reauthentication.
- Permission overrides must be stored explicitly, must fall back to role defaults when absent, and must force reauthentication so changed access takes effect on the next session.
- Audit page must read current audit logs, support actor/action/category/entity/date filtering, and present live summaries from the backend rather than client-only placeholders.
- Settings must expose guided operational controls for portal/contact/admissions behavior first, with raw advanced keys treated as a secondary workflow.
- Export to PDF/Excel/CSV must return real data with correct filters and counts, and audit exports must support CSV/JSON/PDF for the visible result set.
- Application export payloads must include the payment and grade fields the frontend exporters expect (`paid_amount`, grade summary, subject counts, and points/best-five equivalents) so exported files match on-screen admin data.
- Application exports must also include the latest payment-review context needed by finance/admin operations, including review timestamp, reviewer identity, notes, and the latest payment reference where available.
- Analytics report generation must support the same real dataset across PDF, Excel, CSV, and JSON outputs.
- Analytics/report exports must carry applied-filter context plus payment and institution breakdowns so downloaded reports remain interpretable outside the live UI.
- Admin dashboard cards and report labels must distinguish the decision queue (`submitted` + `under_review`) from payment proof review, and payment breakdowns must use labels that match the canonical status model (`awaiting payment`, `awaiting proof review`, `rejected proof`, `verified`).
- User export must support the same operational expectations: active-only vs include-inactive scope, canonical residence fields, and filter-aware filenames across supported formats.

### R9. PWA and Caching

- Service worker behavior must not hide fresh data or require hard refreshes to see post-login changes.
- Manifest icons and PWA metadata must pass installability checks.
- The manifest must ship valid raster install icons and both wide and mobile screenshots for richer install UI.
- The manifest must not advertise protocol handlers, file handlers, share targets, or shortcut routes that do not exist in the application.
- Update prompts must reload intentionally, not force disruptive refresh behavior.

### R10. Auth Entry Clarity

- Sign-in and sign-up screens must be clearly differentiated for returning applicants versus first-time applicants.
- Sign-up must explicitly communicate that it creates the portal account first, while programme/application details are completed after sign-in.
- Form labels on auth pages must use account-specific wording (`account email`, `account password`, `create password`) so the action being taken is unambiguous.

## Current Confirmed Root Causes

- Draft deletion/update logic is using `userId` in `/api/applications?id=...` calls where an application id is required.
- Profile and wizard date inputs receive ISO timestamps instead of HTML date strings.
- Profile completion logic counts `city` and `address` instead of the canonical `residence_town` field.
- Program catalog responses do not currently carry institution relationship data needed by the wizard.
- Program create/update handlers do not persist institution linkage.
- Upload clients send multipart form data while the documents API currently validates JSON/base64 payloads.
- Notification preferences do not return the current profile phone number expected by the student UI.
- Communication history is currently a stub on the admin side.
- Wizard autosave only creates a browser draft until the user manually advances, which keeps server draft counts at zero.
- Auth route loading currently waits on profile hydration, which can delay student/admin page mount after login.
- Subject matching is overly broad and can map `Mathematics` to `Additional Mathematics`.
- Education/upload screens still use generic “extra KYC” language and top-only subject insertion, which obscures the intended identity-document flow.
- Admin dashboard loading still gates on `profile`, so the page can remain in a skeleton even after the authenticated admin session is already known.
- Local same-origin browser QA is now wired through the Vite `/api` proxy, the required auth secrets are present locally, and the missing baseline database schema has been restored through the migration chain.
- Service worker update handling currently promotes cached assets without guaranteeing a safe reload path, which is why users can see stale auth/dashboard shells until they refresh manually.
- The manifest currently relies on SVG-only install icons, has no install screenshots, uses outdated student shortcut routes, and advertises `/handle`, `/upload`, and `/share` capabilities that do not exist in the app.
- The auth entry screens currently present sign-in and sign-up as near-identical actions, and the sign-up page does not clearly state that it creates an account before the application workflow begins.
- The current local API env now has the required secrets and restored schema parity, so auth-backed local QA should use the Vite proxy stack as the default verification path.
- Auth tokens originally had no stable tracked-session identity, so session revocation/current-device UX could not stay aligned with `device_sessions`.
- The shared slip service previously emitted a global “Generating slip” info toast on every slip request, which could keep the student submission/slip surface looking active after completion.
- Local draft restore code paths previously treated every application-status lookup failure as transient, so stale browser drafts could survive submission/deletion or even a different user signing in on the same device.
- Authenticated shell menus originally fired repeated `signOut()` calls without any shared in-flight guard, which made logout more prone to flicker and brief transient errors.
- Student session-management and notification inbox actions previously bypassed the CSRF-aware client layer, so revoke/read/delete operations could fail even though the APIs were already implemented.
- Upload handling previously retried every failure class recursively, which turned deterministic upload errors into repeated browser/API attempts instead of a single actionable failure state.
- Registration currently accepts only `email/password/name` on the backend, so the signup page’s extra profile fields are discarded and cannot auto-populate the first application correctly.
- The student data model currently treats `nationality` as the only country-like field, so residence country cannot be captured or reused distinctly across signup, settings, and wizard flows.
- Admin application totals currently default to the loaded page length instead of the API pagination total.
- Admin users page originally exposed edit/permissions controls that were not backed by real API endpoints.
- Shared admin role validation and permission mappings originally omitted the operational staff roles used by the frontend users page.
- The users-page permissions dialog was originally read-only because the service layer rejected writes and the admin API had no persisted override endpoint.
- Auth token/session refresh originally embedded role-default permissions only, so any future writable permission UI would have left users on stale access until token expiry.
- Payment review decisions originally had no persistent reviewer note path, list/detail APIs did not return the latest payment review metadata, and rejected payments were excluded from the student resubmission queue.
- Admin payment presentation originally mapped `null` payment states into `pending_review`, which hid the distinction between pay-later/unpaid applications and proofs already awaiting review.
- Wizard autosave originally remained active after a successful submission because the success screen reused the mounted controller tree, which allowed a fresh local draft to be recreated immediately after cleanup.
- Student document surfaces originally mixed the canonical slip service with the older raw-fetch document generator, so dashboard/detail/status pages could diverge on slip download/email behavior.
- The admin applications export endpoint originally returned a thinner row shape than the frontend export utilities expected, so paid amounts and grade-derived fields exported incorrectly or as zeros.
- The analytics report generator originally summarized only a single fetch window instead of paging through the full admin dataset, which made larger reports incomplete.

## Acceptance Criteria

- Student can sign in, create/edit/submit an application, pay now or later, upload files once, receive notifications, and see accurate dashboard state without a page refresh.
- Admin can sign in, see correct dashboard counts, review applications and payments, inspect communication history/audit, manage users/programs/institutions/settings, and export data.
- `bun run test`, `bun run type-check`, and targeted flow tests for remediated areas pass before claiming completion.
