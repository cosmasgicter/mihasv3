# Beanola Production Readiness Follow-Up Plan

Created: 2026-06-14  
Owner: Beanola Technologies  
Objective: take the migrated multi-school admissions platform from code-complete to production-ready, with canonical data flow, no drift, mobile-first UI polish, and operational confidence.

## Operating Standard

Beanola owns the platform. MIHAS, KATC, and every future institution are tenants, not platform identity. All product defaults, metadata, API docs, emails, public pages, admin routes, and unauthenticated surfaces must say Beanola unless they are rendering tenant-owned data from an explicit tenant configuration row.

Interpret "conical" as **canonical**. The production system must have exactly one authoritative source for every business concept. Any frontend mirror must be generated from, imported from, or drift-guarded against that source.

This plan is written for an agentic LLM or engineer. Execute in order. Do not mark production-ready until every exit criterion passes.

## Non-Negotiables

1. No platform default may reference MIHAS, KATC, Mukuba, Kalulushi, `mihas.edu.zm`, `katc.edu.zm`, or legacy MIHAS API/app domains.
2. Tenant references are allowed only as seeded tenant data, historical archived docs, legacy compatibility code with a named guard, or dev/PDF preview fixtures that cannot reach official document download paths.
3. Students apply program-first. Institution assignment, fees, required documents, official document templates, logos, signatures, and settlement metadata come from backend tenant configuration.
4. Regular admins see only scoped data. Out-of-scope reads return the same not-found shape as missing resources.
5. Official documents are backend-generated, backend-stored, fingerprinted, and versioned. Frontend PDFs are preview-only.
6. Mobile is the primary UI target. Every student and admin workflow must work on a 360px wide viewport without overlap, truncation, dead buttons, or hidden required actions.
7. Production deployment requires database backup, migration dry-run, migration apply, validation SQL, smoke tests, monitoring checks, and rollback notes.

## Current Known State

Already done in code:

- Beanola runtime branding replaced across public landing/contact/footer, backend emails, API root, OpenAPI metadata, admin route, and shared app chrome.
- Brand drift guards exist on frontend and backend.
- Tenant document profiles, tenant-aware official documents, document freshness/dedup guards, access scope guards, and unscoped endpoint guards exist or are staged as new tests.
- Frontend type-check, lint, build, brand guard, contact tests, authenticated title tests, and backend email/API/brand/admin route targets pass locally.

Known remaining production-readiness work:

- Production schema application is still a gated operator step.
- Active source still has allowlisted tenant PDF preview data for MIHAS/KATC.
- Several docs, historical specs, and test fixtures still use old names.
- Need a full UI/UX audit across every route and mobile breakpoint.
- Need a canonical truth map refresh after the latest branding/admin-route/settings changes.
- Need an end-to-end proof that database, backend API, frontend services, and UI state are aligned.

## Definition Of Done

The platform is production-ready only when all of these are true:

- `docs/canonical-truth-map.md` accurately maps every domain concept to its one source of truth.
- `docs/legacy-brand-allowlist.json` contains only reviewed, justified tenant/legacy/preview exceptions.
- `rg` scans prove no non-allowlisted legacy branding remains in active runtime source/config.
- All tenant migrations are applied to staging and production, with validation evidence captured.
- Every API endpoint that returns tenant data is scope-reviewed and covered by a scoped access test.
- Every frontend service response shape matches backend serializers and OpenAPI schema.
- Every route has a mobile-first QA pass on 360px, 390px, 768px, 1024px, and desktop.
- Every critical workflow has a smoke test or documented manual smoke script.
- Build, lint, type-check, backend tests, frontend tests, and production smoke checks pass.
- Monitoring, backups, error reporting, alert email, CORS, cookies, and deploy env vars are verified.

## Phase 1: Freeze The Canonical Architecture

Goal: remove ambiguity before touching more code.

Tasks:

1. Update `docs/canonical-truth-map.md` for the latest Beanola branding changes:
   - Platform brand source of truth.
   - Tenant brand source of truth.
   - Django admin route source of truth: `/beanola-admin-panel/`.
   - Product tenant-admin UI route source of truth: `/admin/tenants`.
   - Email sender/default contact source of truth.
   - OpenAPI metadata source of truth.
   - Brand allowlist source of truth.
2. Add a "No New Mirrors Without Guard" section:
   - Any enum, status, error code, document type, route name, role, permission, payment state, or tenant scope used by both frontend and backend must have a guard.
