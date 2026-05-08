# Deployment Checklist — API Remediation Phases 3-5

This checklist covers deploying the changes from commits in the `api-remediation`
integration range to staging and then production.

Related docs:
- `backend/schema/AUDIT_CLOSE_OUT.md` — what shipped
- `docs/api/VERSIONING.md` — compatibility policy
- `docs/api/ROLLBACK.md` — how to back out if anything breaks
- `backend/schema/REMEDIATION_TARGETS.md` — metric targets and hold-the-line policy

---

## Pre-deployment (any environment)

- [ ] CI green on the PR: `backend` job passed including the new `api-quality` step
- [ ] `make api-quality` passes locally against the branch
- [ ] Schema baseline committed in the PR: `git diff main backend/schema/openapi.v1.baseline.yaml` is non-empty
- [ ] Close-out document reviewed: `backend/schema/AUDIT_CLOSE_OUT.md`
- [ ] No unmerged Phase 3 serializer work outside this PR

---

## Staging deployment

1. **Trigger deploy** via Koyeb CLI or UI:
   ```bash
   koyeb service redeploy --service mihas-api-staging --branch main
   ```
2. **Watch the deploy logs** for:
   - `python manage.py check --deploy` — should pass
   - `python manage.py migrate --check` — no unapplied migrations (this sprint added no migrations)
   - ASGI server startup (`Uvicorn running on ...`)
3. **Health check** once the deploy reports ready:
   ```bash
   curl -sf https://staging.mihas.edu.zm/health/ready/
   curl -sf https://staging.mihas.edu.zm/health/live/
   ```
   Both should return 200 with `{"success": true, ...}`.

4. **Run the staging smoke harness** (GitHub Actions):
   - Navigate to Actions → "Staging Smoke Tests" → Run workflow
   - Base URL: `https://staging.mihas.edu.zm`
   - skip_auth: `false` (requires `STAGING_SMOKE_JWT` secret configured)
   - Expected: 9/9 checks pass, runtime ~30 seconds

   Or run locally:
   ```bash
   STAGING_TOKEN=$(cat ~/.secrets/staging-jwt)
   python backend/scripts/staging_smoke.py \
       --base-url https://staging.mihas.edu.zm \
       --token "$STAGING_TOKEN"
   # Expect: "9/9 passed"
   ```

5. **Verify specific Phase 2-4 changes** via targeted curls:

   **SessionView security metadata** (Phase 2 T11):
   ```bash
   curl -s https://staging.mihas.edu.zm/api/v1/auth/session/ | jq '.data // .success'
   # Verify schema shows the scheme at /api/v1/schema/
   ```

   **Deprecation headers on notification aliases** (Phase 2 T12):
   ```bash
   curl -sI -X PUT -H "Cookie: access_token=$TOKEN" \
       https://staging.mihas.edu.zm/api/v1/notifications/mark-all-read/
   # Must include: Deprecation: true
   # Must include: Sunset: Thu, 08 Nov 2026 00:00:00 GMT
   # Must include: Link: </api/v1/notifications/read-all/>; rel="successor-version"
   ```

   **Payment serializer validation** (Phase 3 T14):
   ```bash
   curl -s -X POST -H "Content-Type: application/json" \
       -H "Cookie: access_token=$TOKEN" \
       -d '{}' \
       https://staging.mihas.edu.zm/api/v1/payments/mobile-money/
   # Expect: {"success": false, "error": "...", "code": "VALIDATION_ERROR"}
   # 400 status
   ```

6. **Monitor for 15 minutes**:
   - GlitchTip project 22431 → check for new error classes
   - Koyeb logs → no 5xx spikes on the changed endpoints
   - UptimeRobot external checks → all green

---

## Production deployment

**Pre-flight:**
- [ ] Staging deploy has been live for at least 30 minutes
- [ ] Staging smoke harness passed
- [ ] No new error classes on staging in GlitchTip
- [ ] Frontend integration team has been notified (the deprecation headers are new — they should not break consumers, but coordination is good hygiene)

**Deploy:**
```bash
koyeb service redeploy --service mihas-api --branch main
```

**Post-deploy verification (repeat staging checks, production URLs):**

- [ ] `curl -sf https://api.mihas.edu.zm/health/ready/` → 200
- [ ] `curl -sI -X PUT https://api.mihas.edu.zm/api/v1/notifications/mark-all-read/` → `Deprecation: true` in headers
- [ ] `/api/v1/schema/` returns the new schema with `info.contact` populated
- [ ] `/api/v1/docs/` shows the updated tag grouping (admin, payments, applications each contain the previously-untagged ops)
- [ ] 15-minute GlitchTip observation window passes without new error classes
- [ ] Koyeb logs: no 500s on the changed endpoints

**If any check fails:** Follow `docs/api/ROLLBACK.md` § 1-5 or the Emergency section at the bottom. Your first option is a Koyeb-level redeploy to the previous known-good SHA.

---

## Post-deployment

Once production has been stable for 24 hours:

- [ ] Archive the `hub/*` integration branches (tag for audit trail, then delete local refs)
- [ ] Update the operations runbook index to reference this checklist
- [ ] Open a follow-up ticket for the deferred polish items listed in `AUDIT_CLOSE_OUT.md`:
  - Add explicit type hints to the 4 remaining drf-spectacular warnings
  - Add error-response documentation (target: linter issues 755 → < 230)
  - Add examples to complex request/response schemas (target: scorecard 70+ / C)

---

## Communication template (for integrators)

> **Subject:** MIHAS API v1 — schema improvements deployed 2026-05-08
>
> The following changes deployed to production today. None are breaking for compliant clients:
>
> 1. **Deprecation notice** — `PUT /api/v1/notifications/mark-all-read/` and `PUT /api/v1/notifications/mark-read/` now return `Deprecation: true` + `Sunset: 2026-11-08` headers. Please migrate to the canonical `PUT /api/v1/notifications/read-all/` before the sunset date.
>
> 2. **Typed schemas** — 14 endpoints now have OpenAPI request/response schemas documenting their payloads. Regenerate your typed clients from `/api/v1/schema/` to benefit.
>
> 3. **Tag reorganization** — Swagger UI at `/api/v1/docs/` now groups endpoints by domain (admin, applications, payments, etc.) instead of the default `api` bucket.
>
> 4. **`info.contact` / `info.license`** populated on the schema.
>
> See the full close-out at `backend/schema/AUDIT_CLOSE_OUT.md` in the repo.
