# Feature Flags Runbook (2026-05-17)

This is the canonical inventory of every runtime feature flag, build-time flag,
and required secret across the admissions platform. Every entry has a rollback
path.

The `manage.py check_production_state --strict` command asserts that the
"Production value" column matches reality at deploy time. The pre-deploy gate
fails if any flag is misconfigured.

## Backend payment-hardening flags

One flag remains. admissions-v2 task 8.2 deleted the other three
(`PAYMENT_HARDENING_FORWARD_ONLY`, `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT`,
`PAYMENT_HARDENING_FORCE_APPROVED`) together with the duplicate implementations
they selected, so setting them now does nothing. The payment state machine,
webhook dedup contract, and admin-override ledger shape are unconditional and
roll back only by code revert — see
`docs/runbooks/payment-hardening-rollout.md`.

| Flag | Type | Default in `base.py` | Production value | Rollback |
|------|------|---------------------|------------------|----------|
| `PAYMENT_HARDENING_RATE_LIMITS` | env-gated | `False` | `True` (via `prod.py`) | Set env to false, redeploy |

## Backend AI-hardening flags

**None remain.** Admissions-v2 task 7.4 deleted all four
(`AI_HARDENING_CIRCUIT_BREAKER`, `AI_HARDENING_RATE_LIMITS`, `AI_HARDENING_CACHE`,
`AI_HARDENING_REDACTION`) together with the admissions AI they hardened (R11.1:
the admissions runtime makes no generative call), and task 12.4 removed the last
of that surface's documentation. Setting any of them now does nothing.

This section previously called them "mandatory in production for PII protection",
which is the most dangerous kind of stale flag entry: an operator reading it
during an incident would go looking for a redaction switch that no longer exists
instead of treating unexpected AI traffic as unauthorised code. Admissions has no
prompt to redact.

The one surviving per-user cap that used to be counted in this family is
**`DOCUMENT_EXTRACT_RATE_LIMITS`** — the ceiling on local OCR re-extract calls,
which was never about AI and is a CPU/DoS lever:

| Flag | Type | Default in `base.py` | Production value | Rollback |
|------|------|---------------------|------------------|----------|
| `DOCUMENT_EXTRACT_RATE_LIMITS` | env-gated | `False` | `True` (via `prod.py`) | Set env to false, redeploy |

The only generative integration left on the platform is jobs-ops'
(`backend/apps/jobs/ai_service.py`, `JOBS_OPS_AI_*`). It is not flag-gated: an
absent `AI_GATEWAY_API_KEY` disables it and every call already returns `None` on
failure. Data map: `docs/ai-data-flows.md`. Boundary guard:
`backend/tests/unit/test_no_admissions_generative_ai_guard.py`.

## Frontend build-time flags

| Flag | Set in | Production value | Rollback |
|------|--------|-----------------|----------|
| `VITE_PAYMENT_DEV_BYPASS` | Vercel project env | `false` (must be) | n/a — must remain false in prod |
| `VITE_STUDENT_DASHBOARD_PRIORITY` | Vercel project env | (future) | Set to false |
| `VITE_LENCO_PUBLIC_KEY` | Vercel project env | live key | swap to sandbox key |
| `VITE_LENCO_WIDGET_URL` | Vercel project env | https URL | n/a |
| `VITE_GLITCHTIP_DSN` | Vercel project env | live DSN | empty disables frontend tracking |

## Backend operational flags

| Flag | Type | Default | Production | Rollback |
|------|------|---------|------------|----------|
| `PAYMENT_DEV_BYPASS` | env | `false` | **must be `false`** | n/a — blocked by `check_production_state` |
| `READ_ONLY_MODE` | env | `false` | `false` | Set `true`, redeploy to put backend in maintenance mode |
| `ENABLE_JOBS_OPS_ROUTES` | env | `false` | as needed | Toggle |
| `LOG_LEVEL` | env | `INFO` | `INFO` | Set `DEBUG` for triage |
| `REQUEST_METRIC_SAMPLE_RATE` | env (planned) | `1.0` | `0.1` (planned) | Set `1.0` |

## Required secrets (presence asserted by `check_production_state`)

| Secret | Where used | Rotation runbook |
|--------|-----------|------------------|
| `SECRET_KEY` | Django session/token signing fallback | `docs/runbooks/secrets-rotation.md` |
| `JWT_SIGNING_KEY` | JWT issuance/validation | `docs/runbooks/secrets-rotation.md` |
| `DATABASE_URL` | Neon Postgres connection | Neon dashboard |
| `REDIS_URL` | Celery broker + cache + JTI blacklist | Upstash dashboard |
| `LENCO_API_SECRET_KEY` | Outbound Lenco API | Lenco dashboard |
| `LENCO_PUBLIC_KEY` | Frontend widget + webhook signing | Lenco dashboard |
| `LENCO_WEBHOOK_ALLOWED_IPS` | Webhook ingress allow-list | Lenco support |
| `AUDIT_LOG_ENCRYPTION_KEY` | IP/UA encryption in audit_logs | `docs/runbooks/secrets-rotation.md` |
| `GLITCHTIP_DSN` | Backend error tracking | GlitchTip dashboard |
| `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Cloudflare R2 storage | Cloudflare dashboard |
| `RESEND_API_KEY` | Fallback transactional email | Resend dashboard |
| `ZOHO_SMTP_USERNAME`, `ZOHO_SMTP_PASSWORD` | Primary outbound email | Zoho mail console |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway | Vercel dashboard |
| `ALLOWED_HOSTS` | Django host validation | env |
| `CORS_ALLOWED_ORIGINS` | CORS allow-list | env |

## How To Verify Production State

```bash
# On the production Koyeb instance:
python manage.py check_production_state --strict
```

Expected output: zero warnings, exit code 0. Any non-zero exit blocks deploy.

## How To Add A New Flag

1. Add the flag to `base.py` with `env-gated False` default.
2. Add a hardcoded production override to `prod.py` and `staging.py`.
3. Add the flag to the appropriate table in this file.
4. Add a check to `manage.py check_production_state`.
5. Add the rollback procedure.

## How To Roll A Flag Back

For env-gated flags:
1. Set the env var to `false` in the Koyeb dashboard.
2. Redeploy (or hot-restart the service).
3. The flag's runtime check returns False; the legacy code path runs.

For build-time `VITE_*` flags:
1. Update the Vercel project env var.
2. Redeploy the frontend.

## Rollback Order If Multiple Flags Misbehave

1. Backend `PAYMENT_HARDENING_RATE_LIMITS` if causing legitimate-user lockouts.
2. Backend `DOCUMENT_EXTRACT_RATE_LIMITS` if legitimate re-extract attempts are
   being refused.

(The first entry here used to be `AI_HARDENING_REDACTION`. It is gone with the
admissions AI — see the AI-hardening section above.)

The payment state machine, webhook dedup, admin-override ledger shape, and the
payment UI have **no flag** — admissions-v2 task 8.2 deleted the duplicate
implementations those flags selected. Rolling any of them back is a code revert,
not a flip; see `docs/runbooks/payment-hardening-rollout.md` § "Rollback
reality".

Always document the rollback in `docs/runbooks/` and capture the incident.