3. Create a canonical registry checklist:
   - Application lifecycle.
   - Payment lifecycle.
   - Tenant/institution identity.
   - Canonical program/offering/intake assignment.
   - Document profile/document generation.
   - Staff scopes and grants.
   - Communications templates.
   - Feature flags.
   - Public routes and SEO metadata.
4. Review every "legacy fallback" branch:
   - It must be named as legacy.
   - It must be tested.
   - It must not run for new canonical records.
   - It must have a planned removal condition.

Exit criteria:

- Canonical truth map has no stale MIHAS platform language.
- Every cross-layer mirror has either a guard test or an explicit backend-only note.
- New agent can identify the source of truth for any concept in under 30 seconds.

## Phase 2: Brand And Tenant Boundary Cleanup

Goal: finish the branding migration without destroying legitimate tenant data.

Tasks:

1. Run these scans:
   - `rg -n "MIHAS|KATC|Mukuba|Kalulushi|mihas\\.edu\\.zm|katc\\.edu\\.zm|apply\\.mihas|api\\.mihas|mihas-admin-panel|beanola-logo\\.svg" apps/admissions/src backend/apps backend/config apps/admissions/index.html`
   - `rg -n "MIHAS Admissions|MIHAS-KATC|admin@mihas|noreply@mihas|info@mihas|info@katc" apps/admissions/src backend/apps backend/config`
2. Classify every hit:
   - Production platform default: must be removed.
   - Tenant fixture/seed: allowed only with allowlist reason.
   - Dev/PDF preview: allowed only if not reachable from official paths.
   - Historical docs/archive: allowed outside runtime guard scope.
   - Test fixture: allowed only if the test intentionally validates tenant/legacy behavior.
3. Tighten `docs/legacy-brand-allowlist.json`:
   - Remove any stale entries.
   - Add no broad directories.
   - Every entry must state why it cannot be removed yet.
4. Decide the future of frontend PDF preview:
   - Option A: keep MIHAS/KATC preview data as tenant sample fixtures.
   - Option B: replace preview sample schools with neutral Beanola demo tenants.
   - If Option B, update PDF tests, preview harnesses, theme fixtures, and allowlist.
5. Update active docs and runbooks:
   - Replace platform references with Beanola.
   - Keep archived audit reports untouched if clearly historical.

Exit criteria:

- Brand drift guards pass.
- Active runtime/config scan has only reviewed tenant preview exceptions.
- No broken Beanola logo paths exist.

## Phase 3: Database Production Rollout Readiness

Goal: prove database state is safe, applied, and aligned with code.

Tasks:

1. Verify migration discovery:
   - `cd backend`
   - `DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py apply_sql_migrations --dry-run`
   - Confirm all pending multi-tenant scripts are discovered in correct order.
2. On Neon staging branch:
   - Apply migrations.
   - Reapply migrations to prove idempotency.
   - Run validation SQL from `docs/runbooks/multi-tenant-beanola-rollout.md`.
3. On production, only after explicit operator approval:
   - Take DB backup.
   - Verify backup non-empty and restorable.
   - Run migration-history prerequisite checks.
   - Run dry-run.
   - Apply.
   - Run validation SQL.
   - Validate FK constraints if all rows are linked or documented as exceptions.
4. Produce a production DB evidence block:
   - Migration names applied.
   - `migration_history` rows and checksums.
   - Counts: institutions, canonical programs, offerings, intakes, applications with canonical IDs, unlinked legacy rows.
   - Duplicate domain/slug checks.
   - Scope tables counts.
   - Document profile counts.
5. Confirm legacy applications remain readable:
   - Applications with null canonical IDs.
   - Applications with old string snapshots.
   - Old generated documents.
   - Old payments and receipts.

Exit criteria:

- Staging evidence is complete.
- Production evidence is complete after operator apply.
- No destructive schema changes were used.
- All migration scripts are recorded in `migration_history`.

## Phase 4: Backend API Contract Audit

Goal: make the backend a single, predictable contract.

Tasks:

1. Generate OpenAPI:
   - `cd backend`
   - `DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py spectacular --file /tmp/openapi.yaml`
2. Compare frontend service methods to backend endpoints:
   - Auth.
   - Profile.
   - Catalog/context/canonical programs.
   - Applications.
   - Student documents.
   - Official documents.
   - Payments.
   - Interviews.
   - Notifications.
   - Admin dashboard.
   - Admin applications.
   - Admin users.
   - Admin audit trail.
   - Admin tenant onboarding.
   - Admin document profiles/assets/templates/access grants.
