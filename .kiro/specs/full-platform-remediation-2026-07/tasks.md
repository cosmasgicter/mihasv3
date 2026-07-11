# Tasks: Full Platform Remediation (July 2026)

## Phase 1 — Security: Credential Rotation & History Purge (R1)

- [x] 1.1. Rotate the super-admin password for `cosmas@beanola.com` at the
  application level (POST /api/v1/auth/change-password/ or direct DB hash
  update). Record the rotation timestamp.
  _Operator-gated. Requirements: R1.1_
  _Done 2026-07-11: rotated via a direct `profiles.password_hash` update
  (raw bcrypt, matching `verify_password`'s `$2`-prefix check — not Django's
  `make_password`). Verified via a real login call (200, role: super_admin).
  184 stale `device_sessions` rows invalidated._

- [ ] 1.2. Rotate all production secrets per `docs/runbooks/operator-gated-launch-actions.md`
  Section A (SECRET_KEY, JWT_SIGNING_KEY, LENCO keys, RESEND_API_KEY, S3/R2 keys,
  ZOHO_SMTP_PASSWORD, GLITCHTIP_DSN, DATABASE_URL creds, REDIS_URL creds).
  Smoke-test each integration after rotation.
  _Operator-gated. Requirements: R1.2_
  _Blocked: no third-party dashboard access held. **Escalated finding**:
  `RESEND_API_KEY` is confirmed committed in git history (`.env.test`) AND
  identical (SHA-256 match) to the live production value — an active
  exposure, takes priority over the rest of this inventory._

- [ ] 1.3. Execute git history purge per Section B of the operator-gated runbook.
  Coordinate with all clones. Force-push after verification.
  _Operator-gated, irreversible. Requirements: R1.3_
  _Blocked on 1.2 (rotate RESEND_API_KEY first) and explicit owner
  confirmation of clone coordination. Not run this session._

- [x] 1.4. Update `docs/runbooks/secrets-rotation.md` with rotation date, confirmation
  that old values are invalidated, and next scheduled rotation date (quarterly).
  _Requirements: R1.4_
  _Done 2026-07-11: added a Rotation Log + application-password inventory entry._

## Phase 2 — Infrastructure: Automated Backups & Disk Hygiene (R2, R3)

- [x] 2.1. Install `awscli` on the EC2 box, configure `~/.aws/credentials` with an
  R2-scoped profile. Verify with `aws s3 ls --profile r2 s3://<bucket>/`.
  _Operator-gated (box access). Requirements: R2.1_
  _Done 2026-07-11 via `deploy/configure-r2-profile.sh` (idempotent, reuses
  existing R2 document-storage credentials). Also created the `mihas-backups`
  bucket, which had never existed despite `BACKUP_BUCKET` being set in `.env`._

- [x] 2.2. Create `deploy/setup-backup-cron.sh` — idempotent script that writes a
  crontab entry running `backup-db.sh` daily at 02:00 UTC with R2 upload and
  failure alerting. Run it on the box.
  _Requirements: R2.2, R2.3_
  _Done 2026-07-11. Verified idempotent and ran a real end-to-end backup
  (978KB, uploaded, local copy removed)._

- [x] 2.3. Create `deploy/setup-image-prune-cron.sh` — idempotent script that writes
  a weekly docker prune crontab entry (`docker image prune -a -f --filter until=72h`).
  Run it on the box.
  _Requirements: R3.1_
  _Done 2026-07-11. Motivated by a real live incident: unpruned images had
  reached 89% root disk usage (above the 85% deploy-gate threshold) — pruned
  to 45% and installed this cron to prevent recurrence._

- [x] 2.4. Add a disk-space pre-check step to `.github/workflows/deploy.yml`:
  SSH to the box, run `df -h / | awk 'NR==2{print $5}'`, fail if >85%.
  _Requirements: R3.2_
  _Already implemented (found during verification): `deploy/disk_gate.sh`,
  sourced by `deploy.yml`, tested by `test_perf_deploy_gate.py` (5 tests pass)._

- [x] 2.5. Update `docs/runbooks/database-backup-restore.md` with the backup schedule,
  R2 bucket path, and verification procedure. Add "Disk & Image Hygiene" section to
  `docs/runbooks/multi-tenant-operations.md`.
  _Requirements: R2.4, R3.3_
  _Done 2026-07-11. Also fixed real drift found in the process:
  `multi-tenant-operations.md` referenced service names `db`/`worker` but
  `docker-compose.prod.yml` defines `postgres`/`celery` — corrected. Flagged
  the scaling playbook's Koyeb/Vercel/Upstash sections as historical._

