# Manual Remediation Design

Date: 2026-03-07
Owner: Codex session handoff

## Design Goal

Reduce the current failure surface by consolidating around a few canonical data contracts:

- One canonical auth/session bootstrap flow.
- One canonical draft lifecycle.
- One canonical profile field mapping.
- One canonical residence-country and town model.
- One canonical upload payload format.
- One canonical catalog model for program -> institution.

## System Design Decisions

### 1. Canonical Auth Bootstrap Flow

Route protection and shell loading should depend on session state only.

Rules:

- `auth.loading` blocks on the session query, not on profile hydration.
- Profile fetches may continue in parallel after a user is known.
- Student/admin pages should mount their own data loaders as soon as the session is resolved.
- Admin pages must treat profile data as enrichments for display, not as a prerequisite for loading metrics or core page state.
- All authenticated logout buttons/menus should call one guarded in-flight sign-out action so only one logout request/state-clear sequence runs at a time.
- Auth cookies and tracked sessions must stay aligned:
  - login/register create a `device_sessions` row
  - access/refresh JWTs carry `sid`
  - refresh preserves the same `sid` when possible
  - logout deactivates the current `sid`
  - authenticated API middleware rejects tracked sessions that are revoked or expired

### 1.3 Canonical Session Actions

Session-management UI should use the same CSRF-aware service layer as the rest of the authenticated app.

Rules:

- Session list/revoke/revoke-all actions should go through a shared session service backed by the canonical API client.
- Raw `fetch` calls should not be used for student security actions because `/api/sessions` is CSRF-protected and should behave consistently with other authenticated endpoints.
- Session cards should expose enough device metadata to distinguish the current device from stale/unknown sessions.
- The student settings page should present profile fields, notification-delivery guidance, and active-session controls in one coherent account-management surface.
- Student-facing account entry points should resolve to one canonical route, `/student/settings`; legacy aliases such as `/settings` and `/student/profile` should redirect there for compatibility instead of behaving like parallel account surfaces.
- Sign-out should emit one shared client-side completion signal so module-level student shell stores (for example the shared notifications inbox) can clear immediately instead of waiting for a later remount.

### 1.1 Local Verification Topology

Local browser QA should preserve same-origin auth semantics:

- Frontend dev server should expose `/api/*` through the same origin as the app.
- If the API runs on a separate local port, the frontend must proxy `/api/*` to it in development.
- Without that proxy, local browser auth reproduction is misleading because the app intentionally rejects cross-origin API bases for cookie correctness.
- The current local topology is verified on `http://127.0.0.1:5175 -> http://127.0.0.1:3002`, and Playwright now supports `PLAYWRIGHT_BASE_URL` override so the same stack can be reused in future sessions.
- Auth-backed local QA now reaches the API with the required secrets and restored schema parity, so login/register verification is no longer blocked by missing tables.
- Broader local browser QA should still prefer targeted flows while the intermittent Chromium launch crash on larger Playwright runs is isolated.

### 1.2 Service Worker Update Activation

Service worker cache activation must distinguish between low-risk shells and in-progress form routes:

- When the worker sends `cache-updated` on low-risk routes (auth screens, public routes, dashboards), the app should perform a guarded one-time auto reload so fresh bundles are visible immediately.
- When the worker activates on form-heavy routes (`/apply`, settings, payment flows), the app should surface an update prompt instead of forcing a reload that could interrupt unsaved work.
- If an activated update exists without a waiting worker, the prompt action should still perform a normal page reload rather than becoming a dead button.

### 1.4 Installable Manifest Contract

The install surface must only advertise capabilities the app actually supports:

- `public/manifest.json` shortcuts should target real guarded routes such as `/student/dashboard` and `/student/application-wizard`, while `/apply` remains only as a compatibility alias.
- Install assets should include raster PNG icons plus both wide and mobile screenshots so Chromium installability checks can pass on desktop and mobile.
- Unsupported manifest capabilities should be removed until implemented. In the current repo that means no `protocol_handlers`, `file_handlers`, or `share_target` declarations because the app has no matching `/handle`, `/upload`, or `/share` routes.
- `src/hooks/usePWA.ts` must recognize the same shortcut ids the manifest declares so runtime shortcut launches and install metadata stay aligned.
- Generated install assets should stay reproducible via `scripts/generate-pwa-assets.mjs` instead of being maintained as opaque binary-only changes.

### 1.5 Auth Entry Screen Semantics

The auth entry points should make the applicant's next action obvious:

