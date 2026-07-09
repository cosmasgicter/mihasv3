# Tasks: Full Platform Remediation (July 2026)

## Phase 1 — Security: Credential Rotation & History Purge (R1)

- [ ] 1.1. Rotate the super-admin password for `cosmas@beanola.com` at the
  application level (POST /api/v1/auth/change-password/ or direct DB hash
  update). Record the rotation timestamp.
  _Operator-gated. Requirements: R1.1_

- [ ] 1.2. Rotate all production secrets per `docs/runbooks/operator-gated-launch-actions.md`
  Section A (SECRET_KEY, JWT_SIGNING_KEY, LENCO keys, RESEND_API_KEY, S3/R2 keys,
  ZOHO_SMTP_PASSWORD, GLITCHTIP_DSN, DATABASE_URL creds, REDIS_URL creds).
  Smoke-test each integration after rotation.
  _Operator-gated. Requirements: R1.2_

- [ ] 1.3. Execute git history purge per Section B of the operator-gated runbook.
  Coordinate with all clones. Force-push after verification.
  _Operator-gated, irreversible. Requirements: R1.3_

- [ ] 1.4. Update `docs/runbooks/secrets-rotation.md` with rotation date, confirmation
  that old values are invalidated, and next scheduled rotation date (quarterly).
  _Requirements: R1.4_

## Phase 2 — Infrastructure: Automated Backups & Disk Hygiene (R2, R3)

- [ ] 2.1. Install `awscli` on the EC2 box, configure `~/.aws/credentials` with an
  R2-scoped profile. Verify with `aws s3 ls --profile r2 s3://<bucket>/`.
  _Operator-gated (box access). Requirements: R2.1_

- [ ] 2.2. Create `deploy/setup-backup-cron.sh` — idempotent script that writes a
  crontab entry running `backup-db.sh` daily at 02:00 UTC with R2 upload and
  failure alerting. Run it on the box.
  _Requirements: R2.2, R2.3_

- [ ] 2.3. Create `deploy/setup-image-prune-cron.sh` — idempotent script that writes
  a weekly docker prune crontab entry (`docker image prune -a -f --filter until=72h`).
  Run it on the box.
  _Requirements: R3.1_

- [ ] 2.4. Add a disk-space pre-check step to `.github/workflows/deploy.yml`:
  SSH to the box, run `df -h / | awk 'NR==2{print $5}'`, fail if >85%.
  _Requirements: R3.2_

- [ ] 2.5. Update `docs/runbooks/database-backup-restore.md` with the backup schedule,
  R2 bucket path, and verification procedure. Add "Disk & Image Hygiene" section to
  `docs/runbooks/multi-tenant-operations.md`.
  _Requirements: R2.4, R3.3_

## Phase 3 — Performance Gate Closure (R4)

- [ ] 3.1. Update `P95_TARGETS_MS` in `scripts/launch-verification/sample-api-timings.py`
  to the calibrated targets documented in R4.1. Add a code comment explaining the
  rationale (single-box af-south-1, no CDN, residential Zambian client).
  _Requirements: R4.1_

- [ ] 3.2. Add `Cache-Control: public, max-age=86400, stale-while-revalidate=3600`
  response header to `PlatformMetaView` in `backend/apps/common/meta_views.py`.
  _Requirements: R4.2_

- [ ] 3.3. Re-run `sample-api-timings.py` against production with the adjusted targets.
  Combine with the existing passing Lighthouse run-scores. Commit the real evidence.
  _Requirements: R4.3_

- [ ] 3.4. Run `scripts/launch-verification/rollup.py`. Confirm all 11 gates pass and
  the verdict is `production-launch-ready`.
  _Requirements: R4.3, R13.1, R13.2_

## Phase 4 — Audit Bug Fixes (R5)

- [ ] 4.1. Fix BUG-001: Change `cleanup_idempotency_keys` task registration in
  `CELERY_BEAT_SCHEDULE` to use the full dotted path. Add a test that asserts
  all beat-scheduled task names resolve via `celery.app.task.Task`.
  _Requirements: R5.1_