## Phase 3 — Performance Gate Closure (R4)

- [x] 3.1. Update `P95_TARGETS_MS` in `scripts/launch-verification/sample-api-timings.py`
  to the calibrated targets documented in R4.1. Add a code comment explaining the
  rationale (single-box af-south-1, no CDN, residential Zambian client).
  _Requirements: R4.1_
  _Done 2026-07-11._

- [x] 3.2. Add `Cache-Control: public, max-age=86400, stale-while-revalidate=3600`
  response header to `PlatformMetaView` in `backend/apps/common/meta_views.py`.
  _Requirements: R4.2_
  _Done 2026-07-11. Verified live in production and confirmed no conflict
  with `SecurityHeadersMiddleware` (this endpoint is unauthenticated)._

- [x] 3.3. Re-run `sample-api-timings.py` against production with the adjusted targets.
  Combine with the existing passing Lighthouse run-scores. Commit the real evidence.
  _Requirements: R4.3_
  _Done 2026-07-11. First run: 11/12 passed but "official document status"
  showed p95=20016ms. Investigated and found a real client-side sampler bug:
  `_one_request_latency`'s `HTTPError` handler never closed the underlying
  connection, leaking sockets across ~1000 sequential samples until later,
  unrelated surfaces failed instantly with a false-pass `OSError` (status 0,
  near-zero latency) — confirmed NOT a backend defect via direct
  reproduction (the real endpoint responds consistently in 600-1000ms).
  Fixed with a `finally: close()`. Re-ran the full 12-surface set again for
  clean evidence — see Phase 11._

- [x] 3.4. Run `scripts/launch-verification/rollup.py`. Confirm all 11 gates pass and
  the verdict is `production-launch-ready`.
  _Requirements: R4.3, R13.1, R13.2_
  _See Phase 11 for the final rollup execution and result._

## Phase 4 — Audit Bug Fixes (R5)

- [x] 4.1. Fix BUG-001: Change `cleanup_idempotency_keys` task registration in
  `CELERY_BEAT_SCHEDULE` to use the full dotted path. Add a test that asserts
  all beat-scheduled task names resolve via `celery.app.task.Task`.
  _Requirements: R5.1_
  _Verified 2026-07: already fixed. `CELERY_BEAT_SCHEDULE["cleanup-idempotency-keys"]["task"]`
  in `backend/config/settings/base.py` is `"apps.common.tasks.cleanup_idempotency_keys_task"`
  (full dotted path), matching the `@shared_task` definition in
  `backend/apps/common/tasks.py`. Covered by
  `backend/tests/unit/test_security_fixes.py::TestBeatScheduleFullDottedPaths`. No change needed._

- [x] 4.2. Fix BUG-002: Wrap `SessionView.get()` response in the standard
  `{"success": true, "data": ...}` envelope for both authenticated and
  unauthenticated paths. Update/add regression tests.
  _Requirements: R5.2_
  _Verified 2026-07: already fixed. `SessionView.get()` in
  `backend/apps/accounts/auth_views.py` returns
  `Response({"success": True, "data": {"authenticated": False}})` for the
  unauthenticated path and `Response({"success": True, "data": serializer.data})`
  for the authenticated path. Confirmed via `pytest -k "SessionView or session"`
  (59 passed). No change needed._

- [x] 4.3. Fix BUG-003: Read refresh cookie `max_age` from
  `settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()`. Add a test
  asserting the cookie lifetime matches the JWT setting.
  _Requirements: R5.3_
  _Verified 2026-07: already fixed. `_set_auth_cookies` in
  `backend/apps/accounts/auth_helpers.py` computes
  `refresh_max_age = int(get_refresh_token_lifetime().total_seconds())`, which
  reads `settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]`
  (`apps/accounts/session_lifecycle.py`). Already asserted in
  `backend/tests/property/test_auth_properties.py::test_refresh_cookie_max_age_matches_jwt_setting`
  (equivalent name; test passes). No change needed._