- Sign-in should be framed as the returning-applicant path for people who already created an account and want to continue drafts, payments, or status tracking.
- Sign-up should be framed as account creation only, with explicit copy that programme/application details come later after sign-in.
- The shared auth layout can stay reusable, but it should support variant-specific hero copy, mobile summaries, and form badges so sign-in and sign-up do not feel interchangeable.
- Sign-up fields should be grouped into named sections (`portal access`, `profile basics`, `residence and identity`, `emergency contact`) to reduce ambiguity between account setup and later application steps.

### 2. Canonical Student Draft Model

The draft system should treat the browser draft and server draft as two views of the same entity:

- Local draft key: `applicationWizardDraft`
- Local draft payload:
  - `applicationId`
  - `currentStep`
  - `currentStepKey`
  - `formData`
  - `selectedGrades`
  - `savedAt`
  - `version`
- Server draft entity:
  - the latest `applications.status = 'draft'` row owned by the user

Rules:

- Local save happens first.
- Local draft payload should also include `userId` so a different signed-in user on the same browser does not inherit the prior applicant’s draft.
- Once step 1 has enough data to identify the application, autosave creates the server draft immediately.
- Server save only happens when `applicationId` exists.
- Draft delete enumerates the user’s draft application ids, then deletes those application ids.
- Browser-draft validation should clear the local draft on definitive stale-state signals:
  - server says the linked application is no longer `draft`
  - `401` / `403` / `404`-class status checks
  - explicit user mismatch via the stored `userId`
- Browser-draft validation should keep the local copy only for retryable/transient failures, not every failed lookup.
- Successful submission clears both stores and raises a dashboard refresh event.
- Successful submission must also disable autosave timers, keyboard/manual save shortcuts, and any interval-based draft persistence still mounted in the wizard tree.
- Submission events should optimistically clear local draft-facing UI before the follow-up dashboard refetch completes.
- The student dashboard should present the draft lifecycle through a single primary continue/recover surface; submitted-application history should remain a submitted-history view instead of rendering duplicate draft cards alongside the main continue prompt.

### 3. Canonical Profile Field Mapping

Canonical student fields:

- `full_name`
- `phone`
- `date_of_birth`
- `sex`
- `residence_town`
- `nationality`
- `next_of_kin_name`
- `next_of_kin_phone`

Mapping rules:

- Metadata and profile data must both resolve into those exact keys.
- HTML `date` inputs always receive `yyyy-MM-dd`.
- Profile completion is computed from the canonical fields above, not legacy aliases alone.

### 3.1 Canonical Residence Location Model

Canonical residence location fields:

- `country`
- `residence_town`

Rules:

- `country` represents the applicant’s current country of residence and must not be overloaded with `nationality`.
- The UI defaults `country` to `Zambia`.
- Country options and town/city suggestions come from a reusable global location catalog that is lazy-loaded so it does not inflate the initial auth/dashboard bundles.
- Town/city entry remains editable text with dropdown suggestions so users are not blocked if a location variant is missing from the dataset.
- Signup, settings, profile hydration, draft autosave, and application create/update must all read and write the same `country` field.

### 4. Canonical Upload Contract

The current documents API validates a JSON payload containing:

- `file`
- `fileName`
- `contentType`
- `applicationId`
- `applicationNumber`
- `documentType`
- `userId`

Frontend upload code should therefore:

- Convert `File` to base64 once.
- Send JSON to `/api/documents?action=upload`.
- Include `userId` and `applicationId` consistently in application-document uploads.
- Avoid multipart unless the backend explicitly adds multipart parsing.
- Retry only after a classified transient failure, not on every validation mismatch.
- Retry budgets should stay intentionally low so deterministic backend failures do not flood the API or confuse the user with repeated upload attempts.

### 4.1 Slip Generation Feedback

Slip generation should be owned by the calling screen, not by a global shared-service info toast.

Rules:

- The shared slip service may emit success/warning/error outcomes.
- It should not emit a generic long-lived “Generating slip” info toast on every request.
- Submission success and application-detail screens should rely on their own local loading state so a stale global toast cannot outlive the originating interaction.
- Student dashboard cards, application detail, and application status pages should all route application-slip download/email actions through the same canonical slip service wrapper rather than mixing that flow with the legacy generic document generator.

### 5. Canonical Catalog Contract

Student wizard and admin programs pages need:

- `program.id`
- `program.name`
- `program.institution_id`
- `program.institutions`
  - `id`
  - `name`
  - `full_name`

Catalog handlers must:

- join `programs` to `institutions` for read operations
- persist `institution_id` on create/update
- expose institution CRUD for admin flows
- keep institution management on the same admin catalog surface as program management so admins do not dead-end while configuring a new program