3. For each endpoint, verify:
   - Envelope shape.
   - Error code.
   - Pagination shape.
   - Auth class.
   - Scope filter.
   - Serializer fields.
   - Frontend type.
   - UI consumer.
4. Add missing contract tests:
   - Backend serializer response tests.
   - Frontend service normalization tests.
   - OpenAPI drift guard for route presence and important fields.
5. Normalize errors:
   - No raw Django/DRF errors reaching UI.
   - All recoverable student errors include guidance.
   - All out-of-scope resources use not-found masking.
6. Review rate limits:
   - Login/register/password reset.
   - Public tracker.
   - Payment initiation.
   - Document download/sign URL.
   - Admin bulk operations.

Exit criteria:

- Every frontend API call has a matching backend endpoint and typed response.
- No UI depends on undocumented fields.
- API docs are Beanola-branded and accurate.

## Phase 5: Tenant Scoping And Security Audit

Goal: prove regular admins cannot see or mutate unrelated school data.

Tasks:

1. Build an endpoint inventory:
   - Public anonymous.
   - Student-owned.
   - Staff scoped.
   - Super-admin only.
2. For every staff/admin endpoint, verify queryset scoping:
   - Application list/detail/export.
   - Payment list/detail/verify/receipt/settlement.
   - Document list/detail/download/delete/upload.
   - Dashboard aggregates.
   - Audit trail.
   - User listing.
   - Notifications/communications.
   - Tenant onboarding child resources.
3. Add tests for:
   - Same-school admin can read.
   - Other-school admin gets 404.
   - Expired access grant cannot read.
   - Offering-level grant works only for that offering.
   - Application-level grant works only for that application.
   - Super-admin can read all.
4. Confirm all object-level permissions use canonical IDs, not legacy strings.
5. Review PII exposure:
   - Public tracker fields.
   - Error payloads.
   - Audit logs.
   - Export files.
   - Notifications.
6. Review file security:
   - Signed URL expiry.
   - MIME and magic-byte validation.
   - SVG handling.
   - R2/S3 key naming.
   - Document delete protection.
   - Official generated docs cannot be overwritten.

Exit criteria:

- Scope drift and unscoped endpoint guards pass.
- Manual endpoint inventory has no unresolved "unknown scope" rows.
- No PII leak on out-of-scope or anonymous surfaces.

## Phase 6: Document System Production Audit

Goal: make official documents tenant-configured, traceable, and reliable.

Tasks:

1. Audit document types:
   - Application slip.
   - Acceptance letter.
   - Conditional offer.
   - Finance receipt.
   - Payment receipt.
   - Any future enrollment/registration documents.
2. For each document type, verify:
   - Backend generation path.
   - Profile resolution.
   - Required tenant assets.
   - Required template tokens.
   - Fallback behavior when profile missing.
   - Fingerprint inputs.
   - Versioning behavior.
   - Storage path.
   - Download permission.
   - Email attachment behavior.
3. Remove or quarantine client-side official PDF buttons:
   - Student wizard success.
   - Student payment page.
   - Public tracker.
   - Admin application detail.
4. Validate failure states:
   - No profile configured.
   - Missing logo/signature.
   - Bad token.
   - Asset upload invalid MIME.
   - Storage failure.
   - PDF render failure.
5. Seed production tenant profiles:
   - MIHAS and KATC existing tenant profiles.
   - Beanola demo/test institution only on staging.
6. Add admin preview checks:
   - Preview should use sample data.
   - Preview must clearly state it is preview.
   - Official generation must use persisted backend profile.

Exit criteria:

- Students and admins only download backend official documents.
- Missing tenant profile fails visibly and safely.
- Official document provenance includes tenant/profile/assets/fingerprint.

## Phase 7: Frontend Route And Website Critique

Goal: critique and polish every route, not just the obvious pages.

Audit every route in this matrix:

Public:

- `/`
- `/contact`
- `/privacy`
- `/terms`
- `/track-application`
- `/auth/signup`
- `/auth/signin`
- `/auth/forgot-password`
- `/auth/reset-password`
- `/auth/callback`
- `404`

Student:

- Dashboard.
- Application wizard.
- Submission success.
- Application status.
- Application detail.
- Payment.
- Payment callback.
- Interview.
- Notifications.
- Settings/profile/security.