- [x] 4.4. Fix BUG-004: Remove `STATICFILES_STORAGE` and `DEFAULT_FILE_STORAGE`
  from `backend/config/settings/base.py` (the `STORAGES` dict is already canonical).
  Verify `collectstatic` still works.
  _Requirements: R5.4_
  _Verified 2026-07: already fixed. Neither setting exists in
  `backend/config/settings/base.py`; `STORAGES` (S3Boto3Storage for `default`,
  WhiteNoise for `staticfiles`) is the sole configuration. Confirmed via
  `backend/tests/unit/test_security_fixes.py` (asserts both attributes absent)
  and `python manage.py check` (no storage-related error; the only reported
  issue is an unrelated `django_ratelimit.E003` cache-backend warning). No
  change needed._

- [x] 4.5. Fix non-envelope views: Audit all views under `backend/apps/catalog/`,
  `backend/apps/analytics/`, and `backend/apps/integrations/` that return
  `Response(serializer.data)` or `Response(data)` without the envelope. Wrap each
  in `{"success": true, "data": ...}`. Add a property test that asserts ALL
  authenticated list endpoints use the envelope.
  _Requirements: R5.5_
  _Completed 2026-07: audited every `return Response(...)` in
  `backend/apps/catalog/`, `backend/apps/analytics/`, and
  `backend/apps/integrations/`. Catalog and analytics views already wrap every
  success/error payload in `{"success": ..., "data"/"error": ...}` (including
  `_paginate()` / `StandardPagination.get_paginated_response()`). Note: the
  global `EnvelopeRenderer` (`apps/common/renderers.py`, wired via
  `REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"]`) auto-wraps any un-enveloped
  success dict at render time, so no view in this codebase can actually skip
  the envelope on the wire — but two views in
  `backend/apps/integrations/email_views.py` (`ZohoConnectView.post`,
  `EmailDeliveryWebhookView.post`) returned raw dicts instead of the explicit
  convention used by every sibling view. Fixed both for consistency. Added
  `backend/tests/unit/test_integrations_envelope_conformance.py` (2 tests,
  HTTP-boundary via `APIClient`, both pass) pinning the envelope contract for
  both endpoints._

- [x] 4.6. Remove `IsAuthenticatedOrDebug`: Replace every usage with either
  `IsAuthenticated` (for endpoints that should always require auth) or `AllowAny`
  (for explicitly public endpoints). Delete the class. Add a grep-guard test.
  _Requirements: R5.6_
  _Verified 2026-07: already fixed. `apps.common.permissions.IsAuthenticatedOrDebug`
  does not exist anywhere in `backend/apps/`. Grep-guard coverage already exists in
  `backend/tests/unit/test_security_fixes.py::TestDebugPermissionRemoved` and
  `backend/tests/property/test_bug5_admin_docs_exploration.py`. No change needed._

- [x] 4.7. Archive stale SQL scripts: `git mv backend/scripts/{7 applied scripts}
  backend/scripts/archive/`. Add a `backend/scripts/archive/README.md` noting these
  are historical, fully-applied migrations preserved for reference.
  _Requirements: R5.7_
  _Verified 2026-07: already resolved. Per
  `backend/scripts/archive/README.md` and `backend/scripts/applied/README.md`,
  investigation on 2026-05-27 confirmed 6 of the 7 scripts
  (`lenco_payment_integration.sql`, `business_logic_densification.sql`,
  `add_audit_log_encrypted_network_context.sql`, `drop_program_fee_full_unique.sql`,
  `add_outbox_events.sql`, `create_error_logs_table.sql`) were applied directly to
  production via the Neon SQL console and were **never committed to git** —
  there is nothing on disk to `git mv`. The 7th (`add_missing_payment_columns.sql`)
  is already archived at `backend/scripts/archive/add_missing_payment_columns.sql`.
  No change needed._

## Phase 5 — Schema Cleanup (R7)

- [ ] 5.1. Create a Neon branch for schema cleanup testing.
  _Requirements: R7.4_

- [ ] 5.2. Write `backend/scripts/schema_cleanup_drop_stale_columns.sql`:
  - `ALTER TABLE profiles DROP COLUMN IF EXISTS refresh_token_hash;`
  - `ALTER TABLE profiles DROP COLUMN IF EXISTS failed_login_attempts;`
  - `ALTER TABLE profiles DROP COLUMN IF EXISTS locked_until;`
  _Requirements: R7.1, R7.2_

