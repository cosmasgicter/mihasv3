# Post-Deploy Smoke — Canonical Truth Program

Run this smoke checklist immediately after deploying the canonical-truth
program release. Reference: `docs/release-notes-canonical-truth-2026-05.md`.

## Pre-flight (before deploy)

- [ ] `cd backend && python manage.py check_production_state --strict` exits 0
- [ ] `cd backend && python manage.py check_schema_drift --strict` exits 0 (or noted exceptions documented in `legacy_columns.py`)
- [ ] All drift-guard tests pass: `cd apps/admissions && bun run test`
- [ ] Backend test suite passes: `cd backend && python -m pytest`
- [ ] Frontend type-check + lint + build pass: `cd apps/admissions && bun run type-check && bun run lint && bun run build`
- [ ] No uncommitted critical files (`git status --short backend/apps/applications/services.py`)

## During deploy

- [ ] Apply the system-actor seed: `psql $DATABASE_URL -f backend/scripts/system_actor_seed.sql`
- [ ] Verify seed: `psql $DATABASE_URL -c "SELECT id, email, is_active FROM profiles WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;"` should return one row with `is_active=false`.
- [ ] Apply any pending SQL migrations from `backend/scripts/` (excluding `applied/` and `legacy_columns_drop_2026_08_15.sql`).

## Immediate (first 5 minutes)

- [ ] `/health/live/` returns 200
- [ ] `/health/ready/` returns 200
- [ ] One sample student login works end-to-end (no CSRF errors).
- [ ] One sample admin login works.
- [ ] Sample API call to `/api/v1/applications/?status=submitted` returns 200 with the envelope shape.
- [ ] OpenAPI schema regenerated and current: `python manage.py spectacular --file /tmp/schema.yaml && diff /tmp/schema.yaml backend/schema/openapi.yaml`

## 30-minute window

- [ ] Sentry/GlitchTip error rate vs. baseline: should not spike. Open the error feed; confirm no new error classes.
- [ ] Payment webhook ingress: at least one webhook received and processed without dedup error (check `webhook_event_logs.processing_error`).
- [ ] No 500s on submission flow (`/api/v1/applications/{id}/submit/`).
- [ ] Monitor `application_status_history` for SYSTEM_ACTOR_ID transitions:
  ```sql
  SELECT new_status, count(*)
  FROM application_status_history
  WHERE changed_by = '00000000-0000-0000-0000-000000000001'::uuid
    AND created_at > now() - interval '30 minutes'
  GROUP BY new_status;
  ```
  May be 0 if no Celery beat tick fired in the window. Don't alarm — recheck at 24 hours.

## 24-hour window — primary verification of Stream 5

- [ ] Run draft expiry query:
  ```sql
  SELECT count(*) AS drafts_expired_last_24h
  FROM application_status_history
  WHERE changed_by = '00000000-0000-0000-0000-000000000001'::uuid
    AND new_status = 'expired'
    AND created_at > now() - interval '24 hours';
  ```
  **Expected: > 0** if any drafts crossed the 30-day threshold. Zero is a red flag — investigate whether the system-actor seed was applied and whether the Celery beat scheduler is running.

- [ ] Admin dashboard urgency counters show non-zero values (or genuinely zero queue, verifiable by querying directly).
- [ ] No spike in `PROGRAM_CAPACITY_REACHED` errors (would indicate stale `ProgramIntake.max_capacity` values not aligned with operational expectations).

## 7-day window

- [ ] Confirm `cleanup_idempotency_keys` task is actually running. Check:
  ```sql
  SELECT count(*) FROM idempotency_keys
  WHERE created_at < now() - interval '7 days';
  ```
  Should be a small bounded number (cleanup runs daily at 03:00 UTC).
- [ ] ~~Confirm AI hardening flags effective: query GlitchTip for `*.degraded` metrics from `apps.common.ai_circuit_breaker`.~~ **Removed.** Admissions-v2 task 7.4 deleted `apps/common/ai_circuit_breaker.py` together with the admissions AI it wrapped (R11.1), so this check can only ever come back empty and an operator reading an empty result as "flags not effective" would chase nothing. Admissions makes no generative call; the only generative path left is jobs-ops' `apps/jobs/ai_service.py`, whose failures already log through its own `logger.exception`.

## Rollback procedures

| Symptom | Rollback |
|---------|----------|
| Admissions applicant data seen leaving toward an AI gateway | **This is now an incident, not a flag flip.** `AI_HARDENING_REDACTION` no longer exists (task 7.4 deleted it with the prompts it redacted), so setting it does nothing — the old instruction here would have burned the first minutes of a real leak. Admissions must make no generative call at all (R11.1): treat any such traffic as unauthorised code, find the caller, revert it, and run `backend/tests/unit/test_no_admissions_generative_ai_guard.py`, which names the offending module. The only sanctioned outbound AI path is jobs-ops' (`apps/jobs/ai_service.py`, `JOBS_OPS_AI_*`); if the traffic is jobs-ops', rotate `AI_GATEWAY_API_KEY` per `docs/runbooks/secrets-rotation.md`. Data map: `docs/ai-data-flows.md`. |
| Submission flow broken on deferred payments | Revert the identity-document gate change in `services.py:_application_has_identity_document` to exclude only `deleted` (Phase 2.C of plan). |
| `check_production_state` blocking deploy due to false positive | Add a `--allow-warnings` flag and document which flag triggered it. |
| System-actor seed not applied → Celery tasks fail | Apply seed manually: `psql $DATABASE_URL -f backend/scripts/system_actor_seed.sql`. Restart Celery workers. Tasks resume with the next beat tick. |
| Drift-guard test failing in CI on a hotfix | Disable the specific guard with a `.skip` and ticket to re-enable. Do not silence the suite. |

## Production-state assertion

The single most important verification, run from the Koyeb shell:

```bash
python manage.py check_production_state --strict
```

If this exits 0, the production hardening posture is correct. If it exits
non-zero, the deploy is invalid — roll back the release and fix the missing
configuration before retrying.

## Sign-off

Mark the release as complete in `.kiro/specs/admissions-canonical-truth-2026-05/.config.kiro` by adding `"status": "completed"` once:

- All immediate (5-min) checks pass.
- 30-minute window shows no error spike.
- 24-hour query for SYSTEM_ACTOR_ID transitions shows expected activity.