Admin:

- Dashboard.
- Applications list.
- Application detail.
- Programs and intakes.
- Program fees.
- Users.
- Audit trail.
- Communications.
- Tenant onboarding.
- Document profiles.
- Assets.
- Routing simulator.
- Settings.

For every route, critique:

1. Purpose clarity:
   - Is the page title specific?
   - Is the primary action obvious?
   - Are secondary actions visually subordinate?
2. Mobile layout:
   - 360px and 390px width.
   - No horizontal scroll.
   - No clipped buttons.
   - No overlapping text.
   - Tables become cards or scroll containers intentionally.
3. Touch targets:
   - Minimum 44px for buttons, tabs, icon buttons, inputs.
   - Icon-only buttons have accessible labels and tooltips where useful.
4. Forms:
   - Labels visible.
   - Errors next to fields.
   - Server errors mapped to field or form.
   - Submit disabled/loading behavior.
   - Success state clear.
5. Empty/loading/error states:
   - Skeletons only where layout stable.
   - Empty state tells the next action.
   - Error state has retry where retry is valid.
6. Data density:
   - Admin pages should be compact, scannable, and operational.
   - Avoid marketing-card layouts inside tools.
   - Key metadata should be visible without opening too many modals.
7. Tenant context:
   - Staff always know which school/scope they are viewing.
   - Super-admin has clear all-schools vs selected-school context.
   - Student sees assigned school only after it is known.
8. Accessibility:
   - Keyboard navigation.
   - Focus states.
   - Heading order.
   - ARIA labels.
   - Dialog focus trap.
   - Contrast.
9. Copy:
   - Beanola as platform.
   - School names only from tenant data.
   - No hardcoded fees unless configured.
   - No health-only language unless route is tenant/program-specific.
10. Responsiveness:
   - Check 360x800, 390x844, 768x1024, 1024x768, 1440x900.

Exit criteria:

- Every route has pass/fail notes.
- Every fail has an issue ID or task.
- All critical route failures are fixed before production.

## Phase 8: Mobile-First UI Polish

Goal: make the application feel complete on real phones.

Tasks:

1. Establish mobile design rules:
   - Single-column first.
   - Sticky bottom action only where it improves completion.
   - Avoid nested cards.
   - Keep toolbars stable.
   - No viewport-width font scaling.
   - Use responsive grids with explicit min/max.
2. Student wizard:
   - Stepper usable on 360px.
   - Upload controls usable with thumbs.
   - File status clear.
   - OCR/grade extraction failure recoverable.
   - Payment step clear before redirect.
   - Submission success shows official backend document states.
3. Public tracker:
   - Search input and results stable.
   - No anonymous document downloads unless explicitly allowed.
   - Status timeline legible.
4. Admin tables:
   - Applications list mobile card layout.
   - Filters collapsible.
   - Bulk actions safe and discoverable.
   - Payment/status badges readable.
5. Tenant onboarding:
   - Long forms broken into sections.
   - Asset upload mobile-safe.
   - Template editor usable or clearly desktop-recommended.
   - Routing simulator works on mobile.
6. Dialogs/modals:
   - Full-screen or bottom-sheet style on mobile where needed.
   - No clipped footer buttons.
   - Close and escape/back behavior.
7. Validate with screenshots:
   - Use Playwright or equivalent.
   - Store screenshots for key routes.
   - Include failure screenshots in issue notes.

Exit criteria:

- No route has horizontal overflow at 360px.
- Primary workflows complete on mobile.
- Build/test and visual QA evidence exist.

## Phase 9: End-To-End Workflow QA

Goal: prove the system works as users actually use it.

Student E2E flows:

1. New account signup.
2. Email verification or dev equivalent.
3. Create application.
4. Select canonical program and intake.
5. See assigned institution.
6. Upload required documents.
7. Save draft and resume.
8. Pay or defer where allowed.
9. Submit application.
10. Download application slip from backend official document.
11. Track application publicly.
12. Receive communication.
13. Attend interview path.
14. Receive decision.
15. Download acceptance/conditional offer.
16. Download receipt.

Admin E2E flows:

1. Super-admin logs in.
2. Creates institution.
3. Uploads logo/signature.
4. Creates document profile.
5. Creates/assigns offering.
6. Runs routing simulator.
7. Adds staff member.
8. Adds scoped access grant.
9. Staff logs in and sees only scoped school data.
10. Staff reviews application.
11. Staff verifies payment.
12. Staff generates official documents.
13. Super-admin audits activity.
14. Super-admin exports scoped reports.