### 6. Payment Flow Design

Introduce explicit payment intent in the wizard:

- `pay_now`
- `pay_later`

Behavior:

- `pay_now`: requires payment method, amount, and proof upload before submission.
- `pay_later`: allows submission with a pending payment state, surfaces a dashboard payment task, and blocks approval until payment is verified.
- The payment step UI must visually separate payment-details entry from proof-of-payment upload so users can tell what must be completed before submission review.
- The pay-later branch must clearly state that payment is completed later from the student dashboard payments section.

Recommended statuses:

- `null` payment status for unpaid/deferred payment, to avoid immediate schema churn
- `pending_review`
- `verified`
- `rejected`

Admin/UI modeling rules:

- Backend storage keeps unpaid/deferred applications at `payment_status = null`.
- Admin-facing list/filter surfaces should map `null` to an explicit `not_paid` display/filter state instead of collapsing it into `pending_review`.
- Admin summary cards should expose separate counts for decision queue, proof-review queue, and payment follow-up so operational staff can tell whether action is required from admissions/finance or from the student.
- Payment review decisions should capture reviewer notes in the audit trail, with rejection reasons required for `rejected`.
- Application list/detail reads should expose the latest payment review metadata (reviewer identity, reviewed-at timestamp, latest note) so admin/student surfaces can explain the current payment state without extra stub logic.
- Rejected payments remain actionable from the student payments page and can be resubmitted or reopened to `pending_review` by admin review tools.
- Student payment surfaces should group applications into:
  - `payment action required`: `not_paid` or `rejected`
  - `payment under review`: `pending_review`
  - `payment history`: `verified`
- Student dashboard summary cards, application detail/status views, and timeline events should reuse the same canonical payment labels and the same `requires student payment action` rule, rather than deriving slightly different interpretations per page.

### 7. Notification Design

Notification preferences response should include:

- canonical preference toggles
- canonical contact info (`phone`, `email`)
- consent timestamps

Communication history should be driven by persisted notification/audit/email queue records rather than a frontend stub.

The student notifications settings surface should also expose:

- canonical phone fallback from the profile when preferences omit it
- an explicit label for the current delivery-number source (`notification preferences` vs `profile`)
- recent in-app notifications so “portal inbox” behavior is visible without relying only on the header bell
- a visible inbox refresh-state explanation (`live push`, `auto-refresh`, or `manual refresh`) so an empty inbox does not look like a broken feature
- push-notification controls in the same settings area
- read/open/delete actions that use the canonical notifications service rather than ad hoc fetch helpers, so CSRF-protected inbox actions behave the same way as other authenticated mutations
- a shared inbox state model between the header bell and the full notifications page, so unread counts and optimistic read/delete mutations do not diverge across surfaces

### 8. Wizard Education/KYC Boundary

The education step should distinguish academic evidence from identity evidence:

- Grade 12 result slip is the academic document for subject extraction/verification.
- NRC/passport upload is an optional identity support document, not a second generic “KYC bucket”.
- Subject addition should happen inline below the existing list so the user never has to scroll back to the top to continue entering results.
- Zambia fallback subjects should remain available even when the backend catalog is incomplete, while still preserving API ids for known subjects.
- The upload surface should be split into explicit cards/headings and a required/optional checklist so academic evidence and identity support documents are not visually conflated.

### 9. Admin Data Surfaces

Admin pages should consume explicit service-layer contracts instead of partial stubs:

- users: list + role update + permission update
- programs: list/create/update/delete + institution CRUD
- settings: guided operational controls first, advanced keys second
- audit: actor-aware filters + backend totals + live category/entity/action breakdowns + timeline
- exports: filtered result set + generated file download, with audit supporting current-view CSV/JSON/PDF export

### 9.1 Admin Applications Totals

Admin application summary cards must use pagination metadata rather than the current page length:

- `total` comes from the API `totalCount`
- page-local status metrics may still derive from the loaded result set when the UI is scoped to the visible page/filter
- any “all applications” wording must never be backed by `applications.length` while pagination is active
- any dashboard surface using `pendingApplications` should present it as the admin `Decision Queue`, because that metric represents submitted-plus-under-review applications rather than payment proof awaiting review

### 9.2 Admin User Management Model

The base authorization model remains role-first, but the admin platform now supports explicit per-user permission overrides.

Rules:

- every user still has a canonical `role`
- default permissions come from the static role map
- optional overrides are stored in `user_permission_overrides.permissions`
- auth login/register/session/refresh/roles must resolve effective permissions as:
  - override permissions when an override row exists
  - otherwise role-default permissions