- [ ] 4.2. Fix BUG-002: Wrap `SessionView.get()` response in the standard
  `{"success": true, "data": ...}` envelope for both authenticated and
  unauthenticated paths. Update/add regression tests.
  _Requirements: R5.2_

- [ ] 4.3. Fix BUG-003: Read refresh cookie `max_age` from
  `settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()`. Add a test
  asserting the cookie lifetime matches the JWT setting.
  _Requirements: R5.3_

- [ ] 4.4. Fix BUG-004: Remove `STATICFILES_STORAGE` and `DEFAULT_FILE_STORAGE`
  from `backend/config/settings/base.py` (the `STORAGES` dict is already canonical).
  Verify `collectstatic` still works.
  _Requirements: R5.4_

- [ ] 4.5. Fix non-envelope views: Audit all views under `backend/apps/catalog/`,
  `backend/apps/analytics/`, and `backend/apps/integrations/` that return
  `Response(serializer.data)` or `Response(data)` without the envelope. Wrap each
  in `{"success": true, "data": ...}`. Add a property test that asserts ALL
  authenticated list endpoints use the envelope.
  _Requirements: R5.5_

- [ ] 4.6. Remove `IsAuthenticatedOrDebug`: Replace every usage with either
  `IsAuthenticated` (for endpoints that should always require auth) or `AllowAny`
  (for explicitly public endpoints). Delete the class. Add a grep-guard test.
  _Requirements: R5.6_

- [ ] 4.7. Archive stale SQL scripts: `git mv backend/scripts/{7 applied scripts}
  backend/scripts/archive/`. Add a `backend/scripts/archive/README.md` noting these
  are historical, fully-applied migrations preserved for reference.
  _Requirements: R5.7_

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

- [ ] 6.1. Create `backend/apps/catalog/admin_program_intake_views.py` with
  `AdminProgramIntakeCreateView`:
  - `POST /api/v1/admin/program-intakes/`
  - Serializer: `program_id` (UUID), `intake_id` (UUID)
  - Permission: `HasPlatformCapability("platform.intake.manage")`
  - Unique constraint enforcement with 409 on duplicate
  - Audit trail via `TenantAuditService`
  _Requirements: R8.1, R8.2_

- [ ] 6.2. Register the route in `backend/apps/catalog/admin_urls.py` and
  `docs/canonical-truth-map.md`.
  _Requirements: R8.4_

- [ ] 6.3. Write unit tests: happy path, duplicate 409, permission denied for
  non-super-admin, non-existent program/intake 404.
  _Requirements: R8.2_

- [ ] 6.4. Update `scripts/launch-verification/run-onboarding-smoke.py` to use the
  new API in `step_program_offering` instead of resolving an existing pre-linked
  offering. The step should create its own ProgramIntake junction row for the
  disposable offering, making the journey fully self-contained.
  _Requirements: R8.3_

## Phase 7 — Jobs-Ops Auth & Session Management (R6)

- [ ] 7.1. Create `apps/jobs-ops/src/lib/authInterceptor.ts` — intercepts 401
  responses, attempts token refresh via `POST /api/v1/auth/refresh/`, retries the
  original request on success, redirects to login on refresh failure.
  _Requirements: R6.1_

- [ ] 7.2. Create `apps/jobs-ops/src/hooks/useSessionListener.ts` — monitors token
  expiry, triggers logout/redirect on session loss.
  _Requirements: R6.2_

- [ ] 7.3. Wire both into `apps/jobs-ops/src/app/providers.tsx` (or the app shell).
  _Requirements: R6.2_

- [ ] 7.4. Add CSRF token management to the jobs-ops API service layer (obtain on
  session bootstrap, send on state-changing requests).
  _Requirements: R6.2_

- [ ] 7.5. Add smoke tests verifying: (a) 401 triggers refresh, (b) expired refresh
  redirects to login, (c) CSRF is sent on POST/PATCH/DELETE.
  _Requirements: R6.3_

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