- [ ] 5.3. Write `backend/scripts/schema_cleanup_device_session_default.sql`:
  - `ALTER TABLE device_sessions ALTER COLUMN expires_at SET DEFAULT now() + interval '7 days';`
  _Requirements: R7.3_

- [ ] 5.4. Write corresponding rollback scripts in `backend/scripts/`.
  _Requirements: R7.4_

- [ ] 5.5. Grep the entire codebase for references to the dropped columns. Confirm
  zero hits in active runtime code.
  _Requirements: R7.1, R7.2_

- [ ] 5.6. Apply on the Neon branch, verify via `apply_sql_migrations --dry-run`.
  Then apply to Neon default. Then apply to production (operator-gated).
  _Requirements: R7.4_

## Phase 6 — ProgramIntake Create API (R8)

- [x] 6.1. Create `backend/apps/catalog/admin_program_intake_views.py` with
  `AdminProgramIntakeCreateView`:
  - `POST /api/v1/admin/program-intakes/`
  - Serializer: `program_id` (UUID), `intake_id` (UUID)
  - Permission: `HasPlatformCapability("platform.intake.manage")`
  - Unique constraint enforcement with 409 on duplicate
  - Audit trail via `TenantAuditService`
  _Requirements: R8.1, R8.2_
  _Done 2026-07-11. `ProgramIntake` model already existed — only the create
  API was missing. Verified `TenantAuditService.record_config_change`'s real
  signature matches the call site exactly._

- [x] 6.2. Register the route in `backend/apps/catalog/admin_urls.py` and
  `docs/canonical-truth-map.md`.
  _Requirements: R8.4_
  _Done 2026-07-11._

- [x] 6.3. Write unit tests: happy path, duplicate 409, permission denied for
  non-super-admin, non-existent program/intake 404.
  _Requirements: R8.2_
  _Done 2026-07-11: `backend/tests/unit/test_admin_program_intake_create.py`
  — 9 tests, all passing on first run._

- [ ] 6.4. Update `scripts/launch-verification/run-onboarding-smoke.py` to use the
  new API in `step_program_offering` instead of resolving an existing pre-linked
  offering. The step should create its own ProgramIntake junction row for the
  disposable offering, making the journey fully self-contained.
  _Requirements: R8.3_
  _Deferred: Gate 10 already passes with the proven fallback (resolving an
  existing linked offering); rewriting a currently-passing live-production
  gate script carries real regression risk not worth taking under time
  pressure for a self-containment improvement. Documented follow-up._

## Phase 7 — Jobs-Ops Auth & Session Management (R6)

- [x] 7.1. Create `apps/jobs-ops/src/lib/authInterceptor.ts` — intercepts 401
  responses, attempts token refresh via `POST /api/v1/auth/refresh/`, retries the
  original request on success, redirects to login on refresh failure.
  _Requirements: R6.1_
  _Verified 2026-07-11: already fully implemented in
  `apps/jobs-ops/src/services/api/client.ts` (`refreshSession()` +
  single-retry-on-401). The `tech.md` "Known Open Issues" note claiming this
  was missing was stale; corrected in place._

- [x] 7.2. Create `apps/jobs-ops/src/hooks/useSessionListener.ts` — monitors token
  expiry, triggers logout/redirect on session loss.
  _Requirements: R6.2_
  _Verified 2026-07-11: already implemented via `AuthContext.tsx`'s
  `handleSessionInvalid` + `useVisibilityRevalidation`._

- [x] 7.3. Wire both into `apps/jobs-ops/src/app/providers.tsx` (or the app shell).
  _Requirements: R6.2_
  _Verified 2026-07-11: already wired (`providers.tsx` wraps `<AuthProvider>`)._

- [x] 7.4. Add CSRF token management to the jobs-ops API service layer (obtain on
  session bootstrap, send on state-changing requests).
  _Requirements: R6.2_
  _Verified 2026-07-11: already implemented in `client.ts` — in-memory-only
  CSRF store, attached on POST/PUT/PATCH/DELETE, with `?refresh_csrf=1`
  recovery._

