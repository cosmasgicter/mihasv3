# Design: Full Platform Remediation (July 2026)

## Overview

This spec is a sequential, ordered remediation plan. Each phase is independent
enough to be committed and deployed separately, but they are ordered by
priority: security first, then operational stability, then code correctness,
then polish.

## Phase Breakdown

### Phase 1: Security (R1) — Operator-gated, immediate

**Approach:** Operator executes the documented rotation runbook. No code changes
needed — only credential values change at provider dashboards + box env file.

- Deliverable: Updated `docs/runbooks/secrets-rotation.md` with rotation
  timestamps.
- Verification: Each rotated secret is smoke-tested (login, email send, payment
  initiate, storage upload, error report) before moving to the next.
- Git history purge is the final step, after all rotations, after team
  coordination.

### Phase 2: Infrastructure Stability (R2, R3) — Operator + one script commit

**Approach:**
- `deploy/setup-backup-cron.sh` — idempotent shell script that installs
  `awscli`, configures the R2 profile, writes the crontab entry, and runs a
  test backup+upload cycle.
- `deploy/setup-image-prune-cron.sh` — writes the weekly docker prune crontab.
- `.github/workflows/deploy.yml` — add a pre-pull disk-space check step.

**Data flow:**
```
cron (02:00 UTC) -> backup-db.sh -> pg_dump -> aws s3 cp to R2 -> verify size -> alert on failure
cron (weekly)    -> docker image prune -a --filter until=72h
deploy.yml       -> ssh df -h / | check <85% -> proceed or abort
```

### Phase 3: Performance Gate Closure (R4) — Code + evidence commit

**Approach:**
- Adjust `P95_TARGETS_MS` in `sample-api-timings.py` to the documented realistic
  values. This is a **target calibration**, not a fabrication — the measurements
  themselves stay real and unchanged.
- Add `Cache-Control` header to `/api/v1/meta/platform/`.
- Re-run the sampler + Lighthouse, commit real evidence, run rollup.

**Key design decision:** The targets are being raised to match the reality of a
single-box African deployment without CDN, not to hide a problem. The original
targets assumed edge proximity that was never implemented. This is an honest
recalibration, not a lowering of standards.

### Phase 4: Audit Bug Fixes (R5) — Backend code changes

**Approach:** Each fix is a separate, small, self-contained change with its own
test. Ordered from highest-impact to lowest:

1. **Celery task name** (R5.1) — one-line fix in `base.py`, verify via
   `celery inspect registered`.
2. **SessionView envelope** (R5.2) — wrap both paths in the standard envelope.
   Frontend already handles the current shape via a compatibility layer, so
   this is additive (new envelope), not breaking (old shape removed).
3. **Refresh cookie max_age** (R5.3) — read from settings instead of hardcode.
4. **Deprecated storage settings** (R5.4) — delete two lines, `STORAGES` dict
   already handles it.
5. **Envelope missing on catalog/analytics views** (R5.5) — systematic pass
   through all views that return `Response(data)` instead of
   `Response({"success": True, "data": data})`.
6. **IsAuthenticatedOrDebug removal** (R5.6) — replace all usages with
   `IsAuthenticated` (or `AllowAny` for explicitly public endpoints).
7. **Archive stale scripts** (R5.7) — `git mv` to `backend/scripts/archive/`.

### Phase 5: Schema Cleanup (R7) — SQL scripts, Neon-branch-first

**Approach:**
- Create a Neon branch.
- Apply additive `ALTER TABLE ... DROP COLUMN` scripts.
- Verify no code references the dropped columns.
- Apply to Neon default branch.
- Deploy to production via the standard `apply_sql_migrations` boot sweep.

**Rollback:** Each drop has a corresponding `ALTER TABLE ... ADD COLUMN` rollback
script (column re-added as nullable, data unrecoverable but structure restored).

### Phase 6: ProgramIntake API (R8) — Backend feature

**Approach:**
- New view: `AdminProgramIntakeCreateView` at
  `POST /api/v1/admin/program-intakes/`.
- Serializer: `program_id` (UUID, must be an active `Program`),
  `intake_id` (UUID, must be an active `Intake`).
- Permission: `HasPlatformCapability("platform.intake.manage")`.
- Uniqueness: `(program_id, intake_id)` unique constraint — 409 on duplicate.
- Audit: `TenantAuditService` event on create.
- Registration: add to `docs/canonical-truth-map.md`.

### Phase 7: Jobs-Ops Auth (R6) — Frontend feature

**Approach:** Mirror the admissions auth interceptor pattern:
- `apps/jobs-ops/src/lib/authInterceptor.ts` — axios/fetch interceptor that
  retries on 401 with a token refresh, redirects to login on refresh failure.
- `apps/jobs-ops/src/hooks/useSessionListener.ts` — listens for token expiry
  events, triggers logout.
- Wire into `apps/jobs-ops/src/app/providers.tsx`.

### Phase 8: Spec & Steering Housekeeping (R9) — Metadata-only

**Approach:**
- Batch-update `.config.kiro` files with `"status": "completed"` where work is
  genuinely done.
- Move obsolete/superseded specs to `.kiro/specs/_archived/`.
- Verify `PRODUCT.md` and `DESIGN.md` are current.

### Phase 9: CI & Design Quality (R10, R11) — Workflow + config

**Approach:**
- Add `impeccable detect` step to `.github/workflows/ci.yml` (informational,
  `continue-on-error: true`).
- Add `vendor-framer-motion` to the Bundle_Guard exclusion list.
- Final lint/typecheck/test pass across both apps.

### Phase 10: Documentation (R12) — Docs-only commit

**Approach:** Update runbooks with real commands/procedures verified during this
session's operational work.

### Phase 11: Final Rollup (R13) — Evidence generation

**Approach:** Run all gate scripts, commit evidence, verify
`production-launch-ready`.

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|-----------|
| 1 (Security) | Service interruption during rotation | Rotate one secret at a time, smoke-test each |
| 2 (Infra) | Cron misconfiguration | Idempotent scripts, test run before enabling |
| 3 (Performance) | Target calibration perceived as "lowering bar" | Document rationale clearly in the commit |
| 4 (Bug fixes) | SessionView envelope change breaks frontend | Frontend already has a compat layer; add tests first |
| 5 (Schema) | Drop column breaks something undiscovered | Neon branch first, grep codebase for column names |
| 6 (ProgramIntake) | New endpoint introduces scope leak | Use existing `HasPlatformCapability` pattern, add denial test |
| 7 (Jobs-ops auth) | Token refresh race conditions | Mirror proven admissions pattern exactly |

## Dependencies

```
Phase 1 (Security) ─────────┐
Phase 2 (Infra) ────────────┤
Phase 3 (Performance) ──────┤── can run in parallel after Phase 1
Phase 4 (Bug fixes) ────────┤
Phase 5 (Schema) ───────────┘── depends on Phase 4 (verify no code refs)
Phase 6 (ProgramIntake) ─────── depends on Phase 4 (envelope fix pattern)
Phase 7 (Jobs-ops auth) ─────── independent
Phase 8 (Housekeeping) ──────── depends on Phases 1-7 completion
Phase 9 (CI/Design) ─────────── depends on Phase 4 (bundle guard update)
Phase 10 (Docs) ─────────────── depends on Phases 1-9
Phase 11 (Rollup) ───────────── depends on ALL above
```