- role or permission changes must revoke active sessions so the next sign-in receives updated JWT claims
- if the override table has not been migrated yet, read paths must fail open to role-default permissions and admin write paths must return a clear migration-required error

### 9.3 Canonical Export Contract

Admin export/report flows should share a consistent dataset contract.

Rules:

- Application export rows should include the frontend’s expected payment and grade fields:
  - `paid_amount`
  - `grades_summary`
  - `total_subjects`
  - `points`
- Application export rows should also include the latest payment-review context exposed elsewhere in admin UI:
  - payment review timestamp
  - payment reviewer name/email
  - latest payment review notes
  - latest payment reference
- Admin application CSV/Excel/PDF export should stream the full filtered result set, not only the currently loaded page.
- Analytics report generation should page through the full admin dataset before computing summary metrics.
- Report formats (`pdf`, `excel`, `csv`, `json`) should all be generated from the same normalized report payload so counts and ratios do not drift by format.
- Report metadata should include applied filters plus institution/payment breakdown sections so downloaded artifacts preserve the operational context visible in the admin UI.
- Payment status labels in report metadata should map the canonical backend model directly:
  - `not_paid` -> `Awaiting Payment`
  - `pending_review` -> `Awaiting Proof Review`
  - `rejected` -> `Rejected Proof`
  - `verified` -> `Verified`
- User-export artifacts should follow the same rule: filter-aware filenames, explicit active-vs-inactive scope, and canonical residence-field labels (`Residence Country`, `Residence Town`) instead of relying only on older `city`/`nationality` terminology.

Operational requirements for the current users page:

- create user via `/api/admin?action=register`
- admin user creation should persist canonical contact fields such as `phone` during registration instead of dropping them until a later edit
- update identity/contact/role via `/api/admin?action=users`
- inspect and update effective permissions via `/api/admin?action=user-permissions`
- user removal should be implemented as account deactivation (`profiles.is_active = false`) plus session revocation, not a destructive hard delete
- user listing should default to active accounts so deactivated users disappear from the main operational view
- the users page should use the shared admin `Container`/`PageHeader`/`SectionCard` layout model so it matches the rest of the admin console
- the permissions dialog should show:
  - current access source (`role` vs `override`)
  - the post-save access source implied by the current selection
  - an explicit note that saving revokes active sessions and forces reauthentication
  - a direct “reset to role defaults” action so admins can intentionally remove overrides instead of approximating that state manually

## Sequencing Rationale

1. Fix auth bootstrap, profile/date, draft, upload, and catalog root causes first because they affect multiple reported issues at once.
2. Fix payment state model next because submission, dashboard, and admin review all depend on it.
3. Add the canonical residence-country model and persist signup profile fields so account creation and wizard defaults stop diverging.
4. Tighten wizard education/KYC boundaries and autosave semantics before broader UI polish.
5. Fix notifications/admin tools after the core student journey is stable.
6. Finish with remaining shell/export edge cases and deploy-time installability confirmation.

## Key Files

- Frontend
  - `src/hooks/useProfileAutoPopulation.ts`
  - `src/hooks/useResidenceLocationOptions.ts`
  - `src/lib/locationOptions.ts`
  - `src/pages/student/Settings.tsx`
  - `src/pages/auth/SignUpPage.tsx`
  - `src/pages/student/applicationWizard/hooks/useWizardController.ts`
  - `src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts`
  - `src/lib/applicationSession.ts`
  - `src/lib/draftManager.ts`
  - `src/lib/storage.ts`
  - `src/services/client.ts`
  - `src/services/documents.ts`
  - `src/services/catalog.ts`
  - `src/pages/student/Payment.tsx`
  - `src/pages/student/NotificationSettings.tsx`
  - `src/pages/admin/Applications.tsx`
  - `src/pages/admin/lib/applicationsOverview.ts`
  - `src/pages/admin/Users.tsx`
  - `src/services/admin/users.ts`

- Backend
  - `api-src/applications.ts`
  - `api-src/auth.ts`
  - `api-src/documents.ts`
  - `api-src/catalog.ts`
  - `api-src/notifications.ts`
  - `api-src/admin.ts`
  - `lib/validation/auth.ts`
  - `lib/validation/documents.ts`
  - `lib/validation/applications.ts`
  - `lib/validation/admin.ts`

## Risks

- Existing workspace changes in several backend and wizard files may overlap with remediation work.
- Introducing `pay_later` requires careful backend status compatibility to avoid breaking admin review.
- Catalog changes may require database schema alignment if `institution_id` is nullable or absent in some rows.