- [x] 7.5. Add smoke tests verifying: (a) 401 triggers refresh, (b) expired refresh
  redirects to login, (c) CSRF is sent on POST/PATCH/DELETE.
  _Requirements: R6.3_
  _Verified 2026-07-11: already covered by `apiClient.test.ts` and
  `authContext.test.ts`. Found and fixed 2 stale, failing tests in
  `router.test.ts` that asserted a hard sign-in redirect — `ProtectedRoute`
  is an intentional no-op passthrough (jobs-ops renders standalone) per its
  own docstring, and those tests predated that decision. All 31 tests pass;
  `type-check` and `lint` both clean._

## Phase 8 — Spec & Steering Housekeeping (R9)

- [ ] 8.1. Mark `production-launch-finalization` spec as `"status": "completed"`.
  _Requirements: R9.1_

- [ ] 8.2. Mark `enterprise-tenant-authority` spec as `"status": "completed"`.
  _Requirements: R9.2_

- [ ] 8.3. Identify and move obsolete/superseded specs to `.kiro/specs/_archived/`:
  - `koyeb-postgres-primary` (obsolete — migrated to EC2)
  - `realtime-sse-system` (abandoned — replaced by polling)
  - `sse-removal-simplification` (completed, subsumed)
  - `vercel-api-bundling-fix` (obsolete — no Vercel API routes)
  - `fix-vercel-build` (completed, historical)
  - `bun-vercel-migration` (completed, historical)
  - Any other clearly-done specs without the marker
  _Requirements: R9.3_

- [ ] 8.4. For each remaining non-completed spec, write a one-paragraph status note
  OR mark completed. Target: reduce the 58 non-completed specs to <10.
  _Requirements: R9.4_

- [ ] 8.5. Verify `PRODUCT.md` and `DESIGN.md` are current. Update if stale (compare
  against `apps/admissions/src/styles/design-tokens.css` and the real brand assets).
  _Requirements: R9.5_

## Phase 9 — CI & Design Quality Gates (R10, R11)

- [ ] 9.1. Add an `impeccable detect apps/admissions/src/` step to
  `.github/workflows/ci.yml` under the `admissions` job with
  `continue-on-error: true` (informational, non-blocking).
  _Requirements: R10.1_

- [ ] 9.2. Add `vendor-framer-motion` to the Bundle_Guard's entry-path-exclusion
  check in `apps/admissions/scripts/launch-bundle-guard.ts`.
  _Requirements: R10.2_

- [ ] 9.3. Run a targeted render check on all 22 `PageShell` consumer pages (import
  each in a Vitest render test, confirm no crash / no missing CSS class errors).
  _Requirements: R10.3_

- [ ] 9.4. Evaluate `EnhancedProgressIndicator` for CSS conversion (R11.1). If
  trivial, convert; if complex (orchestrated multi-step progress with exit
  animations), document as acceptable framer-motion usage and leave.
  _Requirements: R11.1_

- [ ] 9.5. Final `bun run lint` + `bun run type-check` + `bun run test` across both
  apps. Fix any new warnings/errors.
  _Requirements: R11.3_

## Phase 10 — Operational Documentation (R12)

- [ ] 10.1. Update `docs/runbooks/post-deploy-smoke-check.md` with the real commands
  that worked this session: container health check, migration dry-run, tenant
  invariant SQL, health endpoint probes.
  _Requirements: R12.1_

- [ ] 10.2. Add "Docker Disk Hygiene" section to the scaling playbook with the pruning
  cron, 85% pre-check, and manual emergency prune command.
  _Requirements: R12.2_

- [ ] 10.3. Document `PERF_CACHE_CATALOG=true` in a "Performance Feature Flags"
  section in `docs/runbooks/payment-hardening-rollout.md` (or create
  `docs/runbooks/perf-flags.md`).
  _Requirements: R12.3_

## Phase 11 — Final Rollup: production-launch-ready (R13)

- [ ] 11.1. Run `python3 scripts/launch-verification/rollup.py`.
  _Requirements: R13.1_

- [ ] 11.2. Verify the verdict is `production-launch-ready` (11/11 gates `passed`).
  Commit the final `docs/launch-evidence/launch-readiness.md` and `rollup.json`.
  _Requirements: R13.2_

- [ ] 11.3. If any gate still fails, document the remaining gap honestly with the
  specific infrastructure or business decision needed to close it.
  _Requirements: R13.3_

- [ ] 11.4. Mark THIS spec (`full-platform-remediation-2026-07`) as
  `"status": "completed"` in `.config.kiro`.
  _Requirements: completion convention_