Negative E2E flows:

- Wrong-school staff cannot open application.
- Expired grant cannot open payment/document.
- Missing document profile blocks official generation with clear error.
- Duplicate application blocked by canonical duplicate logic.
- Full intake/offering returns recoverable guidance.
- Failed payment does not produce paid receipt.
- Anonymous public tracker cannot expose PII.

Exit criteria:

- Critical E2E flows pass on staging.
- Negative flows prove security boundaries.
- Manual smoke checklist exists for production release.

## Phase 10: Backend Reliability And Operations

Goal: production behavior is observable and recoverable.

Tasks:

1. Health checks:
   - `/health/live/`
   - `/health/ready/`
   - DB connectivity.
   - Redis/Celery readiness if required.
2. Background tasks:
   - PDF generation queue.
   - Email queue.
   - Payment reconciliation.
   - Notification dispatch.
   - Uptime task.
3. Idempotency:
   - Payment initiation.
   - Webhooks.
   - Official document generation.
   - Email retries.
4. Logging:
   - Request ID.
   - User ID where safe.
   - Institution ID for tenant actions.
   - Payment reference.
   - Document ID.
   - No secrets or full PII in logs.
5. Monitoring:
   - Error tracking configured.
   - Alert email Beanola default.
   - Failed task alerts.
   - Payment webhook failure alerts.
   - PDF render failure alerts.
6. Backup/restore:
   - Production backup script tested.
   - Restore drill performed on staging/local.
   - Backup retention documented.
7. Rollback:
   - Code rollback steps.
   - DB rollback posture: additive migrations should be forward-only; document how to disable features without dropping data.
   - Feature flags for risky surfaces.

Exit criteria:

- `manage.py check` passes in staging/prod env.
- Monitoring receives test event.
- Backup and restore drill documented.

## Phase 11: Security And Privacy Review

Goal: harden production before launch.

Tasks:

1. Auth:
   - Cookie flags.
   - JWT expiry.
   - Refresh behavior.
   - Logout/session cleanup.
   - CSRF enforcement.
2. Authorization:
   - Student owner checks.
   - Staff scope checks.
   - Super-admin-only endpoints.
   - Object-level permissions.
3. Input validation:
   - Template tokens.
   - HTML sanitization.
   - File uploads.
   - Query params.
   - Bulk actions.
4. Secrets:
   - No secrets in repo.
   - Env examples updated.
   - Production env reviewed.
5. Payment security:
   - Webhook signature.
   - Idempotency keys.
   - Reconciliation.
   - Receipt authorization.
6. Privacy:
   - Public tracker data minimization.
   - Export access.
   - Audit trail retention.
   - PII in logs.
7. Headers:
   - CSP.
   - HSTS.
   - X-Frame-Options.
   - Referrer-Policy.
8. Abuse controls:
   - Rate limits.
   - Password reset throttling.
   - Public tracker throttling.
   - Upload size limits.

Exit criteria:

- Security checklist complete.
- No high severity open findings.
- Any medium findings have explicit owner and launch decision.

## Phase 12: Performance And Core Web Vitals

Goal: app is fast enough for mobile users on weak networks.

Tasks:

1. Measure:
   - Lighthouse mobile for public home, signup, tracker, student dashboard, admin dashboard.
   - Bundle analysis.
   - API response timings.
2. Frontend:
   - Reduce oversized PDF/vendor chunks from initial paths.
   - Confirm dev preview routes are not pulled into normal public/student/admin entry chunks.
   - Lazy-load admin-heavy modules.
   - Optimize images.
   - Preload only critical assets.
3. Backend:
   - Add indexes for slow tenant-scoped queries.
   - Check N+1 queries on application detail, dashboard, documents, payments.
   - Paginate large lists.
4. UX stability:
   - No layout shift from images.
   - Skeleton dimensions stable.
   - Avoid dynamic text resizing.

Exit criteria:

- Public pages meet acceptable Lighthouse/Core Web Vitals thresholds.
- Admin pages remain responsive with realistic data volume.
- No critical slow query remains unindexed.

## Phase 13: Data Quality And Seed Readiness

Goal: production data is coherent before opening applications.

Tasks:

1. Institution data:
   - Slug.
   - Code.
   - Brand name.
   - Legal name.
   - Emails.
   - Phone numbers.
   - Domains.
   - Active status.
2. Assets:
   - Logo.
   - Signature.
   - Seal if needed.
   - Asset checksums.
   - Active version.
3. Catalog:
   - Canonical programs.
   - Offerings.
   - Intakes.
   - Fees.
   - Capacity.
   - Assignment priority.
   - Eligibility rules.
4. Documents:
   - Required documents.
   - Document profiles.
   - Template tokens.
   - Bank details.
   - Signatory.
5. Staff:
   - Super-admins.
   - Institution admins.
   - Reviewers.
   - Finance approvers.
   - Scoped grants.
6. Communication:
   - Email templates.
   - SMS templates if used.
   - Sender email.
   - Support contact.

Exit criteria:

- Production data checklist signed off per school.
- No active offering lacks canonical program/intake/fee rules.
- No active school lacks required document profile assets.

## Phase 14: Test Suite And CI Gate

Goal: CI blocks drift and production regressions.

Required commands:

Frontend:

```bash
cd apps/admissions
bun run type-check
bun run lint
bun x vitest run
bun run build
```

Backend:

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest tests/unit tests/property -q
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py check
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py spectacular --file /tmp/openapi.yaml
```

Target guards that must exist and pass:

- Frontend brand drift guard.
- Backend brand drift guard.
- Document flow drift guard.
- Official document dedup guard.
- Scope drift guard.
- Unscoped endpoint guard.
- Canonical tenant drift guard.
- Payment status drift guard.
- Error code drift guard.
- Role mirror guard.
- Application lifecycle guard.
- Schema drift guard.

Tasks:

1. Ensure all new untracked tests are committed or intentionally removed.
2. Add CI job names matching the guard list.
3. Fail CI on:
   - Type errors.
   - Lint errors.
   - Build failure.
   - Brand drift.
   - Unscoped endpoint drift.
   - Schema drift.
4. Add a production smoke job or manual checklist linked from release notes.

Exit criteria:

- CI reproduces local production-readiness commands.
- No guard is optional.

## Phase 15: Production Launch Checklist

Do this only after Phases 1-14 pass.

Pre-launch:

1. Freeze release branch.
2. Confirm no uncommitted production code changes.
3. Confirm env vars:
   - `DATABASE_URL`
   - `SECRET_KEY`
   - JWT signing key
   - email sender credentials
   - Lenco keys
   - R2/S3 keys
   - CORS origins
   - cookie domain
   - frontend base URL
   - error monitoring DSN
4. Run full test suite.
5. Run production build.
6. Back up production DB.
7. Apply migrations.
8. Run validation SQL.
9. Deploy backend.
10. Deploy frontend.

Smoke test immediately after deploy:

1. Public home loads with Beanola branding.
2. Contact page mailto uses Beanola address.
3. Signup/login works.
4. Program catalog loads.
5. Application wizard creates draft.
6. Assignment preview works.
7. Payment initiation test path works in safe environment.
8. Public tracker works without PII leak.
9. Django admin login works at `/beanola-admin-panel/` if that operational surface is part of the release smoke scope.
10. Product tenant-admin UI loads at `/admin/tenants`.
11. Super-admin tenant onboarding works from `/admin/tenants`.
12. Staff scoped data check passes.
13. Official document generation works for one staged application.
14. Email render/send uses Beanola default or tenant template.
15. Error monitoring receives no deployment errors.
16. Health checks pass.

Rollback posture:

- Code rollback is allowed.
- DB rollback is forward-only unless a tested rollback script exists.
- If a tenant feature fails, disable the feature route/action and keep data intact.
- If payment fails, stop payment initiation and keep application submission safe.
- If document generation fails, show "generation failed" and block download rather than serving stale frontend PDFs.

Exit criteria:

- Smoke checklist complete.
- No critical errors in logs after launch window.
- Production readiness status document updated with exact date/time and evidence.

## Final Agent Instructions

When executing this plan:

1. Read code before editing.
2. Prefer existing architecture and helpers.
3. Do not remove tenant fixture data unless replacing it with explicit neutral tenant fixture data and updating tests.
4. Do not make production DB changes from a development shell.
5. Update tests with every behavior change.
6. Keep every change tied to a phase and exit criterion.
7. After each phase, update `docs/multi-tenant-beanola-progress.md` and this plan with evidence.
8. Stop and escalate if a production decision is required, especially DB apply, tenant data deletion, payment behavior, or document legal wording.
